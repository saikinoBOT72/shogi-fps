// 苦無（忍が長押しで背中の後ろ上に並べて飛ばすもの）：全長 約 250mm
//   形はすっきりさせた記号のような苦無：ひし形の木の葉の刃・まっすぐな柄・丸い輪・房だけ
//   刃：面（slide）は黒っぽい鋼、まわりの面取り（barrel）は明るい鋼 / 柄（grip）と輪（frame）は黒 / 房（detail）は朱
//
// 単位は mm。刃先が +z（飛ぶ向き・lookAt の向き）、原点は刃と柄の境目。kunaiParts(scale) が m にして返す
import * as THREE from 'three';
import { flat } from './kit';
import { extrudeSplit } from './shuriken';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const KUNAI_LEN = { tip: 112, ring: -100, tasselFrom: -112 };   // 刃先・柄頭の輪の中心・房の付け根（z, mm）

const withUV = (g: THREE.BufferGeometry) => {
  const p = g.attributes.position, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getZ(i) / 250 + 0.5; uv[i * 2 + 1] = p.getY(i) / 250 + 0.5; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
};
// 前後（z）に向いた円柱
const rodZ = (z0: number, z1: number, r0: number, r1 = r0, seg = 8) => { const g = new THREE.CylinderGeometry(r1, r0, z1 - z0, seg); g.rotateX(Math.PI / 2); g.translate(0, 0, (z0 + z1) / 2); return g; };

// 塗りごとの形（m）と、房（tassel：付け根が原点、-z へ垂れる）
export function kunaiParts(scale = 1) {
  const k = scale / 1000;
  // 刃：ひし形の木の葉（形の x が刃の長さ → z、形の y が幅、押し出しが厚み → x）
  const sh = new THREE.Shape([[0, -7], [36, -17], [KUNAI_LEN.tip, 0], [36, 17], [0, 7]].map(([x, y]) => new THREE.Vector2(x, y)));
  const bl = extrudeSplit(sh, 1.6, 2.6, 1.3);
  for (const g of [bl.caps, bl.sides]) { g.rotateY(-Math.PI / 2); withUV(g); }
  const fin = (gs: THREE.BufferGeometry[]) => { const g = withUV(flat(mergeGeometries(gs.map(x => (x.index ? x.toNonIndexed() : x))))); g.scale(k, k, k); return g; };
  // 柄：まっすぐな棒。刃との境と柄尻に細い輪
  const grip = [rodZ(-86, 0, 6.2, 6.6, 8)];
  const frame: THREE.BufferGeometry[] = [rodZ(-3, 4, 8.6, 8, 8), rodZ(-90, -84, 7.4, 7.4, 8)];
  { const r = new THREE.TorusGeometry(11, 2.8, 5, 14); r.rotateY(Math.PI / 2); r.translate(0, 0, KUNAI_LEN.ring); frame.push(r); }   // 柄頭の輪（刃と同じ面）
  const body = { slide: bl.caps, barrel: bl.sides, grip: fin(grip), frame: fin(frame) };
  body.slide.scale(k, k, k); body.barrel.scale(k, k, k);
  // 房：結び目の玉と、先が広がる円すい
  const tassel = fin([new THREE.IcosahedronGeometry(4.2, 0), rodZ(-44, -4, 6, 1.6, 6)]);
  return { body, tassel };
}

// 苦無 1 本の見た目（原点は刃と柄の境目、刃先が +z）。userData.tassel：房の入れ物（付け根が原点、-z へ垂れる）
//   userData.glow：8 本そろったときに一瞬光らせる白い刃（ふだんは隠す）
import { skinMaterials } from './skins';
export const KUNAI_SCALE = 1.7;   // 見やすいよう本物の 1.7 倍
let shared: any = null;
export function makeKunai() {
  if (!shared) {
    const p = kunaiParts(KUNAI_SCALE), m = skinMaterials('shinobi');
    const glowGeo = mergeGeometries([p.body.slide, p.body.barrel]);
    shared = { p, m, glowGeo, glowM: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }) };
  }
  const { p, m } = shared, g = new THREE.Group();
  for (const [slot, geo] of Object.entries(p.body) as [string, THREE.BufferGeometry][]) { const x = new THREE.Mesh(geo, m[slot] || m.frame); x.castShadow = true; g.add(x); }
  const tassel = new THREE.Group(); tassel.position.z = KUNAI_LEN.tasselFrom * KUNAI_SCALE / 1000;
  tassel.add(new THREE.Mesh(p.tassel, m.detail)); g.add(tassel);
  const glow = new THREE.Mesh(shared.glowGeo, shared.glowM); glow.scale.setScalar(1.06); glow.visible = false; g.add(glow);
  g.userData = { kind: 'kunai', tassel, glow };
  return g;
}
// 房を重力の向きへ垂らす（world の向き down に、少し揺れ sway を足す）
const _q = new THREE.Quaternion(), _v = new THREE.Vector3(), BACK = new THREE.Vector3(0, 0, -1);
export function hangTassel(g: THREE.Object3D, down: THREE.Vector3, k = 0.2) {
  const t = g.userData.tassel as THREE.Object3D;
  g.updateMatrixWorld(true);
  g.getWorldQuaternion(_q).invert();
  _v.copy(down).normalize().applyQuaternion(_q);
  const want = new THREE.Quaternion().setFromUnitVectors(BACK, _v);
  t.quaternion.slerp(want, k);
}
