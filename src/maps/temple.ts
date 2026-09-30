// マップ：山寺の石段（作り方だけ。共通の部品は src/world/base.ts）
import { P, css, rgba } from '../palette';
import * as THREE from 'three';
import { BH, C, GROUND, H, LIGHT, V3, clamp, rand, settings } from '../core';
import { gs } from '../state';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SUN_DIR, boardTex, canvasTex, darkWoodTex, flatGeo, flatten, hemi, kanjiMat, makePiece, mat, planeGeo, scene, sky, sun, toon } from '../render';
import { G0, M4, beginMap, bellM, boxMesh, clouds, cur, deco, earthM, finishMap, glowM, land, lanternLitM, moonStoneM, place, plasterM, rock, roofM, sides, solidBox, stairsAt, stoneM, topM, tree, woodSideM } from '../world/base';

// ================= マップ2：山寺の石段（日暮れ・110m 四方・点対称） =================
// 麓 LOW → 中段 MID（5m 上）→ 境内 TOP（さらに 5m 上）。真ん中に本堂。出撃は麓の隅の山門
export function buildTemple() {
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
