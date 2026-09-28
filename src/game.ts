// ゲーム状態・移動と当たり判定・武器・プレイヤー
import { Gadgets } from './gadgets';
import { P } from './palette';
import * as THREE from 'three';
import { gs } from './state';
import { G, GROUND, H, PIECES, RULES, SKILLS, V3, WEAPONS, clamp, damp, lerp, rand, settings } from './core';
import { SFX } from './audio';
import { cam, scene } from './render';
import { LV, SPAWN, WATER_Y, colliders, groundAt } from './world';
import { PHYS, blockers, physOf } from './physics';
import { Decals, DmgNums, Particles, Tracers, VM, buildActor } from './effects';
import { Arrows } from './arrows';
import { Grenades, Smoke } from './grenades';
import { down, keys } from './input';
import { PERSONAS, aiHear, damagePlayer } from './ai';
import { initPips, killBot, showHitmarker } from './hud';
import { Replay } from './replay';

// ================= ゲーム状態 =================
gs.state = 'title';   // title / countdown / fight / end
gs.paused = false;
gs.stateT = 0;
gs.timeScale = 1;
gs.slowmoT = 0;
export let player, bot, playerActor, botActor, stats;
gs.matchCtx = null;   // 将棋モードの撃ち合い中：{ myType, foeType, playerIsAttacker }
export const view: any = { yaw: 0, pitch: 0, shake: 0, fov: 80, bobPhase: 0, dip: 0, dipV: 0, roll: 0 };
export const isPlaying = () => (gs.state === 'countdown' || gs.state === 'fight') && !gs.paused;

export function makeEntity(type, isBot) {
  const def = PIECES[type], w = WEAPONS[def.weapon];
  return {
    type, def, w, isBot,
    pos: new V3(), vel: new V3(), vy: 0, onGround: true, airT: 0, jumped: false,
    height: 1.85 * def.size, radius: 0.5 * def.size, eyeH: 1.85 * def.size * 0.83,
    hp: def.hp, dead: false, ammo: w.mag, cd: 0, reloading: 0, bloom: 0, moving: false,
    // スキルの枠：id / sk: 中身 / cd: 待ち時間 / charges: 使える回数 / t: 効いている残り時間 / dir: 使った向き
    slots: (def.skills || []).map(id => ({ id, sk: SKILLS[id], cd: 0, charges: SKILLS[id].charges || 1, t: 0, dir: new V3(), rammed: false })),
    stepPhase: 0, flashT: 0, draw: 0, sinceHit: 99, burstLeft: 0,
    mainW: w, mainAmmo: w.mag,   // メイン武器（ナイフに持ち替えている間の弾数も覚えておく）
  };
}
// 駒の見た目を用意（種類が変わったときだけ作り直す）
export function ensureActors(pType, bType) {
  const make = (old, type, isBot) => {
    if (old && old.type === type) return old;
    if (old) scene.remove(old.root);
    const d = PIECES[type], a = buildActor(type === 'K' && isBot ? '玉' : d.name, d.size, WEAPONS[d.weapon].model);
    a.type = type;
    return a;
  };
  playerActor = make(playerActor, pType, false);
  botActor = make(botActor, bType, true);
}
export const pieceKeys = () => Object.keys(PIECES);
export function resolveFoe() {
  const k = settings.foePiece;
  return k === 'random' ? pieceKeys()[Math.floor(Math.random() * pieceKeys().length)] : (PIECES[k] ? k : 'P');
}

