// クロスボウ（リカーブ）見本
// 大きさ：全長 約960mm・左右の弓 約720mm。黒い樹脂の AR 型ストック、肉抜きの窓のある本体と上のレール、AR 型グリップ、前の反った弓（リム）と弦、大きな足掛け、前の下の矢筒
//
// 動く部品：arrow（矢：撃つと消える）・stringC（引いて掛けた弦）・stringR（撃ったあとの弦）・trigger・lhand（左手：前の下）
// 動き　　：fire（矢が消え、弦が前へ戻る）・reload（前を下げ、左手で弦を引いて掛ける → 矢を載せる）・inspect・equip
import * as THREE from 'three';
import { Clip } from './anim';
import { PartBuilder, makeSpace } from './kit';
import { handMesh, makeGun } from './model';
import { inspectClip, handPath } from './std';

const S = makeSpace(300, 80);   // 原点：グリップの付け根
const AV = 132;                 // 矢の高さ
const NOCK = 560;               // 弦を掛ける所
const REST = 826;               // 撃ったあとの弦の位置

export function buildCrossbow(opt: { skin?: string; hand?: THREE.Material } = {}) {
  const B = new PartBuilder(S);
  const arrow = B.part('arrow', [NOCK, AV]);
  const stringC = B.part('stringC', [NOCK, AV]);
  const stringR = B.part('stringR', [REST, AV]);
  const trigger = B.part('trigger', [348, 84]);
  const lhand = B.part('lhand', [600, 90]);

  // 図面の上から見た線（u, x）を、太さ w・高さ h の棒にする
  const bar = (u0: number, x0: number, u1: number, x1: number, v: number, w: number, h: number) => {
    const len = Math.hypot(u1 - u0, x1 - x0);
    const g = new THREE.BoxGeometry(w, h, len).rotateY(Math.atan2(x1 - x0, -(u1 - u0)));
    return S.put(g, (u0 + u1) / 2, v, (x0 + x1) / 2);
  };

  // ---------- ストック（黒い樹脂：上の頬当ての棒・下の斜めの支え・床尾・付け根の箱） ----------
  B.add('slideDark', S.extrude([[0, 112], [0, 138], [10, 142], [230, 130], [290, 122], [290, 100], [230, 104], [16, 112]], 34, { bevel: 3 }));
  B.add('slideDark', S.extrude([[4, 36], [22, 36], [232, 88], [238, 102], [216, 102], [8, 52]], 18, { bevel: 2.5 }));
  B.add('slideDark', S.extrude([[-6, 34], [-6, 138], [4, 142], [10, 142], [10, 34]], 38, { bevel: 3 }));   // 床尾のゴム
  B.add('frame', S.extrude([[200, 84], [200, 120], [290, 118], [290, 84]], 30, { bevel: 2.5 }));            // 付け根の箱
  for (const u of [216, 244, 268]) B.add('slideDark', S.put(new THREE.CylinderGeometry(5, 5, 31, 8).rotateZ(Math.PI / 2), u, 102));
  // ---------- 引き金の箱・上のレール・AR 型のグリップ ----------
  B.add('frame', S.extrude([[280, 84], [280, 132], [400, 130], [400, 96], [384, 84]], 40, { bevel: 2 }));
  B.add('frame', S.box(300, 398, 132, 138, 20));
  for (let u = 304; u < 394; u += 10) B.add('slideDark', S.box(u, u + 5, 137.6, 139.4, 20));
  B.add('grip', S.extrude([[300, 86], [340, 86], [318, 10], [310, 2], [286, 2], [280, 12]], 30, { bevel: 3.5 }));
  B.add('detail', S.extrude([[344, 84], [351, 84], [352, 74], [355, 64], [351, 62], [347, 68], [345, 76]], 7, { bevel: 0.6 }), trigger);
  // ---------- 矢の台（上に溝・横に肉抜きの窓）・弦を掛ける爪 ----------
  B.add('frame', S.extrude([[376, 96], [376, 128], [880, 124], [904, 118], [904, 96]], 40, { bevel: 2 }));
  B.add('slideDark', S.box(380, 896, 125.6, 128.6, 6));
  for (const x of [-1, 1]) for (let u = 420; u < 840; u += 56) B.add('bore', S.extrude([[u, 102], [u + 38, 102], [u + 34, 118], [u + 4, 118]], 0.8, { bevel: 0, x: x * 20.2 }));
  B.add('detail', S.extrude([[NOCK - 20, 124], [NOCK + 4, 124], [NOCK, 136], [NOCK - 16, 136]], 16, { bevel: 1 }));
  B.add('detail', S.extrude([[392, 138], [408, 138], [406, 152], [394, 152]], 12, { bevel: 1 }));   // 照門（レールの上）
  // ---------- 前の台（弓を付ける所）・照星・大きな足掛け ----------
  B.add('frame', S.extrude([[856, 88], [856, 140], [910, 134], [910, 92]], 64, { bevel: 3 }));
  B.add('detail', S.extrude([[880, 136], [892, 136], [890, 154], [882, 154]], 6, { bevel: 0.8 }));   // 照星
  B.add('frame', S.extrude([[904, 60], [904, 106], [998, 112], [1010, 98], [1010, 44], [996, 32], [930, 40]], 14, {
    bevel: 2, holes: [[[916, 66], [916, 98], [992, 102], [998, 94], [998, 50], [990, 44], [936, 50]]],
  }));
  // ---------- 弓（左右のリム：外へ広がって後ろへ反る） ----------
  for (const s of [1, -1]) {
    B.add('barrel', bar(890, 30 * s, 870, 150 * s, 118, 12, 26));
    B.add('barrel', bar(870, 150 * s, 832, 290 * s, 118, 10, 22));
    B.add('barrel', bar(832, 290 * s, 806, 350 * s, 118, 9, 18));
    B.add('barrel', bar(806, 350 * s, 818, 364 * s, 118, 8, 16));            // 先の反り
    B.add('detail', S.put(new THREE.BoxGeometry(12, 20, 12), 816, 118, 360 * s));   // 弦を掛ける先
    // 弦：引いて掛けた形（先から爪へ）と、撃ったあとの形（先から前へ）
    B.add('detail', bar(816, 360 * s, NOCK, 0, AV - 4, 2.4, 2.4), stringC);
    B.add('detail', bar(816, 360 * s, REST, 0, AV - 4, 2.4, 2.4), stringR);
  }
  stringR.visible = false;
  // ---------- 前の下の矢筒（4本の予備の矢・後ろの受け皿・前の留め具） ----------
  for (const u of [760, 880]) B.add('frame', S.box(u - 8, u + 8, -12, 96, 14));
  B.add('slideDark', S.extrude([[600, -38], [600, -6], [608, 0], [652, 0], [660, -8], [660, -38], [652, -44], [608, -44]], 52, { bevel: 4 }));   // 受け皿
  B.add('frame', S.box(870, 890, -30, -8, 50));
  for (const x of [-18, -6, 6, 18]) {
    B.add('slide', S.rod(650, 960, -20, 3.5, 6, x));
    B.add('detail', S.put(new THREE.ConeGeometry(7, 26, 4).rotateX(-Math.PI / 2), 972, -20, x));
  }
  // ---------- 矢（胴・先のとがった鏃・後ろの羽3枚） ----------
  B.add('slide', S.rod(NOCK, 950, AV, 4, 6), arrow);
  B.add('detail', S.put(new THREE.ConeGeometry(8, 34, 4).rotateX(-Math.PI / 2), 966, AV), arrow);
  for (let i = 0; i < 3; i++) {
    const a = i / 3 * Math.PI * 2 + Math.PI / 2;
    B.add('mag', S.put(new THREE.BoxGeometry(1, 14, 60).rotateZ(-a + Math.PI / 2), NOCK + 40, AV + Math.sin(a) * 8, Math.cos(a) * 8), arrow);
  }

  if (opt.hand) {
    const rh = handMesh(opt.hand, 0.75, 0.95, 0.85); rh.position.copy(S.at(304, 44, 40)); B.root.add(rh);
    const lh = handMesh(opt.hand, 0.8, 0.8, 0.95); lh.position.set(-0.045, 0, 0); lhand.add(lh);
  }
  const muzzle = new THREE.Object3D(); muzzle.position.copy(S.at(980, AV));
  const eject = new THREE.Object3D(); B.root.add(eject);

  const shoot = (): Clip => ({
    dur: 0.3, hold: true,
    tracks: [
      ['arrow', 'vis', [[0, 1], [0.01, 0]]],
      ['stringC', 'vis', [[0, 1], [0.01, 0]]],
      ['stringR', 'vis', [[0, 0], [0.01, 1]]],
      ['stringR', 'pz', [[0, 0], [0.01, -0.02], [0.05, 0.01], [0.1, 0]]],
      ['trigger', 'rx', [[0, 0], [0.01, -0.3], [0.2, -0.3], [0.3, 0]]],
      ['root', 'rx', [[0, 0], [0.02, 0.06], [0.3, 0]]],
    ],
  });
  const toString = { x: 0.04, y: 0.05, z: -0.19 }, pulled = { x: 0.04, y: 0.05, z: 0.08 };
  const clips: Record<string, Clip> = {
    fire: shoot(), fireLast: shoot(),
    reload: {
      dur: 1, events: [[0.01, 'load'], [0.44, 'latch']],   // load：撃ったあとの形を止める
      tracks: [
        ['root', 'rx', [[0, 0], [0.12, -0.3], [0.56, -0.3], [0.66, 0.08], [0.9, 0.08], [1, 0]]],
        ['root', 'rz', [[0, 0], [0.12, 0.2], [0.9, 0.2], [1, 0]]],
        ['stringR', 'vis', [[0, 1], [0.44, 1], [0.441, 0]]],   // 左手が弦を後ろへ引いて、爪に掛ける
        ['stringC', 'vis', [[0, 0], [0.44, 0], [0.441, 1]]],
        ['arrow', 'vis', [[0, 0], [0.6, 0], [0.601, 1]]],
        ['arrow', 'py', [[0, 0], [0.6, 0.08], [0.72, 0.02], [0.8, 0]]],
        ['arrow', 'pz', [[0, 0], [0.6, 0.12], [0.72, 0.04], [0.8, 0]]],
        ...handPath([[0, {}], [0.2, toString], [0.5, pulled], [0.56, pulled], [0.6, { x: 0.02, y: 0.12, z: 0.12 }], [0.8, { x: 0.02, y: 0.06, z: 0.04 }], [0.92, {}]]),
      ],
    },
    inspect: inspectClip(0.9),
    equip: { dur: 0.6, tracks: [['root', 'rz', [[0, 0.3], [0.3, 0.12], [0.6, 0]]]] },
  };
  return makeGun({
    B, clips, muzzle, eject, skin: opt.skin || 'kurogane',
    info: { name: 'クロスボウ', real: '全長 約960mm・弓の幅 約720mm', reload: 2.4 },
    vm: { scale: 1, hip: new THREE.Vector3(), ads: new THREE.Vector3(), size: 0.82 },
    events: { load: anim => { anim.stop('fire'); anim.stop('fireLast'); } },
  });
}
