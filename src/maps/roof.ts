// マップ8：夜の屋上（約80m 四方・左右対称にしない・雑居ビルが詰まった街）
// 高さのばらばらなビルの屋上を、飛び移り・すき間の中の外階段・板の橋・鉄骨の通路で渡る。下の通りへ落ちたら負け（LV.KILL より下）
// 配置は「案A 段々の塔」：真ん中に 2段の塔（6→10m）、まわりに 2〜11m のビルが 2m のすき間で詰まる。北と西には広い谷（鉄骨の通路で渡る）
//   ビルのすき間は 2m（同じ高さなら跳べる・低い方へは飛び降りられる）。高い方へは、すき間の中の外階段で上る（CPU もこれを使う）
// 出撃：北西のビル（5m）と南東のビル（4m）。公平さより面白さ（ユーザーの判断）
// ビルは木の彫り物（ほかのマップと同じ）。窓の明かりとネオンだけ光る
import * as THREE from 'three';
import { C, V3 } from '../core';
import { canvasTex, mat, toon } from '../render';
import { rgba } from '../palette';
import { G0, addSolid, beginMap, boxMesh, cur, deco, finishMap, lambertVC, mergeParts, solidBox } from '../world/base';

const B0 = G0 + 40;          // 屋上の高さの基準（下の通りから 40m）
const KILL = B0 - 4;         // ここより下へ落ちたら負け（いちばん低い 2m の屋上から 6m 下）
const SIDES = [1];           // 点対称にしない（作る関数は、この向きの分だけ置く）
const TH = 0.3;              // 橋・階段の板の厚み

// 面ごとに、だいたい tile m ごとに模様が繰り返す UV の箱（boss1 と同じ考え方）。面取りで形を替えられないよう、ただの BufferGeometry にする
function uvBox(w, h, d, tile) {
  const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    const nu = Math.max(1, Math.round(dims[f][0] / tile)), nv = Math.max(1, Math.round(dims[f][1] / tile));
    for (let i = 0; i < 4; i++) { const k = f * 4 + i; uv.setXY(k, uv.getX(k) * nu, uv.getY(k) * nv); }
  }
  return g.toNonIndexed();
}
// 上下の面を外した箱（遠くのビルの壁だけ。屋上は別の板）
function wallsOnly(w, h, d, tile) {
  const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    const nu = Math.max(1, Math.round(dims[f][0] / tile)), nv = Math.max(1, Math.round(dims[f][1] / tile));
    for (let i = 0; i < 4; i++) { const k = f * 4 + i; uv.setXY(k, uv.getX(k) * nu, uv.getY(k) * nv); }
  }
  const idx = g.index.array, keep = [];
  for (const gr of g.groups) if (gr.materialIndex !== 2 && gr.materialIndex !== 3) for (let i = gr.start; i < gr.start + gr.count; i++) keep.push(idx[i]);
  g.setIndex(keep); g.clearGroups();
  return g.toNonIndexed();
}

// 窓の模様：1枚で 4×4 区画（1区画 3m）。暗い壁に窓。明かりの点いた窓は emissive で光る
function windowTex(seed, wall, lit) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const on = [...Array(16)].map(() => rnd() < lit);
  const tint = [...Array(16)].map(() => rnd());
  const draw = glow => canvasTex(256, 256, g => {
    g.fillStyle = glow ? '#000' : wall; g.fillRect(0, 0, 256, 256);
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
      const k = j * 4 + i, x = i * 64 + 10, y = j * 64 + 14, w = 44, h = 34;
      if (glow) {
        if (!on[k]) continue;
        g.fillStyle = tint[k] < 0.65 ? '#ffd38a' : tint[k] < 0.85 ? '#fff1d6' : '#9fd8ff';
        g.globalAlpha = 0.55 + tint[k] * 0.4; g.fillRect(x, y, w, h); g.globalAlpha = 1;
        g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x + w / 2 - 1, y, 2, h);   // 窓の桟
      } else {
        g.fillStyle = on[k] ? '#c9b48a' : '#1d1c26'; g.fillRect(x, y, w, h);
        g.fillStyle = rgba(0x000000, 0.4); g.fillRect(x + w / 2 - 1, y, 2, h);
      }
    }
  });
  const map = draw(false), em = draw(true);
  for (const t of [map, em]) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return toon({ map, emissiveMap: em, emissive: C(0xffffff), emissiveIntensity: 1 });
}

// ----- 動き（毎フレーム updateRoof：weather.ts から、このマップの間だけ） -----
//   下の通りを走る車の光・ネオンのまたたき・探照灯・室外機の羽
const RM: any = { t: 0, cars: [], head: null, tail: null, fans: [], blades: null, flick: [], beams: [], bulbs: [], steam: [] };
const dummy = new THREE.Object3D();
export function updateRoof(rdt: number) {
  const t = (RM.t += rdt);
  // 車：通りに沿って進み、端まで行ったら反対の端へ
  if (RM.head) {
    RM.cars.forEach((c, i) => {
      c.p += c.v * rdt; if (c.p > 210) c.p -= 420; if (c.p < -210) c.p += 420;
      for (const [im, back] of [[RM.head, 0], [RM.tail, 3.2]] as [THREE.InstancedMesh, number][]) {
        const q = c.p - c.dir * back;
        dummy.position.set(c.axis === 'x' ? q : c.at, G0 + 0.6, c.axis === 'x' ? c.at : q);
        dummy.rotation.set(0, c.axis === 'x' ? Math.PI / 2 : 0, 0); dummy.updateMatrix();
        im.setMatrixAt(i, dummy.matrix);
      }
    });
    RM.head.instanceMatrix.needsUpdate = RM.tail.instanceMatrix.needsUpdate = true;
  }
  // ネオン：broken 壊れかけでちらつく / blink ゆっくり点滅 / double ときどき2回またたく / pulse ゆっくり明るさが揺れる
  for (const f of RM.flick) {
    let k = 1;
    if (f.mode === 'broken') k = Math.sin(t * 13.1) * Math.sin(t * 7.7) * Math.sin(t * 2.3) > 0.3 ? 0.12 : 1;
    else if (f.mode === 'blink') k = (t + f.ph) % 2.4 < 1.6 ? 1 : 0.08;
    else if (f.mode === 'double') { const a = (t + f.ph) % 9; k = (a > 8.2 && a < 8.32) || (a > 8.5 && a < 8.6) ? 0.1 : 1; }
    else if (f.mode === 'pulse') k = 0.6 + 0.4 * Math.sin(t * 1.3 + f.ph);
    f.m.color.copy(f.base).multiplyScalar(k);
  }
  // 探照灯：光の柱がゆっくり振れる
  for (const b of RM.beams) { b.m.rotation.set(0.42 + 0.14 * Math.sin(t * 0.21 + b.ph), b.yaw + 0.9 * Math.sin(t * 0.15 + b.ph), 0, 'YXZ'); b.m.updateMatrix(); }
  // 裸電球：ゆっくり揺れて、ときどきちらつく（窓の明かりも少し）
  for (const b of RM.bulbs) {
    b.g.rotation.set(Math.sin(t * 1.1 + b.ph) * 0.1, 0, Math.sin(t * 1.7 + b.ph * 2) * 0.13); b.g.updateMatrix();
    if (b.k < 1) b.k = Math.min(1, b.k + rdt * 6);
    else if (Math.random() < rdt * 0.35) b.k = 0.15;
    b.m.color.setScalar(b.k); b.w.color.setHex(0xffc070).multiplyScalar(0.6 + 0.4 * b.k);
  }
  // 排気の湯気：2.6 秒で上がりながら広がって消える
  for (const p of RM.steam) {
    p.t = (p.t + rdt) % 2.6;
    const a = p.t / 2.6;
    p.sp.position.set(p.o.x + a * 0.8, p.o.y + 0.1 + a * 2.4, p.o.z + a * 0.4);
    p.sp.scale.setScalar(0.5 + a * 1.8);
    p.sp.material.opacity = 0.3 * Math.min(1, a * 6) * (1 - a);
    p.sp.updateMatrix();
  }
  // 室外機の羽
  if (RM.blades) {
    RM.fans.forEach((f, i) => { dummy.position.copy(f); dummy.rotation.set(0, t * 9 + i, 0); dummy.updateMatrix(); RM.blades.setMatrixAt(i, dummy.matrix); });
    RM.blades.instanceMatrix.needsUpdate = true;
  }
}

