// 刀（侍）：振る動き・当たり判定・飛ぶ斬撃・刀で斬ったときの白黒スロー（見た目の演出は swordfx.ts）
//
//   連打　：1段目（一閃）だけをくり返す（最短 約0.5秒ごと）。1段目は刀が外れると斬撃が飛ぶ（中距離用）
//   長押し：1 一閃 → 2 袈裟切り → 3 返し袈裟 → 4 突き。2〜4段目は 0.5 秒溜めてから踏み込む。途中で離すと今の段で止まる。4段目のあとは離すまで止まる
//   刀が直接当たる（斬撃は除く）と、画面が白黒になって一瞬スローになる（ふちが暗く絞られる）
//   振っている間は、近くの相手の方へほんの少しだけ向きが寄る（弱いオートエイム）
//     オンラインは2人とも同じだけ遅くなる（当てた側が 'slow' を送る）ので、CPU 戦と同じ動き
//   とどめを刀で刺すと：「斬」の筆文字 → スローが明けたら血振りして納刀 →「チン」で相手の駒が斬った線で真っ二つ
//   試合の始まり：鞘から抜刀して鍔鳴り / 止まっている間は刀がゆっくり呼吸するように揺れる
//
// 動きは「刃の向き（手元→刃先）」の通り道で書く。座標は一人称のカメラから見た位置（右 +x・上 +y・前 -z、m）
//   刃の向きの通り道をなめらかにつなぎ、刃（刃先の側）は進む向きへ向ける
import * as THREE from 'three';
import { gs } from './state';
import { SKILLS, V3, clamp, damp, lerp } from './core';
import { P } from './palette';
import { SFX } from './audio';
import { cam, renderer, scene } from './render';
import { Particles, VM } from './effects';
import { act, bot, botActor, damageBot, endGuard, eyeOf, hasLOS, onAttack, player, playerActor, ray, skillDamageMul, view } from './game';
import { aiHear, damagePlayer } from './ai';
import { Net, vec } from './net';
import { blockers } from './physics';
import { KATANA } from './guns/katana';
import { Clones } from './clones';
import { Strokes, afterimage, afterimageTick, bladeGlint, speedLines, comboStage, focusLines, fxClear, fxFrame, makeStrokes, splitActor, splitShow, strokeTick, strokesClear, wallHit, zan } from './swordfx';

type Key = { p: number[]; d: number[] };
type Stage = {
  name: string; wind: number; cut: number; rec: number; path: Key[]; dmg: number; hitAt: number;
  range?: number; cone?: number; edge?: number[]; lunge?: [number, number]; wave?: number; fx: number;   // fx：斬った線の傾き（度）
  kick: [number, number, number];   // 振った瞬間のカメラ：[傾き, 横へ振れる, 視野を狭める（度）]
};
// 段ごとの動き（秒）：wind 振りかぶり / cut 振り抜き / rec 構えに戻る。hitAt：振り抜きのどこで当たるか / wave：斬撃が飛ぶ所
//   刀が当たった振りでは斬撃は出ない（近くで連打すると刀＋斬撃の2回分当たって強すぎるため）
// lunge：[速さ, 秒] 踏み込み（溜めの終わりの lunge[1] 秒で進む） / edge：刃の向きを決めておく（突き）
export const STAGES: Stage[] = [
  // 一閃：真上から真下へ。連打はこれだけをくり返す
  { name: '一閃', wind: 0.09, cut: 0.1, rec: 0.2, dmg: 20, hitAt: 0.5, wave: 0.55, fx: -90, kick: [0, 0, 3],
    path: [{ p: [0.12, 0.05, -0.3], d: [0.05, 1, 0.2] }, { p: [0.06, -0.05, -0.5], d: [0, 0.3, -0.95] }, { p: [0.02, -0.2, -0.55], d: [0, -0.4, -0.9] }, { p: [0, -0.38, -0.45], d: [0, -0.85, -0.5] }] },
  // 袈裟切り：右上から左下へ。溜めてから約3m踏み込む
  { name: '袈裟切り', wind: 0.5, cut: 0.1, rec: 0.2, dmg: 30, hitAt: 0.5, lunge: [12, 0.25], fx: -38, kick: [0.06, 0.015, 2],
    path: [{ p: [0.26, 0.02, -0.36], d: [0.45, 0.85, 0.25] }, { p: [0.12, -0.08, -0.5], d: [0.05, 0.35, -0.95] }, { p: [-0.05, -0.2, -0.52], d: [-0.6, -0.25, -0.75] }, { p: [-0.2, -0.36, -0.42], d: [-0.7, -0.65, -0.25] }] },
  // 返し袈裟：左上から右下へ。溜めてから約3m踏み込む
  { name: '返し袈裟', wind: 0.2, cut: 0.1, rec: 0.2, dmg: 30, hitAt: 0.5, lunge: [12, 0.25], fx: 38, kick: [-0.06, -0.015, 2],
    path: [{ p: [-0.26, 0.02, -0.36], d: [-0.45, 0.85, 0.25] }, { p: [-0.12, -0.08, -0.5], d: [-0.05, 0.35, -0.95] }, { p: [0.05, -0.2, -0.52], d: [0.6, -0.25, -0.75] }, { p: [0.2, -0.36, -0.42], d: [0.7, -0.65, -0.25] }] },
  // 突き：長く溜めて（刃先が光る）約3m踏み込む
  { name: '突き', wind: 0.8, cut: 0.07, rec: 0.32, dmg: 40, hitAt: 0.6, range: 3.5, cone: 0.85, lunge: [12, 0.25], edge: [1, -0.15, 0], fx: 0, kick: [0, 0, 9],
    path: [{ p: [0.29, -0.23, -0.1], d: [-0.32, 0.22, -0.92] }, { p: [0.07, -0.09, -0.6], d: [-0.3, 0.2, -0.93] }] },
];
const LUNGE_GAP = 0.7;   // 踏み込みで相手に近づける限り（体の間のすき間 m）
const CHAIN = 0.05;   // 振り抜いてから次の段へ続けるまで
const TAP = 0.8;      // 一閃を振り始めてから、次の一閃を振れるまで（連打は最短 0.8 秒ごと。長押しで2段目へ続くのは別）
const SLOW = { scale: 0.25, hold: 0.35, ease: 0.15 };   // スロー：速さの倍率・続く秒・戻る秒

