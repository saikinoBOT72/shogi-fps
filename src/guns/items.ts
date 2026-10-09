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

// ---------- フレアガン：12番の信号拳銃（オリン型。中折れ式・太い銃身・鳥の頭のように曲がったグリップに黒い握り板・黒い撃鉄と引き金） ----------
//   全長 255mm・銃身の外径 40mm（太く短い）。原点はグリップの付け根。橙の樹脂の一体成形（つなぎ目が少ない）
export function buildFlareGun() {
  const S = makeSpace(60, 110), B = new PartBuilder(S);
  const BV = 182, W = 26, GW = 30;                          // 銃身の中心の高さ・機関部の幅・グリップの幅
  // 銃身：太い筒。上に細い背、銃口は少しふくらむ
  B.add('frame', S.rod(136, 240, BV, 20, 18));
  B.add('frame', S.rod(234, 241, BV, 20.8, 18));            // 銃口の縁
  B.add('bore', S.rod(240.6, 241.6, BV, 13.5, 18));         // 銃口の穴
  B.add('frame', S.box(142, 233, BV + 18, BV + 21.5, 9));   // 上の背
  B.add('dark', S.rod(137, 139, BV, 20.3, 18));             // 中折れのつなぎ目
  // 機関部：銃身の後ろ。上は銃身より低く、後ろの撃鉄へ下がる。前の下は銃身の下へあごのように伸びる
  B.add('frame', S.extrude([[64, 116], [68, 160], [78, 172], [92, 180], [140, 180], [140, 166], [168, 166], [173, 159], [166, 150], [152, 144], [148, 124], [140, 114], [90, 112]], W, { bevel: 2.5 }));
  for (const x of [-1, 1]) {
    B.add('frame', S.extrude([[110, 126], [134, 126], [138, 133], [134, 140], [110, 140], [106, 133]], 1.6, { bevel: 0.5, x: x * (W / 2 + 0.6) }));   // 横の刻印の台
    for (const [u, v] of [[140, 168], [96, 124], [122, 152]]) B.add('pin', S.put(new THREE.CylinderGeometry(3.2, 3.2, 1.6, 10).rotateZ(Math.PI / 2), u, v, x * (W / 2 + 0.6)));   // ピン
  }
  // 撃鉄（黒）：機関部の後ろの上から後ろへ反る。上にぎざぎざ
  B.add('black', S.extrude([[66, 158], [76, 164], [74, 172], [66, 180], [56, 184], [52, 179], [60, 170]], 9, { bevel: 1 }));
  for (let k = 0; k < 4; k++) B.add('dark', S.box(53 + k * 3.2, 55 + k * 3.2, 181 - k * 1.4, 185.4 - k * 1.4, 9.6));
  // 用心鉄：前が機関部から下へ丸く回り、後ろはグリップの前に付く
  B.add('frame', S.extrude([[134, 114], [133, 95], [126, 78], [112, 66], [96, 62], [82, 66], [73, 78], [70, 94], [78, 98], [80, 84], [87, 74], [97, 70], [109, 73], [119, 83], [125, 97], [126, 114]], 9, { bevel: 1.5 }));
  B.add('black', S.extrude([[98, 113], [104, 113], [102, 99], [98, 87], [91, 78], [87, 80], [91, 90], [95, 102]], 6, { bevel: 0.8 }));   // 引き金（黒・曲がる）
  // グリップ：後ろへ大きく寝て、下で前へ巻く（鳥の頭）。両側に黒い握り板とねじ
  B.add('frame', S.extrude([[76, 116], [72, 94], [60, 64], [46, 40], [36, 22], [30, 10], [22, 2], [8, 0], [-6, 4], [-12, 16], [-12, 34], [-8, 56], [0, 82], [12, 108], [28, 134], [44, 152], [62, 164]], GW, { bevel: 4 }));
  for (const x of [-1, 1]) {
    B.add('black', S.extrude([[66, 108], [56, 80], [44, 56], [34, 36], [24, 20], [12, 11], [0, 12], [-5, 28], [-2, 52], [7, 78], [19, 102], [34, 124], [52, 132]], 2.4, { bevel: 0.6, x: x * (GW / 2 + 0.4) }));
    B.add('pin', S.put(new THREE.CylinderGeometry(2.6, 2.6, 1.4, 8).rotateZ(Math.PI / 2), 6, 38, x * (GW / 2 + 1.6)));   // 握り板のねじ
  }
  const orange = new THREE.Color(P.daidai[1]).lerp(new THREE.Color(P.aka[1]), 0.35).getHex();
  paint(B, { frame: { c: orange }, dark: { c: P.sumi[1] }, black: { c: P.sumi[0] }, pin: { c: P.nezumi[1] }, bore: { c: P.sumi[0] } });
  return { g: B.root, muzzle: S.at(242, BV) };
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