export function buildRoof() {
  RM.cars = []; RM.fans = []; RM.flick = []; RM.beams = []; RM.bulbs = []; RM.steam = [];
  beginMap('roof', {
    lv: { V: B0 + 5.3, KILL },   // 出撃の高さ（高い方の 5m に合わせる。4m のビルは少し落ちて着く）
    spawn: { x: -34, z: -34 },   // 北西のビル（5m）
    spawn2: { x: 32, z: 34 },    // 南東のビル（4m）
    water: G0 - 100,
    void: true,
    nav: { layered: true, r: 0.4, step: 0.45, rampStep: 0.7 },   // 橋・階段の下をくぐれる所があるので、床を何枚も持たせる
    atmos: () => ({
      top: C(0x04050d), hor: C(0x2b1a46), bot: C(0x0b0814),
      sunDir: new V3(-0.35, 0.8, 0.45), sunCol: C(0x9fb2ff), sunI: 0.5,   // 月明かり
      hemiSky: C(0x5b4c94), hemiGround: C(0x2a1830), hemiI: 0.4,
      fog: C(0x1a1030), near: 70, far: 420, clouds: false, noGround: true, noScenery: true,
    }),
  });

  // ----- 材質 -----
  const facM = [windowTex(11, '#3a3440', 0.45), windowTex(29, '#2e3442', 0.35), windowTex(47, '#40363a', 0.55)];
  const roofTopM = mat(0x6a6670, { roughness: 1 }); roofTopM.userData.surf = 'stone';
  const curbM = mat(0x8a8590, { roughness: 1 }); curbM.userData.surf = 'stone';
  const underM = mat(0x15131a);
  const steelM = mat(0x55606e, { roughness: 0.6 }); steelM.userData.surf = 'wood';   // 鉄骨（足音は板と同じ）
  const plankM = mat(0x9a7a52, { roughness: 1 }); plankM.userData.surf = 'wood';
  const signM = mat(0x23202a);
  const edgeM = new THREE.MeshBasicMaterial({ color: 0x3fe8ff });   // 屋上の縁の光る線
  const hutM = mat(0x5d5866); hutM.userData.surf = 'stone';
  const tankM = mat(0x77737f), acM = mat(0x8d8c93), fanM = mat(0x1c1b22);
  const prefabM = mat(0xcfc6b0); prefabM.userData.surf = 'stone';   // プレハブの壁（明るいベージュ）
  const tinM = toon({ map: (() => { const t = canvasTex(64, 64, g => { g.fillStyle = '#6f7f8c'; g.fillRect(0, 0, 64, 64); for (let i = 0; i < 64; i += 8) { g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(i, 0, 3, 64); g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(i + 4, 0, 2, 64); } g.fillStyle = 'rgba(140,70,30,0.25)'; g.fillRect(0, 48, 64, 16); }); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 1); return t; })() });   // トタン（波板と錆）
  tinM.userData.surf = 'stone';
  const counterM = mat(0x7a5a3a); counterM.userData.surf = 'wood';
  const warmM = new THREE.MeshBasicMaterial({ color: 0xffc070 }), bulbM = new THREE.MeshBasicMaterial({ color: 0xfff2c0 });   // 窓の明かり・裸電球
  const wireM = new THREE.LineBasicMaterial({ color: 0x111014 });   // 電線
  const glowVCM = new THREE.MeshBasicMaterial({ vertexColors: true });   // 提灯（光る）
  const NEON_COLORS = ['#ff4fd8', '#3fe8ff', '#ffd23f', '#a46bff', '#47ff9a', '#ff6a3c', '#ff3355', '#5a8cff'];
  // 同じ字・色のネオンは材質を使い回す（またたく物だけは別に作る）
  const NC: Record<string, any> = {};
  //   mode（またたき方）が同じ看板は、いっしょにまたたく。色は字ごとに決まる（材質の数＝描く回数を抑える）
  const neonCache = (text, color, vertical, mode = '') => { const k = text + color + vertical + mode; if (!NC[k]) { const w = vertical ? 0.9 : 0.55 * text.length + 0.6, h = vertical ? 0.52 * text.length + 0.5 : 0.9; NC[k] = neonM(text, color, Math.round(w * 110), Math.round(h * 110), vertical); if (mode) RM.flick.push({ m: NC[k], base: NC[k].color.clone(), mode, ph: text.length * 1.7 }); } return NC[k]; };
  const wordColor = (text) => { let h = 0; for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) % 997; return NEON_COLORS[h % NEON_COLORS.length]; };
  // 自動販売機の光る前面（飲み物の段）
  const vendM = new THREE.MeshBasicMaterial({ map: canvasTex(96, 128, g => { g.fillStyle = '#e8f4ff'; g.fillRect(0, 0, 96, 128); const C2 = ['#d03030', '#3070d0', '#30a050', '#e0a020', '#8040b0']; for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) { g.fillStyle = C2[(r * 3 + c) % 5]; g.fillRect(6 + c * 15, 8 + r * 30, 10, 20); } }) });
  // 置き物を置かない所（小屋の中と戸口の前・物干しの下・給水塔の下）[西, 東, 北, 南, 床の高さ]
  const EXCL: number[][] = [];
  const ACR: number[][] = [];   // 室外機の列 [西, 東, 北, 南, 屋上の高さ]（床のしみと配管を付ける）
  // ネオンの字（暗い板に、色の光と白い芯）。vertical：縦書き（1字ずつ縦に並べる）
  const neonTex = (text, color, w, h, vertical) => canvasTex(w, h, g => {
    g.fillStyle = '#0b0910'; g.fillRect(0, 0, w, h);
    const chars = [...text], n = chars.length;
    const size = vertical ? Math.min(w * 0.72, h / n * 0.86) : Math.min(h * 0.62, w / n * 0.92);
    g.font = `bold ${Math.round(size)}px "Yu Gothic", "Hiragino Sans", "Noto Sans JP", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    const draw = () => { if (vertical) chars.forEach((c, i) => g.fillText(c, w / 2, h / 2 + (i - (n - 1) / 2) * size * 1.08)); else g.fillText(text, w / 2, h / 2); };
    g.strokeStyle = color; g.lineWidth = Math.max(4, Math.min(w, h) * 0.03); g.shadowColor = color; g.shadowBlur = 24;
    const m = g.lineWidth * 2; g.strokeRect(m, m, w - 2 * m, h - 2 * m);   // 縁の管
    g.fillStyle = color; g.shadowBlur = 40; draw(); draw();
    g.shadowBlur = 10; g.fillStyle = 'rgba(255,255,255,0.85)'; draw();
  });
  const neonM = (text, color, w, h, vertical) => new THREE.MeshBasicMaterial({ map: neonTex(text, color, w, h, vertical) });
  // 坂の上面の縞（1枚で1本）。alongU：u の向きに並べる（x 向きの坂）
  const stripeTex = (base, line, alongU) => {
    const t = canvasTex(32, 32, g => { g.fillStyle = base; g.fillRect(0, 0, 32, 32); g.fillStyle = line; if (alongU) g.fillRect(26, 0, 6, 32); else g.fillRect(0, 26, 32, 6); });
    t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
  };
  const stripeMs: any = {};

  // ----- ビル：下の通り（G0）から屋上まで。屋上の縁に低い笠木（0.2m。上を歩ける） -----
  //   noClimb：壁を登れない（出撃のビル。外階段と橋からだけ上がれる）
  const bld = (x0, x1, z0, z1, h, fm, noClimb = false) => {
    const top = B0 + h;
    for (const s of SIDES) {
      const m = new THREE.Mesh(uvBox(x1 - x0, top - G0, z1 - z0, 12), [fm, fm, roofTopM, underM, fm, fm]);
      m.position.set(s * (x0 + x1) / 2, (G0 + top) / 2, s * (z0 + z1) / 2);
      addSolid(m, null, true);
      if (noClimb) cur.colliders[cur.colliders.length - 1].noClimb = true;
      // 縁の笠木
      const c = 0.35;
      for (const [a0, a1, b0, b1] of [[x0, x1, z0, z0 + c], [x0, x1, z1 - c, z1], [x0, x0 + c, z0 + c, z1 - c], [x1 - c, x1, z0 + c, z1 - c]]) {
        const k = boxMesh(a1 - a0, 0.2, b1 - b0, curbM); k.position.set(s * (a0 + a1) / 2, top + 0.1, s * (b0 + b1) / 2);
        addSolid(k, null, true);
        if (noClimb) cur.colliders[cur.colliders.length - 1].noClimb = true;
      }
      // 縁のネオン（暗くても屋上の縁＝落ちる所が分かるように。笠木の外側の上の角に細い光の線。当たり判定なし）
      const X0 = Math.min(s * x0, s * x1), X1 = Math.max(s * x0, s * x1), Z0 = Math.min(s * z0, s * z1), Z1 = Math.max(s * z0, s * z1), e = 0.08;
      for (const [w, d, x, z] of [[X1 - X0 + 2 * e, e, (X0 + X1) / 2, Z0 - e / 2], [X1 - X0 + 2 * e, e, (X0 + X1) / 2, Z1 + e / 2], [e, Z1 - Z0, X0 - e / 2, (Z0 + Z1) / 2], [e, Z1 - Z0, X1 + e / 2, (Z0 + Z1) / 2]]) {
        const gl = boxMesh(w, e, d, edgeM); gl.position.set(x, top + 0.2 - e / 2, z); deco(gl);
      }
    }
  };
  // 番号は設計図の番号。[西, 東, 北, 南, 高さ]
  const BLD: [number, number, number, number, number][] = [
    [-40, -24, -40, -26, 5],   // 1 出撃（北西）
    [-22, -14, -40, -30, 8],   // 2
    [-12, 6, -40, -28, 3],     // 3
    [8, 22, -40, -32, 7],      // 4
    [24, 40, -40, -22, 4],     // 5
    [-40, -30, -24, -4, 9],    // 6
    [-28, -14, -24, -12, 2],   // 7 いちばん低い
    [14, 28, -30, -14, 5],     // 8（5 の上に少し重なって 1m 高い段）
    [30, 40, -20, 4, 11],      // 9 東の高いビル
    [-40, -30, -2, 18, 4],     // 10
    [14, 26, -12, 10, 3],      // 11
    [28, 40, 6, 22, 6],        // 12
    [-40, -20, 20, 40, 7],     // 13
    [-18, -2, 16, 30, 5],      // 14
    [0, 14, 16, 40, 9],        // 15
    [16, 40, 24, 40, 4],       // 16 出撃（南東）
    [-12, 12, -10, 14, 6],     // 塔 1段目
    [-8, 8, -6, 10, 10],       // 塔 2段目
    [4, 12, 24, 36, 12],       // 15 の上の段
  ];
  BLD.forEach(([x0, x1, z0, z1, h], i) => bld(x0, x1, z0, z1, h, facM[i % 3]));

  // ----- 坂（板の橋・鉄骨の通路・外階段）：axis の向きに lo（低い端・高さ y0）から hi（高い端・y1）へ上る。at は横の位置
  //   厚み TH の板だけが当たる（下はくぐれる）。solidLen：低い端からこの長さは下まで詰まった台にする（頭がつかえる低い所に入り込まないように）
  //   kind：'plank' 板（手すりなし）/ 'steel' 鉄骨（手すり）/ 'stair' 階段（段の見た目）
  const ramp = (axis, at, lo, hi, y0, y1, w, kind, opt: any = {}) => {
    for (const s of SIDES) {
      const A = at * s, LO = lo * s, HI = hi * s, len = Math.abs(HI - LO), dy = y1 - y0, dir = Math.sign(HI - LO);
      const ang = Math.atan2(dy, len), l3 = Math.hypot(len, dy), mid = (LO + HI) / 2, m = kind === 'plank' ? plankM : steelM;
      const g = new THREE.Group();
      // 段（階段）・滑り止めの横木（板）は、坂の上面に描いた縞（出っ張りを付けると、CPU が段を壁と思って止まる）
      const step = kind === 'stair' ? 0.3 : 0.6;
      const key = kind + axis + l3.toFixed(2);
      if (!stripeMs[key]) {
        const n = Math.max(1, Math.round(l3 / step)), t = stripeTex(kind === 'plank' ? '#9a7a52' : '#55606e', kind === 'plank' ? '#6e5434' : '#2c323b', axis === 'x');
        if (axis === 'z') t.repeat.set(1, n); else t.repeat.set(n, 1);
        stripeMs[key] = toon({ map: t }); stripeMs[key].userData.surf = m.userData.surf;
      }
      const sm = kind === 'stair' ? m : stripeMs[key];
      const slabG = (axis === 'z' ? new THREE.BoxGeometry(w, TH, l3) : new THREE.BoxGeometry(l3, TH, w)).toNonIndexed();   // 面取りで UV を替えられないよう、ただの形にする
      const slab = new THREE.Mesh(slabG, [m, m, sm, m, m, m]);
      if (axis === 'z') slab.rotation.x = -ang * dir; else slab.rotation.z = ang * dir;
      slab.position.y = -TH / 2 / Math.cos(ang);
      g.add(slab);
      g.position.set(axis === 'z' ? A : mid, (y0 + y1) / 2, axis === 'z' ? mid : A);
      deco(g);
      // 鉄骨の外階段の見た目：段（約 0.3m ごと）・両側の桁・手すり。当たり判定は坂のまま
      if (kind === 'stair') {
        const parts = [], n = Math.max(2, Math.round(len / 0.3)), run = len / n, rise = dy / n;
        const M = (x, y, z, rx = 0, rz = 0) => new THREE.Matrix4().compose(new V3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, rz)), new V3(1, 1, 1));
        const at = (t, y) => axis === 'z' ? [0, y, t * dir] : [t * dir, y, 0];   // 坂の向きの位置 t（真ん中が 0）
        for (let i = 0; i < n; i++) {
          const t = -len / 2 + (i + 0.5) * run, [x, y, z] = at(t, -dy / 2 + (i + 0.5) * rise + 0.02);
          parts.push([axis === 'z' ? new THREE.BoxGeometry(w - 0.16, 0.06, run + 0.04) : new THREE.BoxGeometry(run + 0.04, 0.06, w - 0.16), 0x7a8494, M(x, y, z)]);
        }
        const rx = axis === 'z' ? -ang * dir : 0, rz = axis === 'z' ? 0 : ang * dir;
        for (const side of [-1, 1]) {
          const off = side * (w / 2 - 0.05), o = (v) => axis === 'z' ? [off, v, 0] : [0, v, off];
          const [sx, sy, sz] = o(-0.12);
          parts.push([axis === 'z' ? new THREE.BoxGeometry(0.08, 0.32, l3) : new THREE.BoxGeometry(l3, 0.32, 0.08), 0x3e4652, M(sx, sy, sz, rx, rz)]);   // 桁
          const [hx, hy, hz] = o(0.95);
          parts.push([axis === 'z' ? new THREE.BoxGeometry(0.05, 0.05, l3) : new THREE.BoxGeometry(l3, 0.05, 0.05), 0x9aa3ae, M(hx, hy, hz, rx, rz)]);   // 手すり
          const np = Math.max(2, Math.round(len / 1.4));
          for (let k = 0; k <= np; k++) {
            const t = -len / 2 + len * k / np, y = -dy / 2 + dy * k / np, [px, , pz] = at(t, 0);
            parts.push([new THREE.BoxGeometry(0.05, 0.95, 0.05), 0x9aa3ae, M(px + (axis === 'z' ? off : 0), y + 0.475, pz + (axis === 'z' ? 0 : off))]);
          }
        }
        const look = new THREE.Mesh(mergeParts(parts), lambertVC);
        look.position.copy(g.position); deco(look, false);
      }
      const wmin = A - w / 2, wmax = A + w / 2, a0 = Math.min(LO, HI), a1 = Math.max(LO, HI);
      cur.colliders.push({ kind: 'ramp', axis, lo: LO, hi: HI, y0, y1, thick: TH, walk: true, nav: true, surf: m.userData.surf,
        min: new V3(axis === 'z' ? wmin : a0, y0 - TH, axis === 'z' ? a0 : wmin), max: new V3(axis === 'z' ? wmax : a1, y1, axis === 'z' ? a1 : wmax) });
      // 低い端の下を詰める（同じ坂の、下まで詰まった当たり判定）
      if (opt.solidLen) {
        const e = LO + dir * opt.solidLen, b0 = Math.min(LO, e), b1 = Math.max(LO, e), ye = y0 + dy * opt.solidLen / len;
        cur.colliders.push({ kind: 'ramp', axis, lo: LO, hi: e, y0, y1: ye, walk: true, nav: true, surf: m.userData.surf,
          min: new V3(axis === 'z' ? wmin : b0, opt.base, axis === 'z' ? b0 : wmin), max: new V3(axis === 'z' ? wmax : b1, ye, axis === 'z' ? b1 : wmax) });
        const fill = axis === 'z' ? boxMesh(w - 0.1, 1, b1 - b0, underM) : boxMesh(b1 - b0, 1, w - 0.1, underM);
        const sh = ye - TH - opt.base;
        if (sh > 0.05) { fill.scale.y = sh; fill.position.set(axis === 'z' ? A : (b0 + b1) / 2, opt.base + sh / 2, axis === 'z' ? (b0 + b1) / 2 : A); deco(fill); }
      }
      // 手すり（両側。高さ 1m。当たる）
      if (opt.rails) for (const side of [-1, 1]) {
        const off = side * (w / 2 - 0.03);
        const bar = axis === 'z' ? boxMesh(0.06, 0.06, l3, steelM) : boxMesh(l3, 0.06, 0.06, steelM);
        if (axis === 'z') bar.rotation.x = -ang * dir; else bar.rotation.z = ang * dir;
        bar.position.set(axis === 'z' ? A + off : mid, (y0 + y1) / 2 + 1, axis === 'z' ? mid : A + off);
        deco(bar);
        for (let t = 0; t <= len + 1e-6; t += len / Math.max(1, Math.round(len / 1.5))) {
          const y = y0 + dy * t / len, p = LO + dir * t;
          const post = boxMesh(0.06, 1, 0.06, steelM);
          post.position.set(axis === 'z' ? A + off : p, y + 0.5, axis === 'z' ? p : A + off); deco(post);
        }
        // 手すりの当たり判定：坂に沿った細い壁（1m ごとに区切った箱）
        for (let t = 0; t < len - 1e-6; t += 1) {
          const t1 = Math.min(len, t + 1), p0 = LO + dir * t, p1 = LO + dir * t1, yb = y0 + dy * t / len, yt = y0 + dy * t1 / len + 1;
          cur.colliders.push({ kind: 'box', walk: false, noNav: true, surf: 'wood',
            min: new V3(axis === 'z' ? A + off - 0.05 : Math.min(p0, p1), yb, axis === 'z' ? Math.min(p0, p1) : A + off - 0.05),
            max: new V3(axis === 'z' ? A + off + 0.05 : Math.max(p0, p1), yt, axis === 'z' ? Math.max(p0, p1) : A + off + 0.05) });
        }
      }
    }
  };
  // 平らな踊り場・橋の見た目：上面の板と左右の縁だけ（端の面があると、坂を上ってくる CPU がそれを壁と思って止まる）
  const deck = (x, z, w, d, y) => {
    const top = new THREE.Mesh(new THREE.PlaneGeometry(w, d), steelM); top.rotation.x = -Math.PI / 2; top.position.set(x, y, z); deco(top);
    const bot = new THREE.Mesh(new THREE.PlaneGeometry(w, d), underM); bot.rotation.x = Math.PI / 2; bot.position.set(x, y - TH, z); deco(bot);
  };
  // すき間の中の外階段：低い屋上（yLo）から、すき間に沿って高い屋上（yHi）まで上り、上に平らな踊り場（land m）
  const landing = (axis, at, from, len, y, w) => {
    const e = from + len, a0 = Math.min(from, e), a1 = Math.max(from, e), c = (a0 + a1) / 2;
    deck(axis === 'z' ? at : c, axis === 'z' ? c : at, axis === 'z' ? w : a1 - a0, axis === 'z' ? a1 - a0 : w, y);
    cur.colliders.push({ kind: 'box', walk: true, nav: true, surf: 'wood', min: new V3(axis === 'z' ? at - w / 2 : a0, y - TH, axis === 'z' ? a0 : at - w / 2), max: new V3(axis === 'z' ? at + w / 2 : a1, y, axis === 'z' ? a1 : at + w / 2) });
  };
  const gapStair = (axis, at, lo, hi, yLo, yHi, w = 2, land = 1.6) => {
    ramp(axis, at, lo, hi, yLo, yHi, w, 'stair');
    landing(axis, at, lo, -Math.sign(hi - lo) * 1.0, yLo, w);   // 下の踊り場
    landing(axis, at, hi, Math.sign(hi - lo) * land, yHi, w);
  };
  // 屋上の上に置く外階段（段々の塔など）：低い端の下は詰めた台（頭がつかえる低い所に入らないように）、上に踊り場
  const roofStair = (axis, at, lo, hi, yLo, yHi, w = 1.6, land = 1.6) => {
    const len = Math.abs(hi - lo), slope = (yHi - yLo) / len;
    ramp(axis, at, lo, hi, yLo, yHi, w, 'stair', { solidLen: Math.min(len, 2.3 / slope), base: yLo });
    landing(axis, at, hi, Math.sign(hi - lo) * land, yHi, w);
  };
  // すき間の外階段（番号はビルの番号。低い方 → 高い方）。数は絞った：高さの差が 2m の所（8 → 4、14 → 13）は、跳んで壁を登って上がる
  gapStair('z', -23, -30.5, -34.9, B0 + 5, B0 + 8);          // 1 → 2
  gapStair('x', -25, -31, -36.9, B0 + 5, B0 + 9);            // 1 → 6
  gapStair('x', -3, -31, -38.4, B0 + 4, B0 + 9);             // 10 → 6
  gapStair('z', -29, -13, -23.3, B0 + 2, B0 + 9, 2, 0.7);    // 7 → 6
  gapStair('x', -13, 16, 19, B0 + 3, B0 + 5);                // 11 → 8
  gapStair('z', 13, 8, 3.6, B0 + 3, B0 + 6);                 // 11 → 塔
  gapStair('x', 5, 31, 38.4, B0 + 6, B0 + 11);               // 12 → 9
  gapStair('x', 23, 38, 35, B0 + 4, B0 + 6);                 // 16 → 12
  gapStair('z', 15, 26, 33.4, B0 + 4, B0 + 9);               // 16 → 15
  gapStair('x', 15, 1, 5.4, B0 + 6, B0 + 9);                 // 塔 → 15
  // 5 → 8：重なった所の 1m の段に、短い段
  ramp('x', -26, 29.5, 28, B0 + 4, B0 + 5, 1.6, 'stair', { solidLen: 1.5, base: B0 + 4 });
  // 14 → 塔：板の橋（すき間 2m で 1m 上がる。手すりなし）
  ramp('z', -7, 16, 14, B0 + 5, B0 + 6, 1.4, 'plank');
  // 谷を渡る鉄骨の通路（手すりつき）：北の谷（3 → 塔）・西の谷（10 → 塔）
  ramp('z', -3, -28, -10, B0 + 3, B0 + 6, 1.4, 'steel', { rails: true });
  ramp('x', 5, -30, -12, B0 + 4, B0 + 6, 1.4, 'steel', { rails: true });
  // 段々の塔：1段目 → 2段目（西）。15 → 上の段
  //   低い端は 1m のマス目の真ん中から 0.35m 手前に置く（CPU の道で、屋上と階段の最初の段が別の床に分かれて上れなくならないように）
  roofStair('z', -8.8, 8.85, 2.95, B0 + 6, B0 + 10);
  roofStair('z', 3.2, 33.85, 29.45, B0 + 9, B0 + 12);


  // ----- 置き物（置き場所は、地形が決まってから決める） -----
  const sbox = (x0, x1, y0, y1, z0, z1, m, walk = false) => solidBox(x0, x1, y0, y1, z0, z1, m, walk, false);
  // 給水塔：脚 4本の上に丸いタンク（下は 2.4m あいていて、くぐれる）
  const waterTower = (x, z, top) => {
    EXCL.push([x - 1.5, x + 1.5, z - 1.5, z + 1.5, top]);
    for (const s of SIDES) {
      const X = x * s, Z = z * s;
      for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.4, 6), steelM); leg.position.set(X + a, top + 1.2, Z + b);
        addSolid(leg, { x: X + a, z: Z + b, r: 0.12, y0: top, y1: top + 2.4 });
      }
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 2.2, 12), tankM); tank.position.set(X, top + 3.5, Z);
      addSolid(tank, { x: X, z: Z, r: 1.4, y0: top + 2.4, y1: top + 4.6 });
      const cap = new THREE.Mesh(new THREE.ConeGeometry(1.5, 0.6, 12), tankM); cap.position.set(X, top + 4.9, Z); deco(cap);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(1.42, 1.42, 0.12, 12), steelM); band.position.set(X, top + 3.5, Z); deco(band);
    }
  };
  // 室外機の列：胸の下くらい（1.35m）の箱を、すき間なく並べる（上に乗れる）。上に回る扇風機、横に吸気口の格子、下に台
  const AC_H = 1.35;
  const acRow = (x0, x1, z0, z1, top) => {
    ACR.push([x0, x1, z0, z1, top]);
    const alongX = x1 - x0 >= z1 - z0, len = alongX ? x1 - x0 : z1 - z0, dep = alongX ? z1 - z0 : x1 - x0, n = Math.max(1, Math.round(len / 1.7));
    for (let i = 0; i < n; i++) {
      const a = (alongX ? x0 : z0) + len * i / n, b = (alongX ? x0 : z0) + len * (i + 1) / n, u = b - a;
      if (alongX) sbox(a + 0.02, b - 0.02, top + 0.12, top + AC_H, z0, z1, acM, true); else sbox(x0, x1, top + 0.12, top + AC_H, a + 0.02, b - 0.02, acM, true);
      const cx = alongX ? (a + b) / 2 : (x0 + x1) / 2, cz = alongX ? (z0 + z1) / 2 : (a + b) / 2;
      // 台（2本の足）
      for (const o of [-0.3, 0.3]) { const st = alongX ? boxMesh(0.12, 0.12, dep, fanM) : boxMesh(dep, 0.12, 0.12, fanM); st.position.set(alongX ? cx + o * u : cx, top + 0.06, alongX ? cz : cz + o * u); deco(st); }
      // 横の吸気口（両側の長い面に、暗い格子の板）
      for (const sd of [-1, 1]) { const gr = alongX ? boxMesh(u * 0.7, AC_H * 0.55, 0.03, fanM) : boxMesh(0.03, AC_H * 0.55, u * 0.7, fanM); gr.position.set(alongX ? cx : cx + sd * (dep / 2 + 0.01), top + 0.12 + AC_H * 0.45, alongX ? cz + sd * (dep / 2 + 0.01) : cz); deco(gr); }
      const fan = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.58, 0.04, 14), fanM); fan.position.set(cx, top + AC_H + 0.02, cz); deco(fan);
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.08, 14), acM); ring.position.set(cx, top + AC_H + 0.0, cz); deco(ring);
      RM.fans.push(new V3(cx, top + AC_H + 0.07, cz));   // 回る羽の場所
    }
  };
  // 小屋（塔屋・プレハブ・トタン）：壁 0.2m、高さ 2.8m ＋屋根。axis の向きの両端の壁に戸口（幅 1.2・高さ 2.2）があって中を通り抜けられる。屋根に乗れる
  //   lit：戸口の上の裸電球と、横の壁の明かりのついた窓（見た目だけ）
  const hut = (x0, x1, z0, z1, top, axis, m = hutM, lit = false) => {
    const T = 0.2, H2 = 2.8, DW = 0.6, DH = 2.2;
    EXCL.push(axis === 'x' ? [x0 - 1.4, x1 + 1.4, z0, z1, top] : [x0, x1, z0 - 1.4, z1 + 1.4, top]);   // 中と、戸口の前
    if (axis === 'x') {
      const zc = (z0 + z1) / 2;
      for (const [a0, a1] of [[x0, x0 + T], [x1 - T, x1]]) {
        sbox(a0, a1, top, top + H2, z0, zc - DW, m); sbox(a0, a1, top, top + H2, zc + DW, z1, m);
        sbox(a0, a1, top + DH, top + H2, zc - DW, zc + DW, m);
      }
      sbox(x0 + T, x1 - T, top, top + H2, z0, z0 + T, m); sbox(x0 + T, x1 - T, top, top + H2, z1 - T, z1, m);
    } else {
      const xc = (x0 + x1) / 2;
      for (const [b0, b1] of [[z0, z0 + T], [z1 - T, z1]]) {
        sbox(x0, xc - DW, top, top + H2, b0, b1, m); sbox(xc + DW, x1, top, top + H2, b0, b1, m);
        sbox(xc - DW, xc + DW, top + DH, top + H2, b0, b1, m);
      }
      sbox(x0, x0 + T, top, top + H2, z0 + T, z1 - T, m); sbox(x1 - T, x1, top, top + H2, z0 + T, z1 - T, m);
    }
    sbox(x0 - 0.1, x1 + 0.1, top + H2, top + H2 + 0.2, z0 - 0.1, z1 + 0.1, roofTopM, true);
    if (lit) {
      const xc = (x0 + x1) / 2, zc = (z0 + z1) / 2;
      // 窓：戸口のない長い壁の外に、明かりのついた窓の板
      const wm = warmM.clone(), bm = bulbM.clone();
      const win = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.8), wm);
      if (axis === 'x') { win.position.set(xc, top + 1.6, z1 + 0.01); } else { win.rotation.y = Math.PI / 2; win.position.set(x1 + 0.01, top + 1.6, zc); }
      deco(win, false);
      // 裸電球（戸口の外に、ひもでぶら下がる。揺れとちらつきは updateRoof）
      const pv = new THREE.Group();
      if (axis === 'x') pv.position.set(x0 - 0.35, top + 2.75, zc); else pv.position.set(xc, top + 2.75, z0 - 0.35);
      const cord = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.4, 0.015), new THREE.MeshBasicMaterial({ color: 0x111111 })); cord.position.y = -0.2; pv.add(cord);
      const bulb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1, 0), bm); bulb.position.y = -0.46; pv.add(bulb);
      deco(pv, false);
      RM.bulbs.push({ g: pv, m: bm, w: wm, ph: x0 * 1.3 + z0 * 0.7, k: 1 });
    }
  };

  // ----- 雑居ビルのがらくた：室外機と同じ作り（1つずつ形を置き、色ごとの材質。まとめても色が消えない・面取りと彫りが効く）。当たり判定は箱 -----
  const PM: Record<string, any> = {};
  const pm = (hex: number, side = false) => { const k = hex + (side ? 'd' : ''); if (!PM[k]) { PM[k] = mat(hex); if (side) PM[k].side = THREE.DoubleSide; PM[k].userData.surf = 'stone'; } return PM[k]; };
  const BX = (w, h, d) => new THREE.BoxGeometry(w, h, d), CY = (r, h, n = 12, r2 = r) => new THREE.CylinderGeometry(r, r2, h, n);
  // 形を置く（弾を止める）。block=false は見た目だけ（洗濯物など）
  const put = (geo, hex, x, y, z, rx = 0, ry = 0, rz = 0, block = true, parent: THREE.Object3D = null) => {
    const m = new THREE.Mesh(geo, pm(hex, !block)); m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
    if (parent) parent.add(m); else deco(m, block);
    return m;
  };
  const colBox = (x0, x1, y0, y1, z0, z1, walk = true) => cur.colliders.push({ kind: 'box', walk, surf: 'stone', min: new V3(x0, y0, z0), max: new V3(x1, y1, z1) });
  const colCyl = (x, z, r, y0, y1) => cur.colliders.push({ kind: 'cyl', x, z, r, y0, y1, walk: false, surf: 'stone' });
  // 向き ry の物の、ローカル (a, b) → 世界の (x, z)
  const rot = (x, z, ry) => (a, b) => [x + a * Math.cos(ry) + b * Math.sin(ry), z - a * Math.sin(ry) + b * Math.cos(ry)];
  // ry の向きの w × d の箱を、世界の向きにそろえた当たりの箱へ
  const colRot = (x, z, ry, w, d, y0, y1, walk = true) => { const c = Math.abs(Math.cos(ry)), s = Math.abs(Math.sin(ry)), hx = (w * c + d * s) / 2, hz = (w * s + d * c) / 2; colBox(x - hx, x + hx, y0, y1, z - hz, z + hz, walk); };

  // ビールケースの山（1つ 0.62 × 0.42 × 0.48。持ち手の穴つき）：nx × nz 個を layers 段。上の段はところどころ抜ける
  const crates = (x, z, top, nx, nz, layers) => {
    const W = 0.62, H = 0.42, D = 0.48, CL = [0xc23b30, 0xe2b52a, 0x2f73c8];
    for (let l = 0; l < layers; l++) for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
      if (l === layers - 1 && layers > 1 && (i * 7 + k * 3 + l) % 4 === 0) continue;
      const cx = x + (i - (nx - 1) / 2) * W, cz = z + (k - (nz - 1) / 2) * D, cy = top + H / 2 + l * H, ry = ((i * 5 + k * 3 + l) % 3 - 1) * 0.05, col = CL[(i + k * 2 + l) % 3];
      put(BX(W - 0.03, H - 0.02, D - 0.03), col, cx, cy, cz, 0, ry);
      for (const sd of [-1, 1]) put(BX(0.2, 0.07, 0.02), 0x1c1a20, cx + Math.sin(ry) * sd * (D / 2 - 0.005), cy + 0.1, cz + Math.cos(ry) * sd * (D / 2 - 0.005), 0, ry, 0, true);   // 持ち手の穴
    }
    colBox(x - nx * W / 2, x + nx * W / 2, top, top + layers * H, z - nz * D / 2, z + nz * D / 2);
  };
  // ドラム缶（半径 0.4・高さ 1.2。帯とふた）：n 本を一列
  const drums = (x, z, top, n, along = 'x') => {
    const CL = [0x3f7050, 0x9a4030, 0x335a8a, 0x8a7a30];
    for (let i = 0; i < n; i++) {
      const o = (i - (n - 1) / 2) * 0.84, cx = along === 'x' ? x + o : x, cz = along === 'x' ? z : z + o, c = CL[(i + Math.round(x)) % 4];
      put(CY(0.4, 1.2, 14), c, cx, top + 0.6, cz);
      for (const y of [0.4, 0.8]) put(CY(0.42, 0.05, 14), 0x2a2a2e, cx, top + y, cz);
      put(CY(0.36, 0.03, 14), 0x55555a, cx, top + 1.215, cz);
    }
    const L = n * 0.42;
    if (along === 'x') colBox(x - L, x + L, top, top + 1.2, z - 0.42, z + 0.42); else colBox(x - 0.42, x + 0.42, top, top + 1.2, z - L, z + L);
  };
  // ブルーシートをかけた荷物の山（でこぼこの山・重しのブロック）
  const tarp = (x0, x1, z0, z1, top, h) => {
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = x1 - x0, d = z1 - z0;
    put(BX(w, h * 0.62, d), 0x2f6fd0, cx, top + h * 0.31, cz);
    put(BX(w * 0.55, h * 0.4, d * 0.6), 0x3a7ae0, cx - w * 0.18, top + h * 0.8, cz + d * 0.05, 0, 0.12, 0.05);
    put(BX(w * 0.4, h * 0.3, d * 0.5), 0x2864c0, cx + w * 0.25, top + h * 0.72, cz - d * 0.12, 0, -0.2, -0.06);
    for (const [a, b] of [[-0.42, -0.4], [0.42, 0.4], [0.4, -0.38]]) put(BX(0.38, 0.19, 0.19), 0x8a8a86, cx + a * w, top + h * 0.62 + 0.1, cz + b * d, 0, a);   // 重しのブロック
    colBox(x0, x1, top, top + h * 0.62, z0, z1);
    colBox(cx - w * 0.45, cx + w * 0.45, top + h * 0.62, top + h, cz - d * 0.35, cz + d * 0.35);
  };
  // 発泡スチロールの箱の山（0.8 × 0.45 × 0.56、ふたの線）
  const styro = (x, z, top, nx, nz, layers) => {
    const W = 0.8, H = 0.45, D = 0.56;
    for (let l = 0; l < layers; l++) for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
      const cx = x + (i - (nx - 1) / 2) * W, cz = z + (k - (nz - 1) / 2) * D, cy = top + H / 2 + l * H, ry = ((i + k + l) % 2) * 0.06;
      put(BX(W - 0.03, H - 0.03, D - 0.03), 0xeceae2, cx, cy, cz, 0, ry);
      put(BX(W - 0.01, 0.05, D - 0.01), 0xd6d3c8, cx, cy + H / 2 - 0.06, cz, 0, ry);
    }
    colBox(x - nx * W / 2, x + nx * W / 2, top, top + layers * H, z - nz * D / 2, z + nz * D / 2);
  };
  // ダクト（脚の上の四角い管・継ぎ目のつば。胸の高さ）
  const duct = (x0, x1, z0, z1, top, h = 1.3) => {
    const alongX = x1 - x0 > z1 - z0, L = alongX ? x1 - x0 : z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    put(BX(x1 - x0, h - 0.3, z1 - z0), 0xa2a8b0, cx, top + 0.3 + (h - 0.3) / 2, cz);
    for (let t = 0.8; t < L - 0.3; t += 1.6) put(alongX ? BX(0.1, h - 0.2, z1 - z0 + 0.1) : BX(x1 - x0 + 0.1, h - 0.2, 0.1), 0x7c828a, alongX ? x0 + t : cx, top + 0.3 + (h - 0.3) / 2, alongX ? cz : z0 + t);
    for (let t = 0.5; t < L; t += 2) put(alongX ? BX(0.18, 0.3, z1 - z0 - 0.1) : BX(x1 - x0 - 0.1, 0.3, 0.18), 0x4c525a, alongX ? x0 + t : cx, top + 0.15, alongX ? cz : z0 + t);
    colBox(x0, x1, top, top + h, z0, z1);
  };
  // ソファ（2.2m。座面・背もたれ・ひじ掛け・クッション）
  const sofa = (x, z, top, ry) => {
    const P = rot(x, z, ry), C1 = 0x8a3f30, C2 = 0x6e3024;
    put(BX(2.2, 0.45, 1.0), C2, x, top + 0.25, z, 0, ry);
    for (const a of [-0.5, 0.5]) { const [px, pz] = P(a, 0.08); put(BX(0.95, 0.18, 0.8), C1, px, top + 0.56, pz, 0, ry); }
    { const [px, pz] = P(0, -0.38); put(BX(2.2, 0.65, 0.26), C2, px, top + 0.78, pz, 0, ry); }
    for (const a of [-1.0, 1.0]) { const [px, pz] = P(a, 0); put(BX(0.22, 0.72, 1.0), C2, px, top + 0.36, pz, 0, ry); }
    colRot(x, z, ry, 2.3, 1.05, top, top + 0.75);
  };
  // 冷蔵庫（立てる・寝かせる。ドアの線と取っ手）
  const fridge = (x, z, top, lying = false, ry = 0) => {
    const g = new THREE.Group(); g.position.set(x, top, z); g.rotation.y = ry;
    if (lying) {
      put(BX(1.9, 0.78, 0.8), 0xdcdad2, 0, 0.39, 0, 0, 0, 0, true, g);
      put(BX(0.03, 0.7, 0.72), 0x8f8d86, 0.35, 0.39, 0, 0, 0, 0, true, g);
      put(BX(0.5, 0.04, 0.05), 0x55534e, 0.6, 0.81, 0.2, 0, 0, 0, true, g);
      colRot(x, z, ry, 1.9, 0.8, top, top + 0.78);
    } else {
      put(BX(0.8, 1.9, 0.78), 0xdcdad2, 0, 0.95, 0, 0, 0, 0, true, g);
      put(BX(0.82, 0.03, 0.8), 0x8f8d86, 0, 1.3, 0, 0, 0, 0, true, g);
      put(BX(0.04, 0.45, 0.05), 0x55534e, 0.32, 1.55, 0.41, 0, 0, 0, true, g);
      put(BX(0.04, 0.6, 0.05), 0x55534e, 0.32, 0.85, 0.41, 0, 0, 0, true, g);
      colRot(x, z, ry, 0.82, 0.8, top, top + 1.9);
    }
    deco(g);
  };
  // ブラウン管テレビ（画面のくぼみ・後ろのふくらみ）を n 台積む
  const tv = (x, z, top, n = 1, ry = 0) => {
    for (let i = 0; i < n; i++) {
      const g = new THREE.Group(); g.position.set(x, top + i * 0.66, z); g.rotation.y = ry + (i % 2 ? 0.25 : -0.1);
      put(BX(0.85, 0.66, 0.62), 0x9a958a, 0, 0.33, 0, 0, 0, 0, true, g);
      put(BX(0.62, 0.46, 0.04), 0x1e2a2c, 0, 0.36, 0.3, 0, 0, 0, true, g);
      put(BX(0.55, 0.42, 0.35), 0x8a857a, 0, 0.32, -0.45, 0, 0, 0, true, g);
      deco(g);
    }
    colBox(x - 0.6, x + 0.6, top, top + 0.66 * n, z - 0.6, z + 0.6);
  };
  // 畳（立てかける。緑がかった表と、黒い縁）
  const tatami = (x, z, top, ry) => {
    const g = new THREE.Group(); g.position.set(x, top, z); g.rotation.y = ry;
    put(BX(1.0, 2.0, 0.08), 0xb4ac6a, 0, 0.96, 0, -0.22, 0, 0, true, g);
    for (const a of [-0.47, 0.47]) put(BX(0.07, 2.0, 0.09), 0x2a2a2a, a, 0.96, 0, -0.22, 0, 0, true, g);
    deco(g); colRot(x, z, ry, 1.05, 0.6, top, top + 1.9, false);
  };
  // 自転車（前後の輪は進む向きの面に立つ。フレームの管・サドル・ハンドル）
  const bike = (x, z, top, ry, color = 0x2a8a9a) => {
    const g = new THREE.Group(); g.position.set(x, top, z); g.rotation.y = ry;
    for (const a of [-0.55, 0.55]) {
      put(new THREE.TorusGeometry(0.34, 0.045, 6, 18), 0x1c1c1e, a, 0.34, 0, 0, 0, 0, true, g);
      put(new THREE.TorusGeometry(0.29, 0.015, 4, 18), 0xa0a0a4, a, 0.34, 0, 0, 0, 0, true, g);
      put(CY(0.04, 0.1, 6), 0x777777, a, 0.34, 0, Math.PI / 2, 0, 0, true, g);
    }
    // 管：点 p から q への細い箱
    const tube = (p, q, r = 0.03, c = color) => { const dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy); put(BX(L, r * 2, r * 2), c, (p[0] + q[0]) / 2, (p[1] + q[1]) / 2, 0, 0, 0, Math.atan2(dy, dx), true, g); };
    const BB = [-0.02, 0.32], RA = [-0.55, 0.34], FA = [0.55, 0.34], ST = [-0.15, 0.82], HT = [0.42, 0.84];
    tube(BB, ST); tube(BB, HT); tube(ST, HT); tube(BB, RA, 0.022); tube(ST, RA, 0.022); tube(HT, FA, 0.025); tube(HT, [0.4, 1.0], 0.025, 0x555555);
    put(BX(0.06, 0.04, 0.56), 0x333333, 0.38, 1.0, 0, 0, 0, 0, true, g);   // ハンドル
    put(BX(0.28, 0.07, 0.14), 0x1c1c1e, -0.17, 0.88, 0, 0, 0, 0, true, g);  // サドル
    put(CY(0.09, 0.03, 10), 0x666666, -0.02, 0.32, 0.05, Math.PI / 2, 0, 0, true, g);   // ペダルのギア
    deco(g); colRot(x, z, ry, 1.8, 0.6, top, top + 1.0, false);
  };
  // 原付（足の板・前の風よけ・座席・ハンドル・小さな輪）
  const scooter = (x, z, top, ry, color = 0xc8402e) => {
    const g = new THREE.Group(); g.position.set(x, top, z); g.rotation.y = ry;
    for (const a of [-0.6, 0.6]) { put(new THREE.TorusGeometry(0.24, 0.08, 6, 16), 0x1c1c1e, a, 0.26, 0, 0, 0, 0, true, g); put(CY(0.14, 0.1, 10), 0x888888, a, 0.26, 0, Math.PI / 2, 0, 0, true, g); }
    put(BX(0.75, 0.12, 0.38), 0x2a2a2e, 0, 0.3, 0, 0, 0, 0, true, g);              // 足の板
    put(BX(0.75, 0.5, 0.46), color, -0.45, 0.58, 0, 0, 0, 0.05, true, g);         // 後ろの胴
    put(BX(0.66, 0.13, 0.36), 0x1c1c1e, -0.42, 0.9, 0, 0, 0, 0, true, g);         // 座席
    put(BX(0.16, 0.85, 0.46), color, 0.42, 0.62, 0, 0, 0, -0.2, true, g);         // 前の風よけ
    put(BX(0.4, 0.12, 0.3), color, 0.6, 0.5, 0, 0, 0, 0.3, true, g);              // 前の泥よけ
    put(BX(0.08, 0.08, 0.66), 0x555555, 0.5, 1.12, 0, 0, 0, 0, true, g);          // ハンドル
    put(BX(0.12, 0.1, 0.22), 0xfff2c0, 0.55, 0.95, 0, 0, 0, 0, true, g);          // 前の灯り
    deco(g); colRot(x, z, ry, 1.9, 0.62, top, top + 1.15, false);
  };
  // 物干し：T 字の柱（当たる）と竿、洗濯物（シャツ・タオル・シーツ。見た目だけ＝弾は通り、見通しだけ切る）
  const laundry = (x0, z0, x1, z1, top) => {
    EXCL.push([Math.min(x0, x1) - 0.7, Math.max(x0, x1) + 0.7, Math.min(z0, z1) - 0.7, Math.max(z0, z1) + 0.7, top]);
    const L = Math.hypot(x1 - x0, z1 - z0), ry = -Math.atan2(z1 - z0, x1 - x0), CL = [0xf2f0ea, 0xd85a7a, 0x5a8ad8, 0xe8c040, 0x6ab070, 0xf2f0ea, 0xb070c8];
    for (const [x, z] of [[x0, z0], [x1, z1]]) { put(CY(0.06, 2.3, 8), 0x8a8a8a, x, top + 1.15, z); put(BX(0.08, 0.08, 0.8), 0x8a8a8a, x, top + 2.25, z, 0, ry); colCyl(x, z, 0.08, top, top + 2.3); }
    for (const off of [-0.32, 0.32]) put(CY(0.03, L, 6), 0xb8a878, (x0 + x1) / 2 - Math.sin(ry) * off, top + 2.25, (z0 + z1) / 2 - Math.cos(ry) * off, 0, ry, Math.PI / 2);
    for (let t = 0.7, i = 0; t < L - 0.6; t += 1.1, i++) {
      const kind = i % 3, w = kind === 2 ? 1.5 : kind === 1 ? 0.6 : 0.75, h = kind === 2 ? 1.5 : kind === 1 ? 1.0 : 0.8, off = (i % 2 ? 0.32 : -0.32);
      const x = x0 + (x1 - x0) * t / L - Math.sin(ry) * off, z = z0 + (z1 - z0) * t / L - Math.cos(ry) * off;
      put(BX(w, h, 0.03), CL[i % CL.length], x, top + 2.22 - h / 2, z, 0, ry, 0, false);
      if (kind === 0) for (const sd of [-1, 1]) put(BX(0.28, 0.32, 0.03), CL[i % CL.length], x + Math.cos(ry) * sd * 0.48, top + 2.04, z - Math.sin(ry) * sd * 0.48, 0, ry, sd * 0.5, false);   // 袖
    }
  };
  // 家庭菜園：発泡スチロールの箱と素焼きの鉢、伸び放題の草木（トマトの支柱）
  const garden = (x0, x1, z, top) => {
    for (let x = x0 + 0.45, i = 0; x < x1 - 0.4; x += 0.9, i++) {
      if (i % 4 === 3) { put(CY(0.32, 0.5, 10, 0.24), 0xb0603a, x, top + 0.25, z); put(new THREE.IcosahedronGeometry(0.42, 0), 0x4a9a3e, x, top + 0.8, z, 0, i); continue; }
      put(BX(0.86, 0.45, 0.56), 0xeceae2, x, top + 0.225, z);
      put(BX(0.8, 0.05, 0.5), 0x5a4030, x, top + 0.43, z);   // 土
      for (const [a, s, c] of [[-0.22, 0.34, 0x3f8a3a], [0.18, 0.28, 0x5aa040], [0, 0.4, 0x2f6a30]]) put(new THREE.IcosahedronGeometry(s, 0), c, x + a, top + 0.62 + s * 0.4, z + (i % 2 ? 0.08 : -0.08), 0, i + a, 0);
      if (i % 2 === 0) { put(CY(0.02, 1.5, 5), 0x8a7a50, x + 0.3, top + 1.15, z); put(new THREE.IcosahedronGeometry(0.22, 0), 0x3f8a3a, x + 0.3, top + 1.55, z); put(new THREE.IcosahedronGeometry(0.1, 0), 0xd04030, x + 0.38, top + 1.3, z + 0.1); }
    }
    colBox(x0, x1, top, top + 0.5, z - 0.3, z + 0.3);
  };
  // ビアガーデン跡：テーブルと長いす（木）、たたんだパラソル、カウンターとビールサーバー
  const table = (x, z, top) => {
    put(BX(1.8, 0.07, 0.9), 0xa8742a, x, top + 0.76, z);
    for (const [a, b] of [[-0.8, -0.36], [0.8, -0.36], [-0.8, 0.36], [0.8, 0.36]]) put(BX(0.07, 0.74, 0.07), 0x55555a, x + a, top + 0.37, z + b);
    for (const b of [-0.82, 0.82]) { put(BX(1.8, 0.07, 0.34), 0xa8742a, x, top + 0.46, z + b); put(BX(1.6, 0.43, 0.05), 0x55555a, x, top + 0.215, z + b); }
    colBox(x - 0.9, x + 0.9, top, top + 0.8, z - 0.45, z + 0.45); colBox(x - 0.9, x + 0.9, top, top + 0.5, z - 1.0, z - 0.65); colBox(x - 0.9, x + 0.9, top, top + 0.5, z + 0.65, z + 1.0);
  };
  const parasol = (x, z, top, c = 0xd04040) => { put(CY(0.05, 2.6, 6), 0x777777, x, top + 1.3, z); put(CY(0.05, 1.7, 8, 0.28), c, x, top + 1.6, z); put(CY(0.35, 0.12, 10), 0x333333, x, top + 0.06, z); colCyl(x, z, 0.3, top, top + 2.6); };
  const counter = (x0, x1, z0, z1, top) => {
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    put(BX(x1 - x0, 1.05, z1 - z0), 0x7a5a3a, cx, top + 0.525, cz);
    put(BX(x1 - x0 + 0.15, 0.06, z1 - z0 + 0.15), 0x5a3f28, cx, top + 1.08, cz);
    put(BX(0.4, 0.5, 0.35), 0xb8bcc2, cx, top + 1.36, cz - (z1 - z0) * 0.25);   // ビールサーバー
    for (let i = 0; i < 4; i++) put(CY(0.05, 0.3, 8), i % 2 ? 0x3a6a2a : 0x6a3a1a, cx + 0.1 * (i - 1.5), top + 1.26, cz + 0.5 + i * 0.25);   // 空き瓶
    colBox(x0, x1, top, top + 1.1, z0, z1);
  };
  // 提灯の列：柱から柱へたるんだ線に、赤と白の提灯（光る）
  const lanterns = (pts, top) => {
    for (const [x, z] of pts) { put(CY(0.07, 3.0, 6), 0x6a5a48, x, top + 1.5, z); colCyl(x, z, 0.09, top, top + 3.0); }
    const lineG = [], parts = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1], L = Math.hypot(bx - ax, bz - az), n = Math.max(2, Math.round(L / 1.0));
      const P = t => new V3(ax + (bx - ax) * t, top + 2.9 - Math.sin(Math.PI * t) * 0.55, az + (bz - az) * t);
      for (let k = 0; k < 16; k++) lineG.push(P(k / 16), P((k + 1) / 16));
      for (let k = 1; k < n; k++) { const p = P(k / n); parts.push([new THREE.CylinderGeometry(0.17, 0.17, 0.42, 10), k % 2 ? 0xff5a3c : 0xfff0d0, MX(p.x, p.y - 0.26, p.z)]); }
    }
    deco(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(lineG), wireM), false);
    if (parts.length) deco(new THREE.Mesh(mergeParts(parts), glowVCM), false);
  };
  const MX = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);
  // 電柱（屋上に立つ鉄の柱と腕木・がいし）と、柱から柱へたるんだ電線の束
  const pole = (x, z, top, h, ry = 0) => {
    put(CY(0.12, h, 8, 0.14), 0x4a4e56, x, top + h / 2, z);
    put(BX(1.2, 0.1, 0.1), 0x4a4e56, x, top + h - 0.3, z, 0, ry);
    for (const a of [-0.45, 0, 0.45]) put(CY(0.05, 0.14, 6), 0xe8e4d8, x + Math.cos(ry) * a, top + h - 0.18, z - Math.sin(ry) * a);
    colCyl(x, z, 0.15, top, top + h);
    return [x, top + h - 0.12, z, ry];
  };
  const wires = (A, B) => {
    const pts = [];
    for (const a of [-0.45, 0, 0.45]) {
      const p = [A[0] + Math.cos(A[3]) * a, A[1], A[2] - Math.sin(A[3]) * a], q = [B[0] + Math.cos(B[3]) * a, B[1], B[2] - Math.sin(B[3]) * a], sag = 0.5 + Math.hypot(q[0] - p[0], q[2] - p[2]) * 0.04 + (a + 0.45) * 0.3;
      const P = t => new V3(p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t - Math.sin(Math.PI * t) * sag, p[2] + (q[2] - p[2]) * t);
      for (let k = 0; k < 24; k++) pts.push(P(k / 24), P((k + 1) / 24));
    }
    deco(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), wireM), false);
  };
  // 小さな英語のネオン看板（壁の外に。横長 or 縦長）：x, z は壁の上の点、nx, nz は外向き、y は看板の真ん中の高さ
  const neonSign = (x, z, nx, nz, y, text, color, vertical, mode = '') => {
    const w = vertical ? 0.9 : 0.55 * text.length + 0.6, h = vertical ? 0.52 * text.length + 0.5 : 0.9, D = 0.2;
    const face = neonCache(text, color, vertical, mode);
    const box = nx ? boxMesh(D, h, w, signM) : boxMesh(w, h, D, signM);
    box.position.set(x + nx * D / 2, y, z + nz * D / 2); deco(box);
    const f = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.08, h - 0.08), face);
    f.rotation.y = Math.atan2(nx, nz); f.position.set(x + nx * (D + 0.01), y, z + nz * (D + 0.01)); deco(f);
  };

  // ===== 置き場所（ビルの番号は設計図のもの。階段の上り口・踊り場・通路の端・出撃地点・壁を登る所はあけてある） =====
  const tH = h => B0 + h;
  // 1 出撃（北西・5m）：プレハブ小屋・室外機・自転車・ビールケース
  hut(-39.65, -36.4, -32.5, -28.5, tH(5), 'z', prefabM, true);
  acRow(-33.4, -26.6, -39.65, -38.05, tH(5));
  bike(-29.4, -29.4, tH(5), 0.4);
  crates(-27.2, -35.8, tH(5), 2, 2, 4);
  // 2（8m）：給水塔・塔屋
  waterTower(-17, -36.5, tH(8));
  hut(-21, -17.5, -33.5, -30.35, tH(8), 'x');
  // 3（3m）：粗大ゴミの山・積み荷（北の谷へ渡る通路の端はあける）
  sofa(-9.2, -36.2, tH(3), 0.3); fridge(-5.6, -37.6, tH(3), true, 0.1); fridge(-11, -38.6, tH(3)); tv(-10.4, -32.6, tH(3), 2, 0.4); tatami(-7.4, -31.4, tH(3), 0.2);
  crates(2, -37.8, tH(3), 3, 2, 4); drums(4.75, -32.2, tH(3), 2, 'z'); tarp(-0.2, 2.8, -33.6, -30.6, tH(3), 1.5);
  // 4（7m）：物干し・室外機
  laundry(10, -36.4, 20, -36.4, tH(7)); laundry(10, -34, 17, -34, tH(7));
  acRow(12, 20.4, -39.65, -38.05, tH(7));
  // 5（4m）：積み荷の山・トタン小屋（8 への段の所はあける）
  hut(34.5, 39.65, -39.65, -35.5, tH(4), 'x', tinM, true);
  crates(30, -37.4, tH(4), 3, 2, 3); drums(32.6, -27, tH(4), 3); tarp(35, 38.6, -30.6, -27.2, tH(4), 1.7); styro(38.6, -24.2, tH(4), 2, 2, 3);
  // 6（9m）：給水塔・ダクト
  waterTower(-35, -14, tH(9));
  duct(-31.6, -30.35, -20, -8, tH(9));
  // 7（2m・いちばん低い）：粗大ゴミ・原付
  fridge(-17, -21.6, tH(2)); sofa(-20.5, -14.8, tH(2), 1.2); tv(-23.4, -20.4, tH(2), 3, -0.3); scooter(-24.2, -16.6, tH(2), 0.8); tatami(-15.4, -17, tH(2), 1.4);
  // 8（5m）：室外機びっしり・配管
  acRow(20.6, 27.4, -29.65, -28.05, tH(5)); acRow(15.6, 22.4, -26, -24.4, tH(5)); acRow(16, 24.5, -22, -20.4, tH(5));
  duct(24.6, 25.8, -19, -15, tH(5), 1.1);
  // 9（11m・東の高いビル）：塔屋・ビールケース・ドラム缶
  hut(34, 38, -12, -8.5, tH(11), 'z', hutM, true);
  crates(32.2, -1.5, tH(11), 2, 3, 3); drums(36.5, -17.8, tH(11), 3);
  // 10（4m）：物干し場・自転車（通路の端と階段の上り口はあける）
  laundry(-37, 1.4, -37, 15.4, tH(4)); laundry(-33, 8.2, -33, 15.6, tH(4));
  bike(-38.7, 10.6, tH(4), 1.5, 0xc0503a);
  // 11（3m）：家庭菜園
  garden(18, 24.8, -6, tH(3)); garden(18, 24.8, -2.2, tH(3)); garden(18, 23.4, 1.6, tH(3)); styro(25, 5.6, tH(3), 1, 3, 3); garden(20, 25.2, 9.1, tH(3));
  // 12（6m）：トタン小屋・室外機・ビールケース
  hut(34.5, 39.65, 10, 14.5, tH(6), 'x', tinM, true);
  acRow(29, 32.6, 13, 14.6, tH(6)); crates(29.4, 19.2, tH(6), 2, 2, 3);
  // 13（7m）：ビアガーデン跡（東の縁は 14 から登ってくる所なのであける）
  table(-34, 27, tH(7)); table(-28, 27, tH(7)); table(-31, 33.4, tH(7)); table(-25, 33.4, tH(7));
  parasol(-36.4, 24.4, tH(7)); parasol(-23.4, 30.4, tH(7), 0x3a8a4a); parasol(-37, 37.6, tH(7), 0xe0b030);
  counter(-39.65, -37.6, 29, 36.5, tH(7));
  crates(-38.6, 23.9, tH(7), 2, 2, 3);
  lanterns([[-38.8, 21.2], [-22.8, 21.2], [-22.8, 38.8], [-38.8, 38.8], [-38.8, 21.2]], tH(7));
  // 14（5m）：家庭菜園・物干し（板の橋の所と、13 へ登る西の縁はあける）
  garden(-15.6, -9.8, 27.2, tH(5)); garden(-15.6, -11, 24, tH(5)); styro(-5, 27.6, tH(5), 2, 2, 3);
  laundry(-15, 19.6, -9.4, 19.6, tH(5));
  // 15（9m）＋上の段（12m）：積み荷・ダクト・給水塔
  duct(0.35, 1.55, 18.6, 26, tH(9)); crates(12.2, 38.4, tH(9), 3, 2, 4); drums(2.4, 38.6, tH(9), 3); tarp(8.8, 12.2, 18.6, 21.2, tH(9), 1.4);
  waterTower(8, 30.4, tH(12));
  // 16 出撃（南東・4m）：プレハブ小屋・原付・室外機
  hut(20, 24.4, 36, 39.65, tH(4), 'x', prefabM, true);
  scooter(27.2, 38.5, tH(4), 0.1, 0xe8e0c8); acRow(25.6, 31.4, 24.35, 25.95, tH(4)); styro(38.4, 38.2, tH(4), 2, 2, 3);
  // 塔 1段目（6m）のまわり：室外機・ダクト・ビールケース・ドラム缶
  acRow(10.05, 11.65, -5.2, 0.2, tH(6)); duct(2, 7, -9.65, -8.65, tH(6), 1.1); crates(5.5, 12.4, tH(6), 3, 2, 3); drums(-10.6, 12.4, tH(6), 2);
  // 塔 2段目（10m）：塔屋・給水塔
  hut(-2, 2, 0, 3.6, tH(10), 'z', hutM, true);
  waterTower(4.5, 6.5, tH(10));
  // 電柱と電線の束（すき間の上を、屋上の柱から柱へ）
  wires(pole(-25.2, -38.8, tH(5), 4.6, Math.PI / 2), pole(-21, -38.9, tH(8), 2.8, Math.PI / 2));   // 1 ↔ 2
  wires(pole(5.2, -39, tH(3), 5.2, Math.PI / 2), pole(8.8, -39, tH(7), 2.6, Math.PI / 2));          // 3 ↔ 4
  wires(pole(-30.9, 10.4, tH(4), 5.4, 0), pole(-11.3, 10.6, tH(6), 3.8, 0));                         // 10 ↔ 塔（西の谷の上）
  wires(pole(25.2, -11.2, tH(3), 6.6, 0), pole(30.9, -11.2, tH(11), 2.0, 0));                        // 11 ↔ 9
  wires(pole(-2.8, 29.4, tH(5), 5.4, Math.PI / 2), pole(0.8, 29.4, tH(9), 2.2, Math.PI / 2));       // 14 ↔ 15
  // 小さな英語のネオン（すき間を向いた壁）
  neonSign(-14, -35, 1, 0, tH(8) - 1.8, 'BAR', '#ff4fd8', true, 'broken');
  neonSign(-30, -18, 1, 0, tH(9) - 2.2, 'HOTEL', '#3fe8ff', true);
  neonSign(30, -6, -1, 0, tH(11) - 2.4, 'KARAOKE', '#ffd23f', true, 'double');
  neonSign(0, 22, -1, 0, tH(9) - 1.3, 'NOODLE', '#ff6a3c', false);
  neonSign(0, -6, 0, -1, tH(10) - 1.3, 'OPEN', '#47ff9a', false, 'blink');
  neonSign(-20, 34, 1, 0, tH(7) - 2.0, '24H', '#a46bff', true);
  neonSign(34, 6, 0, -1, tH(6) - 1.3, 'CLUB', '#ff4fd8', false, 'double');
  neonSign(-24, -28, 1, 0, tH(5) - 1.3, 'LIVE', '#3fe8ff', false);


  // ===== ごちゃごちゃの山（決まった種の乱数で、屋上ごとにばらばらに置く。あけておく所・小屋の中・物干しの下・階段は避ける） =====
  {
    const firstCol = cur.colliders.length;
    let sd = 20261006;
    const rnd = (a = 0, b = 1) => a + ((sd = (sd * 16807) % 2147483647) / 2147483647) * (b - a);
    const pick = <T,>(a: T[]): T => a[Math.floor(rnd(0, a.length))];
    // あけておく所 [西, 東, 北, 南, 屋上の高さ]（階段の上り口・踊り場・通路の端・出撃地点・壁を登る所）
    const ZONES = [[-22,-20,-37,-34,8],[-26,-24,-32,-29,5],[-33,-30,-28,-26,5],[-39,-36,-24,-22,9],[-33,-30,-2,0,4],[-40,-37,-6,-4,9],[-28,-25.5,-14.5,-12,2],[-32,-30,-24,-22,9],[14,16,7,9,3],[10,12,1.5,4,6],[30,33,6,8,6],[37,40,2,4,11],[36,40,24,26,4],[32,36,20,22,6],[16,18,25,28,4],[12,14,33,36,9],[-0.5,2.5,12,14,6],[5,7.5,16,18,9],[15,17.5,-12,-10,3],[18.5,21,-16,-14,5],[-5,-1,-30,-28,3],[-5,-1,-10,-8,6],[-32,-30,3.5,6.5,4],[-12,-10,3.5,6.5,6],[-8,-6,16,17.5,5],[-8,-6,12.5,14,6],[-8,-6,1,3.5,10],[4,5.5,28,29.5,12],[-35.5,-32.5,-35.5,-32.5,5],[30.5,33.5,32.5,35.5,4],[14,18,-31,-29,5],[-18,-16,20,30,5],[28,30.5,-27,-25,4],[2,4.5,33.5,36.5,9],[-10.2,-7.4,8.5,11,6]];   // 最後の2つ：15→上の段、塔1段目→2段目の階段の上り口
    const topAt = (x, z) => { let h = -99; for (const b of BLD) if (x >= b[0] && x <= b[1] && z >= b[2] && z <= b[3]) h = Math.max(h, b[4]); return h; };
    // その屋上で (x0..x1, z0..z1) があいているか（m だけ余白を見る）
    const free = (x0, x1, z0, z1, h, m = 0.3) => {
      for (const [a0, a1, b0, b1] of [[x0, x0, z0, z0], [x1, x1, z0, z0], [x0, x0, z1, z1], [x1, x1, z1, z1], [(x0 + x1) / 2, 0, (z0 + z1) / 2, 0]]) if (topAt(a0, b0) !== h) return false;
      const top = B0 + h;
      for (const [a0, a1, b0, b1, zh] of ZONES) if (zh === h && x1 + 0.5 > a0 && x0 - 0.5 < a1 && z1 + 0.5 > b0 && z0 - 0.5 < b1) return false;
      for (const [a0, a1, b0, b1, eh] of EXCL) if (Math.abs(eh - top) < 0.5 && x1 > a0 && x0 < a1 && z1 > b0 && z0 < b1) return false;
      for (const c of cur.colliders) {
        const cy0 = c.kind === 'cyl' ? c.y0 : c.min.y, cy1 = c.kind === 'cyl' ? c.y1 : c.max.y;
        if (cy1 <= top + 0.25 || cy0 >= top + 2.2) continue;   // 屋上の笠木や、頭より上の物は気にしない
        const ax0 = c.kind === 'cyl' ? c.x - c.r : c.min.x, ax1 = c.kind === 'cyl' ? c.x + c.r : c.max.x, az0 = c.kind === 'cyl' ? c.z - c.r : c.min.z, az1 = c.kind === 'cyl' ? c.z + c.r : c.max.z;
        if (x1 + m > ax0 && x0 - m < ax1 && z1 + m > az0 && z0 - m < az1) return false;
      }
      return true;
    };
    // --- 新しいがらくた ---
    // 段ボールの山（大小の箱を、ずらして積む。上の箱は少し傾く）
    const cardboard = (x, z, top, ry0 = null) => {
      const CL = [0xa57c4c, 0x8f6a3e, 0xb48a58];
      const n = 3 + Math.floor(rnd(0, 4));
      for (let i = 0; i < n; i++) {
        const w = rnd(0.5, 0.85), h = rnd(0.35, 0.6), d = rnd(0.45, 0.75), ox = rnd(-0.55, 0.55), oz = rnd(-0.55, 0.55), ry = ry0 === null ? rnd(0, 3) : ry0 + rnd(-0.12, 0.12);
        put(BX(w, h, d), pick(CL), x + ox, top + h / 2, z + oz, 0, ry);
        put(BX(w * 0.98, 0.02, 0.06), 0xd8c8a0, x + ox, top + h + 0.005, z + oz, 0, ry);   // ガムテープ
        colRot(x + ox, z + oz, ry, w, d, top, top + h);
        if (rnd() < 0.55) { const w2 = rnd(0.4, 0.65), h2 = rnd(0.3, 0.5); put(BX(w2, h2, w2 * 0.9), pick(CL), x + ox + rnd(-0.1, 0.1), top + h + h2 / 2, z + oz + rnd(-0.1, 0.1), rnd(-0.08, 0.08), ry + rnd(-0.4, 0.4), rnd(-0.08, 0.08)); colRot(x + ox, z + oz, ry, w2, w2 * 0.9, top + h, top + h + h2); }
      }
    };
    // パレット（木の荷台）を積む：板の筋つき
    const pallets = (x, z, top, ry0 = null) => {
      const n = 2 + Math.floor(rnd(0, 5)), ry = ry0 === null ? rnd(0, 3) : ry0;
      for (let i = 0; i < n; i++) {
        const o = rnd(-0.08, 0.08), r2 = ry + rnd(-0.1, 0.1), y = top + 0.07 + i * 0.15;
        put(BX(1.2, 0.04, 1.0), 0xb89058, x + o, y + 0.05, z + o, 0, r2);
        for (const a of [-0.45, 0, 0.45]) { const [px, pz] = rot(x + o, z + o, r2)(a, 0); put(BX(0.1, 0.09, 1.0), 0x8a6a40, px, y - 0.015, pz, 0, r2); }
      }
      colRot(x, z, ry, 1.3, 1.1, top, top + 0.15 * n);
    };
    // タイヤの山（1〜2つの柱）
    const tires = (x, z, top) => {
      const k = rnd() < 0.5 ? 1 : 2;
      for (let s = 0; s < k; s++) {
        const cx = x + s * 0.78, n = 2 + Math.floor(rnd(0, 4));
        for (let i = 0; i < n; i++) { const o = rnd(-0.05, 0.05); put(CY(0.38, 0.26, 14), 0x1c1c1e, cx + o, top + 0.13 + i * 0.26, z + o, rnd(-0.04, 0.04)); put(CY(0.2, 0.27, 10), 0x0e0e10, cx + o, top + 0.13 + i * 0.26, z + o); }
        colBox(cx - 0.4, cx + 0.4, top, top + n * 0.26, z - 0.4, z + 0.4);
      }
    };
    // ガスボンベ（細長い円筒と頭の弁）
    const gas = (x, z, top) => {
      const n = 2 + Math.floor(rnd(0, 3)), CL = [0x8a8e94, 0xb03a30, 0x3a5a8a];
      for (let i = 0; i < n; i++) { const cx = x + (i - (n - 1) / 2) * 0.4, c = pick(CL); put(CY(0.18, 1.25, 12), c, cx, top + 0.625, z); put(CY(0.12, 0.12, 8), c, cx, top + 1.3, z); put(CY(0.05, 0.12, 6), 0x777777, cx, top + 1.42, z); }
      colBox(x - n * 0.2, x + n * 0.2, top, top + 1.4, z - 0.2, z + 0.2, false);
    };
    // 重ねたプラスチックのいす（と、ばらばらのいす）
    const chairs = (x, z, top) => {
      const c = pick([0xf0eee6, 0x3a8a4a, 0xc0402e, 0x3a6ab0]), ry = rnd(0, 3), n = 3 + Math.floor(rnd(0, 5));
      const chair = (cx, cy, cz, r2, col) => { put(BX(0.46, 0.05, 0.46), col, cx, cy + 0.45, cz, 0, r2); const [bx, bz] = rot(cx, cz, r2)(0, -0.21); put(BX(0.46, 0.42, 0.04), col, bx, cy + 0.67, bz, -0.12, r2); for (const [a, b] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) { const [px, pz] = rot(cx, cz, r2)(a, b); put(BX(0.04, 0.45, 0.04), col, px, cy + 0.225, pz, 0, r2); } };
      for (let i = 0; i < n; i++) chair(x, top + i * 0.11, z, ry, c);
      colBox(x - 0.32, x + 0.32, top, top + 0.9 + n * 0.11, z - 0.32, z + 0.32, false);
      if (rnd() < 0.6) { const [px, pz] = rot(x, z, ry)(0.9, 0.3); chair(px, top, pz, ry + rnd(-1, 1), pick([0xf0eee6, 0x3a8a4a])); colBox(px - 0.3, px + 0.3, top, top + 0.9, pz - 0.3, pz + 0.3, false); }
    };
    // 三角コーンと、しま模様のバー
    const cones = (x, z, top, ry0 = null) => {
      const n = 2 + Math.floor(rnd(0, 3)), ry = ry0 === null ? rnd(0, 3) : ry0;
      const pts = [];
      for (let i = 0; i < n; i++) { const [px, pz] = rot(x, z, ry)((i - (n - 1) / 2) * 0.9, rnd(-0.2, 0.2)); pts.push([px, pz]); put(new THREE.ConeGeometry(0.2, 0.72, 10), 0xff6a1a, px, top + 0.4, pz); put(CY(0.13, 0.08, 10), 0xf2f0ea, px, top + 0.42, pz); put(BX(0.42, 0.05, 0.42), 0x1c1c1e, px, top + 0.025, pz, 0, ry); colBox(px - 0.22, px + 0.22, top, top + 0.75, pz - 0.22, pz + 0.22, false); }
      if (n >= 2 && rnd() < 0.7) { const [a, b] = [pts[0], pts[1]], L = Math.hypot(b[0] - a[0], b[1] - a[1]), r2 = -Math.atan2(b[1] - a[1], b[0] - a[0]); for (let k = 0; k < 4; k++) { const t = (k + 0.5) / 4; put(BX(L / 4, 0.1, 0.05), k % 2 ? 0xf2f0ea : 0xd03020, a[0] + (b[0] - a[0]) * t, top + 0.66, a[1] + (b[1] - a[1]) * t, 0, r2); } }
    };
    // 自動販売機（前面が光る。背の高い物陰）
    const vend = (x, z, top) => {
      const ry = pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]) + rnd(-0.08, 0.08), body = pick([0xc0302a, 0x2a5ab0, 0xe8e6e0]);
      const g = new THREE.Group(); g.position.set(x, top, z); g.rotation.y = ry;
      put(BX(0.95, 1.85, 0.8), body, 0, 0.925, 0, 0, 0, 0, true, g);
      const face = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 1.0), vendM); face.position.set(0, 1.25, 0.405); g.add(face);
      const slot = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.18), new THREE.MeshBasicMaterial({ color: 0x101014 })); slot.position.set(0, 0.32, 0.405); g.add(slot);
      deco(g); colRot(x, z, ry, 0.95, 0.8, top, top + 1.85);
    };
    // バケツとモップ
    const buckets = (x, z, top) => {
      const n = 2 + Math.floor(rnd(0, 3));
      for (let i = 0; i < n; i++) { const px = x + rnd(-0.5, 0.5), pz = z + rnd(-0.5, 0.5); put(CY(0.2, 0.34, 10, 0.16), pick([0x3a7ae0, 0xd8d6cf, 0xe0b030]), px, top + 0.17, pz); colBox(px - 0.21, px + 0.21, top, top + 0.34, pz - 0.21, pz + 0.21, false); }
      put(CY(0.02, 1.4, 5), 0xa08a60, x + 0.3, top + 0.6, z, 0.4, 0, 0.3);
    };
    // 横倒しのドラム缶と、立てたドラム缶
    const drumsMix = (x, z, top) => {
      const ry = rnd(0, 3), [lx, lz] = rot(x, z, ry)(0, 0.6);
      put(CY(0.4, 1.2, 14), pick([0x3f7050, 0x9a4030, 0x335a8a]), lx, top + 0.4, lz, 0, ry, Math.PI / 2);
      colRot(lx, lz, ry, 1.2, 0.8, top, top + 0.8);
      const n = 1 + Math.floor(rnd(0, 2));
      for (let i = 0; i < n; i++) { const [px, pz] = rot(x, z, ry)((i - (n - 1) / 2) * 0.84, -0.4); put(CY(0.4, 1.2, 14), pick([0x3f7050, 0x9a4030, 0x8a7a30]), px, top + 0.6, pz); put(CY(0.42, 0.05, 14), 0x2a2a2e, px, top + 0.8, pz); colBox(px - 0.42, px + 0.42, top, top + 1.2, pz - 0.42, pz + 0.42); }
    };
    // 立て看板（小さなネオンの字）
    const aboard = (x, z, top) => {
      const ry = rnd(0, 6.28), g = new THREE.Group(); g.position.set(x, top, z); g.rotation.y = ry;
      for (const s of [-1, 1]) put(BX(0.62, 1.0, 0.04), 0x2a2830, 0, 0.5, s * 0.16, -s * 0.18, 0, 0, true, g);
      const word = pick(['OPEN', 'BAR', 'BEER', 'SNACK', 'CAFE']), color = wordColor(word);
      const f = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.36), neonCache(word, color, false)); f.position.set(0, 0.62, 0.2); f.rotation.x = -0.18; g.add(f);
      deco(g); colBox(x - 0.35, x + 0.35, top, top + 1.0, z - 0.35, z + 0.35, false);
    };
    const RECIPES: [number, number, (x, z, top) => void][] = [   // [重み, 半径, 作る]
      [5, 0.95, cardboard], [3, 0.75, pallets], [2, 0.8, tires], [1.5, 0.6, gas], [2, 0.8, chairs], [1.5, 1.0, cones], [1.6, 0.6, vend], [2, 0.6, buckets], [2.5, 0.95, drumsMix], [2.5, 1.0, (x, z, t) => crates(x, z, t, 1 + Math.floor(rnd(1, 3)), 1 + Math.floor(rnd(0, 2)), 2 + Math.floor(rnd(0, 3)))], [1.5, 0.8, (x, z, t) => styro(x, z, t, 1 + Math.floor(rnd(0, 2)), 1 + Math.floor(rnd(0, 2)), 1 + Math.floor(rnd(0, 3)))], [1.2, 0.5, aboard],
    ];
    const total = RECIPES.reduce((s, r) => s + r[0], 0);
    const recipe = () => { let t = rnd(0, total); for (const r of RECIPES) if ((t -= r[0]) <= 0) return r; return RECIPES[0]; };
    // ----- 「誰かがここで何かをしている跡」の固まり：屋上の縁・角に、壁と平行にそろえて置く（真ん中と通り道はあける） -----
    const bench = (x, z, top, ry) => {
      const g = new THREE.Group(); g.position.set(x, top, z); g.rotation.y = ry;
      put(BX(1.6, 0.06, 0.42), 0x8a6a40, 0, 0.45, 0, 0, 0, 0, true, g);
      put(BX(1.6, 0.3, 0.05), 0x8a6a40, 0, 0.7, -0.2, -0.15, 0, 0, true, g);
      for (const a of [-0.7, 0.7]) put(BX(0.06, 0.45, 0.4), 0x4a4e56, a, 0.225, 0, 0, 0, 0, true, g);
      deco(g); colRot(x, z, ry, 1.65, 0.5, top, top + 0.5);
    };
    const ashtray = (x, z, top) => { put(CY(0.04, 0.85, 6), 0x777777, x, top + 0.425, z); put(CY(0.18, 0.12, 12, 0.14), 0x8a8e94, x, top + 0.9, z); put(CY(0.16, 0.02, 12), 0xb8a888, x, top + 0.955, z); put(CY(0.16, 0.03, 10), 0x555555, x, top + 0.015, z); colCyl(x, z, 0.18, top, top + 0.96); };
    // 空き缶（見た目だけ。立っている物・倒れている物）
    const cans = (x, z, top, n, spread = 0.6) => {
      for (let i = 0; i < n; i++) {
        const px = x + rnd(-spread, spread), pz = z + rnd(-spread, spread), lying = rnd() < 0.6, c = pick([0xc03a30, 0xb8bcc2, 0x3a6ab0, 0xe0b030, 0x3a8a4a]);
        put(CY(0.034, 0.12, 8), c, px, top + (lying ? 0.034 : 0.06), pz, lying ? Math.PI / 2 : 0, rnd(0, 6.28), 0, false);
      }
    };
    const polyBin = (x, z, top, c = 0x2f6fd0) => { put(CY(0.3, 0.8, 12, 0.26), c, x, top + 0.4, z); put(CY(0.33, 0.06, 12), c, x, top + 0.83, z); put(BX(0.2, 0.04, 0.05), 0x1c1c1e, x, top + 0.88, z); colBox(x - 0.33, x + 0.33, top, top + 0.86, z - 0.33, z + 0.33); };
    // ビール瓶のケース（瓶の頭がのぞく）を layers 段
    const bottleCrates = (x, z, top, layers, ry) => {
      const g = new THREE.Group(); g.position.set(x, top, z); g.rotation.y = ry;
      for (let l = 0; l < layers; l++) {
        const c = l % 2 ? 0x2a7a4a : 0xd8b030, o = rnd(-0.04, 0.04);
        put(BX(0.52, 0.3, 0.36), c, o, 0.15 + l * 0.3, 0, 0, 0, 0, true, g);
        if (l === layers - 1) for (let i = 0; i < 6; i++) put(CY(0.03, 0.12, 6), 0x5a3a1a, o - 0.17 + (i % 3) * 0.17, 0.34 + l * 0.3, (i < 3 ? -0.08 : 0.08), 0, 0, 0, true, g);
      }
      deco(g); colRot(x, z, ry, 0.56, 0.4, top, top + layers * 0.3 + 0.1);
    };
    // つぶした段ボールの束（ひもで縛ってある）
    const flatCardboard = (x, z, top, ry) => {
      const g = new THREE.Group(); g.position.set(x, top, z); g.rotation.y = ry;
      for (let i = 0; i < 6; i++) put(BX(1.0 + rnd(-0.05, 0.05), 0.06, 0.7 + rnd(-0.05, 0.05)), pick([0xa57c4c, 0x8f6a3e, 0xb48a58]), rnd(-0.03, 0.03), 0.03 + i * 0.06, rnd(-0.03, 0.03), 0, rnd(-0.06, 0.06), 0, true, g);
      for (const a of [-0.3, 0.3]) put(BX(0.03, 0.4, 0.74), 0xe8e0c8, a, 0.19, 0, 0, 0, 0, true, g);
      deco(g); colRot(x, z, ry, 1.05, 0.75, top, top + 0.38);
    };
    // 鉄の棚（段ボールや缶を載せた物置の棚）
    const shelf = (x, z, top, ry) => {
      const g = new THREE.Group(); g.position.set(x, top, z); g.rotation.y = ry;
      for (const [a, b] of [[-0.78, -0.23], [0.78, -0.23], [-0.78, 0.23], [0.78, 0.23]]) put(BX(0.05, 1.8, 0.05), 0x6a7078, a, 0.9, b, 0, 0, 0, true, g);
      for (const y of [0.15, 0.75, 1.35]) {
        put(BX(1.6, 0.04, 0.5), 0x7a8088, 0, y, 0, 0, 0, 0, true, g);
        for (let u = -0.6; u < 0.7; u += rnd(0.35, 0.6)) { if (rnd() < 0.25) continue; const w = rnd(0.25, 0.45), hh = rnd(0.2, 0.42); put(BX(w, hh, 0.36), pick([0xa57c4c, 0x8f6a3e, 0xeceae2, 0x3a6ab0]), u, y + 0.02 + hh / 2, 0, 0, rnd(-0.1, 0.1), 0, true, g); }
      }
      deco(g); colRot(x, z, ry, 1.65, 0.55, top, top + 1.8, false);
    };
    // 脚立（開いた A 字）
    const ladder = (x, z, top, ry) => {
      const g = new THREE.Group(); g.position.set(x, top, z); g.rotation.y = ry;
      for (const s of [-1, 1]) {
        for (const a of [-0.22, 0.22]) put(BX(0.05, 1.6, 0.05), 0xb8bcc2, a, 0.78, s * 0.2, s * 0.22, 0, 0, true, g);
        for (let k = 1; k < 5; k++) put(BX(0.44, 0.03, 0.06), 0xb8bcc2, 0, k * 0.3, s * (0.36 - k * 0.067), 0, 0, 0, true, g);
      }
      put(BX(0.5, 0.05, 0.16), 0xd8b030, 0, 1.55, 0, 0, 0, 0, true, g);
      deco(g); colRot(x, z, ry, 0.55, 0.8, top, top + 1.58, false);
    };
    // セメント袋の山
    const cementBags = (x, z, top, ry, n = 6) => {
      const g = new THREE.Group(); g.position.set(x, top, z); g.rotation.y = ry;
      let k = 0;
      for (let l = 0; l < 3 && k < n; l++) for (let i = 0; i < 3 - l && k < n; i++, k++) put(BX(0.62, 0.15, 0.42), pick([0xb8b0a0, 0xa8a090, 0xc8c0a8]), (i - (2 - l) / 2) * 0.64 + rnd(-0.05, 0.05), 0.075 + l * 0.15, rnd(-0.05, 0.05), 0, rnd(-0.12, 0.12), 0, true, g);
      deco(g); colRot(x, z, ry, 2.0, 0.5, top, top + 0.45);
    };
    // 鉄筋の束（縁に沿って寝かせてある）
    const rebar = (x, z, top, ry) => {
      const g = new THREE.Group(); g.position.set(x, top, z); g.rotation.y = ry;
      for (let i = 0; i < 9; i++) put(CY(0.018, 3.0, 5), 0x7a4a30, (i % 3 - 1) * 0.045 + rnd(-0.1, 0.1), 0.03 + Math.floor(i / 3) * 0.04, (i % 3 - 1) * 0.04, 0, 0, Math.PI / 2, true, g);
      for (const a of [-0.8, 0.8]) put(BX(0.12, 0.08, 0.3), 0x8a6a40, a, 0.04, 0, 0, 0, 0, true, g);
      deco(g); colRot(x, z, ry, 3.0, 0.3, top, top + 0.15);
    };
    // 床のしみ・水たまり（やわらかい縁の、薄い板。当たり判定なし）
    const blotTex = canvasTex(64, 64, (g, w) => { const rg = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.6, 'rgba(255,255,255,0.7)'); rg.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = rg; g.fillRect(0, 0, w, w); });
    const stainM = new THREE.MeshBasicMaterial({ map: blotTex, color: 0x0a080c, transparent: true, opacity: 0.38, depthWrite: false });
    const puddleM = new THREE.MeshBasicMaterial({ map: blotTex, color: 0x34405a, transparent: true, opacity: 0.55, depthWrite: false });
    const blot = (x, z, top, w, d, m = stainM, ry = 0) => { const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d), m); p.rotation.set(-Math.PI / 2, 0, ry); p.position.set(x, top + 0.012 + rnd(0, 0.004), z); deco(p, false); };

    // 固まりの中身：[u（縁に沿った位置）, v（縁からの距離）, 縁に沿った幅, 奥行き, 作る（x, z, 屋上, 内向き ry）]
    const SCENES: Record<string, [number, number, number, number, (x, z, t, ry) => void][]> = {
      smoke: [   // 喫煙所：ベンチ・灰皿・いす代わりのビールケース・空き缶・しみ
        [0, 0.5, 1.7, 0.6, (x, z, t, ry) => bench(x, z, t, ry)],
        [1.3, 1.0, 0.4, 0.4, (x, z, t) => { ashtray(x, z, t); blot(x, z, t, 1.6, 1.4); }],
        [-1.35, 0.55, 0.65, 0.5, (x, z, t) => crates(x, z, t, 1, 1, 2)],
        [0.4, 1.3, 1.6, 0.9, (x, z, t) => cans(x, z, t, 6)],
        [2.0, 0.45, 0.5, 0.5, (x, z, t) => buckets(x, z, t)],
      ],
      shopback: [   // 店の裏：空きビールケース・瓶のケース・ポリバケツ・つぶした段ボール
        [-1.5, 0.55, 1.3, 1.0, (x, z, t) => crates(x, z, t, 2, 2, 3)],
        [-0.2, 0.45, 0.6, 0.45, (x, z, t, ry) => bottleCrates(x, z, t, 4, ry)],
        [0.75, 0.5, 0.7, 0.7, (x, z, t) => polyBin(x, z, t)],
        [1.5, 0.5, 0.7, 0.7, (x, z, t) => polyBin(x, z, t, 0x3a8a4a)],
        [2.7, 0.5, 1.1, 0.8, (x, z, t, ry) => { flatCardboard(x, z, t, ry); blot(x, z, t, 2.0, 1.4); }],
        [0.4, 1.3, 2.0, 0.8, (x, z, t) => cans(x, z, t, 4, 0.8)],
      ],
      storage: [   // 物置の隅：鉄の棚・脚立・段ボール・発泡スチロール
        [0, 0.35, 1.7, 0.6, (x, z, t, ry) => shelf(x, z, t, ry)],
        [1.45, 0.55, 0.6, 0.85, (x, z, t, ry) => ladder(x, z, t, ry + Math.PI / 2)],
        [-1.6, 0.65, 1.3, 1.3, (x, z, t, ry) => cardboard(x, z, t, ry)],
        [2.45, 0.35, 0.85, 0.6, (x, z, t) => styro(x, z, t, 1, 1, 3)],
      ],
      construction: [   // 工事の残り：パレット・セメント袋・鉄筋・三角コーン・ブルーシート
        [0, 0.7, 1.3, 1.2, (x, z, t, ry) => pallets(x, z, t, ry)],
        [1.75, 0.4, 2.0, 0.55, (x, z, t, ry) => cementBags(x, z, t, ry)],
        [-2.4, 0.25, 3.0, 0.35, (x, z, t, ry) => rebar(x, z, t, ry + Math.PI / 2 * 0)],
        [2.9, 1.3, 1.4, 0.6, (x, z, t, ry) => cones(x, z, t, ry)],
        [-0.6, 2.0, 1.6, 1.4, (x, z, t) => blot(x, z, t, 2.2, 1.6)],
      ],
    };
    // 縁：N（北の縁・内向き +z）, S, W, E。t は縁に沿った割合（0〜1）
    const scene = (bi, edge, t, kind) => {
      const [x0, x1, z0, z1, h] = BLD[bi], top = B0 + h, ins = 0.4;
      const n = edge === 'N' ? [0, 1] : edge === 'S' ? [0, -1] : edge === 'W' ? [1, 0] : [-1, 0];
      const u = [n[1], -n[0]];   // 縁に沿った向き（内向きを右に 90°）
      const ax = edge === 'W' ? x0 + ins : edge === 'E' ? x1 - ins : x0 + (x1 - x0) * t, az = edge === 'N' ? z0 + ins : edge === 'S' ? z1 - ins : z0 + (z1 - z0) * t;
      const ry = Math.atan2(n[0], n[1]);
      for (const [uu, vv, w, d, make] of SCENES[kind]) {
        const x = ax + u[0] * uu + n[0] * vv, z = az + u[1] * uu + n[1] * vv;
        const hx = Math.abs(u[0]) * w / 2 + Math.abs(n[0]) * d / 2, hz = Math.abs(u[1]) * w / 2 + Math.abs(n[1]) * d / 2;
        if (!free(x - hx, x + hx, z - hz, z + hz, h, 0.05)) continue;   // 階段・小屋・ほかの物とぶつかる物は省く
        make(x, z, top, ry + rnd(-0.05, 0.05));
      }
    };
    // どの屋上の、どの縁に、何の跡があるか（番号は BLD の順：0 が北西の出撃）
    for (const [bi, edge, t, kind] of [
      [0, 'N', 0.13, 'storage'], [0, 'S', 0.72, 'smoke'], [1, 'N', 0.25, 'shopback'], [2, 'S', 0.82, 'construction'], [3, 'E', 0.5, 'shopback'],
      [4, 'E', 0.45, 'shopback'], [4, 'N', 0.25, 'storage'], [5, 'W', 0.5, 'construction'], [6, 'S', 0.5, 'construction'], [7, 'S', 0.72, 'smoke'],
      [8, 'E', 0.75, 'smoke'], [9, 'W', 0.86, 'storage'], [10, 'E', 0.3, 'storage'], [11, 'W', 0.62, 'shopback'], [12, 'W', 0.12, 'shopback'],
      [13, 'S', 0.6, 'smoke'], [14, 'E', 0.4, 'construction'], [15, 'S', 0.36, 'storage'], [15, 'E', 0.62, 'shopback'], [16, 'N', 0.82, 'construction'],
      [16, 'S', 0.86, 'smoke'], [17, 'W', 0.8, 'smoke'], [12, 'N', 0.55, 'storage'], [5, 'E', 0.15, 'shopback'], [8, 'W', 0.15, 'construction'],
    ] as [number, string, number, string][]) scene(bi, edge, t, kind);

    // ----- 縁ぞいの、こまごました物：残った縁を 1.6m ごとに歩き、半分くらいの所に壁と平行に置く（真ん中はあけたまま） -----
    const EDGE_ITEMS: [number, number, (x, z, t, ry) => void][] = [   // [縁に沿った幅, 奥行き, 作る]
      [1.3, 1.0, (x, z, t) => crates(x, z, t, 2, 2, 1 + Math.floor(rnd(1, 4)))],
      [0.7, 0.55, (x, z, t) => crates(x, z, t, 1, 1, 2 + Math.floor(rnd(0, 3)))],
      [0.9, 0.6, (x, z, t) => styro(x, z, t, 1, 1, 1 + Math.floor(rnd(0, 3)))],
      [1.3, 1.2, (x, z, t, ry) => cardboard(x, z, t, ry)],
      [1.3, 1.1, (x, z, t, ry) => pallets(x, z, t, ry)],
      [0.9, 0.9, (x, z, t) => drums(x, z, t, 1)],
      [1.7, 0.9, (x, z, t, ry) => drums(x, z, t, 2, Math.abs(Math.sin(ry)) > 0.5 ? 'z' : 'x')],
      [0.7, 0.7, (x, z, t) => polyBin(x, z, t, pick([0x2f6fd0, 0x3a8a4a, 0x8a8e94]))],
      [1.1, 0.8, (x, z, t, ry) => flatCardboard(x, z, t, ry)],
      [0.8, 0.8, (x, z, t) => tires(x, z, t)],
      [0.6, 0.45, (x, z, t, ry) => bottleCrates(x, z, t, 2 + Math.floor(rnd(0, 3)), ry)],
      [1.0, 0.5, (x, z, t, ry) => cementBags(x, z, t, ry, 3)],
    ];
    for (let bi = 0; bi < BLD.length; bi++) {
      const [x0, x1, z0, z1, h] = BLD[bi], top = B0 + h;
      for (const edge of ['N', 'S', 'W', 'E']) {
        const n = edge === 'N' ? [0, 1] : edge === 'S' ? [0, -1] : edge === 'W' ? [1, 0] : [-1, 0], u = [n[1], -n[0]], ry = Math.atan2(n[0], n[1]);
        const len = edge === 'N' || edge === 'S' ? x1 - x0 : z1 - z0;
        for (let s2 = 0.9; s2 < len - 0.9; s2 += rnd(1.2, 2.2)) {
          if (rnd() < 0.42) continue;
          const [w, d, make] = EDGE_ITEMS[Math.floor(rnd(0, EDGE_ITEMS.length))], vv = 0.4 + d / 2 + rnd(0, 0.15);
          const ex = edge === 'W' ? x0 : edge === 'E' ? x1 : x0 + s2, ez = edge === 'N' ? z0 : edge === 'S' ? z1 : z0 + s2;
          const x = ex + n[0] * vv, z = ez + n[1] * vv;
          const hx = Math.abs(u[0]) * w / 2 + Math.abs(n[0]) * d / 2, hz = Math.abs(u[1]) * w / 2 + Math.abs(n[1]) * d / 2;
          if (!free(x - hx, x + hx, z - hz, z + hz, h, 0.05)) continue;
          make(x, z, top, ry + rnd(-0.05, 0.05));
        }
      }
    }

    // ----- 床の生活の跡：室外機の下のしみと、床をはって縁へ落ちる配管。ところどころの水たまり -----
    for (const [ax0, ax1, az0, az1, top] of ACR) {
      blot((ax0 + ax1) / 2, (az0 + az1) / 2, top, ax1 - ax0 + 0.9, az1 - az0 + 0.9);
      // いちばん近い縁へ（その屋上の四角の中で）
      const b = BLD.find(q => (ax0 + ax1) / 2 >= q[0] && (ax0 + ax1) / 2 <= q[1] && (az0 + az1) / 2 >= q[2] && (az0 + az1) / 2 <= q[3] && Math.abs(B0 + q[4] - top) < 0.05);
      if (!b) continue;
      const cx = (ax0 + ax1) / 2, cz = (az0 + az1) / 2;
      const opts = [[cx - b[0], -1, 0, ax0], [b[1] - cx, 1, 0, ax1], [cz - b[2], 0, -1, az0], [b[3] - cz, 0, 1, az1]].sort((p, q) => p[0] - q[0]);
      const [dist, dx, dz, startEdge] = opts[0];
      const sx = dx ? startEdge : cx + 0.3, sz = dz ? startEdge : cz + 0.3, ex = dx ? (dx < 0 ? b[0] + 0.05 : b[1] - 0.05) : sx, ez = dz ? (dz < 0 ? b[2] + 0.05 : b[3] - 0.05) : sz;
      const L = Math.hypot(ex - sx, ez - sz);
      if (L < 0.3 || L > 7) continue;
      for (const [off, r] of [[0, 0.07], [0.22, 0.045]]) {
        const px = (sx + ex) / 2 + (dz ? off : 0), pz = (sz + ez) / 2 + (dx ? off : 0);
        put(CY(r, L, 8), 0x8a8e94, px, top + 0.09 + r, pz, dz ? Math.PI / 2 : 0, 0, dx ? Math.PI / 2 : 0, false);
        // 縁から下へ落ちる管
        put(CY(r, 1.2, 8), 0x8a8e94, ex + dx * 0.08 + (dz ? off : 0), top - 0.45, ez + dz * 0.08 + (dx ? off : 0), 0, 0, 0, false);
      }
    }
    for (const [x0, x1, z0, z1, h] of BLD) {
      const n = Math.round((x1 - x0) * (z1 - z0) / 140) + 1;
      for (let i = 0; i < n; i++) {
        const x = rnd(x0 + 1, x1 - 1), z = rnd(z0 + 1, z1 - 1);
        if (topAt(x, z) !== h) continue;
        blot(x, z, B0 + h, rnd(1.2, 2.6), rnd(0.8, 1.8), puddleM, rnd(0, 3));
      }
    }

    // 重ねる：低い置き物（室外機・木箱・発泡スチロール・ドラム缶）の上に、小物を載せる
    const tops = cur.colliders.filter(c => c.kind === 'box' && c.walk && !c.nav && c.min.y >= B0 && c.max.y - c.min.y >= 0.5 && c.max.y - c.min.y <= 1.5 && c.max.x - c.min.x >= 0.7 && c.max.z - c.min.z >= 0.7 && Math.abs(topAt((c.min.x + c.max.x) / 2, (c.min.z + c.max.z) / 2) + B0 - c.min.y) < 0.05);   // 屋上にじかに置いた物だけ（室外機は台の上なので外す）
    for (const c of tops) {
      if (rnd() > 0.45) continue;
      const x = rnd(c.min.x + 0.3, c.max.x - 0.3), z = rnd(c.min.z + 0.3, c.max.z - 0.3), y = c.max.y, k = rnd();
      if (k < 0.45) { const w = rnd(0.45, 0.7), hh = rnd(0.3, 0.5), ry = rnd(-0.08, 0.08); put(BX(w, hh, w * 0.85), 0xa57c4c, x, y + hh / 2, z, 0, ry); colRot(x, z, ry, w, w * 0.85, y, y + hh); }
      else if (k < 0.65) { put(CY(0.38, 0.26, 14), 0x1c1c1e, x, y + 0.13, z); colBox(x - 0.38, x + 0.38, y, y + 0.26, z - 0.38, z + 0.38); }
      else if (k < 0.8) { put(CY(0.2, 0.34, 10, 0.16), 0x3a7ae0, x, y + 0.17, z); }
      else { put(new THREE.ConeGeometry(0.2, 0.72, 10), 0xff6a1a, x, y + 0.38, z, rnd(-0.3, 0.3), 0, rnd(-0.3, 0.3)); }
    }

    // ===== ネオンを増やす =====
    // 壁のネオン：どのビルの壁にも、長さに合わせていくつか（縦・横、高さもばらばら）。階段・ほかのネオンと重ならない所だけ
    const WORDS = ['BAR', 'HOTEL', 'KARAOKE', 'NOODLE', 'OPEN', '24H', 'CLUB', 'LIVE', 'SNACK', 'DINER', 'MAHJONG', 'GAME', 'BEER', 'SAKE', 'RAMEN', 'CAFE', 'LOUNGE', 'ARCADE', 'DISCO', 'SUSHI', 'PARKING', 'BILLIARDS', 'JAZZ', 'GYOZA', 'TATTOO', 'PAWN', 'RENT', 'ROOMS'];
    const placedSigns: number[][] = [];
    const ramps = cur.colliders.filter(c => c.kind === 'ramp' || c.nav);
    const tryWallSign = (x, z, nx, nz, y, word, color, vertical, mode) => {
      const w = vertical ? 0.9 : 0.55 * word.length + 0.6, hh = vertical ? 0.52 * word.length + 0.5 : 0.9;
      const along = nx ? 'z' : 'x', a0 = (along === 'z' ? z : x) - w / 2 - 0.2, a1 = a0 + w + 0.4, p0 = Math.min(along === 'z' ? x : z, (along === 'z' ? x : z) + (nx || nz) * 0.6), p1 = Math.max(along === 'z' ? x : z, (along === 'z' ? x : z) + (nx || nz) * 0.6);
      const rx0 = along === 'z' ? p0 : a0, rx1 = along === 'z' ? p1 : a1, rz0 = along === 'z' ? a0 : p0, rz1 = along === 'z' ? a1 : p1;
      const y0 = y - hh / 2 - 0.2, y1 = y + hh / 2 + 0.2;
      // 外の床（すき間の向こうのビルの屋上など）より上で、頭に当たらない高さか
      const outTop = topAt(x + nx * 1.0, z + nz * 1.0);
      if (outTop > -99 && y0 < B0 + outTop + 2.1) return false;
      for (const c of ramps) { if (c.max.y < y0 || c.min.y > y1) continue; if (rx1 > c.min.x && rx0 < c.max.x && rz1 > c.min.z && rz0 < c.max.z) return false; }
      for (const [s0, s1, t0, t1, u0, u1] of placedSigns) if (rx1 > s0 && rx0 < s1 && rz1 > t0 && rz0 < t1 && y1 > u0 && y0 < u1) return false;
      placedSigns.push([rx0, rx1, rz0, rz1, y0, y1]);
      neonSign(x, z, nx, nz, y, word, color, vertical, mode);
      return true;
    };
    for (const [x0, x1, z0, z1, h] of BLD) {
      const sidesW: [number, number, number, number, number, number][] = [[x0, z0, x1, z0, 0, -1], [x0, z1, x1, z1, 0, 1], [x0, z0, x0, z1, -1, 0], [x1, z0, x1, z1, 1, 0]];
      for (const [ax, az, bx, bz, nx, nz] of sidesW) {
        const L = Math.hypot(bx - ax, bz - az); let n = Math.round(L / 4.5) + (rnd() < 0.5 ? 1 : 0);
        for (let i = 0; i < n * 3 && i < 40; i++) {
          const t = rnd(0.08, 0.92), x = ax + (bx - ax) * t, z = az + (bz - az) * t;
          // 壁の外がほかの高いビル（くっついている所）なら置かない
          if (topAt(x + nx * 0.3, z + nz * 0.3) >= h) continue;
          const vertical = rnd() < 0.55, word = pick(WORDS), y = B0 + h - rnd(0.8, 6.5);
          const mode = rnd() < 0.3 ? pick(['broken', 'blink', 'double', 'pulse']) : '';
          if (tryWallSign(x, z, nx, nz, y, word, wordColor(word), vertical, mode) && --n <= 0) break;
        }
      }
    }
    // 屋上に立つネオンの看板（鉄の脚と枠。板は弾を止める）：x, z, 向き ry（字の向く方）, 屋上の高さ, 字, 色
    const roofBoard = (x, z, ry, h, word, color) => {
      const top = B0 + h, W = 0.75 * word.length + 1.2, H = 1.6, legH = 1.9;
      const g = new THREE.Group(); g.position.set(x, top, z); g.rotation.y = ry;
      for (const a of [-W / 2 + 0.3, W / 2 - 0.3]) { put(BX(0.12, legH + H, 0.12), 0x4a4e56, a, (legH + H) / 2, -0.15, 0, 0, 0, true, g); put(BX(0.08, 0.08, 0.8), 0x4a4e56, a, legH * 0.5, -0.45, 0.6, 0, 0, true, g); }
      put(BX(W, H, 0.2), 0x1a181e, 0, legH + H / 2, 0, 0, 0, 0, true, g);
      const f = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.12, H - 0.12), neonCache(word, color, false)); f.position.set(0, legH + H / 2, 0.11); g.add(f);
      const b = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.12, H - 0.12), neonCache(word, color, false)); b.position.set(0, legH + H / 2, -0.11); b.rotation.y = Math.PI; g.add(b);
      deco(g);
      for (const a of [-W / 2 + 0.3, W / 2 - 0.3]) { const [px, pz] = rot(x, z, ry)(a, -0.15); colCyl(px, pz, 0.1, top, top + legH + H); }
      colRot(x, z, ry, W, 0.24, top + legH, top + legH + H, false);
    };
    roofBoard(-35, -18.5, Math.PI / 2, 9, 'HOTEL', '#3fe8ff');
    roofBoard(39.1, -15, -Math.PI / 2, 11, 'KARAOKE', '#ffd23f');
    roofBoard(-31, 39.2, Math.PI, 7, 'BEER', '#ff6a3c');
    roofBoard(31, -39.2, 0, 4, 'ARCADE', '#ff4fd8');
    roofBoard(28, 39.2, Math.PI, 4, 'SUSHI', '#47ff9a');
    roofBoard(11, -32.6, Math.PI, 7, 'DISCO', '#a46bff');
    roofBoard(-39.2, -36, Math.PI / 2, 5, 'LIVE', '#ff4fd8');
    roofBoard(8.6, 39.2, Math.PI, 9, 'MAHJONG', '#3fe8ff');
    roofBoard(-39.2, 10, Math.PI / 2, 4, 'CAFE', '#ffd23f');
    roofBoard(39.2, 19, -Math.PI / 2, 6, 'CLUB', '#ff4fd8');
    for (let i = firstCol; i < cur.colliders.length; i++) cur.colliders[i].noPhys = true;   // がらくたは物理の計算に入れない（軽くする）
  }

  // ----- 下の通り（はるか下。落ちる前に負けになる）：暗いアスファルトに白線 -----
  {
    const tex = canvasTex(512, 512, g => {
      g.fillStyle = '#16141a'; g.fillRect(0, 0, 512, 512);
      g.fillStyle = 'rgba(255,255,255,0.18)';
      for (let i = 0; i < 512; i += 64) { g.fillRect(i + 30, 254, 20, 4); g.fillRect(254, i + 30, 4, 20); }
    });
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(20, 20);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(800, 800), toon({ map: tex }));
    m.rotation.x = -Math.PI / 2; m.position.y = G0 + 0.02;
    deco(m, false);
  }

  // ----- まわりの夜景のビル群（当たり判定なし。弾の判定には入れて、1つのメッシュにまとめる。遊ぶ所から 8m 以上離す。点対称に置く） -----
  {
    let sd = 7;
    const rnd = (a, b) => a + ((sd = (sd * 16807) % 2147483647) / 2147483647) * (b - a);
    const farRoofM = mat(0x24212b);
    const FAR_WORDS = ['HOTEL', 'BAR', 'KARAOKE', 'CLUB', 'GAME', 'SAKE', 'RAMEN', 'LIVE', 'SUSHI', '24H', 'CAFE', 'DISCO', 'BEER'];
    const farNeon = ['#ff4fd8', '#3fe8ff', '#ffd23f', '#a46bff', '#47ff9a', '#ff6a3c'].map(c => new THREE.MeshBasicMaterial({ color: c }));
    farNeon.forEach((m, i) => { if (i % 2) RM.flick.push({ m, base: m.color.clone(), mode: 'pulse', ph: i }); });
    const fms = [windowTex(71, '#2c2834', 0.3), windowTex(83, '#262c38', 0.4), windowTex(97, '#33292e', 0.35)];
    for (let gx = -200; gx <= 200; gx += 26) for (let gz = -200; gz <= 0; gz += 26) {
      if (gz === 0 && gx > 0) continue;   // 真ん中の行は半分だけ（もう半分は点対称）
      const w = rnd(10, 20), d = rnd(10, 20), x = gx + rnd(-3, 3), z = gz + rnd(-3, 3);
      if (Math.max(Math.abs(x) - w / 2, Math.abs(z) - d / 2) < 48) continue;
      const near = Math.max(Math.abs(x), Math.abs(z)) < 90;
      const h = near ? rnd(25, 75) : rnd(30, 110), fm = fms[Math.floor(rnd(0, 3))];
      for (const s of [1, -1]) {
        const wm = new THREE.Mesh(wallsOnly(w, h, d, 12), fm); wm.position.set(s * x, G0 + h / 2, s * z); deco(wm);
        const rf = new THREE.Mesh(new THREE.PlaneGeometry(w, d), farRoofM); rf.rotation.x = -Math.PI / 2; rf.position.set(s * x, G0 + h, s * z); deco(rf);
      }
      // 字のあるネオン（遊ぶ所を向いた面に。遠くでも読める大きさ）
      if (rnd(0, 1) < 0.55) {
        const fx = Math.abs(x) >= Math.abs(z), nx = fx ? -Math.sign(x) : 0, nz = fx ? 0 : -Math.sign(z), word = FAR_WORDS[Math.floor(rnd(0, FAR_WORDS.length))], col = wordColor(word);
        const vert = rnd(0, 1) < 0.6, sw = vert ? 2.2 : 1.3 * word.length + 1.2, sh = vert ? 1.25 * word.length + 1.0 : 2.2, sy = G0 + rnd(Math.min(h - 4, 30), h - sh / 2 - 1), off = rnd(-0.25, 0.25) * (fx ? d : w), m = neonCache(word, col, vert);
        for (const s of [1, -1]) {
          const f = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), m);
          f.position.set(s * (x + nx * ((fx ? w : 0) / 2 + 0.3) + (fx ? 0 : off)), sy, s * (z + nz * ((fx ? 0 : d) / 2 + 0.3) + (fx ? off : 0))); f.rotation.y = Math.atan2(nx * s, nz * s); deco(f);   // 材質ごとにまとめる
        }
      }
      // ネオンの縦看板（遊ぶ所を向いた面に、ときどき。字は無しで光る帯だけ）
      if (rnd(0, 1) < 0.45) {
        const fx = Math.abs(x) >= Math.abs(z), nx = fx ? -Math.sign(x) : 0, nz = fx ? 0 : -Math.sign(z), sl = rnd(6, 16), sy = G0 + rnd(10, Math.max(12, h - sl / 2 - 2));
        const nm = farNeon[Math.floor(rnd(0, farNeon.length))], off = rnd(-0.3, 0.3) * (fx ? d : w);
        for (const s of [1, -1]) {
          const b = boxMesh(nx ? 0.4 : 1.6, sl, nx ? 1.6 : 0.4, nm);
          b.position.set(s * (x + nx * ((fx ? w : 0) / 2 + 0.2) + (fx ? 0 : off)), sy, s * (z + nz * ((fx ? 0 : d) / 2 + 0.2) + (fx ? off : 0))); deco(b);
        }
      }
    }
  }
  // ----- 下の通りの車（光だけ。白い前照灯と赤い尾灯）。通りは遊ぶ所のまわりと、遠くのビルの間 -----
  {
    let sd = 3;
    const rnd = (a, b) => a + ((sd = (sd * 16807) % 2147483647) / 2147483647) * (b - a);
    for (const at of [-45, 45, -109, 109, 161, -161]) for (const axis of ['x', 'z']) for (const dir of [1, -1]) {
      const n = Math.abs(at) < 50 ? 4 : 3;
      for (let i = 0; i < n; i++) RM.cars.push({ axis, at: at + dir * 1.6, dir, p: rnd(-210, 210), v: dir * rnd(9, 15) });
    }
    const mk = (color) => { const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1.5, 0.25, 0.3), new THREE.MeshBasicMaterial({ color }), RM.cars.length); im.frustumCulled = false; cur.group.add(im); return im; };
    RM.head = mk(0xfff4dc); RM.tail = mk(0xff3030);
  }
  // ----- 探照灯：遠くのビルの上から、光の柱が空をゆっくり振れる -----
  {
    const geo = new THREE.CylinderGeometry(7, 0.5, 240, 16, 1, true); geo.translate(0, 120, 0);
    const bm = new THREE.MeshBasicMaterial({ color: 0xc8d8ff, transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    for (const [x, y, z, yaw, ph] of [[-120, 75, 50, 2.2, 0], [120, 75, -50, -0.9, 2], [45, 62, 135, 3.4, 4], [-45, 62, -135, 0.3, 1]]) {
      const m = new THREE.Mesh(geo, bm); m.position.set(x, G0 + y, z); cur.group.add(m);
      RM.beams.push({ m, yaw, ph });
    }
  }
  // ----- 室外機の回る羽（十字の羽をまとめて1つの InstancedMesh に） -----
  {
    const a = new THREE.BoxGeometry(1.0, 0.025, 0.16), b = a.clone().rotateY(Math.PI / 2);
    const g = new THREE.BufferGeometry();
    for (const k of ['position', 'normal', 'uv']) {
      const A = a.toNonIndexed().attributes[k], B = b.toNonIndexed().attributes[k], arr = new Float32Array(A.array.length + B.array.length);
      arr.set(A.array, 0); arr.set(B.array, A.array.length); g.setAttribute(k, new THREE.BufferAttribute(arr, A.itemSize));
    }
    RM.blades = new THREE.InstancedMesh(g, mat(0x5a5962), RM.fans.length); RM.blades.frustumCulled = false; cur.group.add(RM.blades);
  }
  // ----- 室外機の排気の湯気（3台に1台。白くやわらかい玉が上がりながら広がって消える） -----
  {
    const tex = canvasTex(64, 64, (g, w) => { const rg = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); rg.addColorStop(0, 'rgba(235,235,245,0.9)'); rg.addColorStop(0.5, 'rgba(220,220,235,0.35)'); rg.addColorStop(1, 'rgba(220,220,235,0)'); g.fillStyle = rg; g.fillRect(0, 0, w, w); });
    RM.fans.forEach((f, i) => {
      if (i % 3) return;
      for (let k = 0; k < 6; k++) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 }));
        cur.group.add(sp); RM.steam.push({ sp, o: f.clone(), t: k / 6 * 2.6 + (i % 7) * 0.13 });
      }
    });
  }
  finishMap();
  updateRoof(0);
}
