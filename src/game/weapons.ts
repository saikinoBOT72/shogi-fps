// 武器：ばらつき・リロード・撃つ（当たり判定とダメージ）（game.ts から分けたもの。ほかのファイルは今までどおり ./game から import すればよい）
import { Gadgets } from '../gadgets';
import { P } from '../palette';
import * as THREE from 'three';
import { gs } from '../state';
import { G, GROUND, H, PIECES, RULES, SKILLS, V3, WEAPONS, clamp, damp, lerp, rand, settings } from '../core';
import { SFX } from '../audio';
import { cam, scene } from '../render';
import { LV, SPAWN, SPAWN2, WATER_Y, colTop, colliders, floorBelow, groundAt, pickMap, useMap } from '../world';
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
import { player, botActor, stats, view, onAttack, shootArrow } from '../game';
import { ray, eyeOf, act } from './move';
import { Clones } from '../clones';

// ================= 武器 =================
export function currentSpread(e) {
  const w = e.w;
  let s = w.spread + e.bloom + (w.kind === 'bow' ? (1 - (e.draw || 0)) * w.drawSpread : 0);
  if (e.moving) s += w.move * clamp(Math.hypot(e.vel.x, e.vel.z) / e.def.speed, 0, 1);
  const du = act(e, 'dual'); if (du) s += du.sk.spreadAdd;   // 2丁持ちは少しばらける
  if (!e.onGround) s += w.air;
  if (!e.isBot) s = (s + (w.hip || 0) * (1 - (e.adsT || 0))) * lerp(1, w.ads, e.adsT || 0);   // hip：覗いていない時だけ足すブレ（覗き切ると 0）
  else s *= w.ads;   // CPU はいつも覗き込んでいる扱い
  return s;
}
// 試合が始まってから FIRE_LOCK 秒は撃てない（FIGHT! と同時の撃ち合いを防ぐ。stateT は fight に入っても 3 から数え続ける）
export const FIRE_LOCK = 0.5;
export const holdFire = () => gs.state === 'fight' && gs.stateT < 3 + FIRE_LOCK;
export const canFire = e => e.cd <= 0 && e.reloading <= 0 && e.ammo > 0 && !e.dead && !holdFire();
export function startReload(e) {
  if (e.reloading > 0 || e.ammo >= e.w.mag) return;
  e.reloading = e.w.reload; e.burstLeft = 0;
  if (!e.isBot) { SFX.play('reload', e.w.model, e.w.reload); VM.reload(e.w.reload); }
}
export function weaponTick(e, dt) {
  e.cd -= dt;
  // 連射の続き：狙っている向きへ、同じ引きの強さで次の矢を放つ
  if (e.volleyLeft > 0 && !e.dead) {
    e.volleyT -= dt;
    if (e.volleyT <= 0) {
      e.volleyLeft--; e.volleyT = e.volleyGap;
      const eye = eyeOf(e);
      const dir = e.isBot ? e.aimPt.clone().sub(eye).normalize() : new V3(0, 0, -1).applyQuaternion(cam.quaternion);
      const keepCd = e.cd; e.draw = e.volleyDraw;
      shootArrow(e, dir, eye.addScaledVector(dir, 0.6));
      e.cd = Math.max(keepCd, e.w.rate);
      if (!e.isBot) { VM.kick = 0.6; stats.shots++; }
    }
  }
  e.bloom = Math.max(0, e.bloom - e.w.bloomRecover * dt);
  if (e.reloading > 0) {
    e.reloading -= dt;
    if (e.reloading <= 0) e.ammo = e.w.mag * (act(e, 'dual') ? 2 : 1);
  }
}

