// マップ（谷と二つの丘）・背景・障害物と当たり判定
import { P, css, rgba } from './palette';
import * as THREE from 'three';
import { BH, C, GROUND, H, V3, clamp, rand } from './core';
import { boardTex, canvasTex, darkWoodTex, flatten, kanjiMat, makePiece, mat, planeGeo, scene, sky, toon } from './render';

// ================= 地形・小道具 =================
export const propMeshes = [];   // 弾・視線を遮る
export const colliders = [];    // 移動の当たり判定（上に乗れる）
// walk: 上を歩ける面（盤・段・階段）。経路探索で「床」として扱う
export function addSolid(obj, cyl?, walk?) {
  scene.add(obj); propMeshes.push(obj);
  flatten(obj);
  // 透明な板（字など）は影を落とさない
  obj.traverse((o: any) => { if (o.isMesh) { o.castShadow = !o.material.transparent; o.receiveShadow = true; } });
  obj.updateMatrixWorld(true);
  if (cyl) colliders.push({ kind: 'cyl', ...cyl, walk: !!walk });
  else { const b = new THREE.Box3().setFromObject(obj); colliders.push({ kind: 'box', min: b.min, max: b.max, walk: !!walk }); }
}
// その場所の地面の高さ（歩ける面の一番上）。最初に使うときに 1m のマス目で覚える
let hmap: Float32Array = null;
const HM = 2 * H + 8;
export function groundAt(x, z) {
  if (!hmap) {
    hmap = new Float32Array(HM * HM).fill(GROUND);
    for (const c of colliders) {
      if (!c.walk || c.kind !== 'box') continue;
      for (let j = Math.max(0, Math.ceil(c.min.z + HM / 2 - 0.5)); j <= Math.min(HM - 1, Math.floor(c.max.z + HM / 2 - 0.5)); j++)
        for (let i = Math.max(0, Math.ceil(c.min.x + HM / 2 - 0.5)); i <= Math.min(HM - 1, Math.floor(c.max.x + HM / 2 - 0.5)); i++)
          hmap[j * HM + i] = Math.max(hmap[j * HM + i], c.max.y);
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
  scene.add(g); propMeshes.push(g);
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

// ================= 地形：谷と二つの丘（132m 四方・点対称） =================
// 高さ：川底 = GROUND、谷 V、段々 T2・T4、高台 PL、丘 HB（下の段）・HT（頂上）、吊り橋 ROPE、崖の小道 LEDGE
export const LV = { V: GROUND + 1, T2: GROUND + 3, T4: GROUND + 5, PL: GROUND + 7, HB: GROUND + 8, HT: GROUND + 11, ROPE: GROUND + 6, LEDGE: GROUND + 4 };
// 出撃：あなたは左の橋の南のたもと（相手は点対称の右の橋の北のたもと）
export const SPAWN = { x: -34, z: 9 };
// 川（この高さより低い所にいると水の中：遅くなる）
export const WATER_Y = GROUND + 0.4;

// ================= 置き物（すべて点対称に置いて公平に） =================
{
  const G0 = GROUND;
  // 下端の高さ y0 に置く箱（mats: 1つ、または [右,左,上,下,前,後]）
  const boxMesh = (w, h, d, mats) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats);
  const lying = (ch, w, l, t) => { const p = makePiece(ch, w, l, t); p.rotation.x = -Math.PI / 2; const g = new THREE.Group(); p.position.y = t / 2; g.add(p); return g; };
  const standing = (ch, w, h, t) => { const p = makePiece(ch, w, h, t); p.position.y = h / 2; const g = new THREE.Group(); g.add(p); return g; };
  const komabako = () => {
    const g = new THREE.Group(), m = toon({ map: darkWoodTex, roughness: 0.75 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(5.2, 1.7, 2.6), m); body.position.y = 0.85;
    const lid = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.35, 2.8), m); lid.position.set(0.15, 1.87, 0.05); lid.rotation.y = 0.04;
    g.add(body, lid); return g;
  };
  const yunomi = (r, h) => {
    const g = new THREE.Group();
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.82, h, 10), mat(P.seiji[1], { roughness: 0.4 }));
    cup.position.y = h / 2;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.01, r * 1.01, h * 0.12, 10), mat(P.seiji[0], { roughness: 0.4 }));
    band.position.y = h * 0.75;
    const tea = new THREE.Mesh(new THREE.CircleGeometry(r * 0.88, 10), mat(P.moegi[1], { roughness: 0.2 }));
    tea.rotation.x = -Math.PI / 2; tea.position.y = h - 0.15;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(r * 0.94, r * 0.06, 4, 10), mat(P.seiji[1], { roughness: 0.4 }));
    rim.rotation.x = Math.PI / 2; rim.position.y = h;
    g.add(cup, band, tea, rim); return g;
  };
  // 白壁の塀（瓦の笠つき）。長さ len は x 方向
  const wall = (len, h) => {
    const g = new THREE.Group();
    const w = boxMesh(len, h, 0.8, plasterM); w.position.y = h / 2;
    const base = boxMesh(len + 0.1, 0.6, 0.9, stoneM); base.position.y = 0.3;
    const cap = boxMesh(len + 0.6, 0.35, 1.4, roofM); cap.position.y = h + 0.1;
    g.add(w, base, cap); return g;
  };
  const rock = s => {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), stoneM);
    m.scale.set(s * rand(1, 1.4), s * rand(0.7, 1), s * rand(1, 1.3)); m.position.y = s * 0.55; m.rotation.y = rand(0, 3);
    const g = new THREE.Group(); g.add(m); return g;
  };
  const tree = s => {
    const g = new THREE.Group();
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.35 * s, 0.5 * s, 3 * s, 6), trunkM); t.position.y = 1.5 * s; g.add(t);
    for (let k = 0; k < 3; k++) {
      const c = new THREE.Mesh(new THREE.ConeGeometry((2.6 - k * 0.6) * s, 3 * s, 7), leafMs[k]);
      c.position.y = (3.2 + k * 1.5) * s; c.rotation.y = rand(0, 3); g.add(c);
    }
    return g;
  };
  // 段（上が芝、横が土）
  const terrace = (w, d, h) => { const g = new THREE.Group(); const m = boxMesh(w, h, d, [earthM, earthM, turfM, earthM, earthM, earthM]); m.position.y = h / 2; g.add(m); return g; };
  // 見張り台（大きな駒箱。壁登りで上がる）
  const tower = s => {
    const g = new THREE.Group();
    const m = boxMesh(s, s, s, toon({ map: darkWoodTex, roughness: 0.75 })); m.position.y = s / 2;
    const lid = boxMesh(s + 0.3, 0.35, s + 0.3, toon({ map: darkWoodTex, roughness: 0.75 })); lid.position.y = s + 0.17;
    const label = new THREE.Mesh(planeGeo, kanjiMat('駒')); label.scale.set(s * 0.7, s * 0.7, 1); label.position.set(0, s * 0.55, s / 2 + 0.01);
    g.add(m, lid, label); return g;
  };

  // (x, z) と (-x, -z) の2か所に置く。y0 は下端の高さ
  const place = (make, x, z, ry = 0, y0 = G0, cyl?, walk?) => {
    [[1, 0], [-1, Math.PI]].forEach(([s, add]) => {
      const o = make(); o.position.set(x * s, y0, z * s); o.rotation.y = ry + add;
      addSolid(o, cyl && { x: x * s, z: z * s, r: cyl.r, y0, y1: y0 + cyl.h }, walk);
    });
  };
  {
    const G0 = GROUND, { V, T2, T4, PL, HB, HT, ROPE, LEDGE } = LV;
    const boxMesh = (w, h, d, mats) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats);
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
    { const bed = new THREE.Mesh(new THREE.PlaneGeometry(2 * H, 6), mat(P.kiji[1])); bed.rotation.x = -Math.PI / 2; bed.position.set(0, G0 + 0.02, 0); bed.receiveShadow = true; scene.add(bed); }
    { const w = new THREE.Mesh(new THREE.PlaneGeometry(2 * H, 6.2), toon({ color: C(P.mizu[1]), transparent: true, opacity: 0.72 })); w.rotation.x = -Math.PI / 2; w.position.set(0, G0 + 0.7, 0); scene.add(w); }
    // 川から上がる石段（岸ごとに2か所）
    solidBox(-16.5, -13.5, G0, G0 + 0.5, 2, 3, stoneM, true); solidBox(48.5, 51.5, G0, G0 + 0.5, 2, 3, stoneM, true);
  
    // ----- 橋（左右）と欄干 -----
    solidBox(-36.5, -31.5, G0, V + 0.2, -3.5, 3.5, woodSideM, true);
    solidBox(-36.7, -36.3, V + 0.2, V + 1.1, -3.5, 3.5, woodSideM); solidBox(-31.7, -31.3, V + 0.2, V + 1.1, -3.5, 3.5, woodSideM);
    // ----- 真ん中の高い吊り橋（岩の柱の上。手すりは縄だけなので落とされやすい） -----
    land(-2, 2, 11, 15, ROPE, sides(stoneM, topM(P.nezumi[1])));
    solidBox(-1.2, 1.2, ROPE - 0.3, ROPE, -11, 11, woodSideM, true, false);
    for (const x of [-1.3, 1.3]) {
      const rope = boxMesh(0.06, 0.06, 22, mat(P.kiji[0])); rope.position.set(x, ROPE + 0.9, 0); scene.add(rope);
      for (const z of [-11, -5.5, 0, 5.5, 11]) { const post = boxMesh(0.12, 0.9, 0.12, woodSideM); post.position.set(x, ROPE + 0.45, z); scene.add(post); }
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
    stairs('z', -21, 20, 1, V, T2, 4); stairs('z', 8, 20, 1, V, T2, 4);        // 谷 → 2m
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
}

