// カランビットナイフ 見本（どの駒に持たせるかは未定）
// 実物の寸法：全長 190mm・刃 100mm。爪のように曲がった刃、指を通す輪、指の溝のある握り
//
// 動く部品：knife（ナイフ全体。輪の真ん中が回る中心）・rhand（右手）
// 動き　　：fire（切りつける）・inspect（輪に指を掛けてくるくる回す）・equip（1回転させて構える）
import * as THREE from 'three';
import { Clip } from './anim';
import { PartBuilder, makeSpace } from './kit';
import { handMesh, makeGun } from './model';

const S = makeSpace(55, 0);   // 原点：握りの真ん中
const TURN = Math.PI * 2;

export function buildKarambit(opt: { skin?: string; hand?: THREE.Material } = {}) {
  const B = new PartBuilder(S);
  const knife = B.part('knife', [0, 0]);   // 輪の真ん中
  const rhand = B.part('rhand', [55, -2]);

  // 指を通す輪・握り（指の溝）・つば
  B.add('frame', S.ring(0, 0, 16, 10, 5, 10, { bevel: 0.8 }), knife);
  B.add('grip', S.extrude([[12, -10], [22, -14], [30, -9], [40, -15], [50, -9], [60, -15], [72, -9], [96, -12], [100, -6], [100, 10], [92, 12], [12, 11]], 16, { bevel: 3 }), knife);
  B.add('detail', S.box(98, 104, -14, 12, 18), knife);
  // 刃（爪のように下へ曲がる）
  B.add('slide', S.extrude([[100, 10], [122, 8], [142, 0], [160, -16], [172, -38], [176, -60], [173, -78], [165, -62], [160, -42], [150, -26], [136, -16], [118, -10], [100, -8]], 4, { bevel: 0.8 }), knife);

  if (opt.hand) { const h = handMesh(opt.hand, 0.5, 0.55, 0.85); h.position.set(0.004, -0.012, 0); rhand.add(h); }   // ナイフが隠れないよう小さめの拳
  const muzzle = new THREE.Object3D(); muzzle.position.copy(S.at(173, -60));   // 刃先（構えの向きの目安）
  const eject = new THREE.Object3D(); B.root.add(eject);

  const clips: Record<string, Clip> = {
    // 右から左へ切りつける
    fire: {
      dur: 0.45,
      tracks: [
        ['root', 'ry', [[0, 0], [0.08, 0.5], [0.22, -0.9], [0.45, 0]]],
        ['root', 'rz', [[0, 0], [0.08, 0.3], [0.22, -0.4], [0.45, 0]]],
        ['root', 'px', [[0, 0], [0.08, 0.04], [0.22, -0.12], [0.45, 0]]],
        ['root', 'pz', [[0, 0], [0.22, -0.06], [0.45, 0]]],
      ],
    },
    // 眺める：手を輪へ移し、指を軸にくるくる2回転 → 握り直して刃を見せる
    inspect: {
      dur: 2.8,
      tracks: [
        ['root', 'rz', [[0, 0], [0.25, -0.3], [1.7, -0.3], [2.0, 0.5], [2.5, 0.5], [2.8, 0]]],
        ['root', 'ry', [[0, 0], [0.25, 0.4], [1.7, 0.4], [2.0, -0.6], [2.5, -0.6], [2.8, 0]]],
        ['root', 'py', [[0, 0], [0.25, 0.04], [2.5, 0.04], [2.8, 0]]],
        ['rhand', 'pz', [[0, 0], [0.25, 0.055], [1.55, 0.055], [1.75, 0]]],
        ['knife', 'rx', [[0, 0], [0.3, 0], [0.9, -TURN], [1.5, -TURN * 2], [1.7, -TURN * 2]]],
      ],
    },
    equip: {
      dur: 0.7,
      tracks: [
        ['rhand', 'pz', [[0, 0.055], [0.5, 0.055], [0.62, 0]]],
        ['knife', 'rx', [[0, 0], [0.5, -TURN]], 'out'],
        ['root', 'rz', [[0, 0.3], [0.5, 0.1], [0.7, 0]]],
      ],
    },
  };
  return makeGun({
    B, clips, muzzle, eject, skin: opt.skin || 'ruri',
    info: { name: 'カランビット', real: '全長 190mm・刃 100mm' },
    vm: { scale: 1, hip: new THREE.Vector3(), ads: new THREE.Vector3() },
  });
}
