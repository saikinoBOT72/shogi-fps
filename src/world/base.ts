// マップの共通部品：当たり判定・地面の高さ・材質・置き物の作り方・マップの登録と切り替え
// マップごとの作り方は src/maps/*.ts、全部をまとめて作るのは src/world.ts
import { P, css, rgba } from '../palette';
import * as THREE from 'three';
import { BH, C, GROUND, H, LIGHT, Q, V3, clamp, rand, settings } from '../core';
import { gs } from '../state';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { SUN_DIR, boardTex, canvasTex, darkWoodTex, flatGeo, flatten, hemi, kanjiMat, makePiece, mat, planeGeo, scene, sky, sun, toon } from '../render';

// ================= 地形・小道具 =================
// 今のマップのもの（マップを切り替えると中身が入れ替わる）
export const propMeshes = [];   // 弾・視線を遮る
export const colliders = [];    // 移動の当たり判定（上に乗れる）
export const baseProps = [];           // どのマップにもある物（外周の地面）
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
export let hmap: Float32Array = null;
export const HM = 2 * H + 8;
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

// ---------- 彫った箱庭：木で彫ったように見せる（見た目の決まり 7） ----------
// どの面にも、ノミの彫り跡と細い木目を世界の位置から貼る（向きに合わせて3方向から貼り分けるので、継ぎ目が出ない）。
// 色は木地の色へ少し寄せる。形・当たり判定は変えない
const carveTex = (() => {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, S, S);
  // 端を越えた分は反対側にも描いて、つなぎ目なく並ぶようにする
  const wrap = (fn: (ox: number, oy: number) => void) => { for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) fn(ox, oy); };
  // 木目：横に流れる細い線
  for (let i = 0; i < 46; i++) {
    const y = rand(0, S), a = rand(0.05, 0.16), w = rand(0.6, 1.6), amp = rand(2, 6), ph = rand(0, 6);
    wrap((ox, oy) => {
      g.strokeStyle = `rgba(60,40,20,${a})`; g.lineWidth = w; g.beginPath();
      for (let x = 0; x <= S; x += 8) g.lineTo(x + ox, y + oy + Math.sin(x / S * Math.PI * 2 + ph) * amp);
      g.stroke();
    });
  }
  // ノミの跡：細長い浅いくぼみ（片側が暗く、反対側の縁が少し明るい）
  for (let i = 0; i < 70; i++) {
    const x = rand(0, S), y = rand(0, S), L = rand(18, 46), W = rand(5, 11), r = rand(-0.5, 0.5), a = rand(0.07, 0.17);
    wrap((ox, oy) => {
      g.save(); g.translate(x + ox, y + oy); g.rotate(r);
      g.fillStyle = `rgba(50,32,16,${a})`; g.beginPath(); g.ellipse(0, 0, L / 2, W / 2, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = `rgba(255,255,255,${a * 1.6})`; g.lineWidth = 1.2; g.beginPath(); g.ellipse(0, W * 0.12, L / 2, W / 2, 0, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
      g.restore();
    });
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
})();
// 画質「低」は彫り跡を省いて色だけ寄せる（弱い PC で重くしない）
const LITE = !Q.shadow;
export const CARVE = { carveMap: { value: carveTex }, carveK: { value: 1 } };
// 木地の色（明るさは元の色のまま、色合いだけ寄せる）
const WOOD = new THREE.Color(P.kiji[1]);
export function carveMaterial(m: any) {
  if (!m || m.userData.carved || m.userData.noCarve || m.transparent || !m.isMeshToonMaterial) return;
  m.userData.carved = true;
  m.onBeforeCompile = (sh: any) => {
    Object.assign(sh.uniforms, CARVE);
    sh.uniforms.carveWood = { value: WOOD };
    sh.vertexShader = 'varying vec3 vCarveP;\nvarying vec3 vCarveN;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      vec4 cw = vec4(transformed, 1.0);
      vec3 cn = objectNormal;
      #ifdef USE_INSTANCING
        cw = instanceMatrix * cw; cn = mat3(instanceMatrix) * cn;
      #endif
      cw = modelMatrix * cw;
      vCarveP = cw.xyz; vCarveN = mat3(modelMatrix) * cn;`);
    sh.fragmentShader = 'uniform sampler2D carveMap;\nuniform float carveK;\nuniform vec3 carveWood;\nvarying vec3 vCarveP;\nvarying vec3 vCarveN;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      {
        vec3 bw = pow(abs(normalize(vCarveN)), vec3(4.0)); bw /= (bw.x + bw.y + bw.z + 1e-4);
        vec3 q = vCarveP * 0.31;   // 1枚で約3.2m
        float cv = ${LITE ? '1.0' : 'texture2D(carveMap, q.zy).r * bw.x + texture2D(carveMap, q.xz).r * bw.y + texture2D(carveMap, q.xy).r * bw.z'};
        // 木の色合いへ寄せる（明るさは保つ）
        float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
        vec3 wood = carveWood * (lum / max(dot(carveWood, vec3(0.299, 0.587, 0.114)), 1e-3));
        diffuseColor.rgb = mix(diffuseColor.rgb, wood, 0.24 * carveK);
        diffuseColor.rgb *= mix(1.0, cv * 1.07, carveK);
      }`);
  };
  m.customProgramCacheKey = () => 'carve';
  m.needsUpdate = true;
}
export function carveObject(root: any) {
  root.traverse((o: any) => { if (o.isMesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach(carveMaterial); });
}

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
export let farMeadow: THREE.Mesh = null, farScenery: THREE.Mesh = null;
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
  carveMaterial(lambertVC); carveMaterial(baseProps[0].material);   // 遠くの景色・足もとの草も彫った木に

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
// 川の流れ（水の中で押し流される速さ [x, z] m/秒）。無いマップは null
export let FLOW: ((x: number, z: number) => [number, number]) | null = null;
export let mapId = '';
// 3つ目の値が true のマップは未公開（開発者メニューで「未公開マップ」をオンにした人だけ選べる）
export const MAP_LIST: [string, string, boolean?][] = [['valley', '谷と二つの丘'], ['temple', '山寺の石段'], ['onsen', '雪の温泉街'], ['desert', '三つのピラミッド'], ['gorge', '霧の渓谷'], ['yashiki', '忍びの屋敷'], ['boss1', '仮想空間１'], ['roof', '夜の屋上', true]];
export const devMapsOn = () => !!(settings as any).dev?.hiddenMaps;
export const selectableMaps = () => MAP_LIST.filter(m => !m[2] || devMapsOn());
// 自分で選ぶマップ：未公開のマップを選んだままオフにしたときは、最初のマップにする
export const playableMap = (id: string) => (selectableMaps().some(m => m[0] === id) ? id : 'valley');
// ランダム（'random'）も含めて、遊ぶマップを決める。reroll：対局の始めは引き直す（それ以外は今のマップのまま）
export function pickMap(id: string, reroll = false) {
  if (id !== 'random') return playableMap(id);
  const list = selectableMaps();
  if (!reroll && list.some(m => m[0] === mapId)) return mapId;
  return list[Math.floor(Math.random() * list.length)][0];
}
export const onMapChange: ((id: string) => void)[] = [];   // 切り替えたときに呼ぶ（経路探索・物理）
export const MAPS: Record<string, any> = {};
export const mapLV = (id: string) => MAPS[id].lv;
export let cur: any = null;
export function beginMap(id, o) {
  cur = MAPS[id] = Object.assign({ id, group: new THREE.Group(), props: [], colliders: [] }, o);
  cur.group.visible = false; scene.add(cur.group);
}
// 当たり判定のない飾り（block: 弾・視線は遮る）
export function deco(obj, block = true) { cur.group.add(obj); if (block) cur.props.push(obj); obj.traverse((o: any) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); return obj; }

// ================= 置き物（すべて点対称に置いて公平に） =================
export const G0 = GROUND;
// 下端の高さ y0 に置く箱（mats: 1つ、または [右,左,上,下,前,後]）
export const boxMesh = (w, h, d, mats) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats);
// 白壁の塀（瓦の笠つき）。長さ len は x 方向
export const wall = (len, h) => {
  const g = new THREE.Group();
  const w = boxMesh(len, h, 0.8, plasterM); w.position.y = h / 2;
  const base = boxMesh(len + 0.1, 0.6, 0.9, stoneM); base.position.y = 0.3;
  const cap = boxMesh(len + 0.6, 0.35, 1.4, roofM); cap.position.y = h + 0.1;
  g.add(w, base, cap); return g;
};
// ---------- 彫った形：ノミで面を落とした岩・木 ----------
// 頂点を少し揺らしてから、いくつかの平らな面でそぎ落とす（大きな削り面が残る）。面ごとの陰影
export function carvedGeo(g0: THREE.BufferGeometry, jitter: number, cuts: number, floorY = -Infinity, keepApex = false) {
  let g = g0.clone(); g.deleteAttribute('normal'); g.deleteAttribute('uv');
  g = mergeVertices(g);
  const p = g.attributes.position, v = new V3(), planes: [THREE.Vector3, number][] = [];
  for (let i = 0; i < cuts; i++) { const n = new V3(rand(-1, 1), rand(-0.3, 1), rand(-1, 1)).normalize(); planes.push([n, rand(0.72, 0.86)]); }
  let top = -Infinity; for (let i = 0; i < p.count; i++) top = Math.max(top, p.getY(i));
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    if (keepApex && v.y >= top - 1e-4) continue;   // 木のてっぺんは尖ったまま
    const k = 1 + rand(-jitter, jitter);
    v.x *= k; v.z *= k; if (!keepApex) v.y *= 1 + rand(-jitter, jitter);
    const r = Math.hypot(v.x, v.y, v.z) || 1;
    for (const [n, d] of planes) { const t = v.dot(n) / r; if (t > d) v.addScaledVector(n, -(t - d) * r * 0.9); }
    v.y = Math.max(v.y, floorY);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g = g.toNonIndexed(); g.computeVertexNormals();
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  return g;
}
// 形は数種類だけ作って使い回す（重くしない）
const ROCK_GEOS = Array.from({ length: 6 }, () => carvedGeo(new THREE.IcosahedronGeometry(1, 1), 0.16, 8, -0.7));
const LEAF_GEOS = Array.from({ length: 4 }, () => [0, 1, 2].map(k => carvedGeo(new THREE.ConeGeometry(2.6 - k * 0.6, 3, 7, 2), 0.13, 0, -Infinity, true)));
const TRUNK_GEO = carvedGeo(new THREE.CylinderGeometry(0.35, 0.5, 3, 6, 2), 0.08, 0);
export const rock = (s, m = stoneM) => {
  const r = new THREE.Mesh(ROCK_GEOS[Math.floor(rand(0, ROCK_GEOS.length))], m);
  const sy = rand(0.7, 1);
  r.scale.set(s * rand(1, 1.4), s * sy, s * rand(1, 1.3)); r.position.y = s * (0.7 * sy - 0.15); r.rotation.y = rand(0, 3);   // 平らな底を少し沈める
  const g = new THREE.Group(); g.add(r); return g;
};
export const tree = (s, leaves = leafMs) => {
  const g = new THREE.Group();
  const t = new THREE.Mesh(TRUNK_GEO, trunkM); t.scale.setScalar(s); t.position.y = 1.5 * s; g.add(t);
  const set = LEAF_GEOS[Math.floor(rand(0, LEAF_GEOS.length))];
  for (let k = 0; k < 3; k++) {
    const c = new THREE.Mesh(set[k], leaves[k]); c.scale.setScalar(s);
    c.position.y = (3.2 + k * 1.5) * s; c.rotation.y = rand(0, 3); g.add(c);
  }
  return g;
};
// (x, z) と (-x, -z) の2か所に置く。y0 は下端の高さ
export const place = (make, x, z, ry = 0, y0 = G0, cyl?, walk?) => {
  [[1, 0], [-1, Math.PI]].forEach(([s, add]) => {
    const o = make(); o.position.set(x * s, y0, z * s); o.rotation.y = ry + add;
    addSolid(o, cyl && { x: x * s, z: z * s, r: cyl.r, y0, y1: y0 + cyl.h }, walk);
  });
};
// 箱（x0..x1, y0..y1, z0..z1）を置く。both なら点対称の場所にも
export const solidBox = (x0, x1, y0, y1, z0, z1, mats, walk = false, both = true) => {
  for (const s of both ? [1, -1] : [1]) {
    const m = boxMesh(x1 - x0, y1 - y0, z1 - z0, mats);
    m.position.set(s * (x0 + x1) / 2, (y0 + y1) / 2, s * (z0 + z1) / 2);
    addSolid(m, null, walk);
  }
};
// 外周の壁の上に、見えない当たり判定を空高くまで伸ばす（グレネードの爆風で越えないように）
//   inner：壁の内側の端（|x|, |z| がこれより外は入れない）、y0：壁のてっぺん
export function skyWall(inner, y0) {
  const T = 6, Y1 = 400;
  for (const s of [1, -1]) {
    cur.colliders.push({ kind: 'box', min: new THREE.Vector3(-inner - T, y0 - 0.5, s > 0 ? inner : -inner - T), max: new THREE.Vector3(inner + T, Y1, s > 0 ? inner + T : -inner), walk: false });
    cur.colliders.push({ kind: 'box', min: new THREE.Vector3(s > 0 ? inner : -inner - T, y0 - 0.5, -inner - T), max: new THREE.Vector3(s > 0 ? inner + T : -inner, Y1, inner + T), walk: false });
  }
}
// 地面から top までの土地（歩ける）
export const land = (x0, x1, z0, z1, top, mats, both = true) => solidBox(x0, x1, G0, top, z0, z1, mats, true, both);
// 上面の色で高さが分かるように（横は土や石）
export const topM = hex => mat(hex, { roughness: 1 });
export const sides = (side, top) => [side, side, top, side, side, side];
// 坂（昔の階段と同じ場所・長さ。1m 進むと 0.42m 以下しか上がらないので、歩いてそのまま上り下りできる）
// axis: 'z' なら x=at の位置で z 方向に上る。edge: 高い段の縁、hi: 高い側の向き
// 当たり判定は kind: 'ramp'（lo〜hi の間で高さが y0〜y1 へまっすぐ変わる）
//   run：坂の長さ（省くと 1m で 0.42m 上がる長さ。屋内の急な階段は短くする）
export const stairsAt = (axis, at, edge, hi, yLow, yHigh, width, m = stoneM, run = Math.ceil((yHigh - yLow) / 0.42 - 1e-6)) => {
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

// 山寺の材質（温泉街でも使う）
export const moonStoneM = mat(P.nezumi[0], { roughness: 1 });
moonStoneM.userData.surf = 'stone';
export const bellM = mat(P.kin[0], { roughness: 0.5 });   // 鐘（撃つと鳴る）
export const lanternLitM = new THREE.MeshBasicMaterial({ color: P.kin[2] });
export const glowTex = canvasTex(64, 64, (g, w) => {
  const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
  r.addColorStop(0, rgba(P.kin[2], 0.9)); r.addColorStop(0.35, rgba(P.daidai[2], 0.35)); r.addColorStop(1, rgba(P.daidai[1], 0));
  g.fillStyle = r; g.fillRect(0, 0, w, w);
});
export const glowM = new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
// (x, z) が障害物の中か。y はその場所に立つ高さ（それより低い段や盤は乗れるので障害物扱いしない）
export function insideCollider(x, z, R, y = 0) {
  // 浮島のマップ（void）：島の外（足もとに床が無い所）も入れない所として扱う（CPU が隠れ場所に選ばないように）
  if (MAPS[mapId]?.void && groundAt(x, z) < y - 3) return true;
  return Math.abs(x) > H - R || Math.abs(z) > H - R || colliders.some(c => {
    const top = colTop(c, x, z), bottom = c.kind === 'cyl' ? c.y0 : c.min.y;
    if (top <= y + 0.4 || bottom >= y + 1.8) return false;
    if (c.kind === 'cyl') return Math.hypot(x - c.x, z - c.z) < c.r + R;
    return x > c.min.x - R && x < c.max.x + R && z > c.min.z - R && z < c.max.z + R;
  });
}

// 動かない置き物を材質ごとに1つのメッシュへまとめる（描画回数を減らして軽くする。当たり判定は元の形のまま）
// 箱の角を面取りして、ノミで彫った木の塊に見せる（見た目だけ。当たり判定は元の箱のまま）
const chamferCache = new Map<string, THREE.BufferGeometry>();
// 頂点を動かしていない、ただの箱か（坂・斜めの屋根などは頂点を動かして作っているので、面取りで箱に戻さない）
//   同じ大きさの箱を作り直して、頂点が1つ残らず同じ場所にあるかで見る（床の高さから始まる坂は、低い端の頂点が底と重なるので、座標の値だけでは見分けられない）
function plainBox(g: any) {
  const { width: w, height: h, depth: d, widthSegments: a, heightSegments: b, depthSegments: c } = g.parameters;
  const p = g.attributes.position.array, q = new THREE.BoxGeometry(w, h, d, a, b, c).attributes.position.array;
  if (p.length !== q.length) return false;
  for (let i = 0; i < p.length; i++) if (Math.abs(p[i] - q[i]) > 1e-4) return false;
  return true;
}
function chamferBoxes(root: any) {
  const s = new V3();
  root.traverse((o: any) => {
    if (!o.isMesh || o.isInstancedMesh || o.geometry.type !== "BoxGeometry" || !plainBox(o.geometry)) return;
    const p = o.geometry.parameters; o.getWorldScale(s);
    const r = Math.min(0.12, 0.16 * Math.min(p.width * s.x, p.height * s.y, p.depth * s.z));   // 大きい箱でも 12cm まで
    if (r < 0.012) return;
    const rl = r / Math.max(s.x, s.y, s.z), key = [p.width, p.height, p.depth, rl.toFixed(3)].join("|");
    if (!chamferCache.has(key)) { const g0 = new RoundedBoxGeometry(p.width, p.height, p.depth, 1, rl), g = g0.index ? g0.toNonIndexed() : g0; g.computeVertexNormals(); chamferCache.set(key, g); }   // 面ごとの陰影（削った面がはっきり見える）
    o.geometry = chamferCache.get(key);
  });
}
export function finishMap() {
  const props = cur.props, group = cur.group;
  const groups = new Map(), merged = [];
  scene.updateMatrixWorld(true);
  if (cur.id !== "boss1") chamferBoxes(group);
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
  // 木で彫った箱庭に見せる（仮想空間は木ではないので外す）
  if (cur.id !== "boss1") carveObject(group);
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
  // 影の色：日の当たらない所は空の照り返しだけで照らされるので、照り返しを木の色へ寄せて、影を真っ黒・青にせず茶色にする（全マップ共通）
  hemi.color.copy(a.hemiSky).lerp(C(P.kiji[2]), 0.45); hemi.groundColor.copy(a.hemiGround).lerp(C(P.kiji[0]), 0.5);
  hemi.intensity = Math.max(a.hemiI, 0.3) * LIGHT;   // 暗いマップでも影が黒くつぶれない
  const f = scene.fog as THREE.Fog;
  f.color.copy(a.fog); f.near = a.near; f.far = a.far;
  for (const c of clouds) c.visible = a.clouds;
  farMeadow.visible = farScenery.visible = !a.desert && !a.noScenery;   // 遠くの草原・山を隠す（砂漠・渓谷）
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
  SPAWN.x = m.spawn.x; SPAWN.z = m.spawn.z; WATER_Y = m.water; FLOW = m.flow || null;
  SPAWN2.on = !!m.spawn2; if (m.spawn2) { SPAWN2.x = m.spawn2.x; SPAWN2.z = m.spawn2.z; }
  hmap = null;
  applyAtmos();
  if (changed) onMapChange.forEach(f => f(id));
}