// (x, z) が障害物の中か。y はその場所に立つ高さ（それより低い段や盤は乗れるので障害物扱いしない）
export function insideCollider(x, z, R, y = 0) {
  return Math.abs(x) > H - R || Math.abs(z) > H - R || colliders.some(c => {
    const top = c.kind === 'cyl' ? c.y1 : c.max.y, bottom = c.kind === 'cyl' ? c.y0 : c.min.y;
    if (top <= y + 0.4 || bottom >= y + 1.8) return false;
    if (c.kind === 'cyl') return Math.hypot(x - c.x, z - c.z) < c.r + R;
    return x > c.min.x - R && x < c.max.x + R && z > c.min.z - R && z < c.max.z + R;
  });
}

// 動かない置き物を材質ごとに1つのメッシュへまとめる（描画回数を減らして軽くする。当たり判定は元の形のまま）
{
  const groups = new Map(), merged = [];
  scene.updateMatrixWorld(true);
  for (const obj of propMeshes) {
    obj.traverse((o: any) => {
      if (!o.isMesh || Array.isArray(o.material) || o.material.transparent) return;
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
  const rest = propMeshes.filter(obj => { let has = false; obj.traverse((o: any) => { if (o.isMesh && o.parent) has = true; }); return has || obj.isMesh && obj.parent; });
  propMeshes.length = 0; propMeshes.push(...rest);
  for (const { mat: m, geos } of groups.values()) {
    const g = new THREE.BufferGeometry();
    ['position', 'normal', 'uv'].forEach(n => { const a = concat(geos, n); if (a) g.setAttribute(n, a); });
    g.computeVertexNormals();   // 面ごとの陰影
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, m);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false; mesh.updateMatrix();
    scene.add(mesh); propMeshes.push(mesh);
  }
  // 背景・地面など動かない物も、毎フレームの位置の計算を省く
  for (const o of scene.children) if (o !== sky && !clouds.includes(o) && (o as any).isMesh && !(o as any).userData.phys) { o.matrixAutoUpdate = false; o.updateMatrix(); }
  // 弾・視線の判定を速くする（まとめた大きなメッシュでも、近くの三角形だけ調べる）
  for (const o of propMeshes) o.traverse((m: any) => { if (m.isMesh) m.geometry.computeBoundsTree(); });
}
