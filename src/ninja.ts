// 忍：手裏剣（押すたびに1枚）と苦無（長押しで並べて、離すと続けて飛ばす）。残像疾風・変わり身はこのあと足していく
//   投げた手裏剣・苦無は arrows.ts（kind 'shuriken' / 'kunai'）が飛ばし、当たり・刺さりも矢と同じ仕組み
//   苦無：押し続けて START 秒たつと、EVERY 秒ごとに1本ずつ背中の後ろ上に扇の形で並ぶ（最大 MAX 本）
//     ・出る：墨のにじみから刃が抜け出す。1本ごとに音が少し高くなる。そろうと全部の刃が一瞬光って「チン」
//     ・並んだ苦無はいつも照準の先を向き、房は下へ垂れて揺れる
//     ・離すと外側から内側へ、左右交互に GAP 秒おきに飛ぶ（朱の尾）
//     ・自分の画面では、扇は画面の上のふちに沿って並ぶ（背中の後ろは見えないため）
//   オンライン：手裏剣・苦無は矢と同じ 'arrow'（k: 'shuriken' / 'kunai'）。並べている本数は様子（'s' の kn）で送る
import * as THREE from 'three';
import { C, V3, clamp, lerp, rand } from './core';
import { P } from './palette';
import { SFX } from './audio';
import { cam, scene, toon } from './render';
import { blockers } from './physics';
import { Arrows } from './arrows';
import { Particles, VM } from './effects';
import { Net, r2, vec } from './net';
import { aiHear } from './ai';
import { heardFoe } from './hud';
import { gs } from './state';
import { makeKunai, hangTassel } from './guns/kunai';
import { act, bot, botActor, player, playerActor, stats, view, onAttack, eyeOf, ray, currentSpread, facingOf } from './game';
import { afterimage } from './swordfx';
import { hooks } from './game/weapons';
import { Sword } from './sword';
import { down } from './input';

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