// 向いている方向（盾の判定用）
export function facingOf(e) {
  if (e.isBot) { const y = botActor.root.rotation.y; return new V3(Math.sin(y), 0, Math.cos(y)); }
  return new V3(-Math.sin(view.yaw), 0, -Math.cos(view.yaw));
}
// 忍の残像疾風・変わり身の直後：何も当たらない（弾・矢はすり抜けて後ろへ抜ける）
export const phased = t => !!t && (!!act(t, 'shippu') || (t.nInv || 0) > 0);
// スキルによる被ダメージ倍率（守りの構えは前からの弾だけ減らす）
// 変わり身（忍）：当たったときに呼ぶ（ninja.ts が入れる。import がぐるぐる回らないように、ここでは入れ物だけ）
export const hooks: any = { kawarimi: null };
export function skillDamageMul(target, from) {
  if ((target.nInv || 0) > 0) return 0;   // 変わり身でよけた直後は何も当たらない
  // 変わり身を構えている：この攻撃は丸太が受ける（ダメージなし）
  const kw = target.slots && target.slots.find(s => s.t > 0 && s.sk.type === 'kawarimi');
  if (kw) { if (hooks.kawarimi) hooks.kawarimi(target, from, kw); return 0; }
  let m = 1;
  if (target.swGuard) m *= 0.5;   // 刀で守りの構え（右クリック）：どこからでも半分
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
  // 貫通：この1発だけ壁を抜ける
  const pc = act(shooter, 'pierce');
  shooter.pierce = pc ? pc.sk : null;
  if (pc) pc.t = 0;
  let dmg = 0, head = false, point = null, miss = null, wallDist = 300, blocked = false, first = true;
  const ends = [];
  for (let i = 0; i < (w.pellets || 1); i++) {
    const r = castShot(shooter, target, origin, muzzle, dir, sp, first);
    first = false; ends.push([...vec(r.end), r.wall ? 1 : 0]);
    if (r.dmg > 0) { dmg += r.dmg; head = head || r.head; point = point || r.point; blocked = blocked || r.blocked; }
    else if (!miss) { miss = r.miss; wallDist = r.wallDist; }
  }
  shooter.pierce = null;
  const du = act(shooter, 'dual');
  shooter.ammo--; shooter.cd = w.rate * (du ? du.sk.rateMul : 1);
  onAttack(shooter);
  if (Net.on && shooter === player) Net.send({ t: 'fire', e: ends });
  // バースト：決まった数だけ短い間隔で続けて撃つ
  if (w.burst) {
    if (!(shooter.burstLeft > 0)) shooter.burstLeft = w.burst;
    shooter.burstLeft--;
    if (shooter.ammo <= 0) shooter.burstLeft = 0;
    shooter.cd = shooter.burstLeft > 0 ? w.burstGap : w.rate;
  }
  shooter.bloom = Math.min(w.bloomMax, shooter.bloom + w.bloomShot);
  if (shooter.ammo <= 0) startReload(shooter);
  if (blocked) { SFX.play('guard', point); if (target.swGuard) Particles.impact(point, dir.clone().negate()); else Particles.wood(point, new V3(0, 1, 0), 5, 0.6); }   // 刀で受けたら火花
  return { dmg, head, point, blocked, miss: dmg > 0 ? null : miss, wallDist };
}
export function castShot(shooter, target, origin, muzzle, dir, sp, sound) {
  const w = shooter.w;
  const d = dir.clone().add(new V3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(rand(0, sp))).normalize();
  ray.set(origin, d); ray.far = 300;
  const walls = ray.intersectObjects(blockers, true);
  const pierce = shooter.pierce, skip = pierce ? Math.min(pierce.walls, walls.length) : 0;   // 貫通：手前の壁を何枚まで抜けるか
  const wall = walls[skip];
  const wallDist = wall ? wall.distance : 300;
  for (let k = 0; k < skip; k++) { const pw = walls[k]; Particles.impact(pw.point, pw.face ? pw.face.normal.clone().transformDirection(pw.object.matrixWorld) : d.clone().negate()); }
  const tracerColor = shooter.isBot ? P.shu[2] : VM.fx.tracer ?? P.kin[2];   // 自分の弾の線は、LR スキンならその色
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
  if (hit && phased(target)) hit = null;   // すり抜ける（火花も出さず、弾は後ろの壁まで飛ぶ）
  // 撃たれる側の影分身が手前にいたら、分身に当たって消える（ダメージなし）
  const ch = Clones.rayHit(ray.ray, hit ? hit.dist : wallDist, target);
  if (ch) {
    Clones.pop(target, ch.i, shooter === player);
    Tracers.add(muzzle, ch.point, tracerColor);
    return { dmg: 0, head: false, point: null, miss: d, wallDist: ch.dist, end: ch.point, wall: false };
  }
  let res: any = { dmg: 0, head: false, point: null };
  if (hit) {
    const [f0, f1, fm] = w.falloff;
    let dmg = w.dmg * lerp(1, fm, clamp((hit.dist - f0) / (f1 - f0), 0, 1));
    const head = hit.point.y > target.pos.y + target.height * 0.76;
    if (head) dmg *= w.head;
    if (pierce) dmg *= Math.pow(pierce.wallMul, walls.filter((h, k) => k < skip && h.distance < hit.dist).length);   // 抜けた壁1枚ごとに減る（頭も同じ）
    const mul = skillDamageMul(target, shooter.pos);
    dmg *= mul;
    res = { dmg, head, point: hit.point, blocked: mul < 1 && (!!act(target, 'guard') || !!target.swGuard), end: hit.point };
    Tracers.add(muzzle, hit.point, tracerColor);
  } else {
    const end = wall ? wall.point : origin.clone().addScaledVector(d, 150);
    Tracers.add(muzzle, end, tracerColor);
    if (wall) {
      const n = wall.face ? wall.face.normal.clone().transformDirection(wall.object.matrixWorld) : d.clone().negate();
      Particles.impact(wall.point, n);
      const ph = physOf(wall), tur = Gadgets.turretOfHit(wall.object);
      if (tur) Gadgets.damageTurret(tur, w.dmg * lerp(1, w.falloff[2], clamp((wallDist - w.falloff[0]) / (w.falloff[1] - w.falloff[0]), 0, 1)), shooter);
      // 鐘楼の鐘：鳴らすと遠くまで響く（居場所がばれる）
      // 忍びの屋敷の大太鼓も同じ（userData.ring に鳴らす音の名前）
      const ring = wall.object.userData.bell ? 'bell' : wall.object.userData.ring;
      if (ring && performance.now() - (gs.bellT || 0) > 400) { gs.bellT = performance.now(); SFX.play(ring, wall.point); aiHear(wall.point, 60); }
      if (ph) { PHYS.hit(ph, wall.point, d, w.dmg * 0.15); Particles.wood(wall.point, n, 4, 0.5); }
      else Decals.add(wall.point, n);
      if (sound) SFX.play(Math.random() < 0.3 ? 'ricochet' : 'thud', wall.point);
    }
    res.miss = d; res.wallDist = wallDist; res.end = end; res.wall = !!wall;
  }
  return res;
}
