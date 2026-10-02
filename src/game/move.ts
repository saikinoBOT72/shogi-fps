// 移動と当たり判定：床・壁・天井・坂・ピラミッドの斜面、見通し、ジャンプと着地（game.ts から分けたもの。ほかのファイルは今までどおり ./game から import すればよい）
import { Gadgets } from '../gadgets';
import { P } from '../palette';
import * as THREE from 'three';
import { gs } from '../state';
import { G, GROUND, H, PIECES, RULES, SKILLS, V3, WEAPONS, clamp, damp, lerp, rand, settings } from '../core';
import { SFX } from '../audio';
import { cam, scene } from '../render';
import { FLOW, LV, SPAWN, SPAWN2, WATER_Y, colTop, colliders, floorBelow, groundAt, pickMap, useMap } from '../world';
import { PHYS, blockers, physOf } from '../physics';
import { Decals, DmgNums, Particles, Tracers, VM, buildActor } from '../effects';
import { Arrows } from '../arrows';
import { Grenades, Smoke } from '../grenades';
import { down, keys } from '../input';
import { PERSONAS, aiHear, damagePlayer } from '../ai';
import { initPips, killBot, showHitmarker } from '../hud';
import { Replay } from '../replay';
import { Net, r2, vec } from '../net';
import { equippedRef, paintGun, skinKey, validRef } from '../loadout';
import { skinMaterials } from '../guns/skins';
import { player, bot, view, damageBot } from '../game';
import { facingOf, skillDamageMul } from './weapons';

// ================= 物理・当たり判定 =================
export const ray = new THREE.Raycaster();
(ray as any).firstHitOnly = true;   // 各メッシュで一番手前の当たりだけ調べる（高速化）
export const eyeOf = e => new V3(e.pos.x, e.pos.y + e.eyeH, e.pos.z);