export function resetMatch(foeType?) {
  const myType = gs.matchCtx ? gs.matchCtx.myType : PIECES[settings.myPiece] ? settings.myPiece : 'P';
  foeType = foeType || (gs.matchCtx && gs.matchCtx.foeType) || (settings.foePiece === 'random' ? (bot && bot.type) || 'P' : resolveFoe());
  ensureActors(myType, foeType);
  player = makeEntity(myType, false);
  bot = makeEntity(foeType, true);
  VM.setWeapon(player.w.model);
  // 出撃地点：外周の塀の裏（開始時にお互いが見えない）
  // 出撃：左右の橋のたもと（屋根つきの関所の中）
  player.pos.set(SPAWN.x + rand(-1, 1), LV.V, SPAWN.z + rand(-1, 1));
  bot.pos.set(-SPAWN.x + rand(-1, 1), LV.V, -SPAWN.z + rand(-1, 1));
  Object.assign(bot, { seen: 0, lostT: 0, strafe: 1, strafeT: 0, stuck: 0, lastPos: bot.pos.clone(), aimPt: player.pos.clone(), lastKnown: player.pos.clone(), coverPt: null, coverT: 0, fireDelay: 0, jumpT: 2, wp: null, wpT: 0, hurtT: 0,
    persona: Object.values(PERSONAS)[Math.floor(Math.random() * 3)] });
  stats = { shots: 0, hits: 0, heads: 0, dealt: 0, taken: 0, time: 0 };
  view.yaw = Math.atan2(-(bot.pos.x - player.pos.x), -(bot.pos.z - player.pos.z));
  view.pitch = 0; view.shake = 0; view.roll = 0; view.dip = 0; view.dipV = 0;
  botActor.body.rotation.set(0, 0, 0); botActor.body.position.y = 0; botActor.dead = null; botActor.root.visible = true;
  playerActor.body.rotation.set(0, 0, 0); playerActor.dead = null;
  Replay.clear();
  Arrows.clear(); Grenades.clear(); Smoke.clear(); Gadgets.clear();
  botActor.wood.emissive.setHex(0);
  Decals.clear();
  PHYS.reset();
  gs.timeScale = 1; gs.slowmoT = 0;
  VM.ready();
  document.querySelectorAll('.dd').forEach(e => e.remove());
}

// ================= 物理・当たり判定 =================
export const ray = new THREE.Raycaster();
(ray as any).firstHitOnly = true;   // 各メッシュで一番手前の当たりだけ調べる（高速化）
export const eyeOf = e => new V3(e.pos.x, e.pos.y + e.eyeH, e.pos.z);

