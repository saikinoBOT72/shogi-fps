// スキルで出す道具：ポイズンドーム（桂）・C4 と ホーミングミサイル（銀）
// リプレイ用に、出した物の形はここに登録して（track）、対局中は消さずに隠すだけにする
import * as THREE from 'three';
import { P } from './palette';
import { C, V3, clamp, rand } from './core';
import { SFX } from './audio';
import { flatGeo, scene, toon } from './render';
import { blockers } from './physics';
import { Particles } from './effects';
import { bot, damageBot, eyeOf, player, ray } from './game';
import { damagePlayer } from './ai';
import { explodeAt } from './grenades';

const reg: THREE.Object3D[] = [];
export const track = <T extends THREE.Object3D>(o: T): T => { reg.push(o); scene.add(o); return o; };
const opOf = (o: any) => (o.material && o.material.opacity !== undefined ? o.material.opacity : 1);
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
function hurt(t, dmg, point, from) {
  if (t.dead) return;
  if (t.isBot) damageBot({ dmg, head: false, point });
  else damagePlayer(dmg, from);
}

// ---------- ポイズンドーム ----------
const domeGeo = flatGeo(new THREE.IcosahedronGeometry(1, 2));
const domes = [];
function spawnDome(pos: any, owner, sk) {
  const m = track(new THREE.Mesh(domeGeo, toon({ color: C(P.fuji[1]), emissive: C(P.fuji[0]), emissiveIntensity: 0.6, transparent: true, opacity: 0.42, side: THREE.DoubleSide, depthWrite: false })));
  m.position.copy(pos); m.scale.setScalar(0.01);
  domes.push({ m, pos: pos.clone(), owner, sk, t: 0, tick: 0 });
  SFX.play('smoke', pos);
}
function updateDomes(dt) {
  for (let i = domes.length - 1; i >= 0; i--) {
    const d = domes[i]; d.t += dt;
    const grow = Math.min(1, d.t / 0.4), fade = clamp((d.sk.life - d.t) / 0.8, 0, 1), r = d.sk.radius * grow;
    d.m.scale.setScalar(Math.max(0.01, r)); d.m.material.opacity = 0.42 * fade;
    if (Math.random() < dt * 20) Particles.glow(d.pos.clone().add(new V3(rand(-1, 1), rand(-0.3, 1), rand(-1, 1)).multiplyScalar(r * 0.8)), P.fuji[2]);
    // 中にいる相手に 0.5 秒ごとにダメージ
    d.tick -= dt;
    const t = foeOf(d.owner);
    if (d.tick <= 0 && !t.dead && chest(t).distanceTo(d.pos) < r + t.radius * 0.5) { d.tick = 0.5; hurt(t, d.sk.dps * 0.5, chest(t), d.pos); }
    if (d.t >= d.sk.life) { d.m.visible = false; domes.splice(i, 1); }
  }
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
  c4s.push({ owner: e, sk, m, pos, vel: aim.clone().multiplyScalar(12).add(new V3(0, 3, 0)), stuck: false, ent: null, off: null, t: 0 });
  SFX.play('clunk', e.isBot ? pos : null);
}
function detonate(e) {
  const i = c4s.findIndex(c => c.owner === e);
  if (i < 0) return;
  const c = c4s[i]; c4s.splice(i, 1); c.m.visible = false;
  explodeAt(c.pos, e, c.sk.dmg, c.sk.radius, 1.2);
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
        SFX.play('clunk', body);
      } else if (wall) {
        const n = wall.face ? wall.face.normal.clone().transformDirection(wall.object.matrixWorld) : new V3(0, 1, 0);
        c.pos.copy(wall.point).addScaledVector(n, 0.05); c.stuck = true;
        c.m.lookAt(c.pos.clone().add(n)); c.m.rotateX(Math.PI / 2);
        SFX.play('clunk', wall.point);
      } else c.pos.copy(next);
      if (!c.stuck) c.m.rotation.x += dt * 8;
    }
    c.m.position.copy(c.pos);
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
  const pos = eyeOf(e).add(new V3(0, 0.5, 0));
  const yaw = Math.atan2(-aim.x, -aim.z), pitch = 1.0;   // まず斜め上へ打ち上げる
  const M = { owner: e, sk, m, pos, yaw, pitch, dir: dirOf(yaw, pitch), t: 0, ctrl: true };
  missiles.push(M);
  m.position.copy(pos);
  SFX.play('launcher', e.isBot ? pos : null);
}
function boom(M) {
  const i = missiles.indexOf(M);
  if (i >= 0) missiles.splice(i, 1);
  M.m.visible = false; M.ctrl = false;
  explodeAt(M.pos, M.owner, M.sk.dmg, M.sk.radius, 1);
}
function updateMissiles(dt) {
  for (const M of [...missiles]) {
    M.t += dt;
    if (M.ctrl && M.owner.isBot && M.t > 0.35) {
      // CPU：相手の胸へ向けて曲がる（曲がる速さに上限）
      const want = chest(player).sub(M.pos).normalize();
      const ang = M.dir.angleTo(want), maxA = 2.2 * dt;
      M.dir.lerp(want, ang > maxA ? maxA / ang : 1).normalize();
    } else if (M.ctrl && !M.owner.isBot) M.dir.copy(dirOf(M.yaw, M.pitch));
    const next = M.pos.clone().addScaledVector(M.dir, M.sk.speed * dt);
    const body = hitBody(foeOf(M.owner), M.pos, next, 0.15) || (M.t > 0.6 ? hitBody(M.owner, M.pos, next, 0.05) : null);
    const wall = hitWorld(M.pos, next);
    if (body || wall || M.t > M.sk.life) { if (body) M.pos.copy(body); else if (wall) M.pos.copy(wall.point); boom(M); continue; }
    M.pos.copy(next);
    M.m.position.copy(M.pos); M.m.lookAt(M.pos.clone().sub(M.dir));
    Particles.trail(M.pos.clone().addScaledVector(M.dir, -0.35), P.daidai[2]);
  }
}

export const Gadgets = {
  spawnDome, throwC4, detonate, launch,
  c4Of: e => c4s.find(c => c.owner === e),
  ctrlOf: e => missiles.find(m => m.owner === e && m.ctrl),
  // 操作をやめる（ミサイルはそのまままっすぐ飛ぶ）
  release(e) { const M = missiles.find(m => m.owner === e && m.ctrl); if (M) M.ctrl = false; },
  update(dt) { if (dt <= 0) return; updateDomes(dt); updateC4(dt); updateMissiles(dt); },
  clear() { reg.forEach(o => scene.remove(o)); reg.length = 0; domes.length = 0; c4s.length = 0; missiles.length = 0; },
  // リプレイ用：出ている物の位置・大きさ・濃さ
  snapshot: () => reg.map((o, i) => (o.visible ? [i, o.position.x, o.position.y, o.position.z, o.rotation.x, o.rotation.y, o.rotation.z, o.scale.x, opOf(o)] : null)).filter(Boolean),
  restore(s) {
    reg.forEach(o => { o.visible = false; });
    for (const [i, x, y, z, rx, ry, rz, sc, op] of s) {
      const o: any = reg[i]; if (!o) continue;
      o.visible = true; o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.scale.setScalar(sc);
      if (o.material && o.material.opacity !== undefined) o.material.opacity = op;
    }
  },
  samples: () => [new THREE.Mesh(domeGeo, toon({ color: C(P.fuji[1]), transparent: true, side: THREE.DoubleSide })), makeC4(), makeMissile()],
};
