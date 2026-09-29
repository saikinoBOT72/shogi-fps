// マップ（谷と二つの丘）・背景・障害物と当たり判定
import { P, css, rgba } from './palette';
import * as THREE from 'three';
import { BH, C, GROUND, H, LIGHT, V3, clamp, rand, settings } from './core';
import { gs } from './state';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SUN_DIR, boardTex, canvasTex, darkWoodTex, flatGeo, flatten, hemi, kanjiMat, makePiece, mat, planeGeo, scene, sky, sun, toon } from './render';

// ================= 地形・小道具 =================
// 今のマップのもの（マップを切り替えると中身が入れ替わる）
export const propMeshes = [];   // 弾・視線を遮る
export const colliders = [];    // 移動の当たり判定（上に乗れる）
const baseProps = [];           // どのマップにもある物（外周の地面）
// walk: 上を歩ける面（盤・段・階段）。経路探索で「床」として扱う
// 作っている途中のマップに足す
export function addSolid(obj, cyl?, walk?) {
  cur.group.add(obj); cur.props.push(obj);
  flatten(obj);
  // 透明な板（字など）は影を落とさない
  obj.traverse((o: any) => { if (o.isMesh) { o.castShadow = !o.material.transparent; o.receiveShadow = true; } });
  obj.updateMatrixWorld(true);
  // 上面の材質から床の種類（足音用。材質の userData.surf、なければ草・土）
  let m: any = obj.material; if (!m) obj.traverse((o: any) => { if (!m && o.isMesh) m = o.material; });
  const surf = (Array.isArray(m) ? m[2] : m)?.userData?.surf || 'grass';
  if (cyl) cur.colliders.push({ kind: 'cyl', ...cyl, walk: !!walk, surf });
  else { const b = new THREE.Box3().setFromObject(obj); cur.colliders.push({ kind: 'box', min: b.min, max: b.max, walk: !!walk, surf }); }
}
// その場所の地面の高さ（歩ける面の一番上）。最初に使うときに 1m のマス目で覚える
let hmap: Float32Array = null;
const HM = 2 * H + 8;
export function groundAt(x, z) {
  if (!hmap) {
    hmap = new Float32Array(HM * HM).fill(GROUND);
    for (const c of colliders) {
      if (!c.walk || c.kind === 'cyl') continue;
      for (let j = Math.max(0, Math.ceil(c.min.z + HM / 2 - 0.5)); j <= Math.min(HM - 1, Math.floor(c.max.z + HM / 2 - 0.5)); j++)
        for (let i = Math.max(0, Math.ceil(c.min.x + HM / 2 - 0.5)); i <= Math.min(HM - 1, Math.floor(c.max.x + HM / 2 - 0.5)); i++)
          hmap[j * HM + i] = Math.max(hmap[j * HM + i], colTop(c, i - HM / 2 + 0.5, j - HM / 2 + 0.5));
    }
  }
  const i = Math.floor(x + HM / 2), j = Math.floor(z + HM / 2);
  return i < 0 || j < 0 || i >= HM || j >= HM ? GROUND : hmap[j * HM + i];
}

// ---------- 材質 ----------
export const woodSideM = toon({ map: darkWoodTex, roughness: 0.8 });
export const plasterM = mat(P.shiro[1], { roughness: 0.95 });   // 白壁
export const roofM = mat(P.sumi[2], { roughness: 0.7 });       // 瓦
export const stoneM = mat(P.nezumi[1], { roughness: 1 });
export const earthM = mat(P.kiji[0], { roughness: 1 });
export const turfM = mat(P.moegi[1], { roughness: 1 });
export const leafMs = [mat(P.midori[1]), mat(P.moegi[1]), mat(P.midori[0])];
export const trunkM = mat(P.kiji[0]);
// 床の種類（足音）
for (const m of [stoneM, roofM, plasterM]) m.userData.surf = 'stone';
woodSideM.userData.surf = 'wood';

// 外周の地面（弾や矢が当たるように propMeshes に入れる）
{
  const tex = canvasTex(512, 512, (g, w) => {
    g.fillStyle = css(P.moegi[1]); g.fillRect(0, 0, w, w);
    const blades = [P.moegi[0], P.midori[1], P.moegi[2], P.midori[0]];
    for (let i = 0; i < 1600; i++) { g.fillStyle = rgba(blades[i % 4], rand(0.12, 0.35)); g.fillRect(rand(0, w), rand(0, w), rand(2, 5), rand(3, 10)); }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(10, 10);
  const g = new THREE.Mesh(new THREE.PlaneGeometry(2 * H + 8, 2 * H + 8), toon({ map: tex, roughness: 1 }));
  g.rotation.x = -Math.PI / 2; g.position.y = GROUND; g.receiveShadow = true;
  scene.add(g); baseProps.push(g);
}

// ---------- 背景を1つのメッシュにまとめる（描画回数を減らして軽くする） ----------
// parts: [geometry, color, matrix] の配列 → 頂点カラー付きの1メッシュ（面ごとの陰影でローポリ感）
export function mergeParts(parts) {
  const pos = [], col = [];
  const c = new THREE.Color();
  for (const [g0, hex, m] of parts) {
    const g = (g0.index ? g0.toNonIndexed() : g0.clone()).applyMatrix4(m);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) pos.push(p.getX(i), p.getY(i), p.getZ(i));
    for (let i = 0; i < p.count; i += 3) {
      c.copy(C(hex)).offsetHSL(0, 0, rand(-0.03, 0.03));
      for (let j = 0; j < 3; j++) col.push(c.r, c.g, c.b);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  return geo;
}
export const lambertVC = toon({ vertexColors: true });
export const M4 = (x, y, z, ry = 0, s = 1, sy = s) => new THREE.Matrix4().compose(new V3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new V3(s, sy, s));

// 遠くの草原（アリーナの外は起伏あり）。砂漠のマップでは、草原・木・山・足もとの草を隠して砂の景色に替える
let farMeadow: THREE.Mesh = null, farScenery: THREE.Mesh = null;
{
  const geo = new THREE.PlaneGeometry(800, 800, 64, 64).toNonIndexed();
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, cols = [];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), d = Math.max(Math.abs(x), Math.abs(z));
    const k = clamp((d - H - 8) / 40, 0, 1);
    pos.setY(i, GROUND - 0.05 + (Math.sin(x * 0.05) * Math.cos(z * 0.045) * 4 + Math.sin(x * 0.13 + z * 0.07) * 1.5 + 2) * k);
  }
  for (let i = 0; i < pos.count; i += 3) {
    const c = C(P.moegi[1]).offsetHSL(rand(-0.02, 0.02), 0, rand(-0.05, 0.05));
    for (let j = 0; j < 3; j++) cols.push(c.r, c.g, c.b);
  }
  geo.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, lambertVC);
  m.receiveShadow = true; scene.add(m); farMeadow = m;
}

// 遠くの木・山（まとめて1メッシュ）・雲（1つずつ1メッシュ）
export const clouds = [];
{
  const parts = [];
  const trunkG = new THREE.CylinderGeometry(0.35, 0.5, 2.5, 5);
  const leafG = [0, 1, 2].map(k => new THREE.ConeGeometry(2.6 - k * 0.6, 3, 6));
  const LEAF = [P.midori[1], P.moegi[1], P.midori[0]];
  for (let i = 0; i < 80; i++) {
    const a = rand(0, Math.PI * 2), r = rand(H + 14, 150);
    const x = Math.cos(a) * r, z = Math.sin(a) * r, s = rand(0.9, 1.8), y = GROUND + 1;
    parts.push([trunkG, P.kiji[0], M4(x, y + 1.25 * s, z, 0, s)]);
    for (let k = 0; k < 3; k++) parts.push([leafG[k], LEAF[(i + k) % 3], M4(x, y + (3 + k * 1.5) * s, z, rand(0, 3), s)]);
  }
  for (let i = 0; i < 14; i++) {
    const a = i / 14 * Math.PI * 2 + rand(-0.15, 0.15), r = rand(280, 360), h = rand(60, 120);
    const x = Math.cos(a) * r, z = Math.sin(a) * r, ry = rand(0, 3);
    parts.push([new THREE.ConeGeometry(h * 0.9, h, 6), P.ai[2], M4(x, h / 2 - 10, z, ry)]);
    parts.push([new THREE.ConeGeometry(h * 0.9 * 0.28, h * 0.28, 6), P.shiro[2], M4(x, h / 2 - 10 + h * 0.36 + 0.5, z, ry)]);
  }
  farScenery = new THREE.Mesh(mergeParts(parts), lambertVC);
  scene.add(farScenery);

  const cm = toon({ vertexColors: true, emissive: C(P.nezumi[2]), emissiveIntensity: 0.35 });
  for (let i = 0; i < 16; i++) {
    const cp = [];
    for (let k = 0; k < 5; k++) cp.push([new THREE.IcosahedronGeometry(rand(5, 9), 0), P.shiro[2], M4(k * 6 - 12 + rand(-2, 2), rand(-1, 2), rand(-3, 3), 0, 1, 0.6)]);
    const g = new THREE.Mesh(mergeParts(cp), cm);
    g.position.set(rand(-400, 400), rand(70, 110), rand(-400, 400));
    scene.add(g); clouds.push(g);
  }
}

// ================= マップ：いくつか作っておき、選んだものだけを見せる =================
// 今のマップの高さ（出撃は LV.V の高さ）・出撃地点・水面の高さ（これより低い所は水の中で遅い）。マップを切り替えると中身が変わる
export const LV: any = {};
export const SPAWN = { x: -34, z: 9 };
// 攻め守りの形のマップ用：もう一方の出撃（無いマップは点対称の場所。今は使っているマップなし）
export const SPAWN2 = { x: 0, z: 0, on: false };
export let WATER_Y = GROUND + 0.4;
export let mapId = '';
// 3つ目の値が true のマップは未公開（開発者メニューで「未公開マップ」をオンにした人だけ選べる）
export const MAP_LIST: [string, string, boolean?][] = [['valley', '谷と二つの丘'], ['temple', '山寺の石段'], ['onsen', '雪の温泉街'], ['desert', '三つのピラミッド']];
export const devMapsOn = () => !!(settings as any).dev?.hiddenMaps;
export const selectableMaps = () => MAP_LIST.filter(m => !m[2] || devMapsOn());
// 自分で選ぶマップ：未公開のマップを選んだままオフにしたときは、最初のマップにする
export const playableMap = (id: string) => (selectableMaps().some(m => m[0] === id) ? id : 'valley');
export const onMapChange: ((id: string) => void)[] = [];   // 切り替えたときに呼ぶ（経路探索・物理）
const MAPS: Record<string, any> = {};
export const mapLV = (id: string) => MAPS[id].lv;
let cur: any = null;
function beginMap(id, o) {
  cur = MAPS[id] = Object.assign({ id, group: new THREE.Group(), props: [], colliders: [] }, o);
  cur.group.visible = false; scene.add(cur.group);
}
// 当たり判定のない飾り（block: 弾・視線は遮る）
function deco(obj, block = true) { cur.group.add(obj); if (block) cur.props.push(obj); obj.traverse((o: any) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); return obj; }

