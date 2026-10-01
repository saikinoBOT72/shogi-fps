// マップ：雪の温泉街（作り方だけ。共通の部品は src/world/base.ts）
import { P, css, rgba } from '../palette';
import * as THREE from 'three';
import { BH, C, GROUND, H, LIGHT, V3, clamp, rand, settings } from '../core';
import { gs } from '../state';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SUN_DIR, boardTex, canvasTex, darkWoodTex, flatGeo, flatten, hemi, kanjiMat, makePiece, mat, planeGeo, scene, sky, sun, toon } from '../render';
import { G0, beginMap, boxMesh, clouds, cur, deco, finishMap, glowM, land, lanternLitM, moonStoneM, place, plasterM, rock, roofM, sides, solidBox, skyWall, stairsAt, stoneM, topM, tree, woodSideM } from '../world/base';

// ================= マップ3：雪の温泉街（夜・110m 四方・点対称） =================
// 外側が高い盆地。高さ：露天風呂の底 = GROUND、広場 L、町 U（出撃もここ）
// 左上（-x,-z）に2階建ての旅館、右上（+x,-z）に土産物屋の並び。右下・左下はその点対称
export function buildOnsen() {
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
  skyWall(55, G0 + 16);

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