// ---------- 刀の向きの計算 ----------
const n3 = (a: number[]) => new V3(a[0], a[1], a[2]).normalize();
const _m = new THREE.Matrix4();
// 刃の向き d・刃先の向き e から、刀の向き（刀は -z が刃先、-y が刃の側）
function orient(d: THREE.Vector3, e: THREE.Vector3, out = new THREE.Quaternion()) {
  const z = d.clone().negate();
  let y = e.clone().addScaledVector(d, -e.dot(d));
  if (y.lengthSq() < 1e-6) y = new V3(0, -1, 0).addScaledVector(d, d.y);
  y.normalize().negate();
  const x = new V3().crossVectors(y, z);
  return out.setFromRotationMatrix(_m.makeBasis(x, y, z));
}
type Pose = { p: THREE.Vector3; q: THREE.Quaternion };
const pose = (p: number[], d: number[], e: number[]): Pose => ({ p: new V3(p[0], p[1], p[2]), q: orient(n3(d), n3(e)) });
// 構え（中段）：手は右下（画面の外）、刃先は照準の右上へ
const REST = pose([0.27, -0.24, -0.42], [-0.28, 0.72, -0.62], [-0.8, -0.35, -0.45]);
// 守りの構え（右クリック）：刀を体の前に横たえ、刃を前に向けて受ける
const GUARD = pose([0.16, -0.1, -0.4], [-1, 0.3, -0.2], [0, 0.2, -1]);
// 鞘に納めた形：手は左の腰（画面の外）、刃は後ろ向き・刃先は上
const SHEATH = pose([-0.14, -0.48, -0.3], [-0.15, -0.1, 1], [0, 1, 0]);
// 抜刀（試合の始まり）・納刀（とどめのあと）の動き：[秒, 形]
const DRAW: [number, Pose][] = [
  [0, SHEATH],
  [0.28, pose([0.06, -0.27, -0.55], [-0.6, 0, 0.8], [0, 1, 0])],          // 鞘から抜ける
  [0.44, pose([0.3, -0.08, -0.45], [0.6, 0.6, -0.5], [-0.5, -0.3, -0.8])], // 振り上げて
  [0.62, REST],
];
const SHEATHE: [number, Pose | null][] = [
  [0, null],                                                                 // 今の形から
  [0.18, pose([0.33, -0.3, -0.45], [0.5, -0.55, -0.65], [0.6, -0.6, 0.2])], // 血振り
  [0.42, pose([-0.02, -0.3, -0.5], [-0.65, -0.05, 0.75], [0, 1, 0])],       // 鞘口へ
  [0.75, SHEATH],                                                            // 納める（チン）
];
const DRAW_OUT = 0.28, CHIN = 0.75;
const vslerp = (a: THREE.Vector3, b: THREE.Vector3, t: number) => a.clone().applyQuaternion(new THREE.Quaternion().slerp(new THREE.Quaternion().setFromUnitVectors(a, b), t));
// 通り道の s（0〜1）での手の位置と刃の向き
function along(st: Stage, s: number) {
  const k = st.path.length - 1, f = clamp(s, 0, 1) * k, i = Math.min(k - 1, Math.floor(f)), t = f - i;
  const A = st.path[i], B = st.path[i + 1];
  const p = new V3(lerp(A.p[0], B.p[0], t), lerp(A.p[1], B.p[1], t), lerp(A.p[2], B.p[2], t));
  return { p, d: vslerp(n3(A.d), n3(B.d), t) };
}
function cutPose(st: Stage, s: number): Pose {
  const a = along(st, s);
  let e: THREE.Vector3;
  if (st.edge) e = n3(st.edge);
  else e = along(st, Math.min(1, s + 0.02)).d.sub(along(st, Math.max(0, s - 0.02)).d);   // 刃は進む向きへ
  return { p: a.p, q: orient(a.d, e) };
}
const ease = (k: number) => k * k * (3 - 2 * k);
const easeOut = (k: number) => 1 - (1 - k) * (1 - k);
const mix = (a: Pose, b: Pose, k: number): Pose => ({ p: a.p.clone().lerp(b.p, k), q: a.q.clone().slerp(b.q, k) });
// 決まった形を順にたどる（抜刀・納刀）
function seq(keys: [number, Pose | null][], t: number, from?: Pose): Pose {
  const P0 = (i: number) => keys[i][1] || from;
  if (t <= keys[0][0]) return P0(0);
  for (let i = 1; i < keys.length; i++) if (t <= keys[i][0]) return mix(P0(i - 1), P0(i), ease((t - keys[i - 1][0]) / (keys[i][0] - keys[i - 1][0])));
  return P0(keys.length - 1);
}
// 振っている途中の t 秒の刀の位置と向き
function poseAt(sw, t: number): Pose {
  const st = STAGES[sw.stage - 1];
  // 振りかぶり：長い溜めは 0.15 秒で構えきって、残りは小さく震えながら止まる
  if (t < st.wind) {
    const P0 = mix(sw.from, cutPose(st, 0), easeOut(clamp(t / Math.min(st.wind, 0.15), 0, 1)));
    if (st.wind > 0.2 && t > 0.15) P0.p.add(new V3(Math.sin(t * 73) * 0.002, Math.sin(t * 91) * 0.002, 0));
    return P0;
  }
  if (t < st.wind + st.cut) return cutPose(st, ease((t - st.wind) / st.cut));
  return mix(cutPose(st, 1), REST, ease(clamp((t - st.wind - st.cut) / st.rec, 0, 1)));
}
// 構えの呼吸：止まっている間、ゆっくり上下して少し傾く
function restPose(): Pose {
  const T = performance.now() / 1000;
  const p = REST.p.clone().add(new V3(Math.sin(T * 0.85) * 0.004, Math.sin(T * 1.7) * 0.008, 0));
  const q = REST.q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new V3(1, 0, 0), Math.sin(T * 1.7 - 0.6) * 0.025));
  return { p, q };
}
const poseOf = e => {
  const base = e.sw && e.sw.stage ? poseAt(e.sw, e.sw.t) : restPose();
  return e.swGuardK > 0.001 ? mix(base, GUARD, ease(Math.min(1, e.swGuardK))) : base;   // 守りの構えへ移る
};
const isSword = e => e && e.w && e.w.kind === 'sword';
const bladeLen = KATANA.tip / 1000;
let serial = 0;
// 振り抜いている間（軌跡を描く間）。thrust：突きも描くか（駒が持つ刀は突きの軌跡なし）
const cutWin = (sw, thrust = false): [number, number] | null => {
  const st = sw && sw.stage ? STAGES[sw.stage - 1] : null;
  return st && (!st.edge || thrust) ? [st.wind, st.wind + st.cut] : null;
};
// 突きの筆跡：刃の向きに沿ってまっすぐ伸びる一本の線（刃先より先まで伸ばす）。振りの軌跡と同じ3枚重ね
//   t が進むほど先へ伸び（古い方＝手元の側が薄い）、f（帯の幅の位置）は刃の横へのずれにする
function thrustSample(sw, len: number) {
  const st = STAGES[sw.stage - 1], t0 = st.wind, t1 = st.wind + st.cut, q = poseAt(sw, Math.min(sw.t, t1));
  const d = new V3(0, 0, -1).applyQuaternion(q.q), side = new V3().crossVectors(d, new V3(0, 0, -1)).normalize();
  return (t: number, f: number) => q.p.clone().addScaledVector(d, len * lerp(0.1, 2.2, clamp((t - t0) / (t1 - t0), 0, 1))).addScaledVector(side, (f - 0.78) * 0.55 * len);
}
let vmStrokes: Strokes = null, actorStrokes: Strokes = null, vmRing: THREE.Mesh = null;

