// マップ：忍びの屋敷（作り方だけ。共通の部品は src/world/base.ts）
import { P, css, rgba } from '../palette';
import * as THREE from 'three';
import { C, V3, rand } from '../core';
import { canvasTex, mat, toon, woodGrain } from '../render';
import { G0, MAPS, addSolid, beginMap, boxMesh, cur, deco, finishMap, glowM, lanternLitM, plasterM, roofM, sides, skyWall, stairsAt, stoneM, woodSideM } from '../world/base';

// ================= マップ6：忍びの屋敷（室内・昼・48m 四方・点対称） =================
// 真ん中に枯山水の中庭（屋根なし）。まわりに 縁側 → 内側の部屋の輪（北と南は2階まで吹き抜けの大広間）→ 外廊下 → 外側の部屋の輪。
// 2階は中庭の上以外すべて（大広間の上は吹き抜けで、梁を渡れる）。出撃は北西・南東の隅の部屋（玄関）
// 座標は北（-z）と西（-x）の半分だけ書き、box / seg が点対称の場所（-x, -z）にも同じ物を置く
export function buildYashiki() {
  // F1：1階の床 / C1：1階の天井（2階の床板の下面）/ F2：2階の床 / C2：2階の天井 / C2L：北・南の2階（低い天井）
  const F1 = G0 + 0.45, C1 = F1 + 3.2, F2 = F1 + 3.5, C2 = F2 + 3, C2L = F2 + 2.4, YARD = G0 + 0.1, DH = 2.2;
  beginMap('yashiki', {
    lv: { V: F1, F1, F2 },
    spawn: { x: -21, z: -21 },
    water: G0 - 1,   // 水は無い
    nav: { layered: true, r: 0.35, step: 0.45, rampStep: 0.7 },   // 2階建て・狭い廊下・急な階段（坂に沿ってだけ大きな段差）
    atmos: () => ({ top: C(P.ao[1]), hor: C(P.ao[2]), bot: C(P.moegi[2]), sunDir: new V3(0.35, 0.85, 0.4), sunCol: C(P.shiro[2]), sunI: 1.1,
      hemiSky: C(P.shiro[2]), hemiGround: C(P.kiji[1]), hemiI: 0.8, fog: C(P.ao[2]), near: 90, far: 430, clouds: true }),
  });

  // ---------- 材質（模様は場所で貼るので、部屋の大きさが違ってもつながる） ----------
  const tex = draw => { const t = canvasTex(512, 512, draw); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t; };
  const hexOf = (a, b, k) => '#' + C(a).lerp(C(b), k).getHexString();
  // 床板（2m で1回。板 8 枚）
  const floorM = toon({ map: tex((g, w) => { woodGrain(g, w, w, P.kiji[2], P.kiji[1], 90); g.fillStyle = rgba(P.kiji[0], 0.5); for (let i = 0; i <= 8; i++) g.fillRect(0, i * w / 8 - 1, w, 2); }) });
  floorM.userData.surf = 'wood';
  // 畳（1.8m で1回。畳 2 枚、長い辺に濃い緑の縁）
  const tatamiM = toon({ map: tex((g, w) => {
    g.fillStyle = hexOf(P.moegi[2], P.kiji[2], 0.55); g.fillRect(0, 0, w, w);
    for (let y = 0; y < w; y += 4) { g.fillStyle = rgba(P.kiji[0], y % 8 ? 0.07 : 0.13); g.fillRect(0, y, w, 2); }
    g.fillStyle = css(P.midori[0]); for (const x of [0, w / 2, w]) g.fillRect(x - 8, 0, 16, w);
    g.fillStyle = rgba(P.kiji[0], 0.45); g.fillRect(0, 0, w, 2);
  }) });
  // 中庭の砂利と砂紋（16m 四方に1枚の絵。まっすぐな筋と、岩のまわりの輪）
  const ROCKS = [[-3, -2.5], [3, 2.5]];
  const gravelM = toon({ map: canvasTex(1024, 1024, (g, W) => {
    const base = hexOf(P.shiro[1], P.nezumi[2], 0.7), m = W / 16;
    const px = x => (x + 8) * m, py = z => (8 - z) * m;
    g.fillStyle = base; g.fillRect(0, 0, W, W);
    const groove = path => { g.lineWidth = 0.07 * m; g.strokeStyle = rgba(P.nezumi[0], 0.32); path(0); g.lineWidth = 0.045 * m; g.strokeStyle = rgba(P.shiro[2], 0.4); path(0.05 * m); };
    for (let z = -7.85; z < 8; z += 0.3) groove(o => { g.beginPath(); g.moveTo(0, py(z) + o); g.lineTo(W, py(z) + o); g.stroke(); });
    for (const [x, z] of ROCKS) {
      g.fillStyle = base; g.beginPath(); g.arc(px(x), py(z), 2.55 * m, 0, 7); g.fill();
      for (let r = 1.45; r <= 2.4; r += 0.3) groove(o => { g.beginPath(); g.arc(px(x), py(z) + o, r * m, 0, 7); g.stroke(); });
    }
    for (let i = 0; i < 7000; i++) { g.fillStyle = rgba(i % 2 ? P.nezumi[0] : P.shiro[2], rand(0.05, 0.16)); g.fillRect(rand(0, W), rand(0, W), 2, 2); }
  }) });
  gravelM.userData.surf = 'gravel';
  const stairM = toon({ map: tex((g, w) => woodGrain(g, w, w, P.kiji[1], P.kiji[0], 60)) }); stairM.userData.surf = 'wood';
  woodSideM.userData.surf = 'wood';

  // ---------- 置き方 ----------
  // 模様を場所で貼る（S m で1回くり返す）：上下の面は x,z、横の面は (z か x), y
  const uvWorld = (geo, cx, cy, cz, S) => {
    const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) + cx, y = p.getY(i) + cy, z = p.getZ(i) + cz;
      if (Math.abs(n.getY(i)) > 0.5) uv.setXY(i, x / S, z / S);
      else if (Math.abs(n.getX(i)) > 0.5) uv.setXY(i, z / S, y / S);
      else uv.setXY(i, x / S, y / S);
    }
    uv.needsUpdate = true;
  };
  // 箱（x0..x1, y0..y1, z0..z1）を、点対称の場所にも置く
  const box = (x0, x1, y0, y1, z0, z1, m, walk = false, S = 0) => {
    for (const s of [1, -1]) {
      const geo = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
      const cx = s * (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = s * (z0 + z1) / 2;
      if (S) uvWorld(geo, cx, cy, cz, S);
      const mesh = new THREE.Mesh(geo, m); mesh.position.set(cx, cy, cz);
      addSolid(mesh, null, walk);
    }
  };
  // 見た目の無い当たり判定（格子・手すりなど、見える物と同じ場所にだけ使う）
  const col = (x0, x1, y0, y1, z0, z1) => {
    for (const s of [1, -1]) cur.colliders.push({ kind: 'box', min: new V3(s > 0 ? x0 : -x1, y0, s > 0 ? z0 : -z1), max: new V3(s > 0 ? x1 : -x0, y1, s > 0 ? z1 : -z0), walk: false });
  };
  // 格子窓：縦の桟（弾は桟のすき間を抜ける）。人は通れない
  const lattice = (axis, at, d0, d1, b0, b1, t) => {
    for (const s of [1, -1]) for (let p = d0 + 0.09; p < d1 - 0.05; p += 0.12) {
      const bar = boxMesh(axis === 'x' ? 0.04 : 0.07, b1 - b0, axis === 'x' ? 0.07 : 0.04, woodSideM);
      bar.position.set(s * (axis === 'x' ? p : at), (b0 + b1) / 2, s * (axis === 'x' ? at : p)); deco(bar);
    }
    if (axis === 'x') col(d0, d1, b0, b1, at - t / 2, at + t / 2); else col(at - t / 2, at + t / 2, b0, b1, d0, d1);
  };
  // 壁：axis 'x' は z=at の所を x 方向に a0〜a1、'z' は x=at の所を z 方向に。厚み t、模様の大きさ S
  //   ops：開口 [中心, 幅, 下, 上, 種類]（下・上は床からの高さ）。種類 'door' 戸口、'lat' 格子窓、'win' 素通しの窓（飛び込める）
  //   戸口の幅は 1.6m 以上、中心は 0.5 刻み（CPU の道のマス目に合わせる）
  const seg = (axis, at, a0, a1, y0, y1, ops, m, t = 0.2, S = 1.8) => {
    const B = (p0, p1, b0, b1, mm, SS = S) => axis === 'x' ? box(p0, p1, b0, b1, at - t / 2, at + t / 2, mm, false, SS) : box(at - t / 2, at + t / 2, b0, b1, p0, p1, mm, false, SS);
    // 当たり判定を減らす：敷居・鴨居は見た目だけにして、すぐ隣の壁の当たり判定を敷居・鴨居の所まで伸ばす
    const reach = (n, key, v) => { for (let i = 1; i <= n; i++) cur.colliders[cur.colliders.length - i][key].y = v; };
    const D = (p0, p1, b0, b1, mm) => { for (const s of [1, -1]) {
      const geo = axis === 'x' ? new THREE.BoxGeometry(p1 - p0, b1 - b0, t) : new THREE.BoxGeometry(t, b1 - b0, p1 - p0);
      const cx = s * (axis === 'x' ? (p0 + p1) / 2 : at), cy = (b0 + b1) / 2, cz = s * (axis === 'x' ? at : (p0 + p1) / 2);
      uvWorld(geo, cx, cy, cz, 2); const o = new THREE.Mesh(geo, mm); o.position.set(cx, cy, cz); deco(o);
    } };
    let a = a0;
    for (const [c, w, lo = 0, hi = DH, kind = 'door'] of [...ops].sort((p, q) => p[0] - q[0])) {
      const d0 = c - w / 2, d1 = c + w / 2;
      if (d0 > a) B(a, d0, y0, y1, m);
      if (lo > 0) { B(d0, d1, y0, y0 + lo - 0.08, m); reach(2, 'max', y0 + lo); D(d0, d1, y0 + lo - 0.08, y0 + lo, woodSideM); }   // 腰壁と敷居
      const top = Math.min(y1, y0 + hi + 0.12);
      if (top < y1) { B(d0, d1, top, y1, m); reach(2, 'min', y0 + hi); D(d0, d1, y0 + hi, top, woodSideM); }   // 鴨居（上の壁の当たり判定に含める）
      else B(d0, d1, y0 + hi, top, woodSideM, 2);
      if (kind === 'lat') lattice(axis, at, d0, d1, y0 + lo, y0 + hi, t);
      a = d1;
    }
    if (a1 > a) B(a, a1, y0, y1, m);
  };
  // 柱（角材）
  const post = (x, z, y0, y1, w = 0.24) => box(x - w / 2, x + w / 2, y0, y1, z - w / 2, z + w / 2, woodSideM, false, 2);
  // 手すり（腰の高さ。上の横木・下の横木・細い縦の桟）。gaps：通り抜けられる切れ目 [中心, 幅]
  const rail = (axis, at, a0, a1, y0, gaps = []) => {
    let a = a0;
    const piece = (p0, p1) => {
      if (p1 - p0 < 0.05) return;
      const B = (q0, q1, b0, b1, w) => axis === 'x' ? box(q0, q1, b0, b1, at - w / 2, at + w / 2, woodSideM, false, 2) : box(at - w / 2, at + w / 2, b0, b1, q0, q1, woodSideM, false, 2);
      B(p0, p1, y0 + 0.82, y0 + 0.92, 0.14); B(p0, p1, y0, y0 + 0.08, 0.12);
      for (let q = p0 + 0.15; q < p1 - 0.1; q += 0.3) B(q - 0.025, q + 0.025, y0 + 0.08, y0 + 0.82, 0.05);
      if (axis === 'x') col(p0, p1, y0, y0 + 0.92, at - 0.07, at + 0.07); else col(at - 0.07, at + 0.07, y0, y0 + 0.92, p0, p1);
    };
    for (const [c, w] of [...gaps].sort((p, q) => p[0] - q[0])) { piece(a, c - w / 2); a = c + w / 2; }
    piece(a, a1);
  };
  // 畳（当たり判定なし。床板の上に薄く敷く）
  const tatami = (x0, x1, z0, z1, y) => {
    for (const s of [1, -1]) {
      const geo = new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2);
      const cx = s * (x0 + x1) / 2, cz = s * (z0 + z1) / 2;
      const p = geo.attributes.position, uv = geo.attributes.uv;
      for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + cx) / 1.8, (p.getZ(i) + cz) / 1.8);
      const m = new THREE.Mesh(geo, tatamiM); m.position.set(cx, y + 0.01, cz); deco(m);
    }
  };

  // ---------- 仕切り：壁ではなく、ふすま・障子を並べる ----------
  // 建具1枚の絵（縦長）。紙・黒い縁・引手
  const panelTex = (paper, edge, handle = true) => {
    const t = canvasTex(256, 512, (g, w, h) => {
      paper(g, w, h);
      g.fillStyle = edge; g.fillRect(0, 0, 11, h); g.fillRect(w - 11, 0, 11, h); g.fillRect(0, 0, w, 13); g.fillRect(0, h - 13, w, 13);
      if (handle) { g.fillStyle = css(P.sumi[0]); g.beginPath(); g.arc(w - 38, h * 0.52, 12, 0, 7); g.fill(); g.fillStyle = css(P.kin[0]); g.beginPath(); g.arc(w - 38, h * 0.52, 7, 0, 7); g.fill(); }
    });
    t.anisotropy = 4; return t;
  };
  const fusumaPM = toon({ map: panelTex((g, w, h) => {
    g.fillStyle = hexOf(P.shiro[2], P.kin[2], 0.28); g.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) { g.fillStyle = rgba(P.kin[0], rand(0.03, 0.07)); g.fillRect(rand(0, w), rand(0, h), rand(1, 3), rand(1, 3)); }
  }, css(P.sumi[0])) });
  const goldPM = toon({ map: panelTex((g, w, h) => {
    g.fillStyle = css(P.kin[2]); g.fillRect(0, 0, w, h);
    for (let i = 0; i < 6; i++) { g.fillStyle = rgba(P.kin[1], 0.4); g.beginPath(); g.ellipse(rand(0, w), rand(0, h), rand(50, 110), rand(12, 22), 0, 0, 7); g.fill(); }
  }, css(P.sumi[0])) });
  // 障子：白い紙に桟、下は板（腰板）。昼の光で少し明るく見える
  const shojiPM = toon({ map: panelTex((g, w, h) => {
    g.fillStyle = hexOf(P.shiro[1], P.kiji[2], 0.15); g.fillRect(0, 0, w, h);   // 少し黄ばんだ和紙（ほかの木・ふすまと色をそろえる）
    for (let i = 0; i < 200; i++) { g.fillStyle = rgba(P.kiji[0], rand(0.02, 0.05)); g.fillRect(rand(0, w), rand(0, h), rand(1, 3), rand(1, 3)); }
    g.fillStyle = css(P.kiji[0]);   // 桟は柱・縁と同じ濃い木の色
    for (let i = 1; i < 3; i++) g.fillRect(i * w / 3 - 2, 0, 4, h * 0.8);
    for (let i = 1; i < 6; i++) g.fillRect(0, i * h * 0.8 / 6 - 2, w, 4);
    woodGrain(g, w, h * 0.2, P.kiji[0], P.sumi[0], 12); g.drawImage(g.canvas, 0, 0, w, h * 0.2, 0, h * 0.8, w, h * 0.2);   // 腰板
    g.fillStyle = hexOf(P.shiro[1], P.kiji[2], 0.15); g.fillRect(0, 0, w, h * 0.2);
    g.fillStyle = css(P.kiji[0]); for (let i = 1; i < 6; i++) g.fillRect(0, i * h * 0.8 / 6 - 2, w, 4); for (let i = 1; i < 3; i++) g.fillRect(i * w / 3 - 2, 0, 4, h * 0.2);
  }, css(P.sumi[1]), false) });
  // 点対称の場所にも置く飾り（当たり判定なし）。S を渡すと模様を場所で貼る
  const dbox = (x0, x1, y0, y1, z0, z1, m, S = 0) => {
    for (const s of [1, -1]) {
      const geo = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
      const cx = s * (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = s * (z0 + z1) / 2;
      if (S) uvWorld(geo, cx, cy, cz, S);
      const o = new THREE.Mesh(geo, m); o.position.set(cx, cy, cz); deco(o);
    }
  };
  // 柱（同じ場所に2本立てない。重なった面がちらつくので）
  const pillarsDone = new Set();
  const pillar = (x, z, y0, y1) => {
    const key = (a, b) => `${a.toFixed(2)},${b.toFixed(2)},${y0.toFixed(2)}`;
    if (pillarsDone.has(key(x, z))) return;
    pillarsDone.add(key(x, z)); pillarsDone.add(key(-x, -z));
    dbox(x - 0.075, x + 0.075, y0, y1, z - 0.075, z + 0.075, woodSideM, 2);
  };
  // 仕切り：axis 'x' は z=at の所を x 方向に a0〜a1、'z' は x=at の所を z 方向に。
  //   柱の間に建具（1枚 0.9m 以上）を2本の溝に互い違いに立て、上に鴨居・小壁・長押。
  //   ops：開いている所 [中心, 幅, 種類]（種類 'hidden' は回転扉を入れる所。戻り値の開き口に回転扉を置く）。そこの建具は両脇の建具の後ろへ引いてある。開き口は建具の幅にそろえ、1.7m 以上
  const fw = (axis, at, a0, a1, y0, y1, ops, style = 'fusuma') => {
    const pm = style === 'gold' ? goldPM : style === 'shoji' ? shojiPM : fusumaPM;
    const XZ = (p, q) => (axis === 'x' ? [p, q] : [q, p]);
    const B = (p0, p1, b0, b1, t0, t1, m, S = 0) => { const [x0, z0] = XZ(p0, at + t0), [x1, z1] = XZ(p1, at + t1); dbox(Math.min(x0, x1), Math.max(x0, x1), b0, b1, Math.min(z0, z1), Math.max(z0, z1), m, S); };
    const CL = (p0, p1, b0, b1) => { const [x0, z0] = XZ(p0, at - 0.1), [x1, z1] = XZ(p1, at + 0.1); col(Math.min(x0, x1), Math.max(x0, x1), b0, b1, Math.min(z0, z1), Math.max(z0, z1)); };
    const len = a1 - a0, inOp = (p, m) => ops.some(([c, w]) => Math.abs(p - c) < w / 2 + m);
    // 柱：両端と 3.6m ごと（開き口の所はよける）
    const nb = Math.max(1, Math.ceil(len / 3.6 - 1e-6)), posts = [a0];
    for (let i = 1; i < nb; i++) { const p = a0 + len * i / nb; if (!inOp(p, 0.5)) posts.push(p); }
    posts.push(a1);
    for (const p of posts) { const [x, z] = XZ(p, at); pillar(x, z, y0, y1); }
    const TR = [-0.02, 0.02, 0.055], gaps = [];
    for (let b = 0; b < posts.length - 1; b++) {
      const b0 = posts[b] + 0.075, b1 = posts[b + 1] - 0.075, n = Math.max(1, Math.floor((b1 - b0) / 0.9)), pw = (b1 - b0) / n;
      const open = new Array(n).fill(false), slid = [];
      for (const [c, w, kind] of ops) {
        if (c < b0 - 0.3 || c > b1 + 0.3) continue;
        let lo = Math.min(n - 1, Math.max(0, Math.floor((c - b0) / pw))), hi = lo;
        // 中心から近い側へ1枚ずつ広げる（頼まれた幅と 1.7m の広い方まで）
        while ((hi - lo + 1) * pw < Math.max(w, 1.7) - 1e-6 && (lo > 0 || hi < n - 1)) {
          const dl = lo > 0 ? Math.abs(b0 + (lo - 0.5) * pw - c) : Infinity, dh = hi < n - 1 ? Math.abs(b0 + (hi + 1.5) * pw - c) : Infinity;
          if (dl <= dh) lo--; else hi++;
        }
        for (let i = lo; i <= hi; i++) open[i] = true;
        gaps.push([b0 + lo * pw, b0 + (hi + 1) * pw, kind]);
        if (kind === 'hidden') continue;   // 隠し戸（回転扉）：建具は引かない
        // 引いた建具：左半分は左隣の後ろ、右半分は右隣の後ろ
        const cnt = hi - lo + 1;
        for (let i = lo; i <= hi; i++) { const left = i - lo < cnt / 2, nbI = left ? lo - 1 : hi + 1; if (nbI >= 0 && nbI < n) slid.push(nbI); }
      }
      for (let i = 0; i < n; i++) if (!open[i]) B(b0 + i * pw - 0.025, b0 + (i + 1) * pw + 0.025, y0 + 0.03, y0 + DH, TR[i % 2] - 0.0125, TR[i % 2] + 0.0125, pm);
      const used = new Map();
      for (const i of slid) {
        if (open[i]) continue;
        const k = used.get(i) || 0; used.set(i, k + 1);
        const t = k === 0 ? 1 - (i % 2) : 2;
        B(b0 + i * pw - 0.025, b0 + (i + 1) * pw + 0.025, y0 + 0.03, y0 + DH, TR[t] - 0.0125, TR[t] + 0.0125, pm);
      }
    }
    // 鴨居・小壁・長押・その上の壁、足もとの敷居（柱の内側まで）
    const e0 = a0 + 0.075, e1 = a1 - 0.075;
    B(e0, e1, y0, y0 + 0.03, -0.06, 0.06, woodSideM, 2);
    B(e0, e1, y0 + DH, y0 + DH + 0.1, -0.06, 0.06, woodSideM, 2);
    if (y0 + DH + 0.1 < y1) B(e0, e1, y0 + DH + 0.1, Math.min(y1, y0 + DH + 0.45), -0.05, 0.05, plasterM);
    if (y0 + DH + 0.6 <= y1) B(e0, e1, y0 + DH + 0.45, y0 + DH + 0.6, -0.08, 0.08, woodSideM, 2);
    if (y0 + DH + 0.6 < y1) B(e0, e1, y0 + DH + 0.6, y1, -0.05, 0.05, plasterM);
    // 当たり判定：閉じている所は床から天井まで、開き口は鴨居から上だけ
    gaps.sort((p, q) => p[0] - q[0]);
    let a = a0;
    for (const [g0, g1] of gaps) { if (g0 > a) CL(a, g0, y0, y1); CL(g0, g1, y0 + DH, y1); a = g1; }
    if (a1 > a) CL(a, a1, y0, y1);
    return gaps;
  };
  // 階段の段（見た目。当たり判定は坂のまま）：from（低い端）→ to（高い端）
  const treads = (axis, at, from, to, width, yLow, yHigh, n = 14) => {
    const d = (to - from) / n, rise = (yHigh - yLow) / n, hw = width / 2 + 0.01;
    for (let i = 0; i < n; i++) {
      const p0 = from + i * d, p1 = from + (i + 1) * d, top = yLow + (i + 1) * rise;
      if (axis === 'x') dbox(Math.min(p0, p1), Math.max(p0, p1), yLow, top, at - hw, at + hw, stairM, 2);
      else dbox(at - hw, at + hw, yLow, top, Math.min(p0, p1), Math.max(p0, p1), stairM, 2);
    }
  };

  // ================= 1階 =================
  // 床（屋敷の床は高床。中庭は砂利で 0.35m 低い）
  const floor1 = sides(stoneM, floorM);
  box(-24, 24, G0, F1, -24, -8, floor1, true, 2);
  box(-24, -8, G0, F1, -8, 8, floor1, true, 2);
  {
    const geo = new THREE.BoxGeometry(16, YARD - G0, 16);
    // 上の面だけ、絵の (0,0)〜(1,1) が中庭の (-8,-8)〜(8,8) になるように
    const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
    for (let i = 0; i < p.count; i++) if (n.getY(i) > 0.5) uv.setXY(i, (p.getX(i) + 8) / 16, (p.getZ(i) + 8) / 16);
    const yard = new THREE.Mesh(geo, sides(stoneM, gravelM)); yard.position.set(0, (G0 + YARD) / 2, 0);
    addSolid(yard, null, true);
  }

  // 外まわり：閉じた障子（外の光で明るい。出られない）
  fw('x', -23.85, -24, 24, F1, C1, [], 'shoji');
  fw('z', -23.85, -23.7, 23.7, F1, C1, [], 'shoji');

  // 外側の部屋の輪と外廊下の境（z=-18・x=-18。隅の部屋どうしの境も兼ねる）
  fw('x', -18, -23.7, 23.7, F1, C1, [[-20.5, 1.6], [-14.5, 1.6], [1.5, 1.6], [7.5, 1.6], [21.5, 1.6]], 'shoji');
  const hid = fw('z', -18, -23.7, 23.7, F1, C1, [[-20.5, 1.6], [-14.5, 1.6], [0.5, 1.6, 'hidden'], [7.5, 1.6], [21.5, 1.6]], 'shoji').find(g => g[2] === 'hidden');
  // 回転扉（どんでん返し）：外廊下から隠し階段の部屋へ。廊下側は障子、部屋側はふすまに見える。押し付けると半回転して向こうへ運ばれる
  cur.doors = [];
  {
    const [g0, g1] = hid, W = g1 - g0, cz = (g0 + g1) / 2, x = -18, H = DH - 0.03;
    for (const s of [1, -1]) {
      const pivot = new THREE.Group(); pivot.position.set(s * x, F1 + 0.03, s * cz); pivot.rotation.y = s > 0 ? 0 : Math.PI;
      for (const k of [-1, 1]) {   // 建具2枚（+x の面が障子、-x の面がふすま）
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.05, H, W / 2 - 0.01), [shojiPM, fusumaPM, woodSideM, woodSideM, woodSideM, woodSideM]);
        m.position.set(0, H / 2, k * W / 4); pivot.add(m);
      }
      deco(pivot);
      const c = { kind: 'box', min: new V3(s * x - 0.1, F1, s * cz - W / 2), max: new V3(s * x + 0.1, F1 + DH, s * cz + W / 2), walk: false, noNav: true };   // CPU の道は扉を通ってよい
      cur.colliders.push(c);
      cur.doors.push({ pivot, c, x: s * x, z: s * cz, w: W, y: F1, h: DH, t: -1, cool: 0, touch: new Map(), base: pivot.rotation.y });
    }
  }
  // 外側の部屋どうしのふすま（戸口は互い違いにして、一直線に見通せないように）
  for (const [x, d] of [[-10.8, -19.5], [-3.6, -21.5], [3.6, -19.5], [10.8, -21.5]]) fw('z', x, -23.7, -18.1, F1, C1, [[d, 1.6]]);
  for (const [z, d] of [[-10.8, -21.5], [-3.6, null], [3.6, null], [10.8, -19.5]]) fw('x', z, -23.7, -18.1, F1, C1, d === null ? [] : [[d, 1.6]]);

  // 外廊下と内側の部屋の輪の境（z=-16・x=-16）
  fw('x', -16, -16.1, -10, F1, C1, [[-13.5, 1.6]]);
  fw('x', -16, -10, 10, F1, C1, [[-6.5, 1.8], [5.5, 1.8]], 'gold');   // 大広間の奥は金のふすま
  fw('x', -16, 10, 16.1, F1, C1, []);
  fw('z', -16, -15.9, 15.9, F1, C1, [[-6.5, 1.6], [6.5, 1.6], [11.5, 1.6]]);
  // 内側の部屋どうし
  fw('z', -10, -16, -10.1, F1, C1, [[-13.5, 1.6]]);   // 北西の角の部屋 | 北の大広間
  fw('z', 10, -16, -10.1, F1, C1, [[-11.5, 1.6]]);    // 北の大広間 | 北東の角の部屋（階段）
  fw('x', -10, -16, -10, F1, C1, [[-12.5, 1.6]]);     // 北西の角の部屋 | 西の部屋
  fw('x', -10, 10, 16, F1, C1, []);                   // 北東の角の部屋 | 東の部屋
  fw('x', -3.33, -16, -10.1, F1, C1, [[-13.5, 1.6]]);
  fw('x', 3.33, -16, -10.1, F1, C1, [[-12.5, 1.6]]);
  // 西の部屋と縁側の境：障子（戸口が広く、中庭が見える）
  fw('z', -10, -9.9, 9.9, F1, C1, [[-7.5, 2.2], [-0.5, 2.2], [6.5, 2.2]], 'shoji');
  // 大広間の中庭側は開け放し（柱だけ）。中庭の縁にも柱
  for (const x of [-5, 0, 5]) post(x, -10, F1, C1);
  for (const x of [-10, 10]) { post(x, -10, F1, C1); post(x, -10, F2, C2); }   // 壁の角のすき間をふさぐ柱
  for (const [x, z] of [[-8.12, -8.12], [8.12, -8.12], [-4, -8.12], [4, -8.12], [-8.12, -4], [-8.12, 4]]) post(x, z, F1, C1);

  // 階段：北東の角の部屋（北の壁ぞい、西 → 東へ上る）と、西の真ん中の部屋の隠し階段（外壁ぞい、南 → 北へ上る）
  stairsAt('x', -15.25, 15.9, 1, F1, F2, 1.3, stairM, 5.8);
  stairsAt('z', -23.05, -2.3, -1, F1, F2, 1.3, stairM, 5.8);
  treads('x', -15.25, 10.1, 15.895, 1.3, F1, F2);
  treads('z', -23.05, 3.5, -2.295, 1.3, F1, F2);

  // ================= 2階の床（中庭・大広間の吹き抜け・階段の上は穴） =================
  const floor2 = sides(woodSideM, floorM);
  box(-24, 24, C1, F2, -24, -16, floor2, true, 2);                 // 北の帯（外廊下・外側の部屋の上）
  box(-24, -16, C1, F2, -16, -2.4, floor2, true, 2);               // 西の帯（隠し階段の穴をよける）
  box(-24, -16, C1, F2, 1.9, 16, floor2, true, 2);
  box(-22.4, -16, C1, F2, -2.4, 1.9, floor2, true, 2);
  box(-24, -23.8, C1, F2, -2.4, 1.9, plasterM, false, 2);         // 隠し階段の穴の外壁ぞい（すき間をふさぐ。壁の内側の面より出さない＝足場にならない）
  box(-16, -10, C1, F2, -16, 10, floor2, true, 2);                 // 北西の角と西の部屋の上
  box(10, 16, C1, F2, -14.6, -10, floor2, true, 2);                // 北東の角の部屋の上（階段の穴をよける）
  box(10, 11.7, C1, F2, -16, -14.6, floor2, true, 2);   // 階段の上の穴は広め（上り下りで頭が床の端に当たらないように）
  box(-10, 10, C1, F2, -10, -8, floor2, true, 2);                  // 回廊（北）
  box(-10, -8, C1, F2, -8, 8, floor2, true, 2);                    // 回廊（西）

  // 鳴る床（鶯張り）：外廊下・縁側・2階の回廊。床と同じ高さに、足音の種類だけを変える薄い当たり判定を重ねる
  const squeak = (x0, x1, z0, z1, y) => { for (const s of [1, -1]) cur.colliders.push({ kind: 'box', min: new V3(s > 0 ? x0 : -x1, y - 0.05, s > 0 ? z0 : -z1), max: new V3(s > 0 ? x1 : -x0, y + 0.002, s > 0 ? z1 : -z0), walk: true, surf: 'squeak' }); };   // 床の上面より 2mm 上（床の箱の高さの誤差で負けないように）
  squeak(-18, 18, -18, -16, F1); squeak(-18, -16, -16, 16, F1);   // 外廊下
  squeak(-10, 10, -10, -8, F1); squeak(-10, -8, -8, 8, F1);       // 縁側
  squeak(-10, 10, -10, -8, F2); squeak(-10, -8, -8, 8, F2);       // 2階の回廊

  // 大広間の吹き抜けの梁（全部乗れる。上面が2階の床と同じ高さ）
  for (const x of [-5, 0, 5]) box(x - 0.18, x + 0.18, F2 - 0.35, F2, -15.9, -10, woodSideM, true, 2);
  box(-9.9, 9.9, F2 - 0.35, F2, -13.18, -12.82, woodSideM, true, 2);

  // ================= 2階の壁 =================
  fw('x', -23.85, -24, 24, F2, C2, [], 'shoji');
  fw('z', -23.85, -23.7, 23.7, F2, C2, [], 'shoji');
  // 外の帯と内側の輪の境（z=-16：真ん中の戸口は梁へ出る口）
  fw('x', -16, -23.7, -10, F2, C2, [[-20.5, 1.6], [-13.5, 1.6]]);
  fw('x', -16, -10, 10, F2, C2, [[0, 1.2]], 'gold');
  fw('x', -16, 10, 23.7, F2, C2, [[20.5, 1.6]]);   // 北東の角の部屋は階段の穴があるので、北の部屋への戸口なし
  fw('z', -16, -15.9, 15.9, F2, C2, [[-12.5, 1.6], [3.5, 1.6], [12.5, 1.6]]);
  // 北の帯の部屋（天井が低い）・西の帯の部屋
  for (const [x, d] of [[-16, -19.5], [-5.33, -21.5], [5.33, -18.5], [16, -20.5]]) fw('z', x, -23.7, -16.1, F2, C2, [[d, 1.6]]);
  for (const [z, d] of [[-5.33, -19.5], [5.33, -20.5]]) fw('x', z, -23.7, -16.1, F2, C2, [[d, 1.6]]);
  // 内側の輪
  fw('x', -10, -16, -10, F2, C2, [[-13.5, 1.6]]);           // 北西の角 | 西の部屋
  fw('x', -10, 10, 16, F2, C2, [[12.5, 1.6]]);              // 北東の角 | 東の部屋
  fw('x', 0, -16, -10.1, F2, C2, [[-13.5, 1.6]]);           // 西の部屋を2つに
  seg('z', -10, -16, -10.1, F2, C2, [[-13, 1.6, 1.0, 2.2, 'win']], plasterM, 0.2, 2);   // 北西の角 | 吹き抜け（窓から大広間をのぞける・飛び降りられる）
  seg('z', 10, -16, -10.1, F2, C2, [[-12.5, 1.6, 1.0, 2.2, 'win']], plasterM, 0.2, 2);  // 吹き抜け | 北東の角
  fw('z', -10, -9.9, 9.9, F2, C2, [[-5.5, 1.8], [4.5, 1.8]], 'shoji');   // 西の部屋 | 回廊
  // 回廊：中庭側と吹き抜け側に手すり（吹き抜け側は梁の所が切れていて渡れる）。中庭側の上に鴨居
  rail('x', -8.06, -8, 8, F2);
  rail('z', -8.06, -7.94, 7.94, F2);
  rail('x', -9.94, -9.9, 9.9, F2, [[-5, 1.2], [0, 1.2], [5, 1.2]]);
  box(-8.12, 8.12, C2 - 0.35, C2, -8.12, -8.0, woodSideM, false, 2);
  box(-8.12, -8.0, C2 - 0.35, C2, -8.0, 8.0, woodSideM, false, 2);
  for (const [x, z] of [[-8.12, -8.12], [8.12, -8.12], [-4, -8.12], [4, -8.12], [-8.12, -4], [-8.12, 4]]) post(x, z, F2, C2 - 0.35);

  // ================= 天井と屋根 =================
  const ceilM = woodSideM;
  box(-24, 24, C2, C2 + 0.3, -24, -8, ceilM, false, 2);
  box(-24, -8, C2, C2 + 0.3, -8, 8, ceilM, false, 2);
  box(-16, 16, C2L, C2L + 0.1, -23.7, -16.1, ceilM, false, 2);   // 北・南の帯の部屋は天井が低い
  // 中庭から見える瓦屋根（中庭のまわりを囲む斜めの屋根。飾り）
  for (let k = 0; k < 4; k++) {
    const g = new THREE.Group();
    const run = 7, rise = 2.4, len = Math.hypot(run, rise);
    const r = boxMesh(30, 0.25, len, roofM); r.position.set(0, C2 + 0.3 + rise / 2, -7 - run / 2); r.rotation.x = Math.atan2(rise, run);
    const eave = boxMesh(17.6, 0.18, 0.3, woodSideM); eave.position.set(0, C2 + 0.22, -7.1);
    g.add(r, eave); g.rotation.y = k * Math.PI / 2; deco(g);
  }
  // 中庭の上のふた（見えない。グレネードの爆風で屋根へ出ないように。ユーザーの決定で、ここだけ見えない壁）
  cur.colliders.push({ kind: 'box', min: new V3(-8, C2 - 0.2, -8), max: new V3(8, C2 + 60, 8), walk: false });
  skyWall(24, G0 + 0.5);

  // ================= 畳（部屋の床。廊下・縁側・回廊は板の間） =================
  for (const [x0, x1] of [[-24, -18], [-18, -10.8], [-10.8, -3.6], [-3.6, 3.6], [3.6, 10.8], [10.8, 18], [18, 24]]) tatami(x0 + (x0 === -24 ? 0.3 : 0.1), x1 - (x1 === 24 ? 0.3 : 0.1), -23.7, -18.1, F1);
  for (const [z0, z1] of [[-18, -10.8], [-10.8, -3.6], [-3.6, 3.6], [3.6, 10.8], [10.8, 18]]) tatami(-23.7, -18.1, z0 + 0.1, z1 - 0.1, F1);
  for (const [x0, x1, z0, z1] of [[-16, -10, -16, -10], [10, 16, -14.6, -10], [-10, 10, -16, -10], [-16, -10, -10, -3.33], [-16, -10, -3.33, 3.33], [-16, -10, 3.33, 10]]) tatami(x0 + 0.1, x1 - 0.1, z0 + 0.1, z1 - 0.1, F1);
  for (const [x0, x1] of [[-24, -16], [-16, -5.33], [-5.33, 5.33], [5.33, 16], [16, 24]]) tatami(x0 + (x0 === -24 ? 0.3 : 0.1), x1 - (x1 === 24 ? 0.3 : 0.1), -23.7, -16.1, F2);
  for (const [z0, z1] of [[-16, -5.33], [-5.33, 5.33], [5.33, 16]]) tatami(-22.3, -16.1, z0 + 0.1, z1 - 0.1, F2);
  for (const [x0, x1, z0, z1] of [[-16, -10, -16, -10], [-16, -10, -10, 0], [-16, -10, 0, 10], [10, 16, -14.5, -10]]) tatami(x0 + 0.1, x1 - 0.1, z0 + 0.1, z1 - 0.1, F2);

  // ================= 手順2：置き物（すべて点対称。壁にはぴったり付けるか、1.1m 以上あける） =================
  const lacquerM = mat(P.sumi[0]), goldMetalM = mat(P.kin[1]), darkWoodM = woodSideM;
  // 当たり判定の円柱（点対称にも）
  const colCyl = (x, z, r, y0, y1) => { for (const s of [1, -1]) cur.colliders.push({ kind: 'cyl', x: s * x, z: s * z, r, y0, y1, walk: false }); };
  // 部品を組み立てて点対称の2か所に置く（make は原点が足もとの Group を返す）。弾は止まる
  const put = (make, x, y, z, ry = 0) => { for (const s of [1, -1]) { const o = make(); o.position.set(s * x, y, s * z); o.rotation.y = ry + (s < 0 ? Math.PI : 0); deco(o); } };
  const part = (g, geo, m, x, y, z, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); g.add(o); return o; };
  const glow = (x, y, z, sc) => { for (const s of [1, -1]) { const sp = new THREE.Sprite(glowM); sp.scale.setScalar(sc); sp.position.set(s * x, y, s * z); cur.group.add(sp); } };

  // ----- 中庭：大岩2つ（同じ形を点対称に。少し砂に沈める） -----
  {
    const geo = new THREE.IcosahedronGeometry(1, 1), p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 1 + 0.12 * Math.sin(x * 5.1 + y * 3.7) * Math.cos(z * 4.3 - y * 2.2);
      p.setXYZ(i, x * k, Math.max(y * k, -0.55), z * k);   // 底は平ら
    }
    geo.computeVertexNormals();
    const rockM = mat(P.nezumi[0]), [x, z] = ROCKS[0], SY = 0.85, y = YARD - 0.08 + 0.55 * SY;
    for (const s of [1, -1]) { const r = new THREE.Mesh(geo, rockM); r.scale.set(1.12, SY, 1.12); r.position.set(s * x, y, s * z); r.rotation.y = 0.6 + (s < 0 ? Math.PI : 0); deco(r); }
    colCyl(x, z, 1.12, YARD, y + 0.95 * SY);
  }

  // ----- 大広間：大太鼓（撃つと鳴る）と燭台 -----
  {
    const headTex = canvasTex(256, 256, (g, w) => {
      g.fillStyle = css(P.shiro[1]); g.fillRect(0, 0, w, w);
      const c = w / 2; g.fillStyle = css(P.shu[0]); g.strokeStyle = css(P.shu[0]); g.lineWidth = 20;
      for (let i = 0; i < 3; i++) { const a = i * Math.PI * 2 / 3; g.beginPath(); g.arc(c + Math.cos(a) * 38, c + Math.sin(a) * 38, 26, 0, 7); g.fill(); g.beginPath(); g.arc(c, c, 62, a, a + 1.7); g.stroke(); }   // 三つ巴
      g.strokeStyle = css(P.sumi[0]); g.lineWidth = 10; g.beginPath(); g.arc(c, c, w / 2 - 6, 0, 7); g.stroke();
    });
    const headM = toon({ map: headTex }), bodyM = mat(P.shu[0]);
    const X = -2.5, Z = -15.08, R = 0.8,   // 金のふすまにぴったり、梁の真下はよける
     Y = F1 + 0.12 + R + 0.02;
    for (const s of [1, -1]) {
      const drum = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 1.0, 20).rotateZ(Math.PI / 2), [bodyM, headM, headM]);
      drum.position.set(s * X, Y, s * Z); drum.userData.ring = 'taiko'; deco(drum);
    }
    put(() => {
      const g = new THREE.Group(), ring = new THREE.TorusGeometry(R + 0.01, 0.035, 6, 20).rotateY(Math.PI / 2);
      for (const x of [-0.42, 0.42]) part(g, ring, lacquerM, x, Y - F1, 0);
      part(g, new THREE.BoxGeometry(1.5, 0.12, 1.1), darkWoodM, 0, 0.06, 0);                 // 台
      for (const x of [-0.7, 0.7]) part(g, new THREE.BoxGeometry(0.14, Y - F1, 0.14), darkWoodM, x, (Y - F1) / 2, 0);   // 支える柱
      part(g, new THREE.BoxGeometry(1.26, 0.1, 0.5), darkWoodM, 0, 0.17, 0);               // 下の受け
      return g;
    }, X, F1, Z);
    col(X - 0.8, X + 0.8, F1, Y + R, Z - 0.82, Z + 0.82);
    // 燭台：金のふすまの前に4本（壁にぴったり。太鼓とは 1.1m あける）
    const shokudai = () => {
      const g = new THREE.Group();
      part(g, new THREE.CylinderGeometry(0.18, 0.2, 0.05, 8), lacquerM, 0, 0.025, 0);
      part(g, new THREE.CylinderGeometry(0.03, 0.03, 1.3, 6), lacquerM, 0, 0.7, 0);
      part(g, new THREE.CylinderGeometry(0.11, 0.07, 0.04, 8), goldMetalM, 0, 1.36, 0);
      part(g, new THREE.CylinderGeometry(0.03, 0.03, 0.14, 6), mat(P.shiro[2]), 0, 1.45, 0);
      part(g, new THREE.ConeGeometry(0.025, 0.07, 5), lanternLitM, 0, 1.56, 0);
      return g;
    };
    for (const [x, z] of [[-9.68, -15.68], [9.68, -15.68], [-4.6, -15.68], [-0.4, -15.68]]) { put(shokudai, x, F1, z); colCyl(x, z, 0.2, F1, F1 + 1.55); glow(x, F1 + 1.57, z, 0.7); }
  }

  // ----- 床の間（台・背の壁・床柱・落とし掛け・掛け軸・生け花） -----
  const scrollM = toon({ map: canvasTex(128, 320, (g, w, h) => {
    g.fillStyle = css(P.ai[0]); g.fillRect(0, 0, w, h);                  // 表装の布
    g.fillStyle = hexOf(P.shiro[2], P.kiji[2], 0.2); g.fillRect(12, 40, w - 24, h - 80);   // 本紙
    g.fillStyle = rgba(P.sumi[0], 0.55);                                   // 水墨の山
    for (const [cx, cy, s] of [[48, 170, 46], [86, 196, 34], [62, 230, 52]]) { g.beginPath(); g.moveTo(cx - s, cy + s * 0.6); g.lineTo(cx - s * 0.2, cy - s * 0.5); g.lineTo(cx, cy - s * 0.7); g.lineTo(cx + s * 0.4, cy - s * 0.2); g.lineTo(cx + s, cy + s * 0.6); g.fill(); g.fillStyle = rgba(P.sumi[0], 0.3); }
    g.fillStyle = css(P.shu[1]); g.fillRect(84, 250, 12, 12);              // 落款
    g.fillStyle = css(P.kiji[0]); g.fillRect(0, h - 8, w, 8); g.fillRect(0, 0, w, 6);   // 軸
  }) });
  const vaseM = mat(P.ai[0]), stemM = mat(P.moegi[0]), flowerM = mat(P.momo[1]);
  // axis：背の壁の向き（'x' は壁が z=wall の所を x 方向に、'z' は x=wall の所を z 方向に）。a0〜a1：台の幅、dir：部屋の内側の向き（+1/-1）
  const tokonoma = (axis, wall, a0, a1, dir, y) => {
    const D = 0.7, XZ = (p, q) => (axis === 'x' ? [p, q] : [q, p]);
    const B = (p0, p1, q0, q1, b0, b1, m, walk = false) => { const [x0, z0] = XZ(p0, q0), [x1, z1] = XZ(p1, q1); box(Math.min(x0, x1), Math.max(x0, x1), b0, b1, Math.min(z0, z1), Math.max(z0, z1), m, walk, 2); };
    const DB = (p0, p1, q0, q1, b0, b1, m) => { const [x0, z0] = XZ(p0, q0), [x1, z1] = XZ(p1, q1); dbox(Math.min(x0, x1), Math.max(x0, x1), b0, b1, Math.min(z0, z1), Math.max(z0, z1), m, 2); };
    const f = wall + dir * D;
    B(a0, a1, wall, f, y, y + 0.12, sides(darkWoodM, floorM), true);              // 床板（乗れる）
    DB(a0, a1, wall, wall + dir * 0.03, y + 0.12, y + DH, plasterM);              // 背の壁（ふすまの前に漆喰の板）
    DB(a0, a1, f - dir * 0.05, f + dir * 0.05, y + DH, y + DH + 0.12, darkWoodM);  // 落とし掛け
    const fx = a1 - 0.07;                                                          // 床柱（台の端）
    B(fx - 0.07, fx + 0.07, f - dir * 0.14, f, y, y + DH + 0.12, darkWoodM);
    B(a1 - 0.06, a1, wall, f - dir * 0.14, y, y + DH + 0.12, plasterM);   // 袖壁（台の端の壁。後ろのふすまとのすき間をふさぐ）
    // 掛け軸（壁から 1cm 浮かせる）
    const mid = (a0 + a1) / 2, [sx, sz] = XZ(mid, wall + dir * 0.04);
    for (const s of [1, -1]) {
      const sc = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 1.25), scrollM);
      sc.position.set(s * sx, y + 1.15, s * sz);
      sc.rotation.y = (axis === 'x' ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2)) + (s < 0 ? Math.PI : 0);
      deco(sc, false);
    }
    // 生け花（台の上、掛け軸の脇）
    const [vx, vz] = XZ(mid - (a1 - a0) * 0.25, wall + dir * D * 0.5);
    put(() => {
      const g = new THREE.Group();
      part(g, new THREE.CylinderGeometry(0.08, 0.11, 0.3, 8), vaseM, 0, 0.15, 0);
      // 枝：花器の口（高さ 0.28）から斜めに伸ばし、先に花を付ける（茎の向きに合わせて回す）
      const up = new V3(0, 1, 0);
      for (const [dx, dz, h, n] of [[0.35, 0.1, 0.62, 3], [-0.45, -0.05, 0.46, 2], [0.05, -0.4, 0.36, 1]]) {
        const dirV = new V3(dx, 1, dz).normalize(), base = new V3(dx * 0.03, 0.28, dz * 0.03), tip = base.clone().addScaledVector(dirV, h);
        const st = part(g, new THREE.CylinderGeometry(0.007, 0.009, h, 4), stemM, (base.x + tip.x) / 2, (base.y + tip.y) / 2, (base.z + tip.z) / 2);
        st.quaternion.setFromUnitVectors(up, dirV);
        for (let i = 0; i < n; i++) { const p = base.clone().addScaledVector(dirV, h * (1 - i * 0.22)); part(g, new THREE.IcosahedronGeometry(i ? 0.03 : 0.04, 0), flowerM, p.x + (i % 2 ? 0.02 : -0.01), p.y, p.z); }
        part(g, new THREE.BoxGeometry(0.05, 0.004, 0.11), stemM, base.x + dirV.x * h * 0.45 + 0.03, base.y + dirV.y * h * 0.45, base.z + dirV.z * h * 0.45).rotation.y = dx * 2;   // 葉
      }
      return g;
    }, vx, y + 0.12, vz);
    colCyl(vx, vz, 0.12, y + 0.12, y + 0.45);
  };
  tokonoma('z', -15.9, -15.9, -13.5, 1, F1);    // 北西の角の部屋：西の壁、北の壁にぴったり
  tokonoma('x', -3.7, -23.75, -21.35, -1, F1);  // 西の外側の部屋：南の壁、外壁にぴったり

  // ----- 座卓と座布団（座卓は低いので歩いて乗れる） -----
  const cushionM = mat(P.fuji[0]);
  const zataku = (x, z, along, y) => {   // along：長い向き 'x' / 'z'
    const W = along === 'x' ? 1.2 : 0.8, Dp = along === 'x' ? 0.8 : 1.2, H = 0.36;
    put(() => {
      const g = new THREE.Group();
      part(g, new THREE.BoxGeometry(W, 0.05, Dp), lacquerM, 0, H - 0.025, 0);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) part(g, new THREE.BoxGeometry(0.06, H - 0.05, 0.06), lacquerM, sx * (W / 2 - 0.08), (H - 0.05) / 2, sz * (Dp / 2 - 0.08));
      // 座布団（薄いので当たり判定なし）：長い辺の両側に2枚ずつ
      for (const sd of [-1, 1]) for (const k of [-0.3, 0.3]) {
        const [cx, cz] = along === 'x' ? [k, sd * (Dp / 2 + 0.35)] : [sd * (W / 2 + 0.35), k];
        part(g, new THREE.BoxGeometry(0.5, 0.06, 0.5), cushionM, cx, 0.03, cz);
      }
      return g;
    }, x, y, z);
    for (const s of [1, -1]) cur.colliders.push({ kind: 'box', min: new V3(s > 0 ? x - W / 2 : -x - W / 2, y, s > 0 ? z - Dp / 2 : -z - Dp / 2), max: new V3(s > 0 ? x + W / 2 : -x + W / 2, y + H, s > 0 ? z + Dp / 2 : -z + Dp / 2), walk: true, surf: 'wood' });
    return y + H;
  };
  const teaSpots = [];
  for (const [x, z, along, y] of [[-14.4, -21, 'x', F1], [7.2, -21, 'x', F1], [-13, 0, 'z', F1], [-13, -5, 'z', F2]] as const) teaSpots.push([x, z, zataku(x, z, along, y), along === 'z' ? 1 : 0]);

  // ----- 行灯（部屋の隅に、2つの壁にぴったり） -----
  const andonM = toon({ color: C(P.shiro[2]).lerp(C(P.kin[2]), 0.25), emissive: C(P.kin[2]), emissiveIntensity: 0.55 });
  const andon = () => {
    const g = new THREE.Group();
    part(g, new THREE.BoxGeometry(0.36, 0.06, 0.36), darkWoodM, 0, 0.03, 0);
    part(g, new THREE.BoxGeometry(0.3, 0.5, 0.3), andonM, 0, 0.42, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) part(g, new THREE.BoxGeometry(0.03, 0.8, 0.03), darkWoodM, sx * 0.165, 0.4, sz * 0.165);
    part(g, new THREE.BoxGeometry(0.36, 0.04, 0.36), darkWoodM, 0, 0.8, 0);
    return g;
  };
  for (const [x, z, y] of [[-3.88, -23.57, F1], [-23.57, 10.52, F1], [-5.61, -23.57, F2], [-15.72, 9.72, F1]]) {
    put(andon, x, y, z); col(x - 0.18, x + 0.18, y, y + 0.82, z - 0.18, z + 0.18); glow(x, y + 0.45, z, 1.4);
  }

  // ----- 長持（長い木箱。長い辺を壁にぴったり） -----
  const nagaM = toon({ map: canvasTex(256, 128, (g, w, h) => {
    woodGrain(g, w, h, P.kiji[0], P.sumi[0], 20);
    g.fillStyle = css(P.sumi[0]); for (const x of [0, w - 18]) g.fillRect(x, 0, 18, h); g.fillRect(0, 0, w, 10);   // 鉄の金具
    g.fillStyle = css(P.kin[0]); g.beginPath(); g.arc(w / 2, h * 0.35, 9, 0, 7); g.fill();
  }) });
  for (const [x0, x1, z0, z1, y] of [[-23.75, -23.15, -15.2, -13.6, F1], [9, 10.6, -23.75, -23.15, F2], [-23.75, -23.15, -22, -20.4, F2], [-23.75, -23.15, -12, -10.4, F2]]) {
    box(x0, x1, y, y + 0.62, z0, z1, nagaM, true);
  }

  // ----- 動く小物の置き場所（物理は physics.ts の placeYashiki） -----
  cur.yashikiPhys = {
    zabuton: [[17.6, -23.45, F1], [4.93, -23.45, F2], [-15.6, -9.6, F1]],   // 座布団の山（部屋の隅）
    tea: teaSpots,                                                           // 茶器（座卓の上）[x, z, 天板の高さ, 向き]
  };

  finishMap();
}

