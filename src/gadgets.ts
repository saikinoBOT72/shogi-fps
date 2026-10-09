// スキルで出す道具：ミサイル・EMP（銀）、閃光弾・鉤縄（飛）、エンダーパール・衝撃波・タレット歩（王）など
// リプレイ用に、出した物の形はここに登録して（track）、対局中は消さずに隠すだけにする
import * as THREE from 'three';
import { P } from './palette';
import { C, V3, clamp, rand } from './core';
import { SFX } from './audio';
import { flatGeo, pieceGeo, scene, toon } from './render';
import { PHYS, blockers, pieceSolidMats } from './physics';
import { Particles } from './effects';
import { act, bot, castShot, damageBot, eyeOf, facingOf, hasLOS, player, ray, skillDamageMul, view } from './game';
import { floorBelow } from './world';
import { cam } from './render';
import { gs } from './state';
import { killBot } from './hud';
import { damagePlayer } from './ai';
import { explodeAt } from './grenades';
import { Net } from './net';

const reg: THREE.Object3D[] = [];
export const track = <T extends THREE.Object3D>(o: T): T => { reg.push(o); scene.add(o); return o; };
const opOf = (o: any) => (o.material && o.material.uniforms && o.material.uniforms.uOp ? o.material.uniforms.uOp.value : o.material && o.material.opacity !== undefined ? o.material.opacity : 1);   // ドーム（シェーダー）は uOp が濃さ
const chest = e => new V3(e.pos.x, e.pos.y + e.height * 0.6, e.pos.z);
const foeOf = e => (e === player ? bot : player);
// 相手の体（箱）に線分 a→b が当たるか。当たった点を返す
function hitBody(t, a: any, b: any, pad = 0.1) {
  if (!t || t.dead) return null;
  const r = t.radius + pad, p = t.pos, d = b.clone().sub(a), len = d.length();
  if (len < 1e-6) return null;
  const r3 = new THREE.Ray(a, d.normalize());
  const hp = r3.intersectBox(new THREE.Box3(new V3(p.x - r, p.y, p.z - r), new V3(p.x + r, p.y + t.height, p.z + r)), new V3());
  return hp && hp.distanceTo(a) <= len ? hp : null;
}
function hitWorld(a: any, b: any) {
  const d = b.clone().sub(a), len = d.length();
  if (len < 1e-6) return null;
  ray.set(a, d.normalize()); ray.far = len;
  const h = ray.intersectObjects(blockers, true)[0];
  ray.far = Infinity;
  return h || null;
}

// ---------- C4 ----------
const c4Geo = new THREE.BoxGeometry(0.22, 0.1, 0.14);
const c4M = toon({ color: C(P.moegi[0]) }), c4Light = new THREE.MeshBasicMaterial({ color: P.shu[1] });
const lightGeo = new THREE.BoxGeometry(0.05, 0.03, 0.05);
const c4s = [];
function makeC4() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(c4Geo, c4M); body.castShadow = true;
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.105, 0.03), toon({ color: C(P.sumi[1]) }));
  const light = new THREE.Mesh(lightGeo, c4Light); light.position.y = 0.065; light.name = 'light';
  g.add(body, band, light);
  return g;
}
function throwC4(e, aim: any, sk) {
  const m = track(makeC4());
  const pos = eyeOf(e).addScaledVector(aim, 0.5);
  m.position.copy(pos);
  c4s.push({ owner: e, sk, m, pos, vel: aim.clone().setY(Math.min(aim.y, 0.1)).multiplyScalar(sk.throw).add(new V3(0, 2, 0)), stuck: false, ent: null, off: null, t: 0 });
  SFX.play('skC4', e.isBot ? pos : null);
}
function detonate(e) {
  const i = c4s.findIndex(c => c.owner === e);
  if (i < 0) return;
  const c = c4s[i]; c4s.splice(i, 1); c.m.visible = false;
  explodeAt(c.pos, e, c.sk.dmg, c.sk.radius, c.sk);
}
function updateC4(dt) {
  for (const c of c4s) {
    c.t += dt;
    if (c.ent) c.pos.copy(c.ent.pos).add(c.off);
    else if (!c.stuck) {
      c.vel.y -= 20 * dt;
      const next = c.pos.clone().addScaledVector(c.vel, dt);
      const body = hitBody(foeOf(c.owner), c.pos, next, 0.05);
      const wall = hitWorld(c.pos, next);
      if (body && (!wall || body.distanceTo(c.pos) < wall.distance)) {
        const t = foeOf(c.owner);
        c.ent = t; c.off = body.clone().sub(t.pos); c.pos.copy(body); c.stuck = true;
        SFX.play('skC4Stick', body);
      } else if (wall) {
        const n = wall.face ? wall.face.normal.clone().transformDirection(wall.object.matrixWorld) : new V3(0, 1, 0);
        c.pos.copy(wall.point).addScaledVector(n, 0.05); c.stuck = true;
        c.m.lookAt(c.pos.clone().add(n)); c.m.rotateX(Math.PI / 2);
        SFX.play('skC4Stick', wall.point);
      } else c.pos.copy(next);
      if (!c.stuck) c.m.rotation.x += dt * 8;
    }
    c.m.position.copy(c.pos);
    // 置いてしばらくすると、相手からは見えない（自分のは見える）
    c.m.visible = !(c.owner.isBot && c.t > c.sk.hideAfter);
    // 点滅（貼りついたら速く）
    const light = c.m.getObjectByName('light');
    if (light) light.visible = Math.sin(c.t * (c.stuck ? 14 : 6)) > 0;
  }
}