// ---------- 飛ぶ斬撃（白い縦一線） ----------
// 縦に細長い、両端のとがった白い線（高さ 2・幅 0.14。斬撃の向きは縦 = y）
const waveGeo = (() => {
  const sh = new THREE.Shape();
  sh.moveTo(0, -1); sh.quadraticCurveTo(0.14, 0, 0, 1); sh.quadraticCurveTo(-0.14, 0, 0, -1);
  return new THREE.ShapeGeometry(sh, 10);
})();
const WAVE_ARCS = [{ z: 0, s: 1, a: 0.95, c: 0xffffff }];
const waves: any[] = [];
function fireWave(owner, target, pos: THREE.Vector3, dir: THREE.Vector3, roll: number) {
  const w = owner.w, g = new THREE.Group(), mats = [];
  for (const A of WAVE_ARCS) {
    const m = new THREE.MeshBasicMaterial({ color: A.c, transparent: true, opacity: A.a, depthWrite: false, side: THREE.DoubleSide, fog: false });
    const mesh = new THREE.Mesh(waveGeo, m); mesh.position.z = A.z; mesh.scale.setScalar(A.s);
    g.add(mesh); mats.push([m, A.a]);
  }
  g.position.copy(pos);
  g.quaternion.setFromUnitVectors(new V3(0, 0, -1), dir);
  g.rotateZ(roll);
  g.scale.setScalar(0.85);
  scene.add(g);
  waves.push({ owner, target, g, mats, pos: pos.clone(), dir: dir.clone(), speed: w.waveSpeed, range: w.waveRange, dmg: w.waveDmg, r: w.waveR, went: 0 });
}
function updateWaves(dt: number) {
  for (let i = waves.length - 1; i >= 0; i--) {
    const W = waves[i], step = W.speed * dt, prev = W.pos.clone();
    W.pos.addScaledVector(W.dir, step); W.went += step;
    ray.set(prev, W.dir); ray.far = step;
    const wall = ray.intersectObjects(blockers, true)[0];
    const T = W.target;
    let hit = null;
    if (!T.dead) for (let k = 0; k <= 4; k++) {
      const q = prev.clone().addScaledVector(W.dir, step * k / 4);
      if (wall && prev.distanceTo(q) > wall.distance) break;
      if (Math.hypot(q.x - T.pos.x, q.z - T.pos.z) < T.radius + W.r && q.y > T.pos.y - W.r && q.y < T.pos.y + T.height + W.r * 0.5) { hit = q; break; }
    }
    const done = () => { scene.remove(W.g); W.mats.forEach(([m]) => m.dispose()); waves.splice(i, 1); };
    // 相手の分身に当たったら消す（斬撃も消える）
    const ci = Clones.pointHit(W.pos, W.r, T);
    if (ci >= 0) { Clones.pop(T, ci, W.owner === player); done(); continue; }
    if (hit) {
      Particles.wood(hit, W.dir.clone().negate(), 8);
      SFX.play('waveHit', hit);
      // 当てた側が決める（オンラインで相手の斬撃は見た目だけ）
      if (W.owner === player) damageBot({ dmg: W.dmg * skillDamageMul(bot, player.pos), head: false, point: hit });
      else if (!Net.on) damagePlayer(W.dmg * skillDamageMul(player, W.owner.pos), W.owner.pos);
      done(); continue;
    }
    if (wall) {
      const nrm = wall.face ? wall.face.normal.clone().transformDirection(wall.object.matrixWorld) : W.dir.clone().negate();
      wallHit(wall.point, nrm, new V3(0, 1, 0).applyQuaternion(W.g.quaternion));   // 十字の火花と斬り傷（斬撃の向きに）
      SFX.play('waveHit', wall.point);
      done(); continue;
    }
    if (W.went > W.range) { done(); continue; }
    W.g.position.copy(W.pos);
    W.g.scale.setScalar(0.85 + W.went * 0.03);
    const fade = clamp((W.range - W.went) / 5, 0, 1);
    W.mats.forEach(([m, a]) => { m.opacity = a * fade; });
  }
}

