// 盤・背景・障害物と当たり判定
'use strict';

// ================= 地形・小道具 =================
const propMeshes = [];   // 弾・視線を遮る
const colliders = [];    // 移動の当たり判定
function addSolid(obj, cyl) {
  scene.add(obj); propMeshes.push(obj);
  obj.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  obj.updateMatrixWorld(true);
  if (cyl) colliders.push({ kind: 'cyl', ...cyl });
  else { const b = new THREE.Box3().setFromObject(obj); colliders.push({ kind: 'box', min: b.min, max: b.max }); }
}

// 盤（アリーナ）
{
  const side = new THREE.MeshStandardMaterial({ map: darkWoodTex, roughness: 0.8 });
  const top = new THREE.MeshStandardMaterial({ map: boardTex, roughness: 0.75 });
  const b = new THREE.Mesh(new THREE.BoxGeometry(2 * H + 2, 2.4, 2 * H + 2), [side, side, top, side, side, side]);
  b.position.y = -1.2; b.receiveShadow = true; scene.add(b);
  propMeshes.push(b);
  // 縁の低い柵
  const railM = new THREE.MeshStandardMaterial({ map: darkWoodTex, roughness: 0.8 });
  const rail = (x, z, w, d) => { const r = new THREE.Mesh(new THREE.BoxGeometry(w, 0.5, d), railM); r.position.set(x, 0.25, z); r.castShadow = r.receiveShadow = true; scene.add(r); };
  rail(0, -H - 0.6, 2 * H + 2, 0.5); rail(0, H + 0.6, 2 * H + 2, 0.5);
  rail(-H - 0.6, 0, 0.5, 2 * H + 2); rail(H + 0.6, 0, 0.5, 2 * H + 2);
  // 盤の脚
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
    const l = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.2, 2.2, 8), side);
    l.position.set(sx * (H - 3), -3.4, sz * (H - 3)); scene.add(l);
  });
}

// ---------- 背景を1つのメッシュにまとめる（描画回数を減らして軽くする） ----------
// parts: [geometry, color, matrix] の配列 → 頂点カラー付きの1メッシュ（面ごとの陰影でローポリ感）
function mergeParts(parts) {
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
const lambertVC = new THREE.MeshLambertMaterial({ vertexColors: true });
const M4 = (x, y, z, ry = 0, s = 1, sy = s) => new THREE.Matrix4().compose(new V3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new V3(s, sy, s));

// 地面（ローポリの草原）
{
  const geo = new THREE.PlaneGeometry(700, 700, 60, 60).toNonIndexed();
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, cols = [];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), d = Math.max(Math.abs(x), Math.abs(z));
    const k = clamp((d - 30) / 40, 0, 1);
    pos.setY(i, -4.5 + (Math.sin(x * 0.05) * Math.cos(z * 0.045) * 3 + Math.sin(x * 0.13 + z * 0.07) * 1.2) * k);
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

// 木・山（まとめて1メッシュ）・雲（1つずつ1メッシュ）
const clouds = [];
{
  const parts = [];
  const trunkG = new THREE.CylinderGeometry(0.35, 0.5, 2.5, 5);
  const leafG = [0, 1, 2].map(k => new THREE.ConeGeometry(2.6 - k * 0.6, 3, 6));
  const LEAF = [0x4f8f3a, 0x5fa044, 0x3f7d34];
  for (let i = 0; i < 70; i++) {
    const a = rand(0, Math.PI * 2), r = rand(38, 120);
    const x = Math.cos(a) * r, z = Math.sin(a) * r, s = rand(0.8, 1.6);
    parts.push([trunkG, 0x6b4a2a, M4(x, -4.5 + 1.25 * s, z, 0, s)]);
    for (let k = 0; k < 3; k++) parts.push([leafG[k], LEAF[(i + k) % 3], M4(x, -4.5 + (3 + k * 1.5) * s, z, rand(0, 3), s)]);
  }
  for (let i = 0; i < 14; i++) {
    const a = i / 14 * Math.PI * 2 + rand(-0.15, 0.15), r = rand(260, 340), h = rand(60, 120);
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

// 障害物（点対称に配置して公平に）
{
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
  const stack = () => {
    const g = new THREE.Group();
    ['金', '銀', '桂'].forEach((ch, i) => { const p = lying(ch, 3, 3.6, 0.8); p.position.y = i * 0.8; p.rotation.y = rand(-0.25, 0.25) + i * 0.1; g.add(p); });
    return g;
  };
  const place = (make, x, z, ry, cyl) => {
    [[1, 0], [-1, Math.PI]].forEach(([s, add]) => {
      const o = make(); o.position.set(x * s, 0, z * s); o.rotation.y = ry + add;
      addSolid(o, cyl && { x: x * s, z: z * s, r: cyl.r, y0: 0, y1: cyl.h });
    });
  };
  place(() => lying('香', 3.2, 4.2, 1.0), -9, -6, 0);
  place(() => standing('金', 3.2, 4.6, 1.1), 9, -9, 0);
  place(komabako, 0, -11.5, 0);
  place(() => yunomi(1.5, 3.2), -15, -12, 0, { r: 1.5, h: 3.2 });
  place(stack, 14, -2, 0);
  place(() => lying('歩', 2.4, 3, 0.9), -4.5, -16, 0.1);
  place(() => lying('と', 2.4, 3, 0.9), 17, -16, Math.PI / 2);
  place(() => lying('銀', 2.8, 3.4, 1.0), -6.5, 0.8, Math.PI / 2);
  place(() => yunomi(0.9, 1.7), 5, -5, 0, { r: 0.9, h: 1.7 });
  place(() => standing('角', 2.6, 3.8, 0.9), -17, 3, Math.PI / 2);
  const king = standing('王', 3.6, 5.4, 1.3); addSolid(king);
}


function insideCollider(x, z, R) {
  return Math.abs(x) > H - R || Math.abs(z) > H - R || colliders.some(c => {
    if (c.kind === 'cyl') return Math.hypot(x - c.x, z - c.z) < c.r + R;
    return x > c.min.x - R && x < c.max.x + R && z > c.min.z - R && z < c.max.z + R;
  });
}
