// アキュラシー・インターナショナル AWM 見本（ゲームでよく見る AWP の形に寄せる）
// 実銃の寸法：全長 1230mm・銃身 686mm。大きな丸い親指の穴の銃床（後ろの下が突き出る・太い黒いゴムの当て・上に黒い頬当て）、
//   長い四角い先台と前の黒い蓋、丸い機関部とボルト、太い銃身と大きなマズルブレーキ、大きなスコープ、5連の箱形弾倉、先台の下に畳んだ二脚
//
// 動く部品：bolt（ボルト：起こして引く）・trigger・mag・lhand（左手：先台の下）
// 動き　　：fire（撃ったあと、ボルトを起こす → 引く（薬莢が飛ぶ）→ 押す → 倒す）・reload（弾倉を入れ替えて、ボルトを引いて押す）・inspect・equip
import * as THREE from 'three';
import { Clip, Track } from './anim';
import { PartBuilder, makeSpace } from './kit';
import { Addon, handMesh, makeGun } from './model';
import { inspectClip, handPath, magDrop, reloadTilt } from './std';

const S = makeSpace(390, 66);   // 原点：グリップの付け根
const BV = 136;                 // ボルト・銃身の中心の高さ
const LIFT = 1.2, BACK = 0.09;  // ボルトを起こす角度・引く量