// ---------- 白黒スローと斬った線 ----------
let slowT = 0, lastFx = '', speed = 1;
let fxEl: HTMLDivElement = null, fxLine: HTMLDivElement = null, lineT = 0;
function ensureFx() {
  if (fxEl) return;
  fxEl = document.createElement('div');
  fxEl.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:7;overflow:hidden';
  fxLine = document.createElement('div');
  const shu = '#' + P.shu[1].toString(16);
  fxLine.style.cssText = `position:absolute;left:50%;top:50%;width:140vmax;height:6px;margin:-3px 0 0 -70vmax;opacity:0;border-radius:3px;
    background:linear-gradient(90deg,transparent,${shu} 18%,#fff 50%,${shu} 82%,transparent);box-shadow:0 0 18px ${shu}`;
  fxEl.appendChild(fxLine);
  document.body.appendChild(fxEl);
}
// 刀が当たった：白黒スローを始める（stage：斬った線の傾き用）
function slow(stage: number) {
  slowT = SLOW.hold + SLOW.ease;
  ensureFx();
  lineT = 0.45;
  fxLine.dataset.r = String(STAGES[stage - 1]?.fx ?? -30);
  SFX.play('slash');
}
// 毎フレーム（本当の時間 rdt）：ゲームの速さの倍率を返す
function slowTick(rdt: number) {
  slowT = Math.max(0, slowT - rdt);
  const k = slowT <= 0 ? 0 : Math.min(1, slowT / SLOW.ease);
  const f = k > 0.01 ? `grayscale(${k.toFixed(2)}) contrast(${(1 + 0.3 * k).toFixed(2)})` : '';
  if (f !== lastFx) { renderer.domElement.style.filter = f; lastFx = f; SFX.muffle(k); }
  focusLines(k);
  if (fxLine) {
    lineT = Math.max(0, lineT - rdt);
    const a = lineT / 0.45, grow = Math.min(1, (0.45 - lineT) / 0.06);
    fxLine.style.opacity = lineT > 0 ? Math.min(1, a * 2).toFixed(2) : '0';
    fxLine.style.transform = `rotate(${fxLine.dataset.r}deg) scaleX(${grow.toFixed(2)}) scaleY(${(0.4 + a).toFixed(2)})`;
  }
  speed = lerp(1, SLOW.scale, k);
  return speed;
}

