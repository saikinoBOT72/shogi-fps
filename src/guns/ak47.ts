// AK-47（固定ストック）見本
// 実銃の寸法：全長 880mm・銃身 415mm。木のストック・ハンドガード、曲がった30連弾倉
//
// 動く部品：carrier（ボルトキャリアと右側のコッキングハンドル）・trigger・mag（前を支点に揺すって外す）・lhand（左手）
// 動き　　：fire（キャリアが往復）・reload（左手で弾倉を揺すって外す → 新しい弾倉を前から掛けて戻す → 右側のハンドルを引く）
// 　　　　　inspect・equip（ハンドルを引く）。AK は弾切れでもキャリアは止まらない
import * as THREE from 'three';
import { Clip } from './anim';
import { PartBuilder, makeSpace } from './kit';
import { handMesh, makeGun } from './model';

const S = makeSpace(320, 62);   // 原点：グリップの付け根
const TRAVEL = 0.07;            // キャリアが下がる量（m）

export function buildAK47(opt: { skin?: string; hand?: THREE.Material } = {}) {
  const B = new PartBuilder(S);
  const carrier = B.part('carrier', [450, 92]);
  const trigger = B.part('trigger', [360, 62]);
  const mag = B.part('mag', [452, 62]);          // 前の上が支点（ここを中心に揺すって外す）
  const lhand = B.part('lhand', [600, 80]);

  // ストック・グリップ・ハンドガード（木）
  B.add('grip', S.extrude([[0, -26], [0, 74], [6, 79], [238, 97], [238, 66], [196, 56], [22, -26]], 38, { bevel: 3 }));
  B.add('detail', S.box(-5, 0, -27, 76, 40));                                   // 床尾板
  B.add('grip', S.extrude([[300, 62], [340, 62], [312, -42], [276, -40], [272, -30]], 30, { bevel: 2.5 }));
  B.add('grip', S.extrude([[522, 70], [522, 100], [690, 100], [690, 74], [680, 70]], 36, { bevel: 3, taper: [1, 0.9] }));
  B.add('grip', S.half(522, 700, 103, 14.5, 10));                          // 上のハンドガード（丸い）
  // 機関部・上の蓋・照門
  B.add('frame', S.extrude([[236, 62], [236, 98], [244, 101], [470, 101], [470, 96], [520, 96], [520, 66], [470, 62]], 26, { bevel: 1.5 }));   // 前は照門の台とハンドガードまで続く
  B.add('frame', S.box(514, 524, 66, 106, 30));   // ハンドガードの留め金
  B.add('slide', S.half(250, 468, 99, 12.5, 10));                         // 上の蓋（丸い）
  B.add('slide', S.extrude([[244, 99], [244, 104], [252, 106], [252, 99]], 18, { bevel: 1.5 }));   // 蓋の後ろの留め具
  B.add('frame', S.extrude([[468, 96], [468, 112], [480, 116], [518, 116], [518, 96]], 20, { bevel: 1.5 }));
  B.add('detail', S.box(482, 510, 113, 117, 14));
  // 用心鉄と引き金
  B.add('frame', S.extrude([[330, 62], [330, 44], [336, 38], [398, 38], [404, 44], [404, 62]], 10, {
    bevel: 1, holes: [[[337, 58], [337, 46], [341, 43], [393, 43], [398, 47], [398, 58]]],
  }));
  B.add('detail', S.extrude([[357, 62], [363, 62], [364, 54], [368, 47], [365, 45], [361, 49], [358, 56]], 7, { bevel: 0.7 }), trigger);
  // セレクター（右側の長いレバー）
  B.add('detail', S.extrude([[330, 86], [455, 90], [455, 95], [330, 92]], 2, { bevel: 0.4, x: 14 }));
  // ガスチューブ・ガスブロック・銃身・照星・銃口・クリーニングロッド
  B.add('barrel', S.rod(700, 760, 113, 9, 8));
  B.add('frame', S.extrude([[755, 96], [755, 122], [782, 122], [788, 108], [788, 96]], 20, { bevel: 1.5 }));
  B.add('barrel', S.rod(515, 870, 100, 8.5, 8));
  B.add('frame', S.extrude([[818, 94], [818, 112], [824, 136], [838, 136], [846, 112], [846, 94]], 12, { bevel: 1.2 }));
  B.add('detail', S.box(829, 834, 136, 145, 3));
  B.add('barrel', S.rod(866, 882, 100, 11, 8));
  B.add('bore', S.rod(881, 882.8, 100, 5, 8));
  B.add('barrel', S.rod(600, 860, 86, 2.5, 6));
  // 弾倉（横から見た弓なりの形）
  B.add('mag', S.extrude([[404, 62], [452, 62], [462, 24], [478, -20], [500, -64], [524, -104], [526, -112], [466, -120], [464, -112], [444, -70], [424, -25], [410, 20]], 24, { bevel: 1.5 }), mag);
  B.add('slideDark', S.extrude([[470, -106], [522, -100], [524, -106], [470, -112]], 25, { bevel: 0.5 }), mag);   // 底の縁
  // コッキングハンドル（右へ突き出た棒）
  B.add('detail', S.box(444, 456, 88, 96, 22, 24), carrier);
  B.add('slideDark', S.box(420, 468, 90, 97, 1, 13.4), carrier);   // キャリアの見える所

  // 手
  if (opt.hand) {
    const rh = handMesh(opt.hand); rh.position.copy(S.at(316, 18, 4)); B.root.add(rh);
    const lh = handMesh(opt.hand, 0.8, 0.8, 0.95); lh.position.set(-0.012, -0.01, 0); lhand.add(lh);
  }

  const muzzle = new THREE.Object3D(); muzzle.position.copy(S.at(884, 100));
  const eject = new THREE.Object3D(); eject.position.copy(S.at(452, 96, 15)).sub(carrier.userData.pivotAt); carrier.add(eject);

  // 左手の行き先（手の元の位置からのずれ）：弾倉・コッキングハンドル
  const toMag = { z: 0.16, y: -0.09 }, toHandle = { x: 0.034, y: 0.012, z: 0.148 };
  const clips: Record<string, Clip> = {
    fire: {
      dur: 0.09, events: [[0.02, 'eject']],
      tracks: [
        ['carrier', 'pz', [[0, 0], [0.02, TRAVEL], [0.075, 0]], 'out'],
        ['trigger', 'rx', [[0, 0], [0.01, -0.25], [0.06, -0.25], [0.09, 0]]],
      ],
    },
    reload: {
      dur: 1, events: [[0.3, 'magOut'], [0.58, 'magIn'], [0.8, 'rack']],
      tracks: [
        ['root', 'rz', [[0, 0], [0.1, 0.35], [0.85, 0.35], [1, 0]]],
        ['root', 'rx', [[0, 0], [0.1, 0.12], [0.55, 0.12], [0.6, 0.2], [0.64, 0.12], [0.85, 0.12], [1, 0]]],
        ['root', 'py', [[0, 0], [0.1, 0.04], [0.85, 0.04], [1, 0]]],
        ['root', 'px', [[0, 0], [0.1, -0.03], [0.85, -0.03], [1, 0]]],
        // 弾倉：前を支点に前へ揺すって外し、落とす → 新しいのを前から掛けて後ろへ戻す
        ['mag', 'rx', [[0, 0], [0.12, 0], [0.25, 0.45], [0.5, 0.45], [0.58, 0]]],
        ['mag', 'py', [[0, 0], [0.25, 0], [0.33, -0.25], [0.34, -0.25], [0.36, -0.2], [0.5, 0]]],
        ['mag', 'vis', [[0, 1], [0.33, 1], [0.331, 0], [0.359, 0], [0.36, 1]]],
        ['carrier', 'pz', [[0, 0], [0.7, 0], [0.76, TRAVEL], [0.78, TRAVEL], [0.8, 0]], 'lin'],
        ['lhand', 'px', [[0, 0], [0.62, 0], [0.7, toHandle.x], [0.8, toHandle.x], [0.92, 0]]],
        ['lhand', 'py', [[0, 0], [0.12, toMag.y], [0.25, toMag.y], [0.35, -0.3], [0.36, -0.3], [0.5, toMag.y], [0.58, toMag.y], [0.7, toHandle.y], [0.8, toHandle.y], [0.92, 0]]],
        ['lhand', 'pz', [[0, 0], [0.12, toMag.z], [0.58, toMag.z], [0.7, toHandle.z], [0.76, toHandle.z + TRAVEL], [0.8, toHandle.z + 0.05], [0.92, 0]]],
      ],
    },
    inspect: {
      dur: 2.6,
      tracks: [
        ['root', 'ry', [[0, 0], [0.4, 0.7], [1.2, 0.7], [1.6, -0.5], [2.2, -0.5], [2.6, 0]]],
        ['root', 'rz', [[0, 0], [0.4, -0.25], [1.2, -0.1], [1.6, 0.35], [2.2, 0.35], [2.6, 0]]],
        ['root', 'px', [[0, 0], [0.4, -0.07], [2.2, -0.05], [2.6, 0]]],
        ['root', 'py', [[0, 0], [0.4, 0.04], [2.2, 0.04], [2.6, 0]]],
      ],
    },
    equip: {
      dur: 0.7,
      tracks: [
        ['root', 'rz', [[0, 0.3], [0.35, 0.15], [0.6, 0]]],
        ['carrier', 'pz', [[0, 0], [0.3, 0], [0.38, TRAVEL], [0.44, 0]], 'lin'],
        ['lhand', 'px', [[0, 0], [0.2, toHandle.x], [0.5, toHandle.x], [0.62, 0]]],
        ['lhand', 'py', [[0, 0], [0.2, toHandle.y], [0.5, toHandle.y], [0.62, 0]]],
        ['lhand', 'pz', [[0, 0], [0.2, toHandle.z], [0.3, toHandle.z], [0.38, toHandle.z + TRAVEL], [0.44, toHandle.z + 0.05], [0.62, 0]]],
      ],
    },
  };
  return makeGun({
    B, clips, muzzle, eject, skin: opt.skin || 'mokume',
    info: { name: 'AK-47', real: '全長 880mm・銃身 415mm' },
    vm: { scale: 1.0, yaw: -0.3, hip: new THREE.Vector3(0.17, -0.17, -0.28), ads: new THREE.Vector3(0.11, -0.21, -0.26) },
  });
}
