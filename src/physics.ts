// 物理演算で動く小物（cannon.js）
import { P, css } from './palette';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { gs } from './state';
import { BH, G, GROUND, clamp, rand } from './core';
const G0 = GROUND;
import { SFX } from './audio';
import { PIECE_DEPTH, canvasTex, mat, pieceGeo, pieceWoodMat, scene, toon, woodGrain } from './render';
import { FLOW, MAPS, WATER_Y, colliders, insideCollider, mapId, mapLV, onMapChange, propMeshes } from './world';

// ================= 物理演算（cannon.js）：撃つ・押す・体当たりで動く小物 =================
export const physMeshes = [];
// レイの当たりから、動く小物（PHYS の item）を取り出す
export const physOf = hit => hit && hit.object && (hit.object.userData.phys || (hit.object.userData.physList && hit.object.userData.physList[hit.instanceId]));       // 弾と視線を遮る（CPUの経路探索には使わない＝押しのけて進める）
export let blockers = propMeshes;   // 弾・視線を遮るもの全部
gs.sndBudget = 4;           // 1フレームに鳴らす衝突音の上限（小物が一斉に崩れても音割れしない）
// 文字入りの木目を表面に焼き込んだ駒（1メッシュで描けるので軽い）
export const solidMatCache = {};
export function pieceSolidMats(ch, red?) {
  const key = ch + (red ? 'r' : '');
  if (solidMatCache[key]) return solidMatCache[key];
  const tex = canvasTex(256, 256, (g, w, h) => {
    woodGrain(g, w, h, P.kiji[2], P.kiji[0], 30);
    g.fillStyle = red ? css(P.shu[0]) : css(P.sumi[0]); g.font = '900 136px "Yu Mincho","Hiragino Mincho ProN","MS Mincho",serif';
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ch, 128, 150);
  });
  return solidMatCache[key] = [toon({ map: tex, roughness: 0.7 }), pieceWoodMat];
}
export const crateTex = canvasTex(256, 256, (g, w) => {
  woodGrain(g, w, w, P.kiji[1], P.sumi[1], 40);
  g.strokeStyle = css(P.kiji[0]); g.lineWidth = 26; g.strokeRect(13, 13, w - 26, w - 26);
  g.lineWidth = 22; g.beginPath(); g.moveTo(20, 20); g.lineTo(w - 20, w - 20); g.stroke();
});
export const crateMat = toon({ map: crateTex, roughness: 0.8 });

