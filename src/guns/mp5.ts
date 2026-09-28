// H&K MP5A2（固定ストック）見本
// 実銃の寸法：全長 680mm・銃身 225mm。丸い筒の機関部、上の筒の左にコッキングレバー、少し曲がった30連弾倉、輪の照星
//
// 動く部品：handle（左のコッキングレバー）・trigger・mag・lhand（左手）
// 動き　　：fire（撃つ。MP5 はレバーが動かない）・reload（HKスラップ：レバーを引いて上に掛ける → 弾倉を落として入れる → レバーを叩いて戻す）
// 　　　　　inspect・equip（引いて叩く）
import * as THREE from 'three';
import { Clip } from './anim';
import { PartBuilder, makeSpace } from './kit';
import { handMesh, makeGun } from './model';

const S = makeSpace(280, 70);   // 原点：グリップの付け根
const PULL = 0.06;              // レバーを引く量（m）

export function buildMP5(opt: { skin?: string; hand?: THREE.Material } = {}) {
  const B = new PartBuilder(S);
  const handle = B.part('handle', [522, 118]);
  const trigger = B.part('trigger', [325, 70]);
  const mag = B.part('mag', [426, 70]);
  const lhand = B.part('lhand', [520, 68]);

  // ストック（樹脂）
  B.add('grip', S.extrude([[0, 40], [0, 108], [10, 112], [60, 112], [200, 108], [200, 78], [150, 72], [60, 40]], 36, { bevel: 4 }));
  B.add('detail', S.box(-8, 0, 40, 110, 38));
  // 機関部（上が丸い筒）・上の筒・ハンドガード
  B.add('frame', S.extrude([[200, 70], [200, 104], [440, 104], [440, 70]], 28, { bevel: 1.5 }));
  B.add('frame', S.half(200, 440, 103, 14, 10));
  B.add('slide', S.rod(430, 610, 118, 10, 10));
  B.add('bore', S.box(470, 545, 115, 121, 1, -10.2));   // レバーの溝
  B.add('grip', S.extrude([[440, 74], [440, 110], [590, 110], [600, 104], [600, 78], [590, 72]], 40, { bevel: 5 }));
  // 照門（ドラム）・照星（輪）
  B.add('frame', S.box(228, 252, 110, 126, 24));
  B.add('frame', S.box(616, 634, 108, 120, 14));
  B.add('frame', S.ring(625, 130, 11, 7.5, 6, 10, { bevel: 0.8 }));
  B.add('detail', S.box(623, 627, 120, 132, 2));
  // 銃身・銃口
  B.add('barrel', S.rod(600, 690, 100, 8, 8));
  B.add('barrel', S.rod(668, 690, 100, 10.5, 8));
  B.add('bore', S.rod(689.5, 691, 100, 4.5, 8));
  // グリップ・用心鉄・引き金・セレクター
  B.add('grip', S.extrude([[258, 70], [302, 70], [284, -22], [246, -22], [242, -10]], 30, { bevel: 3 }));
  B.add('frame', S.extrude([[300, 70], [300, 52], [306, 46], [350, 46], [356, 52], [356, 70]], 10, {
    bevel: 1, holes: [[[306, 66], [306, 54], [309, 51], [347, 51], [350, 54], [350, 66]]],
  }));
  B.add('detail', S.extrude([[322, 70], [328, 70], [329, 62], [332, 55], [329, 53], [326, 57], [323, 64]], 6, { bevel: 0.6 }), trigger);
  B.add('detail', S.box(248, 262, 80, 90, 2, -15));
  // 弾倉（少し曲がった形）
  B.add('mag', S.extrude([[388, 70], [426, 70], [434, 30], [446, -10], [462, -50], [468, -60], [430, -66], [428, -58], [414, -18], [400, 24]], 22, { bevel: 1.5 }), mag);
  // コッキングレバー（左へ突き出る）
  B.add('detail', S.box(514, 528, 114, 122, 18, -19), handle);
  B.add('detail', S.box(510, 532, 112, 124, 6, -29), handle);

  if (opt.hand) {
    const rh = handMesh(opt.hand); rh.position.copy(S.at(272, 22, 4)); B.root.add(rh);
    const lh = handMesh(opt.hand, 0.8, 0.8, 0.95); lh.position.set(-0.012, -0.012, 0); lhand.add(lh);
  }
  const muzzle = new THREE.Object3D(); muzzle.position.copy(S.at(692, 100));
  const eject = new THREE.Object3D(); eject.position.copy(S.at(400, 100, 15)); B.root.add(eject);

  // 左手の行き先（元の位置からのずれ）：レバー（引いた所）・弾倉
  const toHandle = { x: -0.02, y: 0.05, z: 0 }, toMag = { y: -0.05, z: 0.094 };
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
        // レバー：引いて上に掛け、最後に叩いて戻す
        ['handle', 'pz', [[0, 0], [0.18, 0], [0.25, PULL], [0.74, PULL], [0.77, 0]], 'lin'],
        ['handle', 'rz', [[0, 0], [0.25, 0], [0.29, -0.5], [0.74, -0.5], [0.75, 0]], 'lin'],
        // 弾倉：まっすぐ落とし、新しいのを入れる
        ['mag', 'py', [[0, 0], [0.34, 0], [0.42, -0.25], [0.44, -0.2], [0.58, 0]]],
        ['mag', 'vis', [[0, 1], [0.42, 1], [0.421, 0], [0.439, 0], [0.44, 1]]],
        ['lhand', 'px', [[0, 0], [0.16, toHandle.x], [0.3, toHandle.x], [0.36, 0], [0.62, 0], [0.7, toHandle.x], [0.78, toHandle.x], [0.9, 0]]],
        ['lhand', 'py', [[0, 0], [0.16, toHandle.y], [0.3, toHandle.y], [0.36, toMag.y], [0.42, -0.3], [0.44, -0.25], [0.58, toMag.y], [0.62, toMag.y], [0.7, toHandle.y + 0.02], [0.76, toHandle.y - 0.02], [0.9, 0]]],
        ['lhand', 'pz', [[0, 0], [0.16, toHandle.z], [0.25, toHandle.z + PULL], [0.3, toHandle.z + PULL], [0.36, toMag.z], [0.58, toMag.z], [0.7, PULL], [0.76, 0], [0.9, 0]]],
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
      dur: 0.8,
      tracks: [
        ['root', 'rz', [[0, 0.3], [0.3, 0.1], [0.6, 0]]],
        ['handle', 'pz', [[0, 0], [0.2, 0], [0.3, PULL], [0.5, PULL], [0.53, 0]], 'lin'],
        ['handle', 'rz', [[0, 0], [0.3, 0], [0.34, -0.5], [0.5, -0.5], [0.51, 0]], 'lin'],
        ['lhand', 'px', [[0, 0], [0.18, toHandle.x], [0.54, toHandle.x], [0.7, 0]]],
        ['lhand', 'py', [[0, 0], [0.18, toHandle.y], [0.48, toHandle.y + 0.02], [0.53, toHandle.y - 0.02], [0.7, 0]]],
        ['lhand', 'pz', [[0, 0], [0.18, 0], [0.3, PULL], [0.48, PULL], [0.53, 0], [0.7, 0]]],
      ],
    },
  };
  return makeGun({
    B, clips, muzzle, eject, skin: opt.skin || 'kurogane',
    info: { name: 'MP5', real: '全長 680mm・銃身 225mm', reload: 1.7 },
    vm: { scale: 1, hip: new THREE.Vector3(), ads: new THREE.Vector3() },
  });
}