// ---------- とどめ：「斬」→ 血振りして納刀 →「チン」で真っ二つ ----------
// phase：wait（スローが明けて相手が倒れるのを待つ）→ sheathe（納刀）→ done
let fin: any = null, lastCut: any = null;
function finishStart(cut) { fin = { phase: 'wait', t: 0, cut, from: null, chin: false }; zan(); gs.swordFinish = true; }
function finishFrame(rdt: number) {
  if (!fin) return;
  fin.t += rdt;
  if (fin.phase === 'wait') {
    if (slowT <= 0 && bot.dead) { fin.phase = 'sheathe'; fin.t = 0; fin.from = { p: VM.pist.g.position.clone(), q: VM.pist.g.quaternion.clone() }; }
    else if (fin.t > 3) fin = null;   // 倒れなかった（オンラインで回復が間に合ったなど）
  } else if (fin.phase === 'sheathe' && fin.t >= CHIN && !fin.chin) {
    fin.chin = true; fin.phase = 'done';
    SFX.play('chin');
    splitActor(botActor, fin.cut.point, fin.cut.n, fin.cut.slide, bot.pos.y);
  }
}
// 斬った線が倒れる前の駒を立たせておく（チンで崩れる）。真っ二つのあとは下の半分が立ったまま
function finishHold() {
  if (!fin || !botActor.dead) return;
  botActor.dead.a = 0; botActor.dead.v = 0; botActor.body.rotation.set(0, 0, 0);
}
// 画面の斬った線（fx 度）→ ワールドの斬った面
function cutPlane(point: THREE.Vector3, fx: number) {
  const a = fx * Math.PI / 180;
  const right = new V3(1, 0, 0).applyQuaternion(cam.quaternion), up = new V3(0, 1, 0).applyQuaternion(cam.quaternion), fwd = new V3(0, 0, -1).applyQuaternion(cam.quaternion);
  const L = right.multiplyScalar(Math.cos(a)).addScaledVector(up, -Math.sin(a)).normalize();
  const n = new V3().crossVectors(L, fwd).normalize();
  if (n.y < 0) n.negate();
  // 縦に斬ったとき（一閃）は横へ倒れる。斜め・横は斬った線に沿って下へずれる
  const slide = Math.abs(L.y) > 0.8 ? n.clone().add(new V3(0, -0.3, 0)).normalize() : (L.y > 0 ? L.clone().negate() : L.clone()).addScaledVector(n, 0.25).normalize();
  return { point: point.clone(), n, slide };
}