// ================= 置き物（すべて点対称に置いて公平に） =================
const G0 = GROUND;
// 下端の高さ y0 に置く箱（mats: 1つ、または [右,左,上,下,前,後]）
const boxMesh = (w, h, d, mats) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats);
// 白壁の塀（瓦の笠つき）。長さ len は x 方向
const wall = (len, h) => {
  const g = new THREE.Group();
  const w = boxMesh(len, h, 0.8, plasterM); w.position.y = h / 2;
  const base = boxMesh(len + 0.1, 0.6, 0.9, stoneM); base.position.y = 0.3;
  const cap = boxMesh(len + 0.6, 0.35, 1.4, roofM); cap.position.y = h + 0.1;
  g.add(w, base, cap); return g;
};
const rock = (s, m = stoneM) => {
  const r = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), m);
  r.scale.set(s * rand(1, 1.4), s * rand(0.7, 1), s * rand(1, 1.3)); r.position.y = s * 0.55; r.rotation.y = rand(0, 3);
  const g = new THREE.Group(); g.add(r); return g;
};
const tree = (s, leaves = leafMs) => {
  const g = new THREE.Group();
  const t = new THREE.Mesh(new THREE.CylinderGeometry(0.35 * s, 0.5 * s, 3 * s, 6), trunkM); t.position.y = 1.5 * s; g.add(t);
  for (let k = 0; k < 3; k++) {
    const c = new THREE.Mesh(new THREE.ConeGeometry((2.6 - k * 0.6) * s, 3 * s, 7), leaves[k]);
    c.position.y = (3.2 + k * 1.5) * s; c.rotation.y = rand(0, 3); g.add(c);
  }
  return g;
};
// (x, z) と (-x, -z) の2か所に置く。y0 は下端の高さ
const place = (make, x, z, ry = 0, y0 = G0, cyl?, walk?) => {
  [[1, 0], [-1, Math.PI]].forEach(([s, add]) => {
    const o = make(); o.position.set(x * s, y0, z * s); o.rotation.y = ry + add;
    addSolid(o, cyl && { x: x * s, z: z * s, r: cyl.r, y0, y1: y0 + cyl.h }, walk);
  });
};
// 箱（x0..x1, y0..y1, z0..z1）を置く。both なら点対称の場所にも
const solidBox = (x0, x1, y0, y1, z0, z1, mats, walk = false, both = true) => {
  for (const s of both ? [1, -1] : [1]) {
    const m = boxMesh(x1 - x0, y1 - y0, z1 - z0, mats);
    m.position.set(s * (x0 + x1) / 2, (y0 + y1) / 2, s * (z0 + z1) / 2);
    addSolid(m, null, walk);
  }
};
// 地面から top までの土地（歩ける）
const land = (x0, x1, z0, z1, top, mats, both = true) => solidBox(x0, x1, G0, top, z0, z1, mats, true, both);
// 上面の色で高さが分かるように（横は土や石）
const topM = hex => mat(hex, { roughness: 1 });
const sides = (side, top) => [side, side, top, side, side, side];
// 坂（昔の階段と同じ場所・長さ。1m 進むと 0.42m 以下しか上がらないので、歩いてそのまま上り下りできる）
// axis: 'z' なら x=at の位置で z 方向に上る。edge: 高い段の縁、hi: 高い側の向き
// 当たり判定は kind: 'ramp'（lo〜hi の間で高さが y0〜y1 へまっすぐ変わる）
const stairsAt = (axis, at, edge, hi, yLow, yHigh, width, m = stoneM) => {
  const run = Math.ceil((yHigh - yLow) / 0.42 - 1e-6);
  for (const s of [1, -1]) {
    const A = at * s, E = edge * s, lo = E - hi * s * run, a0 = Math.min(lo, E), a1 = Math.max(lo, E), len = a1 - a0, hgt = yHigh - G0;
    const geo = axis === 'z' ? new THREE.BoxGeometry(width, hgt, len) : new THREE.BoxGeometry(len, hgt, width);
    const cx = axis === 'z' ? A : (a0 + a1) / 2, cz = axis === 'z' ? (a0 + a1) / 2 : A, cy = (G0 + yHigh) / 2;
    // 上面の頂点を、低い端ほど下げる
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      if (p.getY(i) < 0) continue;
      const q = (axis === 'z' ? p.getZ(i) + cz : p.getX(i) + cx), t = (q - lo) / (E - lo);
      p.setY(i, yLow + (yHigh - yLow) * clamp(t, 0, 1) - cy);
    }
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, m); mesh.position.set(cx, cy, cz);
    cur.group.add(mesh); cur.props.push(mesh);
    flatten(mesh); mesh.castShadow = mesh.receiveShadow = true; mesh.updateMatrixWorld(true);
    const hw = width / 2;
    cur.colliders.push({ kind: 'ramp', axis, lo, hi: E, y0: yLow, y1: yHigh, walk: true, surf: m.userData?.surf || 'stone',
      min: new V3(axis === 'z' ? A - hw : a0, G0, axis === 'z' ? a0 : A - hw), max: new V3(axis === 'z' ? A + hw : a1, yHigh, axis === 'z' ? a1 : A + hw) });
  }
};
// 高さ y にいる人の足もとの床（屋根など頭より上の面は数えない）。物を置く高さに使う
export function floorBelow(x, z, y) {
  let h = GROUND;
  for (const c of colliders) {
    if (!c.walk || c.kind === 'cyl' || x < c.min.x || x > c.max.x || z < c.min.z || z > c.max.z) continue;
    const t = colTop(c, x, z);
    if (t <= y + 0.5 && t > h) h = t;
  }
  return h;
}
// 当たり判定の上面の高さ（坂はその場所の高さ）
export function colTop(c, x, z) {
  if (c.kind === 'cyl') return c.y1;
  if (c.kind === 'ramp') return c.y0 + (c.y1 - c.y0) * clamp(((c.axis === 'z' ? z : x) - c.lo) / (c.hi - c.lo), 0, 1);
  if (c.kind === 'hf') return c.at(x, z);   // なめらかな地形
  if (c.kind === 'pyr') return c.y0 + c.h * clamp(1 - Math.max(Math.abs(x - c.cx), Math.abs(z - c.cz)) / c.half, 0, 1);   // ピラミッドの斜面
  return c.max.y;
}

// ================= マップ1：谷と二つの丘（132m 四方・点対称） =================
// 高さ：川底 = GROUND、谷 V、段々 T2・T4、高台 PL、丘 HB（下の段）・HT（頂上）、吊り橋 ROPE、崖の小道 LEDGE
function buildValley() {
  beginMap('valley', {
    lv: { V: G0 + 1, T2: G0 + 3, T4: G0 + 5, PL: G0 + 7, HB: G0 + 8, HT: G0 + 11, ROPE: G0 + 6, LEDGE: G0 + 4 },
    spawn: { x: -34, z: 9 },   // 左の橋の南のたもと（相手は点対称の右の橋の北のたもと）
    water: G0 + 0.4,
    atmos: () => ({ top: C(P.ao[1]), hor: C(P.ao[2]), bot: C(P.moegi[2]), sunDir: new V3(0.45, 0.75, 0.35), sunCol: C(P.shiro[2]), sunI: 1.15,
      hemiSky: C(P.ao[2]), hemiGround: C(P.kiji[0]), hemiI: 0.45, fog: C(P.ao[2]), near: 90, far: 430, clouds: true }),
  });
  const { V, T2, T4, PL, HB, HT, ROPE, LEDGE } = cur.lv;
  {
    // 上面の色で高さが分かるように（横は土や石）
    const topM = hex => mat(hex, { roughness: 1 });
    const sides = (side, top) => [side, side, top, side, side, side];
    const valleyM = sides(earthM, topM(P.kiji[2])), t2M = sides(earthM, turfM), t4M = sides(earthM, topM(P.moegi[0]));
    const plM = sides(stoneM, topM(P.midori[1])), hillM = sides(stoneM, topM(P.midori[0])), ledgeM = sides(stoneM, topM(P.nezumi[2]));
  
    // ----- 土地 -----
    land(-66, 66, 3, 20, V, valleyM);        // 谷（川の岸）
    land(-66, 66, 20, 36, T2, t2M);          // 段々 2m
    land(-66, 66, 36, 50, T4, t4M);          // 段々 4m
    land(-66, 66, 50, 66, PL, plM);          // 奥の高台 6m
    land(-45, -10, 30, 54, HB, hillM);       // 自分の丘（下の段 7m）
    land(-38, -17, 36, 48, HT, hillM);       // 丘の頂上 10m
    land(57, 66, 3, 20, LEDGE, ledgeM);      // 崖の小道（谷の横 3m）
    // 川底の砂と水面（水面は弾が通る）
    { const bed = new THREE.Mesh(new THREE.PlaneGeometry(2 * H, 6), mat(P.kiji[1])); bed.rotation.x = -Math.PI / 2; bed.position.set(0, G0 + 0.02, 0); bed.receiveShadow = true; cur.group.add(bed); }
    { const w = new THREE.Mesh(new THREE.PlaneGeometry(2 * H, 6.2), toon({ color: C(P.mizu[1]), transparent: true, opacity: 0.72 })); w.rotation.x = -Math.PI / 2; w.position.set(0, G0 + 0.7, 0); cur.group.add(w); }
    // 川から上がる石段（岸ごとに2か所）
    solidBox(-16.5, -13.5, G0, G0 + 0.5, 2, 3, stoneM, true); solidBox(48.5, 51.5, G0, G0 + 0.5, 2, 3, stoneM, true);
  
    // ----- 橋（左右）と欄干 -----
    solidBox(-36.5, -31.5, G0, V + 0.2, -3.5, 3.5, woodSideM, true);
    solidBox(-36.7, -36.3, V + 0.2, V + 1.1, -3.5, 3.5, woodSideM); solidBox(-31.7, -31.3, V + 0.2, V + 1.1, -3.5, 3.5, woodSideM);
    // ----- 真ん中の高い吊り橋（岩の柱の上。手すりは縄だけなので落とされやすい） -----
    land(-2, 2, 11, 15, ROPE, sides(stoneM, topM(P.nezumi[1])));
    solidBox(-1.2, 1.2, ROPE - 0.3, ROPE, -11, 11, woodSideM, true, false);
    for (const x of [-1.3, 1.3]) {
      const rope = boxMesh(0.06, 0.06, 22, mat(P.kiji[0])); rope.position.set(x, ROPE + 0.9, 0); cur.group.add(rope);
      for (const z of [-11, -5.5, 0, 5.5, 11]) { const post = boxMesh(0.12, 0.9, 0.12, woodSideM); post.position.set(x, ROPE + 0.45, z); cur.group.add(post); }
    }
  
    // ----- 階段（段の縁から低い側へ。1段 0.42m 以下なので歩いて上り下りできる） -----
    // axis: 'z' なら x=at の位置で z 方向に並ぶ。edge: 高い段の縁、hi: 高い側の向き
    const stairs = (axis, at, edge, hi, yLow, yHigh, width) => {
      const n = Math.ceil((yHigh - yLow) / 0.42 - 1e-6), dh = (yHigh - yLow) / n;
      for (let i = 1; i <= n; i++) {
        const top = yLow + dh * i, c = edge - hi * (n - i + 0.5);
        if (axis === 'z') solidBox(at - width / 2, at + width / 2, G0, top, c - 0.5, c + 0.5, stoneM, true);
        else solidBox(c - 0.5, c + 0.5, G0, top, at - width / 2, at + width / 2, stoneM, true);
      }
    };
    stairs('z', -21, 20, 1, V, T2, 4); stairs('z', 18, 20, 1, V, T2, 4);       // 谷 → 2m（右の家の横）
    stairs('z', 30, 36, 1, T2, T4, 4); stairs('z', -55, 36, 1, T2, T4, 4);     // 2m → 4m
    stairs('z', 45, 50, 1, T4, PL, 4); stairs('z', -5, 50, 1, T4, PL, 4);      // 4m → 高台
    stairs('z', -27, 54, -1, PL, HB, 4);                                        // 高台 → 丘
    stairs('x', 42, -17, -1, HB, HT, 4);                                        // 丘 → 頂上
    stairs('x', 10, 57, 1, V, LEDGE, 3);                                        // 谷 → 崖の小道
  
    // ----- 出撃の関所（屋根つき。相手側の面に壁があって、始まった瞬間は見えない） -----
    for (const [x, z] of [[-37.6, 5.4], [-30.4, 5.4], [-37.6, 12.6], [-30.4, 12.6]]) place(() => { const g = new THREE.Group(); const p = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 3.2, 6), woodSideM); p.position.y = 1.6; g.add(p); return g; }, x, z, 0, V, { r: 0.25, h: 3.2 });
    solidBox(-38.4, -29.6, V + 3.2, V + 3.6, 4.6, 13.4, roofM, true);
    solidBox(-30.4, -29.6, V, V + 3.2, 5, 13, plasterM);
  
    // ----- 谷の村（家の屋根には壁登りで上がれる） -----
    const house = (cx, cz, w, d, h) => {
      solidBox(cx - w / 2, cx + w / 2, V, V + h, cz - d / 2, cz + d / 2, [plasterM, plasterM, roofM, woodSideM, plasterM, plasterM]);
      solidBox(cx - w / 2 - 0.6, cx + w / 2 + 0.6, V + h, V + h + 0.4, cz - d / 2 - 0.6, cz + d / 2 + 0.6, roofM, true);
      solidBox(cx - w / 2 - 0.2, cx + w / 2 + 0.2, V + h + 0.4, V + h + 0.9, cz - 0.3, cz + 0.3, roofM);   // 棟
    };
    house(-8, 12, 9, 7, 3.2); house(10, 16.5, 8, 6, 3.2);
  
    // ----- 高台の遮蔽 -----
    // 丘の前の縁の石垣（胸壁）：谷を見下ろして撃てる
    for (const [x0, x1] of [[-43, -37], [-31, -24], [-18, -12]]) solidBox(x0, x1, HB, HB + 1.3, 30.2, 31, stoneM);
    // 丘の頂上：見張り台（上にも胸壁）と石垣
    solidBox(-29.5, -25.5, HT, HT + 3, 43, 47, woodSideM, true);
    solidBox(-29.5, -25.5, HT + 3, HT + 3.9, 43, 43.4, woodSideM); solidBox(-29.9, -29.5, HT + 3, HT + 3.9, 43, 47, woodSideM);
    solidBox(-37.8, -37, HT, HT + 1.2, 38, 44, stoneM);
    for (const [x0, x1] of [[-35, -30], [-25, -20]]) solidBox(x0, x1, HT, HT + 1.2, 36.2, 37, stoneM);
    // 奥の高台：屋根つきの祠（ミサイルを避けて狙える）と低い塀
    for (const [x, z] of [[51, 55.5], [57, 55.5], [51, 60.5], [57, 60.5]]) place(() => { const g = new THREE.Group(); const p = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 3, 6), woodSideM); p.position.y = 1.5; g.add(p); return g; }, x, z, 0, PL, { r: 0.25, h: 3 });
    solidBox(50.2, 57.8, PL + 3, PL + 3.4, 54.8, 61.2, roofM, true);
    solidBox(50.5, 57.5, PL, PL + 1.6, 61.2, 61.8, woodSideM);
    place(() => wall(8, 1.6), 10, 56, 0, PL);
    place(() => wall(6, 1.6), 30, 61, Math.PI / 2, PL);
    place(() => wall(7, 1.6), -55, 58, 0, PL);
    // 段々の上の低い塀（段の縁で撃ち合う）
    place(() => wall(9, 1.5), 20, 23, 0, T2);
    place(() => wall(7, 1.5), 45, 39, 0, T4);
    place(() => wall(6, 1.5), -3, 39.5, 0, T4);
  
    // ----- 岩・木 -----
    for (const [x, z, y0, s] of [[-50, 24, T2, 1.6], [15, 27, T2, 1.8], [40, 23, T2, 1.4], [-2, 44, T4, 1.5], [22, 45, T4, 1.7], [55, 44, T4, 1.4], [25, 7, V, 1.3], [-22, 5, V, 1.2]]) place(() => rock(s), x, z, rand(0, 3), y0);
    // 林（見通しが悪い）
    for (const [x, z, y0, s] of [[-60, 8, V, 1], [-54, 12, V, 1.1], [-58, 16, V, 0.9], [-52, 6, V, 1], [-62, 24, T2, 1.1], [-55, 27, T2, 1], [-50, 30, T2, 0.9], [-63, 32, T2, 1], [35, 41, T4, 1], [5, 31, T2, 0.9]]) place(() => tree(s), x, z, rand(0, 3), y0, { r: 0.45 * s, h: 3 * s });
  
    // ----- 外周の崖（高い石の壁） -----
    solidBox(-H - 3, H + 3, G0, PL + 4, H, H + 3, stoneM);
    solidBox(H, H + 3, G0, PL + 4, -H - 3, H + 3, stoneM);
  }
  finishMap();
}

