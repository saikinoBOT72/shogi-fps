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
import { Addon, handMesh, makeGun } from './model';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

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
  // ---------- スキンの飾り ----------
  const addons: Addon[] = [];
  const side = (g: THREE.BufferGeometry, u: number, v: number, x: number) => S.put(g, u, v, x, [0, Math.PI / 2, 0]);   // 横の面に貼る
  const tube = (pts: [number, number, number][], r: number, seg = 60) =>
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(([du, dv, x]) => new THREE.Vector3(x, dv, -du))), seg, r, 6, false);
  const spiral = (r0: number, r1: number, turns: number, dir = 1, a0 = 0): [number, number, number][] =>
    Array.from({ length: 30 }, (_, i) => { const t = i / 29, a = a0 + dir * t * turns * Math.PI * 2, r = r0 + (r1 - r0) * t; return [Math.cos(a) * r, Math.sin(a) * r, 0] as [number, number, number]; });
  const petal = (len: number, wid: number) => {
    const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.quadraticCurveTo(wid, len * 0.45, 0, len); sh.quadraticCurveTo(-wid, len * 0.45, 0, 0);
    return new THREE.ExtrudeGeometry(sh, { depth: 1.4, bevelEnabled: false, curveSegments: 3 }).translate(0, 5, -0.7);
  };
  // たくさんの小さな部品は1つの形にまとめる（描く回数を減らす）
  const merged = (name: string, slot: string, geos: THREE.BufferGeometry[], part?: THREE.Object3D) => addons.push({ name, slot, geo: mergeGeometries(geos.map(g => (g.index ? g.toNonIndexed() : g))), part });

  // 花火筒（R）：paperWrap 銃身に巻いた紙4枚と、両端を縛った縄 / fuse 紙から紙へ渡る導火線と、先の火花 / fireball 用心鉄から下がる花火玉
  for (const u of [470, 530, 590, 650]) {
    addons.push({ name: 'paperWrap', slot: 'paper', geo: S.rod(u, u + 36, 100, 24.2, 12), part: barrel });
    for (const du of [2, 34]) addons.push({ name: 'paperWrap', slot: 'rope', geo: S.put(new THREE.TorusGeometry(24.6, 1.5, 5, 16), u + du, 100), part: barrel });
  }
  {
    const pts: [number, number, number][] = [];
    for (let i = 0; i <= 40; i++) { const t = i / 40, u = 470 + 216 * t; pts.push([u - 470, 125 + Math.sin(t * Math.PI * 7) * 2.2, Math.sin(t * Math.PI * 3.5) * 6]); }
    addons.push({ name: 'fuse', slot: 'fuseCord', geo: S.put(tube(pts, 1, 120), 470, 0, 0), part: barrel });
    addons.push({ name: 'fuse', slot: 'spark', geo: S.put(new THREE.OctahedronGeometry(3.4, 0), 688, 126), part: barrel });
    for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; addons.push({ name: 'fuse', slot: 'spark', geo: S.put(new THREE.BoxGeometry(0.6, 0.6, 7).translate(0, 0, -4).rotateX(Math.cos(a) * 0.9).rotateY(Math.sin(a) * 0.9), 688, 126), part: barrel }); }
  }
  addons.push({ name: 'fireball', slot: 'rope', geo: S.box(338, 340, 18, 42, 1.4) });
  addons.push({ name: 'fireball', slot: 'paper', geo: S.put(new THREE.IcosahedronGeometry(11, 1), 339, 6) });
  for (const r of [0, Math.PI / 2]) addons.push({ name: 'fireball', slot: 'rope', geo: S.put(new THREE.TorusGeometry(11.2, 1, 4, 14).rotateY(r), 339, 6) });

  // 潜水（SR）：dv_ports ストックの両脇の丸窓（縁・ガラス・鋲） / dv_valve 機関部の右のバルブの輪と、ストックへ伸びる管
  //   dv_gauge 銃身の上の水深計（文字盤と針） / dv_bands 銃身の鋲打ちの帯2本 / dv_anchor ストックの下から下がる錨
  const porthole = (u: number, v: number, x: number, r: number) => {
    const s = Math.sign(x);
    addons.push({ name: 'dv_ports', slot: 'brass', geo: S.put(new THREE.TorusGeometry(r, r * 0.22, 5, 16).rotateY(Math.PI / 2), u, v, x) });
    addons.push({ name: 'dv_ports', slot: 'glass', geo: S.put(new THREE.CylinderGeometry(r * 0.85, r * 0.85, 1, 16).rotateZ(Math.PI / 2), u, v, x - s * 0.3) });
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; addons.push({ name: 'dv_ports', slot: 'brass', geo: S.put(new THREE.IcosahedronGeometry(1.2, 0), u + Math.cos(a) * r * 1.35, v + Math.sin(a) * r * 1.35, x) }); }
  };
  for (const s of [1, -1]) { porthole(140, 66, 20.6 * s, 11); porthole(232, 80, 20.6 * s, 9); }
  {
    const X = 19.6;
    addons.push({ name: 'dv_valve', slot: 'brass', geo: S.put(new THREE.TorusGeometry(9, 1.6, 5, 14).rotateY(Math.PI / 2), 346, 88, X + 3) });
    for (let k = 0; k < 4; k++) addons.push({ name: 'dv_valve', slot: 'brass', geo: S.put(new THREE.BoxGeometry(1.4, 18, 1.4).rotateX(k * Math.PI / 4), 346, 88, X + 3) });
    addons.push({ name: 'dv_valve', slot: 'brass', geo: S.put(new THREE.CylinderGeometry(3, 3, 6, 8).rotateZ(Math.PI / 2), 346, 88, X) });
    addons.push({ name: 'dv_valve', slot: 'brass', geo: S.rod(170, 340, 88, 2.4, 8, 21.4) });
    for (const u of [200, 280]) addons.push({ name: 'dv_valve', slot: 'brass', geo: S.box(u - 3, u + 3, 84, 92, 3, 20.8) });
  }
  addons.push({ name: 'dv_gauge', slot: 'brass', geo: S.put(new THREE.CylinderGeometry(13, 13, 6, 16), 520, 127), part: barrel });
  addons.push({ name: 'dv_gauge', slot: 'dial', geo: S.put(new THREE.CylinderGeometry(10.5, 10.5, 0.6, 16), 520, 130.2), part: barrel });
  addons.push({ name: 'dv_gauge', slot: 'glass', geo: S.box(520, 528, 130.6, 131.2, 1.2), part: barrel });
  for (const u of [470, 640]) {
    addons.push({ name: 'dv_bands', slot: 'brass', geo: S.rod(u, u + 12, 100, 24.4, 14), part: barrel });
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; addons.push({ name: 'dv_bands', slot: 'brass', geo: S.put(new THREE.IcosahedronGeometry(1.3, 0), u + 6, 100 + Math.sin(a) * 25, Math.cos(a) * 25), part: barrel }); }
  }
  {
    // 錨：縦の軸・上の輪・横の棒・下の弧と両端の爪（錨の形の板）
    addons.push({ name: 'dv_anchor', slot: 'detail', geo: S.box(59, 61, 2, 22, 1.4) });
    addons.push({ name: 'dv_anchor', slot: 'brass', geo: S.put(new THREE.TorusGeometry(3.4, 1, 4, 10).rotateY(Math.PI / 2), 60, -1) });
    addons.push({ name: 'dv_anchor', slot: 'brass', geo: S.box(58.5, 61.5, -32, -4, 3) });
    addons.push({ name: 'dv_anchor', slot: 'brass', geo: S.box(52, 68, -10, -7.5, 3) });
    const arc = new THREE.TorusGeometry(12, 1.6, 4, 12, Math.PI); arc.rotateZ(Math.PI); arc.rotateY(Math.PI / 2);
    addons.push({ name: 'dv_anchor', slot: 'brass', geo: S.put(arc, 60, -22) });
    for (const d of [-1, 1]) addons.push({ name: 'dv_anchor', slot: 'brass', geo: S.put(new THREE.ConeGeometry(2.6, 7, 4).rotateX(-d * 0.6), 60 + d * 12, -20.5) });
  }

  // 氷華（LR）：ic_crystals 銃身の上と横・ストックの上と下から生える六角の氷の結晶の群れ / ic_frost ストックと先台の両脇の霜の花（六つの枝）
  //   ic_icicles 銃身と先台の下に垂れるつらら / ic_core 機関部の両脇に埋まった光る氷の核
  const crystal = (h: number, r: number) => {
    const body = new THREE.CylinderGeometry(r, r, h, 6).translate(0, h / 2, 0);
    const tip = new THREE.ConeGeometry(r, r * 2.2, 6).translate(0, h + r * 1.1, 0);
    return mergeGeometries([body.toNonIndexed(), tip.toNonIndexed()]);
  };
  const cluster = (u: number, v: number, x: number, list: [number, number, number, number][], part?: THREE.Object3D) => {
    for (const [h, r, rx, rz] of list) addons.push({ name: 'ic_crystals', slot: 'ice', geo: S.put(crystal(h * 1.7, r * 1.7).rotateX(rx).rotateZ(rz), u, v, x), part });   // 大げさに大きく
  };
  cluster(600, 118, 0, [[26, 5, 0.2, 0.1], [18, 4, -0.3, 0.5], [14, 3.4, 0.4, -0.5], [10, 2.8, -0.1, 0.9]], barrel);
  cluster(690, 116, 6, [[16, 4, 0.1, -0.3], [11, 3, -0.4, 0.3]], barrel);
  for (const s of [1, -1]) cluster(540, 100, 20 * s, [[14, 3.6, 0, -1.3 * s], [9, 2.8, 0.5, -1.1 * s]], barrel);
  cluster(70, 100, 0, [[20, 4.5, 0.4, 0.2], [14, 3.6, 0.1, -0.5], [10, 3, 0.7, 0.4]]);
  cluster(330, 104, 0, [[16, 4, -0.3, 0.3], [11, 3.2, 0.3, -0.4]]);
  cluster(220, 50, 0, [[14, 3.6, Math.PI - 0.3, 0.2], [10, 3, Math.PI + 0.3, -0.4]]);
  const frost = (R: number) => {
    const gs: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 6; k++) {
      const a = k * Math.PI / 3;
      gs.push(new THREE.BoxGeometry(R, 1.3, 1).translate(R / 2, 0, 0).rotateZ(a).toNonIndexed());
      for (const f of [0.45, 0.72]) for (const d of [1, -1]) gs.push(new THREE.BoxGeometry(R * 0.28, 1, 1).translate(R * 0.14, 0, 0).rotateZ(d * 0.8).translate(R * f, 0, 0).rotateZ(a).toNonIndexed());
    }
    return mergeGeometries(gs);
  };
  for (const s of [1, -1]) {
    for (const [u, v, R] of [[120, 66, 16], [190, 82, 11], [250, 74, 8]]) addons.push({ name: 'ic_frost', slot: 'frost', geo: side(frost(R), u, v, 20.6 * s) });
    addons.push({ name: 'ic_frost', slot: 'frost', geo: side(frost(9), 480, 69, 17.6 * s), part: barrel });
    addons.push({ name: 'ic_core', slot: 'core', geo: S.put(new THREE.OctahedronGeometry(7, 0).scale(1, 1.5, 1.2), 350, 86, 18.4 * s) });
    addons.push({ name: 'ic_core', slot: 'ice', geo: S.put(new THREE.TorusGeometry(11, 1.4, 4, 6).rotateY(Math.PI / 2), 350, 86, 18.6 * s) });
  }
  for (const [u, h] of [[610, 14], [630, 22], [650, 12], [672, 18], [694, 10]]) addons.push({ name: 'ic_icicles', slot: 'ice', geo: S.put(new THREE.ConeGeometry(2.8, h, 6).rotateX(Math.PI), u, 77 - h / 2), part: barrel });
  for (const [u, h] of [[430, 10], [470, 16], [510, 12], [548, 9]]) addons.push({ name: 'ic_icicles', slot: 'ice', geo: S.put(new THREE.ConeGeometry(2.4, h, 6).rotateX(Math.PI), u, 58 - h / 2), part: barrel });

  return makeGun({
    B, clips, muzzle, eject, addons, skin: opt.skin || 'mokume',
    info: { name: 'M79', real: '全長 731mm・銃身 356mm（40mm・中折れ式）', reload: 2.6 },
    vm: { scale: 1, hip: new THREE.Vector3(), ads: new THREE.Vector3() },
  });
}
