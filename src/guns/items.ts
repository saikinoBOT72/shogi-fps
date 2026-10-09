// 左手に持つスキルの道具（一人称）：フレアガン（龍）・救急キット（成銀）
// 作り方は銃と同じ（図面 mm を部品ごとに押し出す）。塗りはスキンを使わず、ここで決めた色で塗る
import * as THREE from 'three';
import { P } from '../palette';
import { C } from '../core';
import { toon } from '../render';
import { PartBuilder, makeSpace } from './kit';

type Paint = Record<string, { c: number }>;
function paint(B: PartBuilder, colors: Paint) {
  B.finish();
  const mats: Record<string, THREE.Material> = {};
  for (const [slot, meshes] of Object.entries(B.slots)) {
    const p = colors[slot] || { c: P.sumi[1] };
    mats[slot] = mats[slot] || toon({ color: C(p.c) });
    for (const m of meshes) { m.material = mats[slot]; m.castShadow = false; }
  }
}

// ---------- フレアガン：12番の信号拳銃（オリン型） ----------
//   長い銃身が上にのり、その下に機関部（前に抜き窓・横にロゴの台とピン）。鳥の頭のように曲がったグリップに黒い握り板、黒い撃鉄と引き金
//   全長 260mm・銃身の外径 38mm。原点はグリップの付け根。橙の樹脂の一体成形
export function buildFlareGun() {
  const S = makeSpace(60, 110), B = new PartBuilder(S);
  const BV = 170, R = 19, W = 24, GW = 30;                  // 銃身の中心の高さ・半径・機関部の幅・グリップの幅
  // 前後に向いた筒（open：両端をふさがない）
  const pipe = (u0: number, u1: number, r: number, slot: string, open = false, seg = 28) =>
    B.add(slot, S.put(new THREE.CylinderGeometry(r, r, u1 - u0, seg, 1, open), (u0 + u1) / 2, BV, 0, [Math.PI / 2, 0, 0]));
  // ---------- 銃身：長い筒。銃口は穴の奥が見える。横に注意書きのくぼんだ帯、後ろに中折れの留め金 ----------
  pipe(70, 238, R, 'frame', true);
  pipe(238, 246, R + 0.9, 'frame', true);                   // 銃口の縁（少し太い）
  pipe(236.6, 238, R + 0.4, 'dark', true);                   // 縁との境の線
  pipe(84, 86, R + 0.3, 'dark', true);                       // 後ろのつなぎ目
  B.add('frame', S.put(new THREE.RingGeometry(13.5, R + 0.9, 28), 246, BV, 0, [0, Math.PI, 0]));   // 銃口の面
  const bore = new THREE.CylinderGeometry(13.5, 13.5, 44, 28, 1, true); bore.scale(-1, 1, 1);      // 内側を向いた筒（穴の中）
  B.add('bore', S.put(bore, 224, BV, 0, [Math.PI / 2, 0, 0]));
  B.add('bore', S.put(new THREE.CircleGeometry(13.5, 28), 202, BV, 0, [0, Math.PI, 0]));          // 穴の奥
  B.add('frame', S.put(new THREE.CircleGeometry(R, 28), 70, BV));                                 // 後ろの面
  B.add('dark', S.put(new THREE.CircleGeometry(4, 12), 69.6, BV));                                // 撃針の穴
  B.add('metal', S.box(70, 82, BV + 15, BV + 22, 8));                                              // 中折れの留め金（銀）
  for (const x of [-1, 1]) {
    B.add('frameDark', S.box(108, 224, BV - 6.5, BV + 6.5, 1.4, x * (R - 0.4)));                   // 注意書きのくぼんだ帯
    for (let u = 114; u <= 216; u += 4.4) B.add('frame', S.box(u, u + 2.6, BV - 2.2, BV + 2.2, 0.8, x * (R + 0.4)));   // 浮き出た字
  }
  // ---------- 機関部：銃身の下。前は銃身の下まで伸び、抜き窓がある。後ろは撃鉄の台 ----------
  B.add('frame', S.extrude([[56, 112], [56, 150], [66, 156], [172, 156], [172, 126], [166, 117], [150, 112]], W, {
    bevel: 2.5, holes: [[[152, 122], [164, 122], [164, 142], [152, 142]]],
  }));
  B.add('frame', S.extrude([[44, 140], [46, 168], [54, 177], [72, 177], [72, 150]], 16, { bevel: 2 }));   // 撃鉄の台
  for (const x of [-1, 1]) {
    B.add('frame', S.extrude([[100, 136], [104, 130], [132, 130], [136, 136], [132, 146], [104, 146]], 1.6, { bevel: 0.5, x: x * (W / 2 + 0.6) }));   // ロゴの台
    B.add('frame', S.extrude([[104, 118], [130, 118], [130, 125], [104, 125]], 1.2, { bevel: 0.4, x: x * (W / 2 + 0.5) }));   // 刻印の板
    for (const [u, v] of [[146, 146], [86, 146], [68, 132]]) B.add('black', S.put(new THREE.CylinderGeometry(3.4, 3.4, 1.6, 10).rotateZ(Math.PI / 2), u, v, x * (W / 2 + 0.6)));   // ピン
  }
  // 撃鉄（黒）：銃身の後ろから上へ、後ろへ反る。先にぎざぎざ
  B.add('black', S.extrude([[50, 170], [64, 173], [62, 183], [52, 195], [40, 203], [34, 199], [44, 187], [50, 177]], 8, { bevel: 1 }));
  for (let k = 0; k < 4; k++) B.add('dark', S.box(35 + k * 3.4, 37.4 + k * 3.4, 199.5 - k * 2.4, 204 - k * 2.4, 8.6));
  // 用心鉄・引き金（黒く曲がる）
  B.add('frame', S.extrude([[122, 114], [120, 96], [111, 82], [96, 74], [82, 74], [72, 82], [67, 96], [74, 98], [78, 87], [86, 81], [96, 81], [106, 87], [113, 98], [114, 114]], 9, { bevel: 1.5 }));
  B.add('black', S.extrude([[94, 113], [100, 113], [98, 99], [94, 88], [88, 80], [84, 82], [88, 92], [91, 104]], 6, { bevel: 0.8 }));
  // ---------- グリップ：後ろへ寝て、下で前へ巻く（鳥の頭）。下に紐の穴、両側に黒い握り板とねじ ----------
  const lan = Array.from({ length: 10 }, (_, i) => [4 + Math.cos(-i / 10 * Math.PI * 2) * 4.5, 13 + Math.sin(-i / 10 * Math.PI * 2) * 4.5] as [number, number]);
  B.add('frame', S.extrude([[74, 114], [66, 92], [54, 64], [40, 40], [32, 22], [28, 10], [20, 2], [6, 0], [-8, 4], [-14, 16], [-14, 34], [-10, 56], [-2, 82], [10, 108], [26, 132], [40, 150], [48, 158], [56, 150]], GW, { bevel: 4, holes: [lan] }));
  for (const x of [-1, 1]) {
    B.add('black', S.extrude([[64, 108], [54, 80], [42, 56], [32, 36], [22, 24], [12, 22], [0, 24], [-7, 34], [-4, 56], [5, 80], [17, 104], [32, 126], [48, 134]], 2.4, { bevel: 0.6, x: x * (GW / 2 + 0.4) }));
    B.add('metal', S.put(new THREE.CylinderGeometry(2.8, 2.8, 1.4, 8).rotateZ(Math.PI / 2), 22, 72, x * (GW / 2 + 1.6)));   // 握り板のねじ
  }
  const orange = new THREE.Color(P.daidai[1]).lerp(new THREE.Color(P.aka[1]), 0.35);
  paint(B, {
    frame: { c: orange.getHex() }, frameDark: { c: orange.clone().multiplyScalar(0.8).getHex() }, dark: { c: P.sumi[1] }, black: { c: P.sumi[0] },
    metal: { c: P.nezumi[2] }, bore: { c: P.sumi[0] },
  });
  return { g: B.root, muzzle: S.at(247, BV) };
}