// ---------- ホーミングミサイル ----------
const missiles = [];
function makeMissile() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(flatGeo(new THREE.CylinderGeometry(0.07, 0.07, 0.55, 6).rotateX(Math.PI / 2)), toon({ color: C(P.shiro[1]) }));
  const nose = new THREE.Mesh(flatGeo(new THREE.ConeGeometry(0.07, 0.2, 6).rotateX(-Math.PI / 2)), toon({ color: C(P.shu[1]) }));
  nose.position.z = -0.37;
  g.add(body, nose);
  for (let i = 0; i < 4; i++) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.12, 0.12), toon({ color: C(P.shu[1]) }));
    const a = i * Math.PI / 2; f.position.set(Math.cos(a) * 0.09, Math.sin(a) * 0.09, 0.2); f.rotation.z = a; g.add(f);
  }
  g.traverse((o: any) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
const dirOf = (yaw: number, pitch: number) => new V3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
function launch(e, aim: any, sk) {
  const m = track(makeMissile());
  // 空の高い所（自分の少し後ろ）から、向いている方向へ斜めに降ってくる
  const yaw = Math.atan2(-aim.x, -aim.z), pitch = -1.15;
  const back = new V3(-Math.sin(yaw), 0, -Math.cos(yaw)).multiplyScalar(-sk.height * 0.35);
  const pos = new V3(e.pos.x, e.pos.y + sk.height, e.pos.z).add(back);
  const M = { owner: e, sk, m, pos, yaw, pitch, dir: dirOf(yaw, pitch), t: 0, ctrl: true };
  missiles.push(M);
  m.position.copy(pos);
  SFX.play('skMissile', e.isBot ? pos : null);
}
function boom(M) {
  const i = missiles.indexOf(M);
  if (i >= 0) missiles.splice(i, 1);
  M.m.visible = false; M.ctrl = false;
  explodeAt(M.pos, M.owner, M.sk.dmg, M.sk.radius, M.sk);
}
function updateMissiles(dt) {
  for (const M of [...missiles]) {
    M.t += dt;
    if (M.ctrl && M.owner.isBot && Net.on) {
      if (bot.netMis) { M.dir.copy(bot.netMis.d); M.pos.lerp(bot.netMis.p, 0.3); }
    } else if (M.ctrl && M.owner.isBot && M.t > 0.35) {
      // CPU：相手の胸へ向けて曲がる（曲がる速さに上限）
      const want = chest(player).sub(M.pos).normalize();
      const ang = M.dir.angleTo(want), maxA = 2.2 * dt;
      M.dir.lerp(want, ang > maxA ? maxA / ang : 1).normalize();
      if (M.dir.y > -0.3) { M.dir.y = -0.3; M.dir.normalize(); }   // 上へは戻れない
    } else if (M.ctrl && !M.owner.isBot) M.dir.copy(dirOf(M.yaw, M.pitch));
    const next = M.pos.clone().addScaledVector(M.dir, M.sk.speed * dt);
    const body = hitBody(foeOf(M.owner), M.pos, next, 0.15) || hitBody(M.owner, M.pos, next, 0.05);
    const wall = hitWorld(M.pos, next);
    if (body || wall || M.t > M.sk.life) { if (body) M.pos.copy(body); else if (wall) M.pos.copy(wall.point); boom(M); continue; }
    M.pos.copy(next);
    M.m.position.copy(M.pos); M.m.lookAt(M.pos.clone().sub(M.dir));
    Particles.trail(M.pos.clone().addScaledVector(M.dir, -0.35), P.daidai[2]);
  }
}

// ---------- 投げる物：閃光弾・エンダーパール・EMP ----------
const throws = [];
const empGeo = flatGeo(new THREE.IcosahedronGeometry(0.09, 0)), empM = toon({ color: C(P.sumi[1]), emissive: C(P.mizu[1]), emissiveIntensity: 0.9 });
const flashGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.16, 6), flashM = toon({ color: C(P.sumi[2]) });
const pearlGeo = flatGeo(new THREE.IcosahedronGeometry(0.1, 1)), pearlM = toon({ color: C(P.seiji[0]), emissive: C(P.fuji[0]), emissiveIntensity: 0.6 });
function toss(kind, e, aim, sk) {
  const m = track(new THREE.Mesh(kind === 'flash' ? flashGeo : kind === 'emp' ? empGeo : pearlGeo, kind === 'flash' ? flashM : kind === 'emp' ? empM : pearlM));
  const pos = eyeOf(e).addScaledVector(aim, 0.6);
  m.position.copy(pos);
  throws.push({ kind, owner: e, sk, m, pos, vel: aim.clone().multiplyScalar(sk.speed).add(new V3(0, 3, 0)), t: 0, stuck: false });
  SFX.play(kind === 'pearl' ? 'skC4' : 'skFlashPin', e.isBot ? pos : null);
}
// EMP：当たった所で球が一瞬広がる。中にいた相手はスキル封じと鈍足、相手のタレット歩は止まる
const bubbleGeo = new THREE.IcosahedronGeometry(1, 3);
const bubbles = [];
function empAt(p, T) {
  const sk = T.sk;
  const shell = track(new THREE.Mesh(bubbleGeo, new THREE.MeshBasicMaterial({ color: P.mizu[2], transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })));
  const wire = track(new THREE.Mesh(bubbleGeo, new THREE.MeshBasicMaterial({ color: P.shiro[2], wireframe: true, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending })));
  shell.position.copy(p); wire.position.copy(p);
  bubbles.push({ shell, wire, t: 0, r: sk.radius });
  for (let i = 0; i < 30; i++) Particles.glow(p.clone().add(new V3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(rand(0.3, sk.radius))), i % 3 ? P.mizu[2] : P.shiro[2]);
  SFX.play('skEmp', p);
  const t = foeOf(T.owner);
  if (t && !t.dead && chest(t).distanceTo(p) <= sk.radius) hitEmp(t, sk);
  for (const R of turrets) if (R.owner !== T.owner && R.pos.distanceTo(p) <= sk.radius) R.empT = sk.disable;
}
function hitEmp(e, sk) {
  e.empT = sk.disable; e.empMax = sk.disable; e.empSlow = sk.slow;
  // 使っている最中のスキルも切れる（動くスキルは勢いのまま）。ミサイルの操作も切れる
  for (const s of e.slots) if (s.t > 0 && !['dash', 'step', 'leap', 'grapple', 'blink'].includes(s.sk.type)) s.t = 0;
  const M = missiles.find(m => m.owner === e && m.ctrl); if (M) M.ctrl = false;
  for (let i = 0; i < 12; i++) Particles.glow(e.pos.clone().add(new V3(rand(-0.5, 0.5), rand(0.2, e.height), rand(-0.5, 0.5))), P.mizu[2]);
  if (!e.isBot) { SFX.play('skEmpHit'); view.shake = Math.max(view.shake, 0.3); }
}
function updateBubbles(dt) {
  for (let i = bubbles.length - 1; i >= 0; i--) {
    const B = bubbles[i]; B.t += dt;
    const k = Math.min(1, B.t / 0.18), f = Math.max(0, 1 - (B.t - 0.18) / 0.5);
    for (const m of [B.shell, B.wire]) m.scale.setScalar(Math.max(0.01, B.r * (1 - (1 - k) ** 3)));
    B.shell.material.opacity = 0.35 * f; B.wire.material.opacity = 0.5 * f; B.wire.rotation.y += dt * 3;
    if (f <= 0) { B.shell.visible = B.wire.visible = false; bubbles.splice(i, 1); }
  }
}
// 閃光（VALORANT 方式）：炸裂した瞬間に閃光弾が画面の中に見えていたら目がくらむ。画面の外なら平気。遠いほど少し短い
function flashAt(p, sk) {
  for (let i = 0; i < 26; i++) Particles.glow(p.clone().add(new V3(rand(-1, 1), rand(-0.5, 1), rand(-1, 1))), P.shiro[2]);
  SFX.play('skFlash', p);
  for (const e of [player, bot]) {
    if (!e || e.dead) continue;
    const eye = eyeOf(e), d = eye.distanceTo(p);
    if (d > sk.radius || !hasLOS(eye, p, true)) continue;
    let onScreen;
    if (e.isBot) onScreen = facingOf(e).dot(p.clone().sub(eye).normalize()) > 0.6;   // CPU は正面の約 ±53° を画面とみなす
    else { const s = p.clone().project(cam); onScreen = s.z < 1 && Math.abs(s.x) <= 1.02 && Math.abs(s.y) <= 1.02; }
    if (!onScreen) continue;
    const k = 1 - d / sk.radius * 0.4;
    if (e.isBot) e.blindT = Math.max(e.blindT || 0, sk.blind * k);
    else gs.flash = Math.max(gs.flash || 0, sk.blind * k);
  }
}
// パール：落ちた所へ持ち主を移す
function warp(T, p, n) {
  const e = T.owner;
  for (let i = 0; i < 14; i++) Particles.glow(e.pos.clone().add(new V3(rand(-0.5, 0.5), rand(0.2, e.height), rand(-0.5, 0.5))), P.fuji[1]);
  e.pos.copy(p).addScaledVector(n, 0.6); e.pos.y = Math.max(e.pos.y, p.y + 0.05);
  e.vel.set(0, 0, 0); e.vy = 0; e.onGround = false;
  for (let i = 0; i < 14; i++) Particles.glow(e.pos.clone().add(new V3(rand(-0.5, 0.5), rand(0.2, e.height), rand(-0.5, 0.5))), P.fuji[1]);
  SFX.play('skPearl', e.isBot ? e.pos : null);
  if (e.isBot) { if (Net.on) return; bot.hp -= T.sk.selfDmg; if (bot.hp <= 0 && !bot.dead) killBot(); } else damagePlayer(T.sk.selfDmg, e.pos);
}
function updateThrows(dt) {
  for (let i = throws.length - 1; i >= 0; i--) {
    const T = throws[i]; T.t += dt;
    if (!T.stuck) {
      T.vel.y -= 20 * dt;
      const next = T.pos.clone().addScaledVector(T.vel, dt);
      const body = hitBody(foeOf(T.owner), T.pos, next, 0.1), wall = hitWorld(T.pos, next);
      if (body || wall) {
        const p = body || wall.point;
        const n = wall && wall.face && !body ? wall.face.normal.clone().transformDirection(wall.object.matrixWorld) : T.vel.clone().normalize().negate();
        if (T.kind === 'pearl') { warp(T, p.clone(), n); T.m.visible = false; throws.splice(i, 1); continue; }
        if (T.kind === 'emp') { empAt(p.clone().addScaledVector(n, 0.2), T); T.m.visible = false; throws.splice(i, 1); continue; }
        T.pos.copy(p).addScaledVector(n, 0.12); T.stuck = true;
      } else T.pos.copy(next);
      T.m.position.copy(T.pos); T.m.rotation.x += dt * 9;
      if (T.kind === 'pearl') Particles.trail(T.pos, P.fuji[1]);
      if (T.kind === 'emp') Particles.trail(T.pos, P.mizu[2]);
    }
    if (T.kind === 'flash' && T.t >= T.sk.fuse) { flashAt(T.pos, T.sk); T.m.visible = false; throws.splice(i, 1); continue; }
    if (T.t > 8) { T.m.visible = false; throws.splice(i, 1); }
  }
}

