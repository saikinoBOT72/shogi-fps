// マップ（谷と二つの丘）・背景・障害物と当たり判定
import { P, css, rgba } from './palette';
import * as THREE from 'three';
import { BH, C, GROUND, H, LIGHT, V3, clamp, rand, settings } from './core';
import { gs } from './state';
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

// 遠くの草原（アリーナの外は起伏あり）
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
  m.receiveShadow = true; scene.add(m);
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
  scene.add(new THREE.Mesh(mergeParts(parts), lambertVC));

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
export let WATER_Y = GROUND + 0.4;
export let mapId = '';
// 3つ目の値が true のマップは未公開（開発者メニューで「未公開マップ」をオンにした人だけ選べる）
export const MAP_LIST: [string, string, boolean?][] = [['valley', '谷と二つの丘'], ['temple', '山寺の石段'], ['onsen', '雪の温泉街', true]];
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
}
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
  hmap = null;
  applyAtmos();
  if (changed) onMapChange.forEach(f => f(id));
}

buildValley();
buildTemple();
buildOnsen();
useMap(settings.map);
// 背景・地面など動かない物も、毎フレームの位置の計算を省く
for (const o of scene.children) if (o !== sky && !clouds.includes(o) && (o as any).isMesh && !(o as any).userData.phys) { o.matrixAutoUpdate = false; o.updateMatrix(); }
for (const o of baseProps) o.geometry.computeBoundsTree();
