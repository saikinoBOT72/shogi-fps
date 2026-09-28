// 銃の組み立ての共通部分：部品・塗装・動きをまとめて、ゲームが使う形（fire / reload / inspect / equip）にする
import * as THREE from 'three';
import { GunAnimator, Clip } from './anim';
import { PartBuilder } from './kit';
import { skinMaterials } from './skins';

export type GunDef = {
  B: PartBuilder;
  clips: Record<string, Clip>;
  muzzle: THREE.Object3D; eject: THREE.Object3D;
  skin: string;
  info: { name: string; real: string; reload?: number };
  vm: { scale: number; yaw?: number; hip: THREE.Vector3; ads: THREE.Vector3; size?: number };
  events?: Record<string, (anim: GunAnimator) => void>;   // 動きの中の出来事（銃の中で処理するもの）
};

export function makeGun(d: GunDef) {
  const { B } = d;
  B.finish();
  let skin = d.skin;
  function setSkin(id: string) {
    skin = id;
    const m = skinMaterials(id);
    for (const [slot, meshes] of Object.entries(B.slots)) meshes.forEach(x => { x.material = m[slot] || m.frame; });
  }
  setSkin(skin);
  B.root.add(d.muzzle);
  const anim = new GunAnimator(B.parts, d.clips);
  const model: any = {
    g: B.root, parts: B.parts, slots: B.slots, muzzle: d.muzzle, eject: d.eject, anim, info: d.info,
    slide: B.parts.carrier || B.parts.lever || new THREE.Object3D(), slideZ: 0, slideAmt: 0,
    vmScale: d.vm.scale, vmYaw: d.vm.yaw || 0, hip: d.vm.hip, ads: d.vm.ads, vmSize: d.vm.size || 1,
    get skin() { return skin; }, setSkin,
    onEvent: null,
    fire(empty = false) { anim.stop('inspect'); anim.stop('equip'); anim.play(empty && d.clips.fireLast ? 'fireLast' : 'fire'); },
    reload(dur = 2) { anim.stop('inspect'); anim.play('reload', dur); },
    inspect() { if (!anim.has('reload')) anim.play('inspect'); },
    equip() { anim.clear(); anim.play('equip'); },
  };
  anim.on = ev => { d.events?.[ev]?.(anim); model.onEvent?.(ev); };
  return model;
}

// 手（木の塊）
export function handMesh(mat: THREE.Material, sx = 0.75, sy = 0.95, sz = 0.85) {
  const h = new THREE.Mesh(new THREE.IcosahedronGeometry(0.066, 0), mat);
  h.scale.set(sx, sy, sz); h.castShadow = true;
  return h;
}
