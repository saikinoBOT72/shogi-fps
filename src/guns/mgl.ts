// ミルコー MGL（6連発のグレネードランチャー）見本
// 実銃の寸法：全長 778mm（ストックを伸ばして）・銃身 300mm。大きな6連のシリンダー、前の四角いレールの覆い、前の縦グリップ、M4 型の伸縮ストック（太い緩衝管でつなぐ）。撃つたびにシリンダーが 1/6 回る
//
// 動く部品：crane（シリンダーと銃身：左へ振り出す）・cylinder（撃つたびに回る）・shells（中の6発の底）・trigger・lhand（左手：前の縦グリップ）
// 動き　　：fire（シリンダーが回る・大きく跳ねる）・reload（振り出す → 6発を抜く → 入れる → 戻す）・inspect・equip
import * as THREE from 'three';
import { Clip } from './anim';
import { PartBuilder, makeSpace } from './kit';
import { handMesh, makeGun } from './model';
import { inspectClip, handPath } from './std';

const S = makeSpace(200, 112);  // 原点：グリップの付け根
const CU0 = 304, CU1 = 440, CV = 127, CR = 76;   // シリンダー
const BV = CV + 44;             // 銃身の高さ（上の穴にそろえる）
const STEP = Math.PI / 3;
const SWING = 1.4;