// ---------- 衝撃波：まわりを吹き飛ばす ----------
const ringGeo = new THREE.TorusGeometry(1, 0.12, 4, 28).rotateX(Math.PI / 2);
const rings = [];
function shockwave(e, sk) {
  const c = e.pos.clone().add(new V3(0, 0.6, 0));
  const m = track(new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: P.kin[2], transparent: true, opacity: 0.8, depthWrite: false })));
  m.position.copy(c); rings.push({ m, t: 0, r: sk.radius });
  Particles.dust(e.pos, 30, 3); SFX.play('skShock', e.isBot ? e.pos : null);
  PHYS.blast(c, sk.radius, sk.knock * 0.5);
  if (!e.isBot) view.shake = Math.max(view.shake, 0.5);
  const t = foeOf(e);
  if (t.dead) return;
  const d = Math.hypot(t.pos.x - e.pos.x, t.pos.z - e.pos.z);
  if (d > sk.radius || Math.abs(t.pos.y - e.pos.y) > 4) return;
  const k = 1 - d / sk.radius, dir = t.pos.clone().sub(e.pos).setY(0).normalize();
  t.vel.add(dir.multiplyScalar(sk.knock * k + 4)); t.vy = sk.lift * k + 4; t.onGround = false; t.airT = 1; t.jumped = true;
  t.knockT = 0.5 + 0.7 * k;
  const dmg = sk.dmg * k * skillDamageMul(t, e.pos);
  const pt = eyeOf(t);
  if (t.isBot) damageBot({ dmg, head: false, point: pt }); else { if (!Net.on) damagePlayer(dmg, e.pos); view.shake = Math.max(view.shake, 0.6); }
}
function updateRings(dt) {
  for (let i = rings.length - 1; i >= 0; i--) {
    const R = rings[i]; R.t += dt;
    const k = Math.min(1, R.t / 0.35);
    R.m.scale.setScalar(0.5 + (R.r - 0.5) * k); R.m.material.opacity = 0.8 * (1 - k);
    if (k >= 1) { R.m.visible = false; rings.splice(i, 1); }
  }
}

