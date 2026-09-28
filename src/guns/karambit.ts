// カランビットナイフ 見本（どの駒に持たせるかは未定）
// 実物の寸法：全長 190mm・刃 100mm（刃厚 4mm）
//   刃：爪のように下へ曲がり、内側（くぼんだ側）が刃。背は厚く、刃先へ向かって削って薄くする（グラインド）
//   握り：刃と一体の金属（フルタング）の縁が見え、両側に滑り止めの格子の板（スケール）、下に指の溝、背に滑り止めの刻み
//   輪：金属と一体。人差し指を通す
//
// 動く部品：knife（ナイフ全体。輪の真ん中が回る中心）・rhand（右手）
// 動き　　：fire（切りつける）・inspect（輪に指を掛けてくるくる回す → 刃の両面を見せる）・equip（1回転させて握る）
import * as THREE from 'three';
import { Clip } from './anim';
import { PartBuilder, Pt, flat, makeSpace } from './kit';
import { handMesh, makeGun } from './model';

const S = makeSpace(55, 0);   // 原点：握りの真ん中
const TURN = Math.PI * 2;

// 刃：背の線と刃の線を同じ数に分けて、断面（背は厚く・途中から刃先へ細くなる）をつないだ形
function bladeGeo(spine: Pt[], edge: Pt[], n = 14, thick = 2.1, grind = 0.42) {
  const toV = (p: Pt) => new THREE.Vector3(p[0], p[1], 0);
  const sp = new THREE.CatmullRomCurve3(spine.map(toV)).getSpacedPoints(n);
  const ed = new THREE.CatmullRomCurve3(edge.map(toV)).getSpacedPoints(n);
  const pos: number[] = [], uv: number[] = [];
  const P = (v: THREE.Vector3, x: number) => S.at(v.x, v.y, x);
  const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, ua: THREE.Vector3, ub: THREE.Vector3, uc: THREE.Vector3, want: THREE.Vector3) => {
    // 面の向きが外を向くように並べる
    const nrm = b.clone().sub(a).cross(c.clone().sub(a));
    if (nrm.dot(want) < 0) { [b, c] = [c, b]; [ub, uc] = [uc, ub]; }
    for (const [p, q] of [[a, ua], [b, ub], [c, uc]] as [THREE.Vector3, THREE.Vector3][]) { pos.push(p.x, p.y, p.z); uv.push(q.x, q.y); }
  };
  const quad = (a, b, c, d, ua, ub, uc, ud, want) => { tri(a, b, c, ua, ub, uc, want); tri(a, c, d, ua, uc, ud, want); };
  for (let i = 0; i < n; i++) {
    const t0 = thick * (1 - 0.75 * i / n) / 2, t1 = thick * (1 - 0.75 * (i + 1) / n) / 2;
    const s0 = sp[i], s1 = sp[i + 1], e0 = ed[i], e1 = ed[i + 1];
    const g0 = s0.clone().lerp(e0, grind), g1 = s1.clone().lerp(e1, grind);
    for (const side of [1, -1]) {
      const want = new THREE.Vector3(side, 0, 0);
      quad(P(s0, side * t0), P(s1, side * t1), P(g1, side * t1), P(g0, side * t0), s0, s1, g1, g0, want);   // 平らな面
      quad(P(g0, side * t0), P(g1, side * t1), P(e1, 0), P(e0, 0), g0, g1, e1, e0, want);                     // 刃先へ削った面
    }
    // 背（厚みのある上の面）
    const out = s0.clone().sub(e0).normalize(), w = S.at(out.x, out.y).sub(S.at(0, 0));
    quad(P(s0, -t0), P(s1, -t1), P(s1, t1), P(s0, t0), s0, s1, s1, s0, w);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return flat(g);
}
// 横向き（x 方向）の小さな円柱（ねじ）
function screw(u: number, v: number, r: number, w: number) {
  const g = new THREE.CylinderGeometry(r / 1000, r / 1000, w / 1000, 6).rotateZ(Math.PI / 2);
  const c = S.at(u, v); g.translate(c.x, c.y, c.z);
  return flat(g);
}

