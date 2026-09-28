// M79 グレネードランチャー 見本
// 実銃の寸法：全長 731mm・銃身 356mm（40mm）。木のストックと先台、太い銃身、はしご形の照門。銃身を折って弾を込める
//
// 動く部品：barrel（銃身・先台・照門。前の下の蝶番で折れる）・trigger・lhand（左手：40mm弾を持つ）
// 動き　　：fire（強い反動）・reload（銃身を折る → 空の薬莢が飛ぶ → 弾を込める → 閉じる）・inspect・equip（折って閉じる）
import * as THREE from 'three';
import { P } from '../palette';
import { toon } from '../materials';
import { Clip } from './anim';
import { PartBuilder, makeSpace } from './kit';
import { handMesh, makeGun } from './model';

const S = makeSpace(300, 70);   // 原点：握る所の前
const OPEN = -0.6;              // 銃身を折る角度

export function buildM79(opt: { skin?: string; hand?: THREE.Material } = {}) {
  const B = new PartBuilder(S);
  const barrel = B.part('barrel', [392, 72]);   // 蝶番
  const trigger = B.part('trigger', [336, 64]);
  const lhand = B.part('lhand', [500, 50]);

  // ストック（木）・床尾のゴム・機関部・上の留め金
  B.add('grip', S.extrude([[0, 20], [0, 98], [10, 102], [180, 104], [300, 98], [300, 70], [270, 60], [210, 52], [20, 20]], 40, { bevel: 3 }));
  B.add('detail', S.box(-14, 0, 20, 100, 42));
  B.add('frame', S.extrude([[300, 64], [300, 106], [388, 106], [392, 96], [392, 64]], 36, { bevel: 2 }));
  B.add('detail', S.box(360, 382, 106, 113, 14));
  // 用心鉄・引き金
  B.add('frame', S.extrude([[310, 64], [310, 48], [316, 42], [362, 42], [368, 48], [368, 64]], 12, {
    bevel: 1, holes: [[[316, 60], [316, 49], [320, 46], [358, 46], [362, 50], [362, 60]]],
  }));
  B.add('detail', S.extrude([[333, 64], [339, 64], [340, 56], [343, 49], [340, 47], [336, 51], [334, 58]], 6, { bevel: 0.6 }), trigger);
  // 銃身（太い）・先台（木）・照門（はしご）・照星・銃口
  B.add('barrel', S.rod(392, 731, 100, 23, 10), barrel);
  B.add('bore', S.rod(730, 732.5, 100, 20, 10), barrel);
  B.add('grip', S.extrude([[394, 58], [394, 80], [560, 80], [572, 72], [560, 58]], 34, { bevel: 4 }), barrel);
  B.add('frame', S.box(430, 470, 121, 127, 24), barrel);
  for (const x of [-1, 1]) B.add('frame', S.box(440, 444, 127, 172, 3, x * 10), barrel);
  B.add('frame', S.box(437, 447, 168, 173, 24), barrel);
  B.add('detail', S.box(705, 712, 122, 134, 4), barrel);

  // 手・左手の40mm弾
  if (opt.hand) {
    const rh = handMesh(opt.hand); rh.position.copy(S.at(282, 66, 48)); B.root.add(rh);
    const lh = handMesh(opt.hand, 0.85, 0.8, 1.0); lh.position.x = -0.056; lhand.add(lh);
    const round = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.06, 8).rotateX(Math.PI / 2), toon({ color: new THREE.Color(P.kin[1]) }));
    const nose = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.02, 0.04, 8).rotateX(-Math.PI / 2), toon({ color: new THREE.Color(P.moegi[0]) }));
    nose.position.z = -0.05; round.add(body, nose);
    round.position.set(0, 0.035, -0.02); lhand.add(round);
    B.parts.round = round; round.visible = false;
  }
  const muzzle = new THREE.Object3D(); muzzle.position.copy(S.at(733, 100));
  const eject = new THREE.Object3D(); eject.position.copy(S.at(385, 104, 0)); B.root.add(eject);

  // 左手の行き先：開いた銃身の後ろ（元の位置からのずれ）
  const breech = { y: 0.06, z: 0.11 };
  const clips: Record<string, Clip> = {
    fire: {
      dur: 0.8,
      tracks: [
        ['trigger', 'rx', [[0, 0], [0.012, -0.3], [0.15, -0.3], [0.3, 0]]],
        ['root', 'rx', [[0, 0], [0.05, 0.14], [0.4, 0]]],
        ['root', 'pz', [[0, 0], [0.04, 0.03], [0.35, 0]]],
      ],
    },
    // 長さ 1 で書き、リロード時間に合わせて伸ばす
    reload: {
      dur: 1, events: [[0.25, 'eject'], [0.58, 'insert']],
      tracks: [
        ['root', 'rz', [[0, 0], [0.1, 0.3], [0.85, 0.3], [1, 0]]],
        ['root', 'rx', [[0, 0], [0.1, 0.2], [0.85, 0.2], [1, 0]]],
        ['root', 'px', [[0, 0], [0.1, -0.04], [0.85, -0.04], [1, 0]]],
        ['barrel', 'rx', [[0, 0], [0.12, 0], [0.22, OPEN], [0.7, OPEN], [0.8, 0]], 'out'],
        ['lhand', 'py', [[0, 0], [0.12, 0], [0.22, -0.06], [0.3, -0.25], [0.36, -0.25], [0.48, breech.y], [0.6, breech.y], [0.66, -0.05], [0.72, -0.02], [0.8, 0]]],
        ['lhand', 'pz', [[0, 0], [0.22, 0], [0.3, 0.05], [0.48, breech.z], [0.56, breech.z - 0.04], [0.6, breech.z - 0.04], [0.66, 0], [0.8, 0]]],
        ['round', 'vis', [[0, 0], [0.33, 0], [0.331, 1], [0.58, 1], [0.581, 0]]],
      ],
    },
    inspect: {
      dur: 2.6,
      tracks: [
        ['root', 'ry', [[0, 0], [0.4, 0.7], [1.2, 0.7], [1.6, -0.5], [2.2, -0.5], [2.6, 0]]],
        ['root', 'rz', [[0, 0], [0.4, -0.25], [1.2, -0.1], [1.6, 0.35], [2.2, 0.35], [2.6, 0]]],
        ['root', 'px', [[0, 0], [0.4, -0.07], [2.2, -0.05], [2.6, 0]]],
        ['root', 'py', [[0, 0], [0.4, 0.04], [2.2, 0.04], [2.6, 0]]],
        ['barrel', 'rx', [[0, 0], [1.6, 0], [1.8, OPEN * 0.7], [2.0, OPEN * 0.7], [2.15, 0]], 'out'],
      ],
    },
    equip: {
      dur: 0.8,
      tracks: [
        ['root', 'rz', [[0, 0.3], [0.3, 0.1], [0.6, 0]]],
        ['barrel', 'rx', [[0, OPEN], [0.35, OPEN], [0.45, 0]], 'in'],
      ],
    },
  };
  return makeGun({
    B, clips, muzzle, eject, skin: opt.skin || 'mokume',
    info: { name: 'M79', real: '全長 731mm・銃身 356mm（40mm・中折れ式）', reload: 2.6 },
    vm: { scale: 1, hip: new THREE.Vector3(), ads: new THREE.Vector3() },
  });
}