// ================= マップ2：山寺の石段（日暮れ・110m 四方・点対称） =================
// 麓 LOW → 中段 MID（5m 上）→ 境内 TOP（さらに 5m 上）。真ん中に本堂。出撃は麓の隅の山門
const moonStoneM = mat(P.nezumi[0], { roughness: 1 });
moonStoneM.userData.surf = 'stone';
const bellM = mat(P.kin[0], { roughness: 0.5 });   // 鐘（撃つと鳴る）
const lanternLitM = new THREE.MeshBasicMaterial({ color: P.kin[2] });
const glowTex = canvasTex(64, 64, (g, w) => {
  const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
  r.addColorStop(0, rgba(P.kin[2], 0.9)); r.addColorStop(0.35, rgba(P.daidai[2], 0.35)); r.addColorStop(1, rgba(P.daidai[1], 0));
  g.fillStyle = r; g.fillRect(0, 0, w, w);
});
const glowM = new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
function buildTemple() {
  const LOW = G0 + 0.4, MID = LOW + 5, TOP = MID + 5;
  beginMap('temple', {
    lv: { V: LOW, LOW, MID, TOP },
    spawn: { x: -46.5, z: -46.5 },
    water: G0 + 0.3,
    // dark: こわい（暗い・霧が濃い）/ そうでなければ見やすい
    atmos: dark => ({
      top: C(P.ai[0]).multiplyScalar(dark ? 0.28 : 0.5), hor: C(P.daidai[1]).multiplyScalar(dark ? 0.55 : 0.85), bot: C(P.sumi[0]),
      sunDir: new V3(-0.9, 0.2, 0.35), sunCol: C(P.daidai[2]), sunI: dark ? 0.5 : 0.8,
      hemiSky: C(P.ai[1]), hemiGround: C(P.sumi[0]), hemiI: dark ? 0.16 : 0.3,
      fog: C(P.ai[0]).multiplyScalar(dark ? 0.3 : 0.5), near: dark ? 8 : 20, far: dark ? 85 : 150, clouds: false,
    }),
  });
  const darkStoneM = moonStoneM;
  const lowM = sides(earthM, topM(P.midori[0])), midM = sides(darkStoneM, topM(P.moegi[0])), topGravelM = sides(darkStoneM, topM(P.nezumi[0]));
  topGravelM[2].userData.surf = 'gravel';
  const redM = mat(P.shu[1], { roughness: 0.8 });

  // ----- 土地（池の所だけ低い） -----
  land(-55, 55, -55, -52, LOW, lowM, false);
  land(-55, 15, -52, -42, LOW, lowM, false); land(33, 55, -52, -42, LOW, lowM, false);
  land(-55, 55, -42, 42, LOW, lowM, false);
  land(-55, -33, 42, 52, LOW, lowM, false); land(-15, 55, 42, 52, LOW, lowM, false);
  land(-55, 55, 52, 55, LOW, lowM, false);
  land(-37, 37, -37, 37, MID, midM, false);          // 中段（縁は崖）
  land(-17, 17, -17, 17, TOP, topGravelM, false);    // 境内（砂利）
  // 池（黒い水。中は遅い）
  for (const s of [1, -1]) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(18, 10), toon({ color: C(P.ai[0]).multiplyScalar(0.5), transparent: true, opacity: 0.85 }));
    w.rotation.x = -Math.PI / 2; w.position.set(24 * s, G0 + 0.25, -47 * s); cur.group.add(w);
  }
  // ----- 外周の崖 -----
  solidBox(-58, 58, G0, G0 + 16, 55, 58, darkStoneM);
  solidBox(55, 58, G0, G0 + 16, -58, 58, darkStoneM);

  // ----- 階段 -----
  stairsAt('z', -26.5, -37, 1, LOW, MID, 5);    // 長い石段：麓 → 中段
  stairsAt('z', 0, -17, 1, MID, TOP, 6);        // 正面の石段：中段 → 境内
  stairsAt('x', 5, -17, 1, MID, TOP, 3);        // 裏道：崖ぞいの細い石段
  // 参道（山門 → 長い石段）
  for (const s of [1, -1]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(12, 3), mat(P.kiji[0], { roughness: 1 })); p.rotation.x = -Math.PI / 2; p.position.set(-35 * s, LOW + 0.02, -46.5 * s); p.receiveShadow = true; cur.group.add(p); }

  // ----- 山門（出撃）：柱4本と屋根。境内側に白壁 -----
  for (const [x, z] of [[-51, -49.5], [-42, -49.5], [-51, -43.5], [-42, -43.5]])
    place(() => { const g = new THREE.Group(); const p = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 4.2, 6), woodSideM); p.position.y = 2.1; g.add(p); return g; }, x, z, 0, LOW, { r: 0.3, h: 4.2 });
  solidBox(-52.5, -40.5, LOW + 4.2, LOW + 4.8, -50.5, -42.5, roofM, true);
  solidBox(-51.5, -41.5, LOW + 4.8, LOW + 5.4, -47, -46, roofM);
  solidBox(-52, -43, LOW, LOW + 3, -42.8, -42.3, plasterM);

  // ----- 鳥居（正面の石段の下） -----
  place(() => { const g = new THREE.Group(); const p = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.35, 4.6, 8), redM); p.position.y = 2.3; g.add(p); return g; }, -3.8, -31, 0, MID, { r: 0.35, h: 4.6 });
  place(() => { const g = new THREE.Group(); const p = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.35, 4.6, 8), redM); p.position.y = 2.3; g.add(p); return g; }, 3.8, -31, 0, MID, { r: 0.35, h: 4.6 });
  for (const s of [1, -1]) {
    const k = boxMesh(10.4, 0.45, 0.6, redM); k.position.set(0, MID + 4.75, -31 * s); deco(k);
    const n = boxMesh(8.6, 0.3, 0.4, redM); n.position.set(0, MID + 3.9, -31 * s); deco(n);
    const t = boxMesh(11, 0.25, 0.8, mat(P.sumi[1])); t.position.set(0, MID + 5.1, -31 * s); deco(t);
  }

  // ----- 本堂（真ん中に1つ）：縁側の床、四方に入口のある壁、2段の屋根 -----
  const floorM = sides(woodSideM, topM(P.kiji[0])); floorM[2].userData.surf = 'wood';
  land(-11, 11, -8, 8, TOP + 0.4, floorM, false);
  const WY0 = TOP + 0.4, WY1 = TOP + 3.8;
  for (const [x0, x1] of [[-9.8, -1.6], [1.6, 9.8]]) solidBox(x0, x1, WY0, WY1, -6.8, -6.45, plasterM);   // 北（と南）の壁
  for (const [z0, z1] of [[-6.8, -1.6], [1.6, 6.8]]) solidBox(-9.8, -9.45, WY0, WY1, z0, z1, plasterM);   // 西（と東）の壁
  for (const [x, z] of [[-10.7, -7.7], [-5, -7.7], [5, -7.7], [10.7, -7.7], [-10.7, -3.5], [-10.7, 3.5], [-5, 0]])
    place(() => { const g = new THREE.Group(); const p = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, WY1 - WY0, 6), woodSideM); p.position.y = (WY1 - WY0) / 2; g.add(p); return g; }, x, z, 0, WY0, { r: 0.25, h: WY1 - WY0 });
  solidBox(-12, 12, WY1, WY1 + 0.6, -9.5, 9.5, roofM, true, false);
  solidBox(-7.5, 7.5, WY1 + 0.6, WY1 + 1.8, -4.5, 4.5, roofM, true, false);
  solidBox(-8.2, 8.2, WY1 + 1.8, WY1 + 2.3, -0.5, 0.5, roofM, true, false);
  solidBox(-1.5, 1.5, WY0, WY0 + 1.1, -1, 1, woodSideM, false, false);   // 祭壇
  { const s = new THREE.Sprite(glowM); s.scale.setScalar(4); s.position.set(0, WY0 + 1.8, 0); cur.group.add(s); }

  // ----- 鐘楼（境内の角。石の台は壁登りで上がる） -----
  land(-15, -10, -15, -10, TOP + 2.6, sides(darkStoneM, topM(P.nezumi[0])));
  for (const [x, z] of [[-14.6, -14.6], [-10.4, -14.6], [-14.6, -10.4], [-10.4, -10.4]])
    place(() => { const g = new THREE.Group(); const p = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 2.6, 6), woodSideM); p.position.y = 1.3; g.add(p); return g; }, x, z, 0, TOP + 2.6, { r: 0.18, h: 2.6 });
  solidBox(-15.8, -9.2, TOP + 5.2, TOP + 5.7, -15.8, -9.2, roofM);
  for (const s of [1, -1]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.75, 1.3, 10), bellM); b.position.set(-12.5 * s, TOP + 4.3, -12.5 * s); deco(b); }

  // ----- 石垣（境内・中段の縁の低い遮蔽） -----
  solidBox(5, 14, TOP, TOP + 1.2, -17, -16.3, darkStoneM);
  solidBox(-17, -16.3, TOP, TOP + 1.2, -11, -4, darkStoneM);
  solidBox(-20, -12, MID, MID + 1.2, -37, -36.3, darkStoneM);
  solidBox(-37, -36.3, MID, MID + 1.2, 8, 16, darkStoneM);

  // ----- 墓地（中段の隅。墓石が低い遮蔽） -----
  for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) {
    const x = 11 + i * 4.4 + rand(-0.4, 0.4), z = -33 + j * 4;
    solidBox(x - 0.4, x + 0.4, MID, MID + rand(1, 1.4), z - 0.2, z + 0.2, darkStoneM);
    solidBox(x - 0.55, x + 0.55, MID, MID + 0.3, z - 0.4, z + 0.4, stoneM);
  }
  for (const s of [1, -1]) for (let i = 0; i < 8; i++) {
    const t = boxMesh(0.12, 1.8, 0.04, mat(P.kiji[1])); t.position.set((12 + i * 2.6) * s, MID + 0.9, (-35.2 + rand(-0.2, 0.2)) * s); t.rotation.z = rand(-0.15, 0.15); deco(t, false);
  }

  // ----- 石灯籠（暗い中の灯り） -----
  const lantern = () => {
    const g = new THREE.Group();
    const add = (m, w, h, y, d = w) => { const b = boxMesh(w, h, d, m); b.position.y = y; g.add(b); };
    add(stoneM, 0.7, 0.3, 0.15); add(stoneM, 0.28, 0.9, 0.75); add(stoneM, 0.62, 0.15, 1.27);
    add(lanternLitM, 0.46, 0.4, 1.55); add(roofM, 0.9, 0.22, 1.86); add(roofM, 0.3, 0.2, 2.07);
    return g;
  };
  const lanterns = [[-30.4, -48.5, LOW], [-22.6, -48.5, LOW], [-30.4, -44, LOW], [-22.6, -44, LOW], [-30.4, -39.5, LOW], [-22.6, -39.5, LOW],
    [-4.8, -26, MID], [4.8, -26, MID], [-7.5, -13.5, TOP], [7.5, -13.5, TOP], [-40, -41.8, LOW]];
  for (const [x, z, y] of lanterns) {
    place(lantern, x, z, 0, y, { r: 0.4, h: 2.2 });
    for (const s of [1, -1]) { const sp = new THREE.Sprite(glowM); sp.scale.setScalar(3.2); sp.position.set(x * s, y + 1.55, z * s); cur.group.add(sp); }
  }

  // ----- 竹林（太めの竹の株を不規則に。当たり判定は株ごとにまとめて） -----
  // 濃い所と薄い所をなだらかな波で作り、株どうしは少し離す。株は 1〜4 本
  const stalks = [], tops = [];
  const grove = (x0, x1, z0, z1, y) => {
    const pts = [], dens = (x, z) => 0.55 + 0.45 * Math.sin(x * 0.55 + z * 0.23) * Math.cos(z * 0.47 - x * 0.19);
    for (let tries = 0; tries < (x1 - x0) * (z1 - z0) * 1.2; tries++) {
      const cx = rand(x0 + 0.6, x1 - 0.6), cz = rand(z0 + 0.6, z1 - 0.6);
      if (Math.random() > dens(cx, cz)) continue;
      if (pts.some(([px, pz]) => (px - cx) ** 2 + (pz - cz) ** 2 < 1.5 * 1.5)) continue;
      pts.push([cx, cz]);
    }
    for (const [cx, cz] of pts) {
      const n = 1 + Math.floor(Math.random() * 4), spread = n > 1 ? rand(0.25, 0.55) : 0;
      const parts = [...Array(n)].map(() => [rand(0, 6.3), rand(0.3, 1) * spread, rand(0.11, 0.17), rand(7, 11), rand(-0.05, 0.05)]);
      const topY = rand(6.5, 9.5), topS = rand(1.6, 2.4);
      for (const s of [1, -1]) {
        for (const [a, r, rad, h, lean] of parts) {
          const x = (cx + Math.cos(a) * r) * s, z = (cz + Math.sin(a) * r) * s;
          stalks.push(M4(x, y + h / 2, z, 0, rad, h).premultiply(new THREE.Matrix4().makeRotationZ(lean * s)).setPosition(x, y + h / 2, z));
        }
        tops.push(M4(cx * s, y + topY, cz * s, 0, topS, 0.8));
        cur.colliders.push({ kind: 'cyl', x: cx * s, z: cz * s, r: spread + 0.2, y0: y, y1: y + 7, walk: false });
      }
    }
  };
  grove(-35, -22, -15, 1, MID);
  grove(-55, -42, 3, 33, LOW);
  const stalkG = new THREE.CylinderGeometry(0.85, 1, 1, 6), topG = flatGeo(new THREE.IcosahedronGeometry(1, 0));
  const inst = (geo, m, list, block) => {
    const im = new THREE.InstancedMesh(geo, m, list.length);
    list.forEach((mm, i) => im.setMatrixAt(i, mm));
    im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere();
    cur.group.add(im); if (block) cur.props.push(im);
  };
  inst(stalkG, mat(P.moegi[1]), stalks, true);
  inst(topG, mat(P.midori[0]), tops, false);

  // ----- 岩・木 -----
  const darkLeaf = [mat(P.midori[0]), mat(P.moegi[0]), mat(P.midori[0])];
  for (const [x, z, y, s] of [[-5, -47, LOW, 1.4], [44, -38, LOW, 1.2], [-44, -24, LOW, 1.5], [26, -20, MID, 1.1]]) place(() => rock(s, darkStoneM), x, z, rand(0, 3), y);
  for (const [x, z, y, s] of [[-46, -18, LOW, 1.1], [-12, -46, LOW, 1], [40, -48, LOW, 1.2], [-31, 26, MID, 0.9]]) place(() => tree(s, darkLeaf), x, z, rand(0, 3), y, { r: 0.45 * s, h: 3 * s });
  finishMap();
}

