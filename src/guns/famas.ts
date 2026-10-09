// FAMAS F1 見本
// 実銃の寸法：全長 757mm・銃身 488mm。ブルパップ（弾倉はグリップより後ろ）、上の長いキャリングハンドル（中に照準）、その下のコッキングハンドル、手全体を囲む用心鉄、前の樹脂のハンドガード
//
// 動く部品：chandle（キャリングハンドルの下のコッキングハンドル）・trigger・mag・lhand（左手：ハンドガード）
// 動き　　：fire・reload（後ろの弾倉を落として入れる → ハンドルを引く）・inspect・equip
import * as THREE from 'three';
import { Clip } from './anim';
import { PartBuilder, makeSpace } from './kit';
import { handMesh, makeGun } from './model';
import { inspectClip, handPath, magDrop, reloadTilt } from './std';

const S = makeSpace(330, 92);   // 原点：グリップの付け根
const PULL = 0.07;
const BW = 44;                  // 本体の幅

export function buildFAMAS(opt: { skin?: string; hand?: THREE.Material } = {}) {
  const B = new PartBuilder(S);
  const chandle = B.part('chandle', [440, 168]);
  const trigger = B.part('trigger', [392, 89]);
  const mag = B.part('mag', [196, 20]);
  const lhand = B.part('lhand', [520, 85]);

  const pin = (u: number, v: number, w: number, r = 6) => S.put(new THREE.CylinderGeometry(r, r, w, 10).rotateZ(Math.PI / 2), u, v);
  // ---------- 肩当て（大きな箱。後ろにゴムの当て、横にふちの残るへこみ） ----------
  const BUTT: [number, number][] = [[0, 50], [0, 170], [6, 174], [96, 174], [104, 165], [104, 57]];
  const BUTT_IN: [number, number][] = [[14, 64], [14, 160], [90, 160], [92, 66]];
  B.add('frame', S.extrude(BUTT, BW + 4, { bevel: 5, holes: [BUTT_IN] }));
  B.add('frame', S.extrude(BUTT_IN, BW - 6, { bevel: 2 }));
  B.add('slideDark', S.extrude([[-8, 52], [-8, 168], [-2, 174], [2, 174], [2, 52]], BW + 6, { bevel: 3 }));   // 床尾のゴム
  for (let v = 60; v < 168; v += 9) B.add('slideDark', S.box(-9.5, -6.5, v, v + 4, BW + 7));
  // ---------- 後ろの胴（弾倉の入口・下すぼまり）・下の曲がった連結部・前の胴とハンドガード ----------
  B.add('frame', S.extrude([[100, 57], [100, 154], [302, 154], [302, 93], [226, 83], [168, 83], [140, 76]], BW, { bevel: 5, taper: [0.8, 1] }));
  B.add('frame', S.extrude([[224, 84], [228, 62], [238, 46], [250, 50], [262, 76], [284, 92], [302, 94]], BW - 14, { bevel: 3 }));
  B.add('frame', S.extrude([[298, 93], [298, 154], [604, 154], [610, 150], [612, 120], [604, 93]], BW, { bevel: 5, taper: [0.84, 1] }));
  B.add('frame', S.extrude([[110, 126], [110, 136], [600, 136], [600, 126]], BW + 3, { bevel: 1.5 }));   // 横の段（上の覆いと下の胴の境目）
  B.add('slide', S.extrude([[136, 136], [136, 155], [142, 160], [262, 160], [262, 136]], BW + 6, { bevel: 3 }));   // 頬当て（後ろの胴の上）
  for (const [u, v] of [[180, 96], [232, 100]]) B.add('detail', pin(u, v, BW + 4));   // 留めピン
  for (const x of [-1, 1]) {
    B.add('bore', S.box(272, 300, 138, 150, 0.8, x * (BW / 2 + 0.3)));      // 排莢口（左右とも）
    B.add('slideDark', S.box(270, 302, 150, 152, 1.2, x * (BW / 2 + 0.6)));
  }
  for (let u = 470; u < 596; u += 22) B.add('slideDark', S.box(u, u + 9, 90, 97, BW - 4));   // ハンドガードの下の波（指を掛ける凹み）
  for (const x of [-1, 1]) for (let u = 452; u < 596; u += 12) B.add('slideDark', S.box(u, u + 5, 100, 122, 0.6, x * (BW / 2 - 2.6)));   // ハンドガードの縦の溝
  // ---------- 畳んだ二脚（取っ手の下、胴の上の左右に沿う脚） ----------
  B.add('frame', S.box(588, 606, 150, 166, BW + 4));                          // 付け根
  for (const x of [-1, 1]) {
    B.add('slide', S.rod(330, 600, 160, 3.5, 6, x * 17));
    B.add('slideDark', S.put(new THREE.BoxGeometry(10, 8, 14), 330, 160, x * 17));   // 足先
  }
  // 銃身・前の留め・消炎器（擲弾を掛ける輪つき）
  B.add('slide', S.rod(604, 740, 126, 7, 8));
  B.add('frame', S.rod(610, 626, 126, 14, 8));
  B.add('slide', S.rod(712, 758, 126, 10.5, 8));
  for (const u of [714, 726]) B.add('frame', S.rod(u, u + 5, 126, 13, 8));
  for (const x of [-1, 1]) B.add('bore', S.box(732, 752, 122, 130, 0.8, x * 10.1));
  B.add('bore', S.rod(757.5, 758.6, 126, 5.5, 8));
  // ---------- キャリングハンドル（前寄りの高い取っ手。中に照門・照星） ----------
  B.add('frame', S.extrude([[262, 154], [284, 222], [296, 226], [590, 217], [606, 212], [612, 200], [612, 154]], 30, {
    bevel: 5, holes: [[[310, 158], [312, 198], [576, 196], [584, 189], [584, 158]]],
  }));
  B.add('detail', S.extrude([[494, 154], [512, 154], [510, 172], [496, 172]], 12, { bevel: 1 }));   // 照門
  B.add('detail', S.extrude([[572, 196], [584, 196], [582, 184], [574, 184]], 6, { bevel: 0.8 }));  // 照星
  for (const x of [-1, 1]) B.add('frame', S.box(566, 590, 182, 198, 3, x * 8));   // 照星の耳
  // ---------- グリップ・細い用心鉄・引き金・セレクター ----------
  B.add('grip', S.extrude([[302, 92], [365, 92], [352, 40], [339, -6], [330, -13], [312, -13], [302, -6], [300, 12], [305, 62]], 30, { bevel: 5 }));
  B.add('detail', S.extrude([[358, 91], [360, 58], [366, 52], [416, 52], [423, 60], [423, 91]], 8, {
    bevel: 1, holes: [[[362, 90], [364, 61], [369, 56], [413, 56], [419, 63], [419, 90]]],
  }));
  B.add('detail', S.extrude([[388, 90], [395, 90], [396, 82], [399, 74], [395, 72], [391, 77], [389, 83]], 7, { bevel: 0.6 }), trigger);
  B.add('detail', S.put(new THREE.CylinderGeometry(6, 6, 4, 8), 410, 82, 0));   // セレクター（引き金の後ろの丸いつまみ）
  // ---------- 弾倉（25連・グリップの後ろ。横に筋） ----------
  B.add('mag', S.extrude([[170, 84], [224, 84], [222, -33], [170, -44]], 24, { bevel: 1.5 }), mag);
  for (const u of [184, 204]) B.add('mag', S.extrude([[u, 80], [u + 6, 80], [u + 6, -34 + (u - 170) * 0.2], [u, -36 + (u - 170) * 0.2]], 26, { bevel: 0.6 }), mag);
  // ---------- コッキングハンドル（取っ手の中の、上へ曲がった鉤） ----------
  B.add('detail', S.extrude([[430, 154], [448, 154], [448, 172], [442, 186], [434, 186], [436, 174], [430, 170]], 12, { bevel: 1.5 }), chandle);

  if (opt.hand) {
    const rh = handMesh(opt.hand, 0.75, 0.95, 0.85); rh.position.copy(S.at(326, 40, 42)); B.root.add(rh);
    const lh = handMesh(opt.hand, 0.8, 0.8, 0.95); lh.position.set(-0.045, -0.005, 0); lhand.add(lh);
  }
  const muzzle = new THREE.Object3D(); muzzle.position.copy(S.at(760, 126));
  const eject = new THREE.Object3D(); eject.position.copy(S.at(260, 140, BW / 2 + 2)); B.root.add(eject);

  const toMag = { y: -0.1, z: 0.33 }, toCh = { x: 0.02, y: 0.1, z: 0.17 };
  const clips: Record<string, Clip> = {
    fire: {
      dur: 0.07, events: [[0.012, 'eject']],
      tracks: [['trigger', 'rx', [[0, 0], [0.008, -0.25], [0.05, -0.25], [0.07, 0]]], ['root', 'rx', [[0, 0], [0.01, 0.02], [0.07, 0]]]],
    },
    reload: {
      dur: 1, events: [[0.3, 'magOut'], [0.56, 'magIn'], [0.8, 'rack']],
      tracks: [
        ...reloadTilt(0.1, 0.88, 0.45, 0.05, 0.05),
        ...magDrop(0.3, 0.56, 0.28),
        ['chandle', 'pz', [[0, 0], [0.72, 0], [0.78, PULL], [0.8, PULL], [0.82, 0]], 'lin'],
        ...handPath([[0, {}], [0.2, toMag], [0.3, { ...toMag, y: toMag.y - 0.22 }], [0.36, { ...toMag, y: toMag.y - 0.22 }], [0.56, toMag], [0.62, toMag], [0.7, toCh], [0.78, { ...toCh, z: toCh.z + PULL }], [0.84, toCh], [0.94, {}]]),
      ],
    },
    inspect: inspectClip(0.8),
    equip: {
      dur: 0.7,
      tracks: [
        ['root', 'rz', [[0, 0.3], [0.35, 0.15], [0.6, 0]]],
        ['chandle', 'pz', [[0, 0], [0.3, 0], [0.38, PULL], [0.44, 0]], 'lin'],
        ...handPath([[0, {}], [0.2, toCh], [0.3, toCh], [0.38, { ...toCh, z: toCh.z + PULL }], [0.46, toCh], [0.62, {}]]),
      ],
    },
  };
  return makeGun({
    B, clips, muzzle, eject, skin: opt.skin || 'kurogane',
    info: { name: 'FAMAS F1', real: '全長 757mm・銃身 488mm（ブルパップ）', reload: 2.1 },
    vm: { scale: 1, hip: new THREE.Vector3(), ads: new THREE.Vector3() },
  });
}
