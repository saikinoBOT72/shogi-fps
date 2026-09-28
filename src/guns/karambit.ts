// カランビットナイフ 見本（どの駒に持たせるかは未定）
// 実物の寸法：全長 190mm・刃 100mm。写真（ホンシュウ型）の輪郭を mm に写して作った
//   輪：握りの延長線上にある太い輪（外径 31mm・穴 21mm）。後ろに小さな突起
//   握り：輪から斜め下へ。太さ 22mm のゴムの握り、下に指の溝が3つ、刃の根元に小さなつば
//   刃：幅 34mm の根元から、ゆるく曲がりながら下へ伸びる。外側（左）が背、内側（右）のくぼんだ側が刃。背は 5mm
//
// 動く部品：knife（ナイフ全体。輪の真ん中が回る中心）・rhand（右手）
// 動き　　：fire（切りつける）・inspect（輪に指を掛けてくるくる回す → 刃の裏表を見せる）・equip（1回転させて握る）
import * as THREE from 'three';
import { Clip } from './anim';
import { PartBuilder, Pt, flat, makeSpace } from './kit';
import { handMesh, makeGun } from './model';

// 図面の座標：輪の真ん中が (0,0)。u は右が +、v は上が +（写真の向きそのまま）
const S = makeSpace(-55, -25);   // 原点：握りの真ん中
const TURN = Math.PI * 2;