// ---------- 振る ----------
// stage 段目を振り始める（今の刀の位置から振りかぶる）
function start(e, stage: number) {
  const from = poseOf(e);
  e.sw = Object.assign(e.sw || {}, { stage, t: 0, from, hit: false, landed: false, wave: false, lunged: false, swung: false, held: true, buffer: false, serial: ++serial, assist: 0 });
  if (stage === 1) e.sw.cool = TAP;
  if (stage === 4) SFX.play('charge', e === player ? null : e.pos);
  if (e === player) {
    if (e.blinkCh != null) cancelBlink(e);   // 瞬の溜め中に振ると溜めが消える
    onAttack(e); endGuard(e);
    aiHear(e.pos, 18);
    comboStage(stage);
    if (Net.on) Net.send({ t: 'sw', s: stage });
  }
}
// 狙っている向き
function aimOf(e) {
  if (e === player) return new V3(0, 0, -1).applyQuaternion(cam.quaternion);
  return (e.aimPt ? e.aimPt.clone() : player.pos.clone().setY(player.pos.y + player.height * 0.6)).sub(eyeOf(e)).normalize();
}
// 刀が届くか（目の前の届く範囲・見えている）
function tryHit(e, st: Stage) {
  const foe = e === player ? bot : player;
  if (foe.dead) return false;
  const w = e.w, dir = aimOf(e), eye = eyeOf(e), chest = new V3(foe.pos.x, foe.pos.y + foe.height * 0.6, foe.pos.z);
  const to = chest.clone().sub(eye), d = to.length();
  const reach = !(d > (st.range || w.range) + foe.radius || to.clone().normalize().dot(dir) < (st.cone || w.cone) || !hasLOS(eye, chest, true));
  to.normalize();
  if (!reach) { const ci = Clones.meleeHit(eye, dir, st.range || w.range, st.cone || w.cone, foe, 99); if (ci >= 0) Clones.pop(foe, ci, e === player); return false; }
  // 手前に相手の分身がいたら、そちらを斬って消す
  const ci = Clones.meleeHit(eye, dir, st.range || w.range, st.cone || w.cone, foe, d);
  if (ci >= 0) { Clones.pop(foe, ci, e === player); return false; }
  const point = chest.clone().addScaledVector(to, -0.3);
  const dmg = st.dmg * skillDamageMul(foe, e.pos);
  // スローを先に送る（とどめの一撃で相手の試合が先に終わっても、相手の画面もスローになるように）
  slow(e.sw.stage);
  if (Net.on) Net.send({ t: 'slow', s: e.sw.stage });
  if (e === player) {
    // とどめ（オンラインは相手の HP から見込む。本当に倒れたかは相手からの知らせで決まる）
    const lethal = bot.hp - dmg <= 0, cut = cutPlane(point, st.fx);
    lastCut = { t: performance.now(), cut };   // 見込みが外れても、すぐあとに倒れた知らせが来たらとどめの演出にする
    if (lethal) finishStart(cut);
    damageBot({ dmg, head: false, point }); view.shake = Math.max(view.shake, 0.3);
  } else damagePlayer(dmg, e.pos);
  return true;
}
// 弱いオートエイム：振っている間（当たる前まで）、照準の近く（45°以内）で届きそうな相手の方へ、少しずつ向きが寄る
//   1回の振りで寄るのは合わせて 15° まで（寄る速さは最大 0.6 rad/秒）
const ASSIST = { cone: Math.PI / 4, max: 15 * Math.PI / 180, speed: 0.6 };
function assist(e, st: Stage, dt: number) {
  if (e !== player || bot.dead || e.sw.t > st.wind + st.cut * st.hitAt) return;
  const to = new V3(bot.pos.x, bot.pos.y + bot.height * 0.6, bot.pos.z).sub(eyeOf(e));
  if (to.length() > (st.range || e.w.range) + 2) return;
  to.normalize();
  if (to.dot(aimOf(e)) < Math.cos(ASSIST.cone)) return;
  const dy = Math.atan2(Math.sin(Math.atan2(-to.x, -to.z) - view.yaw), Math.cos(Math.atan2(-to.x, -to.z) - view.yaw)), dp = Math.asin(clamp(to.y, -1, 1)) - view.pitch;
  const k = 1 - Math.exp(-2.5 * dt), left = ASSIST.max - (e.sw.assist || 0), cap = Math.min(ASSIST.speed * dt, Math.max(0, left));
  const ay = clamp(dy * k, -cap, cap), ap = clamp(dp * k, -cap, cap);
  view.yaw += ay; view.pitch += ap; e.sw.assist = (e.sw.assist || 0) + Math.hypot(ay, ap);
}
// 振っている途中の出来事（踏み込み・斬撃・当たり）。local：この画面で決める側（自分・CPU）
function tick(e, dt: number, local: boolean) {
  const sw = e.sw;
  if (!sw || !sw.stage) return;
  const st = STAGES[sw.stage - 1], prev = sw.t;
  sw.t += dt;
  assist(e, st, dt);
  const cutT = st.wind;
  if (prev < cutT && sw.t >= cutT && !sw.swung) {
    sw.swung = true;
    SFX.play('swing', e === player ? null : e.pos, e === player);
    if (e === player) {   // 振る向きへカメラが傾いて揺れる
      view.swRoll = st.kick[0]; view.swYaw = st.kick[1]; view.swFov = -st.kick[2];
      view.shake = Math.max(view.shake, sw.stage === 4 ? 0.22 : 0.12);
    }
  }
  // 踏み込み：溜めの終わりに飛び込み、着いたところで振り抜く
  if (local && st.lunge && !sw.lunged && sw.t >= st.wind - st.lunge[1]) {
    sw.lunged = true;
    if (e.onGround) {
      const f = aimOf(e).setY(0).normalize(); e.lungeDir = f; e.lungeV = st.lunge[0]; e.lungeT = st.lunge[1];
      // 前に相手がいたら、相手の手前（LUNGE_GAP）で止まる長さにする（踏み込みで相手を飛び越して後ろへ行かないように）
      const foe = e === player ? bot : player, to = foe.pos.clone().sub(e.pos).setY(0), dist = to.length();
      if (!foe.dead && dist > 0.01 && to.normalize().dot(f) > 0.5) e.lungeT = Math.min(e.lungeT, Math.max(0, dist - e.radius - foe.radius - LUNGE_GAP) / e.lungeV);
    }
  }
  if (local && !sw.hit && sw.t >= st.wind + st.cut * st.hitAt) { sw.hit = true; sw.landed = tryHit(e, st); }
  if (local && st.wave !== undefined && !sw.wave && !sw.landed && sw.t >= st.wind + st.cut * st.wave) {
    sw.wave = true;
    const dir = aimOf(e), eye = eyeOf(e), pos = eye.clone().addScaledVector(dir, 0.9);
    const foe = e === player ? bot : player;
    // 壁に張りついていると、斬撃の出る所が壁の向こうになって貫通してしまう。目から出る所までに壁があれば、そこで壁に当たったことにする
    ray.set(eye, dir); ray.far = 1.2;
    const wall = ray.intersectObjects(blockers, true)[0];
    if (wall) {
      const nrm = wall.face ? wall.face.normal.clone().transformDirection(wall.object.matrixWorld) : dir.clone().negate();
      wallHit(wall.point, nrm, new V3(0, 1, 0)); SFX.play('waveHit', wall.point);
    } else {
      fireWave(e, foe, pos, dir, 0);
      SFX.play('wave', e === player ? null : pos);
      if (e === player && Net.on) Net.send({ t: 'wv', p: vec(pos), d: vec(dir) });
    }
  }
  if (sw.t >= st.wind + st.cut + st.rec) sw.stage = 0;
}

