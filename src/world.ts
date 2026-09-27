// 盤（中央の高台）・外周エリア・背景・障害物と当たり判定
import * as THREE from 'three';
import { BH, C, GROUND, H, V3, clamp, rand } from './core';
import { boardTex, canvasTex, darkWoodTex, kanjiMat, makePiece, mat, planeGeo, scene } from './render';

// ================= 地形・小道具 =================
export const propMeshes = [];   // 弾・視線を遮る
export const colliders = [];    // 移動の当たり判定（上に乗れる）
// walk: 上を歩ける面（盤・段・階段）。経路探索で「床」として扱う
export function addSolid(obj, cyl?, walk?) {
  scene.add(obj); propMeshes.push(obj);
  obj.traverse((o: any) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  obj.updateMatrixWorld(true);
  if (cyl) colliders.push({ kind: 'cyl', ...cyl, walk: !!walk });
  else { const b = new THREE.Box3().setFromObject(obj); colliders.push({ kind: 'box', min: b.min, max: b.max, walk: !!walk }); }
}
// その場所の地面の高さ（盤の上は 0、外周は GROUND）
export const groundAt = (x, z) => (Math.abs(x) <= BH + 1 && Math.abs(z) <= BH + 1 ? 0 : GROUND);

// ---------- 材質 ----------
export const woodSideM = new THREE.MeshStandardMaterial({ map: darkWoodTex, roughness: 0.8 });
export const plasterM = mat(0xf1ebdc, { roughness: 0.95 });   // 白壁
export const roofM = mat(0x3d4148, { roughness: 0.7 });       // 瓦
export const stoneM = mat(0x9a968c, { roughness: 1 });
export const earthM = mat(0x9b7a52, { roughness: 1 });
export const turfM = mat(0x7aa956, { roughness: 1 });
export const leafMs = [mat(0x4f8f3a), mat(0x5fa044), mat(0x3f7d34)];
export const trunkM = mat(0x6b4a2a);

// 盤（中央の高台。外周より 1.5 高い）
{
  const top = new THREE.MeshStandardMaterial({ map: boardTex, roughness: 0.75 });
  const b = new THREE.Mesh(new THREE.BoxGeometry(2 * BH + 2, 2.4, 2 * BH + 2), [woodSideM, woodSideM, top, woodSideM, woodSideM, woodSideM]);
  b.position.y = -1.2;
  addSolid(b, null, true);
  b.castShadow = false;
}

// 外周の地面（弾や矢が当たるように propMeshes に入れる）
{
  const tex = canvasTex(512, 512, (g, w) => {
    g.fillStyle = '#86b25e'; g.fillRect(0, 0, w, w);
    for (let i = 0; i < 1400; i++) { g.fillStyle = `rgba(${rand(40, 90)},${rand(90, 140)},${rand(30, 60)},${rand(0.15, 0.4)})`; g.fillRect(rand(0, w), rand(0, w), rand(2, 6), rand(2, 10)); }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(10, 10);
  const g = new THREE.Mesh(new THREE.PlaneGeometry(2 * H + 8, 2 * H + 8), new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }));
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
export const lambertVC = new THREE.MeshLambertMaterial({ vertexColors: true });
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
    const c = C(0x7fb35a).offsetHSL(rand(-0.02, 0.02), 0, rand(-0.05, 0.05));
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
  const LEAF = [0x4f8f3a, 0x5fa044, 0x3f7d34];
  for (let i = 0; i < 80; i++) {
    const a = rand(0, Math.PI * 2), r = rand(H + 14, 150);
    const x = Math.cos(a) * r, z = Math.sin(a) * r, s = rand(0.9, 1.8), y = GROUND + 1;
    parts.push([trunkG, 0x6b4a2a, M4(x, y + 1.25 * s, z, 0, s)]);
    for (let k = 0; k < 3; k++) parts.push([leafG[k], LEAF[(i + k) % 3], M4(x, y + (3 + k * 1.5) * s, z, rand(0, 3), s)]);
  }
  for (let i = 0; i < 14; i++) {
    const a = i / 14 * Math.PI * 2 + rand(-0.15, 0.15), r = rand(280, 360), h = rand(60, 120);
    const x = Math.cos(a) * r, z = Math.sin(a) * r, ry = rand(0, 3);
    parts.push([new THREE.ConeGeometry(h * 0.9, h, 6), 0x8a9bb0, M4(x, h / 2 - 10, z, ry)]);
    parts.push([new THREE.ConeGeometry(h * 0.9 * 0.28, h * 0.28, 6), 0xf4f7fb, M4(x, h / 2 - 10 + h * 0.36 + 0.5, z, ry)]);
  }
  scene.add(new THREE.Mesh(mergeParts(parts), lambertVC));

  const cm = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: C(0x9aa8b8), emissiveIntensity: 0.35 });
  for (let i = 0; i < 16; i++) {
    const cp = [];
    for (let k = 0; k < 5; k++) cp.push([new THREE.IcosahedronGeometry(rand(5, 9), 0), 0xffffff, M4(k * 6 - 12 + rand(-2, 2), rand(-1, 2), rand(-3, 3), 0, 1, 0.6)]);
    const g = new THREE.Mesh(mergeParts(cp), cm);
    g.position.set(rand(-400, 400), rand(70, 110), rand(-400, 400));
    scene.add(g); clouds.push(g);
  }
}

