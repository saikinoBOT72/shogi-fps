// 手裏剣（忍）：十字手裏剣。差し渡し 約 124mm・厚さ 約 5mm（見て分かりやすいよう少し大きめ）
//   形はすっきりさせた記号のような星形：まっすぐな線の4枚の刃と、真ん中の丸い穴だけ
//   面（slide）は黒っぽい鋼、まわりの面取り（barrel）は明るい鋼。赤は入れない
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
const TIP = 62, VALLEY = 21, HOLE = 7;   // 刃先・谷・穴の半径（mm）

// 形を押し出して、表と裏（caps）・まわりの面取りと側面（sides）に分ける（ExtrudeGeometry の groups：0 が表裏、1 がまわり）
export function extrudeSplit(shape: THREE.Shape, depth: number, bevel: number, bevelT = bevel * 0.5) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevelT, bevelSize: bevel, bevelSegments: 1, curveSegments: 6 });
  g.translate(0, 0, -depth / 2);
  const pos = g.attributes.position, uv = g.attributes.uv;
  const part = (mi: number) => {
    const p: number[] = [], u: number[] = [];
    for (const gr of g.groups) if (gr.materialIndex === mi) for (let i = gr.start; i < gr.start + gr.count; i++) { p.push(pos.getX(i), pos.getY(i), pos.getZ(i)); u.push(uv.getX(i), uv.getY(i)); }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); out.setAttribute('uv', new THREE.Float32BufferAttribute(u, 2));
    return flat(out);
  };
  return { caps: part(0), sides: part(1) };
}
// 手裏剣の形（mm、星の面は xy。刃先は 45°・135°… の向き）：塗りごと
export function starGeo() {
  const sh = new THREE.Shape();
  for (let i = 0; i < 8; i++) {
    const a = Math.PI / 4 + i * Math.PI / 4, r = i % 2 ? VALLEY : TIP;
    (i ? sh.lineTo.bind(sh) : sh.moveTo.bind(sh))(Math.cos(a) * r, Math.sin(a) * r);
  }
  const hole = new THREE.Path();
  for (let i = 0; i < 18; i++) { const a = -i / 18 * Math.PI * 2; (i ? hole.lineTo.bind(hole) : hole.moveTo.bind(hole))(Math.cos(a) * HOLE, Math.sin(a) * HOLE); }
  sh.holes.push(hole);
  const s = extrudeSplit(sh, 2.6, 2.4, 1.1);
  return { slide: s.caps, barrel: s.sides };
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