// ---------- タレット歩（王）：目の前に置く動かない砲台。相手が見えたら撃つ。HP があり、撃たれると壊れる ----------
// 自分のタレットの弾だけが本当のダメージになる（オンラインの相手のタレットは見た目だけ。ダメージは相手の画面から届く）
const turrets = [];
const turretW = { dmg: 8, head: 1, falloff: [15, 35, 0.6], model: 'pistol' };
function makeTurret() {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 0.3, 8), toon({ color: C(P.sumi[1]) })); base.position.y = 0.15; g.add(base);
  const head = new THREE.Group(); head.name = 'head'; head.position.y = 0.3; g.add(head); g.userData.head = head;   // リプレイで向きも再現する
  // 駒の形の原点は真ん中あたりなので、下の端が台の上にくるように持ち上げる（前を向くよう裏返す）
  if (!pieceGeo.boundingBox) pieceGeo.computeBoundingBox();
  const bb = pieceGeo.boundingBox, k = 0.75, ph = (bb.max.y - bb.min.y) * k;
  const piece = new THREE.Mesh(pieceGeo, pieceSolidMats('歩')); piece.scale.setScalar(k); piece.rotation.y = Math.PI;
  piece.position.set((bb.max.x + bb.min.x) / 2 * k, -bb.min.y * k, (bb.max.z + bb.min.z) / 2 * k); head.add(piece);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.6), toon({ color: C(P.sumi[0]) })); gun.position.set(0, ph * 0.7, -0.35); head.add(gun);
  g.traverse((o: any) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
function placeTurret(e, dir, sk) {
  for (const T of turrets.filter(T => T.owner === e)) breakTurret(T, false);   // 1人1台まで
  const d = dir.clone().setY(0).normalize(), p = e.pos.clone().addScaledVector(d, 1.6);
  p.y = floorBelow(p.x, p.z, e.pos.y);
  const m = track(makeTurret()); m.position.copy(p); m.rotation.y = Math.atan2(-d.x, -d.z);
  const T = { owner: e, sk, m, pos: p, hp: sk.hp, cd: 0.6, seen: 0 };
  m.traverse((o: any) => { if (o.isMesh) { o.userData.turret = T; blockers.push(o); } });
  turrets.push(T);
  Particles.dust(p, 8, 1); SFX.play('skBoxes', e.isBot ? p : null);
}
function breakTurret(T, fx = true) {
  const i = turrets.indexOf(T); if (i < 0) return;
  turrets.splice(i, 1); T.m.visible = false;
  T.m.traverse((o: any) => { const k = blockers.indexOf(o); if (k >= 0) blockers.splice(k, 1); });
  if (fx) { Particles.wood(T.pos.clone().add(new V3(0, 0.6, 0)), new V3(0, 1, 0), 18, 1.2); SFX.play('hit', T.pos); }
}
// 撃たれた（by: 撃った側）。オンラインで自分が相手のタレットを撃ったら、相手にも知らせる
function damageTurret(T, dmg, by, fromNet = false) {
  if (!T || by === T.owner || !turrets.includes(T)) return;
  if (Net.on && T.owner === player && !fromNet) return;   // オンラインでは、自分のタレットへのダメージは相手の画面から届いた分だけ
  T.hp -= dmg;
  Particles.wood(T.pos.clone().add(new V3(0, 0.6, 0)), new V3(0, 1, 0), 4, 0.5);
  if (Net.on && by === player) Net.send({ t: 'thit', dmg: Math.round(dmg * 10) / 10 });
  if (T.hp <= 0) breakTurret(T);
}
function updateTurrets(dt) {
  for (const T of [...turrets]) {
    const t = foeOf(T.owner), head = T.m.getObjectByName('head');
    const muzzle = T.pos.clone().add(new V3(0, 0.85, 0));
    const aimAt = t && !t.dead ? chest(t) : null;
    const dir = aimAt && aimAt.clone().sub(muzzle).normalize(), from = aimAt && muzzle.clone().addScaledVector(dir, 0.8);   // 自分の形の外から
    const sees = aimAt && muzzle.distanceTo(aimAt) < T.sk.range && hasLOS(from, aimAt);
    T.seen = sees ? T.seen + dt : 0;
    if (sees) {   // 相手の方へ向く
      const want = Math.atan2(-(aimAt.x - T.pos.x), -(aimAt.z - T.pos.z)) - T.m.rotation.y;
      head.rotation.y += Math.atan2(Math.sin(want - head.rotation.y), Math.cos(want - head.rotation.y)) * Math.min(1, dt * 10);
    }
    T.cd -= dt;
    if (T.empT > 0) { T.empT -= dt; if (Math.random() < dt * 6) Particles.glow(muzzle.clone().add(new V3(rand(-0.3, 0.3), rand(-0.3, 0.3), rand(-0.3, 0.3))), P.mizu[2]); continue; }   // EMP で止まっている
    if (!sees || T.seen < 0.4 || T.cd > 0) continue;   // 見つけてから少し待って撃つ
    T.cd = T.sk.rate;
    const r = castShot({ w: turretW, isBot: T.owner.isBot, pos: T.pos }, t, from, from, dir, T.sk.spread, true);
    SFX.play('shot', from, 'pistol');
    if (r.dmg > 0) {
      if (t === bot) damageBot({ dmg: r.dmg, head: r.head, point: r.point });
      else if (!Net.on) damagePlayer(r.dmg, T.pos);
    }
  }
}

// ---------- 鉤縄：狙った先（壁・床）を探す。縄の見た目 ----------
function grappleTarget(e, aim, range) {
  const from = eyeOf(e), h = hitWorld(from, from.clone().addScaledVector(aim, range));
  if (!h) return null;
  const n = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : aim.clone().negate();
  return h.point.clone().addScaledVector(n, 0.5);
}
const ropeM = new THREE.LineBasicMaterial({ color: P.kiji[0] });
const ropes = new Map();
function updateRopes() {
  for (const e of [player, bot]) {
    if (!e) continue;
    let L = ropes.get(e);
    if (!L) { L = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new V3(), new V3()]), ropeM); L.frustumCulled = false; scene.add(L); ropes.set(e, L); }
    const g = act(e, 'grapple');
    L.visible = !!(g && g.target);
    if (!L.visible) continue;
    const from = eyeOf(e).add(new V3(0, -0.45, 0));
    if (!e.isBot) from.add(new V3(Math.cos(view.yaw), 0, -Math.sin(view.yaw)).multiplyScalar(0.25));
    const p = L.geometry.attributes.position;
    p.setXYZ(0, from.x, from.y, from.z); p.setXYZ(1, g.target.x, g.target.y, g.target.z); p.needsUpdate = true;
  }
}

