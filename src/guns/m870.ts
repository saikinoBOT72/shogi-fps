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
import { Addon, handMesh, makeGun } from './model';

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
  // 細部：引き金の組のピン・後ろの安全ボタン・左のスライドを外すレバー・排莢口の奥のボルト・床尾のゴムのねじ・負い紐の金具
  //   スキンの飾り（左の予備弾 318〜394・機関部の光る線 v70/79・LR の装甲板）の場所はよける
  const pin = (u: number, v: number, x: number, r = 2.6) => S.put(new THREE.CylinderGeometry(r, r, 1.4, 8).rotateZ(Math.PI / 2), u, v, x);
  for (const s of [1, -1]) for (const u of [350, 392]) B.add('detail', pin(u, 75, s * 15.3));
  B.add('detail', S.put(new THREE.CylinderGeometry(3.4, 3.4, 34, 8).rotateZ(Math.PI / 2), 424, 70));   // 安全ボタン（左右に貫く）
  B.add('detail', S.extrude([[424, 64], [432, 64], [436, 52], [430, 50]], 2.4, { bevel: 0.4, x: -7 }));   // スライドを外すレバー（左）
  B.add('slideDark', S.box(406, 464, 90, 102, 1, 13.6));                     // 排莢口の奥のボルト
  for (const v of [34, 80]) B.add('detail', S.put(new THREE.CylinderGeometry(3, 3, 1.4, 8).rotateX(Math.PI / 2), -10.6, v));   // 床尾のゴムのねじ
  B.add('frame', S.put(new THREE.TorusGeometry(4.5, 1.4, 5, 10), 150, 34, 0, [0, Math.PI / 2, 0]));     // 負い紐の金具
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
  // ---------- スキンの飾り ----------
  const addons: Addon[] = [];
  const petal = (len: number, wid: number) => {
    const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.quadraticCurveTo(wid, len * 0.45, 0, len); sh.quadraticCurveTo(-wid, len * 0.45, 0, 0);
    return new THREE.ExtrudeGeometry(sh, { depth: 1, bevelEnabled: false, curveSegments: 3 }).translate(0, 5, -0.5);
  };
  const plate = (pts: [number, number][], depth = 1) => new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y))), { depth, bevelEnabled: false }).translate(0, 0, -depth / 2);
  const gem = (r: number) => new THREE.OctahedronGeometry(r, 0), ball = (r: number, d = 0) => new THREE.IcosahedronGeometry(r, d);
  const side = (g: THREE.BufferGeometry, u: number, v: number, x: number) => S.put(g, u, v, x, [0, Math.PI / 2, 0]);   // 横の面に貼る
  const stockTop = (u: number) => (u < 230 ? 97 + (u - 8) * 3 / 222 : 100 - (u - 230) * 2 / 70);
  // 共通（SR）：shells 機関部の左の予備弾（弾差し） / bands 銃身の飾りの輪 / studs ストックの上の縁の宝石
  addons.push({ name: 'shells', slot: 'frame', geo: S.box(318, 394, 80, 100, 2, -16) });
  for (let u = 324; u <= 388; u += 12) {
    addons.push({ name: 'shells', slot: 'gem', geo: S.put(new THREE.CylinderGeometry(5.2, 5.2, 18, 8), u, 94, -19.5) });
    addons.push({ name: 'shells', slot: 'accent', geo: S.put(new THREE.CylinderGeometry(5.5, 5.5, 4, 8), u, 83, -19.5) });
  }
  for (const u of [818, 850, 930]) addons.push({ name: 'bands', slot: 'accent', geo: S.rod(u, u + 6, 100, 13, 8) });
  for (const s of [1, -1]) for (let u = 30; u <= 250; u += 22) addons.push({ name: 'studs', slot: 'gem', geo: S.put(gem(2.6), u, stockTop(u) - 8, 19.8 * s) });

  // 紅蓮（燃える紅い蓮）：銃口の蓮・機関部の光る線・先台の蓮の紋・ストックの棘と結晶・機関部の火の玉・黒い鎖
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2;
    addons.push({ name: 'gr_lotus', slot: 'line', geo: S.put(petal(17, 5.5), 962, 100, 0, [-0.95, 0, a]) });
    addons.push({ name: 'gr_lotus', slot: 'barrel', geo: S.put(petal(11, 4), 964, 100, 0, [-0.7, 0, a + Math.PI / 8]) });
  }
  for (const s of [1, -1]) {
    for (const v of [70, 79]) addons.push({ name: 'gr_lines', slot: 'line', geo: S.box(306, 498, v, v + 1.6, 0.8, 15.4 * s) });
    for (const a of [-0.6, 0, 0.6]) addons.push({ name: 'gr_lines', slot: 'line', geo: side(petal(12, 4).rotateZ(a), 700, 70, 20.5 * s), part: pump });
    for (const [du, dv, len, tilt] of [[0, 0, 16, 0.5], [12, -6, 11, 1.0], [-10, 4, 9, -0.2]]) {
      const g = new THREE.OctahedronGeometry(4, 0); g.scale(1, len / 4, 1);
      addons.push({ name: 'gr_shards', slot: 'accent', geo: S.put(g, 120 + du, 60 + dv, 21 * s, [0, 0, tilt * s]) });
    }
    addons.push({ name: 'gr_core', slot: 'barrel', geo: S.ring(350, 90, 10, 7, 2.4, 10, { x: 15.6 * s }) });
    addons.push({ name: 'gr_core', slot: 'line', geo: S.put(ball(5.5, 1), 350, 90, 16 * s) });
  }
  for (let u = 20; u <= 280; u += 26) addons.push({ name: 'gr_thorns', slot: 'barrel', geo: S.put(new THREE.ConeGeometry(3.2, 13, 5), u, stockTop(u) + 5, 0, [0.45, 0, 0]) });
  for (let i = 0; i <= 12; i++) {
    const t = i / 12, u = 310 + (190 - 310) * t, v = 68 + (58 - 68) * t - 34 * 4 * t * (1 - t);
    addons.push({ name: 'gr_chain', slot: 'frame', geo: S.put(new THREE.TorusGeometry(3.4, 1.1, 4, 8), u, v, 16.5 + 4 * t, [0, i % 2 ? Math.PI / 2 : 0, 0.3]) });
  }

  // 警備（R）：light 弾倉の筒の下の小さなライト（黒い筒・留め具・光るレンズ）
  addons.push({ name: 'light', slot: 'lightBody', geo: S.rod(852, 904, 58, 7, 10) });
  addons.push({ name: 'light', slot: 'lightBody', geo: S.box(866, 884, 58, 72, 9) });
  addons.push({ name: 'light', slot: 'lens', geo: S.rod(904, 905.4, 58, 6, 10) });
  // 祭（SR）：lanterns 銃身バンドとストックの下から下がる提灯 / fan ストックの両脇の扇（紙と骨と要）
  const lantern = (u: number, v: number, top: number) => {
    addons.push({ name: 'lanterns', slot: 'detail', geo: S.box(u - 0.7, u + 0.7, v + 10, top, 1.4) });
    addons.push({ name: 'lanterns', slot: 'lantern', geo: S.put(new THREE.CylinderGeometry(7.5, 7.5, 16, 10), u, v) });
    for (const dv of [-9, 9]) addons.push({ name: 'lanterns', slot: 'detail', geo: S.put(new THREE.CylinderGeometry(4.8, 4.8, 2.6, 10), u, v + dv) });
    for (const dv of [-4, 0, 4]) addons.push({ name: 'lanterns', slot: 'detail', geo: S.put(new THREE.TorusGeometry(7.6, 0.5, 3, 12).rotateX(Math.PI / 2), u, v + dv) });
  };
  lantern(889, 44, 68); lantern(58, 2, 26);
  {
    const FU = 132, FV = 44, R = 40, r0 = 11, a0 = 0.35, a1 = Math.PI - 0.35;
    const sh = new THREE.Shape(); sh.moveTo(r0 * Math.cos(a0), r0 * Math.sin(a0)); sh.absarc(0, 0, R, a0, a1, false); sh.lineTo(r0 * Math.cos(a1), r0 * Math.sin(a1)); sh.absarc(0, 0, r0, a1, a0, true);
    const paper = new THREE.ExtrudeGeometry(sh, { depth: 1, bevelEnabled: false, curveSegments: 12 }).translate(0, 0, -0.5);
    for (const s of [1, -1]) {
      addons.push({ name: 'fan', slot: 'fanPaper', geo: side(paper, FU, FV, 19.7 * s) });
      for (let k = 0; k <= 7; k++) {
        const a = a0 + (a1 - a0) * k / 7, rib = new THREE.BoxGeometry(R - 4, 1.3, 1.2).translate((R - 4) / 2 + 2, 0, 0).rotateZ(a);
        addons.push({ name: 'fan', slot: 'fanRib', geo: side(rib, FU, FV, 20.4 * s) });
      }
      addons.push({ name: 'fan', slot: 'fanRib', geo: S.put(new THREE.CylinderGeometry(3, 3, 2, 8).rotateZ(Math.PI / 2), FU, FV, 20.8 * s) });
    }
  }

  // 重装（LR）：hv_armor 機関部・先台・ストックを覆う分厚い装甲板（角を落とした板）と上の装甲 / hv_bolts 板を留める六角ボルト
  //   hv_vents 装甲の光る排気口 / hv_fins 先台と銃身バンドのあいだの放熱のひれ / hv_brake 銃口の大きなブレーキ（横の逃がし穴と光る輪）
  const chamfer = (u0: number, u1: number, v0: number, v1: number, c: number): [number, number][] => [[u0 + c, v0], [u1 - c, v0], [u1, v0 + c], [u1, v1 - c], [u1 - c, v1], [u0 + c, v1], [u0, v1 - c], [u0, v0 + c]];
  const hexBolt = (u: number, v: number, x: number, part?: THREE.Object3D) => addons.push({ name: 'hv_bolts', slot: 'bolt', geo: S.put(new THREE.CylinderGeometry(2.6, 2.6, 2, 6).rotateZ(Math.PI / 2), u, v, x), part });
  for (const s of [1, -1]) {
    // 機関部：前後2枚（右は排莢口の下だけ）
    addons.push({ name: 'hv_armor', slot: 'armor', geo: S.extrude(chamfer(304, 398, 68, 101, 6), 2.6, { bevel: 0.8, x: 16.2 * s }) });
    addons.push({ name: 'hv_armor', slot: 'armor', geo: S.extrude(chamfer(404, 500, 67, 86, 5), 2.6, { bevel: 0.8, x: 16.2 * s }) });
    for (const [u, v] of [[311, 75], [391, 75], [311, 94], [391, 94], [411, 76.5], [493, 76.5]]) hexBolt(u, v, 17.9 * s);
    for (const v of [80, 85, 90]) addons.push({ name: 'hv_vents', slot: 'line', geo: S.box(328, 372, v, v + 2, 1, 17.6 * s) });
    // 先台（ポンプと一緒に動く）：大きな板と光る細い窓
    addons.push({ name: 'hv_armor', slot: 'armor', geo: S.extrude(chamfer(606, 794, 60, 90, 7), 2.6, { bevel: 0.8, x: 21.2 * s }), part: pump });
    for (const [u, v] of [[614, 67], [786, 67], [614, 83], [786, 83]]) hexBolt(u, v, 22.9 * s, pump);
    for (const u of [640, 680, 720, 760]) addons.push({ name: 'hv_vents', slot: 'line', geo: S.box(u, u + 14, 73, 77, 1, 22.6 * s), part: pump });
    // ストック：斜めの縁に沿った板
    addons.push({ name: 'hv_armor', slot: 'armor', geo: S.extrude([[132, 62], [284, 72], [294, 80], [294, 94], [286, 97], [140, 96], [126, 88], [126, 70]], 2.6, { bevel: 0.8, x: 20.2 * s }) });
    for (const [u, v] of [[140, 72], [140, 88], [282, 80], [282, 91]]) hexBolt(u, v, 21.9 * s);
  }
  addons.push({ name: 'hv_armor', slot: 'armor', geo: S.extrude(chamfer(308, 498, 114, 121, 3), 22, { bevel: 1 }) });
  for (const u of [330, 400, 470]) addons.push({ name: 'hv_vents', slot: 'line', geo: S.box(u, u + 20, 121, 122, 12) });
  for (let u = 808; u <= 872; u += 8) addons.push({ name: 'hv_fins', slot: 'fin', geo: S.rod(u, u + 3, 100, 16, 10) });
  addons.push({ name: 'hv_brake', slot: 'armor', geo: S.extrude(chamfer(950, 992, 84, 116, 5), 30, { bevel: 1.2 }) });
  for (const u of [958, 968, 978]) addons.push({ name: 'hv_brake', slot: 'bore', geo: S.box(u, u + 5, 90, 110, 31) });
  addons.push({ name: 'hv_brake', slot: 'line', geo: S.put(new THREE.TorusGeometry(9.5, 1.3, 4, 14), 992.4, 100) });
  addons.push({ name: 'hv_brake', slot: 'bore', geo: S.rod(991, 992.6, 100, 8.5, 10) });

  // ----- 種子島（LR 2つ目）：tg_ で始まる -----
  //   tg_bands：銃身と弾倉をまとめる真鍮の帯2本・銃身だけの帯2本（先台が下がってくる所より前だけ）
  //   tg_plate：機関部の両脇の火皿の板（小さな皿つき） / tg_crest：ストックの両脇の紋（輪と3つの丸。架空）
  //   tg_cord：ストックの付け根から機関部の右を通り、銃身の右を波打って進み、前で銃身に2周巻いて銃口でくすぶる火縄（先が光り、細い煙）
  //   tg_tassel：ストックの下から下がる紐と玉と房
  // 横から見た幅の形 (x, v) を、u0 から 12mm の厚さで前へ押し出す（帯のように銃を囲む部品用）
  const band = (sh: THREE.Shape, u0: number, len = 12) => {
    const g = new THREE.ExtrudeGeometry(sh, { depth: len, bevelEnabled: true, bevelSize: 0.8, bevelThickness: 0.8, bevelSegments: 1, curveSegments: 8 }).rotateY(Math.PI);
    g.scale(1 / 1000, 1 / 1000, 1 / 1000); g.translate(0, -64 / 1000, -(u0 - 300) / 1000);
    return g;
  };
  const stadium = new THREE.Shape(); stadium.absarc(0, 100, 12.6, 0, Math.PI, false); stadium.absarc(0, 76, 11.6, Math.PI, Math.PI * 2, false);
  const ringB = new THREE.Shape(); ringB.absarc(0, 100, 12.6, 0, Math.PI * 2, false);
  for (const u of [818, 856]) addons.push({ name: 'tg_bands', slot: 'accent', geo: band(stadium, u) });
  for (const u of [924, 944]) addons.push({ name: 'tg_bands', slot: 'accent', geo: band(ringB, u, 10) });
  for (const s of [1, -1]) {
    const plate = new THREE.Shape(); plate.moveTo(322, 72); plate.lineTo(386, 72); plate.quadraticCurveTo(392, 72, 392, 78); plate.lineTo(392, 90); plate.quadraticCurveTo(392, 96, 386, 96); plate.lineTo(322, 96); plate.quadraticCurveTo(316, 96, 316, 90); plate.lineTo(316, 78); plate.quadraticCurveTo(316, 72, 322, 72);
    addons.push({ name: 'tg_plate', slot: 'accent', geo: S.extrude(plate.getPoints(3).map(p => [p.x, p.y] as [number, number]), 2, { bevel: 0.4, x: 15.9 * s }) });
    addons.push({ name: 'tg_plate', slot: 'accent', geo: S.put(new THREE.CylinderGeometry(6, 6, 6, 10, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2), 382, 96, 17 * s) });   // 火皿
    addons.push({ name: 'tg_crest', slot: 'accent', geo: S.ring(120, 58, 22, 18.5, 1.6, 20, { bevel: 0, x: 19.8 * s }) });
    for (const a of [Math.PI / 2, Math.PI / 2 + 2.094, Math.PI / 2 + 4.189])
      addons.push({ name: 'tg_crest', slot: 'accent', geo: S.put(new THREE.CylinderGeometry(6.5, 6.5, 1.6, 12).rotateZ(Math.PI / 2), 120 + 8.5 * Math.cos(a), 58 + 8.5 * Math.sin(a), 19.8 * s) });
  }
  {
    // 火縄の道：(u, v, x)。先台（v 92 まで・幅 ±20）には触れない高さを通る
    //   ストックの右の面（x 19）→ 機関部の右の平らな面（x 15）→ 銃身の右（半径 11）の横を波打つ → 前の金具（880〜898）より前で1周半巻く
    const P: [number, number, number][] = [[200, 92, 21], [236, 97, 20.5], [280, 98, 17.3], [340, 96, 17.4], [420, 99, 17.4], [500, 101, 16]];
    for (let i = 0; i < 19; i++) P.push([524 + i * 20, i % 2 ? 103 : 98.5, 13.4]);
    for (let i = 0; i <= 18; i++) { const t = i / 18, a = t * Math.PI * 3; P.push([904 + t * 54, 100 + 13.6 * Math.sin(a), 13.6 * Math.cos(a)]); }
    P.push([962, 112, 8], [966, 116, 4]);
    const curve = new THREE.CatmullRomCurve3(P.map(([u, v, x]) => new THREE.Vector3(x, v, -u)));
    addons.push({ name: 'tg_cord', slot: 'rope', geo: S.put(new THREE.TubeGeometry(curve, 160, 2.4, 5, false), 0, 0) });
    addons.push({ name: 'tg_cord', slot: 'ember', geo: S.put(new THREE.IcosahedronGeometry(4, 1), 967, 117, 3) });
    const smoke = new THREE.CatmullRomCurve3(([[968, 121, 3], [962, 134, 4], [970, 148, 2], [964, 164, 4]] as [number, number, number][]).map(([u, v, x]) => new THREE.Vector3(x, v, -u)));
    addons.push({ name: 'tg_cord', slot: 'smoke', geo: S.put(new THREE.TubeGeometry(smoke, 16, 1.3, 4, false), 0, 0) });
  }
  addons.push({ name: 'tg_tassel', slot: 'rope', geo: S.box(39, 41, -8, 24, 1.4) });
  addons.push({ name: 'tg_tassel', slot: 'tassel', geo: S.put(new THREE.IcosahedronGeometry(5, 1), 40, -12) });
  addons.push({ name: 'tg_tassel', slot: 'tassel', geo: S.put(new THREE.ConeGeometry(7, 28, 8), 40, -30) });
  return makeGun({
    B, clips, muzzle, eject, addons, skin: opt.skin || 'mokume',
    info: { name: 'M870', real: '全長 約970mm・銃身 470mm（ポンプ式）', reload: 2.2 },
    vm: { scale: 1, hip: new THREE.Vector3(), ads: new THREE.Vector3() },
  });
}
