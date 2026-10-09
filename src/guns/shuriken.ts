// 手裏剣（忍）：十字手裏剣。差し渡し 約 124mm・厚さ 約 5mm（見て分かりやすいよう少し大きめ）
//   形：幅の広い4枚の刃が、真ん中近くの谷でつながった星形。刃の脇はわずかにくぼんで刃先へとがる
//   刃：真ん中に稜線（いちばん厚い所）が刃先まで通り、両側へ削った面（slide 黒い地鉄）→ 縁に沿って研いだ面（barrel 明るい鋼）の二段
//   芯：真ん中に丸い穴。穴のまわりに少し盛り上がった縁（frame）と朱の輪（accent）
//
// 一人称・駒が持つ形：丸い手（いつもの木の塊）の上、親指と人差し指の間に平たく挟む
//   投げる（fire）：手首を返して横に投げ、手裏剣は消える → 指の間から次の1枚がスッと出てくる
//   飛んでいく手裏剣（arrows.ts）は starGeo を使う
import * as THREE from 'three';
import { Clip } from './anim';
import { PartBuilder, flat, makeSpace } from './kit';
import { handMesh, makeGun } from './model';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const S = makeSpace(0, 0);
const TIP = 62, VALLEY = 23, HOLE = 5.5, IN = 8.2;   // 刃先・谷・穴・稜線の始まりの半径（mm）
const RIDGE = [2.6, 0.7], EDGE = 0.35, BEVEL = 6, BOW = 1.2;   // 稜線の厚み（半分）根元→先・刃先の厚み（半分）・研いだ面の幅・脇のくぼみ

// 刃の半分（星の面は xy、厚みは z、単位 mm）：刃の向き a、谷のある側 side（+1 / -1）
//   s（0 谷 〜 1 刃先）ごとに、稜線の点 R・研ぎの境目 G・縁 E を結んだ帯を並べる
function halfBlade(a: number, side: number, n = 12) {
  const core: number[] = [], edge: number[] = [];
  const tri = (out: number[], p: THREE.Vector3, q: THREE.Vector3, r: THREE.Vector3, want: THREE.Vector3) => {
    const nrm = q.clone().sub(p).cross(r.clone().sub(p));
    if (nrm.dot(want) < 0) [q, r] = [r, q];
    for (const v of [p, q, r]) out.push(v.x, v.y, v.z);
  };
  const quad = (out: number[], p, q, r, s, want) => { tri(out, p, q, r, want); tri(out, p, r, s, want); };
  const ax = new THREE.Vector2(Math.cos(a), Math.sin(a));
  const va = a + side * Math.PI / 4, V = new THREE.Vector2(Math.cos(va) * VALLEY, Math.sin(va) * VALLEY), T = ax.clone().multiplyScalar(TIP);
  const chord = T.clone().sub(V), inward = new THREE.Vector2(-chord.y, chord.x).normalize();
  if (inward.dot(ax.clone().multiplyScalar(TIP * 0.5).sub(V)) < 0) inward.negate();   // 刃の真ん中の方へ
  const row = (s: number) => {
    const E = V.clone().lerp(T, s).addScaledVector(inward, BOW * Math.sin(Math.PI * s));
    const R = ax.clone().multiplyScalar(IN + (TIP - IN) * s);
    const d = R.distanceTo(E), g = d > 0.01 ? Math.min(0.62, BEVEL / d) : 0;
    const G = E.clone().lerp(R, g);
    const h = RIDGE[0] + (RIDGE[1] - RIDGE[0]) * s;
    return { E, R, G, h, gh: EDGE + (h - EDGE) * g * 0.9 };
  };
  const v3 = (p: THREE.Vector2, z: number) => new THREE.Vector3(p.x, p.y, z);
  for (let i = 0; i < n; i++) {
    const A = row(i / n), B = row((i + 1) / n);
    for (const zs of [1, -1]) {
      const want = new THREE.Vector3(0, 0, zs);
      quad(core, v3(A.R, zs * A.h), v3(B.R, zs * B.h), v3(B.G, zs * B.gh), v3(A.G, zs * A.gh), want);   // 稜線 → 研ぎの境目（地鉄）
      quad(edge, v3(A.G, zs * A.gh), v3(B.G, zs * B.gh), v3(B.E, zs * EDGE), v3(A.E, zs * EDGE), want);   // 研いだ面
    }
    const out = new THREE.Vector3(-inward.x, -inward.y, 0);
    quad(edge, v3(A.E, EDGE), v3(B.E, EDGE), v3(B.E, -EDGE), v3(A.E, -EDGE), out);   // 縁の細い面
  }
  // 谷の内側：稜線の始まり（R0）・研ぎの境目・谷を結ぶ三角（隣の刃の半分と谷で合わさる）
  const A = row(0);
  const M = new THREE.Vector2(Math.cos(va), Math.sin(va)).multiplyScalar(IN);
  for (const zs of [1, -1]) {
    tri(core, v3(A.R, zs * A.h), v3(A.G, zs * A.gh), v3(M, zs * A.h * 0.9), new THREE.Vector3(0, 0, zs));
    tri(core, v3(A.G, zs * A.gh), v3(A.E, zs * EDGE), v3(M, zs * A.h * 0.9), new THREE.Vector3(0, 0, zs));
  }
  return { core, edge };
}
const geoOf = (pos: number[]) => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const p = g.attributes.position, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i) / 130 + 0.5; uv[i * 2 + 1] = p.getY(i) / 130 + 0.5; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return flat(g);
};
// 丸い輪の板（穴あき、面取りあり）
function ringGeo(r0: number, r1: number, t: number, seg: number, bevel = 0.6) {
  const sh = new THREE.Shape();
  for (let i = 0; i < seg; i++) { const a = i / seg * Math.PI * 2; (i ? sh.lineTo.bind(sh) : sh.moveTo.bind(sh))(Math.cos(a) * r0, Math.sin(a) * r0); }
  const hole = new THREE.Path();
  for (let i = 0; i < seg; i++) { const a = -i / seg * Math.PI * 2; (i ? hole.lineTo.bind(hole) : hole.moveTo.bind(hole))(Math.cos(a) * r1, Math.sin(a) * r1); }
  sh.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(sh, { depth: t - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 3 });
  g.translate(0, 0, -(t - bevel * 2) / 2);
  return flat(g);
}
// 手裏剣の形（mm、星の面は xy。刃先は 45°・135°… の向き）：塗りごと
export function starGeo() {
  const core: number[] = [], edge: number[] = [];
  for (let k = 0; k < 4; k++) for (const side of [1, -1]) { const b = halfBlade(Math.PI / 4 + k * Math.PI / 2, side); core.push(...b.core); edge.push(...b.edge); }
  return {
    slide: geoOf(core), barrel: geoOf(edge),
    frame: ringGeo(IN + 1.2, HOLE, 6, 20),            // 穴のまわりの盛り上がった縁（稜線の始まりを覆う）
    accent: ringGeo(IN - 0.6, HOLE + 0.8, 6.8, 20, 0.4),   // 朱の輪（縁の上に細く）
  };
}
// 飛んでいく手裏剣（m、星の面は xz＝寝かせた向き）：塗りを1つのメッシュに
export function starMeshGeo(scale = 1) {
  const s = starGeo(), out: Record<string, THREE.BufferGeometry> = {};
  for (const [k, g] of Object.entries(s)) { const c = g.clone(); c.rotateX(-Math.PI / 2); c.scale(scale / 1000, scale / 1000, scale / 1000); out[k] = c; }
  return out;
}
export const mergeStar = (g: Record<string, THREE.BufferGeometry>) => mergeGeometries(Object.values(g).map(x => { for (const k of Object.keys(x.attributes)) if (!['position', 'normal', 'uv'].includes(k)) x.deleteAttribute(k); return x; }), true);

