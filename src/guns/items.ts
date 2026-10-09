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

// ---------- フレアガン：12番の信号拳銃（中折れ式・太い銃身・外に出た撃鉄・大きな樹脂のグリップ） ----------
//   全長 230mm・銃身の外径 32mm。原点はグリップの付け根。名前 'flash' の板が銃口の光
export function buildFlareGun() {
  const S = makeSpace(40, 98), B = new PartBuilder(S);
  const BV = 126, W = 28;                                   // 銃身の中心の高さ・機関部の幅
  const gf = (v: number) => 46 + (v - 10) * 0.32, gb = (v: number) => -14 + (v - 10) * 0.46;   // グリップの前・後ろの線（後ろへ寝る）
  // 銃身：太い筒。付け根の太い輪・真ん中の2本の帯・銃口のふくらみ
  B.add('barrel', S.rod(66, 222, BV, 16, 14));
  B.add('frame', S.rod(64, 84, BV, 18, 14));                // 付け根（機関部とつながる太い輪）
  for (const u of [140, 172]) B.add('band', S.rod(u, u + 6, BV, 16.8, 14));   // 帯（白）
  B.add('frame', S.rod(208, 224, BV, 17.5, 14));            // 銃口のふくらみ
  B.add('bore', S.rod(223.6, 224.6, BV, 12.5, 14));         // 銃口の穴
  B.add('frame', S.box(90, 206, BV + 15, BV + 19, 6));      // 上の細い背（照準の線）
  B.add('detail', S.extrude([[200, BV + 18], [208, BV + 18], [207, BV + 25], [202, BV + 25]], 4, { bevel: 0.6 }));   // 照星
  B.add('frame', S.extrude([[84, BV - 14], [84, BV - 20], [150, BV - 20], [158, BV - 15]], 14, { bevel: 2 }));      // 銃身の下のあご
  // 機関部：銃身の後ろの箱。前の下にちょうつがい、上に折るための留め金
  B.add('frame', S.extrude([[14, 104], [12, 134], [20, 146], [68, 146], [72, 140], [72, 108], [62, 100], [20, 100]], W, { bevel: 2.5 }));
  for (const x of [-1, 1]) B.add('detail', S.put(new THREE.CylinderGeometry(4.5, 4.5, 3, 10).rotateZ(Math.PI / 2), 64, 108, x * (W / 2 + 1)));   // ちょうつがいのピン
  for (const x of [-1, 1]) B.add('frameDark', S.extrude([[24, 112], [58, 112], [58, 136], [24, 136]], 1.2, { bevel: 0.4, x: x * (W / 2 + 0.2) }));   // 横のくぼんだ板
  B.add('detail', S.extrude([[30, 146], [52, 146], [56, 151], [32, 154]], 12, { bevel: 1 }));   // 留め金（上から押して折る）
  for (let u = 34; u <= 50; u += 4) B.add('frameDark', S.box(u, u + 1.5, 151, 154.5, 12.6));   // 留め金の滑り止め
  // 撃鉄：後ろへ大きく出る。上にぎざぎざ
  B.add('detail', S.extrude([[10, 128], [18, 130], [20, 148], [12, 158], [2, 160], [0, 154], [8, 146]], 8, { bevel: 1 }));
  for (let k = 0; k < 4; k++) B.add('frameDark', S.box(1 + k * 3, 3 + k * 3, 156 - k * 1.2, 160.5 - k * 1.2, 8.6));
  // 用心鉄：大きな丸みのある輪（手袋でも入る）
  B.add('frame', S.extrude([[60, 102], [62, 78], [70, 68], [108, 68], [116, 76], [118, 108], [110, 108], [108, 82], [104, 76], [74, 76], [68, 82], [68, 102]], 9, { bevel: 1.2 }));
  B.add('detail', S.extrude([[78, 100], [84, 100], [86, 90], [88, 80], [84, 78], [80, 84], [78, 92]], 6, { bevel: 0.6 }));   // 引き金
  // グリップ：太い樹脂。側面に縦の溝の板、底に負い紐の輪
  B.add('grip', S.extrude([[gb(10), 10], [gb(4) + 4, 4], [gf(4) - 2, 4], [gf(10), 10], [gf(100), 100], [16, 104], [gb(96), 96]], W + 2, { bevel: 4 }));
  for (const x of [-1, 1]) {
    B.add('frameDark', S.extrude([[gb(20) + 7, 20], [gf(20) - 7, 20], [gf(86) - 7, 86], [gb(86) + 7, 86]], 1.2, { bevel: 0.4, x: x * (W / 2 + 1.4) }));
    for (let v = 26; v <= 80; v += 7) B.add('grip', S.box(gb(v) + 9, gf(v) - 9, v, v + 3, 1.4, x * (W / 2 + 2)));   // 横の溝
  }
  B.add('detail', S.put(new THREE.TorusGeometry(6, 1.6, 5, 12), gb(6) + 10, 0, 0, [0, Math.PI / 2, 0]));   // 負い紐の輪
  paint(B, {
    frame: { c: P.daidai[1] }, barrel: { c: P.daidai[1] }, grip: { c: P.daidai[0] }, frameDark: { c: P.daidai[0] },
    band: { c: P.shiro[2] }, detail: { c: P.sumi[1] }, bore: { c: P.sumi[0] },
  });
  return { g: B.root, muzzle: S.at(225, BV) };
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
