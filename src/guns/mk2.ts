// マークスマン Mk2（CoD の MK2 Carbine 風。マーリンのレバーアクション）見本
// 実銃の寸法：全長 約960mm・銃身 510mm。八角の銃身、下に筒型の弾倉、木のストック、小さなスコープ
//
// 動く部品：lever（レバー。右手も一緒に動く）・hammer（撃鉄）・trigger・lhand（左手：横の装填口から1発ずつ込める）
// 動き　　：fire（撃鉄が落ちる → レバーを下げて戻す・薬莢が上へ飛ぶ）・reload（銃を傾けて1発ずつ押し込む）・inspect・equip（レバーを往復）
import * as THREE from 'three';
import { P } from '../palette';
import { toon } from '../materials';
import { Clip } from './anim';
import { PartBuilder, makeSpace } from './kit';
import { handMesh, makeGun } from './model';

const S = makeSpace(262, 70);   // 原点：機関部の後ろの下（握る所の前）
const COCK = 0.5;               // 撃鉄を起こした角度
const OPEN = 0.8;               // レバーを下げる角度

export function buildMk2(opt: { skin?: string; hand?: THREE.Material } = {}) {
  const B = new PartBuilder(S);
  const lever = B.part('lever', [440, 67]);
  const hammer = B.part('hammer', [272, 104]);
  const trigger = B.part('trigger', [345, 70]);
  const lhand = B.part('lhand', [600, 66]);

  // ストック・先台（木）
  B.add('grip', S.extrude([[0, 18], [0, 94], [8, 99], [200, 100], [262, 95], [262, 72], [248, 62], [212, 56], [22, 18]], 38, { bevel: 3 }));
  B.add('detail', S.box(-8, 0, 18, 96, 40));                                   // 床尾のゴム
  B.add('grip', S.extrude([[450, 70], [450, 106], [720, 106], [730, 100], [730, 72], [720, 66], [460, 66]], 32, { bevel: 3 }));
  // 機関部・装填口（右）
  B.add('frame', S.extrude([[262, 70], [262, 104], [270, 110], [440, 110], [450, 104], [450, 70]], 26, { bevel: 2 }));
  B.add('bore', S.box(372, 410, 78, 90, 0.8, 13.3));
  // 銃身（八角）・筒型弾倉・銃身バンド・照星・銃口
  B.add('barrel', S.rod(450, 1030, 100, 9, 8));
  B.add('barrel', S.rod(450, 745, 80, 7, 8));
  B.add('frame', S.rod(745, 755, 80, 8, 8));
  B.add('frame', S.box(726, 742, 70, 110, 24));
  B.add('detail', S.extrude([[1000, 106], [1000, 116], [1014, 118], [1018, 112], [1018, 106]], 5, { bevel: 0.6 }));
  B.add('bore', S.rod(1030, 1031.8, 100, 4.5, 8));
  // スコープと台
  B.add('slide', S.rod(300, 560, 142, 12, 10));
  B.add('slide', S.rod(290, 330, 142, 16, 10));
  B.add('slide', S.rod(520, 572, 142, 19, 10));
  B.add('slide', S.box(410, 432, 154, 164, 14));
  B.add('frame', S.box(330, 346, 108, 132, 18));
  B.add('frame', S.box(494, 510, 108, 132, 18));
  B.add('bore', S.rod(572, 573.5, 142, 16, 10));
  // 撃鉄・引き金・レバー（指を入れる輪）
  B.add('detail', S.extrude([[268, 104], [276, 104], [276, 112], [272, 122], [264, 126], [258, 124], [262, 116]], 7, { bevel: 0.6 }), hammer);
  B.add('detail', S.extrude([[342, 70], [348, 70], [349, 62], [352, 54], [349, 52], [346, 56], [343, 64]], 6, { bevel: 0.6 }), trigger);
  B.add('frame', S.extrude([[300, 64], [440, 64], [444, 70], [300, 70]], 10, { bevel: 1 }), lever);
  B.add('frame', S.ring(318, 44, 22, 13, 10, 10, { bevel: 1 }), lever);

  // 手（右手はレバーと一緒に動く）・左手に込める弾
  if (opt.hand) {
    const rhand = B.part('rhand', [292, 54], lever);
    rhand.add(handMesh(opt.hand));
    const lh = handMesh(opt.hand, 0.8, 0.8, 0.95); lh.position.set(-0.01, -0.012, 0); lhand.add(lh);
    const round = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.055, 6).rotateX(Math.PI / 2), toon({ color: new THREE.Color(P.kin[1]) }));
    round.position.set(0.012, 0.012, -0.04); round.name = 'round'; lhand.add(round);
    B.parts.round = round; round.visible = false;
  }

  const muzzle = new THREE.Object3D(); muzzle.position.copy(S.at(1033, 100));
  const eject = new THREE.Object3D(); eject.position.copy(S.at(400, 114, 4)); B.root.add(eject);
  hammer.rotation.x = COCK;

  // 左手の行き先：右側の装填口（元の位置からのずれ）
  const gate = { x: 0.026, y: 0.014, z: 0.19 }, push = 0.025;
  const pushes = [0.2, 0.35, 0.5, 0.65];
  const clips: Record<string, Clip> = {
    fire: {
      dur: 1.0, events: [[0.45, 'eject']],
      tracks: [
        ['hammer', 'rx', [[0, 0], [0.012, -COCK], [0.35, -COCK], [0.45, 0]], 'lin'],
        ['trigger', 'rx', [[0, 0], [0.012, -0.3], [0.2, -0.3], [0.3, 0]]],
        ['lever', 'rx', [[0, 0], [0.3, 0], [0.45, OPEN], [0.5, OPEN], [0.65, 0]]],
        ['root', 'rx', [[0, 0], [0.3, 0], [0.45, 0.06], [0.65, 0]]],
        ['root', 'rz', [[0, 0], [0.3, 0], [0.45, -0.08], [0.65, 0]]],
      ],
    },
    // 長さ 1 で書き、リロード時間に合わせて伸ばす。4回押し込む
    reload: {
      dur: 1, events: pushes.map(t => [t, 'insert'] as [number, string]),
      tracks: [
        ['root', 'rz', [[0, 0], [0.1, 0.5], [0.85, 0.5], [1, 0]]],
        ['root', 'rx', [[0, 0], [0.1, 0.1], [0.85, 0.1], [1, 0]]],
        ['root', 'px', [[0, 0], [0.1, -0.04], [0.85, -0.04], [1, 0]]],
        ['root', 'py', [[0, 0], [0.1, 0.05], [0.85, 0.05], [1, 0]]],
        ['lhand', 'px', [[0, 0], [0.15, gate.x], [0.72, gate.x], [0.88, 0]]],
        ['lhand', 'py', [[0, 0], [0.15, gate.y], [0.72, gate.y], [0.88, 0]]],
        ['lhand', 'pz', [[0, 0], [0.15, gate.z], ...pushes.flatMap(t => [[t, gate.z + push], [t + 0.05, gate.z]] as [number, number][]), [0.72, gate.z], [0.88, 0]]],
        ['round', 'vis', [[0, 0], [0.15, 0], [0.151, 1], [0.7, 1], [0.701, 0]]],
      ],
    },
    inspect: {
      dur: 2.6,
      tracks: [
        ['root', 'ry', [[0, 0], [0.4, 0.7], [1.2, 0.7], [1.6, -0.5], [2.2, -0.5], [2.6, 0]]],
        ['root', 'rz', [[0, 0], [0.4, -0.25], [1.2, -0.1], [1.6, 0.35], [2.2, 0.35], [2.6, 0]]],
        ['root', 'px', [[0, 0], [0.4, -0.07], [2.2, -0.05], [2.6, 0]]],
        ['root', 'py', [[0, 0], [0.4, 0.04], [2.2, 0.04], [2.6, 0]]],
        ['lever', 'rx', [[0, 0], [1.6, 0], [1.8, OPEN * 0.6], [2.0, OPEN * 0.6], [2.2, 0]]],
      ],
    },
    equip: {
      dur: 0.8,
      tracks: [
        ['root', 'rz', [[0, 0.3], [0.3, 0.1], [0.6, 0]]],
        ['lever', 'rx', [[0, 0], [0.3, 0], [0.42, OPEN], [0.5, OPEN], [0.62, 0]]],
      ],
    },
  };
  return makeGun({
    B, clips, muzzle, eject, skin: opt.skin || 'mokume',
    info: { name: 'マークスマン Mk2', real: '全長 約1030mm・銃身 580mm（レバーアクション）', reload: 2.4 },
    vm: { scale: 0.95, yaw: -0.3, hip: new THREE.Vector3(0.17, -0.18, -0.28), ads: new THREE.Vector3(0.11, -0.22, -0.26) },
  });
}
