// マップ：谷と二つの丘（作り方だけ。共通の部品は src/world/base.ts）
import { P, css, rgba } from '../palette';
import * as THREE from 'three';
import { BH, C, GROUND, H, LIGHT, V3, clamp, rand, settings } from '../core';
import { gs } from '../state';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SUN_DIR, boardTex, canvasTex, darkWoodTex, flatGeo, flatten, hemi, kanjiMat, makePiece, mat, planeGeo, scene, sky, sun, toon } from '../render';
import { G0, beginMap, boxMesh, clouds, cur, earthM, finishMap, land, place, plasterM, rock, roofM, sides, solidBox, stoneM, topM, tree, turfM, wall, woodSideM } from '../world/base';

// ================= マップ1：谷と二つの丘（132m 四方・点対称） =================
// 高さ：川底 = GROUND、谷 V、段々 T2・T4、高台 PL、丘 HB（下の段）・HT（頂上）、吊り橋 ROPE、崖の小道 LEDGE
export function buildValley() {
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