// ---------- 残像疾風（E） ----------
//   出だし：足元に土煙が「ドン」。自分の画面は視野が広がって集中線（camera.ts・sword.ts の speedLines）
//   走っている間：頭・胸・足の高さから白い線が3本尾を引き（約1秒で消える）、通った跡に半透明の残像が並ぶ
//     自分の画面のふちは白く揺らぎ、足音の代わりに風の音。弾も矢も体をすり抜ける（game/weapons.ts の phased）
//   終わり（時間切れ・攻撃した・もう一度押した）：ブレーキの土ぼこりが立ち、線がパッと散る
const LINE = { N: 72, LIFE: 1.0, W: 0.045, H: [0.12, 0.55, 0.9] };   // 線の点の数・残る秒・太さ（半分）・高さ（背の高さに対する割合）
type Trail = { pts: { p: THREE.Vector3; t: number }[]; geo: THREE.BufferGeometry; mesh: THREE.Mesh; fast: boolean };
const lineMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false });
function makeTrail(): Trail {
  const geo = new THREE.BufferGeometry(), n = LINE.N;
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 2 * 4), 4));
  const idx: number[] = [];
  for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  geo.setIndex(idx);
  const mesh = new THREE.Mesh(geo, lineMat); mesh.frustumCulled = false; mesh.renderOrder = 3; scene.add(mesh);
  return { pts: [], geo, mesh, fast: false };
}
let clock = 0;
const trailSets: Record<string, Trail[]> = {};   // 自分・相手ごとに使い回す（対局ごとに作り直さない）
const trailsOf = (e): Trail[] => trailSets[e === player ? 'p' : 'b'] || (trailSets[e === player ? 'p' : 'b'] = LINE.H.map(() => makeTrail()));
const _a = new V3(), _b = new V3(), _s = new V3(), _c = new V3();
// 線を作り直す：点ごとに、カメラに向いた幅を持つ帯にする。古いほど細く薄い
function drawTrail(T: Trail) {
  const pos = T.geo.attributes.position as THREE.BufferAttribute, col = T.geo.attributes.color as THREE.BufferAttribute, n = T.pts.length;
  for (let i = 0; i < n; i++) {
    const p = T.pts[i].p, k = 1 - (clock - T.pts[i].t) / LINE.LIFE;
    _a.copy(T.pts[Math.min(n - 1, i + 1)].p).sub(T.pts[Math.max(0, i - 1)].p);
    _c.copy(cam.position).sub(p);
    const near = clamp((_c.length() - 1.0) / 1.2, 0, 1);   // 自分の目の近くの線は見せない（画面いっぱいに白くならないように）
    _s.crossVectors(_a, _c).normalize().multiplyScalar(LINE.W * (0.35 + 0.65 * k));
    _b.copy(p).add(_s); pos.setXYZ(i * 2, _b.x, _b.y, _b.z);
    _b.copy(p).sub(_s); pos.setXYZ(i * 2 + 1, _b.x, _b.y, _b.z);
    const al = clamp(k, 0, 1) * 0.9 * near;
    col.setXYZW(i * 2, 1, 1, 1, al); col.setXYZW(i * 2 + 1, 1, 1, 1, al);
  }
  pos.needsUpdate = true; col.needsUpdate = true;
  T.geo.setDrawRange(0, Math.max(0, n - 1) * 6);
}
// 線の残り：消える・散る
function trailsTick(e, active: boolean, dt: number) {
  trailsOf(e).forEach((T: Trail, i: number) => {
    if (active) {
      const p = e.pos.clone().setY(e.pos.y + e.height * LINE.H[i]);
      const last = T.pts[T.pts.length - 1];
      if (last && last.p.distanceToSquared(p) > 9) T.pts.length = 0;   // 瞬間移動などで飛んだときは線をつなげない
      if (!last || last.p.distanceToSquared(p) > 0.0025) { T.pts.push({ p, t: clock }); if (T.pts.length > LINE.N) T.pts.shift(); }
      T.fast = false;
    }
    const life = LINE.LIFE / (T.fast ? 3 : 1);
    while (T.pts.length && clock - T.pts[0].t > life) T.pts.shift();
    if (T.fast) for (const q of T.pts) q.t -= dt * 2;   // 散る：残りを速く消す
    drawTrail(T);
  });
}
// 自分の画面のふちが白く揺らぐ
let edgeEl: HTMLDivElement = null, edgeK = 0;
function edgeTick(on: boolean, dt: number) {
  edgeK = on ? Math.min(1, edgeK + dt * 6) : Math.max(0, edgeK - dt * 3);
  if (!edgeEl) {
    if (!edgeK) return;
    edgeEl = document.createElement('div');
    edgeEl.style.cssText = 'position:fixed;inset:-4%;pointer-events:none;z-index:3;mix-blend-mode:screen;background:radial-gradient(ellipse at center, transparent 52%, rgba(240,244,255,.10) 66%, rgba(240,244,255,.55) 100%)';
    document.body.appendChild(edgeEl);
  }
  edgeEl.style.opacity = (edgeK * (0.75 + 0.25 * Math.sin(clock * 13))).toFixed(3);
  edgeEl.style.transform = `scale(${(1 + 0.025 * Math.sin(clock * 9)).toFixed(4)}) rotate(${(Math.sin(clock * 5) * 0.6).toFixed(2)}deg)`;
  edgeEl.style.display = edgeK > 0.01 ? '' : 'none';
}
function shippuEndFx(e) {
  Particles.dust(e.pos, 16, 1.8);
  for (const T of trailsOf(e)) {
    T.fast = true;
    for (let i = 0; i < T.pts.length; i += 5) Particles.glow(T.pts[i].p, P.shiro[2]);   // 線がパッと散る
  }
  SFX.play('shippuEnd', e === player ? null : e.pos);
}
function shippuTick(e, dt: number) {
  const on = !!act(e, 'shippu') && !e.dead;
  if (on && !e.shippuOn) e.shippuWindT = 0;
  if (!on && e.shippuOn) shippuEndFx(e);
  e.shippuOn = on;
  trailsTick(e, on, dt);
  if (!on) return;
  // 通った跡の残像（相手の駒。自分の駒は自分の画面では見えない）
  if (e === bot && botActor && (e.ghostT = (e.ghostT || 0) - dt) <= 0 && Math.hypot(e.vel.x, e.vel.z) > 3) { e.ghostT = 0.06; afterimage(botActor.hitMesh); }
  // 足音の代わりに風の音
  if ((e.shippuWindT = (e.shippuWindT || 0) - dt) <= 0) { e.shippuWindT = 0.3; SFX.play('shippuWind', e === player ? null : e.pos); }
}