// ================= マップ3：雪の温泉街（夜・110m 四方・点対称） =================
// 外側が高い盆地。高さ：露天風呂の底 = GROUND、広場 L、町 U（出撃もここ）
// 左上（-x,-z）に2階建ての旅館、右上（+x,-z）に土産物屋の並び。右下・左下はその点対称
function buildOnsen() {
  const L = G0 + 1, U = G0 + 3.5, BATH_R = 15;
  beginMap('onsen', {
    lv: { V: U, L, U },
    spawn: { x: -48, z: 48 },
    water: G0 + 0.5,   // 湯の中は遅い
    atmos: () => ({
      top: C(P.ai[0]).multiplyScalar(0.25), hor: C(P.ai[1]).multiplyScalar(0.45), bot: C(P.sumi[0]),
      sunDir: new V3(0.35, 0.6, -0.5), sunCol: C(P.ao[2]), sunI: 0.4,   // 月明かり
      hemiSky: C(P.ai[2]), hemiGround: C(P.shiro[1]), hemiI: 0.35,     // 雪の照り返し
      fog: C(P.ai[0]).multiplyScalar(0.45), near: 12, far: 95, clouds: false,
    }),
  });
  const snowTop = topM(P.shiro[2]); snowTop.userData.surf = 'gravel';   // 雪（足音は砂利で代用）
  const pavedTop = topM(P.shiro[1]); pavedTop.userData.surf = 'stone';  // 雪の残る石畳
  const snowM = mat(P.shiro[2], { roughness: 1 }); snowM.userData.surf = 'gravel';
  const cliffM = moonStoneM;
  const townM = sides(cliffM, snowTop), plazaM = sides(stoneM, pavedTop);
  const floorM = sides(woodSideM, topM(P.kiji[1])); floorM[2].userData.surf = 'wood';
  const redM = mat(P.shu[1], { roughness: 0.8 });

  // ----- 土地：外側の町（U）と、内側の広場（L）。広場の真ん中に丸い露天風呂の穴 -----
  land(-55, 55, -55, -30, U, townM, false); land(-55, 55, 30, 55, U, townM, false);
  land(-55, -30, -30, 30, U, townM, false); land(30, 55, -30, 30, U, townM, false);
  for (let z = -30; z < 30; z += 1.5) {
    const zc = z + 0.75, w = Math.abs(zc) < BATH_R ? Math.sqrt(BATH_R * BATH_R - zc * zc) : 0;
    if (!w) land(-30, 30, z, z + 1.5, L, plazaM, false);
    else { land(-30, -w, z, z + 1.5, L, plazaM, false); land(w, 30, z, z + 1.5, L, plazaM, false); }
  }
  // 外周の崖
  solidBox(-58, 58, G0, G0 + 16, 55, 58, sides(cliffM, snowTop));
  solidBox(55, 58, G0, G0 + 16, -58, 58, sides(cliffM, snowTop));

  // ----- 露天風呂：石の底、湯（半透明）、縁の岩、真ん中の大岩（登れる） -----
  {
    const bed = new THREE.Mesh(new THREE.CircleGeometry(BATH_R + 1, 28), mat(P.nezumi[0], { roughness: 1 }));
    bed.rotation.x = -Math.PI / 2; bed.position.y = G0 + 0.02; cur.group.add(bed);
    const water = new THREE.Mesh(new THREE.CircleGeometry(BATH_R + 1, 28), toon({ color: C(P.ao[2]).lerp(C(P.shiro[2]), 0.35), transparent: true, opacity: 0.72 }));
    water.rotation.x = -Math.PI / 2; water.position.y = G0 + 0.75; cur.group.add(water);
    const big = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0), stoneM);
    big.scale.set(3.4, 3.4, 3.1); big.position.y = G0 + 0.6; big.rotation.y = 0.4; deco(big);
    cur.colliders.push({ kind: 'box', min: new V3(-2.5, G0, -2.3), max: new V3(2.5, G0 + 3.4, 2.3), walk: true, surf: 'stone' });
    for (let a = 0.2; a < Math.PI; a += Math.PI / 6) {
      const r = BATH_R + 0.3, s = 0.7 + (Math.sin(a * 5) + 1) * 0.25;
      place(() => rock(s), Math.cos(a) * r, Math.sin(a) * r, a, L - 0.4);
    }
  }

  // ----- 階段（町 → 広場） -----
  stairsAt('z', 22, -30, -1, L, U, 6);      // 坂道の大きな石段（提灯が並ぶ）
  stairsAt('x', 8, 30, 1, L, U, 4);         // 横の石段
  stairsAt('z', -19, -30, -1, L, U, 4);     // 旅館からの渡り廊下（屋根つき）

  // ----- 旅館（2階建て。1階：玄関・広間、2階：客室の窓から風呂を見下ろせる。屋根にも出られる） -----
  {
    const X0 = -50, X1 = -16, Z0 = -50, Z1 = -33, F2 = U + 3.5, RF = U + 6.7;
    solidBox(X0 + 0.4, X1 - 0.4, U, U + 0.05, Z0 + 0.4, Z1 - 0.4, floorM, true);   // 1階の床
    // 正面（風呂側）：1階は玄関2つ、2階は窓が並ぶ
    for (const [a, b] of [[X0, -40], [-38, -20.5], [-17.5, X1]]) solidBox(a, b, U, F2, Z1 - 0.4, Z1, plasterM);
    solidBox(X0, X1, F2, F2 + 1, Z1 - 0.4, Z1, woodSideM);
    solidBox(X0, X1, RF - 1, RF, Z1 - 0.4, Z1, plasterM);
    for (const x of [X0, -41.5, -33, -24.5, X1 - 1]) solidBox(x, x + 1, F2 + 1, RF - 1, Z1 - 0.4, Z1, woodSideM);
    // 裏と左は壁、右（東）は1階に勝手口、2階に窓（角は正面と裏の壁が受け持つ。重ねると面がちらつくので）
    const ZA = Z0 + 0.4, ZB = Z1 - 0.4;
    solidBox(X0, X1, U, RF, Z0, ZA, plasterM);
    solidBox(X0, X0 + 0.4, U, RF, ZA, ZB, plasterM);
    solidBox(X1 - 0.4, X1, U, F2, ZA, -44, plasterM); solidBox(X1 - 0.4, X1, U, F2, -41, ZB, plasterM);
    solidBox(X1 - 0.4, X1, F2, F2 + 1, ZA, ZB, woodSideM); solidBox(X1 - 0.4, X1, RF - 1, RF, ZA, ZB, plasterM);
    solidBox(X1 - 0.4, X1, F2 + 1, RF - 1, ZA, -45, plasterM); solidBox(X1 - 0.4, X1, F2 + 1, RF - 1, -40, ZB, plasterM);
    // 2階の床（奥の階段の所だけ穴）と、奥の壁ぞいの階段
    const SX0 = -33, SX1 = -24, SZ0 = -48.2, SZ1 = -45.8;
    solidBox(X0 + 0.4, SX0, F2 - 0.3, F2, Z0 + 0.4, Z1 - 0.4, floorM, true);
    solidBox(SX1, X1 - 0.4, F2 - 0.3, F2, Z0 + 0.4, Z1 - 0.4, floorM, true);
    solidBox(SX0, SX1, F2 - 0.3, F2, SZ1, Z1 - 0.4, floorM, true);
    solidBox(SX0, SX1, F2 - 0.3, F2, Z0 + 0.4, SZ0, floorM, true);
    stairsAt('x', (SZ0 + SZ1) / 2, SX0, -1, U, F2, SZ1 - SZ0, woodSideM);
    // 1階の柱
    for (const x of [-42, -30]) place(() => { const g = new THREE.Group(); const p = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, F2 - U, 6), woodSideM); p.position.y = (F2 - U) / 2; g.add(p); return g; }, x, -39, 0, U, { r: 0.22, h: F2 - U });
    // 2階の間仕切り（客室）
    for (const x of [-41.5, -24.5]) solidBox(x, x + 0.25, F2, RF - 1, Z0 + 0.4, -42, plasterM);
    // 屋根（雪が積もっていて歩ける）
    solidBox(X0 - 1, X1 + 1, RF, RF + 0.4, Z0 - 1, Z1 + 1, roofM, true);
    solidBox(X0 - 0.8, X1 + 0.8, RF + 0.4, RF + 0.7, Z0 - 0.8, Z1 + 0.8, sides(snowM, snowTop), true);
    solidBox(X0, X1, RF + 0.7, RF + 1.3, -43, -40, sides(roofM, snowTop), true);
    // 部屋の灯り
    for (const [x, z, y] of [[-44, -41, U + 2.4], [-26, -38, U + 2.4], [-46, -38, F2 + 2], [-37, -38, F2 + 2], [-29, -38, F2 + 2], [-20, -38, F2 + 2]])
      for (const s of [1, -1]) { const sp = new THREE.Sprite(glowM); sp.scale.setScalar(4); sp.position.set(x * s, y, z * s); cur.group.add(sp); }
  }

  // ----- 渡り廊下の屋根と脱衣所（旅館 → 風呂の裏道） -----
  {
    const RY = U + 2.7;
    for (const [x, z, y] of [[-21.2, -32.5, U], [-16.8, -32.5, U], [-21.2, -27.5, L], [-16.8, -27.5, L]])
      place(() => { const g = new THREE.Group(); const p = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, RY - y, 6), woodSideM); p.position.y = (RY - y) / 2; g.add(p); return g; }, x, z, 0, y, { r: 0.15, h: RY - y });
    solidBox(-22, -16, RY, RY + 0.3, -33, -18.6, roofM, true);
    solidBox(-21.9, -16.1, RY + 0.3, RY + 0.45, -32.9, -18.7, sides(snowM, snowTop), true);
    // 脱衣所（広場の上。風呂側に出口）
    solidBox(-22, -21.7, L, RY, -24.5, -18.9, plasterM);
    solidBox(-16.3, -16, L, RY, -24.5, -18.9, plasterM);
    for (const [a, b] of [[-22, -20], [-18, -16]]) solidBox(a, b, L, RY, -18.9, -18.6, plasterM);
    solidBox(-20, -18, L + 2.2, RY, -18.9, -18.6, plasterM);
    // のれん（赤、弾は抜ける飾り）
    const n = boxMesh(1.9, 0.9, 0.05, redM); n.position.set(-19, L + 1.75, -18.5); deco(n, false);
    const n2 = n.clone(); n2.position.set(19, L + 1.75, 18.5); deco(n2, false);
  }

  // ----- 土産物屋・民家（平屋。店先が開いていて中に入れる。屋根は雪で歩ける） -----
  const house = (x0, x1, z0, z1, face) => {   // face: 'z' なら +z 側が店先、'x' なら -x 側が店先
    const H1 = U + 3.2;
    // 壁どうしは重ねない（重なった面がちらつくので、角は店先と裏の壁が受け持つ）
    if (face === 'z') {
      solidBox(x0, x1, U, H1, z0, z0 + 0.3, plasterM);
      solidBox(x0, x0 + 0.3, U, H1, z0 + 0.3, z1 - 0.3, plasterM); solidBox(x1 - 0.3, x1, U, H1, z0 + 0.3, z1 - 0.3, plasterM);
      solidBox(x0, x0 + 1.4, U, H1, z1 - 0.3, z1, woodSideM); solidBox(x1 - 1.4, x1, U, H1, z1 - 0.3, z1, woodSideM);
      solidBox(x0 + 1.4, x1 - 1.4, U + 2.4, H1, z1 - 0.3, z1, woodSideM);
    } else {
      solidBox(x1 - 0.3, x1, U, H1, z0, z1, plasterM);
      solidBox(x0 + 0.3, x1 - 0.3, U, H1, z0, z0 + 0.3, plasterM); solidBox(x0 + 0.3, x1 - 0.3, U, H1, z1 - 0.3, z1, plasterM);
      solidBox(x0, x0 + 0.3, U, H1, z0, z0 + 1.4, woodSideM); solidBox(x0, x0 + 0.3, U, H1, z1 - 1.4, z1, woodSideM);
      solidBox(x0, x0 + 0.3, U + 2.4, H1, z0 + 1.4, z1 - 1.4, woodSideM);
    }
    solidBox(x0 + 0.3, x1 - 0.3, U, U + 0.05, z0 + 0.3, z1 - 0.3, floorM, true);
    solidBox(x0 - 0.4, x1 + 0.4, H1, H1 + 0.3, z0 - 0.4, z1 + 0.4, roofM, true);
    solidBox(x0 - 0.3, x1 + 0.3, H1 + 0.3, H1 + 0.6, z0 - 0.3, z1 + 0.3, sides(snowM, snowTop), true);
  };
  house(-1, 10.7, -50, -42, 'z'); house(14, 26, -50, -42, 'z'); house(29, 41, -50, -42, 'z');
  house(38.5, 50, -36.7, -27, 'x'); house(38.5, 50, -21.6, -12, 'x');
  // 屋根伝いの板（家と家のすき間を渡る）
  const RT = U + 3.8;
  solidBox(10.7, 14, RT - 0.2, RT, -46.6, -45.4, woodSideM, true);
  solidBox(26, 29, RT - 0.2, RT, -46.6, -45.4, woodSideM, true);
  solidBox(39, 40.2, RT - 0.2, RT, -41.6, -37, woodSideM, true);
  solidBox(43.6, 44.8, RT - 0.2, RT, -27, -21.6, woodSideM, true);

  // ----- 足湯（広場。低い石の縁と小さな屋根） -----
  {
    const x0 = -7, x1 = 1, z0 = -27, z1 = -23;
    solidBox(x0, x1, L, L + 0.5, z0, z0 + 0.4, stoneM); solidBox(x0, x1, L, L + 0.5, z1 - 0.4, z1, stoneM);
    solidBox(x0, x0 + 0.4, L, L + 0.5, z0 + 0.4, z1 - 0.4, stoneM); solidBox(x1 - 0.4, x1, L, L + 0.5, z0 + 0.4, z1 - 0.4, stoneM);
    for (const s of [1, -1]) { const w = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0 - 0.8, z1 - z0 - 0.8), toon({ color: C(P.ao[2]), transparent: true, opacity: 0.7 })); w.rotation.x = -Math.PI / 2; w.position.set((x0 + x1) / 2 * s, L + 0.3, (z0 + z1) / 2 * s); cur.group.add(w); }
    for (const [x, z] of [[x0 + 0.2, z0 + 0.2], [x1 - 0.2, z0 + 0.2], [x0 + 0.2, z1 - 0.2], [x1 - 0.2, z1 - 0.2]])
      place(() => { const g = new THREE.Group(); const p = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.6, 6), woodSideM); p.position.y = 1.3; g.add(p); return g; }, x, z, 0, L, { r: 0.12, h: 2.6 });
    solidBox(x0 - 0.6, x1 + 0.6, L + 2.6, L + 2.9, z0 - 0.6, z1 + 0.6, roofM, true);
    solidBox(x0 - 0.5, x1 + 0.5, L + 2.9, L + 3.1, z0 - 0.5, z1 + 0.5, sides(snowM, snowTop), true);
  }

  // ----- 竹垣（細い板の垣根。体は通れないが、弾は抜ける） -----
  for (const s of [1, -1]) {
    const f = boxMesh(0.15, 1.8, 16, mat(P.kiji[1])); f.position.set(-28 * s, L + 0.9, 0); deco(f, false);
    for (let z = -8; z <= 8; z += 2) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2, 5), mat(P.moegi[0])); p.position.set(-28 * s + 0.12 * s, L + 1, z); deco(p, false); }
    cur.colliders.push({ kind: 'box', min: new V3(-28 * s - 0.12, L, -8), max: new V3(-28 * s + 0.12, L + 1.8, 8), walk: false, surf: 'wood' });
  }

  // ----- 提灯（赤い紙の提灯を柱に下げる。夜の灯り） -----
  const chochin = () => {
    const g = new THREE.Group();
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 2.8, 6), woodSideM); p.position.y = 1.4; g.add(p);
    const arm = boxMesh(0.7, 0.08, 0.08, woodSideM); arm.position.set(0.3, 2.7, 0); g.add(arm);
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.6, 8), lanternLitM); lamp.position.set(0.55, 2.25, 0); g.add(lamp);
    return g;
  };
  const lamps = [[18.3, -31.5, U], [25.7, -31.5, U], [18.3, -23.5, L], [25.7, -23.5, L], [4, -39, U], [20, -39, U], [35, -39, U], [35, -8, U],
    [-12, -31.5, U], [-25, -31.5, U], [BATH_R + 3.5, -6, L], [-6, BATH_R + 3.5, L], [12, -BATH_R - 3.5, L]];
  for (const [x, z, y] of lamps) {
    place(chochin, x, z, 0, y, { r: 0.12, h: 2.8 });
    for (const s of [1, -1]) { const sp = new THREE.Sprite(glowM); sp.scale.setScalar(3.4); sp.position.set((x + 0.55) * s, y + 2.25, z * s); cur.group.add(sp); }
  }

  // ----- 雪をかぶった木（町の隅） -----
  const snowLeaf = [mat(P.midori[0]), mat(P.shiro[1]), mat(P.shiro[2])];
  for (const [x, z, sc] of [[-52, -20, 1.1], [-52, 5, 1], [-52, -8, 0.9], [53, 2, 0.8]]) place(() => tree(sc, snowLeaf), x, z, rand(0, 3), U, { r: 0.45 * sc, h: 3 * sc });
  finishMap();
}

