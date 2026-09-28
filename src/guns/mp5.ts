// H&K MP5K 見本（短いMP5。ストックなし、前に縦のグリップ）
// 実銃の寸法：全長 325mm・銃身 115mm。丸い筒の機関部、左前にコッキングレバー、前の輪の照星、後ろの蓋
//
// 動く部品：handle（左前のコッキングレバー）・trigger・mag・lhand（左手：ふだんは前のグリップを握る）
// 動き　　：fire（引き金だけ。MP5 はレバーが動かない）・reload（HKスラップ：レバーを引いて上に掛ける → 弾倉を落として入れる → レバーを叩いて戻す）
// 　　　　　inspect・equip（引いて叩く）
import * as THREE from 'three';
import { Clip } from './anim';
import { PartBuilder, makeSpace } from './kit';
import { handMesh, makeGun } from './model';

const S = makeSpace(50, 62);    // 原点：グリップの付け根
const PULL = 0.05;              // レバーを引く量（m）

export function buildMP5(opt: { skin?: string; hand?: THREE.Material } = {}) {
  const B = new PartBuilder(S);
  const handle = B.part('handle', [282, 118]);
  const trigger = B.part('trigger', [108, 62]);
  const mag = B.part('mag', [228, 70]);
  const lhand = B.part('lhand', [268, 18]);

  // 後ろの蓋・機関部（上が丸い筒）・前の下の張り出し
  B.add('frame', S.extrude([[0, 74], [0, 110], [20, 112], [20, 72]], 30, { bevel: 3 }));
  B.add('frame', S.ring(8, 92, 8, 4.5, 6, 6, { bevel: 0.6, x: 0 }));   // 吊り紐の輪
  B.add('frame', S.extrude([[20, 70], [20, 104], [300, 104], [300, 60], [248, 60], [248, 70]], 28, { bevel: 1.5 }));
  B.add('frame', S.half(20, 300, 103, 14, 10));
  B.add('bore', S.box(160, 290, 112, 116, 1, -10.5));   // レバーの溝
  // 照門（ドラム）・照星（輪）
  B.add('frame', S.box(34, 56, 112, 128, 24));
  B.add('frame', S.box(292, 308, 108, 122, 14));
  B.add('frame', S.ring(300, 132, 11, 7.5, 6, 10, { bevel: 0.8 }));
  B.add('detail', S.box(298, 302, 122, 134, 2));
  // 銃身・銃口
  B.add('barrel', S.rod(300, 335, 100, 8, 8));
  B.add('barrel', S.rod(315, 335, 100, 10.5, 8));
  B.add('bore', S.rod(334.5, 336, 100, 4.5, 8));
  // 引き金のまわり（樹脂）・グリップ・用心鉄・引き金・セレクター
  B.add('grip', S.box(20, 182, 58, 72, 30));
  B.add('grip', S.extrude([[28, 62], [78, 62], [66, -42], [24, -42], [18, -28]], 32, { bevel: 3 }));
  B.add('frame', S.extrude([[78, 60], [78, 46], [84, 40], [140, 40], [146, 48], [146, 60]], 10, {
    bevel: 1, holes: [[[84, 56], [84, 48], [88, 45], [136, 45], [140, 49], [140, 56]]],
  }));
  B.add('detail', S.extrude([[105, 62], [111, 62], [112, 54], [115, 47], [112, 45], [109, 49], [106, 56]], 6, { bevel: 0.6 }), trigger);
  B.add('detail', S.box(150, 164, 78, 90, 2, -15));
  // 前の縦グリップ（下に溝）
  B.add('grip', S.extrude([[252, 60], [288, 60], [286, -30], [256, -30]], 30, { bevel: 4 }));
  for (let v = -26; v < -4; v += 6) B.add('slideDark', S.box(254, 288, v, v + 3, 31));
  // 弾倉（ほぼまっすぐ）
  B.add('mag', S.extrude([[190, 70], [228, 70], [232, 20], [238, -40], [242, -70], [204, -76], [202, -66], [196, -10]], 22, { bevel: 1.5 }), mag);
  // コッキングレバー（左へ突き出る）
  B.add('detail', S.box(276, 290, 114, 122, 18, -19), handle);
  B.add('detail', S.box(272, 294, 112, 124, 6, -29), handle);

  if (opt.hand) {
    const rh = handMesh(opt.hand); rh.position.copy(S.at(46, 14, 4)); B.root.add(rh);
    lhand.add(handMesh(opt.hand, 0.8, 0.95, 0.85));
  }
  const muzzle = new THREE.Object3D(); muzzle.position.copy(S.at(337, 100));
  const eject = new THREE.Object3D(); eject.position.copy(S.at(200, 100, 15)); B.root.add(eject);

  // 左手の行き先（前のグリップからのずれ）：レバー・弾倉
  const toHandle = { x: -0.02, y: 0.1, z: -0.014 }, toMag = { y: -0.02, z: 0.058 };
  const clips: Record<string, Clip> = {
    fire: {
      dur: 0.07, events: [[0.01, 'eject']],
      tracks: [['trigger', 'rx', [[0, 0], [0.01, -0.25], [0.05, -0.25], [0.07, 0]]]],
    },
    reload: {
      dur: 1, events: [[0.4, 'magOut'], [0.58, 'magIn'], [0.76, 'slap']],
      tracks: [
        ['root', 'rz', [[0, 0], [0.1, 0.3], [0.85, 0.3], [1, 0]]],
        ['root', 'rx', [[0, 0], [0.1, 0.1], [0.74, 0.1], [0.77, 0.2], [0.82, 0.1], [0.9, 0.1], [1, 0]]],
        ['root', 'py', [[0, 0], [0.1, 0.03], [0.85, 0.03], [1, 0]]],
        ['handle', 'pz', [[0, 0], [0.18, 0], [0.25, PULL], [0.74, PULL], [0.77, 0]], 'lin'],
        ['handle', 'rz', [[0, 0], [0.25, 0], [0.29, -0.5], [0.74, -0.5], [0.75, 0]], 'lin'],
        ['mag', 'py', [[0, 0], [0.34, 0], [0.42, -0.25], [0.44, -0.2], [0.58, 0]]],
        ['mag', 'vis', [[0, 1], [0.42, 1], [0.421, 0], [0.439, 0], [0.44, 1]]],
        ['lhand', 'px', [[0, 0], [0.16, toHandle.x], [0.3, toHandle.x], [0.36, 0], [0.62, 0], [0.7, toHandle.x], [0.78, toHandle.x], [0.9, 0]]],
        ['lhand', 'py', [[0, 0], [0.16, toHandle.y], [0.3, toHandle.y], [0.36, toMag.y], [0.42, -0.25], [0.44, -0.2], [0.58, toMag.y], [0.62, toMag.y], [0.7, toHandle.y + 0.02], [0.76, toHandle.y - 0.02], [0.9, 0]]],
        ['lhand', 'pz', [[0, 0], [0.16, toHandle.z], [0.25, toHandle.z + PULL], [0.3, toHandle.z + PULL], [0.36, toMag.z], [0.58, toMag.z], [0.7, toHandle.z + PULL], [0.76, toHandle.z], [0.9, 0]]],
      ],
    },
    inspect: {
      dur: 2.6,
      tracks: [
        ['root', 'ry', [[0, 0], [0.4, 0.8], [1.2, 0.8], [1.6, -0.6], [2.2, -0.6], [2.6, 0]]],
        ['root', 'rz', [[0, 0], [0.4, -0.25], [1.2, -0.1], [1.6, 0.35], [2.2, 0.35], [2.6, 0]]],
        ['root', 'px', [[0, 0], [0.4, -0.05], [2.2, -0.04], [2.6, 0]]],
        ['root', 'py', [[0, 0], [0.4, 0.04], [2.2, 0.04], [2.6, 0]]],
      ],
    },
    equip: {
      dur: 0.8,
      tracks: [
        ['root', 'rz', [[0, 0.3], [0.3, 0.1], [0.6, 0]]],
        ['handle', 'pz', [[0, 0], [0.2, 0], [0.3, PULL], [0.5, PULL], [0.53, 0]], 'lin'],
        ['handle', 'rz', [[0, 0], [0.3, 0], [0.34, -0.5], [0.5, -0.5], [0.51, 0]], 'lin'],
        ['lhand', 'px', [[0, 0], [0.18, toHandle.x], [0.54, toHandle.x], [0.7, 0]]],
        ['lhand', 'py', [[0, 0], [0.18, toHandle.y], [0.48, toHandle.y + 0.02], [0.53, toHandle.y - 0.02], [0.7, 0]]],
        ['lhand', 'pz', [[0, 0], [0.18, toHandle.z], [0.3, toHandle.z + PULL], [0.48, toHandle.z + PULL], [0.53, toHandle.z], [0.7, 0]]],
      ],
    },
  };
  return makeGun({
    B, clips, muzzle, eject, skin: opt.skin || 'kurogane',
    info: { name: 'MP5K', real: '全長 325mm・銃身 115mm', reload: 1.7 },
    vm: { scale: 1, hip: new THREE.Vector3(), ads: new THREE.Vector3() },
  });
}
