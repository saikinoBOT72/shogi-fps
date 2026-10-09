// 苦無（忍が長押しで背中の後ろ上に並べて飛ばすもの）：全長 約 250mm
//   刃：木の葉の形（根元の 35% あたりがいちばん広い）。真ん中に稜線、両側へ削った面（slide 黒い地鉄）→ 研いだ刃先（barrel 明るい鋼）
//   柄：細い鉄の芯（frame）に紐を斜めに巻いたもの（grip）。刃との境に鍔の代わりの輪（frame）
//   柄頭：丸い輪（frame）。輪の下から朱の房（detail）が下がる（房だけ別の入れ物 tassel：揺らせる）
//
// 単位は mm。刃先が +z（飛ぶ向き・lookAt の向き）、原点は刃と柄の境目。kunaiParts(scale) が m にして返す
import * as THREE from 'three';
import { flat } from './kit';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const KUNAI_LEN = { tip: 112, ring: -107, tasselFrom: -120 };   // 刃先・柄頭の輪の中心・房の付け根（z, mm）

// 刃：s（0 根元〜1 刃先）ごとの半分の幅・稜線の厚み
const half = (s: number) => (s < 0.35 ? 8 + 9.5 * (1 - Math.pow(1 - s / 0.35, 2)) : 17.5 * (1 - Math.pow((s - 0.35) / 0.65, 1.5)));
const ridge = (s: number) => 3.3 - 2.7 * s;
const EDGE = 0.35, GRIND = 0.55;

function bladeGeo(n = 16) {
  const core: number[] = [], edge: number[] = [];
  const tri = (out: number[], a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, want: THREE.Vector3) => {
    const nrm = b.clone().sub(a).cross(c.clone().sub(a));
    if (nrm.dot(want) < 0) [b, c] = [c, b];
    for (const p of [a, b, c]) out.push(p.x, p.y, p.z);
  };
  const quad = (out: number[], a, b, c, d, want) => { tri(out, a, b, c, want); tri(out, a, c, d, want); };
  // 刃の面は y（上下）が幅、x が厚み
  const P = (z: number, y: number, x: number) => new THREE.Vector3(x, y, z);
  const row = (s: number) => { const w = half(s), h = ridge(s); return { z: KUNAI_LEN.tip * s, w, h, gw: w * GRIND, gh: EDGE + (h - EDGE) * 0.4 }; };
  for (let i = 0; i < n; i++) {
    const A = row(i / n), B = row((i + 1) / n);
    for (const xs of [1, -1]) for (const ys of [1, -1]) {
      const want = new THREE.Vector3(xs, 0, 0);
      quad(core, P(A.z, 0, xs * A.h), P(B.z, 0, xs * B.h), P(B.z, ys * B.gw, xs * B.gh), P(A.z, ys * A.gw, xs * A.gh), want);
      quad(edge, P(A.z, ys * A.gw, xs * A.gh), P(B.z, ys * B.gw, xs * B.gh), P(B.z, ys * B.w, xs * EDGE), P(A.z, ys * A.w, xs * EDGE), want);
    }
    for (const ys of [1, -1]) quad(edge, P(A.z, ys * A.w, EDGE), P(B.z, ys * B.w, EDGE), P(B.z, ys * B.w, -EDGE), P(A.z, ys * A.w, -EDGE), new THREE.Vector3(0, ys, 0));
  }
  const geo = (pos: number[]) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); return withUV(flat(g)); };
  return { core: geo(core), edge: geo(edge) };
}
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
  const bl = bladeGeo();
  const frame: THREE.BufferGeometry[] = [], grip: THREE.BufferGeometry[] = [];
  // 刃の根元の輪（鍔の代わり）と柄の芯
  frame.push(rodZ(-4, 3, 9.2, 8.4, 10));
  frame.push(rodZ(-90, -4, 6.4, 7, 8));
  // 柄巻き：斜めに傾けた紐の輪を交互に（巻いた紐の山）
  for (let i = 0; i < 12; i++) {
    const t = new THREE.TorusGeometry(7.2, 1.7, 4, 10);
    t.rotateY((i % 2 ? 1 : -1) * 0.32);
    t.translate(0, 0, -10 - i * 6.6);
    grip.push(t);
  }
  // 柄頭：首と丸い輪（輪の面は刃の面と同じ向き＝ y-z の面）
  frame.push(rodZ(-96, -88, 5, 6.2, 8));
  { const r = new THREE.TorusGeometry(12.5, 3.2, 6, 16); r.rotateY(Math.PI / 2); r.translate(0, 0, KUNAI_LEN.ring); frame.push(r); }
  const fin = (gs: THREE.BufferGeometry[]) => { const g = withUV(flat(mergeGeometries(gs.map(x => (x.index ? x.toNonIndexed() : x))))); g.scale(k, k, k); return g; };
  const body = { slide: bl.core, barrel: bl.edge, frame: fin(frame), grip: fin(grip) };
  body.slide.scale(k, k, k); body.barrel.scale(k, k, k);
  // 房：結び目（玉）と、そこから垂れる 7 本の糸
  const tas: THREE.BufferGeometry[] = [new THREE.IcosahedronGeometry(4.6, 0)];
  tas.push(rodZ(-9, -2, 3.2, 4.2, 6));   // 結び目の下の巻き
  for (let i = 0; i < 7; i++) {
    const a = i / 7 * Math.PI * 2, r = i ? 2.4 : 0;
    const s = rodZ(-52 + (i % 3) * 5, -6, 0.9, 1.4, 4); s.translate(Math.cos(a) * r, Math.sin(a) * r, 0);
    tas.push(s);
  }
  const tassel = fin(tas);
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
