// マップ：三つのピラミッド（作り方だけ。共通の部品は src/world/base.ts）
import { P, css, rgba } from '../palette';
import * as THREE from 'three';
import { BH, C, GROUND, H, LIGHT, V3, clamp, rand, settings } from '../core';
import { gs } from '../state';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SUN_DIR, boardTex, canvasTex, darkWoodTex, flatGeo, flatten, hemi, kanjiMat, makePiece, mat, planeGeo, scene, sky, sun, toon } from '../render';
import { G0, M4, beginMap, boxMesh, clouds, cur, deco, finishMap, lambertVC, land, mergeParts, place, rock, sides, solidBox, stairsAt, stoneM, topM, trunkM, woodSideM } from '../world/base';

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
export function buildDesert() {
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