// 刃：背の線と刃の線を同じ数に分け、断面（背は厚い → 途中から刃先へ削る）をつないだ形
function bladeGeo(spine: Pt[], edge: Pt[], n = 16, thick = 5, grind = 0.5, edgeT = 0.8) {
  const toV = (p: Pt) => new THREE.Vector3(p[0], p[1], 0);
  const sp = new THREE.CatmullRomCurve3(spine.map(toV)).getSpacedPoints(n);
  const ed = new THREE.CatmullRomCurve3(edge.map(toV)).getSpacedPoints(n);
  const pos: number[] = [], uv: number[] = [];
  const P = (v: THREE.Vector3, x: number) => S.at(v.x, v.y, x);
  const tri = (a, b, c, ua, ub, uc, want: THREE.Vector3) => {
    const nrm = b.clone().sub(a).cross(c.clone().sub(a));
    if (nrm.dot(want) < 0) { [b, c] = [c, b]; [ub, uc] = [uc, ub]; }
    for (const [p, q] of [[a, ua], [b, ub], [c, uc]]) { pos.push(p.x, p.y, p.z); uv.push(q.x, q.y); }
  };
  const quad = (a, b, c, d, ua, ub, uc, ud, want) => { tri(a, b, c, ua, ub, uc, want); tri(a, c, d, ua, uc, ud, want); };
  const half = (i: number) => thick * (1 - 0.55 * i / n) / 2;   // 先へ行くほど少し薄く（先でも紙のようにはしない）
  for (let i = 0; i < n; i++) {
    const t0 = half(i), t1 = half(i + 1), k0 = Math.min(edgeT / 2, t0), k1 = Math.min(edgeT / 2, t1);
    const s0 = sp[i], s1 = sp[i + 1], e0 = ed[i], e1 = ed[i + 1];
    const g0 = s0.clone().lerp(e0, grind), g1 = s1.clone().lerp(e1, grind);
    for (const side of [1, -1]) {
      const want = new THREE.Vector3(side, 0, 0);
      quad(P(s0, side * t0), P(s1, side * t1), P(g1, side * t1), P(g0, side * t0), s0, s1, g1, g0, want);   // 平らな面
      quad(P(g0, side * t0), P(g1, side * t1), P(e1, side * k1), P(e0, side * k0), g0, g1, e1, e0, want);   // 刃先へ削った面
    }
    // 背の面・刃先の細い面
    const outS = S.at(s0.x - e0.x, s0.y - e0.y).sub(S.at(0, 0));
    quad(P(s0, -t0), P(s1, -t1), P(s1, t1), P(s0, t0), s0, s1, s1, s0, outS);
    quad(P(e0, -k0), P(e1, -k1), P(e1, k1), P(e0, k0), e0, e1, e1, e0, outS.clone().negate());
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return flat(g);
}

export function buildKarambit(opt: { skin?: string; hand?: THREE.Material } = {}) {
  const B = new PartBuilder(S);
  const knife = B.part('knife', [0, 0]);     // 輪の真ん中
  const rhand = B.part('rhand', [-58, -30]);

  // 輪（金属）と後ろの突起、握りへつながる首
  B.add('frame', S.ring(0, 0, 17, 11.5, 9, 14, { bevel: 1.2 }), knife);
  B.add('frame', S.extrude([[13, -5], [24, -12], [12, -13]], 6, { bevel: 0.8 }), knife);
  B.add('frame', S.extrude([[-8, 12], [-17, 13], [-17, -12], [-8, -12]], 10, { bevel: 1 }), knife);

  // 握り：上の線はまっすぐ斜め、下は指の溝が3つ。刃の根元に小さなつば
  const top: Pt[] = [[-12, 12], [-24, 11.5], [-38, 7], [-53, 0], [-67, -9], [-83, -20], [-98, -31], [-108, -40]];
  const end: Pt[] = [[-112, -47], [-108, -54], [-84, -57], [-73, -58], [-68, -47]];
  const P1 = new THREE.Vector2(-70, -42), P0 = new THREE.Vector2(-13, -8);
  const dir = P0.clone().sub(P1).normalize(), out = new THREE.Vector2(dir.y, -dir.x);   // 下右向き（外側）
  const fingers: Pt[] = [];
  for (let i = 1; i < 12; i++) {
    const t = i / 12, bump = 4 * (1 - Math.abs(Math.sin(3 * Math.PI * t)));   // 溝3つ・山4つ
    const p = P1.clone().lerp(P0, t).addScaledVector(out, bump);
    fingers.push([p.x, p.y]);
  }
  B.add('grip', S.extrude([...top, ...end, ...fingers, [-11, -9]], 20, { bevel: 3.5 }), knife);

  // 刃
  // 背は外へふくらみ、刃はくぼんで（爪の内側）、先は内側へ少し向く
  const spine: Pt[] = [[-104, -48], [-112, -64], [-115, -84], [-113, -104], [-107, -124], [-98, -141], [-90, -150]];
  const edge: Pt[] = [[-72, -52], [-78, -66], [-85, -84], [-90, -104], [-92, -124], [-91, -140], [-90, -150]];
  B.add('slide', bladeGeo(spine, edge), knife);

  if (opt.hand) { const h = handMesh(opt.hand, 0.55, 0.62, 0.9); h.position.set(0.004, -0.004, 0); rhand.add(h); }
  const muzzle = new THREE.Object3D(); muzzle.position.copy(S.at(-95, -140));   // 刃先
  const eject = new THREE.Object3D(); B.root.add(eject);

  // 手を輪へ移すずれ（握りの真ん中 → 輪の真ん中）
  const toRing = { y: 0.03, z: -0.058 };
  const clips: Record<string, Clip> = {
    // 手首を返して、右上から左下へ切り裂く
    fire: {
      dur: 0.42,
      tracks: [
        ['root', 'ry', [[0, 0], [0.07, 0.45], [0.2, -0.85], [0.42, 0]]],
        ['root', 'rz', [[0, 0], [0.07, 0.35], [0.2, -0.5], [0.42, 0]]],
        ['root', 'rx', [[0, 0], [0.07, 0.2], [0.2, -0.25], [0.42, 0]]],
        ['root', 'px', [[0, 0], [0.07, 0.04], [0.2, -0.12], [0.42, 0]]],
        ['root', 'pz', [[0, 0], [0.2, -0.07], [0.42, 0]]],
      ],
    },
    // 眺める：輪に指を掛けて2回転 → 逆に1回転して握り直す → 刃の裏表を見せる
    inspect: {
      dur: 3.4,
      tracks: [
        ['root', 'rz', [[0, 0], [0.25, -0.3], [2.1, -0.3], [2.4, 0.5], [2.8, -0.4], [3.1, -0.4], [3.4, 0]]],
        ['root', 'ry', [[0, 0], [0.25, 0.45], [2.1, 0.45], [2.4, -0.7], [2.8, 0.9], [3.1, 0.9], [3.4, 0]]],
        ['root', 'py', [[0, 0], [0.25, 0.05], [3.1, 0.05], [3.4, 0]]],
        ['rhand', 'py', [[0, 0], [0.25, toRing.y], [1.95, toRing.y], [2.15, 0]]],
        ['rhand', 'pz', [[0, 0], [0.25, toRing.z], [1.95, toRing.z], [2.15, 0]]],
        ['knife', 'rx', [[0, 0], [0.3, 0], [0.75, -TURN], [1.2, -TURN * 2], [1.35, -TURN * 2], [1.9, -TURN], [2.0, -TURN]]],
      ],
    },
    equip: {
      dur: 0.75,
      tracks: [
        ['rhand', 'py', [[0, toRing.y], [0.5, toRing.y], [0.62, 0]]],
        ['rhand', 'pz', [[0, toRing.z], [0.5, toRing.z], [0.62, 0]]],
        ['knife', 'rx', [[0, TURN * 0.25], [0.5, -TURN]], 'out'],
        ['root', 'rz', [[0, 0.3], [0.5, 0.1], [0.75, 0]]],
      ],
    },
  };
  return makeGun({
    B, clips, muzzle, eject, skin: opt.skin || 'hagane',
    info: { name: 'カランビット', real: '全長 190mm・刃 100mm' },
    vm: { scale: 1, hip: new THREE.Vector3(), ads: new THREE.Vector3() },
  });
}