// 立っている床の種類（足音用）：水の中なら 'water'
export const surfOf = e => (e.pos.y < WATER_Y ? 'water' : e.surf || 'grass');
export function collide(e) {
  const R = e.radius, wasGround = e.onGround;
  e.onGround = false; e.wallN = null;
  if (e.pos.y <= GROUND) { e.pos.y = GROUND; if (e.vy < 0) e.vy = 0; e.onGround = true; e.surf = 'grass'; }
  // 動かない障害物に加えて、体を止める重い小物（スキルの木箱も）とも当たる
  let hf = null;
  for (const c of PHYS.solid.length ? colliders.concat(PHYS.solid) : colliders) {
    if (c.kind === 'pyr') { pyrCollide(e, c); continue; }
    if (c.kind === 'hf') { hf = c; continue; }   // なめらかな地形は、ほかの床を調べたあとで
    let cx, cz, top, bottom;
    // 厚みのある板の坂（thick）は、板の厚みの所だけが当たる（下はくぐれる）
    if (c.kind !== 'cyl') { cx = clamp(e.pos.x, c.min.x, c.max.x); cz = clamp(e.pos.z, c.min.z, c.max.z); top = colTop(c, cx, cz); bottom = c.thick ? top - c.thick : c.min.y; }
    else {
      const dx = e.pos.x - c.x, dz = e.pos.z - c.z, d = Math.hypot(dx, dz);
      if (d <= c.r) { cx = e.pos.x; cz = e.pos.z; } else { cx = c.x + dx / d * c.r; cz = c.z + dz / d * c.r; }
      top = c.y1; bottom = c.y0;
    }
    const dx = e.pos.x - cx, dz = e.pos.z - cz, d2 = dx * dx + dz * dz;
    if (d2 >= R * R) continue;
    // 上面より上にいる間は何もしない（ジャンプ中に上面へ吸い寄せられないように）
    // 坂を下っているときは、浮かずに坂に沿って下りる
    if (e.pos.y > top) { if (c.kind === 'ramp' && wasGround && e.vy <= 0 && e.pos.y - top < 0.5) { e.pos.y = top; e.vy = 0; e.onGround = true; e.surf = c.surf; } continue; }
    // 着地：上面を上から通り過ぎたか、上面のすぐ下（低い段差は自動で上がる）
    //   slip（ピラミッドの斜面）は着地できない。横へ押し出されて、段を1つずつ滑り落ちる
    if (!c.slip && e.vy <= 0 && (e.pos.y >= top - 0.4 || (e.prevY ?? e.pos.y) >= top)) { e.pos.y = top; e.vy = 0; e.onGround = true; e.surf = c.surf; continue; }
    if (e.pos.y + e.height <= bottom || e.pos.y >= top) continue;
    // 天井：下から頭をぶつけた（前のフレームでは頭が下面より下にいた）ときは、頭を下面で止めるだけ
    //   （横へ押し出すと、屋根や2階の床の端まで一気に飛ばされる＝ワープしてしまうため）
    //   ただし床に立ったまま頭が天井の「端」に触れた（体の中心は下に入っていない。階段を上っている途中など）ときは、
    //   下へ押すと床（階段の坂）にめり込んで抜け落ちるので、横へ少しだけ押し出す
    if (bottom > e.pos.y + 0.4 && (e.prevY ?? e.pos.y) + e.height <= bottom + 0.05 && !(wasGround && d2 > 1e-8)) {
      e.pos.y = bottom - e.height; if (e.vy > 0) e.vy = 0;
      continue;
    }
    let nx, nz, push;
    if (d2 > 1e-8) { const d = Math.sqrt(d2); nx = dx / d; nz = dz / d; push = R - d; }
    else if (c.kind === 'cyl') {
      const vx = e.pos.x - c.x, vz = e.pos.z - c.z, d = Math.hypot(vx, vz) || 1;
      nx = vx / d; nz = vz / d; push = c.r + R - d;
    } else {
      const o = [[-1, 0, e.pos.x - c.min.x], [1, 0, c.max.x - e.pos.x], [0, -1, e.pos.z - c.min.z], [0, 1, c.max.z - e.pos.z]].sort((a, b) => a[2] - b[2])[0];
      nx = o[0]; nz = o[1]; push = o[2] + R;
    }
    e.pos.x += nx * push; e.pos.z += nz * push;
    e.wallN = new V3(nx, 0, nz); e.wallTop = top;   // 壁登り用：触れている壁の向きと高さ
    const vn = e.vel.x * nx + e.vel.z * nz;
    if (vn < 0) { e.vel.x -= vn * nx; e.vel.z -= vn * nz; }
  }
  // なめらかな地形：下にめり込んでいたら上へ。坂を下るときは地面に沿って下りる（ほかの床に立っていなければ）
  if (hf) {
    let top = hf.at(e.pos.x, e.pos.z);
    // 急な地面（maxSlope より急）は上れない：前の場所へ戻し、壁と同じ扱いにする（壁登りはできる）
    //   比べるのは、このフレームで動く前の足の高さ（空中でも同じ。上から落ちてきて乗るときは足が上にあるので止めない）
    const feet = e.prevY ?? e.pos.y;
    if (hf.maxSlope && e.prevX !== undefined && top > e.pos.y + 0.02) {
      const bx = e.prevX - e.pos.x, bz = e.prevZ - e.pos.z, run = Math.hypot(bx, bz);
      if (top - feet > hf.maxSlope * run + 0.03) {
        e.pos.x = e.prevX; e.pos.z = e.prevZ;
        if (run > 1e-6) {
          const nx = bx / run, nz = bz / run, vn = e.vel.x * nx + e.vel.z * nz;
          if (vn < 0) { e.vel.x -= vn * nx; e.vel.z -= vn * nz; }
          e.wallN = new V3(nx, 0, nz); e.wallTop = top + 1;
        }
        top = hf.at(e.pos.x, e.pos.z);
      }
    }
    if (e.pos.y < top) {
      if (!(top - e.pos.y > 1.5 && (e.prevY ?? e.pos.y) < top - 1.5)) { e.pos.y = top; if (e.vy < 0) e.vy = 0; e.onGround = true; e.surf = hf.surf; }
    } else if (!e.onGround && wasGround && e.vy <= 0 && e.pos.y - top < 0.5) { e.pos.y = top; e.vy = 0; e.onGround = true; e.surf = hf.surf; }
    if (hf.maxSlope && e.onGround && Math.abs(e.pos.y - top) < 0.05) {
      const gx = hf.at(e.pos.x + 0.4, e.pos.z) - hf.at(e.pos.x - 0.4, e.pos.z), gz = hf.at(e.pos.x, e.pos.z + 0.4) - hf.at(e.pos.x, e.pos.z - 0.4), g = Math.hypot(gx, gz) / 0.8;
      // 立っていられない：地面に付いたまま下へずらし、ジャンプもできない（跳んでよじ登れないように）
      if (g > hf.maxSlope * 1.2) { const k = 0.1 / (g * 0.8); e.pos.x -= gx * k; e.pos.z -= gz * k; e.pos.y = Math.min(e.pos.y, hf.at(e.pos.x, e.pos.z)); e.onGround = false; e.airT = 1; }
    }
  }
  const lim = H - R;
  if (Math.abs(e.pos.x) > lim) { e.pos.x = clamp(e.pos.x, -lim, lim); e.vel.x = 0; }
  if (Math.abs(e.pos.z) > lim) { e.pos.z = clamp(e.pos.z, -lim, lim); e.vel.z = 0; }
}
// ピラミッドの斜面（51°）：立てずに、いちばん近い面から外へ押し出される（落ちると段なしで滑り落ちる）
//   通路・部屋（holes）の中は判定しない（中の壁は別の当たり判定）。壁登りもできない（wallN を付けない）
function pyrCollide(e, c) {
  if (e.pos.y >= c.y0 + c.h || e.pos.y + e.height <= c.y0) return;
  if (c.holes.some(h => e.pos.x > h.x0 && e.pos.x < h.x1 && e.pos.z > h.z0 && e.pos.z < h.z1 && e.pos.y < h.y1)) return;
  const dx = e.pos.x - c.cx, dz = e.pos.z - c.cz, R = e.radius;
  const s = c.half * (1 - Math.max(0, e.pos.y - c.y0) / c.h);   // 足もとの高さでの、ピラミッドの半分の幅
  if (Math.max(Math.abs(dx), Math.abs(dz)) >= s + R) return;
  if (Math.abs(dx) >= Math.abs(dz)) { const sg = Math.sign(dx) || 1; e.pos.x = c.cx + sg * (s + R); if (e.vel.x * sg < 0) e.vel.x = 0; }
  else { const sg = Math.sign(dz) || 1; e.pos.z = c.cz + sg * (s + R); if (e.vel.z * sg < 0) e.vel.z = 0; }
}
export function hasLOS(a, b, ignoreSmoke?) {
  if (!ignoreSmoke && Smoke.blocks(a, b)) return false;   // 煙の向こうは見えない
  const d = b.clone().sub(a), dist = d.length();
  ray.set(a, d.normalize()); ray.far = dist;
  const hit = ray.intersectObjects(blockers, true).length > 0;
  ray.far = Infinity;
  return !hit;
}