export function buildAWM(opt: { skin?: string; hand?: THREE.Material } = {}) {
  const B = new PartBuilder(S);
  // 部品の uv を横から見た図面の mm にそろえる（丸い棒や箱も、墨染の色の流れ・樹脂のざらざらが図面の位置どおりに乗るように）
  const add0 = B.add.bind(B);
  B.add = (slot: string, g: THREE.BufferGeometry, to?: THREE.Object3D) => {
    const p = g.attributes.position, uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) { uv[i * 2] = 390 - p.getZ(i) * 1000; uv[i * 2 + 1] = p.getY(i) * 1000 + 66; }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return add0(slot, g, to);
  };
  const bolt = B.part('bolt', [410, BV]);
  const trigger = B.part('trigger', [420, 66]);
  const mag = B.part('mag', [518, 50]);
  const lhand = B.part('lhand', [740, 70]);
  const screw = (u: number, v: number, x: number, r = 3.4) => S.put(new THREE.CylinderGeometry(r, r, 2, 8).rotateZ(Math.PI / 2), u, v, x);
  // 図面の中の斜めの棒（u0,v0 → u1,v1、半径 r、横 x）
  const slant = (u0: number, v0: number, u1: number, v1: number, r: number, x = 0) => {
    const du = u1 - u0, dv = v1 - v0, l = Math.hypot(du, dv);
    return S.put(new THREE.CylinderGeometry(r, r, l, 8).rotateX(Math.atan2(-du, dv)), (u0 + u1) / 2, (v0 + v1) / 2, x);
  };

  // ---------- 銃床（緑の樹脂：後ろの下が突き出た床尾・大きな丸い親指の穴・グリップまで一体） ----------
  // 塗りの場所：銃床・先台は grip（色の付く樹脂）、スコープの筒は scope（無ければ frame の塗り）
  const THUMB = Array.from({ length: 16 }, (_, i) => [321 + Math.cos(i / 16 * Math.PI * 2) * 31, 38 + Math.sin(i / 16 * Math.PI * 2) * 29] as [number, number]);
  B.add('grip', S.extrude([
    [44, -29], [44, 107], [400, 107], [400, 70], [392, 66], [396, 10], [405, -31], [355, -31], [345, -28], [300, -2], [262, 14], [221, 24], [190, 12], [154, -29],
  ], 42, { bevel: 5, taper: [0.84, 1], holes: [THUMB] }));
  B.add('grip', S.extrude([[352, 66], [398, 66], [404, -31], [356, -31], [348, 10]], 44, { bevel: 7 }));   // グリップ（太く丸い握り）
  for (const s of [1, -1]) {
    for (const [u, v] of [[70, 92], [100, 92], [232, 92], [330, 92], [80, 0], [372, -16]]) B.add('detail', screw(u, v, s * 21.2));   // 留めねじ
    B.add('slideDark', S.box(60, 380, 84, 86, 0.6, s * 21.1));             // 上と下の合わせ目
  }
  B.add('detail', S.put(new THREE.TorusGeometry(6, 2, 5, 10), 140, -30, 0, [0, Math.PI / 2, 0]));   // 負い紐の輪（後ろの下）
  // 床尾：太い黒いゴムの当て（後ろが丸い）・間の板・上の黒い頬当て
  B.add('slideDark', S.extrude([[0, -22], [6, -30], [40, -30], [40, 118], [30, 124], [8, 122], [0, 110]], 50, { bevel: 6 }));
  B.add('frame', S.box(38, 46, -28, 114, 46));
  B.add('slideDark', S.extrude([[30, 107], [30, 116], [36, 121], [136, 121], [142, 116], [142, 107]], 40, { bevel: 3 }));
  // ---------- 先台（長い四角・前に黒い蓋・下に負い紐の輪と二脚） ----------
  B.add('grip', S.extrude([[392, 70], [392, 110], [822, 110], [826, 106], [826, 74], [822, 70]], 44, { bevel: 4, taper: [0.88, 1] }));
  B.add('slideDark', S.extrude([[820, 72], [820, 108], [834, 106], [836, 100], [836, 78], [834, 72]], 40, { bevel: 2.5 }));   // 前の蓋
  for (const s of [1, -1]) {
    for (const u of [470, 600, 700, 790]) B.add('detail', screw(u, 96, s * 22));
    B.add('slideDark', S.box(420, 810, 82, 84, 0.6, s * 21.8));             // 横の溝
  }
  B.add('detail', S.put(new THREE.TorusGeometry(6, 2, 5, 10), 760, 68, 0, [0, Math.PI / 2, 0]));   // 負い紐の輪（前）
  // 畳んだ二脚（付け根の台・前へ倒した2本の脚・先のゴム）
  B.add('frame', S.box(786, 818, 60, 70, 30));
  for (const s of [1, -1]) {
    B.add('frame', slant(800, 62, 1030, 92, 4.5, s * 10));
    B.add('slideDark', S.put(new THREE.CylinderGeometry(6, 6, 18, 8).rotateX(Math.atan2(-230, 30)), 1036, 93, s * 10));
  }
  // ---------- 機関部（黒く丸い）・上のレール・排莢口 ----------
  B.add('frame', S.rod(394, 624, BV, 17, 12));
  B.add('frame', S.extrude([[396, 108], [396, 128], [624, 128], [624, 108]], 40, { bevel: 2 }));   // 台座（銃床に載る所）
  B.add('frame', S.box(400, 620, 150, 157, 20));
  for (let u = 404; u < 616; u += 10) B.add('frame', S.box(u, u + 5, 157, 160, 20));
  B.add('bore', S.box(500, 562, 128, 148, 0.8, 17.6));                       // 排莢口（右）
  for (const s of [1, -1]) for (const u of [430, 600]) B.add('detail', screw(u, 118, s * 20.5, 3));
  // ---------- 銃身（根元が太い）・大きなマズルブレーキ（丸い筒に横の逃がし穴） ----------
  B.add('barrel', S.rod(620, 840, BV, 15, 10));
  B.add('barrel', S.rod(836, 1196, BV, 12, 10));
  B.add('barrel', S.rod(1192, 1249, BV, 17, 12));
  for (const s of [1, -1]) for (const u of [1200, 1214, 1228]) B.add('bore', S.box(u, u + 9, BV - 8, BV + 8, 2, s * 16.6));
  B.add('bore', S.rod(1248.5, 1250, BV, 6, 8));
  // ---------- 大きなスコープ（接眼・筒・つまみの台・前の大きなレンズ・2つの輪） ----------
  const SV = 190;
  for (const u of [430, 548]) {
    B.add('frame', S.extrude([[u - 9, 160], [u + 9, 160], [u + 7, SV - 10], [u - 7, SV - 10]], 18, { bevel: 1.5 }));
    B.add('frame', S.rod(u - 8, u + 8, SV, 15.5, 12));
    B.add('detail', screw(u, 166, 9.5, 2.5)); B.add('detail', screw(u, 166, -9.5, 2.5));
  }
  B.add('scope', S.rod(342, 384, SV, 19, 12));                               // 接眼
  B.add('scope', S.rod(380, 400, SV, 15, 12));
  B.add('scope', S.rod(396, 570, SV, 12, 12));                               // 筒
  B.add('scope', S.rod(470, 506, SV, 15, 12));                               // つまみの台
  B.add('detail', S.put(new THREE.CylinderGeometry(11, 11, 22, 12), 488, SV + 24));   // 上のつまみ
  B.add('detail', S.put(new THREE.CylinderGeometry(11, 11, 22, 12).rotateZ(Math.PI / 2), 488, SV, 25));   // 右のつまみ
  B.add('scope', S.put(new THREE.CylinderGeometry(22, 12, 44, 12).rotateX(-Math.PI / 2), 590, SV));   // 前へ広がる所
  B.add('scope', S.rod(610, 678, SV, 22, 14));                               // 前のレンズの筒
  B.add('bore', S.rod(677.5, 679, SV, 19, 14));
  B.add('bore', S.rod(341, 342.5, SV, 15, 12));
  // ---------- 用心鉄・引き金・弾倉・弾倉を外すレバー ----------
  B.add('frame', S.extrude([[398, 70], [402, 44], [410, 34], [444, 34], [452, 44], [452, 70]], 10, {
    bevel: 1, holes: [[[407, 68], [408, 47], [413, 40], [440, 40], [446, 47], [446, 68]]],
  }));
  B.add('detail', S.extrude([[416, 68], [423, 68], [424, 58], [427, 48], [423, 46], [419, 52], [417, 60]], 6, { bevel: 0.6 }), trigger);
  B.add('mag', S.extrude([[480, 72], [556, 72], [556, 32], [480, 32]], 32, { bevel: 1.5 }), mag);
  B.add('mag', S.box(476, 560, 26, 32, 36), mag);
  B.add('frame', S.box(462, 474, 52, 70, 10));                               // 弾倉を外すレバー
  // ---------- ボルト（丸い胴・後ろの蓋・右へ出た柄と丸いつまみ） ----------
  B.add('barrel', S.rod(400, 520, BV, 10, 8), bolt);
  B.add('slide', S.rod(386, 410, BV, 13, 10), bolt);                         // 後ろの蓋
  B.add('detail', S.put(new THREE.CylinderGeometry(4.5, 4.5, 40, 6).rotateZ(Math.PI / 2 + 0.5), 412, BV - 10, 30), bolt);
  B.add('detail', S.put(new THREE.IcosahedronGeometry(10, 1), 412, BV - 21, 48), bolt);

  if (opt.hand) {
    const rh = handMesh(opt.hand, 0.75, 0.95, 0.85); rh.position.copy(S.at(380, 20, 44)); B.root.add(rh);
    const lh = handMesh(opt.hand, 0.8, 0.8, 0.95); lh.position.set(-0.045, -0.005, 0); lhand.add(lh);
  }
  // ---------- スキンの付け足し ----------
  const addons: Addon[] = [];
  // a→b の帯（幅 w）を側面の形として返す（斜めの線用）
  const strip = (a: [number, number], b: [number, number], w: number): [number, number][] => {
    const du = b[0] - a[0], dv = b[1] - a[1], l = Math.hypot(du, dv), nu = -dv / l * w / 2, nv = du / l * w / 2;
    return [[a[0] - nu, a[1] - nv], [b[0] - nu, b[1] - nv], [b[0] + nu, b[1] + nv], [a[0] + nu, a[1] + nv]];
  };

  // R 競技札：先台の両脇の番号札（白い札に黒い「07」）・頬当てにかぶせた当て布と2本の留め帯・銃身の上の風見の小旗
  //   数字は7つの棒で作る。左の札は u を札の中心で折り返すと、左から見て正しく読める
  const SEG: Record<string, [number, number, number, number][]> = {   // 幅 14・高さ 22 の枠の中の棒 [u0,u1,v0,v1]
    a: [[0, 14, 19, 22]], b: [[11, 14, 11, 22]], c: [[11, 14, 0, 11]], d: [[0, 14, 0, 3]], e: [[0, 3, 0, 11]], f: [[0, 3, 11, 22]],
  };
  const DIGIT: Record<string, string> = { '0': 'abcdef', '7': 'abc' };
  for (const s of [1, -1]) {
    addons.push({ name: 'aw_bib', slot: 'bib', geo: S.box(630, 700, 77, 101, 1, 22.8 * s) });
    [...'07'].forEach((ch, i) => {
      for (const k of DIGIT[ch]) for (const [u0, u1, v0, v1] of SEG[k]) {
        let a = 646 + i * 22 + u0, b = 646 + i * 22 + u1;
        if (s < 0) [a, b] = [1330 - b, 1330 - a];   // 札の中心 665 で折り返す
        addons.push({ name: 'aw_bib', slot: 'ink', geo: S.box(a, b, 78 + v0, 78 + v1, 0.6, 23.6 * s) });
      }
    });
  }
  addons.push({ name: 'aw_pad', slot: 'cloth', geo: S.box(34, 138, 104, 124, 44) });
  for (const u of [58, 114]) addons.push({ name: 'aw_pad', slot: 'ink', geo: S.box(u - 4, u + 4, 102, 125.5, 45.4) });
  addons.push({ name: 'aw_flag', slot: 'ink', geo: S.box(998, 1002, 146, 186, 3) });
  addons.push({ name: 'aw_flag', slot: 'cloth', geo: S.extrude([[1002, 186], [1056, 178], [1002, 168]], 1, { bevel: 0 }) });

  // SR 撃墜記録：銃床に刻んだ金の数え線（4本＋斜めの1本の組）・先台の下から吊るした3つの薬莢・用心鉄の前から下がるドッグタグと鎖
  const tally = (u: number, v0: number, v1: number, x: number) => {
    for (let i = 0; i < 4; i++) addons.push({ name: 'aw_tally', slot: 'brass', geo: S.box(u + i * 7, u + i * 7 + 2.4, v0, v1, 1, x) });
    addons.push({ name: 'aw_tally', slot: 'brass', geo: S.extrude(strip([u - 3, v0 + 3], [u + 27, v1 - 3], 2.4), 1, { bevel: 0, x }) });
  };
  for (const s of [1, -1]) {
    tally(60, 20, 60, 20.6 * s);                                     // 床尾の近くの縦の所
    for (const u of [150, 206, 258]) tally(u, 46, 60, 21 * s);       // 親指の穴の手前に3組
  }
  // 薬莢：先台の前の下の輪から、長さの違う紐で3つ（撃ち終わった空の薬莢）
  addons.push({ name: 'aw_shells', slot: 'ink', geo: S.put(new THREE.TorusGeometry(5, 1.4, 4, 8), 742, 68, 0, [0, Math.PI / 2, 0]) });
  for (const [du, len] of [[-12, 38], [0, 56], [12, 30]]) {
    const u = 742 + du, top = 64, bot = top - len;
    addons.push({ name: 'aw_shells', slot: 'ink', geo: S.box(u - 0.6, u + 0.6, bot, top, 1.2) });
    addons.push({ name: 'aw_shells', slot: 'brass', geo: S.put(new THREE.CylinderGeometry(3.2, 3.2, 8, 8), u, bot - 4) });    // 首
    addons.push({ name: 'aw_shells', slot: 'brass', geo: S.put(new THREE.CylinderGeometry(6.2, 6.2, 34, 8), u, bot - 25) });  // 胴
  }
  // ドッグタグ：小さな輪の鎖と、少しずれて重なる2枚の札
  for (let i = 0; i < 7; i++) addons.push({ name: 'aw_tags', slot: 'ink', geo: S.put(new THREE.TorusGeometry(2.6, 0.8, 4, 6), 452 - i * 1.5, 44 - i * 5.2, 6, [0, i % 2 ? Math.PI / 2 : 0, 0]) });
  for (const [du, dv, rz] of [[0, 0, 0.15], [5, -4, -0.2]]) {
    const sh = new THREE.Shape(); sh.moveTo(-8, -13); sh.lineTo(8, -13); sh.lineTo(8, 9); sh.quadraticCurveTo(8, 13, 4, 13); sh.lineTo(-4, 13); sh.quadraticCurveTo(-8, 13, -8, 9); sh.lineTo(-8, -13);
    const g = new THREE.ExtrudeGeometry(sh, { depth: 1, bevelEnabled: false, curveSegments: 2 }).rotateY(Math.PI / 2).rotateX(rz);
    addons.push({ name: 'aw_tags', slot: 'tag', geo: S.put(g, 440 + du, -6 + dv, 6 + du * 0.3) });
  }

  // LR 墨染：白い紙の銃が、後ろから銃口へ墨（c1 → c2）に染まっていく（色の流れはスキンの fade）
  //   aw_brush：銃から浮いて走る筆の払い（上は c2 でスコープの上から銃口の先へ、下は c1 で弾倉の下から銃床の下へ）
  //     一人称で後ろから見ても見えるよう、払いの板は右へ傾ける。上の払いはスコープの上 40mm まで（狙いの邪魔をしない）
  //   aw_seal：床尾の近くの縦の所の落款（両側。四角の図柄） / aw_drops：銃口の先と床尾の後ろに浮く墨のしずく
  //   aw_splat：紙と墨の境目あたりに飛んだ墨の点（銃床・先台の横に貼る）
  const brush = (d: [number, number, number, number, number, number][], u0: number, v0: number, cu: number, cv: number, x: number, tilt: number) => {
    const sh = new THREE.Shape(); sh.moveTo(u0 - cu, v0 - cv);
    for (const [a, b, c, e, f, g] of d) sh.bezierCurveTo(a - cu, b - cv, c - cu, e - cv, f - cu, g - cv);
    const geo = new THREE.ExtrudeGeometry(sh, { depth: 2, bevelEnabled: false, curveSegments: 14 }).translate(0, 0, -1).rotateY(Math.PI / 2).rotateZ(tilt);
    return S.put(geo, cu, cv, x);
  };
  addons.push({ name: 'aw_brush', slot: 'brushA', geo: brush([[600, 272, 950, 268, 1260, 222], [950, 255, 600, 258, 330, 236]], 330, 236, 795, 246, 14, -0.6) });
  addons.push({ name: 'aw_brush', slot: 'brushB', geo: brush([[500, -64, 300, -64, 120, -44], [300, -54, 500, -49, 700, -34]], 700, -34, 410, -50, 12, 0.6) });
  for (const s of [1, -1]) {
    addons.push({ name: 'aw_seal', slot: 'seal', geo: S.box(60, 90, 40, 70, 1, 20.6 * s) });
    addons.push({ name: 'aw_seal', slot: 'paper', geo: S.box(65, 85, 45, 65, 1, 21.2 * s) });
    addons.push({ name: 'aw_seal', slot: 'seal', geo: S.box(69, 81, 49, 61, 1, 21.8 * s) });
    addons.push({ name: 'aw_seal', slot: 'seal', geo: S.box(73, 77, 45, 65, 1, 21.4 * s) });   // 縦の棒で図柄を割る
  }
  for (const [u, v, x, r] of [[1280, 136, 0, 8], [1305, 158, 6, 4], [1298, 116, -5, 3], [1262, 180, 4, 5], [1330, 142, -3, 3], [-30, 100, 4, 5], [-40, 60, -6, 3]])
    addons.push({ name: 'aw_drops', slot: 'drop', geo: S.put(new THREE.IcosahedronGeometry(r, 1), u, v, x) });
  const dot = (r: number) => new THREE.CylinderGeometry(r, r, 0.6, 8).rotateZ(Math.PI / 2);
  for (const s of [1, -1]) for (const [u, v, x, r] of [[262, 92, 21.4, 6], [200, 60, 20.8, 4.5], [90, 114, 20.4, 5], [470, 82, 22.6, 6], [540, 100, 22.6, 4]]) {
    addons.push({ name: 'aw_splat', slot: 'splat', geo: S.put(dot(r), u, v, x * s) });
    addons.push({ name: 'aw_splat', slot: 'splat', geo: S.put(dot(r * 0.45), u + r * 1.3, v + r * 0.5, x * s) });
    addons.push({ name: 'aw_splat', slot: 'splat', geo: S.put(dot(r * 0.35), u - r * 1.1, v - r * 0.9, x * s) });
  }

  const muzzle = new THREE.Object3D(); muzzle.position.copy(S.at(1251, BV));
  const eject = new THREE.Object3D(); eject.position.copy(S.at(530, BV, 22)); B.root.add(eject);

  // ボルトを起こして引き、押して倒す（t0 から dur 秒）
  const cycle = (t0: number, d: number): Track[] => [
    ['bolt', 'rz', [[0, 0], [t0, 0], [t0 + d * 0.2, LIFT], [t0 + d * 0.75, LIFT], [t0 + d, 0]]],
    ['bolt', 'pz', [[0, 0], [t0 + d * 0.2, 0], [t0 + d * 0.42, BACK], [t0 + d * 0.52, BACK], [t0 + d * 0.72, 0]]],
  ];
  const toBolt = { x: 0.1, y: 0.045, z: 0.33 }, toMag = { y: -0.05, z: 0.22 };
  const clips: Record<string, Clip> = {
    fire: {
      dur: 1.2, events: [[0.62, 'eject']],
      tracks: [
        ['trigger', 'rx', [[0, 0], [0.012, -0.3], [0.2, -0.3], [0.3, 0]]],
        ['root', 'rx', [[0, 0], [0.02, 0.12], [0.3, 0], [0.45, 0.05], [1.0, 0.05], [1.2, 0]]],
        ['root', 'rz', [[0, 0], [0.4, 0], [0.5, -0.12], [1.0, -0.12], [1.2, 0]]],
        ...cycle(0.45, 0.65),
      ],
    },
    reload: {
      dur: 1, events: [[0.28, 'magOut'], [0.54, 'magIn'], [0.76, 'rack']],
      tracks: [
        ...reloadTilt(0.1, 0.9, 0.3, 0.1, 0.03),
        ...magDrop(0.28, 0.54, 0.26),
        ...cycle(0.66, 0.26),
        ...handPath([[0, {}], [0.18, toMag], [0.28, { ...toMag, y: toMag.y - 0.22 }], [0.34, { ...toMag, y: toMag.y - 0.22 }], [0.54, toMag], [0.6, toMag], [0.66, toBolt], [0.78, { ...toBolt, z: toBolt.z + BACK }], [0.88, toBolt], [0.96, {}]]),
      ],
    },
    inspect: inspectClip(1.5),
    equip: {
      dur: 0.9,
      tracks: [['root', 'rz', [[0, 0.3], [0.35, 0.15], [0.6, 0]]], ...cycle(0.25, 0.5)],
    },
  };
  return makeGun({
    B, clips, muzzle, eject, addons, skin: opt.skin || 'olive', scope: { eye: S.at(340.8, 190), r: 0.019, rin: 0.015 },
    info: { name: 'AWM', real: '全長 1230mm・銃身 686mm（ボルトアクション・5連）', reload: 2.8 },
    vm: { scale: 1, hip: new THREE.Vector3(), ads: new THREE.Vector3() },
  });
}
