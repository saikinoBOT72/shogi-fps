// レミントン M870（ポンプ式ショットガン）見本
// 実銃の寸法：全長 約970mm・銃身 470mm。木のストックと先台、銃身の下に筒型の弾倉
//
// 動く部品：pump（先台。撃つたびに引いて戻す）・trigger・lhand（左手）
// 動き　　：fire（撃つ → ポンプを引いて戻す・薬莢が右へ）・reload（銃を傾けて、下の装填口へ1発ずつ押し込む → 最後にポンプ）
// 　　　　　inspect・equip（ポンプを引く）
import * as THREE from 'three';
import { P } from '../palette';
import { toon } from '../materials';
import { Clip } from './anim';
import { PartBuilder, makeSpace } from './kit';
import { handMesh, makeGun } from './model';

const S = makeSpace(300, 64);   // 原点：機関部の後ろの下
const PUMP = 0.09;              // ポンプを引く量（m）

export function buildM870(opt: { skin?: string; hand?: THREE.Material } = {}) {
  const B = new PartBuilder(S);
  const pump = B.part('pump', [700, 76]);
  const trigger = B.part('trigger', [372, 64]);
  const lhand = B.part('lhand', [700, 52]);

  // ストック（木）・床尾のゴム
  B.add('grip', S.extrude([[0, 20], [0, 92], [8, 97], [230, 100], [300, 98], [300, 72], [282, 60], [240, 52], [24, 20]], 38, { bevel: 3 }));
  B.add('detail', S.box(-10, 0, 20, 94, 40));
  // 機関部（上が丸い）・排莢口
  B.add('frame', S.extrude([[300, 64], [300, 104], [504, 104], [504, 64]], 30, { bevel: 2 }));
  B.add('frame', S.half(302, 502, 103, 14.8, 10));
  B.add('bore', S.box(400, 470, 88, 104, 0.8, 15.3));
  // 用心鉄・引き金
  B.add('frame', S.extrude([[330, 64], [330, 46], [338, 40], [410, 40], [418, 48], [418, 64]], 12, {
    bevel: 1, holes: [[[338, 60], [338, 48], [342, 45], [406, 45], [411, 50], [411, 60]]],
  }));
  B.add('detail', S.extrude([[369, 64], [375, 64], [376, 56], [379, 48], [376, 46], [372, 50], [370, 58]], 6, { bevel: 0.6 }), trigger);
  // 銃身・筒型弾倉・バンド・照星・銃口
  B.add('barrel', S.rod(504, 970, 100, 11, 8));
  B.add('barrel', S.rod(504, 900, 76, 10, 8));
  B.add('frame', S.rod(900, 915, 76, 11, 8));
  B.add('frame', S.box(880, 898, 68, 110, 22));
  B.add('detail', S.box(952, 958, 111, 116, 4));
  B.add('bore', S.rod(970, 971.8, 100, 9, 8));
  // 先台（ポンプ）：溝の入った木と、機関部へつながる金属の棒
  B.add('grip', S.extrude([[600, 58], [600, 92], [800, 92], [800, 58]], 40, { bevel: 5 }), pump);
  for (let u = 616; u < 790; u += 14) B.add('slideDark', S.box(u, u + 5, 57, 93, 41), pump);
  for (const x of [-1, 1]) B.add('barrel', S.box(505, 600, 72, 78, 2, x * 13), pump);

  // 手・左手に込める弾
  if (opt.hand) {
    const rh = handMesh(opt.hand); rh.position.copy(S.at(272, 66, 46)); B.root.add(rh);
    const lh = handMesh(opt.hand, 0.85, 0.8, 1.0); lh.position.x = -0.052; lhand.add(lh);
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.0105, 0.0105, 0.065, 8).rotateX(Math.PI / 2), toon({ color: new THREE.Color(P.shu[1]) }));
    shell.position.set(0, 0.03, -0.03); lhand.add(shell);
    B.parts.shell = shell; shell.visible = false;
  }
  const muzzle = new THREE.Object3D(); muzzle.position.copy(S.at(973, 100));
  const eject = new THREE.Object3D(); eject.position.copy(S.at(440, 96, 16)); B.root.add(eject);

  // ポンプ：先台と左手を一緒に引く
  const rack = (t0: number): [string, any, any, any?][] => [
    ['pump', 'pz', [[t0, 0], [t0 + 0.12, PUMP], [t0 + 0.18, PUMP], [t0 + 0.3, 0]]],
  ];
  const withHand = (tr: any[]) => tr.flatMap(t => [t, ['lhand', t[1], t[2], t[3]]]);
  // 装填口（下）への左手のずれ
  const port = { z: 0.25, y: -0.005 };
  const pushes = [0.22, 0.34, 0.46, 0.58];
  const clips: Record<string, Clip> = {
    fire: {
      dur: 0.8, events: [[0.42, 'eject']],
      tracks: [
        ['trigger', 'rx', [[0, 0], [0.012, -0.3], [0.1, -0.3], [0.2, 0]]],
        ...withHand(rack(0.28)),
        ['root', 'rz', [[0, 0], [0.28, 0], [0.4, 0.06], [0.6, 0]]],
      ] as any,
    },
    // 長さ 1 で書き、リロード時間に合わせて伸ばす
    reload: {
      dur: 1, events: [...pushes.map(t => [t, 'insert'] as [number, string]), [0.86, 'eject']],
      tracks: [
        ['root', 'rz', [[0, 0], [0.12, -0.7], [0.72, -0.7], [0.82, 0]]],
        ['root', 'rx', [[0, 0], [0.12, 0.12], [0.72, 0.12], [0.82, 0]]],
        ['root', 'py', [[0, 0], [0.12, 0.04], [0.72, 0.04], [0.82, 0]]],
        ['root', 'px', [[0, 0], [0.12, -0.04], [0.72, -0.04], [0.82, 0]]],
        ['lhand', 'pz', [[0, 0], [0.16, port.z], [0.7, port.z], [0.78, 0], [0.82, 0], [0.9, PUMP], [0.94, PUMP], [1, 0]]],
        ['lhand', 'py', [[0, 0], [0.16, port.y - 0.03], ...pushes.flatMap(t => [[t, port.y + 0.012], [t + 0.05, port.y - 0.03]] as [number, number][]), [0.7, port.y - 0.03], [0.78, 0]]],
        ['shell', 'vis', [[0, 0], [0.16, 0], [0.161, 1], [0.66, 1], [0.661, 0]]],
        ['pump', 'pz', [[0, 0], [0.82, 0], [0.9, PUMP], [0.94, PUMP], [1, 0]]],
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
      dur: 0.75,
      tracks: [
        ['root', 'rz', [[0, 0.3], [0.3, 0.1], [0.55, 0]]],
        ...withHand(rack(0.3)),
      ] as any,
    },
  };
  return makeGun({
    B, clips, muzzle, eject, skin: opt.skin || 'mokume',
    info: { name: 'M870', real: '全長 約970mm・銃身 470mm（ポンプ式）', reload: 2.2 },
    vm: { scale: 1, hip: new THREE.Vector3(), ads: new THREE.Vector3() },
  });
}
