// 手裏剣（忍）：十字手裏剣。差し渡し 約 100mm・厚さ 約 4mm
//   刃：真ん中に稜線（いちばん厚い所）が通り、両側へ削った面（slide 黒い地鉄）→ 刃先へ研いだ面（barrel 明るい鋼）の二段
//       刃の脇はゆるくくぼんで先へ細る（苦無の葉の形ではなく、十字手裏剣らしい細い剣先）
//   芯：八角の座金（frame）に穴。穴のまわりに朱の輪（accent）
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
const TIP = 50, ROOT = 11, HALF = 11.5;   // 刃先までの半径・刃の根元の半径・根元の半分の幅（mm）
const RIDGE = [2.1, 0.55], EDGE = 0.32;    // 稜線の厚み（半分）根元→先・刃先の厚み（半分）

// 刃1枚（星の面は xy、厚みは z、単位 mm）。向き a（ラジアン）
function blade(a: number, n = 10) {
  const core: number[] = [], edge: number[] = [];
  const ax = new THREE.Vector2(Math.cos(a), Math.sin(a)), px = new THREE.Vector2(-ax.y, ax.x);
  const P = (along: number, side: number, z: number) => new THREE.Vector3(ax.x * along + px.x * side, ax.y * along + px.y * side, z);
  const tri = (out: number[], a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, want: THREE.Vector3) => {
    const nrm = b.clone().sub(a).cross(c.clone().sub(a));
    if (nrm.dot(want) < 0) [b, c] = [c, b];
    for (const p of [a, b, c]) out.push(p.x, p.y, p.z);
  };
  const quad = (out: number[], a, b, c, d, want) => { tri(out, a, b, c, want); tri(out, a, c, d, want); };
  const row = (s: number) => {
    const along = ROOT + (TIP - ROOT) * s;
    const w = HALF * Math.pow(1 - s, 1.35);           // 脇はくぼみながら先へ細る
    const h = RIDGE[0] + (RIDGE[1] - RIDGE[0]) * s;   // 稜線の厚み
    const g = 0.52;                                   // 研ぎの境目（稜線から刃先までの割合）
    return { along, w, h, gw: w * g, gh: EDGE + (h - EDGE) * 0.42 };
  };
  for (let i = 0; i < n; i++) {
    const A = row(i / n), B = row((i + 1) / n);
    for (const zs of [1, -1]) for (const ss of [1, -1]) {
      const want = new THREE.Vector3(0, 0, zs);
      // 稜線 → 研ぎの境目（地鉄）
      quad(core, P(A.along, 0, zs * A.h), P(B.along, 0, zs * B.h), P(B.along, ss * B.gw, zs * B.gh), P(A.along, ss * A.gw, zs * A.gh), want);
      // 研ぎの境目 → 刃先（明るい鋼）
      quad(edge, P(A.along, ss * A.gw, zs * A.gh), P(B.along, ss * B.gw, zs * B.gh), P(B.along, ss * B.w, zs * EDGE), P(A.along, ss * A.w, zs * EDGE), want);
    }
    // 刃先の細い面（左右）
    for (const ss of [1, -1]) {
      const out = new THREE.Vector3(px.x * ss, px.y * ss, 0);
      quad(edge, P(A.along, ss * A.w, EDGE), P(B.along, ss * B.w, EDGE), P(B.along, ss * B.w, -EDGE), P(A.along, ss * A.w, -EDGE), out);
    }
  }
  return { core, edge };
}
const geoOf = (pos: number[]) => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const p = g.attributes.position, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i) / 100 + 0.5; uv[i * 2 + 1] = p.getY(i) / 100 + 0.5; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return flat(g);
};
// 芯の座金：八角の板に丸い穴（面取りあり）
function hubGeo(r0: number, r1: number, t: number, seg: number, rot = 0, bevel = 0.6) {
  const sh = new THREE.Shape();
  for (let i = 0; i < seg; i++) { const a = rot + i / seg * Math.PI * 2; (i ? sh.lineTo.bind(sh) : sh.moveTo.bind(sh))(Math.cos(a) * r0, Math.sin(a) * r0); }
  const hole = new THREE.Path();
  for (let i = 0; i < 14; i++) { const a = -i / 14 * Math.PI * 2; (i ? hole.lineTo.bind(hole) : hole.moveTo.bind(hole))(Math.cos(a) * r1, Math.sin(a) * r1); }
  sh.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(sh, { depth: t - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 3 });
  g.translate(0, 0, -(t - bevel * 2) / 2);
  return flat(g);
}
// 手裏剣の形（mm、星の面は xy）：塗りごと
export function starGeo() {
  const core: number[] = [], edge: number[] = [];
  for (let k = 0; k < 4; k++) { const b = blade(Math.PI / 4 + k * Math.PI / 2); core.push(...b.core); edge.push(...b.edge); }
  return {
    slide: geoOf(core), barrel: geoOf(edge),
    frame: hubGeo(14.5, 5.2, 4.6, 8, Math.PI / 8),           // 八角の座金（刃の根元を覆う）
    accent: hubGeo(8.6, 5.6, 5.4, 16, 0, 0.5),               // 穴のまわりの朱の輪（座金から少し浮く）
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
  const SU = 46, SV = 30, SX = -8;
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
    info: { name: '十字手裏剣', real: '差し渡し 100mm・厚さ 4mm' },
    vm: { scale: 1, hip: new THREE.Vector3(), ads: new THREE.Vector3() },
  });
  // 一人称：画面の右下。手を前へ倒して、手の上の手裏剣の面がこちらを向くように（rot は Z→Y→X の順）
  model.vmFixed = { scale: 1.7, rot: [0.35, -0.3, 0.95], hip: new THREE.Vector3(0.21, -0.2, -0.4), ads: new THREE.Vector3(0.21, -0.2, -0.4) };
  return model;
}
