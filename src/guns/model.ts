// 銃の組み立ての共通部分：部品・塗装・動きをまとめて、ゲームが使う形（fire / reload / inspect / equip）にする
import * as THREE from 'three';
import { GunAnimator, Clip } from './anim';
import { PartBuilder } from './kit';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SKINS, skinMaterials } from './skins';

export type GunDef = {
  B: PartBuilder;
  clips: Record<string, Clip>;
  muzzle: THREE.Object3D; eject: THREE.Object3D;
  skin: string;
  info: { name: string; real: string; reload?: number };
  vm: { scale: number; yaw?: number; hip: THREE.Vector3; ads: THREE.Vector3; size?: number; adsDrop?: number };   // adsDrop：覗き込みでさらに下げる量（m。ブルパップの床尾が目の前をふさがないように）
  events?: Record<string, (anim: GunAnimator) => void>;   // 動きの中の出来事（銃の中で処理するもの）
  // スキンの付け足し（name がスキンの addons にあるときだけ見える）。slot の塗装を使う。part に付けると一緒に動く
  addons?: Addon[];
  // スコープ（覗くと筒の中から景色が見える）：eye 接眼レンズの面の中心 / r 外枠の半径 / rin 景色が見える穴の半径（どれも銃の原点から、m）
  //   shape：丸以外の窓の形（eye を中心にした m の平面の形）/ part：動く部品に付いているとき、その部品の名前（スライドなど）
  scope?: { eye: THREE.Vector3; r: number; rin: number; shape?: THREE.Shape; part?: string };
};

export function makeGun(d: GunDef) {
  const { B } = d;
  B.finish();
  const addons = makeAddons(B, d.addons || []);
  let skin = d.skin;
  function setSkin(id: string) {
    skin = id;
    const m = skinMaterials(id);
    for (const [slot, meshes] of Object.entries(B.slots)) meshes.forEach(x => { x.material = m[slot] || m.frame; });
    addons.apply(id, m);
  }
  setSkin(skin);
  B.root.add(d.muzzle);
  const anim = new GunAnimator(B.parts, d.clips);
  const model: any = {
    g: B.root, parts: B.parts, slots: B.slots, muzzle: d.muzzle, eject: d.eject, anim, info: d.info,
    slide: B.parts.carrier || B.parts.lever || new THREE.Object3D(), slideZ: 0, slideAmt: 0,
    vmScale: d.vm.scale, vmYaw: d.vm.yaw || 0, hip: d.vm.hip, ads: d.vm.ads, vmSize: d.vm.size || 1, adsDrop: d.vm.adsDrop || 0,
    scope: d.scope,
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

// スキンの付け足し：まとめた形とは別のメッシュにして、スキンごとに出し入れする
// 形は図面の位置（銃の原点から）で作るので、動く部品に付けるときは部品の回転の中心の分だけ戻す
export type Addon = { name: string; slot: string; geo: THREE.BufferGeometry; part?: THREE.Object3D };
// 見せる飾りは「付ける場所 × 塗りの場所」ごとに1つの形にまとめて描く（LR は飾りが 40 個ほどあり、別々だと描く回数がその分増えるため）
//   まとめた形は飾りの組み合わせごとに一度だけ作って使い回す。まとめられない物（uv の無い形など）は別々のまま
export function makeAddons(B: PartBuilder, list: Addon[]) {
  const items = list.map(a => {
    const mesh = new THREE.Mesh(a.geo); mesh.castShadow = true; mesh.visible = false; mesh.userData.slot = a.slot;
    const to = a.part || B.root;
    if (to !== B.root && to.userData.pivotAt) mesh.position.copy(to.userData.pivotAt).negate();
    to.add(mesh);
    return { ...a, mesh, to };
  });
  const sets = new Map<string, { mesh: THREE.Mesh; slot: string }[]>();
  let shown: { mesh: THREE.Mesh; slot: string }[] = [];
  const clean = (g: THREE.BufferGeometry) => {
    const x = g.index ? g.toNonIndexed() : g.clone();
    for (const k of Object.keys(x.attributes)) if (!['position', 'normal', 'uv'].includes(k)) x.deleteAttribute(k);
    return x;
  };
  function build(on: string[]) {
    const groups = new Map<string, typeof items>();
    for (const a of items) if (on.includes(a.name)) { const k = a.to.uuid + '|' + a.slot; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(a); }
    const out: { mesh: THREE.Mesh; slot: string }[] = [];
    for (const g of groups.values()) {
      const same = g.every(a => !!a.geo.attributes.uv === !!g[0].geo.attributes.uv && !!a.geo.attributes.normal === !!g[0].geo.attributes.normal);
      const geo = g.length > 1 && same ? mergeGeometries(g.map(a => clean(a.geo))) : null;
      if (!geo) { for (const a of g) out.push({ mesh: a.mesh, slot: a.slot }); continue; }
      const mesh = new THREE.Mesh(geo); mesh.castShadow = g[0].mesh.castShadow; mesh.visible = false; mesh.userData.slot = g[0].slot;
      mesh.position.copy(g[0].mesh.position); g[0].to.add(mesh);
      out.push({ mesh, slot: g[0].slot });
    }
    return out;
  }
  return {
    apply(id: string, m: Record<string, THREE.Material>) {
      const on = SKINS[id]?.addons || [];
      for (const x of shown) x.mesh.visible = false;
      const key = on.slice().sort().join(',');
      if (!sets.has(key)) sets.set(key, build(on));
      shown = sets.get(key);
      for (const x of shown) { x.mesh.visible = true; x.mesh.material = m[x.slot] || m.frame; }
    },
  };
}
