// 忍：手裏剣（押すたびに1枚）と苦無（長押しで並べて、離すと続けて飛ばす）。残像疾風・変わり身はこのあと足していく
//   投げた手裏剣・苦無は arrows.ts（kind 'shuriken' / 'kunai'）が飛ばし、当たり・刺さりも矢と同じ仕組み
//   苦無：押し続けて START 秒たつと、EVERY 秒ごとに1本ずつ背中の後ろ上に扇の形で並ぶ（最大 MAX 本）
//     ・出る：墨のにじみから刃が抜け出す。1本ごとに音が少し高くなる。そろうと全部の刃が一瞬光って「チン」
//     ・並んだ苦無はいつも照準の先を向き、房は下へ垂れて揺れる
//     ・離すと外側から内側へ、左右交互に GAP 秒おきに飛ぶ（朱の尾）
//     ・自分の画面では、扇は画面の上のふちに沿って並ぶ（背中の後ろは見えないため）
//   オンライン：手裏剣・苦無は矢と同じ 'arrow'（k: 'shuriken' / 'kunai'）。並べている本数は様子（'s' の kn）で送る
import * as THREE from 'three';
import { V3, clamp, lerp } from './core';
import { P } from './palette';
import { SFX } from './audio';
import { cam, scene } from './render';
import { blockers } from './physics';
import { Arrows } from './arrows';
import { Particles, VM } from './effects';
import { Net, r2, vec } from './net';
import { aiHear } from './ai';
import { heardFoe } from './hud';
import { gs } from './state';
import { makeKunai, hangTassel } from './guns/kunai';
import { bot, botActor, player, playerActor, stats, view, onAttack, eyeOf, ray, currentSpread, facingOf } from './game';

const ROLL = -0.35, TILT = 0.75;   // 右手で横に投げるので少し右下がり。面も前へ倒す（投げた人からも相手からも、回る星の形が見えるように）
const BUFFER = 0.12;  // 投げられるようになる少し前に押しても、間に合ったら投げる
// 苦無：START 押し続けてから出始める / EVERY 1本ずつ出る間隔 / MAX 最大の本数 / GAP 飛ばす間隔 / SPEED 速さ / DMG・HEAD 威力 / AFTER 撃ち終わってから次に投げられるまで
const K = { START: 0.25, EVERY: 0.12, MAX: 8, GAP: 0.06, SPEED: 70, DMG: 13, HEAD: 1.5, AFTER: 0.35 };
// 扇の並び（真上からの角度、右が +）。この順に出る（内側から外側へ左右交互）
const FAN = [-12, 12, -34, 34, -56, 56, -78, 78].map(d => d * Math.PI / 180);
const UP = new V3(0, 1, 0), DOWN = new V3(0, -1, 0);

// 照準の先（壁・相手に当たる所。何もなければ遠く）
function aimPoint(eye: THREE.Vector3, dir: THREE.Vector3) {
  ray.set(eye, dir); ray.far = 150;
  const w = ray.intersectObjects(blockers, true)[0];
  let d = w ? w.distance : 150;
  const h = !bot.dead && botActor && ray.intersectObject(botActor.hitMesh, false)[0];
  if (h && h.distance < d) d = h.distance;
  ray.far = Infinity;
  return eye.clone().addScaledVector(dir, Math.max(d, 2));
}
const lookDir = () => new V3(0, 0, -1).applyQuaternion(cam.quaternion);

// 手裏剣を1枚投げる（プレイヤー・CPU 共通）
export function throwStar(e, dir: THREE.Vector3, origin: THREE.Vector3) {
  const w = e.w, sp = currentSpread(e);
  const d = dir.clone().add(new V3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(Math.random() * sp)).normalize();
  Arrows.fire({ owner: e, target: e === player ? bot : player, pos: origin, vel: d.multiplyScalar(w.speed), dmg: w.dmg, head: w.head, gravity: w.gravity, drag: w.drag || 0,
    homing: false, turn: 0, full: false, kind: 'shuriken', roll: ROLL, tilt: TILT });
  if (Net.on && e === player) { const a = Arrows.last(); Net.send({ t: 'arrow', p: vec(a.pos), v: vec(a.vel), dmg: r2(a.dmg), hd: a.head, g: a.gravity, dr: a.drag, k: 'shuriken', ro: ROLL, ti: TILT }); }
  e.cd = w.rate; e.njThrowT = 0;
  onAttack(e);
  SFX.play('swing', e.isBot ? origin : null, !e.isBot);
  if (e.isBot) heardFoe(origin, 'shot'); else aiHear(e.pos, 14);
}

