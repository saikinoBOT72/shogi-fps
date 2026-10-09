// Glock 17 見本
// 実銃の寸法：全長 202mm・高さ 139mm・銃身 114mm・幅 32mm。角ばったスライド、樹脂のフレーム（前に指の溝・下にレール）、四角い用心鉄
//
// 動く部品：slide・trigger（真ん中に安全の小さな板）・mag・lhand（左手：グリップを下から包む）
// 動き　　：fire・fireLast（スライドが下がったまま）・reload（弾倉を落として入れ、スライドストップで戻す）・inspect・equip
import * as THREE from 'three';
import { Clip, Key, Track } from './anim';
import { PartBuilder, makeSpace } from './kit';
import { handMesh, makeGun } from './model';
import { inspectClip, handPath } from './std';

const S = makeSpace(40, 98);    // 原点：グリップの付け根
const RAKE = 0.4;               // グリップの前の線の傾き（約 22°）
const LOCK = 0.028;             // スライドが下がる量（m）
const SW = 25.5, FW = 28;       // スライド・フレームの幅

export function buildGlock17(opt: { skin?: string; hand?: THREE.Material } = {}) {
  const B = new PartBuilder(S);
  const slide = B.part('slide', [93, 127]);
  const trigger = B.part('trigger', [80, 96]);
  const mag = B.part('mag', [30, 40]);
  const lhand = B.part('lhand', [30, 30]);
  // グリップの前・後ろの線（前は立ち気味、後ろは寝ている。下ほど前後に長い）
  const gf = (v: number) => 44 + (v - 11) * 0.25;
  const gb = (v: number) => -15.5 + (v - 12) * 0.43;

  // ---------- スライド（角ばった箱。上の角を落とす。高さ 23mm） ----------
  B.add('slide', S.extrude([[0, 116], [0, 135], [3, 139], [183, 139], [186, 136], [186, 116]], SW, { bevel: 1.2, taper: [1, 0.86], taperFrom: 0.6 }), slide);
  for (const x of [-1, 1]) for (let u = 9; u <= 42; u += 3.7) B.add('slideDark', S.box(u, u + 1.5, 118, 135, 0.6, x * (SW / 2 + 0.2)), slide);   // 後ろの縦の滑り止め
  B.add('bore', S.box(92, 130, 128, 138.5, 0.8, SW / 2 + 0.15), slide);                     // 排莢口（右）
  B.add('slideDark', S.box(96, 128, 138.6, 139.4, 11), slide);                               // 排莢口の上（銃身の頭）
  B.add('detail', S.extrude([[4, 138], [16, 138], [16, 144], [4, 144]], 16, { bevel: 0.8 }), slide);   // 照門（コの字）
  B.add('slideDark', S.box(5, 17, 140, 144.5, 3.6), slide);
  B.add('detail', S.extrude([[171, 138], [178, 138], [177, 142], [172, 142]], 3.4, { bevel: 0.6 }), slide);   // 照星
  // 銃口
  B.add('barrel', S.rod(184, 187.2, 127, 6.6, 8));
  B.add('bore', S.rod(187, 187.8, 127, 4.6, 8));

  // ---------- フレーム上（スライドの下のレール・前の張り出し・後ろのビーバーテイル） ----------
  B.add('frame', S.extrude([[-2, 109], [0, 116], [184, 116], [184, 103], [180, 99], [104, 99], [100, 104], [24, 104], [18, 95], [0, 107]], FW - 4, { bevel: 1.5 }));
  for (let u = 126; u < 176; u += 12) B.add('slideDark', S.box(u, u + 7, 98.4, 99.4, 14));   // 下のレールの溝
  // ---------- 用心鉄（四角く、前が平ら） ----------
  B.add('frame', S.extrude([[66, 104], [68, 76], [74, 70], [114, 70], [119, 75], [120, 101]], 10, {
    bevel: 1, holes: [[[74.5, 99], [75.5, 80], [79, 76], [109, 76], [112.5, 79.5], [113, 99]]],
  }));
  // ---------- グリップ（フレームと一体の握り。側面にざらざらの板） ----------
  B.add('frame', S.extrude([
    [gb(12), 12], [-12, 8], [gf(8) - 2, 8], [gf(11), 11], [gf(70), 70], [66, 78], [68, 104], [20, 104], [gb(86) + 1, 90], [gb(86), 86],
  ], FW, { bevel: 2.4 }));
  B.add('grip', S.extrude([[gb(18) + 5, 18], [gf(18) - 5, 18], [gf(70) - 5, 70], [gb(70) + 5, 70]], FW + 1.2, { bevel: 0.8 }));
  B.add('detail', S.box(56, 64, 78, 86, 4, -(FW / 2)));                 // 弾倉を外すボタン（左）
  B.add('detail', S.box(50, 66, 110, 114, 1.6, -(FW / 2 - 1)));        // スライドストップ（左）
  B.add('detail', S.box(98, 106, 106, 111, 2, -(FW / 2 - 1.5)));      // 分解レバー
  B.add('detail', S.box(98, 106, 106, 111, 2, FW / 2 - 1.5));

  // ---------- 引き金（真ん中に安全の小さな板） ----------
  B.add('detail', S.extrude([[77, 98], [83, 98], [84, 90], [86, 81], [83, 79], [80, 83], [78, 90]], 6, { bevel: 0.6 }), trigger);
  B.add('slideDark', S.extrude([[80, 92], [82, 92], [84, 84], [82, 83]], 6.6, { bevel: 0 }), trigger);

  // ---------- 弾倉（グリップの中。底の板が見える） ----------
  B.add('mag', S.extrude([[gb(14) + 6, 14], [gf(14) - 6, 14], [gf(80) - 6, 80], [gb(80) + 6, 80]], FW - 8, { bevel: 0.6 }), mag);
  B.add('mag', S.extrude([[-3, 4], [41, 4], [42.5, 9], [-3, 9]], FW - 2, { bevel: 1 }), mag);

  if (opt.hand) {
    const rh = handMesh(opt.hand, 0.72, 0.95, 0.8); rh.position.copy(S.at(26, 52, 40)); B.root.add(rh);
    const lh = handMesh(opt.hand, 0.72, 0.8, 0.85); lh.position.x = -0.04; lhand.add(lh);
  }
  const muzzle = new THREE.Object3D(); muzzle.position.copy(S.at(188, 127));
  const eject = new THREE.Object3D(); eject.position.copy(S.at(110, 132, SW / 2 + 2)).sub(slide.userData.pivotAt); slide.add(eject);

  // 弾倉はグリップの傾きに沿って抜き差し
  const along = (keys: Key[]): Track[] => [['mag', 'py', keys.map(([t, d]) => [t, -0.93 * d] as Key)], ['mag', 'pz', keys.map(([t, d]) => [t, 0.37 * d] as Key)]];
  const toMag = { x: 0.01, y: -0.1, z: 0.04 };
  const clips: Record<string, Clip> = {
    fire: {
      dur: 0.07, events: [[0.015, 'eject']],
      tracks: [
        ['slide', 'pz', [[0, 0], [0.015, LOCK], [0.055, 0]], 'out'],
        ['trigger', 'rx', [[0, 0], [0.008, -0.28], [0.05, -0.28], [0.07, 0]]],
      ],
    },
    fireLast: {
      dur: 0.06, hold: true, events: [[0.015, 'eject']],
      tracks: [['slide', 'pz', [[0, 0], [0.015, LOCK]], 'out'], ['trigger', 'rx', [[0, 0], [0.008, -0.28], [0.06, 0]]]],
    },
    release: { dur: 0.12, tracks: [['slide', 'pz', [[0, LOCK], [0.04, -0.002], [0.07, 0]], 'in'], ['root', 'rx', [[0, 0], [0.04, 0.06], [0.12, 0]]]] },
    reload: {
      dur: 1, events: [[0.14, 'magOut'], [0.56, 'magIn'], [0.72, 'release']],
      tracks: [
        ['root', 'rz', [[0, 0], [0.12, -0.8], [0.8, -0.8], [1, 0]]],
        ['root', 'rx', [[0, 0], [0.12, 0.2], [0.54, 0.2], [0.58, 0.32], [0.64, 0.2], [0.8, 0.2], [1, 0]]],
        ['root', 'px', [[0, 0], [0.12, -0.05], [0.8, -0.05], [1, 0]]],
        ['root', 'py', [[0, 0], [0.12, 0.07], [0.8, 0.07], [1, 0]]],
        ...along([[0, 0], [0.12, 0], [0.28, 0.2], [0.32, 0.2], [0.36, 0.14], [0.54, 0.005], [0.56, 0]]),
        ['mag', 'vis', [[0, 1], [0.28, 1], [0.281, 0], [0.359, 0], [0.36, 1]]],
        ...handPath([[0, {}], [0.14, toMag], [0.28, { ...toMag, y: toMag.y - 0.2 }], [0.32, { ...toMag, y: toMag.y - 0.2 }], [0.36, { ...toMag, y: toMag.y - 0.14 }], [0.56, toMag], [0.64, toMag], [0.8, {}]]),
      ],
    },
    inspect: inspectClip(),
    equip: {
      dur: 0.6,
      tracks: [
        ['slide', 'pz', [[0, 0], [0.3, 0], [0.38, LOCK], [0.46, 0]], 'out'],
        ['root', 'rz', [[0, 0.35], [0.3, 0.2], [0.5, 0], [0.6, 0]]],
        ...handPath([[0, {}], [0.2, { x: 0.03, y: 0.1, z: 0.06 }], [0.38, { x: 0.03, y: 0.1, z: 0.09 }], [0.5, {}]]),
      ],
    },
  };
  return makeGun({
    B, clips, muzzle, eject, skin: opt.skin || 'kurogane',
    info: { name: 'Glock 17', real: '全長 202mm・高さ 139mm・銃身 114mm', reload: 1.5 },
    vm: { scale: 1, hip: new THREE.Vector3(), ads: new THREE.Vector3(), size: 0.62 },
    events: { release: anim => { if (anim.has('fireLast')) { anim.stop('fireLast'); anim.play('release'); } } },
  });
}