// ================= マップ4：三つのピラミッド（真昼・110m 四方・点対称） =================
// 真ん中に大ピラミッド（高さ 20m・51°、南北に抜ける盗掘の穴と玄室）、左下と右上に小ピラミッド（中に小部屋）
// 左上と右下にマスタバ（平らな墓）の碁盤の目、東西に出撃の河岸神殿（一段低い列柱の中庭）と石の参道、舟坑
// 高さ：中庭と舟坑の底 = GROUND、砂地 B
// 四角形 r から、穴の四角形（holes）を除いた残りを、いくつかの四角形に分ける（z の帯ごとに x の区間を切る）
type Rect = { x0: number; x1: number; z0: number; z1: number };
function subtractRects(r: Rect, holes: Rect[]): Rect[] {
  const hs = holes.filter(h => h.x1 > r.x0 && h.x0 < r.x1 && h.z1 > r.z0 && h.z0 < r.z1);
  const zs = [...new Set([r.z0, r.z1, ...hs.flatMap(h => [h.z0, h.z1]).filter(z => z > r.z0 && z < r.z1)])].sort((a, b) => a - b);
  const out: Rect[] = [];
  for (let i = 0; i < zs.length - 1; i++) {
    const z0 = zs[i], z1 = zs[i + 1], zm = (z0 + z1) / 2;
    let xs: [number, number][] = [[r.x0, r.x1]];
    for (const h of hs) {
      if (zm < h.z0 || zm > h.z1) continue;
      xs = xs.flatMap(([a, b]) => (h.x1 <= a || h.x0 >= b ? [[a, b]] : [[a, Math.max(a, h.x0)], [Math.min(b, h.x1), b]].filter(([p, q]) => q - p > 1e-3)) as [number, number][]);
    }
    for (const [a, b] of xs) out.push({ x0: a, x1: b, z0, z1 });
  }
  return out;
}
// 51° のなめらかなピラミッド：見た目は4つの三角の面（入口の所だけ下を切り欠く）。当たり判定は kind 'pyr'
//   'pyr'：斜面には立てず、横へ押し出されて滑り落ちる。holes（通路・部屋）の中は判定しない（中の壁は別に置く）
//   door: 面ごとの入口 { face: 'n'|'s'|'w'|'e', w: 幅, h: 高さ }
function pyramid(cx, cz, half, y0, h, faceM, capM, holes: (Rect & { y1: number })[], doors: { face: string; w: number; h: number }[]) {
  const L = Math.hypot(h, half);
  const F = {
    n: { mid: new V3(cx, y0, cz - half), t: new V3(-1, 0, 0), a: new V3(0, h, half) },
    s: { mid: new V3(cx, y0, cz + half), t: new V3(1, 0, 0), a: new V3(0, h, -half) },
    w: { mid: new V3(cx - half, y0, cz), t: new V3(0, 0, 1), a: new V3(half, h, 0) },
    e: { mid: new V3(cx + half, y0, cz), t: new V3(0, 0, -1), a: new V3(-half, h, 0) },
  };
  const geos = [];
  for (const [k, f] of Object.entries(F)) {
    const d = doors.find(x => x.face === k), sh = new THREE.Shape();
    sh.moveTo(-half, 0);
    if (d) { const v1 = d.h * L / h; sh.lineTo(-d.w / 2, 0); sh.lineTo(-d.w / 2, v1); sh.lineTo(d.w / 2, v1); sh.lineTo(d.w / 2, 0); }
    sh.lineTo(half, 0); sh.lineTo(0, L); sh.lineTo(-half, 0);
    const g = new THREE.ShapeGeometry(sh).toNonIndexed(), p = g.attributes.position, uv = g.attributes.uv, a = f.a.clone().divideScalar(L), q = new V3();
    for (let i = 0; i < p.count; i++) {
      const u = p.getX(i);
      q.copy(f.mid).addScaledVector(f.t, u).addScaledVector(a, p.getY(i)); p.setXYZ(i, q.x, q.y, q.z);
      uv.setXY(i, u / 2.4, (q.y - y0) / 1.6);   // 石の段（0.8m ごと、絵は2段ぶん）と継ぎ目（2.4m ごと）
    }
    g.computeVertexNormals(); geos.push(g);
  }
  const body = new THREE.Mesh(mergeGeometries(geos), faceM); deco(body);
  // 金の冠石（上の 1 割）
  const ch = h * 0.1, cap = new THREE.Mesh(new THREE.ConeGeometry(half * 0.1 * Math.SQRT2 * 1.04, ch * 1.04, 4), capM);
  cap.rotation.y = Math.PI / 4; cap.position.set(cx, y0 + h - ch * 0.5 + 0.02, cz); deco(cap);
  // 物理（小物）用の階段状の箱：面の内側に収まる高さ 1.5m ずつの層から、通路と部屋を除く
  const phys = [];
  for (let y = y0; y < y0 + h - 0.5; y += 1.5) {
    const top = Math.min(y0 + h, y + 1.5), s = half * (1 - (top - y0) / h);
    const hs = holes.filter(o => o.y1 > y);
    for (const r of subtractRects({ x0: cx - s, x1: cx + s, z0: cz - s, z1: cz + s }, hs)) phys.push({ min: new V3(r.x0, y, r.z0), max: new V3(r.x1, top, r.z1) });
  }
  cur.colliders.push({ kind: 'pyr', cx, cz, half, y0, h, holes, phys, walk: false, surf: 'stone', min: new V3(cx - half, y0, cz - half), max: new V3(cx + half, y0 + h, cz + half) });
}
function buildDesert() {
  const B = G0 + 2;
  beginMap('desert', {
    lv: { V: G0 + 0.05, B },   // 出撃は河岸神殿の中庭の底
    spawn: { x: -45, z: -5 },
    water: G0 - 5,   // 水は無い
    atmos: () => ({
      top: C(P.ao[1]), hor: C(P.kiji[2]).lerp(C(P.ao[2]), 0.35), bot: C(P.kiji[1]),
      sunDir: new V3(0.35, 0.9, 0.25), sunCol: C(P.shiro[1]).lerp(C(P.kin[2]), 0.35), sunI: 1.0,   // 真上からの日差し（まぶしすぎない強さ）
      hemiSky: C(P.ao[1]), hemiGround: C(P.kiji[1]), hemiI: 0.36,
      fog: C(P.kiji[2]).lerp(C(P.ao[2]), 0.3), near: 70, far: 300, clouds: false, desert: true,
    }),
  });
  const sandTopM = topM(P.kiji[2]); sandTopM.userData.surf = 'sand';
  const sandSideM = mat(P.kiji[1], { roughness: 1 }); sandSideM.userData.surf = 'sand';
  const hiddenTop = new THREE.MeshBasicMaterial({ visible: false }); hiddenTop.userData.surf = 'sand';
  const sandM = sides(sandSideM, hiddenTop);   // 砂地の箱の上面は見せない（上になめらかな地形をかぶせる）
  const STONE = C(P.kiji[2]).lerp(C(P.nezumi[2]), 0.35).getHex();   // 砂岩（白すぎない温かい石の色）
  const limeM = mat(STONE, { roughness: 1 }); limeM.userData.surf = 'stone';
  // ピラミッドの化粧石：温かい石灰岩の色に、横の段と、段ごとにずれた縦の継ぎ目を描く
  const courseTex = canvasTex(128, 256, (g, w, hh) => {
    g.fillStyle = css(C(P.kiji[2]).lerp(C(P.nezumi[2]), 0.18).getHex()); g.fillRect(0, 0, w, hh);
    for (let i = 0; i < 600; i++) { g.fillStyle = rgba(i % 2 ? P.kiji[1] : P.shiro[2], 0.08); g.fillRect(rand(0, w), rand(0, hh), rand(2, 6), rand(1, 3)); }
    for (const [y0, j] of [[0, [0.3, 0.8]], [128, [0.05, 0.55]]] as [number, number[]][]) {   // 2段ぶん。上と下で継ぎ目をずらす
      g.fillStyle = rgba(P.kiji[0], 0.55); g.fillRect(0, y0 + 123, w, 5);                    // 段の境目（下の影）
      g.fillStyle = rgba(P.shiro[2], 0.22); g.fillRect(0, y0, w, 3);                          // 段の上の明るい縁
      g.fillStyle = rgba(P.kiji[0], 0.4); for (const x of j) g.fillRect(w * x, y0, 3, 123);   // 継ぎ目
    }
  });
  courseTex.wrapS = courseTex.wrapT = THREE.RepeatWrapping;
  const casingM = toon({ map: courseTex, side: THREE.DoubleSide }); casingM.userData.surf = 'stone';   // 裏も描く（中のすき間から空が見えないように）
  const goldM = mat(P.kin[1], { roughness: 0.5 });
  const stoneTop = topM(C(P.kiji[2]).lerp(C(P.nezumi[2]), 0.25).getHex()); stoneTop.userData.surf = 'stone';
  const stoneM = sides(limeM, stoneTop);
  const brickM = mat(P.daidai[2], { roughness: 1 }); brickM.userData.surf = 'stone';   // 日干しれんが
  const pavedTop = topM(P.nezumi[2]); pavedTop.userData.surf = 'stone';
  const pavedM = sides(limeM, pavedTop);
  const col = (r, h, m = limeM) => () => {
    const g = new THREE.Group();
    const p = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.08, h, 8), m); p.position.y = h / 2; g.add(p);
    const c = new THREE.Mesh(new THREE.BoxGeometry(r * 2.6, 0.3, r * 2.6), m); c.position.y = h - 0.15; g.add(c);
    return g;
  };

  // ----- 砂地（河岸神殿の中庭と舟坑だけ空けて、残りを B の高さで埋める） -----
  const COURT: Rect = { x0: -52, x1: -40, z0: -9, z1: 9 }, PIT: Rect = { x0: -30, x1: -14, z0: 23, z1: 26 };
  const mirror = (r: Rect): Rect => ({ x0: -r.x1, x1: -r.x0, z0: -r.z1, z1: -r.z0 });
  for (const r of subtractRects({ x0: -55, x1: 55, z0: -55, z1: 55 }, [COURT, mirror(COURT), PIT, mirror(PIT)])) land(r.x0, r.x1, r.z0, r.z1, B, sandM, false);
  // なめらかな地形：平らな所（建物のまわり・道・中庭のふち）以外に、なだらかな砂丘を盛る（点対称）
  //   当たり判定は kind 'hf'（1m ごとの高さの格子。上に立てる）。傾きは 0.35 以下なので歩いて越えられる
  const FLAT: Rect[] = [
    { x0: -17, x1: 17, z0: -17, z1: 17 }, { x0: -4, x1: 4, z0: -30, z1: 30 },           // 大ピラミッドと、南北の出口の道
    { x0: -54, x1: 54, z0: -7, z1: 7 },                                                  // 参道と河岸神殿（東西）
    { x0: -47, x1: -29, z0: 29, z1: 47 }, { x0: -48, x1: -22, z0: -48, z1: -26 },       // 小ピラミッド・列柱の神殿跡
    { x0: 8, x1: 30, z0: -50, z1: -28 }, { x0: -36, x1: -24, z0: 9, z1: 21 },           // 野営地とやぐら・オアシス
    { x0: -31, x1: -13, z0: 22, z1: 27 }, { x0: -9, x1: 9, z0: -30, z1: -23 },          // 舟坑・塔門
    { x0: -55, x1: 55, z0: -55, z1: -51 }, { x0: -55, x1: -51, z0: -55, z1: 55 },       // 外壁ぞい
  ];
  const flats = FLAT.flatMap(r => [r, mirror(r)]);
  const DUNES = [[-10, -43, 3, 8.5], [-30, -17, 2, 5.5], [-47, -19, 2.2, 5], [-20, -10, 1.6, 4.5], [-2, -45, 2, 6], [-40, 22, 1.8, 4.5], [-12, 40, 2.4, 6]];
  const bumps = DUNES.flatMap(([x, z, h, r]) => [[x, z, h, r], [-x, -z, h, r]]);
  const flatK = (x, z) => {   // 平らな所からの離れ具合（0：平ら 〜 1：3m 以上離れた）
    let k = 1;
    for (const r of flats) { const dx = Math.max(r.x0 - x, 0, x - r.x1), dz = Math.max(r.z0 - z, 0, z - r.z1); k = Math.min(k, Math.hypot(dx, dz) / 3); }
    k = Math.min(1, k); return k * k * (3 - 2 * k);
  };
  const HN = 111, HX = -55, hts = new Float32Array(HN * HN);
  for (let j = 0; j < HN; j++) for (let i = 0; i < HN; i++) {
    const x = HX + i, z = HX + j;
    let b = 0; for (const [bx, bz, bh, br] of bumps) b += bh * Math.exp(-((x - bx) ** 2 + (z - bz) ** 2) / (br * br));
    hts[j * HN + i] = B + b * flatK(x, z);
  }
  const HOLES = [COURT, mirror(COURT), PIT, mirror(PIT)];
  const inHole = (x, z) => HOLES.some(r => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1);
  const hAt = (x, z) => {   // その場所の地形の高さ（格子の間はなめらかにつなぐ）
    if (inHole(x, z)) return G0;
    const fx = clamp(x - HX, 0, HN - 1.001), fz = clamp(z - HX, 0, HN - 1.001), i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    const h = (a, b) => hts[b * HN + a];
    return (h(i, j) * (1 - u) + h(i + 1, j) * u) * (1 - v) + (h(i, j + 1) * (1 - u) + h(i + 1, j + 1) * u) * v;
  };
  let hmax = B; for (const v of hts) hmax = Math.max(hmax, v);
  const holeV = new Uint8Array(HN * HN); for (let j = 0; j < HN; j++) for (let i = 0; i < HN; i++) holeV[j * HN + i] = inHole(HX + i, HX + j) ? 1 : 0;
  cur.colliders.push({ kind: 'hf', at: hAt, hts, holeV, n: HN, x0: HX, walk: true, surf: 'sand', min: new V3(-55, G0, -55), max: new V3(55, hmax, 55) });
  // 見た目：格子の面（中庭と舟坑の所は抜く）。砂の色を少しずつ変え、高い所ほど明るく
  const terrain = (() => {
    const pos = [], col = [], idx = [], c = new THREE.Color();
    for (let j = 0; j < HN; j++) for (let i = 0; i < HN; i++) {
      const h = hts[j * HN + i]; pos.push(HX + i, h, HX + j);
      c.copy(C(P.kiji[2])).lerp(C(P.kiji[1]), 0.12).lerp(C(P.shiro[2]), clamp((h - B) / 6, 0, 0.1)).offsetHSL(0, 0, (Math.sin(i * 1.7 + j * 0.9) + Math.sin(i * 0.37 - j * 1.3)) * 0.012);
      col.push(c.r, c.g, c.b);
    }
    for (let j = 0; j < HN - 1; j++) for (let i = 0; i < HN - 1; i++) {
      if (inHole(HX + i + 0.5, HX + j + 0.5)) continue;
      const a = j * HN + i, b = a + 1, d = a + HN, e = d + 1;
      idx.push(a, d, b, b, d, e);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, toon({ vertexColors: true })); m.receiveShadow = true;
    return m;
  })();

  // 外周の崖（砂岩）と外壁（ところどころ低い）
  solidBox(-58, 58, G0, B + 10, 55, 58, sides(sandSideM, sandTopM));
  solidBox(55, 58, G0, B + 10, -58, 58, sides(sandSideM, sandTopM));
  for (const [a, b, h] of [[-53, -20, 3], [-20, -12, 1.3], [-12, 53, 3]]) {
    solidBox(a, b, B, B + h, -55, -53, brickM, true);
    solidBox(-55, -53, B, B + h, a, b, brickM, true);
  }
  solidBox(-55, -53, B, B + 3, -55, -53, brickM, true); solidBox(-55, -53, B, B + 3, 53, 55, brickM, true);   // 角

  // ----- 1 大ピラミッド（底 32m・高さ 20m・51°）。2 南北に抜ける盗掘の穴と、真ん中の玄室 -----
  {
    const half = 16, h = half * Math.tan(51 * Math.PI / 180), TH = 3, CH = 3.5;
    pyramid(0, 0, half, B, h, casingM, goldM,
      [{ x0: -1.5, x1: 1.5, z0: -half - 2, z1: half + 2, y1: B + TH }, { x0: -3, x1: 3, z0: -3, z1: 3, y1: B + CH }],
      [{ face: 'n', w: 3.8, h: CH }, { face: 's', w: 3.8, h: CH }]);
    const zo = half + 0.9;   // 門の前の端（ピラミッドの底より少し外）
    solidBox(-1.9, -1.5, B, B + TH, -zo, -3.4, limeM); solidBox(1.5, 1.9, B, B + TH, -zo, -3.4, limeM);   // 通路の壁（と点対称）
    solidBox(-1.9, 1.9, B + TH, B + CH, -zo, -3.4, stoneM, true);   // 通路の天井（玄室の天井と同じ高さまで。すき間を作らない）
    solidBox(-2.5, -1.9, B, B + CH, -zo - 0.1, -half + 1.5, stoneM); solidBox(1.9, 2.5, B, B + CH, -zo - 0.1, -half + 1.5, stoneM);   // 門柱
    solidBox(-2.7, 2.7, B + CH, B + CH + 0.7, -zo - 0.2, -half + 1.5, stoneM, true);   // まぐさ石
    solidBox(-3.4, -3, B, B + CH, -3.4, 3.4, limeM);                        // 玄室の壁
    solidBox(-3, -1.5, B, B + CH, -3.4, -3, limeM); solidBox(1.5, 3, B, B + CH, -3.4, -3, limeM);
    solidBox(-3.4, 3.4, B + CH, B + CH + 0.4, -3.4, 3.4, stoneM, true, false);   // 玄室の天井
    solidBox(-1.1, 1.1, B, B + 1, -0.5, 0.5, sides(mat(P.nezumi[1]), topM(P.nezumi[2])), false, false);   // 石棺
  }

  // ----- 3 小ピラミッド（左下と右上。底 14m・高さ 8.6m。東西に抜ける通路と、真ん中の小部屋） -----
  {
    const cx = -38, cz = 38, half = 7, h = half * Math.tan(51 * Math.PI / 180), TH = 2.6, RH = 3;
    for (const s of [1, -1]) {   // 左下と、点対称の右上（中の形は左右上下とも対称なので、そのまま置く）
      const X = cx * s, Z = cz * s;
      pyramid(X, Z, half, B, h, casingM, goldM,
        [{ x0: X - half - 2, x1: X + half + 2, z0: Z - 1.2, z1: Z + 1.2, y1: B + TH }, { x0: X - 2.5, x1: X + 2.5, z0: Z - 2.5, z1: Z + 2.5, y1: B + RH }],
        [{ face: 'w', w: 3.2, h: TH + 0.4 }, { face: 'e', w: 3.2, h: TH + 0.4 }]);
      const box = (x0, x1, y0, y1, z0, z1, m, walk = false) => solidBox(X + x0, X + x1, y0, y1, Z + z0, Z + z1, m, walk, false);
      for (const sx of [1, -1]) {
        const xo = half + 0.8, a = Math.min(sx * 2.9, sx * xo), b = Math.max(sx * 2.9, sx * xo);
        box(a, b, B, B + TH, -1.6, -1.2, limeM); box(a, b, B, B + TH, 1.2, 1.6, limeM);   // 通路の壁（外の門まで）
        box(a, b, B + TH, B + TH + 0.4, -1.6, 1.6, stoneM, true);                           // 通路の天井
        const g0 = Math.min(sx * (half - 1.2), sx * (xo + 0.1)), g1 = Math.max(sx * (half - 1.2), sx * (xo + 0.1));
        box(g0, g1, B, B + TH + 0.4, -2.1, -1.6, stoneM); box(g0, g1, B, B + TH + 0.4, 1.6, 2.1, stoneM);   // 門柱
        box(g0, g1, B + TH + 0.4, B + TH + 0.9, -2.3, 2.3, stoneM, true);                                    // まぐさ石
        box(sx > 0 ? 2.5 : -2.9, sx > 0 ? 2.9 : -2.5, B, B + RH, -2.9, -1.2, limeM);         // 小部屋の壁（東西。通路の所だけ空ける）
        box(sx > 0 ? 2.5 : -2.9, sx > 0 ? 2.9 : -2.5, B, B + RH, 1.2, 2.9, limeM);
      }
      box(-2.5, 2.5, B, B + RH, -2.9, -2.5, limeM); box(-2.5, 2.5, B, B + RH, 2.5, 2.9, limeM);   // 小部屋の壁（南北）
      box(-2.9, 2.9, B + RH, B + RH + 0.4, -2.9, 2.9, stoneM, true);                               // 小部屋の天井
    }
  }

  // ----- 7 河岸神殿（出撃）：一段低い（2m）列柱の中庭。5 参道へ上がる坂と、砂地へ上がる坂 -----
  solidBox(COURT.x0, COURT.x1, G0, G0 + 0.05, COURT.z0, COURT.z1, pavedM, true);
  stairsAt('x', 0, -40, 1, G0, B + 1.2, 4, limeM);     // 中庭 → 参道
  stairsAt('z', -50, -9, -1, G0, B, 3, limeM);          // 中庭 → 北の砂地
  stairsAt('z', -50, 9, 1, G0, B, 3, limeM);            // 中庭 → 南の砂地
  for (const [x, z] of [[-46, -8], [-43, -8], [-46, 8], [-43, 8]]) place(col(0.45, B + 2.5 - G0), x, z, 0, G0, { r: 0.45, h: B + 2.5 - G0 });
  solidBox(-47, -42, B + 2.5, B + 3, -8.6, -7.4, stoneM, true); solidBox(-47, -42, B + 2.5, B + 3, 7.4, 8.6, stoneM, true);   // 柱の上の梁

  // ----- 5 石の参道（高さ 1.2m）と、横から上がる坂。6 オベリスク -----
  land(-39.95, -16, -3, 3, B + 1.2, stoneM);   // 中庭の奥の壁と同じ面にしない（重なってちらつくので少し下げる）
  stairsAt('z', -28, -3, 1, B, B + 1.2, 3, limeM);
  stairsAt('z', -22, 3, -1, B, B + 1.2, 3, limeM);
  const obelisk = () => {
    const g = new THREE.Group();
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.9, 5.5, 0.9), limeM); p.position.y = 2.75; g.add(p);
    const t = new THREE.Mesh(new THREE.ConeGeometry(0.64, 0.8, 4), goldM); t.rotation.y = Math.PI / 4; t.position.y = 5.9; g.add(t);
    return g;
  };
  for (const [x, z] of [[-36, -5], [-36, 5], [-31, -5], [-31, 5]]) place(obelisk, x, z, 0, B);

  const fallen = (len, r) => () => { const g = new THREE.Group(); const p = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10), limeM); p.rotation.z = Math.PI / 2; p.position.y = r * 0.8; g.add(p); return g; };

  // ----- 4 列柱の神殿跡（左上と右下）：低い基壇の上に太い柱が 4×3 本（折れた柱も）。背の高い柱の上に梁が残る -----
  land(-46, -24, -46, -28, B + 0.4, stoneM);   // 基壇（0.4m なので、そのまま上がれる）
  const HC = 6.5;
  for (const [x, z, h] of [[-42, -42, HC], [-37, -42, HC], [-32, -42, 3.2], [-27, -42, HC], [-42, -37, 1.4], [-37, -37, HC],
    [-32, -37, HC], [-27, -37, 4.4], [-42, -32, HC], [-37, -32, 2.2], [-32, -32, HC], [-27, -32, HC]]) place(col(0.8, h), x, z, 0, B + 0.4, { r: 0.8, h });
  for (const [x0, x1, z] of [[-42, -37, -42], [-37, -32, -32], [-32, -27, -32]]) solidBox(x0 - 0.9, x1 + 0.9, B + 0.4 + HC, B + 0.4 + HC + 0.8, z - 0.8, z + 0.8, stoneM);   // 梁
  solidBox(-46, -37, B + 0.4, B + 3.2, -46, -45.4, stoneM); solidBox(-33, -28, B + 0.4, B + 1.4, -46, -45.4, stoneM);   // 崩れた囲いの壁
  solidBox(-46, -45.4, B + 0.4, B + 3.2, -45.4, -38, stoneM); solidBox(-46, -45.4, B + 0.4, B + 1.2, -34, -30, stoneM);
  place(fallen(4.5, 0.8), -34.5, -39.5, 0, B + 0.4);

  // ----- 塔門（大ピラミッドの南北の出口の先）：台形の高い石の塔が2本ずつ、間を道が通る -----
  const friezeM = mat(P.ai[1], { roughness: 1 });
  const pylon = (x0, x1, z0, z1, h) => {
    for (const s of [1, -1]) {
      const g = new THREE.BoxGeometry(x1 - x0, h, z1 - z0), p = g.attributes.position;
      for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) { p.setX(i, p.getX(i) * 0.78); p.setZ(i, p.getZ(i) * 0.85); }   // 上をすぼめる
      g.computeVertexNormals();
      const cx = s * (x0 + x1) / 2, cz = s * (z0 + z1) / 2;
      const m = new THREE.Mesh(g, sides(limeM, stoneTop)); m.position.set(cx, B + h / 2, cz); deco(m);
      const band = boxMesh((x1 - x0) * 0.8, 0.5, (z1 - z0) * 0.87, friezeM); band.position.set(cx, B + h - 1.1, cz); deco(band);   // 青い帯の彫刻
      const top = boxMesh((x1 - x0) * 0.86, 0.6, (z1 - z0) * 0.93, limeM); top.position.set(cx, B + h + 0.3, cz); deco(top);      // 軒
      cur.colliders.push({ kind: 'box', min: new V3(s > 0 ? x0 : -x1, G0, s > 0 ? z0 : -z1), max: new V3(s > 0 ? x1 : -x0, B + h + 0.6, s > 0 ? z1 : -z0), walk: false, surf: 'stone' });
    }
  };
  pylon(-7.5, -3, -28, -25, 9); pylon(3, 7.5, -28, -25, 9);
  // 倒れたオベリスクと、崩れた石像の台座（遮蔽）
  solidBox(-18, -12.5, B, B + 0.9, -30.45, -29.55, limeM);
  solidBox(-15, -13, B, B + 2, -21.5, -19.5, stoneM); solidBox(-12.4, -11.4, B, B + 1.1, -20.4, -19.2, stoneM);

  // ----- 野営地（右上の小ピラミッドの手前。左下にも）：発掘隊の天幕・焚き火・見張りやぐら -----
  const tent = (w, d, h, m) => () => {
    const sh = new THREE.Shape(); sh.moveTo(-w / 2, 0); sh.lineTo(w / 2, 0); sh.lineTo(0, h); sh.lineTo(-w / 2, 0);
    const g = new THREE.ExtrudeGeometry(sh, { depth: d, bevelEnabled: false }); g.translate(0, 0, -d / 2);
    const grp = new THREE.Group(); grp.add(new THREE.Mesh(g, m));
    for (const z of [-d / 2 - 0.05, d / 2 + 0.05]) { const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, h + 0.3, 5), woodSideM); pole.position.set(0, (h + 0.3) / 2, z); grp.add(pole); }
    return grp;
  };
  place(tent(3.4, 4.4, 2.5, mat(P.kiji[2])), 22, -37, 0, B);
  place(tent(3.4, 4.4, 2.5, mat(P.daidai[1])), 25.5, -31, Math.PI / 2, B);
  const logM = mat(P.kiji[0]), pebM = mat(P.nezumi[1]);
  for (const s of [1, -1]) {   // 焚き火（石の輪と薪。上を歩ける）
    for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2, r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22, 0), pebM); r.position.set((20.5 + Math.cos(a) * 0.7) * s, B + 0.12, (-30.5 + Math.sin(a) * 0.7) * s); deco(r, false); }
    for (const a of [0.5, -0.6]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.2, 5), logM); l.rotation.set(Math.PI / 2, 0, a); l.position.set(20.5 * s, B + 0.15, -30.5 * s); deco(l, false); }
  }
  // 見張りやぐら（高さ 3.8m の板の台。西から長い板の坂で上がる。手すりが遮蔽）
  for (const [x, z] of [[17.8, -48.2], [22.2, -48.2], [17.8, -43.8], [22.2, -43.8]]) place(() => { const g = new THREE.Group(); const p = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 3.5, 6), woodSideM); p.position.y = 1.75; g.add(p); return g; }, x, z, 0, B, { r: 0.15, h: 3.5 });
  solidBox(17.6, 22.4, B + 3.5, B + 3.8, -48.4, -43.6, woodSideM, true);
  for (const [x0, x1, z0, z1] of [[17.6, 22.4, -48.4, -48.2], [17.6, 22.4, -43.8, -43.6], [22.2, 22.4, -48.2, -43.8], [17.6, 17.8, -48.2, -46.8], [17.6, 17.8, -45.2, -43.8]])
    solidBox(x0, x1, B + 3.8, B + 4.8, z0, z1, woodSideM);
  {   // 板の坂（見た目は薄い板・滑り止めの桟・支柱。当たり判定は坂）
    const x0 = 7.6, x1 = 17.6, z = -46, w = 1.2, y0 = B, y1 = B + 3.8, len = Math.hypot(x1 - x0, y1 - y0), ang = Math.atan2(y1 - y0, x1 - x0);
    for (const s of [1, -1]) {
      const g = new THREE.Group(); g.position.set(s * (x0 + x1) / 2, (y0 + y1) / 2 - 0.06, s * z); g.rotation.z = s * ang;
      g.add(boxMesh(len, 0.1, w, woodSideM));
      for (let k = 1; k < 13; k++) { const c = boxMesh(0.08, 0.06, w, woodSideM); c.position.set(-len / 2 + k * len / 13, 0.08, 0); g.add(c); }
      deco(g);
      for (const t of [0.35, 0.7, 1]) for (const dz of [-w / 2 + 0.08, w / 2 - 0.08]) {
        const ph = (y1 - y0) * t, p = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, ph, 5), woodSideM);
        p.position.set(s * (x0 + (x1 - x0) * t), y0 + ph / 2 - 0.1, s * z + dz); deco(p);
      }
      const lo = s * x0, hi = s * x1;
      cur.colliders.push({ kind: 'ramp', axis: 'x', lo, hi, y0, y1, walk: true, surf: 'wood', min: new V3(Math.min(lo, hi), G0, s * z - w / 2), max: new V3(Math.max(lo, hi), y1, s * z + w / 2) });
    }
  }

  // ----- ヤシの木立（参道の脇） -----
  const trunkM = mat(P.kiji[0]), frondMs = [mat(P.moegi[0]), mat(P.midori[1])];
  const palm = (h, lean) => () => {
    const g = new THREE.Group();
    let x = 0, y = 0;
    for (let k = 0; k < 6; k++) { const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.2 - k * 0.012, 0.24 - k * 0.012, h / 6 + 0.05, 6), trunkM); x += lean * k * 0.05; seg.position.set(x, y + h / 12, 0); g.add(seg); y += h / 6; }
    for (let k = 0; k < 8; k++) {
      const a = k / 8 * Math.PI * 2 + 0.2, fr = new THREE.Mesh(new THREE.ConeGeometry(0.4, 2.8, 4), frondMs[k % 2]);
      fr.scale.set(1, 1, 0.22); fr.rotation.order = 'YZX'; fr.rotation.set(0, -a, -Math.PI / 2 - 0.35);
      fr.position.set(x + Math.cos(a) * 1.25, y - 0.35, Math.sin(a) * 1.25); g.add(fr);
    }
    return g;
  };
  for (const [x, z, h, lean] of [[-34.5, 12, 6.5, 1], [-25.8, 17.8, 7.2, -1], [-33.5, 18.6, 5.8, -0.6], [-26.5, 11.2, 6.8, 0.8]]) place(palm(h, lean), x, z, rand(0, 3), B, { r: 0.3, h });

  // ----- 8 舟坑（深さ 2m の細長い溝。両端に坂） -----
  solidBox(PIT.x0, PIT.x1, G0, G0 + 0.05, PIT.z0, PIT.z1, sides(sandSideM, sandTopM), true);   // 底は砂
  stairsAt('x', 24.5, -30, -1, G0, B, 3, sandSideM);   // 西の端の坂（溝の中から上へ）
  stairsAt('x', 24.5, -14, 1, G0, B, 3, sandSideM);    // 東の端の坂

  // ----- 岩場（砂岩の大きな塊。砂丘の上にも）と枯れ草 -----
  const dryM = mat(P.kiji[1]);
  for (const [x, z, sc] of [[-12, -47, 2.2], [-50, 26, 1.6], [-22, -21, 1.3], [-6, -40, 1.5], [-49, -33, 1.2], [-14, 34, 1.4]]) place(() => rock(sc, sandSideM), x, z, rand(0, 3), hAt(x, z) - 0.2 * sc);
  for (const [x, z] of [[-26, 14], [-10, 36], [-48, 18], [-6, -32], [-30, -14], [-18, -36], [-40, -8.5]])
    for (const s of [1, -1]) { const t = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.6, 5), dryM); t.position.set(x * s, hAt(x * s, z * s) + 0.3, z * s); deco(t, false); }

  // ----- 遠くの砂の景色（アリーナの外の砂丘と、台地の岩山） -----
  {
    const geo = new THREE.PlaneGeometry(800, 800, 64, 64).toNonIndexed();
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position, cols = [];
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i), d = Math.max(Math.abs(x), Math.abs(z));
      const k = clamp((d - H + 2) / 30, 0, 1);
      pos.setY(i, G0 + 0.02 + (Math.sin(x * 0.04 + z * 0.02) * 5 + Math.sin(x * 0.11 - z * 0.07) * 2 + 6) * k);
    }
    for (let i = 0; i < pos.count; i += 3) { const c = C(P.kiji[2]).offsetHSL(rand(-0.01, 0.01), 0, rand(-0.04, 0.03)); for (let j = 0; j < 3; j++) cols.push(c.r, c.g, c.b); }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    geo.computeVertexNormals();
    const far = new THREE.Mesh(geo, lambertVC); far.receiveShadow = true; cur.group.add(far);
    const parts = [];
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2 + rand(-0.2, 0.2), r = rand(260, 360), h = rand(30, 70), w = rand(40, 80);
      parts.push([new THREE.CylinderGeometry(w * 0.7, w, h, 7), P.daidai[1], M4(Math.cos(a) * r, h / 2 - 5, Math.sin(a) * r, rand(0, 3))]);
      parts.push([new THREE.CylinderGeometry(w * 0.72, w * 0.72, 3, 7), P.kiji[1], M4(Math.cos(a) * r, h - 5 + 1.5, Math.sin(a) * r, rand(0, 3))]);
    }
    cur.group.add(new THREE.Mesh(mergeParts(parts), lambertVC));
  }
  finishMap();
  // なめらかな地形は、まとめる処理（面ごとの陰影になる）の後に足す。弾・視線も遮る
  cur.group.add(terrain); cur.props.push(terrain);
  terrain.geometry.computeBoundsTree(); terrain.matrixAutoUpdate = false; terrain.updateMatrix();
}