// 踏み込みの途中で相手のすぐ前まで来たら止まる（相手が動いて近づいてきたとき用）
function lungeGuard(e, foe) {
  if (foe.dead) return;
  const to = foe.pos.clone().sub(e.pos).setY(0), d = to.length();
  if (d >= e.radius + foe.radius + LUNGE_GAP) return;
  to.normalize();
  if (e.lungeT > 0 && to.dot(e.lungeDir) > 0) { e.lungeT = 0; e.vel.multiplyScalar(0.1); }
  // 瞬も同じ（相手を飛び越して後ろへ行かない）
  const bl = act(e, 'blink');
  if (bl && to.dot(new V3(bl.dir3.x, 0, bl.dir3.z).normalize()) > 0.3) { bl.t = 0; e.vel.multiplyScalar(0.1); e.vy *= 0.1; }
}
// 瞬の溜めをやめる（溜めは消える。待ち時間は使わない）
function cancelBlink(p) { p.blinkCh = null; SFX.play('blinkCancel'); }
let drawSnd = false, blinkK = 0, ghostT = 0;
export const Sword = {
  STAGES,
  // 自分の入力（updatePlayer から毎フレーム）：down＝左クリックを押しているか
  // right：右クリックを押しているか（守りの構え。振っていないときだけ。構えている間は振れない）
  input(p, down: boolean, right = false) {
    const sw = p.sw || (p.sw = { stage: 0, t: 0 });
    const edge = down && !sw.wasDown;
    sw.wasDown = down;
    if (!down) { sw.held = false; sw.needRelease = false; }
    const guard = right && !p.dead && !fin && !sw.stage;
    if (guard && p.blinkCh != null) cancelBlink(p);   // 瞬の溜め中に構えると溜めが消える
    if (guard && !p.swGuard) SFX.play('guardUp');
    p.swGuard = guard;
    if (p.dead || fin) return;
    if (guard) { sw.buffer = false; return; }
    // 止まっているとき：押せば一閃。前の一閃から 0.8 秒たっていなければ、たつのを待ってから振る
    if (!sw.stage) {
      if (down && !sw.needRelease) sw.buffer = true;
      if (sw.buffer && !(sw.cool > 0)) start(p, 1);
      return;
    }
    const st = STAGES[sw.stage - 1], cutEnd = st.wind + st.cut;
    if (edge && !sw.held) sw.buffer = true;   // 振っている間に押し直した（連打）
    if (sw.held && sw.t >= cutEnd + CHAIN) {
      if (sw.stage < 4) start(p, sw.stage + 1);   // 押し続けている：次の段へ
      else { sw.held = false; sw.needRelease = true; }   // 4段目のあとは離すまで止まる
      return;
    }
    if (sw.buffer && !sw.held && !(sw.cool > 0) && sw.t >= cutEnd + CHAIN) start(p, 1);   // 連打：前の一閃から 0.8 秒たったら次の一閃
  },
  // 毎フレーム（ゲームの時間）：振る動き・斬撃
  update(dt: number) {
    for (const e of [player, bot]) if (e && e.sw && e.sw.cool > 0) e.sw.cool -= dt;
    for (const e of [player, bot]) if (e) {
      e.swGuardK = damp(e.swGuardK || 0, e.swGuard ? 1 : 0, 14, dt);
      // 葉隠れ：止まって（攻撃もせずに）いる時間。動く・振る・踏み込む・瞬で 0 に戻る
      const busy = Math.hypot(e.vel.x, e.vel.z) > 0.6 || !e.onGround || (e.sw && e.sw.stage) || e.lungeT > 0 || act(e, 'blink');
      const was = Sword.hidden(e);
      e.stillT = busy ? 0 : (e.stillT || 0) + dt;
      if (!was && Sword.hidden(e)) Sword.leaves(e);   // 消える瞬間に葉が舞う
    }
    if (player) tick(player, dt, true);
    if (bot) tick(bot, dt, !Net.on);
    for (const [e, foe] of [[player, bot], [bot, player]]) if (e && foe) lungeGuard(e, foe);
    updateWaves(dt);
    finishHold();
    // 相手が瞬で飛んでいる間は、通った跡に残像を残す
    if (bot && botActor && act(bot, 'blink') && (ghostT -= dt) <= 0) { ghostT = 0.025; afterimage(botActor.hitMesh); }
    // 駒が持つ刀
    if (botActor && isSword(bot)) poseActor(botActor, bot, dt);
    if (playerActor && isSword(player)) poseActor(playerActor, player, dt);
  },
  // 毎フレーム（本当の時間）：白黒スロー（ゲームの速さの倍率を返す）
  slowTick,
  // 相手が倒れた（hud の endMatch から）：刀のとどめなら納刀と真っ二つを待つ（true ならリプレイを遅らせる）
  //   オンラインで HP の見込みが外れたとき用に、1 秒以内に刀を当てていれば、ここでとどめの演出を始める
  finishPending() {
    if (fin) return true;
    if (lastCut && performance.now() - lastCut.t < 1000 && bot && bot.dead) { finishStart(lastCut.cut); return true; }
    return false;
  },
  // 葉隠れで姿が見えなくなっているか
  hidden(e) { const s = act(e, 'hagakure'); return !!s && !e.dead && (e.stillT || 0) >= s.sk.still; },
  // 葉が舞う（葉隠れを使った・消えた瞬間）
  leaves(e) {
    const c = e.pos.clone().setY(e.pos.y + e.height * 0.5);
    for (let k = 0; k < 3; k++) Particles.shards(c.clone().add(new V3(0, (k - 1) * 0.5, 0)), [P.midori[1], P.moegi[1], P.midori[0], P.moegi[2]], 8, 0.8);
    SFX.play('leaves', e === player ? null : e.pos);
  },
  // 瞬が始まった：自分は集中線と視野、相手は残像（update で出す）
  blinkStart(e, k: number) { if (e === player) blinkK = 1; ghostT = 0; },
  // 毎フレーム（本当の時間）：納刀・真っ二つ・画面の上の演出
  frame(rdt: number) {
    blinkK = player && act(player, 'blink') ? 1 : Math.max(0, blinkK - rdt * 4);
    speedLines(blinkK);
    afterimageTick(rdt);
    finishFrame(rdt);
    splitShow(gs.state !== 'killcam');
    fxFrame(rdt, rdt * speed, !!(player && player.sw && player.sw.stage));
  },
  // 相手から：振り始めた・斬撃・刀が当たった
  remoteSwing(stage: number) { if (bot && isSword(bot)) start(bot, stage); },
  remoteWave(p: number[], d: number[]) { if (!bot) return; const pos = new V3(p[0], p[1], p[2]); fireWave(bot, player, pos, new V3(d[0], d[1], d[2]).normalize(), 0); SFX.play('wave', pos); },
  remoteSlow(stage: number) { slow(stage); },
  // 影分身の刀：持ち主と同じ振り
  poseClone(A, owner) { poseActorPose(A, owner); },
  // 一人称の刀の位置と向き（camera.ts の poseViewModel から）
  poseVM(p, rdt: number) {
    const m = VM.pist, sw = p.sw, st = sw && sw.stage ? STAGES[sw.stage - 1] : null;
    let ps: Pose;
    let run = -1, tip = 0;
    if (gs.state === 'countdown') {
      // 抜刀：カメラが降りてきたら鞘から抜く
      const u = gs.stateT - 1.35;
      ps = u < 0 ? SHEATH : seq(DRAW, u);
      if (u >= DRAW_OUT && !drawSnd) { drawSnd = true; SFX.play('draw'); }
      if (u >= DRAW_OUT && u < DRAW_OUT + 0.3) run = (u - DRAW_OUT) / 0.3;
    } else if (fin && fin.phase !== 'wait' && p === player) {
      ps = seq(SHEATHE, fin.t, fin.from);   // 納刀
    } else {
      ps = poseOf(p);
      // 刀身を走る光（振りかぶる間）・突きの溜めの光
      if (st && sw.t < st.wind) { run = sw.t / st.wind; if (sw.stage === 4) tip = Math.pow(sw.t / st.wind, 2); }
      if (st && sw.stage === 4 && sw.t >= st.wind) tip = Math.max(0, 1 - (sw.t - st.wind) / 0.12);
    }
    m.g.position.copy(ps.p); m.g.quaternion.copy(ps.q);
    if (p.blinkCh != null) tip = Math.max(tip, 0.25 + 0.6 * p.blinkCh / SKILLS.blink.chargeMax);   // 瞬を溜めている間は刃先が光る
    bladeGlint(m.g, run, tip, sw ? sw.t * 9 : performance.now() / 120);
    // 軌跡（墨の筆跡・朱のにじみ・白い芯）
    if (!vmStrokes) vmStrokes = makeStrokes(VM.root);
    const len = bladeLen * m.g.scale.x;
    const sample = st && st.edge ? thrustSample(sw, len) : (t: number, f: number) => { const q = poseAt(sw, t); return new V3(0, 0, -len * f).applyQuaternion(q.q).add(q.p); };
    strokeTick(vmStrokes, sw, cutWin(sw, true), sample, rdt * speed);
    // 突き：刃先に白い輪が広がる
    if (!vmRing) { vmRing = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })); vmRing.visible = false; VM.root.add(vmRing); }
    const k = st && sw.stage === 4 ? (sw.t - st.wind - st.cut * 0.5) / 0.16 : -1;
    vmRing.visible = k > 0 && k < 1;
    if (vmRing.visible) {
      vmRing.position.copy(new V3(0, 0, -len).applyQuaternion(ps.q).add(ps.p));
      vmRing.quaternion.copy(ps.q); vmRing.scale.setScalar(0.02 + k * 0.09);
      (vmRing.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.8;
    }
  },
  clear() {
    for (const W of waves) { scene.remove(W.g); W.mats.forEach(([m]) => m.dispose()); }
    waves.length = 0;
    slowT = 0; lineT = 0; fin = null; lastCut = null; drawSnd = false; gs.swordFinish = false;
    view.swRoll = view.swYaw = view.swFov = 0;
    if (vmStrokes) strokesClear(vmStrokes);
    if (actorStrokes) strokesClear(actorStrokes);
    fxClear();
    for (const e of [player, bot]) if (e) e.sw = null;
  },
};

