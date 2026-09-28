// ベレッタ 93R（3点バースト）見本
// 実銃の寸法：全長 240mm・銃身 156mm。上が開いたスライド（銃身が見える）、銃口の補正器、前の折りたたみグリップ、下に飛び出た20連弾倉
//
// 動く部品：slide・hammer・trigger・mag・lhand（左手：ふだんは前の折りたたみグリップを握る）
// 動き　　：fire（毎発スライドが往復）・fireLast（最後の1発でスライドが下がったまま）・release・reload・inspect・equip
import * as THREE from 'three';
import { Clip, Key, Track } from './anim';
import { PartBuilder, makeSpace } from './kit';
import { handMesh, makeGun } from './model';

const S = makeSpace(40, 80);    // 原点：グリップの付け根
const RAKE = 0.2;               // グリップの傾き
const LOCK = 0.035;             // スライドが下がる量（m）
const COCK = 0.5;

export function buildB93R(opt: { skin?: string; hand?: THREE.Material } = {}) {
  const B = new PartBuilder(S);
  const slide = B.part('slide', [100, 110]);
  const hammer = B.part('hammer', [2, 96]);
  const trigger = B.part('trigger', [84, 80]);
  const mag = B.part('mag', [20, 0]);
  const lhand = B.part('lhand', [150, 44]);

  // スライド（上の真ん中が開いていて、中の銃身が見える）
  B.add('slide', S.extrude([[0, 88], [0, 114], [4, 118], [70, 118], [74, 108], [150, 108], [154, 118], [186, 118], [190, 112], [190, 88]], 26, { bevel: 1.2 }), slide);
  for (const x of [-1, 1]) for (let u = 10; u <= 34; u += 5) B.add('slideDark', S.box(u, u + 2, 92, 114, 0.6, x * 13.3), slide);   // 後ろの滑り止め
  B.add('detail', S.box(4, 14, 118, 124, 18), slide);          // 照門
  B.add('detail', S.box(176, 184, 118, 125, 4), slide);        // 照星
  B.add('barrel', S.rod(60, 200, 104, 7, 8));
  // 補正器（銃口の先。上に穴）
  B.add('frame', S.extrude([[196, 88], [196, 116], [240, 116], [242, 110], [242, 88]], 24, { bevel: 1.5 }));
  for (let u = 204; u < 236; u += 9) B.add('bore', S.box(u, u + 5, 115, 116.8, 12));
  B.add('bore', S.rod(241, 243, 102, 4.5, 8));
  // フレーム・グリップ・大きな用心鉄・前の折りたたみグリップ
  B.add('frame', S.extrude([[6, 80], [6, 90], [196, 90], [196, 80]], 24, { bevel: 1 }));
  B.add('grip', S.extrude([[2, 82], [58, 82], [58 - 88 * RAKE, -6], [-6 - 88 * RAKE, -6], [-10 - 60 * RAKE, 20]], 30, { bevel: 2.5 }));
  B.add('frame', S.extrude([[56, 82], [56, 64], [64, 52], [126, 52], [134, 60], [134, 82]], 10, {
    bevel: 1, holes: [[[64, 78], [64, 64], [69, 58], [122, 58], [128, 64], [128, 78]]],
  }));
  B.add('frame', S.extrude([[140, 80], [162, 80], [158, 26], [144, 26]], 16, { bevel: 2 }));
  B.add('detail', S.rod(138, 164, 84, 3, 6));                  // 折りたたみの軸
  // 撃鉄・引き金
  B.add('detail', S.extrude([[-1, 96], [5, 96], [3, 106], [-3, 114], [-9, 114], [-7, 106]], 7, { bevel: 0.6 }), hammer);
  B.add('detail', S.extrude([[81, 80], [87, 80], [88, 72], [91, 64], [88, 62], [85, 66], [82, 74]], 6, { bevel: 0.6 }), trigger);
  // 20連の長い弾倉（グリップの下に飛び出る）
  // グリップの前の線より少し内側に収める
  const gf = (v: number) => 58 - (82 - v) * RAKE - 5;
  B.add('mag', S.extrude([[gf(0) - 40, 0], [gf(0), 0], [gf(76), 76], [gf(76) - 40, 76]], 22, { bevel: 0.8 }), mag);
  B.add('mag', S.extrude([[-22, -4], [40, -4], [35, -28], [-27, -28]], 24, { bevel: 1.2 }), mag);
  B.add('frame', S.box(-29, 37, -34, -28, 28), mag);

  if (opt.hand) {
    const rh = handMesh(opt.hand, 0.72, 0.95, 0.8); rh.position.copy(S.at(28, 36, 3)); B.root.add(rh);
    lhand.add(handMesh(opt.hand, 0.7, 0.85, 0.8));
  }
  const muzzle = new THREE.Object3D(); muzzle.position.copy(S.at(244, 102));
  const eject = new THREE.Object3D(); eject.position.copy(S.at(120, 112, 10)).sub(slide.userData.pivotAt); slide.add(eject);
  hammer.rotation.x = COCK;

  // 弾倉はグリップの傾きに沿って抜き差し
  const along = (keys: Key[]): Track[] => [['mag', 'py', keys.map(([t, d]) => [t, -0.98 * d] as Key)], ['mag', 'pz', keys.map(([t, d]) => [t, 0.2 * d] as Key)]];
  const toMag = { y: -0.085, z: 0.135 };
  const clips: Record<string, Clip> = {
    fire: {
      dur: 0.07, events: [[0.015, 'eject']],
      tracks: [
        ['slide', 'pz', [[0, 0], [0.015, LOCK], [0.055, 0]], 'out'],
        ['hammer', 'rx', [[0, 0], [0.005, -COCK], [0.02, 0]], 'lin'],
        ['trigger', 'rx', [[0, 0], [0.008, -0.3], [0.05, -0.3], [0.07, 0]]],
      ],
    },
    fireLast: {
      dur: 0.06, hold: true, events: [[0.015, 'eject']],
      tracks: [
        ['slide', 'pz', [[0, 0], [0.015, LOCK]], 'out'],
        ['hammer', 'rx', [[0, 0], [0.005, -COCK], [0.02, 0]], 'lin'],
        ['trigger', 'rx', [[0, 0], [0.008, -0.3], [0.06, 0]]],
      ],
    },
    release: { dur: 0.12, tracks: [['slide', 'pz', [[0, LOCK], [0.04, -0.002], [0.07, 0]], 'in'], ['root', 'rx', [[0, 0], [0.04, 0.06], [0.12, 0]]]] },
    reload: {
      dur: 1, events: [[0.14, 'magOut'], [0.58, 'magIn'], [0.72, 'release']],
      tracks: [
        ['root', 'rz', [[0, 0], [0.12, -0.9], [0.8, -0.9], [1, 0]]],
        ['root', 'rx', [[0, 0], [0.12, 0.22], [0.56, 0.22], [0.6, 0.34], [0.66, 0.22], [0.8, 0.22], [1, 0]]],
        ['root', 'px', [[0, 0], [0.12, -0.06], [0.8, -0.06], [1, 0]]],
        ['root', 'py', [[0, 0], [0.12, 0.08], [0.8, 0.08], [1, 0]]],
        ...along([[0, 0], [0.12, 0], [0.3, 0.22], [0.34, 0.22], [0.38, 0.15], [0.56, 0.005], [0.58, 0]]),
        ['mag', 'vis', [[0, 1], [0.3, 1], [0.301, 0], [0.379, 0], [0.38, 1]]],
        ['lhand', 'py', [[0, 0], [0.14, toMag.y], [0.3, toMag.y - 0.2], [0.34, toMag.y - 0.2], [0.38, toMag.y - 0.14], [0.58, toMag.y], [0.66, toMag.y], [0.8, 0]]],
        ['lhand', 'pz', [[0, 0], [0.14, toMag.z], [0.66, toMag.z], [0.8, 0]]],
      ],
    },
    inspect: {
      dur: 2.6,
      tracks: [
        ['root', 'ry', [[0, 0], [0.4, 1.0], [1.2, 1.0], [1.6, -0.55], [2.2, -0.55], [2.6, 0]]],
        ['root', 'rz', [[0, 0], [0.4, -0.3], [1.2, -0.15], [1.6, 0.45], [2.2, 0.45], [2.6, 0]]],
        ['root', 'px', [[0, 0], [0.4, -0.06], [2.2, -0.04], [2.6, 0]]],
        ['root', 'py', [[0, 0], [0.4, 0.04], [2.2, 0.04], [2.6, 0]]],
      ],
    },
    equip: {
      dur: 0.6,
      tracks: [
        ['slide', 'pz', [[0, 0], [0.32, 0], [0.4, LOCK], [0.48, 0]], 'out'],
        ['root', 'rz', [[0, 0.35], [0.3, 0.2], [0.5, 0], [0.6, 0]]],
      ],
    },
  };
  return makeGun({
    B, clips, muzzle, eject, skin: opt.skin || 'kurogane',
    info: { name: 'ベレッタ 93R', real: '全長 240mm・銃身 156mm（3点バースト）', reload: 1.6 },
    vm: { scale: 1, hip: new THREE.Vector3(), ads: new THREE.Vector3() },
    events: { release: anim => { if (anim.has('fireLast')) { anim.stop('fireLast'); anim.play('release'); } } },
  });
}