// (x, z) が障害物の中か。y はその場所に立つ高さ（それより低い段や盤は乗れるので障害物扱いしない）
export function insideCollider(x, z, R, y = 0) {
  return Math.abs(x) > H - R || Math.abs(z) > H - R || colliders.some(c => {
    const top = colTop(c, x, z), bottom = c.kind === 'cyl' ? c.y0 : c.min.y;
    if (top <= y + 0.4 || bottom >= y + 1.8) return false;
    if (c.kind === 'cyl') return Math.hypot(x - c.x, z - c.z) < c.r + R;
    return x > c.min.x - R && x < c.max.x + R && z > c.min.z - R && z < c.max.z + R;
  });
}

// 動かない置き物を材質ごとに1つのメッシュへまとめる（描画回数を減らして軽くする。当たり判定は元の形のまま）
function finishMap() {
  const props = cur.props, group = cur.group;
  const groups = new Map(), merged = [];
  scene.updateMatrixWorld(true);
  for (const obj of props) {
    obj.traverse((o: any) => {
      if (!o.isMesh || o.isInstancedMesh || Array.isArray(o.material) || o.material.transparent) return;
      const k = o.material.uuid;
      if (!groups.has(k)) groups.set(k, { mat: o.material, geos: [] });
      groups.get(k).geos.push((o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()).applyMatrix4(o.matrixWorld));
      merged.push(o);
    });
  }
  const concat = (geos, name) => {
    const attrs = geos.map(g => g.attributes[name]);
    if (attrs.some(a => !a)) return null;
    const buf = new Float32Array(attrs.reduce((n, a) => n + a.array.length, 0));
    let o = 0; attrs.forEach(a => { buf.set(a.array, o); o += a.array.length; });
    return new THREE.BufferAttribute(buf, attrs[0].itemSize);
  };
  merged.forEach(o => o.parent && o.parent.remove(o));
  // 中身が無くなった置き物は外し、まとめたメッシュを弾・視線の判定に入れる
  const rest = props.filter(obj => { let has = false; obj.traverse((o: any) => { if (o.isMesh && o.parent) has = true; }); return has || obj.isMesh && obj.parent; });
  props.length = 0; props.push(...rest);
  for (const { mat: m, geos } of groups.values()) {
    const g = new THREE.BufferGeometry();
    ['position', 'normal', 'uv'].forEach(n => { const a = concat(geos, n); if (a) g.setAttribute(n, a); });
    g.computeVertexNormals();   // 面ごとの陰影
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, m);
    mesh.castShadow = mesh.receiveShadow = true;
    if (m === bellM) mesh.userData.bell = true;   // 撃つと鐘が鳴る
    group.add(mesh); props.push(mesh);
  }
  // 動かない物は、毎フレームの位置の計算を省く
  group.traverse((o: any) => { if (o !== group) { o.matrixAutoUpdate = false; o.updateMatrix(); } });
  group.updateMatrixWorld(true);
  // 弾・視線の判定を速くする（まとめた大きなメッシュでも、近くの三角形だけ調べる）
  for (const o of props) o.traverse((m: any) => { if (m.isMesh && !m.isInstancedMesh) m.geometry.computeBoundsTree(); });
}