// 駒が持つ刀：一人称と同じ動きを駒の向きに合わせて大きくする
const ACTOR_K = 1.6, _qy = new THREE.Quaternion().setFromAxisAngle(new V3(0, 1, 0), Math.PI);
function poseActorPose(A, e) {
  const g = A.gun.g;
  if (!g.userData.rest) g.userData.rest = g.position.clone();
  const toLocal = (ps: Pose) => ({ p: ps.p.clone().sub(REST.p).multiplyScalar(ACTOR_K).applyQuaternion(_qy).add(g.userData.rest), q: _qy.clone().multiply(ps.q) });
  const L = toLocal(poseOf(e));
  g.position.copy(L.p); g.quaternion.copy(L.q);
  return toLocal;
}
function poseActor(A, e, dt: number) {
  const g = A.gun.g, toLocal = poseActorPose(A, e);
  if (e !== bot) return;
  if (!actorStrokes) actorStrokes = makeStrokes(scene);
  g.parent.updateMatrixWorld(true);
  const pm = g.parent.matrixWorld, sc = g.scale.x, sw = e.sw;
  strokeTick(actorStrokes, sw, cutWin(sw), (t, f) => { const l = toLocal(poseAt(sw, t)); return new V3(0, 0, -bladeLen * f * sc).applyQuaternion(l.q).add(l.p).applyMatrix4(pm); }, dt);
}