// ---------- 墨のにじみ（苦無が出てくる所） ----------
const inkTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  g.fillStyle = '#000';
  for (let i = 0; i < 9; i++) {   // まわりの飛び散り
    const a = Math.random() * Math.PI * 2, r = 30 + Math.random() * 26, s = 4 + Math.random() * 8;
    g.beginPath(); g.arc(64 + Math.cos(a) * r, 64 + Math.sin(a) * r, s, 0, Math.PI * 2); g.fill();
  }
  g.beginPath();
  for (let i = 0; i <= 24; i++) { const a = i / 24 * Math.PI * 2, r = 30 + Math.sin(i * 2.7) * 6 + Math.random() * 6; (i ? g.lineTo.bind(g) : g.moveTo.bind(g))(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); }
  g.fill();
  return new THREE.CanvasTexture(c);
})();
const inkGeo = new THREE.PlaneGeometry(1, 1);
const inks: { m: THREE.Mesh; t: number; size: number }[] = [];
function ink(pos: THREE.Vector3, size = 0.42) {
  const m = new THREE.Mesh(inkGeo, new THREE.MeshBasicMaterial({ map: inkTex, color: 0x0d0a09, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide }));
  m.position.copy(pos); m.rotation.z = Math.random() * 6; scene.add(m); inks.push({ m, t: 0, size });
}
function inkTick(dt: number) {
  for (let i = inks.length - 1; i >= 0; i--) {
    const k = inks[i]; k.t += dt;
    const grow = Math.min(1, k.t / 0.12), fade = clamp(1 - (k.t - 0.18) / 0.3, 0, 1);
    k.m.quaternion.copy(cam.quaternion); k.m.rotateZ(k.t * 0.6);
    k.m.scale.setScalar(k.size * (0.3 + 0.7 * grow) * (1 + (1 - fade) * 0.3));
    (k.m.material as THREE.MeshBasicMaterial).opacity = 0.85 * fade;
    if (k.t > 0.5) { scene.remove(k.m); (k.m.material as THREE.Material).dispose(); inks.splice(i, 1); }
  }
}

// ---------- 苦無を並べる・飛ばす ----------
type Kunai = { m: THREE.Group; slot: number; age: number; bob: number };
type NJ = { list: Kunai[]; holdT: number; nextT: number; firing: Kunai[]; fireT: number; flashT: number };
const nj = (e): NJ => e.nj || (e.nj = { list: [], holdT: 0, nextT: 0, firing: [], fireT: 0, flashT: 0 });
const mine = e => e === player && gs.state !== 'killcam';   // 自分の画面で見ている自分の苦無（画面の上のふちに並べる）