// ================= マップの切り替え =================
// 空・日の光・霧を、今のマップ（と暗さの設定）に合わせる。暗さはオンラインなら部屋を作った人の設定
export function applyAtmos() {
  const m = MAPS[mapId];
  if (!m) return;
  const a = m.atmos(true);   // 暗さは「こわい」で固定
  const u = (sky.material as any).uniforms;
  u.top.value.copy(a.top); u.hor.value.copy(a.hor); u.bot.value.copy(a.bot);
  SUN_DIR.copy(a.sunDir).normalize();
  sun.color.copy(a.sunCol); sun.intensity = a.sunI * LIGHT;
  hemi.color.copy(a.hemiSky); hemi.groundColor.copy(a.hemiGround); hemi.intensity = a.hemiI * LIGHT;
  const f = scene.fog as THREE.Fog;
  f.color.copy(a.fog); f.near = a.near; f.far = a.far;
  for (const c of clouds) c.visible = a.clouds;
  farMeadow.visible = farScenery.visible = !a.desert;
  baseProps[0].visible = !a.desert && !a.noGround;   // 足もとの草を隠す（床を別に敷くマップ）   // 砂漠は草原・木・山・足もとの草を隠す（足もとの地面は弾の判定には残す）
}
// 今のマップの空・光・霧（砂嵐で一時的に変えるときの元の値）
export const currentAtmos = () => MAPS[mapId]?.atmos(true);
export function useMap(id: string) {
  if (!MAPS[id]) id = 'valley';
  const m = MAPS[id], changed = mapId !== id;
  mapId = id;
  for (const x of Object.values(MAPS)) x.group.visible = x === m;
  propMeshes.length = 0; propMeshes.push(...baseProps, ...m.props);
  colliders.length = 0; colliders.push(...m.colliders);
  for (const k of Object.keys(LV)) delete LV[k];
  Object.assign(LV, m.lv);
  SPAWN.x = m.spawn.x; SPAWN.z = m.spawn.z; WATER_Y = m.water;
  SPAWN2.on = !!m.spawn2; if (m.spawn2) { SPAWN2.x = m.spawn2.x; SPAWN2.z = m.spawn2.z; }
  hmap = null;
  applyAtmos();
  if (changed) onMapChange.forEach(f => f(id));
}

buildValley();
buildTemple();
buildOnsen();
buildDesert();
useMap(settings.map);
// 背景・地面など動かない物も、毎フレームの位置の計算を省く
for (const o of scene.children) if (o !== sky && !clouds.includes(o) && (o as any).isMesh && !(o as any).userData.phys) { o.matrixAutoUpdate = false; o.updateMatrix(); }
for (const o of baseProps) o.geometry.computeBoundsTree();