// ---------- 変わり身（Q） ----------
//   構える：15 秒の間、足元に薄い煙がまとわりつく（相手にも分かる）
//   当たった：その攻撃は丸太が受ける（ダメージなし。矢・手裏剣・苦無は丸太に刺さり、弾なら木くず）。「ドロン」と白い煙が弾け、
//     自分は左右前を押していればその向き、押していなければ後ろへ飛ぶ。inv 秒は何も当たらない（game/weapons.ts の phased）
//     その瞬間ほんの少し白黒スロー。自分の画面はよけた向きへ流れる。攻撃した側には丸太に当たった「コン」
//   丸太：ゴロンと倒れ、3 秒で煙になって消える
//   オンライン：当てた側が見つけて 'kw' を送り、当てられた側がよける（矢は両方の画面で当たるので、先に気づいた方でよける）
const puffTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.5, 'rgba(255,255,255,0.55)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
})();
const puffs: { s: THREE.Sprite; v: THREE.Vector3; t: number; life: number; s0: number; s1: number; op: number }[] = [];
function puff(pos: THREE.Vector3, o: { v?: THREE.Vector3; life?: number; s0?: number; s1?: number; op?: number; color?: number } = {}) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, color: o.color ?? 0xf4f2ee, transparent: true, depthWrite: false, fog: true }));
  s.position.copy(pos); scene.add(s);
  puffs.push({ s, v: o.v || new V3(), t: 0, life: o.life ?? 0.8, s0: o.s0 ?? 0.3, s1: o.s1 ?? 1, op: o.op ?? 0.8 });
  if (puffs.length > 140) { const q = puffs.shift(); scene.remove(q.s); q.s.material.dispose(); }
}
function puffTick(dt: number) {
  for (let i = puffs.length - 1; i >= 0; i--) {
    const q = puffs[i]; q.t += dt;
    const k = q.t / q.life;
    q.s.position.addScaledVector(q.v, dt); q.v.multiplyScalar(Math.max(0, 1 - 3 * dt)); q.v.y += 0.4 * dt;
    q.s.scale.setScalar(lerp(q.s0, q.s1, 1 - (1 - k) * (1 - k)));
    q.s.material.opacity = q.op * Math.min(1, (1 - k) * 2) * Math.min(1, q.t * 12);
    if (k >= 1) { scene.remove(q.s); q.s.material.dispose(); puffs.splice(i, 1); }
  }
}
// 「ドロン」：白い煙が丸く弾ける
function doron(pos: THREE.Vector3, h: number) {
  for (let i = 0; i < 18; i++) {
    const a = Math.random() * Math.PI * 2, up = Math.random();
    const v = new V3(Math.cos(a), up * 0.8, Math.sin(a)).multiplyScalar(rand(2, 4.5));
    puff(pos.clone().add(new V3(0, h * (0.2 + 0.7 * Math.random()), 0)), { v, life: rand(0.6, 1.0), s0: 0.4, s1: rand(1.1, 1.7), op: 0.9 });
  }
}
// 丸太：樹皮の筒・明るい切り口と年輪・小枝を切った跡。根元が原点（倒すときの回転の中心）
const logMats = { bark: toon({ color: C(P.kiji[0]), flatShading: true, roughness: 0.95 }), cut: toon({ color: C(P.kiji[2]), flatShading: true, roughness: 0.9 }), ring: toon({ color: C(P.kiji[1]), flatShading: true }) };
function makeLog(len: number) {
  const g = new THREE.Group(), r = 0.15;
  const geo = new THREE.CylinderGeometry(r * 0.94, r, len, 9, 3);
  const pa = geo.attributes.position;   // 樹皮のでこぼこ（縦の筋）
  for (let i = 0; i < pa.count; i++) { const x = pa.getX(i), z = pa.getZ(i), k = 1 + Math.sin(Math.atan2(z, x) * 5 + pa.getY(i) * 3) * 0.06; pa.setX(i, x * k); pa.setZ(i, z * k); }
  geo.computeVertexNormals();
  const body = new THREE.Mesh(geo, logMats.bark); body.position.y = len / 2; g.add(body);
  for (const y of [0.005, len - 0.005]) {   // 切り口と年輪
    const c = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.86, r * 0.86, 0.02, 9), logMats.cut); c.position.y = y; g.add(c);
    const rr = new THREE.Mesh(new THREE.TorusGeometry(r * 0.45, 0.012, 3, 10), logMats.ring); rr.rotation.x = Math.PI / 2; rr.position.y = y + (y > 0.1 ? 0.012 : -0.012); g.add(rr);
  }
  for (const [y, a] of [[len * 0.35, 0.6], [len * 0.7, 2.8]]) {   // 小枝を切った跡
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.12, 6), logMats.bark);
    b.position.set(Math.cos(a) * r, y, Math.sin(a) * r); b.rotation.set(0, -a, Math.PI / 2 - 0.4); g.add(b);
  }
  g.traverse((o: any) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}