// slot 番目の苦無の置き場所（world）
function slotPos(e, slot: number, out: THREE.Vector3) {
  const a = FAN[slot];
  if (mine(e)) {
    const R = 0.78;
    return cam.localToWorld(out.set(Math.sin(a) * R * 1.15, -0.22 + Math.cos(a) * R, -1.05));
  }
  const f = facingOf(e), right = new V3(-f.z, 0, f.x), R = 1.2 * e.def.size;
  return out.copy(e.pos).addScaledVector(UP, e.height * 1.0 + Math.cos(a) * R).addScaledVector(right, Math.sin(a) * R).addScaledVector(f, -0.3 - 0.15 * Math.cos(a));
}
// 苦無が向く先
function targetOf(e) {
  if (e === player) return aimPoint(eyeOf(player), lookDir());
  return e.aimPt ? e.aimPt.clone() : eyeOf(e).addScaledVector(facingOf(e), 20);
}
function addKunai(e) {
  const S = nj(e), slot = S.list.length + S.firing.length;
  if (slot >= K.MAX) return;
  const m = makeKunai(); scene.add(m);
  const k: Kunai = { m, slot, age: 0, bob: Math.random() * 6 };
  S.list.push(k);
  const p = slotPos(e, slot, new V3());
  m.position.copy(p);
  ink(p, mine(e) ? 0.3 : 0.45);
  for (let i = 0; i < 3; i++) Particles.glow(p, P.sumi[2]);
  SFX.play('kunaiTick', mine(e) ? null : p, slot);
  if (slot === K.MAX - 1) { S.flashT = 0.2; SFX.play('kunaiFull', mine(e) ? null : p); }   // そろった：全部の刃が光って「チン」
}
function removeKunai(k: Kunai, puff = true) {
  if (puff) ink(k.m.position, 0.3);
  scene.remove(k.m);
}
// 離した：外側から内側へ、左右交互（|角度| の大きい順、同じなら右から）
function release(e) {
  const S = nj(e);
  if (!S.list.length) return;
  S.firing = S.list.sort((a, b) => Math.abs(FAN[b.slot]) - Math.abs(FAN[a.slot]) || FAN[b.slot] - FAN[a.slot]);
  S.list = []; S.fireT = 0;
  e.cd = Math.max(e.cd, S.firing.length * K.GAP + K.AFTER);
}
function fireOne(e, k: Kunai) {
  const from = k.m.position.clone(), to = targetOf(e);
  const dir = to.sub(from).normalize();
  removeKunai(k, false);
  Arrows.fire({ owner: e, target: e === player ? bot : player, pos: from, vel: dir.multiplyScalar(K.SPEED), dmg: K.DMG, head: K.HEAD, gravity: 0, drag: 0, homing: false, turn: 0, full: false, kind: 'kunai' });
  if (Net.on && e === player) { const a = Arrows.last(); Net.send({ t: 'arrow', p: vec(a.pos), v: vec(a.vel), dmg: r2(a.dmg), hd: a.head, g: 0, dr: 0, k: 'kunai' }); }
  onAttack(e);
  SFX.play('kunaiFire', mine(e) ? null : from);
  if (e === player) { stats.shots++; aiHear(e.pos, 14); } else heardFoe(from, 'shot');
}
function clearOf(e, puff = true) {
  if (!e || !e.nj) return;
  for (const k of [...e.nj.list, ...e.nj.firing]) removeKunai(k, puff);
  e.nj.list = []; e.nj.firing = []; e.nj.holdT = 0;
}
// 並んでいる苦無を毎フレーム置き直す（出てくる動き・照準の先を向く・房の揺れ）
const _p = new V3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();
function place(e, S: NJ, dt: number) {
  const list = [...S.list, ...S.firing];
  if (!list.length) return;
  const tgt = targetOf(e);
  S.flashT = Math.max(0, S.flashT - dt);
  for (const k of list) {
    k.age += dt;
    const out = Math.min(1, k.age / 0.22), ease = 1 - (1 - out) * (1 - out);
    slotPos(e, k.slot, _p);
    _p.y += Math.sin(k.bob + k.age * 3) * 0.02;
    // 照準の先を向く（出てくる間は、にじみの奥から刃先の向きへ抜け出す）。lookAt(目標, 自分) の順で +z（刃先）が目標を向く
    _m.lookAt(tgt, _p, UP); _q.setFromRotationMatrix(_m);
    const fwd = tgt.clone().sub(_p).normalize();
    k.m.position.copy(_p).addScaledVector(fwd, -(1 - ease) * 0.35);
    k.m.quaternion.copy(_q);
    k.m.scale.setScalar((mine(e) ? 0.72 : 1.3) * lerp(0.3, 1, ease));   // ほかの人から見る扇は大きめ（遠くからでも分かるように）
    hangTassel(k.m, DOWN.clone().add(new V3(Math.sin(k.age * 4 + k.bob) * 0.25, 0, Math.cos(k.age * 3 + k.bob) * 0.25)), 0.25);
    k.m.userData.glow.visible = S.flashT > 0;
  }
}