// 移動（加速・摩擦・コヨーテタイム）
// 効いているスキル（type で探す）
export const act = (e, type) => e && e.slots && e.slots.find(s => s.t > 0 && s.sk.type === type);
export function moveEntity(e, wish, dt) {
  wish = wish.clone();
  const mv = e.slots.find(s => s.t > 0 && (s.sk.type === 'dash' || s.sk.type === 'step')), lp = act(e, 'leap'), gp = act(e, 'grapple');
  // 横移動が遅い駒（香）：向いている方向に対して横の成分を縮める
  if (e.def.strafe && wish.lengthSq() > 0) {
    const f = facingOf(e), along = wish.dot(f);
    wish = f.clone().multiplyScalar(along).add(wish.clone().addScaledVector(f, -along).multiplyScalar(e.def.strafe));
  }
  if (gp) {
    // 鉤縄：狙った所へ一直線に引き寄せられる（重力に負けないよう上向きの速さも毎フレーム決める）
    gp.t -= dt;
    const to = gp.target.clone().sub(e.pos.clone().add(new V3(0, e.height * 0.4, 0))), d = to.length();
    if (d < 1.3 || gp.t <= 0) {
      gp.t = 0; e.vy = Math.max(e.vy, 5); e.vel.multiplyScalar(0.4);
      // 段や崖の縁に掛けたときは、縁の上まで跳び上がって乗る
      const fwd = gp.target.clone().sub(e.pos).setY(0).normalize(), ahead = gp.target.clone().addScaledVector(fwd, 1.2);
      const top = groundAt(ahead.x, ahead.z);
      if (top > e.pos.y + 0.3 && top - e.pos.y < 4.5) { e.vy = Math.sqrt(2 * G * (top - e.pos.y + 0.8)); e.vel.copy(fwd.multiplyScalar(5)); e.knockT = 0.7; }   // 前への勢いを空中で保つ
    }
    else { to.multiplyScalar(gp.sk.speed / d); e.vel.set(to.x, 0, to.z); e.vy = to.y + G * dt; e.onGround = false; e.airT = 1; }
  } else if (act(e, 'blink')) {
    // 瞬：決めた向きへまっすぐ飛ぶ（重力を打ち消す）。終わったら勢いを少しだけ残す
    const bl = act(e, 'blink'), v = bl.dir3.clone().multiplyScalar(bl.sp);
    bl.t -= dt;
    e.vel.set(v.x, 0, v.z); e.vy = v.y + G * dt; e.onGround = false; e.airT = 1;
    if (bl.t <= 0) { const k = bl.capped ? 0.03 : 0.25; e.vel.multiplyScalar(k); e.vy *= k; }
  } else if (mv) {
    mv.t -= dt;
    e.vel.copy(mv.dir).multiplyScalar(mv.sk.speed);
    if (mv.t <= 0) e.vel.multiplyScalar(0.35);
  } else if (e.lungeT > 0) {
    // 刀の踏み込み（横薙ぎ）：決まった向きへ短く進む
    e.lungeT -= dt;
    e.vel.copy(e.lungeDir).multiplyScalar(e.lungeV);
    if (e.lungeT <= 0) e.vel.multiplyScalar(0.4);
  } else if (lp) {
    lp.t -= dt;   // 跳んでいる間は勢いのまま（空中で向きを変えられない）
  } else {
    const gd = act(e, 'guard'), bf = act(e, 'buff'), slow = (gd ? gd.sk.slow : 1) * (bf ? bf.sk.speedMul : 1) * (e.empT > 0 ? e.empSlow : 1) * (e.pos.y < WATER_Y ? 0.6 : 1);   // 川の中は遅い・身体強化中は速い・EMP を受けると遅い
    e.knockT = Math.max(0, (e.knockT || 0) - dt);
    const flung = e.knockT > 0 && !e.onGround;   // 爆風で飛ばされている間
    const target = wish.clone().multiplyScalar(e.def.speed * RULES.speed * (e.isBot || e.running ? 1 : RULES.walk) * (e.speedMul || 1) * slow);
    const dv = target.sub(e.vel); dv.y = 0;
    const acc = (e.onGround ? 75 : flung ? 1.5 : 22) * dt;
    if (dv.length() > acc) dv.setLength(acc);
    e.vel.add(dv);
  }
  e.prevX = e.pos.x; e.prevZ = e.pos.z;   // 急な地面で押し戻すときの戻り先
  e.pos.x += e.vel.x * dt; e.pos.z += e.vel.z * dt;
  // 川の流れ：水の中（足が水面より下）にいると押し流される（霧の渓谷）
  if (FLOW && e.pos.y < WATER_Y) { const fl = FLOW(e.pos.x, e.pos.z); e.pos.x += fl[0] * dt; e.pos.z += fl[1] * dt; }
  // 壁登り：壁に向かってジャンプを押し続けると登る。登れるのは自分の身長ぶんまで。
  // 途中で離れたら、着地するまでつかみ直せない
  if (e.onGround) e.climbH = e.height;
  const wasClimbing = e.climbing;
  e.climbing = !!(e.wantClimb && e.wallN && e.climbH > 0 && e.pos.y < e.wallTop);
  if (e.climbing) { e.vy = Math.max(e.vy, 5.5); e.climbH -= 5.5 * dt; e.airT = 1; e.jumped = true; }
  else if (wasClimbing) e.climbH = 0;
  const prevVy = e.vy;
  e.prevY = e.pos.y;
  e.vy -= G * dt; e.pos.y += e.vy * dt;
  const was = e.onGround;
  collide(e);
  if (e.onGround) { e.airT = 0; e.jumped = false; } else e.airT += dt;
  if (!was && e.onGround && prevVy < -4) onLand(e, -prevVy);
  if (lp && lp.t > 0 && e.onGround && lp.sk.duration - lp.t > 0.15) { lp.t = 0; leapLand(e, lp.sk); }
  e.moving = Math.hypot(e.vel.x, e.vel.z) > 1;
}
export function tryJump(e) {
  if (e.airT < 0.1 && !e.jumped) { const bf = act(e, 'buff'); e.vy = e.def.jump * (bf ? bf.sk.jumpMul : 1); e.jumped = true; e.onGround = false; e.airT = 1; if (!e.isBot) SFX.play('jump'); return true; }
  return false;
}
// 桂跳びの着地：周りの相手と小物を吹き飛ばす
export function leapLand(e, sk) {
  const foe = e === player ? bot : player;
  Particles.dust(e.pos, 22, 2.2);
  PHYS.blast(e.pos.clone().setY(0.3), sk.radius * 1.3, 7);
  SFX.play('boom', e.pos);
  view.shake = Math.max(view.shake, clamp(1 - e.pos.distanceTo(player.pos) / 15, 0, 1) * 0.7);
  if (foe.dead) return;
  const d = Math.hypot(foe.pos.x - e.pos.x, foe.pos.z - e.pos.z);
  if (d > sk.radius || Math.abs(foe.pos.y - e.pos.y) > 2.5) return;
  const dmg = sk.dmg * (1 - d / sk.radius * 0.5) * skillDamageMul(foe, e.pos);
  foe.vel.add(foe.pos.clone().sub(e.pos).setY(0).normalize().multiplyScalar(10)); foe.vy = 6; foe.onGround = false; foe.pushedT = 0.8;
  if (foe.isBot) damageBot({ dmg, head: false, point: eyeOf(foe) }); else damagePlayer(dmg, e.pos);
}
export function onLand(e, v) {
  SFX.play('land', e.pos);
  Particles.dust(e.pos, 5, 0.8);
  if (!e.isBot) { view.dipV -= v * 0.012; VM.dip = Math.min(1, v * 0.05); }
}
export function separate(a, b) {
  const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d = Math.hypot(dx, dz), min = a.radius + b.radius;
  if (d >= min || d < 1e-6) return;
  if (a.pos.y + a.height < b.pos.y || b.pos.y + b.height < a.pos.y) return;
  const p = (min - d) / 2, nx = dx / d, nz = dz / d;
  a.pos.x -= nx * p; a.pos.z -= nz * p; b.pos.x += nx * p; b.pos.z += nz * p;
}