const logs: { g: THREE.Group; t: number; axis: THREE.Vector3; fell: boolean }[] = [];
function spawnLog(e, from: THREE.Vector3) {
  const g = makeLog(e.height * 0.95);
  g.position.copy(e.pos); scene.add(g);
  // 倒れる向き：当てた相手から見て奥（押された向き）へ、少しばらつかせる
  const away = e.pos.clone().sub(from).setY(0); if (away.lengthSq() < 1e-4) away.set(1, 0, 0);
  away.normalize().applyAxisAngle(UP, rand(-0.7, 0.7));
  const axis = new V3(0, 1, 0).cross(away).normalize();
  logs.push({ g, t: 0, axis, fell: false });
  return g;
}
function logsTick(dt: number) {
  for (let i = logs.length - 1; i >= 0; i--) {
    const L = logs[i]; L.t += dt;
    // 0.15 秒たってから倒れ始め、0.45 秒で横になる（重力っぽく加速）。倒れきったら少し跳ねる
    const k = clamp((L.t - 0.15) / 0.45, 0, 1), fall = k * k;
    const bounce = L.t > 0.6 ? Math.abs(Math.sin((L.t - 0.6) * 14)) * Math.exp(-(L.t - 0.6) * 9) * 0.12 : 0;
    L.g.quaternion.setFromAxisAngle(L.axis, (Math.PI / 2 - 0.06) * fall - bounce);
    if (k >= 1 && !L.fell) { L.fell = true; Particles.dust(L.g.position, 8, 1.1); SFX.play('kon', L.g.position); }
    if (L.t > 3) {
      // 煙になって消える
      const c = L.g.position.clone().add(new V3(0, 0.2, 0));
      for (let j = 0; j < 8; j++) puff(c.clone().add(new V3(rand(-0.6, 0.6), 0, rand(-0.6, 0.6))), { v: new V3(rand(-0.5, 0.5), rand(0.5, 1.2), rand(-0.5, 0.5)), life: 0.8, s0: 0.3, s1: 1.1 });
      scene.remove(L.g); logs.splice(i, 1);
    }
  }
}
// よける向き：自分は押しているキー（左右前。後ろだけ・何も押していなければ後ろ）。CPU は当てた相手から離れる向きか横
function dodgeDir(e, from: THREE.Vector3) {
  if (e === player) {
    const fwd = new V3(-Math.sin(view.yaw), 0, -Math.cos(view.yaw)), right = new V3(Math.cos(view.yaw), 0, -Math.sin(view.yaw));
    const w = new V3();
    if (down('forward')) w.add(fwd);
    if (down('right')) w.add(right);
    if (down('left')) w.sub(right);
    return w.lengthSq() > 0.01 ? w.normalize() : fwd.negate();
  }
  const away = e.pos.clone().sub(from).setY(0).normalize(), side = new V3(-away.z, 0, away.x).multiplyScalar(Math.random() < 0.5 ? 1 : -1);
  return Math.random() < 0.4 ? away : side.addScaledVector(away, 0.3).normalize();
}
function dodge(e, sk) {
  const dir = dodgeDir(e, e.kwFrom || e.pos);
  e.lungeDir = dir; e.lungeT = 0.18; e.lungeV = sk.dist / 0.18;
  e.vy = Math.max(e.vy, 3.5); e.onGround = false; e.airT = 1; e.jumped = true;
  if (e === player) {
    const right = new V3(Math.cos(view.yaw), 0, -Math.sin(view.yaw)), side = dir.dot(right);
    view.swRoll = (view.swRoll || 0) - side * 0.16; view.swFov = (view.swFov || 0) + 12; view.shake = Math.max(view.shake, 0.2);
    e.njDodgeT = 0.3;   // 集中線（sword.ts）
  }
}
// 当たった（skillDamageMul から）：丸太と入れ替わる
function kawarimiHit(e, from: THREE.Vector3, kw) {
  kw.t = 0;
  e.nInv = kw.sk.inv;
  if (e.kwLockT > 0) return;   // 同じ入れ替わりを二重に数えない（オンラインで両方の画面から届いたとき）
  e.kwLockT = 1; e.kwFrom = from.clone();
  const log = spawnLog(e, from);
  e.kwLog = log;   // この直後に当たる矢は丸太に刺さる（arrows.ts）。次のフレームで外す
  doron(e.pos, e.height);
  SFX.play('doron', e === player ? null : e.pos);
  SFX.play('kon', log.position.clone().setY(e.pos.y + e.height * 0.6));   // 攻撃した側にも丸太に当たった音
  Particles.wood(e.pos.clone().setY(e.pos.y + e.height * 0.6), e.pos.clone().sub(from).setY(0).normalize(), 10);
  Sword.quickSlow(0.15);
  const local = e === player || (e === bot && !Net.on);
  if (local) dodge(e, kw.sk);
  else if (Net.on && e === bot) Net.send({ t: 'kw', f: vec(from) });   // 相手の画面でよけてもらう
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
    hooks.kawarimi = kawarimiHit;   // 変わり身（読み込みの順番に左右されないよう、ここで入れる）
    inkTick(dt);
    clock += dt;
    for (const e of [player, bot]) if (e) {
      shippuTick(e, dt);
      e.nInv = Math.max(0, (e.nInv || 0) - dt); e.kwLockT = Math.max(0, (e.kwLockT || 0) - dt); e.njDodgeT = Math.max(0, (e.njDodgeT || 0) - dt);
      e.kwLog = null;
      // 変わり身を構えている間：足元に薄い煙
      if (act(e, 'kawarimi') && !e.dead && (e.kwSmokeT = (e.kwSmokeT || 0) - dt) <= 0) {
        e.kwSmokeT = 0.09;
        const a = Math.random() * Math.PI * 2, r = e.radius * rand(0.6, 1.3);
        puff(e.pos.clone().add(new V3(Math.cos(a) * r, 0.08, Math.sin(a) * r)), { v: new V3(Math.cos(a) * 0.3, rand(0.2, 0.5), Math.sin(a) * 0.3), life: rand(0.7, 1.1), s0: 0.2, s1: 0.6, op: 0.45 });
      }
    }
    puffTick(dt); logsTick(dt);
    edgeTick(!!player && !!player.shippuOn, dt);
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
  // 変わり身を構えた：足元から煙が立つ
  kawarimiArm(e) {
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; puff(e.pos.clone().add(new V3(Math.cos(a) * 0.4, 0.1, Math.sin(a) * 0.4)), { v: new V3(Math.cos(a), 0.6, Math.sin(a)), life: 0.7, s0: 0.25, s1: 0.8, op: 0.6 }); }
    SFX.play('skCloak', e === player ? null : e.pos);
  },
  // オンライン：相手がこちらの変わり身に当てた
  remoteKawarimi(from: THREE.Vector3) {
    const kw = player && player.slots.find(s => s.sk.type === 'kawarimi');
    if (!kw || player.dead || player.kwLockT > 0) return;
    kw.t = Math.max(kw.t, 0.01);   // こちらで気づく前に届いた
    kawarimiHit(player, from, kw);
  },
  // 残像疾風が始まった：足元に土煙と音
  shippuStart(e) {
    Particles.dust(e.pos, 22, 2.4);
    SFX.play('shippu', e === player ? null : e.pos);
    if (e === player) view.shake = Math.max(view.shake, 0.18);
  },
  clear() {
    for (const e of [player, bot]) if (e) e.shippuOn = false;
    for (const set of Object.values(trailSets)) for (const T of set) { T.pts.length = 0; drawTrail(T); }
    edgeK = 0; if (edgeEl) edgeEl.style.display = 'none';
    for (const q of puffs) { scene.remove(q.s); q.s.material.dispose(); } puffs.length = 0;
    for (const L of logs) scene.remove(L.g); logs.length = 0;
    clearOf(player, false); clearOf(bot, false);
    for (const k of inks) { scene.remove(k.m); (k.m.material as THREE.Material).dispose(); }
    inks.length = 0;
    if (player) player.njHeld = player.njWant = false;
  },
};
