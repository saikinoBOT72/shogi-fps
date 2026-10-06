// AK-47（固定ストック）見本
// 実銃の寸法：全長 880mm・銃身 415mm。木のストック・ハンドガード、曲がった30連弾倉
//
// 動く部品：carrier（ボルトキャリアと右側のコッキングハンドル）・trigger・mag（前を支点に揺すって外す）・lhand（左手）
// 動き　　：fire（キャリアが往復）・reload（左手で弾倉を揺すって外す → 新しい弾倉を前から掛けて戻す → 右側のハンドルを引く）
// 　　　　　inspect・equip（ハンドルを引く）。AK は弾切れでもキャリアは止まらない
import * as THREE from 'three';
import { Clip } from './anim';
import { PartBuilder, makeSpace } from './kit';
import { Addon, handMesh, makeGun } from './model';

const S = makeSpace(320, 62);   // 原点：グリップの付け根
const TRAVEL = 0.07;            // キャリアが下がる量（m）

export function buildAK47(opt: { skin?: string; hand?: THREE.Material } = {}) {
  const B = new PartBuilder(S);
  const carrier = B.part('carrier', [450, 92]);
  const trigger = B.part('trigger', [360, 62]);
  const mag = B.part('mag', [452, 62]);          // 前の上が支点（ここを中心に揺すって外す）
  const lhand = B.part('lhand', [600, 80]);

  // ストック・グリップ・ハンドガード（木）
  B.add('grip', S.extrude([[0, -26], [0, 74], [6, 79], [238, 97], [238, 66], [196, 56], [22, -26]], 38, { bevel: 3 }));
  B.add('detail', S.box(-5, 0, -27, 76, 40));                                   // 床尾板
  B.add('grip', S.extrude([[300, 62], [340, 62], [312, -42], [276, -40], [272, -30]], 30, { bevel: 2.5 }));
  B.add('grip', S.extrude([[522, 70], [522, 100], [690, 100], [690, 74], [680, 70]], 36, { bevel: 3, taper: [1, 0.9] }));
  B.add('grip', S.half(522, 700, 103, 14.5, 10));                          // 上のハンドガード（丸い）
  // 機関部・上の蓋・照門
  B.add('frame', S.extrude([[236, 62], [236, 98], [244, 101], [470, 101], [470, 96], [520, 96], [520, 66], [470, 62]], 26, { bevel: 1.5 }));   // 前は照門の台とハンドガードまで続く
  B.add('frame', S.box(514, 524, 66, 106, 30));   // ハンドガードの留め金
  B.add('slide', S.half(250, 468, 99, 12.5, 10));                         // 上の蓋（丸い）
  B.add('slide', S.extrude([[244, 99], [244, 104], [252, 106], [252, 99]], 18, { bevel: 1.5 }));   // 蓋の後ろの留め具
  B.add('frame', S.extrude([[468, 96], [468, 112], [480, 116], [518, 116], [518, 96]], 20, { bevel: 1.5 }));
  B.add('detail', S.box(482, 510, 113, 117, 14));
  // 用心鉄と引き金
  B.add('frame', S.extrude([[330, 62], [330, 44], [336, 38], [398, 38], [404, 44], [404, 62]], 10, {
    bevel: 1, holes: [[[337, 58], [337, 46], [341, 43], [393, 43], [398, 47], [398, 58]]],
  }));
  B.add('detail', S.extrude([[357, 62], [363, 62], [364, 54], [368, 47], [365, 45], [361, 49], [358, 56]], 7, { bevel: 0.7 }), trigger);
  // セレクター（右側の長いレバー）
  B.add('detail', S.extrude([[330, 86], [455, 90], [455, 95], [330, 92]], 2, { bevel: 0.4, x: 14 }));
  // ガスチューブ・ガスブロック・銃身・照星・銃口・クリーニングロッド
  B.add('barrel', S.rod(700, 760, 113, 9, 8));
  B.add('frame', S.extrude([[755, 96], [755, 122], [782, 122], [788, 108], [788, 96]], 20, { bevel: 1.5 }));
  B.add('barrel', S.rod(515, 870, 100, 8.5, 8));
  B.add('frame', S.extrude([[818, 94], [818, 112], [824, 136], [838, 136], [846, 112], [846, 94]], 12, { bevel: 1.2 }));
  B.add('detail', S.box(829, 834, 136, 145, 3));
  B.add('barrel', S.rod(866, 882, 100, 11, 8));
  B.add('bore', S.rod(881, 882.8, 100, 5, 8));
  B.add('barrel', S.rod(600, 860, 86, 2.5, 6));
  // 弾倉（横から見た弓なりの形）
  B.add('mag', S.extrude([[404, 62], [452, 62], [462, 24], [478, -20], [500, -64], [524, -104], [526, -112], [466, -120], [464, -112], [444, -70], [424, -25], [410, 20]], 24, { bevel: 1.5 }), mag);
  B.add('slideDark', S.extrude([[470, -106], [522, -100], [524, -106], [470, -112]], 25, { bevel: 0.5 }), mag);   // 底の縁
  // コッキングハンドル（右へ突き出た棒）
  B.add('detail', S.box(444, 456, 88, 96, 22, 24), carrier);
  B.add('slideDark', S.box(420, 468, 90, 97, 1, 13.4), carrier);   // キャリアの見える所

  // 手
  if (opt.hand) {
    const rh = handMesh(opt.hand); rh.position.copy(S.at(316, 18, 44)); B.root.add(rh);
    const lh = handMesh(opt.hand, 0.8, 0.8, 0.95); lh.position.set(-0.048, -0.01, 0); lhand.add(lh);
  }

  const muzzle = new THREE.Object3D(); muzzle.position.copy(S.at(884, 100));
  const eject = new THREE.Object3D(); eject.position.copy(S.at(452, 96, 15)).sub(carrier.userData.pivotAt); carrier.add(eject);

  // 左手の行き先（手の元の位置からのずれ）：弾倉・コッキングハンドル
  const toMag = { z: 0.16, y: -0.09 }, toHandle = { x: 0.034, y: 0.012, z: 0.148 };
  const clips: Record<string, Clip> = {
    fire: {
      dur: 0.09, events: [[0.02, 'eject']],
      tracks: [
        ['carrier', 'pz', [[0, 0], [0.02, TRAVEL], [0.075, 0]], 'out'],
        ['trigger', 'rx', [[0, 0], [0.01, -0.25], [0.06, -0.25], [0.09, 0]]],
      ],
    },
    reload: {
      dur: 1, events: [[0.3, 'magOut'], [0.58, 'magIn'], [0.8, 'rack']],
      tracks: [
        ['root', 'rz', [[0, 0], [0.1, 0.35], [0.85, 0.35], [1, 0]]],
        ['root', 'rx', [[0, 0], [0.1, 0.12], [0.55, 0.12], [0.6, 0.2], [0.64, 0.12], [0.85, 0.12], [1, 0]]],
        ['root', 'py', [[0, 0], [0.1, 0.04], [0.85, 0.04], [1, 0]]],
        ['root', 'px', [[0, 0], [0.1, -0.03], [0.85, -0.03], [1, 0]]],
        // 弾倉：前を支点に前へ揺すって外し、落とす → 新しいのを前から掛けて後ろへ戻す
        ['mag', 'rx', [[0, 0], [0.12, 0], [0.25, 0.45], [0.5, 0.45], [0.58, 0]]],
        ['mag', 'py', [[0, 0], [0.25, 0], [0.33, -0.25], [0.34, -0.25], [0.36, -0.2], [0.5, 0]]],
        ['mag', 'vis', [[0, 1], [0.33, 1], [0.331, 0], [0.359, 0], [0.36, 1]]],
        ['carrier', 'pz', [[0, 0], [0.7, 0], [0.76, TRAVEL], [0.78, TRAVEL], [0.8, 0]], 'lin'],
        ['lhand', 'px', [[0, 0], [0.62, 0], [0.7, toHandle.x], [0.8, toHandle.x], [0.92, 0]]],
        ['lhand', 'py', [[0, 0], [0.12, toMag.y], [0.25, toMag.y], [0.35, -0.3], [0.36, -0.3], [0.5, toMag.y], [0.58, toMag.y], [0.7, toHandle.y], [0.8, toHandle.y], [0.92, 0]]],
        ['lhand', 'pz', [[0, 0], [0.12, toMag.z], [0.58, toMag.z], [0.7, toHandle.z], [0.76, toHandle.z + TRAVEL], [0.8, toHandle.z + 0.05], [0.92, 0]]],
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
      dur: 0.7,
      tracks: [
        ['root', 'rz', [[0, 0.3], [0.35, 0.15], [0.6, 0]]],
        ['carrier', 'pz', [[0, 0], [0.3, 0], [0.38, TRAVEL], [0.44, 0]], 'lin'],
        ['lhand', 'px', [[0, 0], [0.2, toHandle.x], [0.5, toHandle.x], [0.62, 0]]],
        ['lhand', 'py', [[0, 0], [0.2, toHandle.y], [0.5, toHandle.y], [0.62, 0]]],
        ['lhand', 'pz', [[0, 0], [0.2, toHandle.z], [0.3, toHandle.z], [0.38, toHandle.z + TRAVEL], [0.44, toHandle.z + 0.05], [0.62, 0]]],
      ],
    },
  };
  // スキンの付け足し（SR 以上）：輪郭はほぼ変えない小さな部品
  //   brake：銃口の飾りマズルブレーキ（切り欠き2つ） / line：機関部の両脇に光る線
  //   charm：ハンドガードの留め金から下がる根付（紐とお守り） / plate：ストックの両脇の飾り板
  const addons: Addon[] = [
    { name: 'brake', slot: 'barrel', geo: S.rod(866, 898, 100, 12.5, 8) },
    { name: 'brake', slot: 'bore', geo: S.box(873, 879, 109, 113.5, 7) },
    { name: 'brake', slot: 'bore', geo: S.box(885, 891, 109, 113.5, 7) },
    { name: 'line', slot: 'line', geo: S.box(262, 462, 78, 80.5, 0.8, 13.3) },
    { name: 'line', slot: 'line', geo: S.box(262, 462, 78, 80.5, 0.8, -13.3) },
    { name: 'charm', slot: 'detail', geo: S.box(518, 520, 36, 66, 1.2) },
    { name: 'charm', slot: 'accent', geo: S.extrude([[510, 36], [528, 36], [528, 12], [519, 6], [510, 12]], 5, { bevel: 1 }) },
    { name: 'plate', slot: 'accent', geo: S.box(70, 150, 38, 54, 1, 19.6) },
    { name: 'plate', slot: 'accent', geo: S.box(70, 150, 38, 54, 1, -19.6) },
  ];
  //   rings：銃身の飾りの輪3つ / studs：ストックの上の縁に沿ったラインストーン / gems：ストック・機関部・照星の宝石
  //   chain：機関部の後ろからストックへ垂れる鎖（右側） / tassel：ストックの下の房 / bell：ガスブロックから下がる鈴
  const gem = (r: number) => new THREE.OctahedronGeometry(r, 0), ball = (r: number, d = 0) => new THREE.IcosahedronGeometry(r, d);
  for (const u of [706, 796, 852]) addons.push({ name: 'rings', slot: 'accent', geo: S.rod(u, u + 5, 100, 11, 8) });
  for (const s of [1, -1]) for (let u = 30; u <= 210; u += 22.5)
    addons.push({ name: 'studs', slot: 'gem', geo: S.put(gem(2.6), u, 79 + (u - 6) * 18 / 232 - 9, 19.8 * s) });
  for (const s of [1, -1]) {
    addons.push({ name: 'gems', slot: 'gem', geo: S.put(gem(6.5), 110, 46, 21 * s, [0, 0, Math.PI / 4]) });
    addons.push({ name: 'gems', slot: 'gem', geo: S.put(gem(4), 296, 88, 14.5 * s) });
  }
  addons.push({ name: 'gems', slot: 'gem', geo: S.put(gem(3.5), 831, 151) });
  for (let i = 0; i <= 10; i++) {
    const t = i / 10, u = 250 + (170 - 250) * t, v = 66 + (52 - 66) * t - 30 * 4 * t * (1 - t);
    addons.push({ name: 'chain', slot: 'accent', geo: S.put(new THREE.TorusGeometry(3, 0.9, 4, 8), u, v, 14.5 + 6 * t, [0, i % 2 ? Math.PI / 2 : 0, 0.3]) });
  }
  addons.push({ name: 'tassel', slot: 'detail', geo: S.box(18, 20, -50, -26, 1.2) });
  addons.push({ name: 'tassel', slot: 'accent', geo: S.put(ball(4.5), 19, -53) });
  addons.push({ name: 'tassel', slot: 'accent', geo: S.put(new THREE.ConeGeometry(6.5, 26, 8), 19, -70) });
  addons.push({ name: 'bell', slot: 'detail', geo: S.box(769, 771, 78, 96, 1.2) });
  addons.push({ name: 'bell', slot: 'accent', geo: S.put(ball(7, 1), 770, 70) });
  addons.push({ name: 'bell', slot: 'bore', geo: S.box(765, 775, 62.6, 64.4, 3) });   // 鈴の口の切れ目（下）

  // ----- 銃剣（R）：bayonet 銃身の下の柄と鍔、銃口の輪、銃口より前へ伸びる刃（背に小さなのこぎり） -----
  addons.push({ name: 'bayonet', slot: 'handle', geo: S.extrude([[764, 70], [856, 70], [858, 76], [856, 84], [764, 84], [760, 77]], 13, { bevel: 1.5 }) });
  addons.push({ name: 'bayonet', slot: 'bladeMetal', geo: S.box(754, 764, 68, 86, 15) });        // 柄頭
  addons.push({ name: 'bayonet', slot: 'bladeMetal', geo: S.box(856, 866, 64, 92, 16) });        // 鍔
  addons.push({ name: 'bayonet', slot: 'bladeMetal', geo: S.put(new THREE.TorusGeometry(11.5, 2, 5, 12), 866, 100) });   // 銃口の輪
  addons.push({ name: 'bayonet', slot: 'blade', geo: S.extrude([[866, 72], [986, 72], [1016, 80], [990, 88], [866, 88]], 3.2, { bevel: 0.6 }) });
  for (let u = 880; u < 960; u += 8) addons.push({ name: 'bayonet', slot: 'blade', geo: S.extrude([[u, 88], [u + 4, 91.5], [u + 8, 88]], 2.4, { bevel: 0 }) });
  // ----- 柄巻（SR）：wrap ハンドガードの両脇を刀の柄のように組紐でひし形に巻く・前後の巻き留め / knot 前の花結びと垂れる紐 -----
  {
    const U0 = 530, U1 = 682, V0 = 72, V1 = 98, n = 7, step = (U1 - U0) / n, dh = V1 - V0, len = Math.hypot(step, dh) + 2, ang = Math.atan2(dh, step);
    for (const s of [1, -1]) for (let i = 0; i < n; i++) for (const d of [1, -1]) {
      addons.push({ name: 'wrap', slot: 'cord', geo: S.put(new THREE.BoxGeometry(len, 3, 1.3).rotateZ(ang * d), U0 + step * (i + 0.5), (V0 + V1) / 2, 18.7 * s, [0, Math.PI / 2, 0]) });
    }
    for (const [u0, u1] of [[522, 530], [682, 690]]) addons.push({ name: 'wrap', slot: 'cord', geo: S.box(u0, u1, 69, 101.5, 38.4) });
    const petalK = (a: number) => { const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.quadraticCurveTo(5, 5, 0, 10); sh.quadraticCurveTo(-5, 5, 0, 0); return new THREE.ExtrudeGeometry(sh, { depth: 2, bevelEnabled: false, curveSegments: 4 }).translate(0, 0, -1).rotateZ(a); };
    for (const s of [1, -1]) {
      for (let k = 0; k < 4; k++) addons.push({ name: 'knot', slot: 'cord', geo: S.put(petalK(k * Math.PI / 2 + Math.PI / 4), 694, 72, 19.8 * s, [0, Math.PI / 2, 0]) });
      addons.push({ name: 'knot', slot: 'cord', geo: S.put(new THREE.IcosahedronGeometry(3.2, 0), 694, 72, 20.2 * s) });
      addons.push({ name: 'knot', slot: 'cord', geo: S.box(692.5, 694.5, 40, 70, 1.6, 20 * s) });
      addons.push({ name: 'knot', slot: 'cord', geo: S.put(new THREE.ConeGeometry(3.4, 14, 6), 693.5, 36, 20 * s) });
    }
  }

  // ----- 鬼：oni_ で始まる -----
  //   oni_horns：照門の台から後ろへ反る2本の角 / oni_fangs：ハンドガードの下の牙 / oni_studs：ストックの両脇の金棒の鋲
  //   oni_mask：ハンドガードの留め金から下がる鬼の面（角と光る目）
  for (const s of [1, -1]) {
    // 角は3つの節で、根元は太く上へ、先は後ろへ大きく反る
    addons.push({ name: 'oni_horns', slot: 'horn', geo: S.put(new THREE.CylinderGeometry(4.6, 6.5, 16, 6), 496, 124, 8 * s, [0.25, 0, -0.35 * s]) });
    addons.push({ name: 'oni_horns', slot: 'horn', geo: S.put(new THREE.CylinderGeometry(3, 4.6, 16, 6), 492, 138, 11 * s, [0.75, 0, -0.45 * s]) });
    addons.push({ name: 'oni_horns', slot: 'horn', geo: S.put(new THREE.ConeGeometry(3, 16, 6), 482, 148, 13.5 * s, [1.3, 0, -0.5 * s]) });
    for (const [u, h] of [[556, 11], [616, 13], [674, 20]]) addons.push({ name: 'oni_fangs', slot: 'horn', geo: S.put(new THREE.ConeGeometry(3.4, h, 5), u, 70 - h / 2, 8 * s, [Math.PI, 0, 0]) });
    // 鋲：ストックの上の縁と平行に3列、同じ間隔でそろえる（下の縁に近すぎる所には置かない）
    const top = (u: number) => 79 + (u - 6) * 18 / 232, bottom = (u: number) => -26 + (u - 22) * 82 / 174;
    for (let r = 0; r < 3; r++) for (let u = 44; u <= 212; u += 24) {
      const v = top(u) - 12 - r * 17;
      if (v - 8 < bottom(u)) continue;
      addons.push({ name: 'oni_studs', slot: 'stud', geo: S.put(new THREE.SphereGeometry(3.4, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2), u, v, 19.2 * s, [0, 0, -Math.PI / 2 * s]) });
    }
  }
  addons.push({ name: 'oni_mask', slot: 'detail', geo: S.box(518, 520, 44, 66, 1.2) });
  addons.push({ name: 'oni_mask', slot: 'mask', geo: S.put(new THREE.CylinderGeometry(10, 9, 3.5, 10).rotateZ(Math.PI / 2), 519, 32, 0) });
  for (const x of [-1, 1]) {
    addons.push({ name: 'oni_mask', slot: 'horn', geo: S.put(new THREE.ConeGeometry(2, 7, 5), 519 + x * 5, 45, 0, [0, 0, 0]) });
    addons.push({ name: 'oni_mask', slot: 'line', geo: S.box(519 + x * 4 - 1.8, 519 + x * 4 + 1.8, 33, 35.5, 5) });
  }
  addons.push({ name: 'oni_mask', slot: 'horn', geo: S.box(514, 524, 24, 26, 5) });   // 牙をむいた口

  // ----- 紅蓮だけの飾り（燃える紅い蓮）：gr_ で始まる -----
  //   gr_lotus：銃口を囲む蓮の花びら（外は光る紅、内は紅い金属） / gr_flames：ハンドガードの両脇に燃え上がる炎（外は紅、内は橙に光る）
  //   gr_thorns：ストックの上の縁に並ぶ紅い棘 / gr_shards：ストックの両脇に突き出た紅い結晶
  //   gr_core：機関部の両脇で光る火の玉と紅い輪 / gr_chain：機関部からストックへ垂れる黒い鎖
  const petal = (len: number, wid: number) => {
    const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.quadraticCurveTo(wid, len * 0.45, 0, len); sh.quadraticCurveTo(-wid, len * 0.45, 0, 0);
    return new THREE.ExtrudeGeometry(sh, { depth: 1.2, bevelEnabled: false, curveSegments: 3 }).translate(0, 7, -0.6);
  };
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2;
    addons.push({ name: 'gr_lotus', slot: 'line', geo: S.put(petal(22, 7), 872, 100, 0, [-0.95, 0, a]) });
    addons.push({ name: 'gr_lotus', slot: 'barrel', geo: S.put(petal(15, 5), 874, 100, 0, [-0.7, 0, a + Math.PI / 8]) });
  }
  // 炎：下は平ら、上はぎざぎざに燃え上がる（外の大きい炎と、内の小さい炎）
  const flame = (u0: number, u1: number, v0: number, tips: number[], k: number): [number, number][] => {
    const pts: [number, number][] = [[u0, v0]], n = tips.length, step = (u1 - u0) / n;
    tips.forEach((h, i) => { pts.push([u0 + step * (i + 0.2), v0 + h * k * 0.45]); pts.push([u0 + step * (i + 0.75), v0 + h * k]); });
    pts.push([u1, v0]); return pts;
  };
  const TIPS = [22, 34, 26, 40, 30, 44, 32, 24];
  // gr_hg：ハンドガードの両脇のシンプルな飾り（光る細い線2本と、真ん中の小さな蓮の紋）
  for (const s of [1, -1]) {
    for (const v of [80, 92]) for (const [u0, u1] of [[532, 590], [626, 684]]) addons.push({ name: 'gr_hg', slot: 'line', geo: S.box(u0, u1, v, v + 1.6, 0.8, 18.5 * s) });
    for (const a of [-0.6, 0, 0.6]) addons.push({ name: 'gr_hg', slot: 'barrel', geo: S.put(petal(11, 3.6).rotateZ(a), 608, 76, 18.9 * s, [0, Math.PI / 2, 0]) });
  }
  for (const s of [1, -1]) {
    addons.push({ name: 'gr_flames', slot: 'line', geo: S.extrude(flame(526, 690, 72, TIPS, 1), 1.2, { bevel: 0, x: 18.9 * s }) });
    addons.push({ name: 'gr_flames', slot: 'gem', geo: S.extrude(flame(540, 676, 72, TIPS, 0.55), 1.2, { bevel: 0, x: 19.9 * s }) });
  }
  for (let u = 26; u <= 226; u += 25)
    addons.push({ name: 'gr_thorns', slot: 'barrel', geo: S.put(new THREE.ConeGeometry(3.2, 13, 5), u, 79 + (u - 6) * 18 / 232 + 6, 0, [0.45, 0, 0]) });
  for (const s of [1, -1]) for (const [du, dv, len, tilt] of [[0, 0, 16, 0.5], [12, -6, 11, 1.0], [-10, 4, 9, -0.2]]) {
    const g = new THREE.OctahedronGeometry(4, 0); g.scale(1, len / 4, 1);
    addons.push({ name: 'gr_shards', slot: 'accent', geo: S.put(g, 120 + du, 40 + dv, 21 * s, [0, 0, tilt * s]) });
  }
  for (const s of [1, -1]) {
    addons.push({ name: 'gr_core', slot: 'barrel', geo: S.ring(398, 80, 10, 7, 2.4, 10, { x: 13.6 * s }) });
    addons.push({ name: 'gr_core', slot: 'line', geo: S.put(new THREE.IcosahedronGeometry(5.5, 1), 398, 80, 14 * s) });
  }
  for (let i = 0; i <= 12; i++) {
    const t = i / 12, u = 250 + (150 - 250) * t, v = 66 + (48 - 66) * t - 36 * 4 * t * (1 - t);
    addons.push({ name: 'gr_chain', slot: 'frame', geo: S.put(new THREE.TorusGeometry(3.4, 1.1, 4, 8), u, v, 14.5 + 6 * t, [0, i % 2 ? Math.PI / 2 : 0, 0.3]) });
  }

  // ----- 金継ぎ：kn_ で始まる（割れた銃を金で継いだ姿。案 B） -----
  //   kn_seams：ストック・グリップ・ハンドガード・弾倉を走る光る継ぎ目（左右で割れ方が少し違う）
  //   kn_staples：継ぎ目をまたぐ金の鎹 / kn_patches：ストックのかかとと弾倉の底の欠けを埋めた金
  //   kn_shards：割れて浮いている破片（ストックの後ろ1・銃口の上2、割れ口が光る）と銃口の金の粉
  type KP = [number, number];
  const SEAMS: { pts: KP[]; x: (v: number) => number; part?: THREE.Object3D; staple?: number[] }[] = [
    { pts: [[10, 40], [50, 54], [80, 36], [120, 62], [160, 58], [200, 82], [236, 92]], x: () => 19.4, staple: [1, 3] },   // ストック（長い方）
    { pts: [[24, 4], [58, 22], [90, 18], [118, 36], [150, 46]], x: () => 19.4, staple: [1] },                              // ストック（下の枝）
    { pts: [[306, 54], [316, 26], [304, -6], [298, -36]], x: () => 15.4 },                                                 // グリップ
    { pts: [[530, 96], [565, 80], [600, 96], [640, 76], [690, 90]], x: v => 18 * (1 - 0.1 * (v - 70) / 30) + 0.4, staple: [1, 3] },   // ハンドガード（上へ細くなる）
    { pts: [[420, 40], [438, 8], [470, -30], [456, -60], [492, -96]], x: () => 12.4, part: mag, staple: [1] },             // 弾倉
  ];
  const JIT = [5, -4, 6, -5, 4, -6];   // 左側は割れ方を少しずらす
  // a→b の帯（幅 w）。継ぎ目のつなぎ目が切れないよう、両端を w/2 だけ伸ばす
  const strip = (a: KP, b: KP, w: number): KP[] => {
    const du = b[0] - a[0], dv = b[1] - a[1], l = Math.hypot(du, dv), tu = du / l, tv = dv / l, nu = -tv * w / 2, nv = tu * w / 2;
    const cu = (a[0] + b[0]) / 2, cv = (a[1] + b[1]) / 2, h = l / 2 + w / 2;
    return [[cu - tu * h - nu, cv - tv * h - nv], [cu + tu * h - nu, cv + tv * h - nv], [cu + tu * h + nu, cv + tv * h + nv], [cu - tu * h + nu, cv - tv * h + nv]];
  };
  for (const s of [1, -1]) for (const sm of SEAMS) {
    const pts = sm.pts.map(([u, v], i) => (s > 0 || i === 0 || i === sm.pts.length - 1 ? [u, v] : [u, sm === SEAMS[3] ? Math.min(97, Math.max(74, v + JIT[i])) : v + JIT[i]]) as KP);
    for (let i = 0; i < pts.length - 1; i++) {
      const [a, b] = [pts[i], pts[i + 1]], x = sm.x((a[1] + b[1]) / 2);
      addons.push({ name: 'kn_seams', slot: 'line', geo: S.extrude(strip(a, b, 2.6), 1.2, { bevel: 0, x: x * s }), part: sm.part });
    }
    for (const i of sm.staple || []) {
      const [a, b] = [pts[i], pts[i + 1]], x = sm.x((a[1] + b[1]) / 2) + 0.3;
      // 鎹は継ぎ目と直角（幅 6mm・長さ 20mm）
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]), nu = -(b[1] - a[1]) / l * 7, nv = (b[0] - a[0]) / l * 7, mu = (a[0] + b[0]) / 2, mv = (a[1] + b[1]) / 2;
      addons.push({ name: 'kn_staples', slot: 'accent', geo: S.extrude(strip([mu - nu, mv - nv], [mu + nu, mv + nv], 6), 1.6, { bevel: 0.3, x: x * s }), part: sm.part });
    }
  }
  // 欠けを埋めた金：ストックの面取り（3mm 外へ広がる）と弾倉の面取り（1.5mm）を覆う大きさ
  addons.push({ name: 'kn_patches', slot: 'accent', geo: S.extrude([[-3.6, 44], [-3.6, 77], [4, 83.4], [50, 86], [38, 62], [16, 56]], 39.6, { bevel: 0.6 }) });
  addons.push({ name: 'kn_patches', slot: 'accent', geo: S.extrude([[462, -123], [529, -114.5], [528, -103], [512, -92], [486, -101], [462, -109]], 26, { bevel: 0.6 }), part: mag });
  // 浮く破片：木の欠片（三角すい）と、割れ口の面だけ光る板
  const shard = (r: number, u: number, v: number, x: number, rot: [number, number, number], part?: THREE.Object3D) => {
    const g = new THREE.TetrahedronGeometry(r, 0); g.scale(1, 1.6, 0.6);
    const p = g.attributes.position, A = new THREE.Vector3().fromBufferAttribute(p, 0), Bv = new THREE.Vector3().fromBufferAttribute(p, 1), Cv = new THREE.Vector3().fromBufferAttribute(p, 2);
    const n = Bv.clone().sub(A).cross(Cv.clone().sub(A)).normalize().multiplyScalar(0.4);
    const face = new THREE.BufferGeometry();
    face.setAttribute('position', new THREE.Float32BufferAttribute([A, Bv, Cv].flatMap(w => [w.x + n.x, w.y + n.y, w.z + n.z]), 3));
    face.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2));
    addons.push({ name: 'kn_shards', slot: 'shard', geo: S.put(g, u, v, x, rot), part });
    addons.push({ name: 'kn_shards', slot: 'line', geo: S.put(face, u, v, x, rot), part });
  };
  shard(13, -26, 112, 6, [0.4, 0.9, 0.3]);
  shard(12, 914, 134, 4, [1.1, 0.3, -0.6]);
  shard(9, 946, 116, -5, [-0.5, 1.4, 0.8]);
  shard(7, 972, 140, 2, [0.9, -0.7, 0.2]);
  shard(9, -42, 88, -8, [-0.8, 0.5, 1.2]);   // ストックの後ろにもう2つ
  shard(7, -20, 58, 14, [0.3, -1.1, -0.4]);
  shard(7, 612, 140, 10, [1.3, 0.6, -0.9]);   // ハンドガードの上（一人称で見える）
  shard(8, 540, -130, 6, [0.6, 0.9, 0.5], mag);   // 弾倉の底の欠けから落ちかけの破片（弾倉と一緒に動く）
  shard(6, 506, -142, -4, [-1.0, 0.4, 1.1], mag);
  for (const [u, v, x, r] of [[898, 100, 8, 2], [912, 112, -6, 1.6], [906, 86, 4, 1.4], [930, 96, -3, 1.8], [948, 106, 6, 1.3]])
    addons.push({ name: 'kn_shards', slot: 'line', geo: S.put(new THREE.IcosahedronGeometry(r, 0), u, v, x) });
  return makeGun({
    B, clips, muzzle, eject, addons, skin: opt.skin || 'mokume',
    info: { name: 'AK-47', real: '全長 880mm・銃身 415mm', reload: 2.0 },
    vm: { scale: 1.0, yaw: -0.3, hip: new THREE.Vector3(0.17, -0.17, -0.28), ads: new THREE.Vector3(0.11, -0.21, -0.26) },
  });
}