export function buildMGL(opt: { skin?: string; hand?: THREE.Material } = {}) {
  const B = new PartBuilder(S);
  const crane = B.part('crane', [CU1, CV - 70], B.root, -30);
  const cylinder = B.part('cylinder', [(CU0 + CU1) / 2, CV], crane);
  const shells = B.part('shells', [CU0, CV], cylinder);
  const trigger = B.part('trigger', [259, 128]);
  const lhand = B.part('lhand', [600, 90], crane);

  const ribs = (u0: number, u1: number, v0: number, v1: number, w: number, to?: THREE.Object3D, x = 0) => { for (let u = u0; u < u1; u += 10) B.add('frame', S.box(u, u + 5, v0, v1, w, x), to); };
  const pin = (u: number, v: number, x: number, r = 4) => S.put(new THREE.CylinderGeometry(r, r, 2, 8).rotateZ(Math.PI / 2), u, v, x);

  // ---------- 伸縮ストック（M4 型：上の丸い筒が緩衝管を包み、下へ床尾が下がる） ----------
  B.add('frame', S.rod(30, 250, 200, 15, 12));                                   // 緩衝管（太い）
  B.add('frame', S.rod(40, 128, 200, 20, 12));                                   // ストックの筒（管を包む）
  B.add('frame', S.extrude([[8, 210], [34, 214], [124, 206], [124, 186], [34, 106], [8, 100]], 36, { bevel: 3, taper: [0.8, 1] }));
  for (const x of [-1, 1]) for (const v of [150, 168]) B.add('slideDark', S.extrude([[40, v], [104, v + 22], [104, v + 28], [40, v + 6]], 0.6, { bevel: 0, x: x * 16.6 }));   // 横の肉抜き
  B.add('slideDark', S.extrude([[0, 98], [0, 212], [6, 218], [12, 218], [12, 98]], 42, { bevel: 3 }));   // 床尾の当て
  for (let v = 106; v < 212; v += 9) B.add('slideDark', S.box(-1.5, 1.5, v, v + 4, 43));
  B.add('frame', S.box(92, 122, 174, 181, 10));                                  // 伸縮のレバー
  B.add('detail', S.put(new THREE.TorusGeometry(6, 2, 5, 10), 22, 104, 0, [0, Math.PI / 2, 0]));   // 負い紐の輪
  B.add('frame', S.rod(160, 176, 200, 19, 10));                                  // 留めナット
  // ---------- 後ろの枠（緩衝管と上の帯の両方を受ける斜めの板）・上の帯 ----------
  B.add('frame', S.extrude([[176, 112], [178, 216], [250, 238], [306, 244], [306, 130], [230, 130], [212, 112]], 44, { bevel: 3 }));
  for (const x of [-1, 1]) for (const [u, v] of [[196, 150], [262, 160], [286, 220], [200, 200]]) B.add('detail', pin(u, v, x * 22.5));
  B.add('detail', S.put(new THREE.TorusGeometry(7, 2.2, 5, 10), 214, 236, -16, [0, Math.PI / 2, 0]));   // 上の負い紐の輪
  B.add('frame', S.rod(250, 446, 228, 10, 10));                                   // 上の帯（後ろの枠から前の板へ）
  B.add('frame', S.box(330, 420, 236, 242, 18));                                  // 上のレール
  ribs(334, 416, 242, 245, 18);
  // ---------- グリップ・細い用心鉄・引き金 ----------
  B.add('grip', S.extrude([[118, 32], [122, 24], [170, 14], [180, 22], [226, 108], [222, 118], [176, 118], [126, 46]], 30, { bevel: 4 }));
  B.add('detail', S.extrude([[226, 130], [226, 86], [298, 86], [302, 130]], 6, { bevel: 0.8, holes: [[[231, 128], [231, 91], [293, 91], [297, 128]]] }));
  B.add('detail', S.extrude([[256, 128], [262, 128], [263, 116], [266, 104], [262, 102], [258, 108], [256, 118]], 7, { bevel: 0.6 }), trigger);
  // ---------- 振り出す部分：前の板・シリンダーの軸・ハンドガード（上下のレール・穴の開いた横板）・銃身・縦グリップ ----------
  B.add('frame', S.box(296, 306, 50, 204, 66), crane);                             // 後ろの板
  B.add('frame', S.rod(440, 482, CV, 80, 16), crane);                            // 前の丸い板
  B.add('frame', S.extrude([[440, 180], [440, 238], [452, 250], [474, 250], [482, 238], [482, 180]], 36, { bevel: 3 }), crane);   // 上の帯を受ける所
  B.add('frame', S.rod(CU0, CU1, CV, 12, 8), crane);                             // シリンダーの軸
  B.add('slide', S.rod(484, 772, BV, 26, 12), crane);                            // 銃身（中が見える）
  B.add('bore', S.rod(771.5, 773, BV, 21, 12), crane);
  B.add('frame', S.rod(484, 496, BV, 32, 12), crane);                            // ハンドガードの後ろの輪
  B.add('frame', S.rod(676, 688, BV, 32, 12), crane);                            // 前の輪
  B.add('frame', S.box(488, 684, 220, 228, 26), crane);                          // 上のレール
  ribs(492, 680, 228, 231, 26, crane);
  B.add('frame', S.box(488, 684, 114, 122, 26), crane);                          // 下のレール
  ribs(492, 680, 111, 114, 26, crane);
  const SLOTS = (v0: number, v1: number) => Array.from({ length: 7 }, (_, i) => { const u = 504 + i * 25; return [[u, v0], [u + 16, v0], [u + 16, v1], [u, v1]] as [number, number][]; });
  for (const x of [-1, 1]) {
    B.add('frame', S.extrude([[488, 118], [488, 224], [684, 224], [684, 118]], 4, { bevel: 0.6, x: x * 24, holes: [...SLOTS(186, 208), ...SLOTS(136, 158)] }), crane);   // 横板（穴は本当に抜けている）
    B.add('frame', S.box(600, 676, 166, 176, 4, x * 27), crane);                 // 横の短いレール
    ribs(604, 672, 164, 178, 3, crane, x * 29.5);
  }
  B.add('grip', S.extrude([[582, 114], [582, 10], [587, 0], [613, 0], [618, 10], [618, 114]], 30, { bevel: 4 }), crane);   // 縦グリップ
  for (let v = 16; v < 104; v += 12) B.add('slideDark', S.box(581, 619, v, v + 4, 31), crane);
  B.add('detail', S.extrude([[650, 231], [664, 231], [662, 246], [652, 246]], 6, { bevel: 0.6 }), crane);   // 照星
  // ---------- シリンダー（6つの膨らみ・前の穴） ----------
  B.add('slide', S.rod(CU0, CU1, CV, 50, 12), cylinder);
  for (let i = 0; i < 6; i++) {
    const a = i * STEP + Math.PI / 2, x = Math.cos(a) * 44, v = CV + Math.sin(a) * 44;
    B.add('slide', S.rod(CU0 + 4, CU1 - 4, v, 30, 12, x), cylinder);
    B.add('bore', S.rod(CU1 - 4.5, CU1 - 3.4, v, 20, 10, x), cylinder);
  }
  for (let i = 0; i < 6; i++) { const a = i * STEP + Math.PI / 2; B.add('mag', S.rod(CU0 - 6, CU0 + 2, CV + Math.sin(a) * 44, 21, 10, Math.cos(a) * 44), shells); }   // 弾の底

  if (opt.hand) {
    const rh = handMesh(opt.hand, 0.75, 0.95, 0.85); rh.position.copy(S.at(172, 70, 42)); B.root.add(rh);
    const lh = handMesh(opt.hand, 0.85, 0.95, 0.85); lh.position.set(-0.04, 0, 0); lhand.add(lh);
  }
  const muzzle = new THREE.Object3D(); muzzle.position.copy(S.at(772, BV));
  const eject = new THREE.Object3D(); eject.position.copy(S.at(CU0 - 20, CV, -40)); B.root.add(eject);

  const clips: Record<string, Clip> = {
    fire: {
      dur: 0.5,
      tracks: [
        ['trigger', 'rx', [[0, 0], [0.01, -0.3], [0.2, -0.3], [0.3, 0]]],
        ['cylinder', 'rz', [[0, 0], [0.12, 0], [0.3, STEP]]],
        ['root', 'rx', [[0, 0], [0.02, 0.2], [0.5, 0]]],
        ['root', 'pz', [[0, 0], [0.02, 0.05], [0.4, 0]]],
      ],
    },
    reload: {
      dur: 1, events: [[0.28, 'eject'], [0.29, 'eject'], [0.3, 'eject'], [0.62, 'insert'], [0.84, 'close']],
      tracks: [
        ['root', 'rz', [[0, 0], [0.1, 0.5], [0.86, 0.5], [1, 0]]],
        ['root', 'rx', [[0, 0], [0.1, 0.1], [0.24, 0.1], [0.3, 0.55], [0.36, 0.1], [0.86, 0.1], [1, 0]]],
        ['root', 'py', [[0, 0], [0.1, 0.05], [0.86, 0.05], [1, 0]]],
        ['crane', 'rz', [[0, 0], [0.1, 0], [0.2, SWING], [0.78, SWING], [0.86, 0]], 'out'],
        ['shells', 'pz', [[0, 0], [0.24, 0], [0.3, 0.1], [0.44, 0.1], [0.62, 0]]],
        ['shells', 'vis', [[0, 1], [0.3, 1], [0.301, 0], [0.44, 0], [0.441, 1]]],
        ...handPath([[0, {}], [0.3, {}], [0.44, { y: 0.02, z: 0.4 }], [0.62, { y: 0.02, z: 0.33 }], [0.72, {}]]),
      ],
    },
    inspect: inspectClip(0.8),
    equip: { dur: 0.7, tracks: [['root', 'rz', [[0, 0.3], [0.35, 0.15], [0.6, 0]]], ['cylinder', 'rz', [[0, 0], [0.3, 0], [0.45, STEP]]]] },
  };
  return makeGun({
    B, clips, muzzle, eject, skin: opt.skin || 'kurogane',
    info: { name: 'MGL', real: '全長 778mm・銃身 300mm（40mm・6連のシリンダー）', reload: 3.2 },
    vm: { scale: 1, hip: new THREE.Vector3(), ads: new THREE.Vector3() },
  });
}
