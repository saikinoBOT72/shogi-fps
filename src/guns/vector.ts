// KRISS Vector（ストックを伸ばした形）見本
// 実銃の寸法：全長 620mm・銃身 140mm。上の長いレール、前に斜めに張り出した弾倉の入口（銃身より下へ反動を逃がす形）、骨組みのストック、前の覆いと太い消炎器
//
// 動く部品：handle（左前のコッキングハンドル）・trigger・mag・lhand（左手：前の覆いの下を握る）
// 動き　　：fire・reload（弾倉を落として入れる → 左前のハンドルを引く）・inspect・equip（ハンドルを引く）
import * as THREE from 'three';
import { Clip } from './anim';
import { PartBuilder, makeSpace } from './kit';
import { handMesh, makeGun } from './model';
import { inspectClip, handPath, magDrop, reloadTilt } from './std';

// 図面は写真（全長 880mm：サプレッサー込み）の座標そのまま。u=0 が床尾の後ろ、v=0 が弾倉の底
const S = makeSpace(400, 198);  // 原点：グリップの付け根
const PULL = 0.06;
const BV = 220;                 // 銃身（サプレッサー）の中心の高さ

export function buildVector(opt: { skin?: string; hand?: THREE.Material } = {}) {
  const B = new PartBuilder(S);
  const handle = B.part('handle', [532, 248]);
  const trigger = B.part('trigger', [306, 170]);
  const mag = B.part('mag', [404, 50]);
  const lhand = B.part('lhand', [532, 140]);

  const pin = (u: number, v: number, x: number, r = 3.5) => S.put(new THREE.CylinderGeometry(r, r, 2, 8).rotateZ(Math.PI / 2), u, v, x);
  const ribs = (u0: number, u1: number, v0: number, v1: number, w: number, slot = 'slide', to?: THREE.Object3D) => { for (let u = u0; u < u1; u += 10) B.add(slot, S.box(u, u + 5, v0, v1, w), to); };

  // ---------- 上の機関部（黒い箱）・上のレール・照準 ----------
  B.add('slide', S.extrude([[205, 240], [205, 264], [224, 274], [480, 274], [480, 226], [205, 230]], 36, { bevel: 2.5 }));
  B.add('slide', S.extrude([[212, 238], [212, 256], [476, 256], [476, 238]], 40, { bevel: 1.5 }));           // 横の段（ボルトの覆い）
  B.add('slide', S.extrude([[474, 226], [474, 274], [572, 274], [578, 268], [578, 202], [570, 194], [486, 194]], 42, { bevel: 4 }));   // 前のハンドガード
  B.add('slide', S.box(214, 572, 274, 279, 22));
  ribs(218, 568, 279, 282.5, 22);                                             // レールの山
  for (const x of [-1, 1]) for (const [u, v] of [[300, 264], [454, 264], [556, 250], [540, 210]]) B.add('detail', pin(u, v, x * (u > 476 ? 21.5 : 18.5)));
  B.add('bore', S.box(420, 466, 240, 254, 0.8, 20.2));                       // 排莢口（右）
    // 前の左右の短いレール
  B.add('slide', S.box(486, 572, 223, 237, 46));
  for (const x of [-1, 1]) for (let u = 490; u < 568; u += 10) B.add('slide', S.box(u, u + 5, 222, 238, 3, x * 23.5));
  // 下のレール（縦グリップを付ける）
  B.add('slide', S.box(492, 572, 182, 191, 22));
  ribs(496, 568, 179.5, 182, 22);
  // 跳ね上げ照門・照星（耳つき）
  B.add('detail', S.extrude([[274, 282], [298, 282], [296, 296], [292, 304], [280, 304], [276, 296]], 18, { bevel: 1 }));
  B.add('bore', S.rod(284, 288, 298, 2.4, 6));
  B.add('detail', S.box(530, 552, 282, 292, 18));
  for (const x of [-1, 1]) B.add('detail', S.extrude([[532, 290], [550, 290], [548, 312], [536, 312]], 2.4, { bevel: 0, x: x * 7.5 }));
  B.add('detail', S.box(540, 543, 290, 308, 2.4));
  // ---------- ドットサイト（台・前の本体・後ろのフード：窓は抜けている） ----------
  B.add('frame', S.box(336, 434, 281, 289, 24));
  B.add('slide', S.extrude([[386, 289], [386, 304], [392, 308], [430, 308], [434, 302], [434, 289]], 30, { bevel: 2 }));
  for (const x of [-1, 1]) B.add('slide', S.extrude([[336, 289], [336, 324], [342, 330], [386, 330], [386, 289]], 3.5, { bevel: 0.8, x: x * 13.5 }));
  B.add('slide', S.box(336, 386, 326, 331, 30));
  B.add('bore', S.box(386, 387, 292, 326, 24));                              // 奥の窓ガラス
  for (const u of [398, 414]) B.add('detail', S.box(u, u + 8, 308, 311, 10));   // ボタン

  // ---------- 下の機関部（明るい色の大きな塊：前が斜め・側面がへこみ、ふちが残る） ----------
  const LO: [number, number][] = [[330, 224], [472, 224], [482, 190], [424, 100], [362, 100], [340, 150]];
  const LI: [number, number][] = [[342, 216], [462, 216], [470, 190], [419, 108], [368, 108], [350, 152]];
  B.add('frame', S.extrude(LO, 38, { bevel: 2.5, holes: [LI] }));
  B.add('frame', S.extrude(LI, 31, { bevel: 1 }));                           // へこんだ面
  for (const x of [-1, 1]) {
    B.add('slideDark', S.box(436, 442, 132, 190, 0.6, x * 15.8));            // 縦の切れ込み
    for (const [u, v] of [[350, 206], [454, 206], [372, 114], [414, 114], [398, 160]]) B.add('detail', pin(u, v, x * 19.5, 3));
  }
  // 引き金の上の箱・用心鉄の下の棒（グリップの下から前の塊へ）
  B.add('slideDark', S.extrude([[246, 226], [342, 226], [342, 168], [290, 168], [288, 200], [246, 200]], 32, { bevel: 2 }));
  B.add('slideDark', S.extrude([[262, 118], [284, 124], [366, 106], [366, 98], [346, 96], [268, 110]], 26, { bevel: 2 }));
  B.add('detail', S.extrude([[302, 170], [309, 170], [311, 158], [314, 146], [310, 144], [306, 150], [303, 160]], 7, { bevel: 0.6 }), trigger);
  // グリップ（AR 型）・セレクター・弾倉を外すボタン
  B.add('grip', S.extrude([[226, 138], [234, 124], [266, 120], [282, 126], [292, 168], [290, 202], [248, 202], [232, 168]], 31, { bevel: 4 }));
  B.add('detail', S.box(256, 272, 210, 218, 3, -17));
  for (const x of [-1, 1]) B.add('detail', S.box(404, 414, 150, 162, 3, x * 19.5));

  // ---------- 縦グリップ（下のレールに付ける・横の溝） ----------
  B.add('slide', S.box(514, 550, 176, 182, 30));
  B.add('grip', S.put(new THREE.CylinderGeometry(15, 13, 76, 10), 532, 138));
  for (const v of [112, 124, 136, 148, 160]) B.add('slideDark', S.put(new THREE.CylinderGeometry(15.6, 15.6, 3, 10), 532, v));
  B.add('slide', S.put(new THREE.CylinderGeometry(14, 14, 6, 10), 532, 100));
  // ---------- 銃身・サプレッサー ----------
  B.add('barrel', S.rod(576, 600, BV, 9, 8));
  B.add('slide', S.rod(596, 880, BV, 19.5, 12));
  for (const u of [604, 862]) B.add('slideDark', S.rod(u, u + 4, BV, 20.2, 12));
  B.add('bore', S.rod(879.5, 881, BV, 5, 8));
  // ---------- 折りたたみストック（付け根・上の腕・四角い枠の床尾） ----------
  B.add('frame', S.box(192, 214, 224, 270, 32));                             // 付け根
  B.add('detail', pin(203, 247, 16.5, 5)); B.add('detail', pin(203, 247, -16.5, 5));
  B.add('slide', S.extrude([[90, 240], [90, 262], [198, 262], [198, 240]], 22, { bevel: 2.5 }));             // 上の腕（水平）
  B.add('slide', S.extrude([[34, 214], [40, 236], [96, 262], [102, 240]], 22, { bevel: 2.5 }));              // 床尾へ下がる所
  for (const x of [-1, 1]) for (const a of [108, 152]) B.add('slideDark', S.box(a, a + 36, 246, 256, 0.6, x * 11.2));   // 肉抜き
  B.add('slideDark', S.extrude([[0, 104], [0, 232], [6, 238], [18, 238], [18, 104]], 40, { bevel: 3 }));   // 床尾の当て
  for (let v = 112; v < 232; v += 10) B.add('slideDark', S.box(-2, 2, v, v + 4, 41));
  B.add('slide', S.box(14, 58, 100, 114, 28));                               // 下の横棒
  B.add('slide', S.extrude([[42, 112], [56, 112], [58, 222], [42, 228]], 22, { bevel: 2 }));   // 前の柱
  // ---------- 弾倉（まっすぐ下へ） ----------
  B.add('mag', S.extrude([[360, 8], [402, 8], [402, 100], [360, 100]], 24, { bevel: 1.2 }), mag);
  B.add('mag', S.extrude([[356, 0], [406, 0], [406, 8], [356, 8]], 30, { bevel: 1.5 }), mag);
  // ---------- コッキングハンドル（左前） ----------
  B.add('detail', S.box(520, 546, 244, 258, 12, -24), handle);

  if (opt.hand) {
    const rh = handMesh(opt.hand, 0.75, 0.95, 0.85); rh.position.copy(S.at(258, 160, 44)); B.root.add(rh);
    const lh = handMesh(opt.hand, 0.8, 0.8, 0.95); lh.position.set(-0.04, -0.01, 0); lhand.add(lh);
  }
  const muzzle = new THREE.Object3D(); muzzle.position.copy(S.at(882, BV));
  const eject = new THREE.Object3D(); eject.position.copy(S.at(444, 247, 24)); B.root.add(eject);

  const toMag = { y: -0.12, z: 0.13 }, toHandle = { x: 0.01, y: 0.06, z: 0.066 };
  const clips: Record<string, Clip> = {
    fire: {
      dur: 0.06, events: [[0.01, 'eject']],
      tracks: [['trigger', 'rx', [[0, 0], [0.008, -0.25], [0.045, -0.25], [0.06, 0]]], ['root', 'rx', [[0, 0], [0.01, 0.015], [0.06, 0]]]],
    },
    reload: {
      dur: 1, events: [[0.3, 'magOut'], [0.56, 'magIn'], [0.8, 'rack']],
      tracks: [
        ...reloadTilt(0.1, 0.88, 0.35, 0.1, 0.04),
        ...magDrop(0.3, 0.56, 0.3),
        ['handle', 'pz', [[0, 0], [0.72, 0], [0.78, PULL], [0.8, PULL], [0.82, 0]], 'lin'],
        ...handPath([[0, {}], [0.2, toMag], [0.3, { ...toMag, y: toMag.y - 0.22 }], [0.36, { ...toMag, y: toMag.y - 0.22 }], [0.56, toMag], [0.62, toMag], [0.7, toHandle], [0.78, { ...toHandle, z: toHandle.z + PULL }], [0.84, toHandle], [0.94, {}]]),
      ],
    },
    inspect: inspectClip(0.6),
    equip: {
      dur: 0.7,
      tracks: [
        ['root', 'rz', [[0, 0.3], [0.35, 0.15], [0.6, 0]]],
        ['handle', 'pz', [[0, 0], [0.3, 0], [0.38, PULL], [0.44, 0]], 'lin'],
        ...handPath([[0, {}], [0.2, toHandle], [0.3, toHandle], [0.38, { ...toHandle, z: toHandle.z + PULL }], [0.46, toHandle], [0.62, {}]]),
      ],
    },
  };
  return makeGun({
    B, clips, muzzle, eject, skin: opt.skin || 'kurogane',
    info: { name: 'KRISS Vector', real: '全長 620mm・銃身 140mm（サプレッサー付きで約 880mm）', reload: 1.8 },
    vm: { scale: 1, hip: new THREE.Vector3(), ads: new THREE.Vector3(), size: 0.66 },
  });
}
