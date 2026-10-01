// マップ：霧の渓谷（作り方だけ。共通の部品は src/world/base.ts）
import { P } from '../palette';
import * as THREE from 'three';
import { C, V3, clamp } from '../core';
import { canvasTex, mat, toon } from '../render';
import { rgba } from '../palette';
import { G0, MAPS, beginMap, boxMesh, cur, deco, finishMap, moonStoneM, rock, sides, solidBox, skyWall, stoneM, topM, woodSideM } from '../world/base';

// ================= マップ5：霧の渓谷（朝霧・110m 四方・点対称） =================
// 真ん中を幅20m ほどの浅い川が z 方向にゆるく蛇行して流れる。岸は三段：河原（+1m）→ 中段の道（+6m）→ 崖の上（+12m）
// 段の間は岩のでこぼこした急な斜面で、歩いて上れない（滑り落ちる）。上り下りは、斜面を斜めに刻んだ小道だけ
// 渡るのは、真ん中の長い吊り橋（崖の上から突き出た岩の岬どうし）と、z = ±30 の飛び石。川はどこでも渡れるが遅い
// 地形は箱ではなく、なめらかな高さの格子（kind 'hf'）。左岸だけを決め、右岸は点対称（(x, z) → (-x, -z)）で同じ形
// 「谷と二つの丘」と似ないように、草の緑は使わない（岩・くすんだ苔・白い霧・青緑の川）
const U = 12, M = 6, BEACH = 1;           // 崖の上・中段・河原の高さ（G0 から）
export const GORGE_WATER = G0 + 0.7;      // 水面（浅い。どこでも歩いて渡れるが遅い）
const MAX_SLOPE = 0.9;                    // これより急な地面は歩いて上れない