export function buildShuriken(opt: { skin?: string; hand?: THREE.Material } = {}) {
  const B = new PartBuilder(S);
  const rhand = B.part('rhand', [0, 0]);
  // 手裏剣：手の上の前、親指と人差し指の間。寝かせて少し前下がり、刃の1本が前を向く
  const SU = 58, SV = 34, SX = -8;
  const star = B.part('star', [SU, SV], rhand, SX);
  const sg = starGeo();
  for (const [slot, g] of Object.entries(sg)) B.add(slot, S.put(g, SU, SV, SX, [-Math.PI / 2 + 0.18, 0, 0]), star);
  if (opt.hand) { const h = handMesh(opt.hand, 0.66, 0.66, 0.78); rhand.add(h); }
  const muzzle = new THREE.Object3D(); muzzle.position.copy(S.at(SU, SV, SX));   // 手裏剣の真ん中（手を離れる所）
  const eject = new THREE.Object3D(); B.root.add(eject);
  // 投げる：手首を後ろへ引いて（0〜0.06）、外から内へ横に払う（〜0.14）。手裏剣は払った瞬間に消える
  //   次の1枚：0.17 に指の間（手の中、少し後ろ・下）に現れ、0.3 までにスッと元の所へ出てくる
  const clips: Record<string, Clip> = {
    fire: {
      dur: 0.34,
      tracks: [
        ['rhand', 'ry', [[0, 0], [0.06, 0.55], [0.14, -0.75], [0.34, 0]]],
        ['rhand', 'rz', [[0, 0], [0.06, -0.25], [0.14, 0.3], [0.34, 0]]],
        ['rhand', 'px', [[0, 0], [0.06, 0.025], [0.14, -0.05], [0.34, 0]]],
        ['rhand', 'pz', [[0, 0], [0.06, 0.03], [0.14, -0.05], [0.34, 0]]],
        ['star', 'vis', [[0, 1], [0.11, 1], [0.12, 0], [0.17, 0], [0.18, 1]], 'step'],
        ['star', 'pz', [[0, 0], [0.17, 0.034], [0.3, 0]], 'out'],
        ['star', 'py', [[0, 0], [0.17, -0.012], [0.3, 0]], 'out'],
        ['star', 'rz', [[0, 0], [0.17, -1.2], [0.3, 0]], 'out'],
      ],
    },
    // 眺める：指先で1回くるっと回す
    inspect: {
      dur: 1.2,
      tracks: [
        ['rhand', 'rx', [[0, 0], [0.3, -0.5], [0.95, -0.5], [1.2, 0]]],
        ['star', 'ry', [[0, 0], [0.35, 0], [0.9, Math.PI * 2], [1.2, Math.PI * 2]], 'smooth'],
      ],
    },
    equip: { dur: 0.35, tracks: [['rhand', 'py', [[0, -0.08], [0.35, 0]], 'out'], ['star', 'rz', [[0, -2], [0.35, 0]], 'out']] },
  };
  const model = makeGun({
    B, clips, muzzle, eject, skin: opt.skin || 'shinobi',
    info: { name: '十字手裏剣', real: '差し渡し 124mm・厚さ 5mm' },
    vm: { scale: 1, hip: new THREE.Vector3(), ads: new THREE.Vector3() },
  });
  // 一人称：画面の右下。手を前へ倒して、手の上の手裏剣の面がこちらを向くように（rot は Z→Y→X の順）
  model.vmFixed = { scale: 2.0, rot: [0.35, -0.3, 0.95], hip: new THREE.Vector3(0.2, -0.22, -0.42), ads: new THREE.Vector3(0.2, -0.22, -0.42) };
  return model;
}
