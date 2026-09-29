// H&K MP5K 見本（短いMP5。ストックなし、前に縦のグリップ）
// 実銃の寸法：全長 325mm・銃身 115mm。丸い筒の機関部、左前にコッキングレバー、前の輪の照星、後ろの蓋
//
// 動く部品：handle（左前のコッキングレバー）・trigger・mag・lhand（左手：ふだんは前のグリップを握る）
// 動き　　：fire（引き金だけ。MP5 はレバーが動かない）・reload（HKスラップ：レバーを引いて上に掛ける → 弾倉を落として入れる → レバーを叩いて戻す）
// 　　　　　inspect・equip（引いて叩く）
import * as THREE from 'three';
import { Clip } from './anim';
import { PartBuilder, makeSpace } from './kit';
import { Addon, handMesh, makeGun } from './model';

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
    const rh = handMesh(opt.hand); rh.position.copy(S.at(46, 14, 44)); B.root.add(rh);
    const lh = handMesh(opt.hand, 0.8, 0.95, 0.85); lh.position.x = -0.045; lhand.add(lh);
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
  // ---------- スキンの飾り ----------
  const addons: Addon[] = [];
  const side = (g: THREE.BufferGeometry, u: number, v: number, x: number) => S.put(g, u, v, x, [0, Math.PI / 2, 0]);   // 横の面に貼る
  // テープ（R）：tape 前の握りと握りに巻いたテープ / lanyard 後ろの吊り輪から下がる紐と玉
  for (const v of [-22, 8, 38]) addons.push({ name: 'tape', slot: 'tape', geo: S.box(250, 290, v, v + 7, 32.5) });
  for (const v of [2, 30]) addons.push({ name: 'tape', slot: 'tape', geo: S.box(22 + (v + 42) * 0.08, 72 - (62 - v) * 0.1, v, v + 7, 34.5) });
  addons.push({ name: 'lanyard', slot: 'cord', geo: S.box(7.3, 8.7, 52, 84, 1.4) });
  addons.push({ name: 'lanyard', slot: 'tape', geo: S.put(new THREE.IcosahedronGeometry(5, 1), 8, 47) });
  addons.push({ name: 'lanyard', slot: 'cord', geo: S.put(new THREE.ConeGeometry(3, 11, 6), 8, 36) });
  // 電飾（SR）：led 機関部と下の両脇に光る線 / shroud 銃身の覆いと光る逃がし穴・銃口の光る輪 / glowGrip 前の握りの底の光
  for (const s of [1, -1]) {
    addons.push({ name: 'led', slot: 'line', geo: S.box(30, 290, 86, 88.4, 0.8, 14.3 * s) });
    addons.push({ name: 'led', slot: 'line', geo: S.box(26, 176, 63, 65, 0.8, 15.3 * s) });
  }
  addons.push({ name: 'shroud', slot: 'barrel', geo: S.rod(302, 336, 100, 13, 10) });
  for (let i = 0; i < 4; i++) addons.push({ name: 'shroud', slot: 'line', geo: S.box(306 + i * 7, 310 + i * 7, 96.5, 103.5, 27) });
  addons.push({ name: 'shroud', slot: 'line', geo: S.put(new THREE.TorusGeometry(10.5, 1.3, 4, 14), 336.6, 100) });
  addons.push({ name: 'glowGrip', slot: 'line', geo: S.box(255, 285, -34, -30.5, 29) });
  // からくり（LR）：gears 機関部の両脇の歯車3つ / pipes 右の脇を通る管 / gauge 上の圧力計 / key 後ろのぜんまいの鍵 / rivets 下の縁の鋲
  const gearGeo = (R: number, n: number) => {
    const sh = new THREE.Shape();
    for (let i = 0; i < n * 2; i++) { const a = i / (n * 2) * Math.PI * 2, r = i % 2 ? R - 3 : R, a2 = a + Math.PI / (n * 2); if (!i) sh.moveTo(r * Math.cos(a), r * Math.sin(a)); else sh.lineTo(r * Math.cos(a), r * Math.sin(a)); sh.lineTo(r * Math.cos(a2), r * Math.sin(a2)); }
    const hole = new THREE.Path(); hole.absarc(0, 0, R * 0.3, 0, Math.PI * 2, true); sh.holes.push(hole);
    return new THREE.ExtrudeGeometry(sh, { depth: 2.4, bevelEnabled: false, curveSegments: 6 }).translate(0, 0, -1.2);
  };
  for (const s of [1, -1]) for (const [u, v, R, n, rot] of [[120, 84, 16, 12, 0], [140.5, 70, 9, 8, 0.2], [214, 88, 11, 9, 0.1]]) {
    addons.push({ name: 'gears', slot: 'gear', geo: side(gearGeo(R, n).rotateZ(rot), u, v, 15.4 * s) });
    addons.push({ name: 'gears', slot: 'bolt', geo: S.put(new THREE.CylinderGeometry(R * 0.3, R * 0.3, 3, 8).rotateZ(Math.PI / 2), u, v, 15.6 * s) });
  }
  addons.push({ name: 'pipes', slot: 'gear', geo: S.rod(56, 252, 97, 2.4, 6, 16.2) });
  addons.push({ name: 'pipes', slot: 'gear', geo: S.put(new THREE.CylinderGeometry(2.4, 2.4, 26, 6), 252, 84, 16.2) });
  for (const [u, v] of [[252, 97], [56, 97]]) addons.push({ name: 'pipes', slot: 'gear', geo: S.put(new THREE.IcosahedronGeometry(3.6, 0), u, v, 16.2) });
  addons.push({ name: 'gauge', slot: 'gear', geo: S.put(new THREE.CylinderGeometry(9, 9, 4, 14), 96, 120) });
  addons.push({ name: 'gauge', slot: 'dial', geo: S.put(new THREE.CylinderGeometry(7.4, 7.4, 0.6, 14), 96, 122.2) });
  addons.push({ name: 'gauge', slot: 'bolt', geo: S.box(96, 102.5, 122.4, 123, 1) });
  addons.push({ name: 'key', slot: 'gear', geo: S.rod(-16, 0, 92, 2, 6) });
  for (const dv of [-8, 8]) addons.push({ name: 'key', slot: 'gear', geo: S.put(new THREE.TorusGeometry(6.2, 1.7, 4, 10), -19, 92 + dv) });
  for (const s of [1, -1]) for (let u = 34; u <= 290; u += 32) addons.push({ name: 'rivets', slot: 'bolt', geo: S.put(new THREE.SphereGeometry(2, 5, 3, 0, Math.PI * 2, 0, Math.PI / 2).rotateZ(-Math.PI / 2 * s), u, 67, 14.2 * s) });

  return makeGun({
    B, clips, muzzle, eject, addons, skin: opt.skin || 'kurogane',
    info: { name: 'MP5K', real: '全長 325mm・銃身 115mm', reload: 1.7 },
    vm: { scale: 1, hip: new THREE.Vector3(), ads: new THREE.Vector3() },
  });
}