// ---------- 救急キット：赤い樹脂のケース（面取りした箱・角のゴム・前の留め金2つ・上の取っ手・白い十字） ----------
//   幅 160・奥行き 56・高さ 92mm。図面は横から見た形（u = 手前→奥、v = 下→上）、x が幅。手前の面（u=0）が自分の方を向く
//   ふた（名前 'lid'）は奥の上の辺で開く。中に包帯・ガーゼ・注射器
export function buildMedkit() {
  const S = makeSpace(28, 46), B = new PartBuilder(S);
  const WD = 160, H0 = 60;                                   // 幅・ふたとの合わせ目の高さ
  const lid = B.part('lid', [56, H0]); lid.name = 'lid';
  // 下の箱（手前と奥の角を丸める）
  B.add('case', S.extrude([[0, 6], [5, 0], [51, 0], [56, 6], [56, H0], [0, H0]], WD, { bevel: 4 }));
  for (const v of [14, 46]) B.add('caseDark', S.box(-0.8, 0.6, v, v + 2.2, WD - 22));   // 手前の横の溝
  B.add('cross', S.box(-1.4, 0.4, 18, 42, 9)); B.add('cross', S.box(-1.4, 0.4, 25.5, 34.5, 24));   // 白い十字（手前）
  for (const x of [-1, 1]) for (const v of [0, 1]) B.add('rubber', S.extrude([[-1.5, v ? 44 : 2], [10, v ? 44 : 2], [10, v ? 58 : 16], [-1.5, v ? 58 : 16]], 14, { bevel: 2, x: x * (WD / 2 - 5) }));   // 角のゴム
  B.add('rim', S.box(-1, 57, H0 - 3, H0, WD + 2));             // 合わせ目の縁
  // 留め金：下の箱に付いた台と、ふたに掛かる爪
  for (const x of [-1, 1]) {
    B.add('detail', S.extrude([[-3, 46], [2, 46], [2, H0 - 1], [-3, H0 - 1]], 22, { bevel: 1, x: x * 46 }));
    B.add('detail', S.extrude([[-4, H0 - 2], [2, H0 - 2], [2, H0 + 9], [-2, H0 + 10]], 18, { bevel: 1, x: x * 46 }));
  }
  // ちょうつがい（奥の上、幅の向きの丸い棒）
  for (const x of [-52, 0, 52]) B.add('detail', S.put(new THREE.CylinderGeometry(4, 4, 30, 10).rotateZ(Math.PI / 2), 57, H0, x));
  // 中：浅い黒い内張りと中身（ふたを開けると見える）
  B.add('inner', S.box(5, 51, H0 - 0.5, H0 + 0.4, WD - 12));
  B.add('white', S.put(new THREE.CylinderGeometry(11, 11, 46, 12).rotateZ(Math.PI / 2), 22, H0 + 9, -44));   // 包帯の巻き
  B.add('inner', S.put(new THREE.CylinderGeometry(4, 4, 47, 8).rotateZ(Math.PI / 2), 22, H0 + 9, -44));
  B.add('white', S.box(10, 46, H0, H0 + 8, 40, 4));                // ガーゼの包み
  B.add('cross', S.box(20, 36, H0 + 8, H0 + 8.8, 10, 4));
  B.add('pen', S.put(new THREE.CylinderGeometry(7, 7, 56, 10).rotateZ(Math.PI / 2), 30, H0 + 7, 52));      // 注射器（自己注射の筒）
  B.add('cap', S.put(new THREE.CylinderGeometry(7.6, 7.6, 12, 10).rotateZ(Math.PI / 2), 30, H0 + 7, 24));
  B.add('detail', S.put(new THREE.CylinderGeometry(3, 3, 8, 8).rotateZ(Math.PI / 2), 30, H0 + 7, 82));
  // ふた：手前の角を丸めた浅い箱・上に取っ手・十字・内側は黒
  B.add('case', S.extrude([[0, H0], [56, H0], [56, H0 + 26], [51, H0 + 32], [5, H0 + 32], [0, H0 + 26]], WD, { bevel: 4 }), lid);
  B.add('inner', S.box(5, 51, H0 - 0.4, H0 + 0.2, WD - 12), lid);
  B.add('caseDark', S.box(-0.8, 0.6, H0 + 16, H0 + 18.2, WD - 22), lid);
  B.add('cross', S.box(17, 39, H0 + 32, H0 + 33.2, 8), lid); B.add('cross', S.box(24, 32, H0 + 32, H0 + 33.2, 22), lid);   // 上の十字
  for (const x of [-1, 1]) B.add('detail', S.extrude([[8, H0 + 31], [18, H0 + 31], [18, H0 + 38], [8, H0 + 38]], 8, { bevel: 1.5, x: x * 38 }), lid);   // 取っ手の足
  B.add('detail', S.extrude([[6, H0 + 37], [20, H0 + 37], [20, H0 + 44], [6, H0 + 44]], 84, { bevel: 2.5 }), lid);   // 取っ手
  paint(B, {
    case: { c: P.aka[1] }, caseDark: { c: P.aka[0] }, rim: { c: P.sumi[1] }, rubber: { c: P.nezumi[0] }, cross: { c: P.shiro[2] },
    detail: { c: P.sumi[1] }, inner: { c: P.sumi[0] }, white: { c: P.shiro[1] }, pen: { c: P.kin[1] }, cap: { c: P.daidai[2] },
  });
  return { g: B.root };
}
