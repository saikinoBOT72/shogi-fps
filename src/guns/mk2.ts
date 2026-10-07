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
import { Addon, handMesh, makeGun } from './model';

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
  B.add('bore', S.rod(289.4, 290, 142, 13.6, 20));                            // 接眼レンズ（覗くと真ん中が抜けて景色が見える）
  // 撃鉄・引き金・レバー（指を入れる輪）
  B.add('detail', S.extrude([[268, 104], [276, 104], [276, 112], [272, 122], [264, 126], [258, 124], [262, 116]], 7, { bevel: 0.6 }), hammer);
  B.add('detail', S.extrude([[342, 70], [348, 70], [349, 62], [352, 54], [349, 52], [346, 56], [343, 64]], 6, { bevel: 0.6 }), trigger);
  B.add('frame', S.extrude([[300, 64], [440, 64], [444, 70], [300, 70]], 10, { bevel: 1 }), lever);
  B.add('frame', S.ring(318, 44, 22, 13, 10, 10, { bevel: 1 }), lever);

  // 手（右手はレバーと一緒に動く）・左手に込める弾
  if (opt.hand) {
    const rhand = B.part('rhand', [292, 54], lever);
    const rh = handMesh(opt.hand); rh.position.x = 0.046; rhand.add(rh);
    const lh = handMesh(opt.hand, 0.8, 0.8, 0.95); lh.position.set(-0.05, -0.012, 0); lhand.add(lh);
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
  // ---------- スキンの飾り ----------
  const addons: Addon[] = [];
  const petal = (len: number, wid: number) => {
    const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.quadraticCurveTo(wid, len * 0.45, 0, len); sh.quadraticCurveTo(-wid, len * 0.45, 0, 0);
    return new THREE.ExtrudeGeometry(sh, { depth: 1, bevelEnabled: false, curveSegments: 3 }).translate(0, 5, -0.5);
  };
  const gem = (r: number) => new THREE.OctahedronGeometry(r, 0), ball = (r: number, d = 0) => new THREE.IcosahedronGeometry(r, d);
  const side = (g: THREE.BufferGeometry, u: number, v: number, x: number) => S.put(g, u, v, x, [0, Math.PI / 2, 0]);   // 横の面に貼る
  const stockTop = (u: number) => (u < 200 ? 99 + (u - 8) / 192 : 100 - (u - 200) * 5 / 62);                         // ストックの上の縁の高さ
  // 共通（SR）：scopeRings スコープの飾りの輪 / lens 光るスコープのレンズ / bands 銃身の飾りの輪 / studs ストックの上の縁の宝石
  for (const u of [372, 470]) addons.push({ name: 'scopeRings', slot: 'accent', geo: S.rod(u, u + 6, 142, 13.4, 10) });
  addons.push({ name: 'lens', slot: 'line', geo: S.rod(573.5, 574.4, 142, 15, 10) });
  for (const u of [800, 880, 960]) addons.push({ name: 'bands', slot: 'accent', geo: S.rod(u, u + 5, 100, 11, 8) });
  for (const s of [1, -1]) for (let u = 30; u <= 190; u += 20) addons.push({ name: 'studs', slot: 'gem', geo: S.put(gem(2.6), u, stockTop(u) - 8, 19.8 * s) });

  // 西部（R）：saddleRing 機関部の左の鞍の輪と、結んだ革紐 / tacks ストックに打った真鍮の鋲（ひし形と縁の列） / leverWrap レバーの輪の下半分に巻いた革
  addons.push({ name: 'saddleRing', slot: 'brass', geo: S.box(372, 388, 76, 84, 3, -14) });
  addons.push({ name: 'saddleRing', slot: 'brass', geo: S.put(new THREE.TorusGeometry(9, 1.7, 5, 14).rotateY(Math.PI / 2), 380, 66, -15.5) });
  for (const [u1, v1] of [[372, 26], [386, 30], [379, 22]]) {
    const du = u1 - 380, dv = v1 - 58, len = Math.hypot(du, dv);
    addons.push({ name: 'saddleRing', slot: 'leather', geo: S.put(new THREE.BoxGeometry(1.4, 3.2, len), 380 + du / 2, 58 + dv / 2, -15.5, [Math.atan2(-dv, -du), 0, 0]) });
  }
  addons.push({ name: 'saddleRing', slot: 'leather', geo: S.put(new THREE.IcosahedronGeometry(3, 0), 380, 57, -15.5) });
  const tack = (u: number, v: number, x: number) => S.put(new THREE.SphereGeometry(2.4, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2).rotateZ(-Math.PI / 2 * Math.sign(x)), u, v, x);
  for (const s of [1, -1]) {
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a), k = 1 / (Math.abs(c) / 22 + Math.abs(sn) / 15); addons.push({ name: 'tacks', slot: 'brass', geo: tack(118 + c * k, 64 + sn * k, 19.3 * s) }); }
    addons.push({ name: 'tacks', slot: 'brass', geo: tack(118, 64, 19.3 * s) });
    for (let u = 26; u <= 226; u += 20) addons.push({ name: 'tacks', slot: 'brass', geo: tack(u, stockTop(u) - 6, 19.3 * s) });
    for (let u = 40; u <= 200; u += 20) addons.push({ name: 'tacks', slot: 'brass', geo: tack(u, 18 + (u - 22) * 38 / 190 + 7, 19.3 * s) });
  }
  addons.push({ name: 'leverWrap', slot: 'leather', geo: S.put(new THREE.TorusGeometry(17.5, 5.4, 6, 14, Math.PI * 1.05).rotateZ(Math.PI * 0.98).rotateY(Math.PI / 2), 318, 44), part: lever });
  for (let i = 0; i < 7; i++) {
    const a = Math.PI * (1.05 + i * 0.14);
    addons.push({ name: 'leverWrap', slot: 'brass', geo: S.put(new THREE.TorusGeometry(5.6, 0.6, 3, 10).rotateX(Math.PI / 2).rotateY(Math.PI / 2 - a), 318 + Math.cos(a) * 17.5, 44 + Math.sin(a) * 17.5), part: lever });
  }

  // 狩猟（SR）：sling ストックの下から銃身バンドへ垂れる革の負い紐 / cuff ストックに巻いた革の弾差しと、差した予備弾5発
  {
    const P0 = [62, 24], P1 = [734, 68], sag = -34, N = 22;
    const at = (t: number) => [P0[0] + (P1[0] - P0[0]) * t, P0[1] + (P1[1] - P0[1]) * t + sag * 4 * t * (1 - t)];
    for (let i = 0; i < N; i++) {
      const [u0, v0] = at(i / N), [u1, v1] = at((i + 1) / N), du = u1 - u0, dv = v1 - v0, len = Math.hypot(du, dv);
      addons.push({ name: 'sling', slot: 'leather', geo: S.put(new THREE.BoxGeometry(2.2, 18, len + 0.6), (u0 + u1) / 2, (v0 + v1) / 2, -2, [Math.atan2(-dv, -du), 0, 0]) });
    }
    for (const [u, v] of [P0, P1]) addons.push({ name: 'sling', slot: 'round', geo: S.put(new THREE.TorusGeometry(5, 1.2, 4, 8).rotateY(Math.PI / 2), u, v + 4, -2) });
  }
  addons.push({ name: 'cuff', slot: 'leather', geo: S.box(34, 112, 34, 82, 42) });
  for (let u = 44; u <= 100; u += 14) {
    addons.push({ name: 'cuff', slot: 'round', geo: S.put(new THREE.CylinderGeometry(3.6, 3.6, 34, 8), u, 58, 22.6) });
    addons.push({ name: 'cuff', slot: 'leather', geo: S.box(u - 5, u + 5, 50, 56, 2, 21.6) });
  }

  // 紅蓮（燃える紅い蓮）：銃口の蓮・先台の光る線と蓮の紋・ストックの棘と結晶・機関部の火の玉・黒い鎖・紅く光るレンズ
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2;
    addons.push({ name: 'gr_lotus', slot: 'line', geo: S.put(petal(15, 5), 1024, 100, 0, [-0.95, 0, a]) });
    addons.push({ name: 'gr_lotus', slot: 'barrel', geo: S.put(petal(10, 3.5), 1026, 100, 0, [-0.7, 0, a + Math.PI / 8]) });
  }
  for (const s of [1, -1]) {
    for (const v of [80, 92]) for (const [u0, u1] of [[470, 578], [612, 716]]) addons.push({ name: 'gr_lines', slot: 'line', geo: S.box(u0, u1, v, v + 1.6, 0.8, 16.5 * s) });
    for (const a of [-0.6, 0, 0.6]) addons.push({ name: 'gr_lines', slot: 'barrel', geo: side(petal(11, 3.6).rotateZ(a), 595, 76, 16.9 * s) });
    for (const [du, dv, len, tilt] of [[0, 0, 16, 0.5], [12, -6, 11, 1.0], [-10, 4, 9, -0.2]]) {
      const g = new THREE.OctahedronGeometry(4, 0); g.scale(1, len / 4, 1);
      addons.push({ name: 'gr_shards', slot: 'accent', geo: S.put(g, 110 + du, 58 + dv, 21 * s, [0, 0, tilt * s]) });
    }
    addons.push({ name: 'gr_core', slot: 'barrel', geo: S.ring(318, 90, 10, 7, 2.4, 10, { x: 13.6 * s }) });
    addons.push({ name: 'gr_core', slot: 'line', geo: S.put(ball(5.5, 1), 318, 90, 14 * s) });
  }
  for (let u = 20; u <= 240; u += 22) addons.push({ name: 'gr_thorns', slot: 'barrel', geo: S.put(new THREE.ConeGeometry(3.2, 13, 5), u, stockTop(u) + 5, 0, [0.45, 0, 0]) });
  for (let i = 0; i <= 12; i++) {
    const t = i / 12, u = 272 + (160 - 272) * t, v = 74 + (60 - 74) * t - 34 * 4 * t * (1 - t);
    addons.push({ name: 'gr_chain', slot: 'frame', geo: S.put(new THREE.TorusGeometry(3.4, 1.1, 4, 8), u, v, 14.5 + 6 * t, [0, i % 2 ? Math.PI / 2 : 0, 0.3]) });
  }

  // 月下（月夜の狩人）：ストックの三日月・散らばる星・銃身バンドから下がる月の兎・ストックの下の羽根・スコープの月の円盤・光るレンズ
  const crescent = (r: number) => {
    const sh = new THREE.Shape(); sh.absarc(0, 0, r, 0, Math.PI * 2, false);
    const hole = new THREE.Path(); hole.absarc(r * 0.35, r * 0.25, r * 0.82, 0, Math.PI * 2, true); sh.holes.push(hole);
    return new THREE.ExtrudeGeometry(sh, { depth: 1, bevelEnabled: false, curveSegments: 10 }).translate(0, 0, -0.5);
  };
  for (const s of [1, -1]) {
    addons.push({ name: 'tk_moon', slot: 'line', geo: side(crescent(15), 110, 68, 19.8 * s) });
    for (const [u, v, r] of [[44, 62, 2.4], [70, 84, 1.8], [150, 80, 2.2], [178, 64, 1.6], [214, 78, 2], [500, 92, 2], [560, 78, 1.6], [640, 94, 2.2], [690, 80, 1.8]])
      addons.push({ name: 'tk_stars', slot: 'gem', geo: S.put(gem(r), u, v, (u > 400 ? 16.9 : 19.9) * s) });
  }
  addons.push({ name: 'tk_rabbit', slot: 'accent', geo: S.box(733, 735, 52, 70, 1.2) });
  addons.push({ name: 'tk_rabbit', slot: 'accent', geo: S.put(ball(5.5, 1).scale(1.25, 1, 1), 734, 44) });
  addons.push({ name: 'tk_rabbit', slot: 'accent', geo: S.put(ball(3.8, 1), 740, 50) });
  for (const x of [-1.6, 1.6]) addons.push({ name: 'tk_rabbit', slot: 'accent', geo: S.put(gem(1.4).scale(1, 4, 1), 742, 57, x, [0.3, 0, 0]) });
  addons.push({ name: 'tk_rabbit', slot: 'gem', geo: S.put(gem(0.9), 744, 51, 3.2) });
  addons.push({ name: 'tk_feather', slot: 'accent', geo: S.box(59, 61, 4, 26, 1.2) });
  for (const a of [Math.PI - 0.25, Math.PI + 0.2]) addons.push({ name: 'tk_feather', slot: 'accent', geo: side(petal(24, 4.5).rotateZ(a), 60, 4, 0) });
  addons.push({ name: 'tk_feather', slot: 'gem', geo: S.put(ball(2.6), 60, 3) });
  addons.push({ name: 'tk_disc', slot: 'line', geo: S.put(new THREE.CylinderGeometry(9, 9, 1.6, 16), 421, 165.2) });
  addons.push({ name: 'tk_lens', slot: 'line', geo: S.rod(573.5, 574.4, 142, 15, 10) });

  // ----- 竹林（LR 2つ目）：ck_ で始まる（色は後ろから銃口へ煤けた色の流れ。竹らしさは形で出す） -----
  //   ck_culm：銃身にかぶせた竹の筒（先台の前の金具より先。太さ 26mm）と節5つ（銃口に近いほど間隔が短い）・節の下の白い粉の帯
  //   ck_scope：スコープの筒も竹（台と台の間。節2つ） / ck_bands：ストックの付け根と先台の後ろを竹の節の帯で区切る
  //   ck_leaves：笹の小枝3つ（銃口の上・筒の1つ目の節の右・床尾の上）。照準の線（スコープの高さ）より上には出さない
  //   ck_canteen：先台の下から紐で吊るした竹筒の水筒（節と栓つき）
  // 色の流れ（図面の u に沿う）が乗るよう、uv を横から見た図面の mm にする
  const uvSide = (g: THREE.BufferGeometry) => {
    const p = g.attributes.position, uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) { uv[i * 2] = 262 - p.getZ(i) * 1000; uv[i * 2 + 1] = p.getY(i) * 1000 + 70; }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return g;
  };
  const culm = (name: string, u0: number, u1: number, v: number, r: number, nodes: number[], x = 0) => {
    addons.push({ name, slot: 'culm', geo: uvSide(S.rod(u0, u1, v, r, 14, x)) });
    for (const u of nodes) {
      addons.push({ name, slot: 'node', geo: uvSide(S.rod(u - 2.5, u + 2.5, v, r + 1.4, 14, x)) });
      addons.push({ name, slot: 'powder', geo: uvSide(S.rod(u - 6.5, u - 2.5, v, r + 0.15, 14, x)) });
    }
  };
  culm('ck_culm', 744, 1022, 100, 13, [796, 858, 910, 954, 992]);
  addons.push({ name: 'ck_culm', slot: 'node', geo: uvSide(S.rod(1020, 1023, 100, 13.6, 14)) });   // 切り口の縁
  culm('ck_scope', 347, 493, 142, 14.5, [402, 452]);
  addons.push({ name: 'ck_bands', slot: 'node', geo: uvSide(S.extrude([[214, 53], [224, 53], [224, 103.5], [214, 103.5]], 41.4, { bevel: 2 })) });
  addons.push({ name: 'ck_bands', slot: 'node', geo: uvSide(S.extrude([[586, 62.5], [596, 62.5], [596, 109.5], [586, 109.5]], 35.4, { bevel: 2 })) });
  // 笹の葉：細長く先が尖る。横から見た向き a（u から v へ）、長さ k 倍、横への開き tw
  const leaf = (len: number) => {
    const sh = new THREE.Shape(), w = len * 0.15;
    sh.moveTo(0, 0); sh.quadraticCurveTo(len * 0.3, w * 1.4, len, 0); sh.quadraticCurveTo(len * 0.3, -w * 1.4, 0, 0);
    return new THREE.ExtrudeGeometry(sh, { depth: 0.8, bevelEnabled: false, curveSegments: 5 }).translate(0, 0, -0.4);
  };
  const sprig = (u: number, v: number, x: number, list: [number, number, number][]) => {
    for (const [a, k, tw] of list) addons.push({ name: 'ck_leaves', slot: 'leaf', geo: S.put(leaf(62 * k).rotateZ(a).rotateY(Math.PI / 2).rotateY(tw), u, v, x) });
    addons.push({ name: 'ck_leaves', slot: 'node', geo: S.put(new THREE.IcosahedronGeometry(2.6, 0), u, v, x) });
  };
  sprig(1012, 113, 0, [[0.35, 1, 0.35], [0.12, 0.85, -0.4], [0.55, 0.75, -0.15], [-0.25, 0.7, 0.55]]);
  sprig(796, 104, 14, [[-0.6, 0.9, 0.5], [-1.1, 0.75, 0.25], [-0.2, 0.7, 0.7]]);
  sprig(40, 97, 0, [[2.4, 0.8, 0.4], [2.0, 0.7, -0.35], [2.8, 0.6, 0.1]]);
  // 水筒：横に寝かせた竹筒（節が真ん中、後ろに栓）。先台の下の2点から V 字の紐で吊る
  culm('ck_canteen', 652, 704, 18, 12, [679]);
  addons.push({ name: 'ck_canteen', slot: 'node', geo: uvSide(S.rod(645, 652, 18, 8, 10)) });
  for (const [a, b] of [[[664, 66], [660, 30]], [[694, 66], [698, 30]]] as [number, number][][])
    addons.push({ name: 'ck_canteen', slot: 'rope', geo: S.put(new THREE.TubeGeometry(new THREE.LineCurve3(new THREE.Vector3(0, a[1], -a[0]), new THREE.Vector3(0, b[1], -b[0])), 2, 1, 4, false), 0, 0) });
  return makeGun({
    B, clips, muzzle, eject, addons, skin: opt.skin || 'mokume', scope: { eye: S.at(289.2, 142), r: 0.016, rin: 0.0122 },
    info: { name: 'マークスマン Mk2', real: '全長 約1030mm・銃身 580mm（レバーアクション）', reload: 2.4 },
    vm: { size: 1.12, scale: 0.95, yaw: -0.3, hip: new THREE.Vector3(0.17, -0.18, -0.28), ads: new THREE.Vector3(0.11, -0.22, -0.26) },
  });
}
