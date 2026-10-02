// 刀の演出（sword.ts から呼ぶ）
//   軌跡：墨の筆跡（残る）＋朱のにじみ＋白い芯 / 刀身を走る光・突きの溜めの光 / 斬撃が壁に残す十字の火花と斬り傷
//   白黒スロー中の集中線 / とどめの「斬」の筆文字 / 段数の筆文字（一・二・三・四）/ 駒が斬った線で真っ二つ
import * as THREE from 'three';
import { P, css } from './palette';
import { renderer, scene, starTex } from './render';
import { Particles } from './effects';

const rand = (a: number, b: number) => a + Math.random() * (b - a);

// ================= 軌跡 =================
// 墨の筆の跡（かすれ）：横（帯の幅）は筋ごとの濃さ、縦（進む向き）は筋ごとに始まりと終わりがかすれる
const brushTex = (() => {
  const W = 64, H = 256, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), img = g.createImageData(W, H);
  for (let x = 0; x < W; x++) {
    const edge = Math.min(x, W - 1 - x) / (W / 2);   // 帯の縁ほど薄く・かすれる
    const base = (Math.random() < 0.18 ? rand(0.15, 0.4) : rand(0.7, 1)) * Math.min(1, edge * 2.5);
    const s0 = rand(0, 0.12 + (1 - edge) * 0.25), s1 = 1 - rand(0, 0.2 + (1 - edge) * 0.35);
    for (let y = 0; y < H; y++) {
      const v = y / H;
      let a = v < s0 || v > s1 ? 0 : base;
      if (Math.random() < 0.04 * (1 - edge)) a *= 0.3;   // ところどころ筆がかすれる
      const i = (y * W + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = a * 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();
const glowTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,0.7)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
const shu = new THREE.Color(P.shu[1]);
// 帯の重なり：rows 刀の手元からの長さの割合（帯の幅の位置）/ a その位置の濃さ / life 振り終わってから消えるまで / tail 古い方へ薄くなる強さ
type Layer = { rows: number[]; a: number[]; rgb: number[]; blend: THREE.Blending; life: number; tail: number; order: number; map?: THREE.Texture; color?: number };
const LAYERS: Layer[] = [
  { rows: [0.32, 0.5, 0.86, 1.08], a: [0, 0.95, 0.95, 0], rgb: [1, 1, 1], blend: THREE.NormalBlending, life: 0.45, tail: 0.15, order: 3, map: brushTex, color: P.sumi[0] },   // 墨
  { rows: [0.48, 0.86, 1.13], a: [0, 0.45, 0], rgb: [shu.r, shu.g, shu.b], blend: THREE.AdditiveBlending, life: 0.2, tail: 1.1, order: 4 },   // 朱のにじみ
  { rows: [0.55, 0.96, 1.04], a: [0, 1, 0.5], rgb: [1, 1, 1], blend: THREE.AdditiveBlending, life: 0.12, tail: 1, order: 5 },   // 白い芯
];
const N = 22;
function layerMesh(L: Layer) {
  const R = L.rows.length, n = (N + 1) * R;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 4), 4));
  const uv = new Float32Array(n * 2), idx: number[] = [];
  for (let k = 0; k <= N; k++) for (let r = 0; r < R; r++) { const i = k * R + r; uv[i * 2] = r / (R - 1); uv[i * 2 + 1] = k / N; }
  for (let k = 0; k < N; k++) for (let r = 0; r < R - 1; r++) { const a = k * R + r, b = a + R; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false, blending: L.blend, map: L.map || null, color: L.color ?? 0xffffff }));
  m.frustumCulled = false; m.renderOrder = L.order;
  return m;
}
// 1回の振りの軌跡（3枚重ね）。振り終わったら、その場に残って薄れていく
type Stroke = { g: THREE.Group; meshes: THREE.Mesh[]; key: number; age: number };
export type Strokes = { parent: THREE.Object3D; list: Stroke[]; active: Stroke | null };
export const makeStrokes = (parent: THREE.Object3D): Strokes => ({ parent, list: [], active: null });
// sw：振っている様子（serial で振りを見分ける）/ win：[振り抜きの始まり, 終わり]（無ければ軌跡なし）/ sample(t, f)：t 秒の刀の、手元から f の割合の点
export function strokeTick(S: Strokes, sw, win: [number, number] | null, sample: (t: number, f: number) => THREE.Vector3, dt: number) {
  const on = !!(sw && sw.stage && win && sw.t >= win[0] && sw.t <= win[1] + 0.03);
  if (S.active && (!on || S.active.key !== sw.serial)) { S.active.age = 0; S.active = null; }
  if (on && !S.active) {
    let s = S.list.find(x => x.age < 0 ? false : x.age > 1);
    if (!s) {
      const g = new THREE.Group(); S.parent.add(g);
      s = { g, meshes: LAYERS.map(l => { const m = layerMesh(l); g.add(m); return m; }), key: 0, age: 0 };
      S.list.push(s);
    }
    s.key = sw.serial; s.age = -1; s.g.visible = true; S.active = s;
  }
  if (S.active) {
    const t0 = win[0], t1 = Math.min(sw.t, win[1]);
    LAYERS.forEach((L, li) => {
      const m = S.active.meshes[li], pa = m.geometry.attributes.position as THREE.BufferAttribute, ca = m.geometry.attributes.color as THREE.BufferAttribute;
      const R = L.rows.length;
      for (let k = 0; k <= N; k++) {
        const tk = t1 - (t1 - t0) * k / N, fade = Math.pow(1 - k / N, L.tail);
        for (let r = 0; r < R; r++) {
          const p = sample(tk, L.rows[r]), i = k * R + r;
          pa.setXYZ(i, p.x, p.y, p.z); ca.setXYZW(i, L.rgb[0], L.rgb[1], L.rgb[2], L.a[r] * fade);
        }
      }
      pa.needsUpdate = true; ca.needsUpdate = true;
      (m.material as THREE.MeshBasicMaterial).opacity = 1;
    });
  }
  for (const s of S.list) {
    if (s.age < 0 || s.age > 1) continue;
    s.age += dt;
    LAYERS.forEach((L, li) => { (s.meshes[li].material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - s.age / L.life); });
    if (s.age > 0.5) { s.age = 2; s.g.visible = false; }
  }
}
export function strokesClear(S: Strokes) { for (const s of S.list) { s.age = 2; s.g.visible = false; } S.active = null; }

