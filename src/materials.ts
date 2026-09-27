// 材質の決まりごと（トゥーン調・ローポリの面）。描画の準備をしないので、どこから読み込んでもよい
import * as THREE from 'three';
import { P } from './palette';
import { C } from './core';

// 絵柄：トゥーン調（陰影を4段に塗り分ける）でそろえる。光の反射を計算しない分、軽い
export const TOON_RAMP = new THREE.DataTexture(new Uint8Array([95, 155, 210, 255]), 4, 1, THREE.RedFormat);
TOON_RAMP.minFilter = TOON_RAMP.magFilter = THREE.NearestFilter; TOON_RAMP.needsUpdate = true;
export const toon = (o: any = {}) => {
  const { roughness, metalness, flatShading, ...rest } = o;   // トゥーン材質に無い項目は捨てる
  return new THREE.MeshToonMaterial(Object.assign({ gradientMap: TOON_RAMP }, rest));
};
export const mat = (hex, o: any = {}) => toon(Object.assign({ color: C(hex) }, o));
// 丸い形（円錐・円柱・多面体）も面ごとに陰影が分かれるローポリ調にする
const flatCache = new Map();
export function flatGeo(g) {
  if (g.userData.flat) return g;
  if (flatCache.has(g.uuid)) return flatCache.get(g.uuid);
  const f = g.index ? g.toNonIndexed() : g.clone();
  f.computeVertexNormals(); f.userData.flat = true;
  flatCache.set(g.uuid, f);
  return f;
}
const ROUND = new Set(['ConeGeometry', 'CylinderGeometry', 'IcosahedronGeometry', 'TorusGeometry', 'DodecahedronGeometry', 'OctahedronGeometry']);
export function flatten(root) {
  root.traverse((o: any) => { if (o.isMesh && !o.isInstancedMesh && ROUND.has(o.geometry.type)) o.geometry = flatGeo(o.geometry); });
}
// 動く駒の輪郭線（裏返した一回り大きい形を墨色で描く）
export const outlineMat = new THREE.MeshBasicMaterial({ color: P.sumi[0], side: THREE.BackSide });
