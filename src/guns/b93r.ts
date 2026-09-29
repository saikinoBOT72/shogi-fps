// ベレッタ 93R（3点バースト）見本
// 実銃の寸法：全長 240mm・銃身 156mm。上が開いたスライド（銃身が見える）、銃口の補正器、前の折りたたみグリップ、下に飛び出た20連弾倉
//
// 動く部品：slide・hammer・trigger・mag・lhand（左手：ふだんは前の折りたたみグリップを握る）
// 動き　　：fire（毎発スライドが往復）・fireLast（最後の1発でスライドが下がったまま）・release・reload・inspect・equip
import * as THREE from 'three';
import { Clip, Key, Track } from './anim';
import { PartBuilder, makeSpace } from './kit';
import { Addon, handMesh, makeGun } from './model';

const S = makeSpace(40, 80);    // 原点：グリップの付け根
const RAKE = 0.2;               // グリップの傾き
const LOCK = 0.035;             // スライドが下がる量（m）
const COCK = 0.5;

export function buildB93R(opt: { skin?: string; hand?: THREE.Material } = {}) {
  const B = new PartBuilder(S);
  const slide = B.part('slide', [100, 110]);
  const hammer = B.part('hammer', [2, 96]);
  const trigger = B.part('trigger', [84, 80]);
  const mag = B.part('mag', [20, 0]);
  const lhand = B.part('lhand', [150, 44]);

  // スライド（上の真ん中が開いていて、中の銃身が見える）
  B.add('slide', S.extrude([[0, 88], [0, 114], [4, 118], [70, 118], [74, 108], [150, 108], [154, 118], [186, 118], [190, 112], [190, 88]], 26, { bevel: 1.2 }), slide);
  for (const x of [-1, 1]) for (let u = 10; u <= 34; u += 5) B.add('slideDark', S.box(u, u + 2, 92, 114, 0.6, x * 13.3), slide);   // 後ろの滑り止め
  B.add('detail', S.box(4, 14, 118, 124, 18), slide);          // 照門
  B.add('detail', S.box(176, 184, 118, 125, 4), slide);        // 照星
  B.add('barrel', S.rod(60, 200, 104, 7, 8));
  // 補正器（銃口の先。上に穴）
  B.add('frame', S.extrude([[196, 88], [196, 116], [240, 116], [242, 110], [242, 88]], 24, { bevel: 1.5 }));
  for (let u = 204; u < 236; u += 9) B.add('bore', S.box(u, u + 5, 115, 116.8, 12));
  B.add('bore', S.rod(241, 243, 102, 4.5, 8));
  // フレーム・グリップ・大きな用心鉄・前の折りたたみグリップ
  B.add('frame', S.extrude([[6, 80], [6, 90], [196, 90], [196, 80]], 24, { bevel: 1 }));
  B.add('grip', S.extrude([[2, 82], [58, 82], [58 - 88 * RAKE, -6], [-6 - 88 * RAKE, -6], [-10 - 60 * RAKE, 20]], 30, { bevel: 2.5 }));
  B.add('frame', S.extrude([[56, 82], [56, 64], [64, 52], [126, 52], [134, 60], [134, 82]], 10, {
    bevel: 1, holes: [[[64, 78], [64, 64], [69, 58], [122, 58], [128, 64], [128, 78]]],
  }));
  B.add('frame', S.extrude([[140, 80], [162, 80], [158, 26], [144, 26]], 16, { bevel: 2 }));
  B.add('detail', S.rod(138, 164, 84, 3, 6));                  // 折りたたみの軸
  // 撃鉄・引き金
  B.add('detail', S.extrude([[-1, 96], [5, 96], [3, 106], [-3, 114], [-9, 114], [-7, 106]], 7, { bevel: 0.6 }), hammer);
  B.add('detail', S.extrude([[81, 80], [87, 80], [88, 72], [91, 64], [88, 62], [85, 66], [82, 74]], 6, { bevel: 0.6 }), trigger);
  // 20連の長い弾倉（グリップの下に飛び出る）
  // グリップの前の線より少し内側に収める
  const gf = (v: number) => 58 - (82 - v) * RAKE - 5;
  B.add('mag', S.extrude([[gf(0) - 40, 0], [gf(0), 0], [gf(76), 76], [gf(76) - 40, 76]], 22, { bevel: 0.8 }), mag);
  B.add('mag', S.extrude([[-22, -4], [40, -4], [35, -28], [-27, -28]], 24, { bevel: 1.2 }), mag);
  B.add('frame', S.box(-29, 37, -34, -28, 28), mag);

  if (opt.hand) {
    const rh = handMesh(opt.hand, 0.72, 0.95, 0.8); rh.position.copy(S.at(28, 36, 40)); B.root.add(rh);
    const lh = handMesh(opt.hand, 0.7, 0.85, 0.8); lh.position.x = -0.036; lhand.add(lh);
  }
  const muzzle = new THREE.Object3D(); muzzle.position.copy(S.at(244, 102));
  const eject = new THREE.Object3D(); eject.position.copy(S.at(120, 112, 10)).sub(slide.userData.pivotAt); slide.add(eject);
  hammer.rotation.x = COCK;

  // 弾倉はグリップの傾きに沿って抜き差し
  const along = (keys: Key[]): Track[] => [['mag', 'py', keys.map(([t, d]) => [t, -0.98 * d] as Key)], ['mag', 'pz', keys.map(([t, d]) => [t, 0.2 * d] as Key)]];
  const toMag = { y: -0.085, z: 0.135 };
  const clips: Record<string, Clip> = {
    fire: {
      dur: 0.07, events: [[0.015, 'eject']],
      tracks: [
        ['slide', 'pz', [[0, 0], [0.015, LOCK], [0.055, 0]], 'out'],
        ['hammer', 'rx', [[0, 0], [0.005, -COCK], [0.02, 0]], 'lin'],
        ['trigger', 'rx', [[0, 0], [0.008, -0.3], [0.05, -0.3], [0.07, 0]]],
      ],
    },
    fireLast: {
      dur: 0.06, hold: true, events: [[0.015, 'eject']],
      tracks: [
        ['slide', 'pz', [[0, 0], [0.015, LOCK]], 'out'],
        ['hammer', 'rx', [[0, 0], [0.005, -COCK], [0.02, 0]], 'lin'],
        ['trigger', 'rx', [[0, 0], [0.008, -0.3], [0.06, 0]]],
      ],
    },
    release: { dur: 0.12, tracks: [['slide', 'pz', [[0, LOCK], [0.04, -0.002], [0.07, 0]], 'in'], ['root', 'rx', [[0, 0], [0.04, 0.06], [0.12, 0]]]] },
    reload: {
      dur: 1, events: [[0.14, 'magOut'], [0.58, 'magIn'], [0.72, 'release']],
      tracks: [
        ['root', 'rz', [[0, 0], [0.12, -0.9], [0.8, -0.9], [1, 0]]],
        ['root', 'rx', [[0, 0], [0.12, 0.22], [0.56, 0.22], [0.6, 0.34], [0.66, 0.22], [0.8, 0.22], [1, 0]]],
        ['root', 'px', [[0, 0], [0.12, -0.06], [0.8, -0.06], [1, 0]]],
        ['root', 'py', [[0, 0], [0.12, 0.08], [0.8, 0.08], [1, 0]]],
        ...along([[0, 0], [0.12, 0], [0.3, 0.22], [0.34, 0.22], [0.38, 0.15], [0.56, 0.005], [0.58, 0]]),
        ['mag', 'vis', [[0, 1], [0.3, 1], [0.301, 0], [0.379, 0], [0.38, 1]]],
        ['lhand', 'py', [[0, 0], [0.14, toMag.y], [0.3, toMag.y - 0.2], [0.34, toMag.y - 0.2], [0.38, toMag.y - 0.14], [0.58, toMag.y], [0.66, toMag.y], [0.8, 0]]],
        ['lhand', 'pz', [[0, 0], [0.14, toMag.z], [0.66, toMag.z], [0.8, 0]]],
      ],
    },
    inspect: {
      dur: 2.6,
      tracks: [
        ['root', 'ry', [[0, 0], [0.4, 1.0], [1.2, 1.0], [1.6, -0.55], [2.2, -0.55], [2.6, 0]]],
        ['root', 'rz', [[0, 0], [0.4, -0.3], [1.2, -0.15], [1.6, 0.45], [2.2, 0.45], [2.6, 0]]],
        ['root', 'px', [[0, 0], [0.4, -0.06], [2.2, -0.04], [2.6, 0]]],
        ['root', 'py', [[0, 0], [0.4, 0.04], [2.2, 0.04], [2.6, 0]]],
      ],
    },
    equip: {
      dur: 0.6,
      tracks: [
        ['slide', 'pz', [[0, 0], [0.32, 0], [0.4, LOCK], [0.48, 0]], 'out'],
        ['root', 'rz', [[0, 0.35], [0.3, 0.2], [0.5, 0], [0.6, 0]]],
      ],
    },
  };
  // ---------- スキンの飾り ----------
  const addons: Addon[] = [];
  const side = (g: THREE.BufferGeometry, u: number, v: number, x: number) => S.put(g, u, v, x, [0, Math.PI / 2, 0]);   // 横の面に貼る
  // 図面の (du, dv, x) の点を並べた曲線を、太さ r の管にする（原点は (0,0,0)。S.put で置く）
  const tube = (pts: [number, number, number][], r: number, seg = 60) =>
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(([du, dv, x]) => new THREE.Vector3(x, dv, -du))), seg, r, 6, false);
  const spiral = (r0: number, r1: number, turns: number, dir = 1, a0 = 0): [number, number, number][] =>
    Array.from({ length: 28 }, (_, i) => { const t = i / 27, a = a0 + dir * t * turns * Math.PI * 2, r = r0 + (r1 - r0) * t; return [Math.cos(a) * r, Math.sin(a) * r, 0] as [number, number, number]; });

  // 銀細工（R）：filigree スライドの両脇の銀の渦巻き（向かい合う2つの渦と葉） / pearlFrame 握りの真珠貝を囲む銀の楕円の枠
  const orn = (u: number, v: number, x: number, part?: THREE.Object3D) => {
    for (const d of [1, -1]) addons.push({ name: 'filigree', slot: 'silver', geo: S.put(tube(spiral(1.2, 7.5, 1.4, d, d > 0 ? Math.PI : 0).map(([a, b]) => [a + d * 8, b, 0]), 0.75, 50), u, v, x), part });
    const leaf = new THREE.Shape(); leaf.moveTo(0, 0); leaf.quadraticCurveTo(3, 5, 0, 11); leaf.quadraticCurveTo(-3, 5, 0, 0);
    addons.push({ name: 'filigree', slot: 'silver', geo: side(new THREE.ExtrudeGeometry(leaf, { depth: 0.8, bevelEnabled: false }).translate(0, 0, -0.4), u, v + 6, x), part });
  };
  for (const s of [1, -1]) {
    orn(50, 99, 13.6 * s, slide); orn(170, 98, 13.6 * s, slide);
    const ring = new THREE.TorusGeometry(13, 1.2, 4, 18); ring.scale(1, 1.75, 1); ring.rotateZ(-Math.atan(RAKE)); ring.rotateY(Math.PI / 2);
    addons.push({ name: 'pearlFrame', slot: 'silver', geo: S.put(ring, 12, 38, 15.6 * s) });
  }

  // 蝶（SR）：butterflies スライドの上・補正器の上・前の握り・弾倉の底にとまる蝶（羽は上と下の2枚ずつ、白い斑点）
  const wingShape = (w: number, h: number) => { const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.bezierCurveTo(w * 0.3, h, w, h * 1.1, w, h * 0.3); sh.quadraticCurveTo(w * 0.7, -h * 0.1, 0, 0); return new THREE.ExtrudeGeometry(sh, { depth: 0.6, bevelEnabled: false, curveSegments: 6 }).translate(0, 0, -0.3); };
  const butterfly = (u: number, v: number, x: number, yaw: number, k: number, part?: THREE.Object3D, tilt = 0) => {
    const put = (g: THREE.BufferGeometry, slot: string) => { g.scale(k, k, k); g.rotateX(tilt); g.rotateY(yaw); addons.push({ name: 'butterflies', slot, geo: S.put(g, u, v, x), part }); };
    for (const d of [1, -1]) {
      // 羽：平らに作って、体の軸（前後）のまわりに少し持ち上げる
      put(wingShape(22, 16).rotateX(-Math.PI / 2).scale(d, 1, 1).rotateZ(d * 0.95).translate(0, 0, -2), 'wing');
      put(wingShape(15, -12).rotateX(-Math.PI / 2).scale(d, 1, 1).rotateZ(d * 0.8).translate(0, 0, 3), 'wing');
      put(new THREE.CylinderGeometry(3, 3, 0.8, 10).translate(d * 14, 0.6, -9).rotateZ(d * 0.95), 'spot');
      put(new THREE.CylinderGeometry(1.8, 1.8, 0.8, 8).translate(d * 9, 0.6, 7).rotateZ(d * 0.8), 'spot');
      put(new THREE.BoxGeometry(0.6, 0.6, 12).rotateX(-0.6).rotateY(d * 0.35).translate(d * 2.2, 4, -13), 'body');
    }
    put(new THREE.CapsuleGeometry(2, 16, 3, 6).rotateX(Math.PI / 2), 'body');
  };
  butterfly(112, 111, 0, 0.3, 1.7, slide);
  butterfly(226, 119, 0, -0.5, 1.4);
  butterfly(160, 58, 10, Math.PI / 2, 1.3, undefined, -0.3);
  butterfly(6, -36, -6, 2.4, 1.2, mag, Math.PI);

  // 白蛇（LR）：snake 前の握りに下から巻き付き、フレームの下を通って補正器に巻き付き、銃口の上で鎌首をもたげる
  //   snakeHead 頭・光る目・二股の舌 / coil 握りの両脇のとぐろの紋（光る目つき）
  {
    const pts: [number, number, number][] = [];
    for (let i = 0; i <= 18; i++) { const t = i / 18, a = t * Math.PI * 3; pts.push([151 + Math.cos(a) * 11 - 151, 30 + 46 * t, Math.sin(a) * 11]); }
    pts.push([176 - 151, 84, -8]);
    for (let i = 0; i <= 22; i++) { const t = i / 22, b = -Math.PI / 2 + t * Math.PI * 3; pts.push([200 + 36 * t - 151, 102 + Math.sin(b) * 16.5, Math.cos(b) * 16.5]); }
    pts.push([240 - 151, 125, 0], [247 - 151, 131, 0]);
    addons.push({ name: 'snake', slot: 'snake', geo: S.put(tube(pts, 3.8, 220), 151, 0, 0) });
    addons.push({ name: 'snake', slot: 'snake', geo: S.put(new THREE.ConeGeometry(3.8, 12, 6).rotateX(Math.PI), 162, 24, 0) });
    // 頭：後ろが張った頭と、前へ細くなる鼻先。両脇に大きな光る目、口の切れ目、鼻先から出る二股の舌
    const skull = new THREE.IcosahedronGeometry(1, 1); skull.scale(11, 7.5, 12);
    addons.push({ name: 'snake', slot: 'snake', geo: S.put(skull, 254, 132, 0) });
    addons.push({ name: 'snake', slot: 'snake', geo: S.put(new THREE.CylinderGeometry(3, 8.5, 18, 8).rotateX(-Math.PI / 2).scale(1, 0.72, 1), 270, 131.5, 0) });
    for (const x of [-8.2, 8.2]) {
      addons.push({ name: 'snake', slot: 'eyes', geo: S.put(new THREE.IcosahedronGeometry(2.8, 1).scale(0.6, 1, 1.2), 258, 135, x) });
      addons.push({ name: 'snake', slot: 'mouth', geo: S.put(new THREE.BoxGeometry(0.8, 1, 20).rotateY(x > 0 ? 0.2 : -0.2), 268, 128.6, x * 0.72) });
    }
    addons.push({ name: 'snake', slot: 'eyes', geo: S.put(new THREE.BoxGeometry(1, 0.8, 9), 283, 130, 0) });
    for (const d of [-1, 1]) addons.push({ name: 'snake', slot: 'eyes', geo: S.put(new THREE.BoxGeometry(0.8, 0.7, 6).rotateY(d * 0.45), 289, 130, d * 1.4) });
    for (const s of [1, -1]) {
      addons.push({ name: 'snake', slot: 'snake', geo: S.put(tube(spiral(2.5, 11, 2.2, 1).map(([a, b]) => [a, b, 0]), 1.6, 70), 12, 38, 15.8 * s) });
      addons.push({ name: 'snake', slot: 'eyes', geo: S.put(new THREE.IcosahedronGeometry(1.2, 0), 12 + 11 * Math.cos(Math.PI * 4.4), 38 + 11 * Math.sin(Math.PI * 4.4), 17.2 * s) });
    }
  }

  return makeGun({
    B, clips, muzzle, eject, addons, skin: opt.skin || 'kurogane',
    info: { name: 'ベレッタ 93R', real: '全長 240mm・銃身 156mm（3点バースト）', reload: 1.6 },
    vm: { scale: 1, hip: new THREE.Vector3(), ads: new THREE.Vector3(), size: 0.75 },
    events: { release: anim => { if (anim.has('fireLast')) { anim.stop('fireLast'); anim.play('release'); } } },
  });
}