export const Gadgets = {
  throwC4, detonate, launch, toss, shockwave, grappleTarget, placeTurret, damageTurret,
  turretOfHit: (o: any) => o && o.userData && o.userData.turret,
  myTurret: () => turrets.find(T => T.owner === player),
  // 爆風：範囲内の相手のタレットを壊す（by: 爆発させた側）
  blastTurrets(pos, radius, dmg, by) { for (const T of [...turrets]) { const d = T.pos.distanceTo(pos); if (d < radius + 0.5) damageTurret(T, dmg * (1 - d / (radius + 0.5) * 0.5), by); } },
  c4Of: e => c4s.find(c => c.owner === e),
  ctrlOf: e => missiles.find(m => m.owner === e && m.ctrl),
  // 操作をやめる（ミサイルはそのまままっすぐ飛ぶ）
  release(e) { const M = missiles.find(m => m.owner === e && m.ctrl); if (M) M.ctrl = false; },
  update(dt) { updateRopes(); if (dt <= 0) return; updateC4(dt); updateMissiles(dt); updateThrows(dt); updateRings(dt); updateBubbles(dt); updateTurrets(dt); },
  clear() { [...turrets].forEach(T => breakTurret(T, false)); reg.forEach(o => scene.remove(o)); reg.length = 0; c4s.length = 0; missiles.length = 0; throws.length = 0; rings.length = 0; bubbles.length = 0; gs.flash = 0; },
  // リプレイ用：出ている物の位置・大きさ・濃さ
  snapshot: () => reg.map((o, i) => (o.visible ? [i, o.position.x, o.position.y, o.position.z, o.rotation.x, o.rotation.y, o.rotation.z, o.scale.x, opOf(o), o.userData.light ? +o.userData.light.visible : -1, o.userData.head ? o.userData.head.rotation.y : 0] : null)).filter(Boolean),   // 地雷の光・タレットの向き
  restore(s) {
    reg.forEach(o => { o.visible = false; });
    for (const [i, x, y, z, rx, ry, rz, sc, op, lt, hy] of s) {
      const o: any = reg[i]; if (!o) continue;
      o.visible = true; o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.scale.setScalar(sc);
      if (o.userData.light && lt >= 0) o.userData.light.visible = !!lt;
      if (o.userData.head) o.userData.head.rotation.y = hy || 0;
      if (o.material && o.material.uniforms && o.material.uniforms.uOp) o.material.uniforms.uOp.value = op;
      else if (o.material && o.material.opacity !== undefined) o.material.opacity = op;
    }
  },
  // リプレイ用：記録した的へ縄を張る（list: [本物の駒, 記録から動かす駒, 的の位置 or null]）。対局に戻れば update が張り直す
  replayRopes(list) {
    for (const [k, fk, tgt] of list) {
      const L = ropes.get(k); if (!L) continue;
      L.visible = !!tgt; if (!tgt) continue;
      const p = L.geometry.attributes.position;
      p.setXYZ(0, fk.pos.x, fk.pos.y + k.eyeH - 0.45, fk.pos.z); p.setXYZ(1, tgt.x, tgt.y, tgt.z); p.needsUpdate = true;
    }
  },
  samples: () => [makeC4(), makeMissile()],
};