// 川の中心線（ゆるい蛇行。奇関数なので点対称になる）
const cline = (z: number) => 3 * Math.sin(z / 17);
// 左岸の帯の幅（q = 岸ごとの z。左岸は z、右岸は -z を入れると点対称になる）
const riverW = (q: number) => (10 + 1.2 * Math.sin(q / 9 + 0.5) + 2 * Math.exp(-((q / 12) ** 2))) * (1 - 0.35 * ss(42, 55, Math.abs(q)));   // 真ん中は淵で広く、両端（洞窟の入口）へ細くなる
const benchW = (q: number) => 6 + 1.5 * Math.sin(q / 7 + 1);
const BEACH_W = 4, SLOPE1 = 4.5, SLOPE2 = 4;
// 帯の境目（川の中心からの距離）
const edges = (q: number) => {
  const r = riverW(q), b = r + BEACH_W, s1 = b + SLOPE1, bw = s1 + benchW(q), s2 = bw + SLOPE2;
  return { r, b, s1, bw, s2 };
};
const ss = (a: number, b: number, t: number) => { const k = clamp((t - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };
// 岩肌のでこぼこ（斜面ほど強く）
const bumpy = (x: number, z: number) => 0.35 * (Math.sin(1.3 * x + 0.7 * z) + Math.sin(0.9 * z - 1.7 * x)) + 0.2 * Math.sin(2.9 * x - 2.3 * z);

// 小道（左岸）：z が za → zb で、高さが ya → yb。band 0 は下の斜面、1 は上の斜面の中ほどを通る
const TRAILS = [
  { band: 0, za: -7, zb: -20, ya: BEACH, yb: M },   // 河原 → 中段
  { band: 1, za: -24, zb: -39, ya: M, yb: U },      // 中段 → 崖の上
  { band: 0, za: 22, zb: 35, ya: BEACH, yb: M },
  { band: 1, za: 20, zb: 5, ya: M, yb: U },
];
const TRAIL_HW = 1.6;   // 小道の半分の幅

// 左岸の高さ（d：川の中心からの距離、q：その岸の z）
function bankH(d: number, q: number, x: number, z: number) {
  const e = edges(q);
  let h = 0;
  h += BEACH * ss(e.r - 1, e.b, d);                         // 川床 → 河原
  h += (M - BEACH) * ss(e.b, e.s1, d);                      // 下の斜面
  h += (U - M) * ss(e.bw, e.s2, d);                         // 上の斜面
  const steep = ss(e.b - 0.5, e.b + 1, d) * (1 - ss(e.s1 - 1, e.s1 + 0.5, d)) + ss(e.bw - 0.5, e.bw + 1, d) * (1 - ss(e.s2 - 1, e.s2 + 0.5, d));
  h += bumpy(x, z) * (0.25 + steep * 1.2) * ss(e.r, e.b, d);   // 斜面は岩のでこぼこ、平らな所は少しだけ
  // 崖の上のゆるい起伏（岩場の小山）
  h += 1.6 * Math.exp(-(((d - 38) ** 2) / 40 + ((q + 14) ** 2) / 60)) + 2.2 * Math.exp(-(((d - 30) ** 2) / 30 + ((q - 30) ** 2) / 40));
  // 岬：真ん中（|q| < 5）は崖の上が川の近くまで突き出て、吊り橋のたもとになる
  // 先へ行くほど細く、横腹は岩のでこぼこ（箱に見えないように）。上は吊り橋のたもとだけ平ら
  const hw = 2.2 + 0.18 * Math.max(0, 24 - d);
  const spur = (U + bumpy(x, z) * 0.6 * ss(1.5, hw, Math.abs(q))) * (1 - ss(hw, hw + 4, Math.abs(q))) * ss(11.5, 15, d + 0.6 * Math.sin(q * 0.9));   // d ≧ 15.6 は必ず平ら（吊り橋の端が乗る）
  h = Math.max(h, spur);
  // 吊り橋の通り道（幅 ±2.2m）は、板より少し低く（地面の起伏が板にかぶらないように）
  if (Math.abs(q) < 2.6 && d > 11 && d < 21) h = Math.min(h, U - 0.04 + 0.6 * ss(2.2, 2.6, Math.abs(q)));
  // 小道：斜面を斜めに削った、ゆるい坂（1m で 0.4m 以下）
  for (const t of TRAILS) {
    const lo = Math.min(t.za, t.zb), hi = Math.max(t.za, t.zb);
    if (q < lo - 2 || q > hi + 2) continue;
    const u = clamp((q - t.za) / (t.zb - t.za), 0, 1), y = t.ya + (t.yb - t.ya) * u;
    const mid = t.band === 0 ? (e.b + e.s1) / 2 : (e.bw + e.s2) / 2;
    const k = (1 - ss(TRAIL_HW, TRAIL_HW + 1.2, Math.abs(d - mid))) * (1 - ss(0, 2, Math.max(lo - q, q - hi, 0)));
    h = h * (1 - k) + y * k;
  }
  // 外周：崖の上の外側（|x| > 50）と、谷の両端（|z| > 49）の岸は、上れない岩の崖になってせり上がる（外周の壁のかわり）
  //   川の所は少し奥（|z| > 51.5）からせり上がり、その手前を岩の堰がふさぐ（川は岩の間へ消えていく）
  const ex = ss(50, 55, Math.abs(x)), ez = ss(49, 55, Math.abs(q)) * ss(e.r + 0.5, e.r + 5, d), er = ss(51.5, 55, Math.abs(q));
  h += (10 + bumpy(x, z) * 1.5) * Math.max(ex, ez, er);
  return h;
}
// 流れの筋のテクスチャ（透明な地に、流れの向き＝v 方向に伸びた白い筋）
function streakTex() {
  const t = canvasTex(64, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) {
      const x = Math.random() * w, y = Math.random() * h, l = 10 + Math.random() * 40;
      g.strokeStyle = rgba(P.shiro[2], 0.12 + Math.random() * 0.35); g.lineWidth = 1 + Math.random() * 2;
      for (const oy of [0, h, -h]) { g.beginPath(); g.moveTo(x, y + oy); g.lineTo(x + (Math.random() - 0.5) * 3, y + l + oy); g.stroke(); }
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
// 川の流れ（水の中にいると押し流される。m/秒）：真ん中の淵から両端へ、川の中心線に沿って。真ん中ほど速く、岸の近くと淵は遅い
//   点対称：(x, z) の流れと (-x, -z) の流れは逆向きで同じ強さ
export function gorgeFlow(x: number, z: number): [number, number] {
  const sg = Math.sign(z) || 1, tx = sg * (3 / 17) * Math.cos(z / 17), l = Math.hypot(tx, 1);
  const k = 1.0 * (1 - ss(5, 11, Math.abs(x - cline(z)))) * ss(1, 8, Math.abs(z));   // 歩いて上流へも進める強さ
  return [tx / l * k, sg / l * k];
}

// その場所の地形の高さ（G0 から。整地の前）。左岸はそのまま、右岸は点対称の左岸を見る
function heightAt(x: number, z: number) {
  if (x > cline(z)) { x = -x; z = -z; }
  return bankH(cline(z) - x, z, x, z);
}

// ----- 整地：建物の下の地面を平らにする（建物は必ずこの高さに置くので、埋まりも浮きも出ない） -----
// 座標は左岸（右岸は点対称で同じ整地になる）。まわり 1.2m は平らのまま、その外 2.5m でもとの地面へなめらかにつなぐ
type Pad = { x: number; z: number; hw: number; hd: number; y: number };
const PADS: Pad[] = [];
function addPad(x: number, z: number, hw: number, hd: number) {
  let s = 0;
  for (const [a, b] of [[0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]]) s += heightAt(x + a * hw * 0.8, z + b * hd * 0.8);
  const p = { x, z, hw, hd, y: s / 5 }; PADS.push(p); return p;
}
function groundH(x: number, z: number) {
  if (x > cline(z)) { x = -x; z = -z; }
  let h = bankH(cline(z) - x, z, x, z);
  // いちばん強くかかる整地だけを使う（整地が重なっても、ほかの整地の平らな所を崩さない）
  let best: Pad | null = null, bk = 0;
  for (const p of PADS) {
    // 1.2m 外までは完全に平ら（地形の格子は 1m ごとなので、端の建物の下も必ず平らになる）
    const dx = Math.max(Math.abs(x - p.x) - p.hw - 1.2, 0), dz = Math.max(Math.abs(z - p.z) - p.hd - 1.2, 0), k = 1 - ss(0, 2.5, Math.hypot(dx, dz));
    if (k > bk) { bk = k; best = p; }
  }
  return best ? h * (1 - bk) + best.y * bk : h;
}
// 帯の中の位置 → 左岸の x。beach 河原・bench 中段は t が 0（川側）〜1（崖側）の割合、top 崖の上は t が縁からの距離（m）
const bandX = (z: number, band: 'beach' | 'bench' | 'top', t: number) => {
  const e = edges(z), d = band === 'beach' ? e.r + t * (e.b - e.r) : band === 'bench' ? e.s1 + t * (e.bw - e.s1) : e.s2 + t;
  return cline(z) - d;
};

export function buildGorge() {
  beginMap('gorge', {
    lv: { V: G0 + U, U: G0 + U, M: G0 + M },
    spawn: { x: -46, z: 0 },   // 左の崖の上の奥（相手は点対称の右）。真ん中の吊り橋の正面
    water: GORGE_WATER,
    flow: gorgeFlow,
    atmos: () => ({
      top: C(P.mizu[2]).lerp(C(P.shiro[2]), 0.55), hor: C(P.shiro[1]), bot: C(P.nezumi[1]),
      sunDir: new V3(0.65, 0.32, -0.45), sunCol: C(P.shiro[2]).lerp(C(P.kin[2]), 0.25), sunI: 0.75,   // 低い朝日
      hemiSky: C(P.mizu[2]), hemiGround: C(P.nezumi[0]), hemiI: 0.55,
      fog: C(P.shiro[1]).lerp(C(P.mizu[2]), 0.15), near: 10, far: 80, clouds: false, noGround: true, noScenery: true,
    }),
  });

  // ----- 置き物の場所（左岸。右岸は点対称）。建物・台の下は、地形を作る前に整地しておく -----
  PADS.length = 0;
  const HUT = { x: bandX(-22, 'top', 9), z: -22, hw: 2.6, hd: 3.6 };          // 山小屋（2部屋）
  const GUARD = { x: bandX(6, 'top', 3.5), z: 6, hw: 1.6, hd: 1.6 };          // 橋の番小屋
  const YAG = { x: bandX(-8, 'top', 2.8), z: -8, h: 3.2, ramp: 8 };           // 見張りやぐら（3m 四方の台。-z 側から坂で上がる）
  const KILN = { x: bandX(28, 'top', 6), z: 28, r: 2.2 };                     // 炭焼き窯
  const LUMBER = { x: bandX(44, 'top', 16), z: 44 };                          // 材木置き場
  const SHRINE = { x: bandX(-45, 'bench', 0.55), z: -45 };                    // 祠と鳥居（中段）
  const MILL = { x: bandX(44, 'bench', 0.55), z: 44, hw: 1.7, hd: 1.7 };      // 水車小屋（中段。水車は +z 側）
  const SHED = { x: bandX(38, 'beach', 0.6), z: 38 };                          // 釣り小屋（河原）
  const STACKS = [[-14, 10], [-36, 14], [18, 5]].map(([z, t]) => ({ x: bandX(z, 'top', t), z }));   // 薪の山
  const hutPad = addPad(HUT.x, HUT.z, HUT.hw, HUT.hd);
  const guardPad = addPad(GUARD.x, GUARD.z, GUARD.hw, GUARD.hd);
  const yagPad = addPad(YAG.x, YAG.z - (YAG.ramp + 1.5) / 2, 1.8, (YAG.ramp + 3) / 2 + 0.2);
  const kilnPad = addPad(KILN.x, KILN.z, KILN.r + 0.3, KILN.r + 0.3);
  const lumberPad = addPad(LUMBER.x, LUMBER.z, 1.6, 3.2);
  const shrinePad = addPad(SHRINE.x, SHRINE.z + 1, 1.3, 2.4);
  const millPad = addPad(MILL.x, MILL.z + 0.3, MILL.hw + 0.2, MILL.hd + 0.6);
  const shedPad = addPad(SHED.x, SHED.z, 1.2, 1.4);
  const stackPads = STACKS.map(s => addPad(s.x, s.z, 0.7, 1.4));
  cur.gorgePads = PADS;   // 確認用（整地の場所）

  // ----- 地形：1m ごとの高さの格子（当たり判定と見た目を同じ格子で作る） -----
  const HN = 111, HX = -55, hts = new Float32Array(HN * HN);
  for (let j = 0; j < HN; j++) for (let i = 0; i < HN; i++) hts[j * HN + i] = G0 + groundH(HX + i, HX + j);
  const hAt = (x: number, z: number) => {
    const fx = clamp(x - HX, 0, HN - 1.001), fz = clamp(z - HX, 0, HN - 1.001), i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    const h = (a: number, b: number) => hts[b * HN + a];
    // 見た目の三角形（対角線は (i+1, j) と (i, j+1) を結ぶ）と同じ面で高さを出す（見た目と当たり判定がぴったり同じ）
    const a = h(i, j), b = h(i + 1, j), d = h(i, j + 1), e = h(i + 1, j + 1);
    return u + v <= 1 ? a + (b - a) * u + (d - a) * v : e + (d - e) * (1 - u) + (b - e) * (1 - v);
  };
  let hmax = G0; for (const v of hts) hmax = Math.max(hmax, v);
  cur.colliders.push({ kind: 'hf', at: hAt, hts, holeV: new Uint8Array(HN * HN), n: HN, x0: HX, walk: true, surf: 'stone', maxSlope: MAX_SLOPE,
    min: new V3(-55, G0, -55), max: new V3(55, hmax, 55) });
  // 見た目：高さと傾きで色を変える（川床の砂利・河原の白い石・斜面の岩・中段の土・崖の上のくすんだ苔）
  //   頂点の色を使うので、置き物をまとめる finishMap のあとで足す（まとめると色が消える）
  let terrain: THREE.Mesh;
  {
    const pos: number[] = [], col: number[] = [], idx: number[] = [], c = new THREE.Color();
    const bedC = C(P.nezumi[0]).lerp(C(P.kiji[0]), 0.25), beachC = C(P.shiro[0]).lerp(C(P.nezumi[2]), 0.5), rockC = C(P.nezumi[0]).lerp(C(P.sumi[2]), 0.35);
    const benchC = C(P.kiji[0]).lerp(C(P.nezumi[0]), 0.55), mossC = C(P.seiji[0]).lerp(C(P.nezumi[0]), 0.55);
    for (let j = 0; j < HN; j++) for (let i = 0; i < HN; i++) {
      const x = HX + i, z = HX + j, h = hts[j * HN + i] - G0;
      pos.push(x, hts[j * HN + i], z);
      const gx = hAt(x + 0.5, z) - hAt(x - 0.5, z), gz = hAt(x, z + 0.5) - hAt(x, z - 0.5), slope = Math.hypot(gx, gz);
      if (h < 0.5) c.copy(bedC);
      else if (h < BEACH + 0.6) c.copy(beachC);
      else if (h < M + 0.8) c.copy(benchC);
      else c.copy(mossC);
      c.lerp(rockC, ss(0.5, 1.1, slope));   // 急な所は岩
      c.offsetHSL(0, 0, (Math.sin(i * 1.7 + j * 0.9) + Math.sin(i * 0.37 - j * 1.3)) * 0.015);
      col.push(c.r, c.g, c.b);
    }
    for (let j = 0; j < HN - 1; j++) for (let i = 0; i < HN - 1; i++) { const a = j * HN + i, b = a + 1, d = a + HN, e = d + 1; idx.push(a, d, b, b, d, e); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx); g.computeVertexNormals();
    terrain = new THREE.Mesh(g, toon({ vertexColors: true })); terrain.receiveShadow = true; terrain.castShadow = true;
  }

  // ----- 水面（半透明。弾は抜ける。流れは手順3） -----
  {
    const water = new THREE.Mesh(new THREE.PlaneGeometry(36, 110), toon({ color: C(P.seiji[1]).lerp(C(P.mizu[0]), 0.4), transparent: true, opacity: 0.75 }));
    water.rotation.x = -Math.PI / 2; water.position.set(0, GORGE_WATER, 0); cur.group.add(water);
    cur.gorgeWater = water;
    const foam = streakTex(); foam.repeat.set(36 / 9, 55 / 18);
    cur.gorgeFoam = [1, -1].map(s => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(36, 55), new THREE.MeshBasicMaterial({ map: s > 0 ? foam : foam.clone(), transparent: true, depthWrite: false, opacity: 0.55 }));
      m.rotation.x = -Math.PI / 2; m.position.set(0, GORGE_WATER + 0.03, s * 27.5); cur.group.add(m); return m;
    });
  }

  // ----- 真ん中の長い吊り橋（岬どうし。縄の手すりだけなので落ちやすい） -----
  {
    const w = 16.8, y = G0 + U;   // 端は岬の平らな所に 1m ほど乗る
    solidBox(-w, w, y - 0.25, y, -1.2, 1.2, woodSideM, true, false);
    cur.colliders[cur.colliders.length - 1].nav = true;   // CPU も渡れる
    const ropeM = mat(P.kiji[0]), SAG = 0.3, ropeY = (x: number) => 0.95 - SAG * (1 - (x / w) ** 2);   // 縄は真ん中ほどたるむ
    for (const zz of [-1.3, 1.3]) {
      const pts = Array.from({ length: 17 }, (_, k) => { const x = -w + k * w / 8; return new V3(x, y + ropeY(x), zz); });
      const rope = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.035, 5), ropeM); cur.group.add(rope);
      for (let k = -4; k <= 4; k++) { const x = k * w / 4, ph = ropeY(x); const post = boxMesh(0.12, ph, 0.12, woodSideM); post.position.set(x, y + ph / 2, zz); cur.group.add(post); }
    }
  }

  // ----- 飛び石（z = ±30。川の中を速く渡れる。目立つので狙われやすい） -----
  {
    const stoneTop = mat(P.nezumi[1], { roughness: 1 }); stoneTop.userData.surf = 'stone';
    const z = -30, x0 = cline(z), top = GORGE_WATER + 0.35;
    for (let k = -4; k <= 4; k++) {
      const x = x0 + k * 2.3 + (k % 2) * 0.3, zz = z + (k % 2 ? 0.6 : -0.4);
      for (const s of [1, -1]) {
        const r = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.05, top - G0, 7), stoneTop);
        r.position.set(x * s, (top + G0) / 2, zz * s); r.rotation.y = k; deco(r);
        cur.colliders.push({ kind: 'cyl', x: x * s, z: zz * s, r: 0.9, y0: G0, y1: top, walk: true, surf: 'stone' });
      }
    }
  }

  // ----- 岩（河原・中段・崖の上。物陰になる） -----
  for (const [x, z, sc] of [[-12, -12, 1.6], [-11, 12, 1.3], [-21, -30, 1.8], [-24, 26, 1.5], [-40, 30, 2], [-30, 44, 1.7]] as [number, number, number][]) {
    for (const s of [1, -1]) {
      const px = x * s, pz = z * s, y = hAt(px, pz) - 0.3;
      const r = rock(sc); r.position.set(px, y, pz); deco(r);
      cur.colliders.push({ kind: 'cyl', x: px, z: pz, r: sc * 0.95, y0: y, y1: y + sc * 1.1, walk: true, surf: 'stone' });
    }
  }

  // ================= 手順2：建物と置き物（座標は左岸。すべて点対称の右岸にも置く） =================
  // 建物・台は整地した高さ（Y(pad)）に置く。小物は足もとのいちばん低い所に置いて少し沈める（坂でもすき間が出ない）
  // 置き物どうし・置き物と斜面の間は、通れる幅（1.3m 以上）か、ぴったり付けるかのどちらか（半端なすき間を作らない）
  const Y = (p: Pad) => G0 + p.y;
  const plankTop = topM(P.kiji[1]); plankTop.userData.surf = 'wood';
  const floorM = sides(woodSideM, plankTop);
  const shingleM = mat(C(P.sumi[1]).lerp(C(P.kiji[0]), 0.3).getHex(), { roughness: 0.9 });
  const barkM = mat(P.kiji[0], { roughness: 1 }), cutM = mat(P.kiji[2], { roughness: 1 });
  const lowAt = (x: number, z: number, rx: number, rz = rx) => {
    let m = Infinity;
    for (const a of [-1, -0.5, 0, 0.5, 1]) for (const b of [-1, -0.5, 0, 0.5, 1]) m = Math.min(m, hAt(x + a * rx, z + b * rz));
    return m;
  };
  // 見た目だけ（弾は遮る）を点対称に2つ置く
  const put = (make: () => THREE.Object3D, x: number, z: number, y: number, ry = 0) => {
    for (const s of [1, -1]) { const o = make(); o.position.set(x * s, y, z * s); o.rotation.y = ry + (s < 0 ? Math.PI : 0); deco(o); }
  };
  // 当たり判定だけの箱（点対称に2つ）
  const colBox = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, walk = true, surf = 'wood') => {
    for (const s of [1, -1]) {
      const [a0, a1] = [x0 * s, x1 * s].sort((p, q) => p - q), [b0, b1] = [z0 * s, z1 * s].sort((p, q) => p - q);
      cur.colliders.push({ kind: 'box', min: new V3(a0, y0, b0), max: new V3(a1, y1, b1), walk, surf });
    }
  };
  const colCyl = (x: number, z: number, r: number, y0: number, y1: number, walk = false, surf = 'wood') => {
    for (const s of [1, -1]) cur.colliders.push({ kind: 'cyl', x: x * s, z: z * s, r, y0, y1, walk, surf });
  };
  const postG = (r: number, h: number, m: THREE.Material) => { const g = new THREE.Group(); const p = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.1, h, 6), m); p.position.y = h / 2; g.add(p); return g; };
  // 壁：z に沿う壁（厚みは x の xa..xb）と、x に沿う壁（厚みは z の za..zb）。holes：[始め, 終わり, 下, 上]（下・上は床からの高さ）
  const wallZ = (xa: number, xb: number, za: number, zb: number, y: number, h: number, holes: number[][] = []) => {
    let z = za;
    for (const [h0, h1, lo, hi] of holes) {
      if (h0 > z) solidBox(xa, xb, y, y + h, z, h0, woodSideM);
      if (lo > 0) solidBox(xa, xb, y, y + lo, h0, h1, woodSideM);
      if (hi < h) solidBox(xa, xb, y + hi, y + h, h0, h1, woodSideM);
      z = h1;
    }
    if (zb > z) solidBox(xa, xb, y, y + h, z, zb, woodSideM);
  };
  const wallX = (za: number, zb: number, xa: number, xb: number, y: number, h: number, holes: number[][] = []) => {
    let x = xa;
    for (const [h0, h1, lo, hi] of holes) {
      if (h0 > x) solidBox(x, h0, y, y + h, za, zb, woodSideM);
      if (lo > 0) solidBox(h0, h1, y, y + lo, za, zb, woodSideM);
      if (hi < h) solidBox(h0, h1, y + hi, y + h, za, zb, woodSideM);
      x = h1;
    }
    if (xb > x) solidBox(x, xb, y, y + h, za, zb, woodSideM);
  };
  // 小屋：表（+x、谷側）・裏・両横の壁と床、板葺きの屋根（上に乗れる）。壁どうしは重ねない（面がちらつくので）
  const WH = 2.6, T = 0.22;
  const cabin = (cx: number, cz: number, hw: number, hd: number, y: number, front: number[][], side0: number[][] = [], side1: number[][] = [], divider = false) => {
    const x0 = cx - hw, x1 = cx + hw, z0 = cz - hd, z1 = cz + hd;
    solidBox(x0 + T, x1 - T, y, y + 0.1, z0 + T, z1 - T, floorM, true);
    wallZ(x0, x0 + T, z0, z1, y, WH);
    wallZ(x1 - T, x1, z0, z1, y, WH, front);
    wallX(z0, z0 + T, x0 + T, x1 - T, y, WH, side0);
    wallX(z1 - T, z1, x0 + T, x1 - T, y, WH, side1);
    if (divider) wallX(cz - 0.1, cz + 0.1, x0 + T, x1 - T, y, WH, [[cx - 0.55, cx + 0.55, 0, 2.05]]);
    solidBox(x0 - 0.45, x1 + 0.45, y + WH, y + WH + 0.28, z0 - 0.45, z1 + 0.45, shingleM, true);
    solidBox(cx - 0.35, cx + 0.35, y + WH + 0.28, y + WH + 0.55, z0 - 0.45, z1 + 0.45, shingleM);
  };
  const door = (c: number, lo = 0) => [c - 0.6, c + 0.6, lo, 2.05], win = (c: number) => [c - 0.55, c + 0.55, 1.0, 1.8];
  // 板の坂（z の向きに上る。厚み th の板だけが当たる＝下はくぐれる。見た目も同じ板。途中を2本の脚で支える）
  const plankRampZ = (x: number, zLo: number, zHi: number, yBase: number, yLow: number, yHigh: number, w: number, th = 0.14) => {
    const len = zHi - zLo, dh = yHigh - yLow, L = Math.hypot(len, dh), ang = Math.atan2(dh, len);
    const zm = (zLo + zHi) / 2, ym = (yLow + yHigh) / 2;
    put(() => {
      const g = new THREE.Group();
      const board = boxMesh(w, th, L, woodSideM); board.rotation.x = -ang; board.position.y = -th / 2 / Math.cos(ang); g.add(board);
      for (let t = 0.4; t < L - 0.2; t += 0.6) { const c = boxMesh(w, 0.04, 0.07, woodSideM); c.position.set(0, th / 2 + 0.02, t - L / 2); board.add(c); }   // 滑り止めの横木
      return g;
    }, x, zm, ym);
    // 脚：上の方（6割と9割の所）を支える。脚だけが当たる
    for (const f of [0.6, 0.9]) {
      const zz = zLo + len * f, top = yLow + dh * f - th;
      for (const dx of [-(w / 2 - 0.08), w / 2 - 0.08]) { put(() => postG(0.07, top - yBase, woodSideM), x + dx, zz, yBase); colCyl(x + dx, zz, 0.07, yBase, top); }
    }
    for (const s of [1, -1]) {
      const X = x * s, lo = zLo * s, hi = zHi * s;
      cur.colliders.push({ kind: 'ramp', axis: 'z', lo, hi, y0: yLow, y1: yHigh, thick: th, walk: true, nav: true, surf: 'wood',
        min: new V3(X - w / 2, yLow - th, Math.min(lo, hi)), max: new V3(X + w / 2, yHigh, Math.max(lo, hi)) });
    }
  };

  // ----- 1 山小屋（2部屋。表に戸口と窓、奥の部屋は +z の横にも戸口。仕切りに通り口） -----
  cabin(HUT.x, HUT.z, HUT.hw, HUT.hd, Y(hutPad), [door(HUT.z - 1.8), win(HUT.z + 1.8)], [win(HUT.x)], [door(HUT.x)], true);
  // ----- 6 橋の番小屋（橋のある -z の横に戸口） -----
  cabin(GUARD.x, GUARD.z, GUARD.hw, GUARD.hd, Y(guardPad), [win(GUARD.z)], [door(GUARD.x)], [win(GUARD.x)]);

  // ----- 5 見張りやぐら（3m の台と屋根。-z 側から坂で上がる。谷側・奥・+z は板の手すり） -----
  {
    const y = Y(yagPad), h = YAG.h, x = YAG.x, z = YAG.z, H2 = 2.2;
    for (const [a, b] of [[-1.35, -1.35], [1.35, -1.35], [-1.35, 1.35], [1.35, 1.35]]) {
      put(() => postG(0.15, h + H2, woodSideM), x + a, z + b, y);
      colCyl(x + a, z + b, 0.15, y, y + h + H2);
    }
    solidBox(x - 1.5, x + 1.5, y + h - 0.2, y + h, z - 1.5, z + 1.5, floorM, true);
    cur.colliders[cur.colliders.length - 1].nav = cur.colliders[cur.colliders.length - 2].nav = true;
    solidBox(x + 1.38, x + 1.5, y + h, y + h + 0.95, z - 1.5, z + 1.5, woodSideM);
    solidBox(x - 1.5, x - 1.38, y + h, y + h + 0.95, z - 1.5, z + 1.5, woodSideM);
    solidBox(x - 1.38, x + 1.38, y + h, y + h + 0.95, z + 1.38, z + 1.5, woodSideM);
    solidBox(x - 1.8, x + 1.8, y + h + H2, y + h + H2 + 0.25, z - 1.8, z + 1.8, shingleM, true);
    plankRampZ(x, z - 1.5 - YAG.ramp, z - 1.5, y, y, y + h, 1.3);
  }

  // ----- 2 薪の山（腰の高さの物陰。上に乗れる） -----
  STACKS.forEach((st, i) => {
    const y = Y(stackPads[i]);
    solidBox(st.x - 0.55, st.x + 0.55, y, y + 1.1, st.z - 1.2, st.z + 1.2, [cutM, cutM, barkM, barkM, barkM, barkM], true);
  });

  // ----- 3 杉林（背の高い黒っぽい杉。幹だけ当たる） -----
  {
    const leaf = [mat(C(P.midori[0]).lerp(C(P.sumi[1]), 0.45).getHex()), mat(C(P.midori[0]).lerp(C(P.sumi[1]), 0.3).getHex()), mat(C(P.midori[0]).lerp(C(P.seiji[0]), 0.35).getHex())];
    const cedar = (s: number) => {
      const g = new THREE.Group();
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.22 * s, 0.34 * s, 3.4 * s, 6), barkM); t.position.y = 1.7 * s; g.add(t);
      for (let k = 0; k < 4; k++) { const c = new THREE.Mesh(new THREE.ConeGeometry((1.7 - k * 0.35) * s, 2.6 * s, 7), leaf[k % 3]); c.position.y = (3 + k * 1.35) * s; c.rotation.y = k; g.add(c); }
      return g;
    };
    const groves: [number, number, number[][]][] = [
      [12, 14, [[0, 0, 1.1], [2.6, 1.8, 0.95], [-1.2, 3.2, 1], [1.8, -2.6, 0.9]]],
      [38, 9, [[0, 0, 1], [-2.4, -2, 1.1], [2, 1.6, 0.9]]],
      [-46, 15, [[0, 0, 1.1], [-2.5, 1.5, 0.95], [2, 2.2, 1]]],
      [-5, 15, [[0, 0, 1], [-2.2, -1.8, 1.1]]],
      [-28, 17, [[0, 0, 1], [-1.8, 2.4, 0.9]]],
    ];
    for (const [z, t, trees] of groves) {
      const bx = bandX(z, 'top', t);
      for (const [dx, dz, s] of trees) {
        const x = bx - dx, zz = z + dz, y = lowAt(x, zz, 0.4) - 0.15;
        put(() => cedar(s), x, zz, y, dx);
        colCyl(x, zz, 0.36 * s, y, y + 6 * s);
      }
    }
  }

  // ----- 12 材木置き場（丸太を3段に積む。当たり判定も段ごと） -----
  {
    const y = Y(lumberPad), x = LUMBER.x, z = LUMBER.z, L = 6, r = 0.35;
    put(() => {
      const g = new THREE.Group();
      [[4, 0], [3, 1], [2, 2]].forEach(([n, k]) => {
        for (let i = 0; i < n; i++) {
          const lg = new THREE.Mesh(new THREE.CylinderGeometry(r, r, L - k * 0.3, 8), [barkM, cutM, cutM] as any);
          lg.rotation.x = Math.PI / 2; lg.position.set((i - (n - 1) / 2) * 0.7, r + k * 0.6, 0); g.add(lg);
        }
      });
      return g;
    }, x, z, y);
    [[1.4, 0, 0.7], [1.05, 0.7, 1.3], [0.7, 1.3, 1.95]].forEach(([hw, a, b]) => colBox(x - hw, x + hw, y + a, y + b, z - L / 2, z + L / 2));
    // 杭は丸太にぴったり付ける（すき間を作らない）
    for (const dz of [-L / 2 - 0.1, L / 2 + 0.1]) for (const dx of [-1.3, 1.3]) { put(() => postG(0.1, 1.6, woodSideM), x + dx, z + dz, y); colCyl(x + dx, z + dz, 0.1, y, y + 1.6); }
  }

  // ----- 4 炭焼き窯（丸い土の窯。谷側に焚き口、奥に煙突。当たり判定は丸みの内側に収まる段々の円柱） -----
  {
    const y = Y(kilnPad), r = KILN.r, sy = 0.8;
    const clayM = mat(C(P.kiji[0]).lerp(C(P.nezumi[0]), 0.35).getHex(), { roughness: 1 });
    put(() => {
      const g = new THREE.Group();
      const dome = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2), clayM); dome.scale.y = sy; g.add(dome);
      const mouth = new THREE.Mesh(new THREE.CircleGeometry(0.55, 10, 0, Math.PI), mat(P.sumi[0])); mouth.position.set(r + 0.02, 0.02, 0); mouth.rotation.y = Math.PI / 2; g.add(mouth);
      const chim = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 1.7, 6), clayM); chim.position.set(-r * 0.55, sy * r * 0.8 + 0.4, 0); g.add(chim);
      return g;
    }, KILN.x, KILN.z, y);
    for (const rr of [2.1, 1.8, 1.3, 0.7]) colCyl(KILN.x, KILN.z, rr, y, y + sy * Math.sqrt(r * r - rr * rr), false, 'stone');
    cur.gorgeSmoke = [[KILN.x - r * 0.55, y + sy * r * 0.8 + 1.3, KILN.z]];   // 煙の出どころ（手順4）
  }

  // ----- 8 祠と鳥居（中段。鳥居は +z 側。柱だけ当たる） -----
  {
    const y = Y(shrinePad), x = SHRINE.x, z = SHRINE.z;
    solidBox(x - 0.6, x + 0.6, y, y + 0.4, z - 0.6, z + 0.6, stoneM, true);
    solidBox(x - 0.4, x + 0.4, y + 0.4, y + 1.2, z - 0.4, z + 0.4, woodSideM);
    solidBox(x - 0.62, x + 0.62, y + 1.2, y + 1.36, z - 0.62, z + 0.62, shingleM, true);
    const red = mat(P.shu[1], { roughness: 0.8 }), tz = z + 2.3;
    for (const a of [-0.95, 0.95]) { put(() => postG(0.11, 2.35, red), x + a, tz, y); colCyl(x + a, tz, 0.12, y, y + 2.35); }
    put(() => {
      const g = new THREE.Group();
      const kasagi = boxMesh(2.7, 0.16, 0.3, mat(P.sumi[1])); kasagi.position.y = 2.42; g.add(kasagi);
      const nuki = boxMesh(2.2, 0.11, 0.14, red); nuki.position.y = 2.0; g.add(nuki);
      return g;
    }, x, tz, y);
  }

  // ----- 13 石灯籠と道標（小道の上り口と出口。道はふさがない位置） -----
  {
    const lantern = () => {
      const g = new THREE.Group();
      const base = boxMesh(0.55, 0.22, 0.55, stoneM); base.position.y = 0.11; g.add(base);
      const pil = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.7, 6), stoneM); pil.position.y = 0.57; g.add(pil);
      const box = boxMesh(0.38, 0.34, 0.38, stoneM); box.position.y = 1.09; g.add(box);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.26, 4), stoneM); roof.position.y = 1.39; roof.rotation.y = Math.PI / 4; g.add(roof);
      return g;
    };
    const spots: [number, 'beach' | 'bench' | 'top', number][] = [[-9.5, 'beach', 0.5], [-21.5, 'bench', 0.25], [-22.5, 'bench', 0.8], [-40.5, 'top', 2], [25, 'beach', 0.5], [36.5, 'bench', 0.25], [21.5, 'bench', 0.8], [2.5, 'top', 1.5]];
    for (const [z, band, t] of spots) {
      const x = bandX(z, band, t), y = lowAt(x, z, 0.3) - 0.06;
      put(lantern, x, z, y); colCyl(x, z, 0.3, y, y + 1.5, false, 'stone');
    }
    const sx = bandX(-37.5, 'top', 1.2), sy = lowAt(sx, -37.5, 0.15) - 0.1;
    put(() => { const g = postG(0.07, 1.7, woodSideM); const b = boxMesh(0.06, 0.9, 0.24, mat(P.kiji[2])); b.position.set(0.09, 1.25, 0); g.add(b); return g; }, sx, -37.5, sy);
    colCyl(sx, -37.5, 0.12, sy, sy + 1.7);
  }

  // ----- 9 水車小屋（中段。谷側に戸口。水車は +z 側の外、そのすぐ外を細い流れが崖から河原へ落ちる） -----
  const millY = Y(millPad), millZ1 = MILL.z + MILL.hd, streamZ = millZ1 + 1.2;
  cabin(MILL.x, MILL.z, MILL.hw, MILL.hd, millY, [door(MILL.z)], [win(MILL.x)], []);
  colBox(MILL.x - 1.6, MILL.x + 1.6, millY, millY + 3.15, millZ1, millZ1 + 0.65, false);   // 壁にぴったり付ける   // 水車（回るので、見た目は finishMap のあと）

  // ----- 10 釣り小屋（河原。柱と屋根だけ）と小舟（岸に半分水に浸かって） -----
  {
    const y = Y(shedPad), x = SHED.x, z = SHED.z;
    for (const [a, b] of [[-1, -1.2], [1, -1.2], [-1, 1.2], [1, 1.2]]) { put(() => postG(0.1, 2.3, woodSideM), x + a, z + b, y); colCyl(x + a, z + b, 0.1, y, y + 2.3); }
    solidBox(x - 1.3, x + 1.3, y + 2.3, y + 2.5, z - 1.5, z + 1.5, shingleM, true);
    solidBox(x - 1.0, x - 0.55, y, y + 0.45, z - 1.1, z + 1.1, woodSideM, true);   // 腰掛け（両端は柱にぴったり）
    const bz = 34.5, e = edges(bz), bx = cline(bz) - (e.r - 1), by = lowAt(bx, bz, 0.5, 1.8) - 0.12;
    put(() => {
      const g = new THREE.Group();
      const hull = boxMesh(1.1, 0.5, 3.4, barkM); hull.position.y = 0.25; g.add(hull);
      for (const s of [1, -1]) { const tip = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.6, 4, 1), barkM); tip.rotation.x = s * Math.PI / 2; tip.rotation.y = Math.PI / 4; tip.scale.set(1, 1, 0.5); tip.position.set(0, 0.25, s * 2); g.add(tip); }
      const seat = boxMesh(1.0, 0.08, 0.3, woodSideM); seat.position.y = 0.45; g.add(seat);
      return g;
    }, bx, bz, by);
    colBox(bx - 0.55, bx + 0.55, by, by + 0.5, bz - 1.9, bz + 1.9);
  }

  // ----- 11 流木（河原に横たわる丸太。低い物陰） -----
  for (const [z, t, len] of [[-24, 0.55, 4], [20, 0.5, 3.4]] as [number, number, number][]) {
    const x = bandX(z, 'beach', t), r = 0.32, y = lowAt(x, z, 0.3, len / 2) + r - 0.12;
    put(() => { const g = new THREE.Group(); const lg = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.85, r, len, 7), mat(C(P.kiji[1]).lerp(C(P.shiro[1]), 0.35).getHex())); lg.rotation.x = Math.PI / 2; g.add(lg); return g; }, x, z, y);
    colBox(x - r, x + r, y - r, y + r * 0.9, z - len / 2, z + len / 2);
  }

  // ----- 物理演算の小物の置き場所（左岸の座標と、置く所の地面の高さ。作るのは physics.ts の placeGorge） -----
  {
    // 動く物は、足もとのいちばん高い所に置く（埋めない。置いた後は物理で落ち着く）
    const at = (x: number, z: number, r = 0.4, rz = r) => { let m = -Infinity; for (const a of [-1, -0.5, 0, 0.5, 1]) for (const b of [-1, -0.5, 0, 0.5, 1]) m = Math.max(m, hAt(x + a * r, z + b * rz)); return [x, z, m + 0.01]; };
    const shedY = Y(shedPad);
    cur.gorgePhys = {
      // 転がる丸太（崖の上の縁・中段の縁に、谷に沿って寝かせる。撃つと斜面を転がって川へ）
      logs: [at(bandX(18, 'top', 2), 18, 0.35, 1.5), at(bandX(38, 'top', 2), 38, 0.35, 1.5), at(bandX(-34, 'bench', 0.3), -34, 0.35, 1.5)],
      // 薪割り場（山小屋の -z の横。切り株と、割った薪の山）
      chop: at(HUT.x + 0.4, HUT.z - HUT.hd - 1.7, 0.5),
      // 炭俵（窯の +z 側に3つ積む。重い物陰）
      tawara: at(KILN.x - 0.4, KILN.z + KILN.r + 1.1, 0.9),
      // 水桶（水車小屋の戸口のわき）
      oke: [at(MILL.x + MILL.hw + 0.6, MILL.z - 1.1, 0.3), at(MILL.x + MILL.hw + 0.6, MILL.z - 1.7, 0.3), at(MILL.x + MILL.hw + 1.2, MILL.z - 1.4, 0.3)],
      // 木箱（番小屋の谷側。2つ並べて1つ載せる）
      crate: at(GUARD.x + GUARD.hw + 0.9, GUARD.z, 0.6, 1.2),
      // 魚籠・竿・浮き（釣り小屋のまわり）
      biku: [at(SHED.x + 0.3, SHED.z - 0.5, 0.2), at(SHED.x + 0.35, SHED.z + 0.3, 0.2)],
      sao: [at(SHED.x + 1.7, SHED.z, 0.1, 1.5), at(SHED.x + 1.95, SHED.z + 0.2, 0.1, 1.5)],
      uki: [[SHED.x - 0.78, SHED.z - 0.4, shedY + 0.45], [SHED.x - 0.78, SHED.z, shedY + 0.45], [SHED.x - 0.78, SHED.z + 0.4, shedY + 0.45]],
    };
  }

  // ----- 外周の崖 -----
  const mossTop = topM(C(P.seiji[0]).lerp(C(P.nezumi[0]), 0.55).getHex());
  solidBox(-58, 58, G0, G0 + U + 6, 55, 58, sides(moonStoneM, mossTop));
  solidBox(55, 58, G0, G0 + U + 6, -58, 58, sides(moonStoneM, mossTop));
  skyWall(55, G0 + U + 6);
  // 谷の両端：大きな岩が重なった堰。川は岩の間へ消えていく（岩どうしは重ねて、すき間を作らない）
  {
    const z = 50.3, e = edges(z), cx = cline(z);
    for (let k = 0, x = cx - e.r - 1.5; x <= cx + e.r + 1.5; k++, x += 2.1) {
      const sc = 1.9 + (k % 3) * 0.3, zz = z + (k % 2) * 0.7, y = hAt(x, zz) - 0.45;
      put(() => rock(sc), x, zz, y, k);
      colCyl(x, zz, sc * 0.95, y, y + sc * 1.1, true, 'stone');
    }
  }
  finishMap();
  cur.group.add(terrain); cur.props.push(terrain);
  terrain.geometry.computeBoundsTree(); terrain.matrixAutoUpdate = false; terrain.updateMatrix();

  // ----- 9 の続き：水車（回るので、まとめない。回すのは手順3） -----
  {
    const wheels: THREE.Group[] = [], r = 1.5;
    for (const s of [1, -1]) {
      const g = new THREE.Group();
      for (const zz of [0, 0.45]) { const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.09, 5, 18), woodSideM); rim.position.z = zz; g.add(rim); }
      for (let k = 0; k < 4; k++) { const sp = boxMesh(0.08, r * 2, 0.08, woodSideM); sp.rotation.z = k * Math.PI / 4; sp.position.z = 0.22; g.add(sp); }
      for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2, pd = boxMesh(0.07, 0.5, 0.55, woodSideM); pd.position.set(Math.cos(a) * r, Math.sin(a) * r, 0.22); pd.rotation.z = a; g.add(pd); }
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.7, 8), woodSideM); hub.rotation.x = Math.PI / 2; hub.position.z = 0.22; g.add(hub);
      g.position.set(MILL.x * s, millY + 1.6, (millZ1 + 0.12) * s); g.rotation.y = s < 0 ? Math.PI : 0;
      g.traverse((o: any) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      cur.group.add(g); cur.props.push(g); wheels.push(g);
    }
    cur.gorgeWheels = wheels;
  }
  // ----- 崖の上から中段・河原を通って川へ落ちる細い流れ（地面に沿わせた帯。弾は抜ける） -----
  {
    const e0 = edges(streamZ), pos: number[] = [], idx: number[] = [];
    let n = 0;
    // 地形の三角形は 1m ごとに折れるので、0.25m ごと・横3点で地面の高さを取り、12cm 浮かせる（地面にめり込まない）
    const uv: number[] = [], W3 = [-0.5, 0, 0.5];
    let len = 0, px = 0;
    for (let d = e0.s2 + 1.5; d >= e0.r - 0.3; d -= 0.25, n++) {
      const x = cline(streamZ) - d, y0 = hAt(x, streamZ);
      if (n) len += Math.hypot(x - px, y0 - pos[pos.length - 5]); px = x;
      for (const dz of W3) { pos.push(x, Math.max(hAt(x, streamZ + dz), y0 - 0.3) + 0.12, streamZ + dz); uv.push((dz + 0.5), len / 3); }
    }
    for (let i = 0; i < n - 1; i++) for (let c = 0; c < 2; c++) { const a = 3 * i + c; idx.push(a, a + 1, a + 3, a + 1, a + 4, a + 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    const wm = toon({ color: C(P.mizu[2]).lerp(C(P.shiro[2]), 0.3), transparent: true, opacity: 0.85 });
    const ft = streakTex(); ft.repeat.set(1, 1);
    const fm = new THREE.MeshBasicMaterial({ map: ft, transparent: true, depthWrite: false, opacity: 0.8 });
    const ms = [wm, fm].flatMap(mm => { const a = new THREE.Mesh(g, mm), b = new THREE.Mesh(g, mm); b.rotation.y = Math.PI; return [a, b]; });
    ms.forEach(m => cur.group.add(m)); cur.gorgeStreamTex = ft;
  }
  // ----- 手順4：炭焼き窯の煙と、谷底にたまる朝霧（ふわふわした板を、いつもカメラに向けて置く） -----
  {
    const puff = canvasTex(64, 64, (g, w) => {
      const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
      r.addColorStop(0, rgba(P.shiro[2], 0.9)); r.addColorStop(0.5, rgba(P.shiro[2], 0.35)); r.addColorStop(1, rgba(P.shiro[2], 0));
      g.fillStyle = r; g.fillRect(0, 0, w, w);
    });
    const sprite = (col: number) => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: puff, color: col, transparent: true, depthWrite: false, opacity: 0 })); cur.group.add(sp); return sp; };
    cur.gorgeSmokeSp = (cur.gorgeSmoke || []).flatMap(([x, y, z]: number[]) => [1, -1].flatMap(s => Array.from({ length: 7 }, (_, i) => ({ sp: sprite(P.nezumi[1]), x: x * s, y, z: z * s, t: i / 7 }))));
    cur.gorgeMist = Array.from({ length: 28 }, (_, i) => {
      const z = (i / 28 - 0.5) * 100;
      return { sp: sprite(P.shiro[2]), z, off: (Math.random() - 0.5) * 14, y: G0 + 1.4 + Math.random() * 2.4, size: 9 + Math.random() * 7, ph: Math.random() * 6 };
    });
  }
}