export const Ninja = {
  // 自分：押した瞬間に手裏剣を1枚（押しっぱなしでは続けて投げない）。押し続けると苦無を並べ、離すと飛ばす
  input(p, down: boolean, dt: number) {
    const S = nj(p);
    if (down && !p.njHeld && !S.firing.length) p.njBuf = BUFFER;
    p.njHeld = down;
    p.njWant = down;
    p.njBuf = (p.njBuf || 0) - dt;
    if (p.njBuf > 0 && p.cd <= 0 && !S.list.length) {
      p.njBuf = 0;
      cam.updateMatrixWorld();
      const target = aimPoint(eyeOf(p), lookDir());
      const origin = cam.localToWorld(new V3(0.16, -0.1, -0.45));   // 右手のあたりから照準の先へ
      throwStar(p, target.sub(origin).normalize(), origin);
      stats.shots++;
      VM.fire(p.w);
      view.shake = Math.max(view.shake, 0.05);
    }
  },
  // CPU：狙った所（aim）へ手裏剣を1枚
  aiThrow(b, aim: THREE.Vector3) {
    const eye = eyeOf(b);
    throwStar(b, aim, eye.addScaledVector(aim, 0.6));
  },
  // CPU：苦無を並べる（true の間）・離す（false）
  aiHold(b, held: boolean) { b.njWant = held; },
  // 並べている苦無の本数（オンラインの様子・表示用）
  count(e) { return e && e.nj ? e.nj.list.length : 0; },
  busy(e) { return !!(e && e.nj && (e.nj.list.length || e.nj.firing.length)); },
  // 相手（オンライン）の苦無が1本飛んだ：並べていた中の外側を1本消す
  remoteFired(b) {
    const S = nj(b);
    if (!S.list.length) return;
    S.list.sort((a, c) => Math.abs(FAN[c.slot]) - Math.abs(FAN[a.slot]));
    removeKunai(S.list.shift(), false);
    b.njShow = Math.max(0, (b.njShow || 0) - 1);
  },
  // 毎フレーム：苦無を出す・飛ばす・置き直す。駒が持つ手裏剣（ほかの人から見える）
  update(dt: number) {
    inkTick(dt);
    for (const e of [player, bot]) {
      if (!e) continue;
      const S = nj(e);
      const able = e.w.kind === 'ninja' && !e.dead && gs.state === 'fight';
      if (!able) { if (S.list.length || S.firing.length) clearOf(e); e.njWant = false; continue; }
      if (e === bot && Net.on) {
        // オンラインの相手：届いた本数に合わせる（飛ばすのは 'arrow' が届いたとき）
        while (S.list.length < (e.njShow || 0) && S.list.length < K.MAX) addKunai(e);
        while (S.list.length > (e.njShow || 0)) removeKunai(S.list.pop(), true);
      } else {
        if (e.njWant && !S.firing.length) {
          S.holdT += dt;
          if (S.holdT >= K.START && S.list.length < K.MAX) {
            S.nextT -= dt;
            if (S.nextT <= 0) { addKunai(e); S.nextT = K.EVERY; }
          }
        } else {
          if (S.list.length && !S.firing.length) release(e);
          S.holdT = 0; S.nextT = 0;
        }
        if (S.firing.length) {
          S.fireT -= dt;
          while (S.firing.length && S.fireT <= 0) { fireOne(e, S.firing.shift()); S.fireT += K.GAP; }
        }
      }
      place(e, S, dt);
    }
    for (const [e, A] of [[player, playerActor], [bot, botActor]] as any[]) {
      if (!e || !A || e.w.kind !== 'ninja' || !A.gun.parts.star) continue;
      e.njThrowT = Math.min(1, (e.njThrowT ?? 1) + dt);
      const t = e.njThrowT;
      A.gun.parts.star.visible = !(t > 0.04 && t < 0.2);
      A.gun.parts.rhand.rotation.y = t < 0.06 ? t / 0.06 * 0.6 : t < 0.16 ? 0.6 - (t - 0.06) / 0.1 * 1.4 : t < 0.34 ? -0.8 * (1 - (t - 0.16) / 0.18) : 0;
    }
  },
  clear() {
    clearOf(player, false); clearOf(bot, false);
    for (const k of inks) { scene.remove(k.m); (k.m.material as THREE.Material).dispose(); }
    inks.length = 0;
    if (player) player.njHeld = player.njWant = false;
  },
};