export function collide(e) {
  const R = e.radius;
  e.onGround = false; e.wallN = null;
  if (e.pos.y <= GROUND) { e.pos.y = GROUND; if (e.vy < 0) e.vy = 0; e.onGround = true; }
  for (const c of colliders) {
    let cx, cz, top, bottom;
    if (c.kind === 'box') { cx = clamp(e.pos.x, c.min.x, c.max.x); cz = clamp(e.pos.z, c.min.z, c.max.z); top = c.max.y; bottom = c.min.y; }
    else {
      const dx = e.pos.x - c.x, dz = e.pos.z - c.z, d = Math.hypot(dx, dz);
      if (d <= c.r) { cx = e.pos.x; cz = e.pos.z; } else { cx = c.x + dx / d * c.r; cz = c.z + dz / d * c.r; }
      top = c.y1; bottom = c.y0;
    }
    const dx = e.pos.x - cx, dz = e.pos.z - cz, d2 = dx * dx + dz * dz;
    if (d2 >= R * R) continue;
    // 上面より上にいる間は何もしない（ジャンプ中に上面へ吸い寄せられないように）
    if (e.pos.y > top) continue;
    // 着地：上面を上から通り過ぎたか、上面のすぐ下（低い段差は自動で上がる）
    if (e.vy <= 0 && (e.pos.y >= top - 0.4 || (e.prevY ?? e.pos.y) >= top)) { e.pos.y = top; e.vy = 0; e.onGround = true; continue; }
    if (e.pos.y + e.height <= bottom || e.pos.y >= top) continue;
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
  const lim = H - R;
  if (Math.abs(e.pos.x) > lim) { e.pos.x = clamp(e.pos.x, -lim, lim); e.vel.x = 0; }
  if (Math.abs(e.pos.z) > lim) { e.pos.z = clamp(e.pos.z, -lim, lim); e.vel.z = 0; }
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
  } else if (mv) {
    mv.t -= dt;
    e.vel.copy(mv.dir).multiplyScalar(mv.sk.speed);
    if (mv.t <= 0) e.vel.multiplyScalar(0.35);
  } else if (lp) {
    lp.t -= dt;   // 跳んでいる間は勢いのまま（空中で向きを変えられない）
  } else {
    const gd = act(e, 'guard'), slow = (gd ? gd.sk.slow : 1) * (e.pos.y < WATER_Y ? 0.6 : 1);   // 川の中は遅い
    e.knockT = Math.max(0, (e.knockT || 0) - dt);
    const flung = e.knockT > 0 && !e.onGround;   // 爆風で飛ばされている間
    const target = wish.clone().multiplyScalar(e.def.speed * RULES.speed * (e.isBot || e.running ? 1 : RULES.walk) * (e.speedMul || 1) * slow);
    const dv = target.sub(e.vel); dv.y = 0;
    const acc = (e.onGround ? 75 : flung ? 1.5 : 22) * dt;
    if (dv.length() > acc) dv.setLength(acc);
    e.vel.add(dv);
  }
  e.pos.x += e.vel.x * dt; e.pos.z += e.vel.z * dt;
  // 壁登り：壁に向かってジャンプを押し続けると登る（1回に登れる時間は climbT まで）
  if (e.onGround) e.climbT = 1.6;
  e.climbing = !!(e.wantClimb && e.wallN && e.climbT > 0 && e.pos.y < e.wallTop);
  if (e.climbing) { e.vy = Math.max(e.vy, 5.5); e.climbT -= dt; e.airT = 1; e.jumped = true; }
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
  if (e.airT < 0.1 && !e.jumped) { e.vy = e.def.jump; e.jumped = true; e.onGround = false; e.airT = 1; return true; }
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
  foe.vel.add(foe.pos.clone().sub(e.pos).setY(0).normalize().multiplyScalar(10)); foe.vy = 6; foe.onGround = false;
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

// ================= 武器 =================
export function currentSpread(e) {
  const w = e.w;
  let s = w.spread + e.bloom + (w.kind === 'bow' ? (1 - (e.draw || 0)) * w.drawSpread : 0);
  if (e.moving) s += w.move * clamp(Math.hypot(e.vel.x, e.vel.z) / e.def.speed, 0, 1);
  if (!e.onGround) s += w.air;
  if (!e.isBot) s *= lerp(1, w.ads, e.adsT || 0);
  else if (w.zoom) s *= w.ads;
  return s;
}
export const canFire = e => e.cd <= 0 && e.reloading <= 0 && e.ammo > 0 && !e.dead;
export function startReload(e) {
  if (e.reloading > 0 || e.ammo >= e.w.mag) return;
  e.reloading = e.w.reload; e.burstLeft = 0;
  if (!e.isBot) { SFX.play('reloadStart'); VM.reload(e.w.reload); }
}
export function weaponTick(e, dt) {
  e.cd -= dt;
  e.bloom = Math.max(0, e.bloom - e.w.bloomRecover * dt);
  if (e.reloading > 0) {
    e.reloading -= dt;
    if (e.reloading <= 0) { e.ammo = e.w.mag; if (!e.isBot) SFX.play('reloadEnd'); }
  }
}

// 向いている方向（盾の判定用）
export function facingOf(e) {
  if (e.isBot) { const y = botActor.root.rotation.y; return new V3(Math.sin(y), 0, Math.cos(y)); }
  return new V3(-Math.sin(view.yaw), 0, -Math.cos(view.yaw));
}
// スキルによる被ダメージ倍率（守りの構えは前からの弾だけ減らす）
export function skillDamageMul(target, from) {
  let m = 1;
  for (const s of target.slots || []) {
    if (!(s.t > 0)) continue;
    if (s.sk.type !== 'guard') { m *= s.sk.damageTaken ?? 1; continue; }
    const to = from.clone().sub(target.pos).setY(0).normalize();
    if (facingOf(target).dot(to) > 0.2) m *= s.sk.damageTaken;
  }
  return m;
}

// 撃つ：origin から dir に撃つ。ショットガンは粒ごとに判定して合計する
export function fire(shooter, target, origin, muzzle, dir) {
  const w = shooter.w, sp = currentSpread(shooter);
  let dmg = 0, head = false, point = null, miss = null, wallDist = 300, blocked = false, first = true;
  for (let i = 0; i < (w.pellets || 1); i++) {
    const r = castShot(shooter, target, origin, muzzle, dir, sp, first);
    first = false;
    if (r.dmg > 0) { dmg += r.dmg; head = head || r.head; point = point || r.point; blocked = blocked || r.blocked; }
    else if (!miss) { miss = r.miss; wallDist = r.wallDist; }
  }
  shooter.ammo--; shooter.cd = w.rate;
  onAttack(shooter);
  // バースト：決まった数だけ短い間隔で続けて撃つ
  if (w.burst) {
    if (!(shooter.burstLeft > 0)) shooter.burstLeft = w.burst;
    shooter.burstLeft--;
    if (shooter.ammo <= 0) shooter.burstLeft = 0;
    shooter.cd = shooter.burstLeft > 0 ? w.burstGap : w.rate;
  }
  shooter.bloom = Math.min(w.bloomMax, shooter.bloom + w.bloomShot);
  if (shooter.ammo <= 0) startReload(shooter);
  if (blocked) { SFX.play('guard', point); Particles.wood(point, new V3(0, 1, 0), 5, 0.6); }
  return { dmg, head, point, blocked, miss: dmg > 0 ? null : miss, wallDist };
}
export function castShot(shooter, target, origin, muzzle, dir, sp, sound) {
  const w = shooter.w;
  const d = dir.clone().add(new V3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(rand(0, sp))).normalize();
  ray.set(origin, d); ray.far = 300;
  const walls = ray.intersectObjects(blockers, true);
  const wall = walls[0];
  const wallDist = wall ? wall.distance : 300;
  const tracerColor = shooter.isBot ? P.shu[2] : P.kin[2];
  let hit = null;
  if (target.isBot) {
    const h = !botActor.dead && ray.intersectObject(botActor.hitMesh, false)[0];
    if (h && h.distance < wallDist) hit = { point: h.point, dist: h.distance };
  } else {
    const r = target.radius, p = target.pos;
    const box = new THREE.Box3(new V3(p.x - r, p.y, p.z - r), new V3(p.x + r, p.y + target.height, p.z + r));
    const hp = ray.ray.intersectBox(box, new V3());
    if (hp && hp.distanceTo(origin) < wallDist) hit = { point: hp, dist: hp.distanceTo(origin) };
  }
  let res: any = { dmg: 0, head: false, point: null };
  if (hit) {
    const [f0, f1, fm] = w.falloff;
    let dmg = w.dmg * lerp(1, fm, clamp((hit.dist - f0) / (f1 - f0), 0, 1));
    const head = hit.point.y > target.pos.y + target.height * 0.76;
    if (head) dmg *= w.head;
    const mul = skillDamageMul(target, shooter.pos);
    dmg *= mul;
    res = { dmg, head, point: hit.point, blocked: mul < 1 && !!act(target, 'guard') };
    Tracers.add(muzzle, hit.point, tracerColor);
  } else {
    const end = wall ? wall.point : origin.clone().addScaledVector(d, 150);
    Tracers.add(muzzle, end, tracerColor);
    if (wall) {
      const n = wall.face ? wall.face.normal.clone().transformDirection(wall.object.matrixWorld) : d.clone().negate();
      Particles.impact(wall.point, n);
      const ph = physOf(wall);
      if (ph) { PHYS.hit(ph, wall.point, d, w.dmg * 0.15); Particles.wood(wall.point, n, 4, 0.5); }
      else Decals.add(wall.point, n);
      if (sound) SFX.play(Math.random() < 0.3 ? 'ricochet' : 'thud', wall.point);
    }
    res.miss = d; res.wallDist = wallDist;
  }
  return res;
}

// ================= プレイヤー =================
// 使える回数（charges）を1つ使い、待ち時間で1つずつ戻る
export function skillTick(e, dt) {
  for (const s of e.slots) {
    const sk = s.sk;
    // 動くスキル（突撃・すり足・桂跳び）の時間は moveEntity で進める
    if (s.t > 0 && !['dash', 'step', 'leap', 'grapple'].includes(sk.type)) {
      s.t -= dt;
      if (sk.type === 'heal' && !e.dead) {
        e.hp = Math.min(e.def.hp, e.hp + sk.amount / sk.duration * dt);
        if (Math.random() < 0.5) Particles.glow(e.pos.clone().add(new V3(rand(-0.6, 0.6), rand(0.2, e.height), rand(-0.6, 0.6))), P.midori[2]);
      }
    }
    const max = sk.charges || 1;
    if (s.charges >= max) { s.cd = 0; continue; }
    s.cd -= dt;
    if (s.cd <= 0) { s.charges++; s.cd = s.charges < max ? sk.cooldown : 0; }
  }
}
// i 番目のスキルを使う。dir は水平の向き
export function useSkill(e, i, dir) {
  const s = e.slots[i];
  if (!s || e.dead) return false;
  const sk = s.sk;
  // もう一度押す系：C4 の起爆・ミサイルの操作をやめる
  if (sk.type === 'c4' && Gadgets.c4Of(e)) { Gadgets.detonate(e); return true; }
  if (sk.type === 'missile' && Gadgets.ctrlOf(e)) { Gadgets.release(e); return true; }
  if (s.charges <= 0 || s.t > 0) return false;
  if (e.slots.some(x => x !== s && x.t > 0 && ['dash', 'step', 'leap', 'grapple'].includes(x.sk.type))) return false;   // 動くスキルの最中は重ねない
  // 狙っている向き（上下も含む）
  const aim = e.isBot ? new V3(player.pos.x, player.pos.y + player.height * 0.6, player.pos.z).sub(eyeOf(e)).normalize() : new V3(0, 0, -1).applyQuaternion(cam.quaternion);
  // 鉤縄は掛ける所が無ければ使わない（回数も減らさない）
  let hook = null;
  if (sk.type === 'grapple') { hook = Gadgets.grappleTarget(e, aim, sk.range); if (!hook) { if (!e.isBot) SFX.play('empty'); return false; } }
  s.dir.copy(dir).setY(0).normalize();
  s.charges--; if (s.cd <= 0) s.cd = sk.cooldown;
  s.t = sk.duration; s.rammed = false;
  const t = sk.type;
  if (t === 'step') {
    SFX.play('dash', e.pos);
    Particles.dust(e.pos, 5, 0.9);
    if (!e.isBot) { view.shake = Math.max(view.shake, 0.15); view.stepRoll = s.dir.dot(new V3(Math.cos(view.yaw), 0, -Math.sin(view.yaw))) > 0 ? -1 : 1; }
  } else if (t === 'homing' || t === 'bigshot') {
    SFX.play('homing', e.isBot ? e.pos : null);
  } else if (t === 'leap') {
    e.vy = sk.up; e.vel.copy(s.dir).multiplyScalar(sk.fwd);
    e.onGround = false; e.jumped = true; e.airT = 1;
    SFX.play('leap', e.pos); Particles.dust(e.pos, 10, 1.4);
    if (!e.isBot) view.shake = Math.max(view.shake, 0.2);
  } else if (t === 'smoke') {
    Smoke.spawn(e.pos.clone().add(new V3(0, 1.2, 0)), sk.radius, sk.life);
  } else if (t === 'xray' || t === 'cloak') {
    if (!e.isBot) SFX.play('pierce');
    if (t === 'cloak') for (let k = 0; k < 12; k++) Particles.glow(e.pos.clone().add(new V3(rand(-0.5, 0.5), rand(0.2, e.height), rand(-0.5, 0.5))), P.shiro[2]);
  } else if (t === 'grapple') {
    s.target = hook; SFX.play('dash', e.isBot ? e.pos : null);
  } else if (t === 'flash' || t === 'pearl') {
    if (t === 'flash') onAttack(e);
    Gadgets.toss(t, e, aim, sk);
  } else if (t === 'shock') {
    onAttack(e); Gadgets.shockwave(e, sk);
  } else if (t === 'c4') {
    onAttack(e); Gadgets.throwC4(e, aim, sk);
  } else if (t === 'missile') {
    onAttack(e); Gadgets.launch(e, aim, sk);
  } else if (t === 'heal') {
    SFX.play('heal');
  } else if (t === 'dash') {
    e.vy = Math.max(e.vy, 2);
    SFX.play('dash', e.pos);
    Particles.dust(e.pos, 8, 1.3);
    if (!e.isBot) view.shake = Math.max(view.shake, 0.25);
  } else {
    SFX.play('guardUp', e.pos);
    if (!e.isBot) view.shake = Math.max(view.shake, 0.12);
  }
  return true;
}
// 構えを解く（撃ったとき）
export function endGuard(e) { const g = act(e, 'guard'); if (g) g.t = 0; }
// 攻撃したら透明化が解ける
export function onAttack(e) { const c = act(e, 'cloak'); if (c) c.t = 0; }

export function updatePlayer(dt) {
  const p = player;
  const fwd = new V3(-Math.sin(view.yaw), 0, -Math.cos(view.yaw)), right = new V3(Math.cos(view.yaw), 0, -Math.sin(view.yaw));
  const wish = new V3();
  if (gs.state === 'fight' && !p.dead) {
    // ミサイルを操作している間は、自分の駒は動かない
    if (!Gadgets.ctrlOf(p)) {
      if (down('forward')) wish.add(fwd); if (down('back')) wish.sub(fwd);
      if (down('right')) wish.add(right); if (down('left')) wish.sub(right);
      if (wish.lengthSq() > 0) wish.normalize();
      if (gs.jumpPressed > 0 && tryJump(p)) gs.jumpPressed = 0;
    }
    p.skillHeld = p.skillHeld || [];
    p.slots.forEach((s, i) => {
      const k = down(i === 0 ? 'skill' : 'skill2');
      if (k && !p.skillHeld[i]) {
        // すり足は A/D の方向（押していなければ右）、他は前
        let sdir = fwd;
        if (s.sk.type === 'step') sdir = down('left') ? right.clone().negate() : down('right') ? right : down('back') ? fwd.clone().negate() : right;
        useSkill(p, i, sdir);
      }
      p.skillHeld[i] = k;
    });
    // V：銃を眺める
    if (down('inspect') && !p.inspectHeld) VM.inspect();
    p.inspectHeld = down('inspect');
  }
  gs.jumpPressed -= dt;
  const guardOrDash = p.slots.some(s => s.t > 0 && ['guard', 'dash', 'step', 'leap', 'grapple'].includes(s.sk.type)) || !!Gadgets.ctrlOf(p);   // 覗き込めないスキル中
  p.adsT = damp(p.adsT || 0, gs.rightDown && !p.dead && p.reloading <= 0 && !guardOrDash && p.w.kind !== 'melee' ? 1 : 0, p.w.adsSpeed || 14, dt);
  // 壁に向かってジャンプ長押しで登る
  p.wantClimb = !!(down('jump') && p.wallN && wish.dot(p.wallN) < -0.2 && gs.state === 'fight');
  if (p.climbing && (p.climbSnd = (p.climbSnd || 0) - dt) <= 0) { SFX.play('step', null, 0.6); p.climbSnd = 0.22; }
  p.running = down('run');
  p.speedMul = lerp(1, 0.6, p.adsT) * (p.draw > 0 ? 0.75 : 1) * (p.w.moveMul || 1);
  moveEntity(p, wish, dt);
  skillTick(p, dt);
  regenTick(p, dt);

  // 足音
  if (p.onGround && p.moving) {
    const prev = Math.sin(view.bobPhase * 2);
    view.bobPhase += dt * Math.hypot(p.vel.x, p.vel.z) * 1.35;
    if (prev > 0 && Math.sin(view.bobPhase * 2) <= 0) { SFX.play('step', null, 0.7); if ((p.adsT || 0) < 0.5) aiHear(p.pos, 10); }
  }

  weaponTick(p, dt);
  if (gs.state !== 'fight' || p.dead || Gadgets.ctrlOf(p)) return;
  // 弓：押している間は引き絞り、離したら放つ
  if (p.w.kind === 'bow') {
    if (gs.mouseDown && p.cd <= 0) {
      if (!p.drawing) SFX.play('bowDraw');
      p.drawing = true;
      const was = p.draw;
      p.draw = Math.min(1, p.draw + dt / p.w.drawTime);
      if (was < 1 && p.draw >= 1) SFX.play('bowReady');   // 引き切った合図
    } else if (p.drawing && !gs.mouseDown) {
      p.drawing = false;
      if (p.draw > 0.12) shootPlayerArrow(); else p.draw = 0;
    }
    return;
  }
  if (down('reload')) startReload(p);
  if (p.burstLeft > 0) { if (canFire(p)) shootPlayer(); }   // バーストの続き
  else if (gs.mouseDown && !gs.triggerUsed) {
    gs.triggerUsed = !p.w.auto;
    if (p.ammo <= 0 && p.reloading <= 0) { SFX.play('empty'); startReload(p); }
    else if (canFire(p)) shootPlayer();
  }
}

// 武器の持ち替え：'knife'（ナイフ）/ 'main'（メイン武器）/ 'toggle'
export function switchWeapon(e, which) {
  const isKnife = e.w.kind === 'melee';
  const toKnife = which === 'toggle' ? !isKnife : which === 'knife';
  if (toKnife === isKnife || e.dead) return;
  if (toKnife) { e.mainAmmo = e.ammo; e.w = WEAPONS.knife; e.ammo = 1; }
  else { e.w = e.mainW; e.ammo = e.mainAmmo; }
  e.reloading = 0; e.draw = 0; e.drawing = false; e.burstLeft = 0; e.bloom = 0;
  e.cd = Math.max(e.cd, 0.3);   // 持ち替えの間は撃てない
  if (!e.isBot) { VM.setWeapon(e.w.model); VM.ready(); initPips(); SFX.play('reloadEnd'); }
}
// ナイフで切る：目の前の届く範囲の相手に当たる。背中からは強い
export function meleePlayer() {
  const p = player, w = p.w;
  p.cd = w.rate;
  onAttack(p); endGuard(p);
  VM.fire(w);
  SFX.play('dash', null);
  const dir = new V3(0, 0, -1).applyQuaternion(cam.quaternion);
  const eye = eyeOf(p), chest = new V3(bot.pos.x, bot.pos.y + bot.height * 0.6, bot.pos.z);
  const to = chest.clone().sub(eye), d = to.length();
  if (bot.dead || d > w.range + bot.radius || to.normalize().dot(dir) < w.cone || !hasLOS(eye, chest, true)) return;
  const behind = facingOf(bot).dot(p.pos.clone().sub(bot.pos).setY(0).normalize()) < -0.3;
  const dmg = w.dmg * (behind ? w.back : 1) * skillDamageMul(bot, p.pos);
  damageBot({ dmg, head: false, point: chest.clone().addScaledVector(to, -0.3) });
  view.shake = Math.max(view.shake, 0.15);
}
export function shootPlayer() {
  const p = player;
  if (p.w.kind === 'melee') { meleePlayer(); return; }
  cam.updateMatrixWorld();
  const dir = new V3(0, 0, -1).applyQuaternion(cam.quaternion);
  const muzzle = cam.localToWorld(new V3(lerp(0.19, 0, p.adsT) * 0.9, -0.14, -0.9));
  endGuard(p);
  if (p.w.kind === 'grenade') {
    fireGrenade(p, dir, eyeOf(p).addScaledVector(dir, 0.6));
    aiHear(p.pos, 45); stats.shots++;
    VM.fire(p.w, p.ammo <= 0);
    view.pitch += p.w.recoil; view.shake = Math.max(view.shake, 0.15);
    return;
  }
  const res = fire(p, bot, eyeOf(p), muzzle, dir);
  aiHear(p.pos, 45);
  stats.shots++;
  SFX.play('shot', null, p.w.model);
  VM.fire(p.w, p.ammo <= 0);
  view.pitch += p.w.recoil * lerp(1, 0.6, p.adsT); view.yaw += rand(-0.006, 0.006);
  view.shake = Math.max(view.shake, 0.12);
  if (res.dmg > 0) damageBot(res);
}

// グレネードを撃つ（プレイヤー・CPU共通）
export function fireGrenade(e, dir, origin) {
  const w = e.w, sp = currentSpread(e);
  const d = dir.clone().add(new V3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(rand(0, sp))).normalize();
  e.ammo--; e.cd = w.rate;
  if (e.ammo <= 0) startReload(e);
  onAttack(e);
  // 大玉：次の1発だけ大きく、敵も自分も大きく吹き飛ばす
  const big = act(e, 'bigshot');
  if (big) big.t = 0;
  Grenades.fire({ owner: e, target: e === player ? bot : player, pos: origin, vel: d.multiplyScalar(w.speed), dmg: w.dmg, radius: big ? big.sk.radius : w.radius, gravity: w.gravity, fuse: w.fuse,
    big: !!big, knock: big ? big.sk.knock : w.knock, lift: big ? big.sk.lift : w.lift, self: w.self });
  SFX.play('launcher', e.isBot ? origin : null);
}
// 矢を放つ（プレイヤー・CPU共通）
export function shootArrow(e, dir, origin) {
  const w = e.w, k = (e.draw * e.draw + 2 * e.draw) / 3;   // マイクラと同じ引きの効き方
  const sp = currentSpread(e);
  const d = dir.clone().add(new V3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(rand(0, sp))).normalize();
  const hs = act(e, 'homing'), homing = !!hs;
  if (hs) hs.t = 0;
  onAttack(e);
  Arrows.fire({
    owner: e, target: e === player ? bot : player, pos: origin,
    vel: d.multiplyScalar(homing ? Math.min(hs.sk.speed, lerp(w.speedMin, w.speedMax, k)) : lerp(w.speedMin, w.speedMax, k)),
    dmg: lerp(w.dmgMin, w.dmg, k), head: w.head, gravity: w.gravity, drag: w.drag || 0, homing, turn: hs ? hs.sk.turn : 0, full: e.draw >= 1,
  });
  e.cd = w.rate; e.draw = 0;
  SFX.play('bow', e.isBot ? origin : null);
  if (!e.isBot) aiHear(e.pos, 20);
}
export function shootPlayerArrow() {
  const p = player;
  cam.updateMatrixWorld();
  const dir = new V3(0, 0, -1).applyQuaternion(cam.quaternion);
  shootArrow(p, dir, eyeOf(p).addScaledVector(dir, 0.6));
  stats.shots++;
  VM.kick = 0.6; view.shake = Math.max(view.shake, 0.08);
}
// しばらく被弾しないと回復
export function regenTick(e, dt) {
  e.sinceHit += dt;
  if (!e.dead && e.sinceHit > RULES.regenDelay && e.hp < e.def.hp) { e.hp = Math.min(e.def.hp, e.hp + RULES.regenRate * dt); e.regen = true; }
  else e.regen = false;
}

export function damageBot(res) {
  bot.hp -= res.dmg; bot.sinceHit = 0;
  // 撃たれたら横移動の向きを変え、撃ってきた場所を覚える
  bot.strafe *= -1; bot.strafeT = rand(0.4, 1); bot.hurtT = 1.2;
  bot.lastKnown.copy(player.pos); if (bot.lostT > 0) bot.lostT = 0.01;
  stats.hits++; stats.dealt += res.dmg; if (res.head) stats.heads++;
  DmgNums.add(res.point, res.dmg, res.head);
  Particles.wood(res.point, cam.getWorldDirection(new V3()), res.head ? 14 : 8);
  botActor.wood.emissive.setRGB(0.6, 0.05, 0.02);
  botActor.flinch = (botActor.flinch || 0) + (res.head ? 0.5 : 0.3);
  const killed = bot.hp <= 0;
  showHitmarker(killed ? 'kill' : res.head ? 'head' : '');
  SFX.play(res.head ? 'head' : 'hit');
  if (killed) killBot();
}