// ================= 刀身を走る光・突きの溜めの光 =================
// g：刀の形（一人称）。図面の長さ：刃は手元から 0.112〜0.82m（刀の向きは -z）
let runSp: THREE.Sprite = null, tipSp: THREE.Sprite = null;
function sprite(map: THREE.Texture) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, transparent: true, fog: false })); s.renderOrder = 8; s.visible = false; return s; }
// run：刀身を走る光（0〜1 の位置、-1 で消す）/ tip：刃先の光の強さ（0 で消す）
export function bladeGlint(g: THREE.Object3D, run: number, tip: number, spin = 0) {
  if (!runSp) { runSp = sprite(glowTex); tipSp = sprite(starTex); }
  if (runSp.parent !== g) { g.add(runSp); g.add(tipSp); }
  runSp.visible = run >= 0 && run <= 1;
  if (runSp.visible) { runSp.position.set(0, 0.008, -(0.13 + 0.68 * run)); runSp.scale.setScalar(0.16 * Math.sin(Math.PI * run) + 0.02); }
  tipSp.visible = tip > 0.01;
  if (tipSp.visible) { tipSp.position.set(0, 0.02, -0.8); tipSp.scale.setScalar(0.08 + 0.42 * tip); tipSp.material.rotation = spin; tipSp.material.opacity = Math.min(1, tip * 1.5); }
}