export function buildKarambit(opt: { skin?: string; hand?: THREE.Material } = {}) {
  const B = new PartBuilder(S);
  const knife = B.part('knife', [-8, 0]);   // 輪の真ん中
  const rhand = B.part('rhand', [55, -2]);

  // 金属（輪・フルタング）
  B.add('frame', S.ring(-8, 0, 12.5, 7.5, 5, 12, { bevel: 0.9 }), knife);
  // 握りはバナナのように上へ反る（bend）。下は指の溝を深めに
  const bend = (pts: Pt[]): Pt[] => pts.map(([u, v]) => [u, v + 7 * Math.sin(Math.PI * Math.min(1, Math.max(0, u / 100)))] as Pt);
  const top: Pt[] = bend([[0, 8], [8, 9], [30, 10], [55, 9], [80, 10], [100, 12]]);
  const bottom: Pt[] = bend([[104, -15], [96, -17], [86, -10], [76, -16], [65, -9], [54, -15], [43, -9], [32, -14], [20, -10], [8, -10], [0, -9]]);
  B.add('frame', S.extrude([...top, ...bottom], 4.4, { bevel: 0.6 }), knife);
  // 握りの板（両側・格子の滑り止め）：金属の縁が見えるよう少し内側
  const inset = (pts: Pt[], d: number): Pt[] => pts.map(([u, v]) => [u, v - Math.sign(v) * d] as Pt);
  const scale = [...inset(top.slice(1), 1.6).map(([u, v]) => [Math.max(10, Math.min(97, u)), v] as Pt), ...inset(bottom.slice(1, -1), 1.6).map(([u, v]) => [Math.max(10, Math.min(97, u)), v] as Pt)];
  B.add('grip', S.extrude(scale, 12, { bevel: 1.2 }), knife);
  B.add('detail', screw(32, -1 + 7 * Math.sin(Math.PI * 0.32), 2.4, 12.6), knife);
  B.add('detail', screw(78, 0 + 7 * Math.sin(Math.PI * 0.78), 2.4, 12.6), knife);
  // 刃（背の線・刃の線）
  const spine: Pt[] = [[98, 12], [122, 12], [146, 4], [164, -12], [174, -34], [176, -58], [170, -80], [158, -100]];
  const edge: Pt[] = [[98, -15], [114, -18], [128, -26], [138, -40], [144, -56], [148, -74], [150, -88], [158, -100]];
  B.add('slide', bladeGeo(spine, edge), knife);
  // 背の滑り止めの刻み
  for (let u = 104; u <= 126; u += 3.5) B.add('slideDark', S.box(u, u + 1.4, 10.6, 12.8, 2.6), knife);

  if (opt.hand) { const h = handMesh(opt.hand, 0.5, 0.55, 0.85); h.position.set(0.004, -0.012, 0); rhand.add(h); }
  const muzzle = new THREE.Object3D(); muzzle.position.copy(S.at(165, -60));   // 刃先の方向（構えの目安）
  const eject = new THREE.Object3D(); B.root.add(eject);

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
    // 眺める：輪に指を掛けて前へ2回転 → 逆に1回転して握り直す → 刃の裏表を見せる
    inspect: {
      dur: 3.4,
      tracks: [
        ['root', 'rz', [[0, 0], [0.25, -0.3], [2.1, -0.3], [2.4, 0.5], [2.8, -0.4], [3.1, -0.4], [3.4, 0]]],
        ['root', 'ry', [[0, 0], [0.25, 0.45], [2.1, 0.45], [2.4, -0.7], [2.8, 0.9], [3.1, 0.9], [3.4, 0]]],
        ['root', 'py', [[0, 0], [0.25, 0.05], [3.1, 0.05], [3.4, 0]]],
        ['rhand', 'pz', [[0, 0], [0.25, 0.063], [1.95, 0.063], [2.15, 0]]],
        ['knife', 'rx', [[0, 0], [0.3, 0], [0.75, -TURN], [1.2, -TURN * 2], [1.35, -TURN * 2], [1.9, -TURN], [2.0, -TURN]]],
      ],
    },
    equip: {
      dur: 0.75,
      tracks: [
        ['rhand', 'pz', [[0, 0.063], [0.5, 0.063], [0.62, 0]]],
        ['knife', 'rx', [[0, TURN * 0.25], [0.5, -TURN]], 'out'],
        ['root', 'rz', [[0, 0.3], [0.5, 0.1], [0.75, 0]]],
      ],
    },
  };
  return makeGun({
    B, clips, muzzle, eject, skin: opt.skin || 'ruri',
    info: { name: 'カランビット', real: '全長 190mm・刃 100mm' },
    vm: { scale: 1, hip: new THREE.Vector3(), ads: new THREE.Vector3() },
  });
}