// ================= 置き物（すべて点対称に置いて公平に） =================
{
  const G0 = GROUND;
  // 下端の高さ y0 に置く箱（mats: 1つ、または [右,左,上,下,前,後]）
  const boxMesh = (w, h, d, mats) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats);
  const lying = (ch, w, l, t) => { const p = makePiece(ch, w, l, t); p.rotation.x = -Math.PI / 2; const g = new THREE.Group(); p.position.y = t / 2; g.add(p); return g; };
  const standing = (ch, w, h, t) => { const p = makePiece(ch, w, h, t); p.position.y = h / 2; const g = new THREE.Group(); g.add(p); return g; };
  const komabako = () => {
    const g = new THREE.Group(), m = new THREE.MeshStandardMaterial({ map: darkWoodTex, roughness: 0.75 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(5.2, 1.7, 2.6), m); body.position.y = 0.85;
    const lid = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.35, 2.8), m); lid.position.set(0.15, 1.87, 0.05); lid.rotation.y = 0.04;
    g.add(body, lid); return g;
  };
  const yunomi = (r, h) => {
    const g = new THREE.Group();
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.82, h, 10), mat(0x6f8f62, { roughness: 0.4 }));
    cup.position.y = h / 2;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.01, r * 1.01, h * 0.12, 10), mat(0x3f5a3a, { roughness: 0.4 }));
    band.position.y = h * 0.75;
    const tea = new THREE.Mesh(new THREE.CircleGeometry(r * 0.88, 10), mat(0x9bb04a, { roughness: 0.2 }));
    tea.rotation.x = -Math.PI / 2; tea.position.y = h - 0.15;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(r * 0.94, r * 0.06, 4, 10), mat(0x6f8f62, { roughness: 0.4 }));
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
    const m = boxMesh(s, s, s, new THREE.MeshStandardMaterial({ map: darkWoodTex, roughness: 0.75 })); m.position.y = s / 2;
    const lid = boxMesh(s + 0.3, 0.35, s + 0.3, new THREE.MeshStandardMaterial({ map: darkWoodTex, roughness: 0.75 })); lid.position.y = s + 0.17;
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
  // 階段：盤の縁から外へ下りる3段（1段 0.375 なので歩いて上り下りできる）
  const stairs = (cx, cz, dx, dz) => {
    for (let k = 0; k < 3; k++) {
      const h = -G0 - 0.375 * (k + 1);   // 盤に近い段ほど高い
      const along = BH + 1 + 0.5 + k;   // 1段の奥行き 1m（経路探索のマス目と合わせる）
      const w = dx ? 1 : 4, d = dx ? 4 : 1;
      [[1], [-1]].forEach(([s]) => {
        const m = boxMesh(w, h, d, stoneM);
        m.position.set(s * (dx ? dx * along : cx), G0 + h / 2, s * (dz ? dz * along : cz));
        addSolid(m, null, true);
      });
    }
  };

  // ----- 盤の上（整理して、遮蔽物として意味のあるものだけ） -----
  const king = standing('王', 3.6, 5.4, 1.3); addSolid(king);                       // 中央の目印
  place(komabako, 0, -12, 0, 0);                                                     // 手前の遮蔽
  place(() => standing('金', 3, 4.4, 1.1), 12, -9, 0, 0);                            // 背の高い遮蔽
  place(() => standing('銀', 3, 4.4, 1.1), -12, -9, 0, 0);
  place(() => lying('香', 3.2, 4.2, 1.0), 6, 4, 0, 0);                               // 低い遮蔽（上に乗れる）
  place(() => lying('歩', 2.4, 3, 0.9), 6, -15, 0, 0);
  place(() => yunomi(1.5, 3.2), 16, -3, 0, 0, { r: 1.5, h: 3.2 });
  place(() => yunomi(0.9, 1.7), 4, -8, 0, 0, { r: 0.9, h: 1.7 });

  // ----- 盤から外周へ下りる階段（各辺に2か所） -----
  // stairs(cx, cz, dx, dz)：x の辺なら z=cz の位置、z の辺なら x=cx の位置（点対称で反対側にも置く）
  stairs(0, 12, 1, 0); stairs(0, -12, 1, 0);   // x の辺
  stairs(12, 0, 0, 1); stairs(-12, 0, 0, 1);   // z の辺

  // ----- 外周 -----
  // 出撃地点の前の塀（開始時にお互いが見えない）
  place(() => wall(18, 4), 0, 33, 0);
  place(() => wall(7, 4), 10.5, 36.5, Math.PI / 2);
  place(() => wall(7, 4), -10.5, 36.5, Math.PI / 2);
  // 段々の丘（角）：上から全体を見渡せる
  place(() => terrace(12, 12, 1.5), 34, 34, 0, G0, null, true);
  place(() => terrace(6.5, 6.5, 1.5), 36.5, 36.5, 0, G0 + 1.5, null, true);   // 上の段は壁登りで
  // 丘へ上がる階段（盤側の縁から）
  [0, 1, 2].forEach(k => place(() => { const h = 0.375 * (3 - k); const g = new THREE.Group(); const m = boxMesh(3, h, 1, stoneM); m.position.y = h / 2; g.add(m); return g; }, 31, 27.5 - k, 0, G0, null, true));
  // 見張り台（壁登りで上がる高い駒箱）
  place(() => tower(5), 34, -34, 0);
  place(() => { const g = new THREE.Group(); const m = boxMesh(2.2, 1.2, 2.2, woodSideM); m.position.y = 0.6; g.add(m); return g; }, 30.4, -31, 0.3);
  // L字の塀
  place(() => wall(9, 3.2), 38, 18, Math.PI / 2);
  place(() => wall(5, 3.2), 35.5, 22.2, 0);
  // 岩
  place(() => rock(1.6), 30, 8);
  place(() => rock(1.3), 31, -9);
  place(() => rock(1.8), 15, 38);
  place(() => rock(1.2), -30, 26);
  // 倒れた大きな駒（低い遮蔽・足場）
  place(() => lying('飛', 4.5, 6, 1.4), 36, 1, 0);
  place(() => lying('桂', 3, 3.8, 1.0), 26, 15, 0.6);
  place(() => lying('角', 3.4, 4.4, 1.1), 38, -22, Math.PI / 2);
  // 木（幹で止まり、葉は弾を遮る）
  [[27, -29, 1], [24, -33, 0.9], [30, -26, 1.1], [16, 30, 1], [20, 29, 0.85], [39, 8, 1]].forEach(([x, z, s]) => place(() => tree(s), x, z, rand(0, 3), G0, { r: 0.45 * s, h: 3 * s }));

  // 外周の囲い（高い板塀）
  const fence = (x, z, len, rot) => {
    const g = new THREE.Group();
    const m = boxMesh(len, 3.5, 0.6, woodSideM); m.position.y = 1.75; g.add(m);
    for (let i = -len / 2; i <= len / 2; i += 4) { const p = boxMesh(0.5, 4, 0.8, woodSideM); p.position.set(i, 2, 0); g.add(p); }
    g.position.set(x, G0, z); g.rotation.y = rot;
    addSolid(g);
  };
  fence(0, H + 0.3, 2 * H + 1, 0); fence(0, -H - 0.3, 2 * H + 1, 0);
  fence(H + 0.3, 0, 2 * H + 1, Math.PI / 2); fence(-H - 0.3, 0, 2 * H + 1, Math.PI / 2);
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
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, m);
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh); propMeshes.push(mesh);
  }
}