// ================= 斬撃が壁に当たった：十字の火花と斬り傷 =================
const marks: { m: THREE.Mesh; t: number }[] = [], crosses: { g: THREE.Group; t: number }[] = [];
const markMat = new THREE.MeshBasicMaterial({ color: P.sumi[0], transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
const crossMat = new THREE.MeshBasicMaterial({ map: glowTex, color: 0xfff1d6, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
const barGeo = new THREE.PlaneGeometry(1, 1);
// span：斬撃の弧の向き（傷の向き）
export function wallHit(point: THREE.Vector3, n: THREE.Vector3, span: THREE.Vector3) {
  const s = span.clone().addScaledVector(n, -span.dot(n));
  if (s.lengthSq() < 1e-4) s.set(1, 0, 0).addScaledVector(n, -n.x);
  s.normalize();
  const up = new THREE.Vector3().crossVectors(n, s);
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(s, up, n));
  // 斬り傷：細長い墨色の線（少しずつ消える）
  const m = new THREE.Mesh(barGeo, markMat.clone());
  m.position.copy(point).addScaledVector(n, 0.02); m.quaternion.copy(q); m.scale.set(rand(1.3, 1.7), 0.07, 1);
  scene.add(m); marks.push({ m, t: 8 });
  if (marks.length > 14) { const o = marks.shift(); scene.remove(o.m); (o.m.material as THREE.Material).dispose(); }
  // 十字の火花
  const g = new THREE.Group();
  for (const a of [0.78, -0.78]) { const b = new THREE.Mesh(barGeo, crossMat.clone()); b.rotation.z = a; b.scale.set(1.6, 0.12, 1); g.add(b); }
  g.position.copy(point).addScaledVector(n, 0.05); g.quaternion.copy(q);
  scene.add(g); crosses.push({ g, t: 0 });
  Particles.impact(point, n);
}
function wallTick(dt: number) {
  for (let i = marks.length - 1; i >= 0; i--) {
    const k = marks[i]; k.t -= dt;
    (k.m.material as THREE.MeshBasicMaterial).opacity = 0.85 * Math.min(1, k.t / 2);
    if (k.t <= 0) { scene.remove(k.m); (k.m.material as THREE.Material).dispose(); marks.splice(i, 1); }
  }
  for (let i = crosses.length - 1; i >= 0; i--) {
    const c = crosses[i]; c.t += dt;
    const k = c.t / 0.28;
    c.g.scale.setScalar(0.6 + k * 0.9);
    c.g.children.forEach((b: any) => { b.material.opacity = Math.max(0, 1 - k); });
    if (k >= 1) { scene.remove(c.g); c.g.children.forEach((b: any) => b.material.dispose()); crosses.splice(i, 1); }
  }
}

// ================= 画面の上の演出（白黒の影響を受けない別の層） =================
let layer: HTMLDivElement = null, vig: HTMLDivElement = null, lines: HTMLDivElement = null, zanEl: HTMLDivElement = null, comboEl: HTMLDivElement = null;
function ensureLayer() {
  if (layer) return;
  layer = document.createElement('div');
  layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:6;overflow:hidden';
  // 集中線：ふちを暗く絞り、細い線が真ん中へ向かう
  vig = document.createElement('div');
  vig.style.cssText = 'position:absolute;inset:0;opacity:0;background:radial-gradient(ellipse at center,transparent 38%,rgba(0,0,0,0.55) 70%,rgba(0,0,0,0.92) 100%)';
  lines = document.createElement('div');
  lines.style.cssText = `position:absolute;left:50%;top:50%;width:160vmax;height:160vmax;margin:-80vmax 0 0 -80vmax;opacity:0;
    background:repeating-conic-gradient(from 0deg,rgba(255,255,255,0) 0deg 2.6deg,rgba(255,255,255,0.75) 2.6deg 2.85deg,rgba(255,255,255,0) 2.85deg 4.1deg,rgba(0,0,0,0.6) 4.1deg 4.3deg);
    -webkit-mask-image:radial-gradient(circle,transparent 20vmax,#000 42vmax);mask-image:radial-gradient(circle,transparent 20vmax,#000 42vmax)`;
  zanEl = document.createElement('div');
  zanEl.textContent = '斬';
  zanEl.style.cssText = `position:absolute;left:50%;top:46%;transform:translate(-50%,-50%);opacity:0;font:900 38vmin var(--font-koma);color:${css(P.sumi[0])};
    -webkit-text-stroke:0.6vmin ${css(P.shiro[2])};text-shadow:1.2vmin 1.2vmin 0 ${css(P.shu[1])},0 0 4vmin rgba(255,255,255,0.6);line-height:1`;
  comboEl = document.createElement('div');
  comboEl.style.cssText = `position:absolute;right:36px;bottom:96px;display:flex;gap:4px;font:900 34px var(--font-koma);color:${css(P.shiro[2])};
    -webkit-text-stroke:1.5px ${css(P.sumi[0])};text-shadow:3px 3px 0 ${css(P.shu[1])}`;
  layer.append(vig, lines, zanEl, comboEl);
  document.body.appendChild(layer);
}
// 白黒スローの強さ（0〜1）に合わせて、画面のふちを暗く絞る（集中線は使わないことにした。lines は残してあるが出さない）
let lastK = -1;
export function focusLines(k: number) {
  ensureLayer();
  if (Math.abs(k - lastK) < 0.01) return;
  lastK = k;
  vig.style.opacity = k.toFixed(2);
}
// とどめ：「斬」の筆文字が大きくドンと出る
export function zan() {
  ensureLayer();
  zanEl.animate([
    { opacity: 0, transform: 'translate(-50%,-50%) scale(1.9) rotate(-8deg)', filter: 'blur(8px)' },
    { opacity: 1, transform: 'translate(-50%,-50%) scale(0.94) rotate(-3deg)', filter: 'blur(0)', offset: 0.07 },
    { opacity: 1, transform: 'translate(-50%,-50%) scale(1) rotate(-3deg)', offset: 0.12 },
    { opacity: 1, transform: 'translate(-50%,-50%) scale(1.03) rotate(-3deg)', offset: 0.75 },
    { opacity: 0, transform: 'translate(-50%,-50%) scale(1.1) rotate(-3deg)', filter: 'blur(3px)' },
  ], { duration: 1600, easing: 'ease-out' });
}
// 段数の筆文字：振るたびに一つずつ並ぶ（一 → 一二 → 一二三 → 一二三四）。1段目からやり直すと消して始める。場所は弾数の上あたり
const NUMS = ['一', '二', '三', '四'];
let comboT = 0;
export function comboStage(stage: number) {
  ensureLayer();
  if (stage === 1) comboEl.innerHTML = '';
  const s = document.createElement('span'); s.textContent = NUMS[stage - 1];
  // 弾数の上あたりに、字ごとに少しずつずれて並ぶ（筆で書き足したように）
  s.style.display = 'inline-block'; s.style.transform = `translate(${rand(-6, 6).toFixed(0)}px,${rand(-10, 10).toFixed(0)}px) rotate(${rand(-12, 12).toFixed(0)}deg)`;
  if (stage === 4) { s.style.fontSize = '46px'; s.style.color = css(P.shu[2]); }
  comboEl.appendChild(s);
  s.animate([{ opacity: 0, scale: '2.2' }, { opacity: 1, scale: '1' }], { duration: 160, easing: 'ease-out' });
  comboEl.style.opacity = '1'; comboT = 0.75;
}
function comboTick(rdt: number, swinging: boolean) {
  if (!comboEl || comboT <= 0) return;
  if (swinging) { comboT = 0.75; return; }
  comboT -= rdt;
  comboEl.style.opacity = Math.max(0, Math.min(1, comboT / 0.3)).toFixed(2);
  if (comboT <= 0) comboEl.innerHTML = '';
}

// ================= 駒が真っ二つ =================
// 斬った面（ワールドの平面）より上を別の形にして、斬った線に沿ってずれ落とす。下の半分は立ったまま残る
renderer.localClippingEnabled = true;
let split: any = null;
// A：駒の見た目 / point：斬った所 / n：斬った面の向き（上の半分の側）/ slide：上の半分がずれる向き / groundY：床の高さ
export function splitActor(A, point: THREE.Vector3, n: THREE.Vector3, slide: THREE.Vector3, groundY: number) {
  splitClear();
  const keep = new THREE.Plane().setFromNormalAndCoplanarPoint(n.clone().negate(), point);   // 下の半分（残す側）
  const cut = new THREE.Plane().setFromNormalAndCoplanarPoint(n, point);                      // 上の半分
  const swaps: [THREE.Mesh, THREE.Material][] = [];
  const clipMat = (m: THREE.Material, plane: THREE.Plane) => {
    const c = m.clone() as any; c.clippingPlanes = [plane]; c.clipShadows = true;
    if (c.emissive) c.emissive.setHex(0);   // 当たったときの赤い光は消しておく（倒れた駒は光が戻らないため）
    if (c.side === THREE.FrontSide) c.side = THREE.DoubleSide;   // 断面から中が見えても、裏の面が埋めて見える
    return c;
  };
  A.piece.updateMatrixWorld(true);
  const upper = A.piece.clone(true);
  A.piece.traverse((o: any) => { if (o.isMesh && o.visible && o.material.depthTest !== false) { swaps.push([o, o.material]); o.material = clipMat(o.material, keep); } });
  upper.traverse((o: any) => { if (o.isMesh) { if (o.material.depthTest === false || !o.visible) o.visible = false; else o.material = clipMat(o.material, cut); } });
  A.piece.matrixWorld.decompose(upper.position, upper.quaternion, upper.scale);
  scene.add(upper); upper.updateMatrixWorld(true);
  // 斬った面はワールドの平面なので、落ちていく半分の動きに合わせて毎フレーム動かす（動かさないと、横へ倒れた半分が面の外に出て斬れていない形に見える）
  const local = cut.clone().applyMatrix4(upper.matrixWorld.clone().invert());
  // 斬った線に沿って木くずが散る
  for (let i = -2; i <= 2; i++) Particles.wood(point.clone().addScaledVector(slide, i * 0.25), n, 6, 1.1);
  const axis = new THREE.Vector3().crossVectors(n, slide).normalize();
  split = { A, upper, swaps, cut, local, v: slide.clone().multiplyScalar(0.6), w: 0, axis, t: 0, groundY, rest: false, shown: true };
}
function splitTick(dt: number) {
  const S = split;
  if (!S || S.rest) return;
  S.t += dt;
  if (S.t < 0.35) S.v.addScaledVector(S.v.clone().normalize(), dt * 5);   // はじめは斬った面を滑る
  else { S.v.y -= 9.8 * dt; S.w = Math.min(S.w + dt * 9, 4); }            // 外れたら落ちて回る
  S.upper.position.addScaledVector(S.v, dt);
  if (S.w) S.upper.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(S.axis, S.w * dt));
  if (S.upper.position.y < S.groundY + 0.15) {
    S.upper.position.y = S.groundY + 0.15;
    Particles.dust(S.upper.position, 12, 1.4);
    S.v.multiplyScalar(0.2); S.v.y = 0; S.w = 0; S.rest = true;
  }
  S.upper.updateMatrixWorld(true);
  S.cut.copy(S.local).applyMatrix4(S.upper.matrixWorld);
}
// リプレイの間は斬れる前の姿に戻す
export function splitShow(on: boolean) {
  const S = split;
  if (!S || S.shown === on) return;
  S.shown = on; S.upper.visible = on;
  for (const s of S.swaps) { const cur = s[0].material; s[0].material = s[1]; s[1] = cur; }
}
export function splitClear() {
  if (!split) return;
  splitShow(true);
  for (const [m, orig] of split.swaps) { (m.material as THREE.Material).dispose(); m.material = orig; }
  scene.remove(split.upper);
  split.upper.traverse((o: any) => { if (o.isMesh && o.material.clippingPlanes) o.material.dispose(); });
  split = null;
}

// 瞬：画面のまわりから中心へ流れる白い線（lines を使う）
let lastS = -1;
export function speedLines(k: number) {
  ensureLayer();
  if (Math.abs(k - lastS) < 0.01) return;
  if (lastS <= 0.01 && k > 0.01) lines.style.transform = `rotate(${rand(0, 360).toFixed(0)}deg) scale(1.15)`;
  lastS = k;
  lines.style.opacity = (k * 0.9).toFixed(2);
}
// 残像：その瞬間の駒の形を、白く透けた影として置いて消していく
const ghosts: { m: THREE.Mesh; t: number }[] = [];
export function afterimage(src: THREE.Mesh) {
  src.updateMatrixWorld(true);
  const m = new THREE.Mesh(src.geometry, new THREE.MeshBasicMaterial({ color: 0xf2f6ff, transparent: true, opacity: 0.5, depthWrite: false, fog: false }));
  m.matrixAutoUpdate = false; m.matrix.copy(src.matrixWorld);
  scene.add(m); ghosts.push({ m, t: 0.35 });
  if (ghosts.length > 30) { const g = ghosts.shift(); scene.remove(g.m); (g.m.material as THREE.Material).dispose(); }
}
export function afterimageTick(dt: number) {
  for (let i = ghosts.length - 1; i >= 0; i--) {
    const g = ghosts[i]; g.t -= dt;
    (g.m.material as THREE.MeshBasicMaterial).opacity = Math.max(0, g.t / 0.35) * 0.5;
    if (g.t <= 0) { scene.remove(g.m); (g.m.material as THREE.Material).dispose(); ghosts.splice(i, 1); }
  }
}

// 毎フレーム（本当の時間）
export function fxFrame(rdt: number, dt: number, swinging: boolean) {
  wallTick(dt);
  splitTick(rdt);
  comboTick(rdt, swinging);
}
export function fxClear() {
  for (const k of marks) { scene.remove(k.m); (k.m.material as THREE.Material).dispose(); }
  marks.length = 0;
  for (const c of crosses) scene.remove(c.g);
  crosses.length = 0;
  splitClear();
  if (comboEl) { comboEl.innerHTML = ''; comboT = 0; }
  focusLines(0);
}