// ================= 回転扉の動き（main.ts から毎フレーム） =================
// ents：[体, 運ぶか]（自分と CPU は運ぶ。オンラインの相手は向こうの画面で運ばれるので、扉を回すだけ）
// hooks.turn(体, 角度)：扉と一緒に回った角度（向きは変えない＝出たら部屋の中を向いている）/ hooks.start(位置)：回り始めた（音・CPU に聞こえる）
export function updateYashiki(dt, ents, hooks) {
  const doors = MAPS.yashiki?.doors; if (!doors) return;
  const T = 0.7;
  for (const d of doors) {
    if (d.t >= 0) {
      d.t += dt;
      const k = Math.min(d.t / T, 1), ez = k < 0.5 ? 2 * k * k : 1 - (2 - 2 * k) ** 2 / 2, a = Math.PI * ez;
      d.pivot.rotation.y = d.base + a; d.pivot.updateMatrix();
      const e = d.carry;
      if (e) {
        const ca = Math.cos(a), sa = Math.sin(a), [rx, rz] = d.rel;
        e.pos.x = d.x + rx * ca + rz * sa; e.pos.z = d.z - rx * sa + rz * ca; e.vel.x = e.vel.z = 0;
        hooks.turn(e, a - d.prevA); d.prevA = a;
      }
      if (k >= 1) { d.t = -1; d.carry = null; d.base = d.pivot.rotation.y; d.c.min.y = d.y; d.c.max.y = d.y + d.h; d.cool = 0.6; }
      continue;
    }
    if ((d.cool -= dt) > 0) continue;
    for (const [e, carry] of ents) {
      if (!e || e.dead) continue;
      const n = e.pos.x - d.x, along = e.pos.z - d.z;
      if (Math.abs(along) > d.w / 2 - 0.15 || Math.abs(e.pos.y - d.y) > 0.6) { d.touch.delete(e); continue; }
      let go = false;
      if (carry) {   // 扉に押し付けて 0.25 秒で回る
        if (Math.abs(n) < e.radius + 0.15) { const tt = (d.touch.get(e) || 0) + dt; d.touch.set(e, tt); go = tt > 0.25; } else d.touch.delete(e);
      } else go = Math.abs(n) < 0.3;
      if (!go) continue;
      d.t = 0; d.prevA = 0; d.touch.clear();
      d.c.min.y = d.c.max.y = -1e6;   // 回っている間は扉の当たり判定を外す
      d.carry = carry ? e : null; d.rel = [e.pos.x - d.x, e.pos.z - d.z];
      hooks.start(new V3(d.x, d.y + 1, d.z));
      break;
    }
  }
}