export const PHYS: any = (() => {
  const world = new CANNON.World();
  world.gravity.set(0, -G, 0);
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.allowSleep = true;
  (world.solver as any).iterations = 8;
  world.defaultContactMaterial.friction = 0.45;
  world.defaultContactMaterial.restitution = 0.2;
  const items = [];
  const addStatic = (shape, x, y, z, q?) => {
    const b = new CANNON.Body({ mass: 0 }); b.addShape(shape); b.position.set(x, y, z);
    b.collisionFilterGroup = 1; b.collisionFilterMask = 2;
    if (q) b.quaternion.copy(q);
    world.addBody(b); return b;
  };
  // 外周の地面（盤や障害物は下の colliders から作る）
  const gq = new CANNON.Quaternion(); gq.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
  addStatic(new CANNON.Plane(), 0, GROUND, 0, gq);
  // 坂：斜めに傾けた板（上面が坂の面に合うように、厚みの分だけ下げる）
  function rampStatic(c) {
    const along = c.axis === 'x', len = along ? c.max.x - c.min.x : c.max.z - c.min.z, wid = along ? c.max.z - c.min.z : c.max.x - c.min.x;
    const dh = c.y1 - c.y0, th = Math.atan2(dh, len), sg = Math.sign(c.hi - c.lo), T = 0.2;
    const q = new CANNON.Quaternion();
    if (along) q.setFromAxisAngle(new CANNON.Vec3(0, 0, 1), sg * th); else q.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -sg * th);
    const n = q.vmult(new CANNON.Vec3(0, 1, 0));
    const mx = (c.min.x + c.max.x) / 2, mz = (c.min.z + c.max.z) / 2, my = (c.y0 + c.y1) / 2;
    const half = along ? new CANNON.Vec3(Math.hypot(len, dh) / 2, T, wid / 2) : new CANNON.Vec3(wid / 2, T, Math.hypot(len, dh) / 2);
    return addStatic(new CANNON.Box(half), mx - n.x * T, my - n.y * T, mz - n.z * T, q);
  }
  // なめらかな地形：cannon の Heightfield（格子を寝かせて置く。中庭などの穴の所は低くしておく）
  function hfStatic(c) {
    const n = c.n, data = [];
    for (let i = 0; i < n; i++) { const col = []; for (let j = 0; j < n; j++) { const k = (n - 1 - j) * n + i; col.push(c.holeV[k] ? G0 - 0.5 : c.hts[k]); } data.push(col); }
    const q = new CANNON.Quaternion(); q.setFromEuler(-Math.PI / 2, 0, 0);
    return addStatic(new CANNON.Heightfield(data, { elementSize: 1 }), c.x0, 0, c.x0 + n - 1, q);
  }
  // 動かない障害物（今のマップのもの。切り替えたら作り直す）
  let statics = [];
  function buildStatics() {
    statics.forEach(b => world.removeBody(b));
    statics = colliders.flatMap(c => c.kind === 'hf' ? hfStatic(c) : c.kind === 'pyr'   // ピラミッド：面の内側に収まる階段状の箱
      ? c.phys.map(b => addStatic(new CANNON.Box(new CANNON.Vec3((b.max.x - b.min.x) / 2, (b.max.y - b.min.y) / 2, (b.max.z - b.min.z) / 2)), (b.max.x + b.min.x) / 2, (b.max.y + b.min.y) / 2, (b.max.z + b.min.z) / 2))
      : c.kind === 'ramp' ? rampStatic(c) : c.kind === 'box'
      ? addStatic(new CANNON.Box(new CANNON.Vec3((c.max.x - c.min.x) / 2, (c.max.y - c.min.y) / 2, (c.max.z - c.min.z) / 2)),
        (c.max.x + c.min.x) / 2, (c.max.y + c.min.y) / 2, (c.max.z + c.min.z) / 2)
      : addStatic(new CANNON.Cylinder(c.r, c.r, c.y1 - c.y0, 10), c.x, (c.y0 + c.y1) / 2, c.z));   // cannon-es の円柱は縦向き
  }
  buildStatics();

  // ドミノ同士は滑りやすく（もたれ合って止まらないように）
  const dominoMat = new CANNON.Material("domino");
  world.addContactMaterial(new CANNON.ContactMaterial(dominoMat, dominoMat, { friction: 0.02, restitution: 0.05 }));
  function addDynamic(kind, half, mass, x, y, z, ry = 0, pitch = 1, material?) {
    const q = new CANNON.Quaternion(); q.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), ry);
    return addBody(kind, new CANNON.Box(new CANNON.Vec3(...half)), mass, x, y, z, q, pitch, material);
  }
  // 形（shape）を指定して動く物を足す。q: 置く向き
  // 種類ごとの見た目（kinds[名前] = { geo, mat, items }）。最後に InstancedMesh を1つずつ作る
  const kinds: Record<string, any> = {};
  const breakQueue = [];
  // 壺を割る：体を世界から外して見えなくし、かけらと音は game.ts（PHYS.onBreak）
  function breakIt(it) {
    if (it.broken || it.off) return;
    it.broken = true; world.removeBody(it.body);
    PHYS.onBreak?.(new THREE.Vector3(it.body.position.x, it.body.position.y, it.body.position.z), it.kind);
  }
  function addBody(kind, shape, mass, x, y, z, q, pitch = 1, material?) {
    const obj = new THREE.Object3D();
    // 眠る条件を厳しめに（ゆっくり傾き始めたものが途中で止まらないように）
    const body = new CANNON.Body({ mass, sleepSpeedLimit: 0.08, sleepTimeLimit: 1.2, linearDamping: 0.03, angularDamping: 0.05 });
    body.addShape(shape);
    body.collisionFilterGroup = 2; body.collisionFilterMask = 1 | 2 | 4;
    if (material) body.material = material;
    const domino = material === dominoMat;
    body.position.set(x, y, z);
    if (q) body.quaternion.copy(q);
    world.addBody(body);
    scene.add(obj);
    const it: any = { kind, body, obj, pitch, domino, map: placing, off: false, lastSnd: 0, home: { p: new CANNON.Vec3().copy(body.position), q: new CANNON.Quaternion().copy(body.quaternion) } };
    kinds[kind].items.push(it);
    body.addEventListener('collide', e => {
      if (e.body.collisionFilterGroup === 4) it.pushedAt = world.time;   // 体に押された
      const v = Math.abs(e.contact.getImpactVelocityAlongNormal()), now = performance.now();
      if (it.breakable && v > 6) breakQueue.push(it);   // 強くぶつかった壺は割れる
      if (v > 1.8 && now - it.lastSnd > 90 && gs.sndBudget > 0) { it.lastSnd = now; gs.sndBudget--; SFX.play('prop', kind, body.position, clamp(v / 9, 0.15, 1)); }
    });
    items.push(it);
    return it;
  }
  // 見た目（原点が中心）

  const barrelM = mat(P.shu[0]), hoopM = mat(P.sumi[1]), strawM = mat(P.kiji[2]), ropeM = mat(P.kiji[0]), cartM = toon({ map: crateTex, roughness: 0.8 }), barkM = mat(P.kiji[0]), cutM = mat(P.kiji[2]);
  const barrelObj = () => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.1, 10), barrelM));
    for (const y of [-0.38, 0.38]) { const h = new THREE.Mesh(new THREE.CylinderGeometry(0.47, 0.47, 0.08, 10), hoopM); h.position.y = y; g.add(h); }
    return g;
  };
  const baleObj = () => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.6, 0.7), strawM));
    for (const x of [-0.3, 0.3]) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.62, 0.72), ropeM); r.position.x = x; g.add(r); }
    return g;
  };
  const cartObj = () => {
    const g = new THREE.Group();
    const bed = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.25, 2.4), cartM); bed.position.y = 0.1; g.add(bed);
    for (const x of [-0.75, 0.75]) { const side = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.4, 2.4), cartM); side.position.set(x, 0.4, 0); g.add(side); }
    for (const x of [-0.9, 0.9]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.12, 10).rotateZ(Math.PI / 2), hoopM); w.position.set(x, -0.2, 0); g.add(w); }
    for (const x of [-0.5, 0.5]) { const hd = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 1.4), cartM); hd.position.set(x, 0.05, 1.8); g.add(hd); }
    return g;
  };
  const logObj = () => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 3, 8), barkM));
    for (const y of [-1.5, 1.5]) { const c = new THREE.Mesh(new THREE.CircleGeometry(0.28, 8), cutM); c.position.y = y + Math.sign(y) * 0.005; c.rotation.x = y > 0 ? -Math.PI / 2 : Math.PI / 2; g.add(c); }
    return g;
  };

  // 部品（色の違うメッシュ）を、頂点の色つきの1つの形にまとめる
  const bake = (g: THREE.Object3D) => {
    g.updateMatrixWorld(true);
    const geos = [];
    g.traverse((o: any) => {
      if (!o.isMesh) return;
      const geo = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()).applyMatrix4(o.matrixWorld);
      for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal') geo.deleteAttribute(k);
      const c = o.material.color, n = geo.attributes.position.count, col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geos.push(geo);
    });
    const m = mergeGeometries(geos); m.computeVertexNormals();
    return m;
  };
  const vcM = toon({ vertexColors: true });
  kinds.crate = { geo: new THREE.BoxGeometry(1.2, 1.2, 1.2), mat: crateMat, items: [] };
  kinds.barrel = { geo: bake(barrelObj()), mat: vcM, items: [] };
  kinds.bale = { geo: bake(baleObj()), mat: vcM, items: [] };
  kinds.cart = { geo: bake(cartObj()), mat: vcM, items: [] };
  kinds.log = { geo: bake(logObj()), mat: vcM, items: [] };
  // 山寺の小物：賽銭箱（重い遮蔽）と手桶（軽くてよく飛ぶ）
  const saisenObj = () => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.8, 0.9), barkM); g.add(body);
    for (let i = 0; i < 7; i++) { const sl = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.92), cutM); sl.position.set(-0.6 + i * 0.2, 0.43, 0); g.add(sl); }
    for (const x of [-0.72, 0.72]) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.9, 0.96), hoopM); f.position.set(x, 0.02, 0); g.add(f); }
    return g;
  };
  const okeObj = () => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.22, 0.36, 10), cutM));
    for (const y of [-0.1, 0.1]) { const h = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.25, 0.04, 10), hoopM); h.position.y = y; g.add(h); }
    const hd = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.3, 0.06), barkM); hd.position.set(0, 0.3, 0); g.add(hd);
    return g;
  };
  kinds.saisen = { geo: bake(saisenObj()), mat: vcM, items: [] };
  kinds.oke = { geo: bake(okeObj()), mat: vcM, items: [] };
  function placeTemple() {
    placing = 'temple';
    const { LOW, MID, TOP } = mapLV('temple');
    [1, -1].forEach(s => {
      // 本堂の横に積んだ奉納の酒樽
      for (const z of [-1.1, 0, 1.1]) addBody('barrel', new CANNON.Cylinder(0.45, 0.45, 1.1, 10), 3, 12.8 * s, TOP + 0.55, z * s, null, 0.8);
      addBody('barrel', new CANNON.Cylinder(0.45, 0.45, 1.1, 10), 3, 12.8 * s, TOP + 1.66, -0.55 * s, null, 0.8);
      // 賽銭箱（本堂の入口の前）
      addDynamic('saisen', [0.75, 0.45, 0.48], 45, 0, TOP + 0.45, -9.8 * s, 0, 0.45);
      // 手桶（墓地と池のそば）
      for (const [x, z, y] of [[12, -29.5, MID], [20.5, -29.5, MID], [27, -25.2, MID], [14, -41, LOW], [-18, -40.5, LOW]])
        addBody('oke', new CANNON.Cylinder(0.25, 0.25, 0.36, 8), 0.8, x * s, y + 0.2, z * s, null, 1.3);
      // 木箱・米俵・丸太
      for (const [x, z, y] of [[-26, -33, MID], [8, -21, MID], [-38, -30, LOW], [30, -39.5, LOW], [-20, -44, LOW]])
        addDynamic('crate', [cs / 2, cs / 2, cs / 2], 10, x * s, y + cs / 2, z * s, rand(-0.3, 0.3), 0.65);
      for (const x of [-44, -42.8]) addDynamic('bale', [0.55, 0.3, 0.35], 25, x * s, LOW + 0.3, -41.3 * s, 0, 0.5);
      addBody('log', new CANNON.Cylinder(0.3, 0.3, 3, 8), 6, -30 * s, MID + 0.3, -19.5 * s, lying, 0.7);
    });
  }

  // 雪の温泉街の小物
  const snowM = mat(P.shiro[2]), coalM = mat(P.sumi[0]), carrotM = mat(P.daidai[1]), stoneM = mat(P.nezumi[1]), litM = mat(P.kin[2]);
  const ball = (r, face = false) => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), snowM));
    if (face) {
      for (const x of [-0.1, 0.1]) { const e = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.04), coalM); e.position.set(x, 0.06, r - 0.02); g.add(e); }
      const n = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.2, 5).rotateX(Math.PI / 2), carrotM); n.position.set(0, -0.02, r + 0.08); g.add(n);
    }
    return g;
  };
  const okeYObj = () => {   // 黄色い湯桶
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.2, 0.3, 12), mat(P.kin[1])));
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 12), mat(P.kin[2])); b.position.y = -0.14; g.add(b);
    return g;
  };
  const pingObj = () => {   // 卓球台（緑の天板、白い線、網、脚）
    const g = new THREE.Group();
    const top = new THREE.Mesh(new THREE.BoxGeometry(2.74, 0.06, 1.52), mat(P.midori[0])); top.position.y = 0.35; g.add(top);
    const line = new THREE.Mesh(new THREE.BoxGeometry(2.74, 0.065, 0.03), mat(P.shiro[2])); line.position.y = 0.35; g.add(line);
    const net = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.15, 1.7), mat(P.shiro[1])); net.position.y = 0.45; g.add(net);
    for (const x of [-1.1, 1.1]) for (const z of [-0.6, 0.6]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.7, 0.08), hoopM); l.position.set(x, 0, z); g.add(l); }
    return g;
  };
  const toroObj = () => {   // 石灯籠（原点が真ん中。高さ 2.1）
    const g = new THREE.Group();
    const add = (m, w, h, y, d = w) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.y = y - 1.05; g.add(b); };
    add(stoneM, 0.7, 0.3, 0.15); add(stoneM, 0.28, 0.9, 0.75); add(stoneM, 0.62, 0.15, 1.27);
    add(litM, 0.46, 0.4, 1.55); add(stoneM, 0.9, 0.22, 1.86); add(snowM, 0.8, 0.08, 2.01);
    return g;
  };
  const makiObj = () => {   // 薪（短い丸太）
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 1, 7), barkM));
    for (const y of [-0.5, 0.5]) { const c = new THREE.Mesh(new THREE.CircleGeometry(0.12, 7), cutM); c.position.y = y + Math.sign(y) * 0.005; c.rotation.x = y > 0 ? -Math.PI / 2 : Math.PI / 2; g.add(c); }
    return g;
  };
  const sledObj = () => {   // そり（赤い板と、前が反った滑り木）
    const g = new THREE.Group();
    const bed = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.08, 1.6), mat(P.shu[1])); bed.position.y = 0.08; g.add(bed);
    for (const x of [-0.35, 0.35]) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 1.7), hoopM); r.position.set(x, -0.14, 0); g.add(r);
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.3, 0.06), hoopM); tip.position.set(x, 0, 0.85); tip.rotation.x = 0.5; g.add(tip);
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.05), hoopM); leg.position.set(x, -0.04, -0.4); g.add(leg);
    }
    return g;
  };
  const milkObj = () => {   // 牛乳瓶のケース（木の箱に白い瓶）
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.36), cutM));
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.2, 6), mat(P.shiro[2])); b.position.set(-0.15 + i * 0.15, 0.1, -0.08 + j * 0.16); g.add(b); }
    return g;
  };
  const kasaObj = () => {   // 開いた番傘（原点が真ん中）
    const g = new THREE.Group();
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.9, 0.45, 12), mat(P.shu[0])); c.position.y = 0.2; g.add(c);
    const h = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1, 5), barkM); h.position.y = -0.1; g.add(h);
    return g;
  };
  kinds.snowL = { geo: bake(ball(0.55)), mat: vcM, items: [] };
  kinds.snowM = { geo: bake(ball(0.42)), mat: vcM, items: [] };
  kinds.snowS = { geo: bake(ball(0.3, true)), mat: vcM, items: [] };
  kinds.okeY = { geo: bake(okeYObj()), mat: vcM, items: [] };
  kinds.ping = { geo: bake(pingObj()), mat: vcM, items: [] };
  kinds.toro = { geo: bake(toroObj()), mat: vcM, items: [] };
  kinds.maki = { geo: bake(makiObj()), mat: vcM, items: [] };
  kinds.sled = { geo: bake(sledObj()), mat: vcM, items: [] };
  kinds.milk = { geo: bake(milkObj()), mat: vcM, items: [] };
  kinds.kasa = { geo: bake(kasaObj()), mat: vcM, items: [] };
  function placeOnsen() {
    placing = 'onsen';
    const { L, U } = mapLV('onsen');
    const cyl = (r, h) => new CANNON.Cylinder(r, r, h, 10);
    const sledMat = dominoMat;   // よく滑る
    [1, -1].forEach(s => {
      // a 雪だるま（3段。撃った段だけ転がり落ちる）
      for (const [x, z, y] of [[33, -35, U], [12, -22, L]]) {
        addBody('snowL', cyl(0.5, 0.95), 6, x * s, y + 0.48, z * s, null, 0.8);
        addBody('snowM', cyl(0.38, 0.75), 3, x * s, y + 0.96 + 0.38, z * s, null, 0.9);
        const q = new CANNON.Quaternion(); q.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), s > 0 ? 0 : Math.PI);   // 顔は広場の方へ
        addBody('snowS', cyl(0.27, 0.55), 1.2, x * s, y + 1.72 + 0.28, z * s, q, 1.1);
      }
      // b 湯桶のピラミッド（4・3・2・1。軽くてよく飛ぶ）
      for (let row = 0; row < 4; row++) for (let i = 0; i < 4 - row; i++)
        addBody('okeY', cyl(0.24, 0.3), 0.6, -19 * s, L + 0.15 + row * 0.31, (3 + (i - (3 - row) / 2) * 0.52) * s, null, 1.4);
      // c 酒樽（旅館の玄関の前）
      for (const x of [-44, -43, -42]) addBody('barrel', cyl(0.45, 1.1), 3, x * s, U + 0.55, -31.3 * s, null, 0.8);
      addBody('barrel', cyl(0.45, 1.1), 3, -43.5 * s, U + 1.66, -31.3 * s, null, 0.8);
      // d 卓球台（旅館の1階。押せる大きな遮蔽）
      addDynamic('ping', [1.37, 0.38, 0.76], 40, -24 * s, U + 0.05 + 0.38, -38.5 * s, 0, 0.5);
      // e 石灯籠（重い。爆風で倒れる）
      for (const [x, z] of [[0, -19.5], [-20, -12]]) addDynamic('toro', [0.33, 1.05, 0.33], 70, x * s, L + 1.05, z * s, 0, 0.4);
      // f 薪の山（崩すと転がる）
      const lyingX = new CANNON.Quaternion(); lyingX.setFromAxisAngle(new CANNON.Vec3(0, 0, 1), Math.PI / 2);
      for (let row = 0; row < 3; row++) for (let i = 0; i < 4 - row; i++)
        addBody('maki', cyl(0.13, 1), 1.5, 46 * s, U + 0.13 + row * 0.24, (-8 + (i - (3 - row) / 2) * 0.27) * s, lyingX, 1);
      // g そり（石段の上。押すと滑って落ちる）
      addDynamic('sled', [0.4, 0.15, 0.8], 8, 22 * s, U + 0.25, -32 * s, 0, 0.8, sledMat);
      addDynamic('sled', [0.4, 0.15, 0.8], 8, 32 * s, U + 0.25, 8 * s, Math.PI / 2, 0.8, sledMat);
      // h 牛乳瓶のケース（旅館の1階の玄関わき）
      for (const [x, y] of [[-36.3, 0], [-35.7, 0], [-36, 1]]) addDynamic('milk', [0.25, 0.09, 0.18], 2.5, x * s, U + 0.05 + 0.09 + y * 0.19, -35 * s, 0, 1);
      // i 番傘（足湯のそば。開いたまま、ふわっと飛ぶ）
      for (const [x, z] of [[3, -26], [3.4, -24.4], [2.6, -22.8]]) {
        const it = addBody('kasa', new CANNON.Cylinder(0.12, 0.85, 0.45, 10), 0.6, x * s, L + 0.25, z * s, null, 1.2);
        it.body.linearDamping = 0.5; it.body.angularDamping = 0.4;
      }
    });
  }

  // 砂漠の神殿の小物
  //   B 素焼きの壺（撃つ・爆風・強くぶつかると割れて消える）/ C 砂袋（重い低い遮蔽。上に乗れる）/ D 積み石の柱（石の輪を3つ積んだ柱。撃つと上から崩れる）
  const clayM = mat(P.daidai[1]), clayDarkM = mat(P.daidai[0]), sandbagM = mat(P.kiji[1]), seamM = mat(P.kiji[0]), paleStoneM = mat(P.shiro[1]), bandM = mat(P.shiro[0]);
  const jarObj = () => {
    const g = new THREE.Group();
    const pts = [[0, -0.4], [0.2, -0.39], [0.33, -0.2], [0.36, 0], [0.3, 0.2], [0.14, 0.32], [0.12, 0.4], [0.17, 0.44]].map(([x, y]) => new THREE.Vector2(x, y));
    g.add(new THREE.Mesh(new THREE.LatheGeometry(pts, 9), clayM));
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.345, 0.35, 0.08, 9), clayDarkM); b.position.y = 0.02; g.add(b);
    return g;
  };
  const sandbagObj = () => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.36, 0.55), sandbagM));
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 0.45), sandbagM); top.position.y = 0.19; g.add(top);
    const seam = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.38, 0.57), seamM); seam.position.x = 0.35; g.add(seam);
    return g;
  };
  const drumObj = () => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.9, 10), paleStoneM));
    for (const y of [-0.3, 0.3]) { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.06, 10), bandM); r.position.y = y; g.add(r); }
    return g;
  };
  kinds.jar = { geo: bake(jarObj()), mat: vcM, items: [] };
  kinds.sandbag = { geo: bake(sandbagObj()), mat: vcM, items: [] };
  kinds.drum = { geo: bake(drumObj()), mat: vcM, items: [] };
  // E 石材を載せたそり（木のそりに四角い石。押すと砂の上を滑る大きな動く遮蔽）
  const stoneSledObj = () => {
    const g = new THREE.Group();
    const bed = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.12, 2.6), barkM); bed.position.y = -0.48; g.add(bed);
    for (const x of [-0.65, 0.65]) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 2.9), hoopM); r.position.set(x, -0.6, 0); g.add(r); }
    const st = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.0, 1.8), paleStoneM); st.position.y = 0.08; g.add(st);
    const rope = new THREE.Mesh(new THREE.BoxGeometry(1.44, 1.02, 0.08), seamM); rope.position.y = 0.08; g.add(rope);
    return g;
  };
  kinds.stoneSled = { geo: bake(stoneSledObj()), mat: vcM, items: [] };
  function placeDesert() {
    placing = 'desert';
    const { B } = mapLV('desert');
    const cyl = (r, h) => new CANNON.Cylinder(r, r, h, 10);
    [1, -1].forEach(s => {
      // B 素焼きの壺：大ピラミッドの玄室・小ピラミッドの小部屋・河岸神殿の中庭・オアシス・野営地・神殿跡
      for (const [x, z, y] of [[2.2, 2.2, B], [2.4, 1.3, B], [-39.6, 36.2, B], [-36.4, 39.8, B], [-41.5, 7.4, G0], [-41, 6.8, G0],
        [-26.2, 14.2, B], [-27, 13.4, B], [23.8, -35, B], [24.3, -35.7, B], [-44, -39.5, B + 0.4]])
        addBody('jar', cyl(0.34, 0.84), 2, x * s, y + 0.42, z * s, null, 1).breakable = true;
      // C 砂袋（2つ並べて上に1つ）：神殿跡の前・倒れた石のそば・野営地
      for (const [x, z, ry] of [[-20, -24.5, 0], [-37, -23.5, 0], [12, -30, Math.PI / 2]]) {
        const c = Math.cos(ry), sn = Math.sin(ry);
        for (const [dx, row] of [[-0.52, 0], [0.52, 0], [0, 1]])
          addDynamic('sandbag', [0.5, 0.2, 0.28], 30, (x + dx * c) * s, B + 0.2 + row * 0.4, (z - dx * sn) * s, ry, 0.6);
      }
      // D 積み石の柱：参道の脇
      for (const [x, z] of [[-24, -6.5], [-19, 6.5]])
        for (let k = 0; k < 3; k++) addBody('drum', cyl(0.6, 0.9), 8, x * s, B + 0.45 + k * 0.92, z * s, null, 0.7);
      // E 石材のそり：押すと滑る（よく滑るが、少しずつ止まる）
      for (const [x, z, ry] of [[-20, 11, 0], [-12, 28, Math.PI / 2]]) {
        const it = addDynamic('stoneSled', [0.75, 0.62, 1.4], 19, x * s, B + 0.68, z * s, ry, 0.5, dominoMat);
        it.body.linearDamping = 0.35;
      }
      // 野営地の木箱と酒樽（発掘の道具箱）
      for (const [x, z, y] of [[18.6, -34, 0], [18.6, -32.8, 0], [18.6, -33.4, 1.2]]) addDynamic('crate', [0.6, 0.6, 0.6], 10, x * s, B + 0.6 + y, z * s, rand(-0.2, 0.2), 0.65);
      for (const [x, z] of [[28.5, -38.5], [29.4, -39.1], [28.8, -39.9]]) addBody('barrel', cyl(0.45, 1.1), 3, x * s, B + 0.55, z * s, null, 0.8);
    });
  }

  // 配置（点対称）。マップごとに置き、選んでいないマップの物は外しておく
  let placing = 'valley';
  const { V, T2, HB, HT, PL } = mapLV('valley'), cs = 1.2;
  const lying = new CANNON.Quaternion(); lying.setFromAxisAngle(new CANNON.Vec3(0, 0, 1), Math.PI / 2);   // 丸太は横に寝かせる
  [1, -1].forEach(s => {
    // 木箱：関所の横のピラミッドと、あちこちの遮蔽
    [[-0.62, 0], [0.62, 0], [0, 1]].forEach(([dx, row]) => addDynamic('crate', [cs / 2, cs / 2, cs / 2], 10, (-40 + dx) * s, V + cs / 2 + row * cs, 15 * s, 0, 0.65));
    for (const [x, z, y0] of [[-26, 6, V], [-24.7, 6.3, V], [-3, 18.4, V], [-1.7, 18.4, V], [-22, 46, HT], [-45, 24, T2], [30, 58, PL]])
      addDynamic('crate', [cs / 2, cs / 2, cs / 2], 10, x * s, y0 + cs / 2, z * s, rand(-0.2, 0.2), 0.65);
    // 酒樽：段々の縁に並べる（爆風で谷へ転がり落ちる）
    for (const [x, z, y0] of [[10, 20.8, T2], [11.1, 20.8, T2], [12.2, 20.8, T2], [-1, 14, V], [-12, 31.8, HB]])
      addBody('barrel', new CANNON.Cylinder(0.45, 0.45, 1.1, 10), 3, x * s, y0 + 0.55, z * s, null, 0.8);
    // 米俵：重くてほとんど動かない土のう
    for (const [x, z] of [[-39.6, 4], [-38.4, 4], [-9, 5.2], [-7.8, 5.2]]) addDynamic('bale', [0.55, 0.3, 0.35], 25, x * s, V + 0.3, z * s, 0, 0.5);
    // 荷車：橋の上（押せる大きな遮蔽）
    addDynamic('cart', [0.8, 0.5, 1.2], 30, -34 * s, V + 0.2 + 0.7, 0.5 * s, 0, 0.5);
    // 丸太：丘の縁（当てると転がり落ちる）
    for (const x of [-35, -31, -27]) addBody('log', new CANNON.Cylinder(0.3, 0.3, 3, 8), 6, x * s, HB + 0.3, 32.2 * s, lying, 0.7);
  });

  // 霧の渓谷の小物（置き場所は maps/gorge.ts が地面の高さと一緒に決める。木の物は川に浮いて流される）
  //   切り株（重い）・割った薪・炭俵（重い物陰）・魚籠・竿・浮き。丸太・水桶・木箱は今ある物を使う
  const strawDarkM = mat(P.kiji[0]), bambooM = mat(P.ki[0]), redM = mat(P.shu[1]), whiteM = mat(P.shiro[2]);
  const stumpObj = () => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.42, 0.6, 9), barkM));
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.02, 9), cutM); top.position.y = 0.3; g.add(top);
    return g;
  };
  const splitObj = () => { const g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.13, 0.5), cutM)); const b = new THREE.Mesh(new THREE.BoxGeometry(0.135, 0.06, 0.5), barkM); b.position.y = 0.04; g.add(b); return g; };
  const tawaraObj = () => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.8, 9), strawDarkM));
    for (const y of [-0.25, 0.25]) { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.06, 9), ropeM); r.position.y = y; g.add(r); }
    for (const y of [-0.4, 0.4]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 0.05, 9), strawM); c.position.y = y; g.add(c); }
    return g;
  };
  const bikuObj = () => { const g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 0.36, 8), bambooM)); const n = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.06, 8), barkM); n.position.y = 0.2; g.add(n); return g; };
  const saoObj = () => { const g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.03, 3, 5).rotateX(Math.PI / 2), bambooM)); return g; };
  const ukiObj = () => { const g = new THREE.Group(); const a = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.08, 7), redM); a.position.y = 0.04; g.add(a); const b = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.08, 7), whiteM); b.position.y = -0.04; g.add(b); return g; };
  kinds.stump = { geo: bake(stumpObj()), mat: vcM, items: [] };
  kinds.split = { geo: bake(splitObj()), mat: vcM, items: [] };
  kinds.tawara = { geo: bake(tawaraObj()), mat: vcM, items: [] };
  kinds.biku = { geo: bake(bikuObj()), mat: vcM, items: [] };
  kinds.sao = { geo: bake(saoObj()), mat: vcM, items: [] };
  kinds.uki = { geo: bake(ukiObj()), mat: vcM, items: [] };
  function placeGorge() {
    const g = MAPS.gorge?.gorgePhys; if (!g) return;
    placing = 'gorge';
    const alongZ = new CANNON.Quaternion(); alongZ.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), Math.PI / 2);   // 円柱を寝かせて z に沿わせる
    const float = it => { it.floats = it.settle = true; return it; };   // settle：最初にそのマップを出したとき、物理で落ち着かせてから置き場所にする
    [1, -1].forEach(s => {
      for (const [x, z, y] of g.logs) float(addBody('log', new CANNON.Cylinder(0.3, 0.3, 3, 8), 6, x * s, y + 0.32, z * s, alongZ, 0.7));
      { const [x, z, y] = g.chop;
        float(addBody('stump', new CANNON.Cylinder(0.39, 0.39, 0.6, 9), 30, x * s, y + 0.3, z * s, null, 0.6));
        float(addDynamic('split', [0.065, 0.065, 0.25], 0.8, x * s, y + 0.67, z * s, 0.4, 1.2));   // 切り株の上に1本
        for (let row = 0; row < 2; row++) for (let i = 0; i < 4; i++)   // 割った薪を井桁に2段
          float(addDynamic('split', [0.065, 0.065, 0.25], 0.8, (x - 1.3 + (row ? 0 : (i - 1.5) * 0.16)) * s, y + 0.07 + row * 0.135, (z + (row ? (i - 1.5) * 0.16 : 0)) * s, row ? Math.PI / 2 : 0, 1.2));   // 下の段は z 向きを x に並べ、上の段は x 向きを z に並べる
      }
      { const [x, z, y] = g.tawara;
        for (const dx of [-0.34, 0.34]) float(addBody('tawara', new CANNON.Cylinder(0.3, 0.3, 0.8, 9), 22, (x + dx) * s, y + 0.3, z * s, alongZ, 0.6));
        float(addBody('tawara', new CANNON.Cylinder(0.3, 0.3, 0.8, 9), 22, x * s, y + 0.86, z * s, alongZ, 0.6));
      }
      for (const [x, z, y] of g.oke) float(addBody('oke', new CANNON.Cylinder(0.26, 0.26, 0.36, 10), 0.6, x * s, y + 0.18, z * s, null, 1.4));
      { const [x, z, y] = g.crate;
        for (const dz of [-0.62, 0.62]) float(addDynamic('crate', [cs / 2, cs / 2, cs / 2], 10, x * s, y + cs / 2, (z + dz) * s, 0, 0.65));
        float(addDynamic('crate', [cs / 2, cs / 2, cs / 2], 10, x * s, y + cs * 1.5, z * s, 0.3, 0.65));
      }
      for (const [x, z, y] of g.biku) float(addBody('biku', new CANNON.Cylinder(0.17, 0.17, 0.36, 8), 0.5, x * s, y + 0.18, z * s, null, 1.3));
      for (const [x, z, y] of g.sao) float(addDynamic('sao', [0.03, 0.03, 1.5], 0.4, x * s, y + 0.03, z * s, 0.05, 1.6));
      for (const [x, z, y] of g.uki) float(addBody('uki', new CANNON.Cylinder(0.05, 0.05, 0.16, 7), 0.05, x * s, y + 0.08, z * s, null, 1.8));
    });
  }

  // ----- 忍びの屋敷：座布団の山（押すと崩れる）と茶器（撃つと飛ぶ） -----
  const zabutonObj = () => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.08, 0.55), mat(P.fuji[0])));
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.085, 0.05), mat(P.kin[1])); g.add(t);   // 真ん中の房
    return g;
  };
  const yunomiObj = () => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.036, 0.08, 9), mat(P.seiji[1])));
    const tea = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.005, 9), mat(P.moegi[0])); tea.position.y = 0.035; g.add(tea);
    return g;
  };
  const kyusuObj = () => {
    const g = new THREE.Group();
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.085, 1), mat(P.daidai[0])); b.scale.y = 0.75; g.add(b);
    const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.02, 0.08, 6), mat(P.daidai[0])); sp.position.set(0.09, 0.01, 0); sp.rotation.z = -1; g.add(sp);
    const h = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.1, 6), mat(P.daidai[0])); h.position.set(0, 0, -0.1); h.rotation.x = 1.4; g.add(h);   // 横の取っ手
    const k = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.025, 6), mat(P.daidai[0])); k.position.y = 0.07; g.add(k);
    return g;
  };
  kinds.zabuton = { geo: bake(zabutonObj()), mat: vcM, items: [] };
  kinds.yunomi = { geo: bake(yunomiObj()), mat: vcM, items: [] };
  kinds.kyusu = { geo: bake(kyusuObj()), mat: vcM, items: [] };
  function placeYashiki() {
    const d = MAPS.yashiki?.yashikiPhys; if (!d) return;
    placing = 'yashiki';
    [1, -1].forEach(s => {
      // 座布団の山：6枚を少しずつずらして積む
      for (const [x, z, y] of d.zabuton) for (let i = 0; i < 6; i++)
        addDynamic('zabuton', [0.275, 0.04, 0.275], 0.5, x * s + (i % 2 ? 0.02 : -0.02), y + 0.04 + i * 0.081, z * s, ((i * 0.37) % 0.3) - 0.15, 0.8).settle = true;
      // 茶器：急須1つと湯呑み2つ（座卓の向きに合わせる）
      for (const [x, z, y, rot] of d.tea) {
        const at = (a, b) => (rot ? [x + b, z + a] : [x + a, z + b]);
        { const [px, pz] = at(0.25, 0.05); addBody('kyusu', new CANNON.Cylinder(0.08, 0.08, 0.12, 8), 0.5, px * s, y + 0.065, pz * s, null, 1.2).settle = true; }
        for (const [a, b] of [[-0.2, -0.15], [-0.28, 0.17]]) { const [px, pz] = at(a, b); addBody('yunomi', new CANNON.Cylinder(0.042, 0.036, 0.08, 8), 0.15, px * s, y + 0.042, pz * s, null, 1.6).settle = true; }
      }
    });
  }

  placeTemple();
  placeOnsen();
  placeDesert();
  placeGorge();
  placeYashiki();

  // スキル「木箱」で置く木箱（両者 6 個ずつ、足りなければ古いものから使い回す）
  const pool = [];
  for (let i = 0; i < 12; i++) {
    const it = addDynamic('crate', [cs / 2, cs / 2, cs / 2], 10, 0, -100, 0, 0, 0.65);
    it.pool = true; it.map = null; world.removeBody(it.body);
    pool.push(it);
  }
  let poolI = 0;
  // 体を止める小物：重い物（卓球台・石灯籠・荷車・米俵・賽銭箱など）と木箱（マップの木箱もスキルの木箱も）。上にも乗れる
  // これらは体では押せない（体の見えない体とはぶつからない）。軽い物は今まで通り押しのけて進む
  const HEAVY = 20;
  for (const it of items) if (it.body.mass >= HEAVY || it.kind === 'crate') { it.heavy = true; it.body.collisionFilterMask = 1 | 2; it.col = { kind: 'box', min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 }, walk: true, surf: 'wood' }; }
  const solid = [];   // 今のマップで体を止める小物の箱（毎フレーム作り直す）
  function updateSolid() {
    solid.length = 0;
    for (const it of items) {
      if (!it.heavy || it.off || it.body.position.y < -50 || (it.pool && !it.spawned)) continue;
      const b = it.body; b.updateAABB();
      const c = it.col; c.min.x = b.aabb.lowerBound.x; c.min.y = b.aabb.lowerBound.y; c.min.z = b.aabb.lowerBound.z;
      c.max.x = b.aabb.upperBound.x; c.max.y = b.aabb.upperBound.y; c.max.z = b.aabb.upperBound.z;
      solid.push(c);
    }
  }
  const insts = [];
  for (const k of Object.values(kinds)) {
    if (!k.items.length) continue;
    const im = new THREE.InstancedMesh(k.geo, k.mat, k.items.length);
    im.castShadow = im.receiveShadow = true;
    im.frustumCulled = false;   // 1つ1つの位置がばらばらなので、まとめての見えない判定はしない
    im.userData.physList = k.items;
    k.items.forEach((it, i) => { it.inst = im; it.idx = i; });
    scene.add(im); physMeshes.push(im); insts.push(im);
  }
  // プレイヤーとCPUは「押す側」の見えない体（キネマティック）として参加
  const kin: any = {};
  function kinFor(key, e) {
    if (kin[key] && (kin[key].r !== e.radius || kin[key].h !== e.height)) { world.removeBody(kin[key]); kin[key] = null; }
    if (!kin[key]) {
      const b: any = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC });
      b.allowSleep = false;
      [e.radius, e.height / 2, e.height - e.radius].forEach(y => b.addShape(new CANNON.Sphere(e.radius), new CANNON.Vec3(0, y, 0)));
      b.collisionFilterGroup = 4; b.collisionFilterMask = 2;   // 4: 体 / 2: 動く小物 / 1: 動かない物
      b.r = e.radius; b.h = e.height;
      world.addBody(b); kin[key] = b;
    }
    return kin[key];
  }
  const M4 = new THREE.Matrix4(), ONE = new THREE.Vector3(1, 1, 1), HIDE = new THREE.Matrix4().makeScale(0, 0, 0);
  function sync() {
    for (const it of items) {
      if (it.off || it.broken) { it.inst.setMatrixAt(it.idx, HIDE); continue; }
      it.obj.position.copy(it.body.position); it.obj.quaternion.copy(it.body.quaternion); it.obj.updateMatrixWorld();
      it.inst.setMatrixAt(it.idx, M4.compose(it.obj.position, it.obj.quaternion, ONE));
    }
    for (const im of insts) { im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); }
  }
  sync();
  // マップを切り替える：動かない障害物を作り直し、そのマップの小物だけを世界に入れる
  const settled = new Set<string>();
  function setMap(id) {
    buildStatics();
    for (const it of items) {
      if (it.pool) continue;
      const off = it.map !== id;
      if (off === it.off) continue;
      it.off = off;
      if (off) world.removeBody(it.body); else if (!it.broken) world.addBody(it.body);
    }
    // 地形がでこぼこのマップの小物：初めて出したときに 4 秒ぶん物理で落ち着かせ、その姿を置き場所（home）にする
    const mine = items.filter(it => it.settle && it.map === id);
    if (mine.length && !settled.has(id)) {
      settled.add(id);
      for (const it of mine) { it.body.position.copy(it.home.p); it.body.quaternion.copy(it.home.q); it.body.velocity.set(0, 0, 0); it.body.angularVelocity.set(0, 0, 0); it.body.wakeUp(); }
      for (let i = 0; i < 240; i++) world.step(1 / 60);
      for (const it of mine) { it.home.p.copy(it.body.position); it.home.q.copy(it.body.quaternion); }
    }
  }
  return {
    onBreak: null as any,   // (場所, 種類) 壺が割れた
    setMap,
    awake: () => items.reduce((n, it) => n + (it.body.sleepState !== CANNON.Body.SLEEPING ? 1 : 0), 0),   // 起きている（動いている）小物の数
    step(dt, ents) {
      for (const [k, e] of ents) {
        const b = kinFor(k, e);
        b.collisionResponse = !e.dead;
        b.position.set(e.pos.x, e.pos.y, e.pos.z);
        b.velocity.set(e.vel.x, e.vy, e.vel.z);
        // 眠っている小物はキネマティックに触れても起きないので、近くのものは手動で起こす
        if (e.dead) continue;
        for (const it of items) {
          const ib = it.body;
          if (it.off || it.broken || ib.sleepState !== CANNON.Body.SLEEPING) continue;
          const dx = ib.position.x - e.pos.x, dz = ib.position.z - e.pos.z;
          const r = ib.boundingRadius + e.radius + 0.3;
          if (dx * dx + dz * dz < r * r && ib.position.y < e.pos.y + e.height + 1) ib.wakeUp();
        }
      }
      // ドミノの補正：少しでも傾いたら倒れる向きに少し後押し（箱の角同士の接触で止まりがちなので）
      const up = new CANNON.Vec3(), ax = new CANNON.Vec3(), Y = new CANNON.Vec3(0, 1, 0);
      for (const it of items) {
        if (it.off || !it.domino || it.body.sleepState === CANNON.Body.SLEEPING) continue;
        it.body.quaternion.vmult(Y, up);
        const tilt = Math.acos(clamp(up.y, -1, 1));
        if (tilt < 0.05 || tilt > 1.45) continue;
        Y.cross(up, ax); ax.normalize();
        it.body.angularVelocity.x += ax.x * 16 * dt; it.body.angularVelocity.z += ax.z * 16 * dt;
      }
      // 川に浮いて流される（流れのあるマップだけ）：水に沈んだ深さに応じて押し上げ、流れの速さに近づける
      if (FLOW && dt > 0) for (const it of items) {
        if (it.off || it.broken || !it.floats) continue;
        const b = it.body, depth = WATER_Y + 0.1 - b.position.y;
        if (depth <= 0) continue;
        b.wakeUp();
        b.force.y += b.mass * G * 1.5 * clamp(depth / 0.3, 0, 1);
        const fl = FLOW(b.position.x, b.position.z), k = Math.min(1, 1.5 * dt);
        b.velocity.x += (fl[0] - b.velocity.x) * k; b.velocity.z += (fl[1] - b.velocity.z) * k;
        b.velocity.y *= 1 - Math.min(1, 2 * dt); b.angularVelocity.scale(1 - Math.min(1, 1.5 * dt), b.angularVelocity);
      }
      if (dt > 0) world.step(1 / 60, dt, 4);
      while (breakQueue.length) breakIt(breakQueue.pop());
      // 体で押しただけの小物は吹き飛ばない：重いほど遅く、上へは跳ねない（撃った・爆風を受けた直後は別）
      for (const it of items) {
        if (it.off || !(world.time - (it.pushedAt ?? -9) < 0.1) || world.time - (it.forceAt ?? -9) < 0.6) continue;
          const v = it.body.velocity, cap = 5 / (1 + it.body.mass / 10), h = Math.hypot(v.x, v.z);
        if (h > cap) { v.x *= cap / h; v.z *= cap / h; }
        if (v.y > 1.2) v.y = 1.2;
        const w = it.body.angularVelocity, wl = w.length();
        if (wl > 4) w.scale(4 / wl, w);
      }
      sync();
      updateSolid();
    },
    solid,
    // 弾が当たった所を押す
    hit(it, point, dir, power) {
      if (it.breakable) { breakIt(it); return; }
      const b = it.body; b.wakeUp(); it.forceAt = world.time;
      // cannon-es の applyImpulse は「重心からの相対位置」で指定する
      b.applyImpulse(new CANNON.Vec3(dir.x * power, dir.y * power + power * 0.2, dir.z * power), new CANNON.Vec3(point.x - b.position.x, point.y - b.position.y, point.z - b.position.z));
    },
    // 周りを吹き飛ばす
    blast(pos, radius, power) {
      for (const it of items) {
        if (it.off || it.broken) continue;
        const b = it.body, dx = b.position.x - pos.x, dy = b.position.y - pos.y, dz = b.position.z - pos.z, d = Math.hypot(dx, dy, dz);
        if (d > radius || d < 1e-3) continue;
        if (it.breakable) { breakQueue.push(it); continue; }
        const k = power * b.mass * (1 - d / radius) / d;
        it.forceAt = world.time;
        b.wakeUp(); b.applyImpulse(new CANNON.Vec3(dx * k, Math.abs(dy * k) + power * b.mass * 0.4, dz * k), new CANNON.Vec3());
      }
    },
    // キルカム用：全小物の位置と向きを保存・復元
    snapshot() {
      const a = new Float32Array(items.length * 7);
      items.forEach((it, i) => { const b = it.body, q = b.quaternion; a.set([b.position.x, b.position.y, b.position.z, q.x, q.y, q.z, q.w], i * 7); });
      return a;
    },
    restore(a) {
      items.forEach((it, i) => {
        const b = it.body, o = i * 7;
        b.position.set(a[o], a[o + 1], a[o + 2]); b.quaternion.set(a[o + 3], a[o + 4], a[o + 5], a[o + 6]);
        b.velocity.set(0, 0, 0); b.angularVelocity.set(0, 0, 0);
      });
      sync();
    },
    // 木箱を置く（pos: 置く所の下端の中心、ry: 向き）
    spawnBox(x, y, z, ry) {
      const it = pool[poolI = (poolI + 1) % pool.length], b = it.body;
      if (!world.bodies.includes(b)) world.addBody(b);
      it.spawned = true;
      b.position.set(x, y + cs / 2 + 0.05, z); b.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), ry);
      b.velocity.set(0, 0, 0); b.angularVelocity.set(0, 0, 0); b.wakeUp();
      sync();
    },
    reset() {
      for (const it of pool) { if (world.bodies.includes(it.body)) world.removeBody(it.body); it.spawned = false; }
      breakQueue.length = 0;
      for (const it of items) {
        if (it.broken) { it.broken = false; if (!it.off) world.addBody(it.body); }
        if (it.off) continue;
        const b = it.body;
        b.position.copy(it.home.p); b.quaternion.copy(it.home.q);
        b.velocity.set(0, 0, 0); b.angularVelocity.set(0, 0, 0);
        b.force.set(0, 0, 0); b.torque.set(0, 0, 0);
        b.sleep();
      }
      sync(); updateSolid();
    },
  };
})();
blockers = propMeshes.concat(physMeshes);
PHYS.setMap(mapId); PHYS.reset();
onMapChange.push(id => { PHYS.setMap(id); PHYS.reset(); blockers = propMeshes.concat(physMeshes); });