// ================= 毎フレームの動き（手順3）：水車・流れの筋 =================
export function updateGorge(rdt: number) {
  const m = MAPS.gorge; if (!m) return;
  for (const w of m.gorgeWheels || []) w.rotation.z -= rdt * 0.9;   // 水車：谷側の流れに押されて回る
  const f = m.gorgeFoam;
  if (f) { f[0].material.map.offset.y += rdt * 1.0 / 18; f[1].material.map.offset.y -= rdt * 1.0 / 18; }   // 下流（両端）へ
  if (m.gorgeStreamTex) m.gorgeStreamTex.offset.y -= rdt * 0.9;   // 細い流れは崖の上から川へ速く落ちる
  // 窯の煙：昇りながら広がり、最初と最後はうすく
  for (const p of m.gorgeSmokeSp || []) {
    p.t += rdt / 4.5; if (p.t >= 1) p.t -= 1;
    p.sp.position.set(p.x + Math.sin(p.t * 4 + p.x) * 0.3 + p.t * 1.2, p.y + p.t * 5, p.z + p.t * 0.6);
    p.sp.scale.setScalar(0.8 + p.t * 3.2); p.sp.material.opacity = Math.sin(Math.PI * p.t) * 0.4;
  }
  // 谷底の霧：川に沿ってゆっくり下流（両端）へ流れ、端まで行ったら真ん中から出直す
  const tt = performance.now() / 1000;
  for (const q of m.gorgeMist || []) {
    const sg = Math.sign(q.z) || 1;
    q.z += sg * 0.45 * rdt;
    if (Math.abs(q.z) > 50) q.z = (Math.random() - 0.5) * 6;
    const fade = ss(0, 6, Math.abs(q.z)) * (1 - ss(40, 50, Math.abs(q.z)));
    q.sp.position.set(cline(q.z) + q.off + Math.sin(tt * 0.2 + q.ph) * 1.5, q.y + Math.sin(tt * 0.3 + q.ph) * 0.3, q.z);
    q.sp.scale.set(q.size * 1.6, q.size * 0.55, 1); q.sp.material.opacity = 0.3 * fade;
  }
}
