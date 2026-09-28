// 物理演算で動く小物（cannon.js）
import { P, css } from './palette';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { gs } from './state';
import { BH, G, GROUND, clamp, rand } from './core';
import { SFX } from './audio';
import { PIECE_DEPTH, canvasTex, mat, pieceGeo, pieceWoodMat, scene, toon, woodGrain } from './render';
import { LV, colliders, insideCollider, propMeshes } from './world';

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

export const PHYS = (() => {
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
  // 動かない障害物
  for (const c of colliders) {
    if (c.kind === 'box') {
      addStatic(new CANNON.Box(new CANNON.Vec3((c.max.x - c.min.x) / 2, (c.max.y - c.min.y) / 2, (c.max.z - c.min.z) / 2)),
        (c.max.x + c.min.x) / 2, (c.max.y + c.min.y) / 2, (c.max.z + c.min.z) / 2);
    } else addStatic(new CANNON.Cylinder(c.r, c.r, c.y1 - c.y0, 10), c.x, (c.y0 + c.y1) / 2, c.z);   // cannon-es の円柱は縦向き
  }

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
    const it: any = { body, obj, pitch, domino, lastSnd: 0, home: { p: new CANNON.Vec3().copy(body.position), q: new CANNON.Quaternion().copy(body.quaternion) } };
    kinds[kind].items.push(it);
    body.addEventListener('collide', e => {
      const v = Math.abs(e.contact.getImpactVelocityAlongNormal()), now = performance.now();
      if (v > 1.8 && now - it.lastSnd > 90 && gs.sndBudget > 0) { it.lastSnd = now; gs.sndBudget--; SFX.play('knock', body.position, clamp(v / 9, 0.15, 1), pitch); }
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

  // 配置（点対称）。高さは world.ts の LV
  const { V, T2, HB, HT, PL } = LV, cs = 1.2;
  const lying = new CANNON.Quaternion(); lying.setFromAxisAngle(new CANNON.Vec3(0, 0, 1), Math.PI / 2);   // 丸太は横に寝かせる
  [1, -1].forEach(s => {
    // 木箱：関所の横のピラミッドと、あちこちの遮蔽
    [[-0.62, 0], [0.62, 0], [0, 1]].forEach(([dx, row]) => addDynamic('crate', [cs / 2, cs / 2, cs / 2], 4, (-40 + dx) * s, V + cs / 2 + row * cs, 15 * s, 0, 0.65));
    for (const [x, z, y0] of [[-26, 6, V], [-24.7, 6.3, V], [-3, 18.4, V], [-1.7, 18.4, V], [-22, 46, HT], [-45, 24, T2], [30, 58, PL]])
      addDynamic('crate', [cs / 2, cs / 2, cs / 2], 4, x * s, y0 + cs / 2, z * s, rand(-0.2, 0.2), 0.65);
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

  // スキル「木箱」で置く木箱（両者 6 個ずつ、足りなければ古いものから使い回す）
  const pool = [];
  for (let i = 0; i < 12; i++) {
    const it = addDynamic('crate', [cs / 2, cs / 2, cs / 2], 4, 0, -100, 0, 0, 0.65);
    it.pool = true; world.removeBody(it.body);
    pool.push(it);
  }
  let poolI = 0;
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
  const M4 = new THREE.Matrix4(), ONE = new THREE.Vector3(1, 1, 1);
  function sync() {
    for (const it of items) {
      it.obj.position.copy(it.body.position); it.obj.quaternion.copy(it.body.quaternion); it.obj.updateMatrixWorld();
      it.inst.setMatrixAt(it.idx, M4.compose(it.obj.position, it.obj.quaternion, ONE));
    }
    for (const im of insts) { im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); }
  }
  sync();
  return {
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
          if (ib.sleepState !== CANNON.Body.SLEEPING) continue;
          const dx = ib.position.x - e.pos.x, dz = ib.position.z - e.pos.z;
          const r = ib.boundingRadius + e.radius + 0.3;
          if (dx * dx + dz * dz < r * r && ib.position.y < e.pos.y + e.height + 1) ib.wakeUp();
        }
      }
      // ドミノの補正：少しでも傾いたら倒れる向きに少し後押し（箱の角同士の接触で止まりがちなので）
      const up = new CANNON.Vec3(), ax = new CANNON.Vec3(), Y = new CANNON.Vec3(0, 1, 0);
      for (const it of items) {
        if (!it.domino || it.body.sleepState === CANNON.Body.SLEEPING) continue;
        it.body.quaternion.vmult(Y, up);
        const tilt = Math.acos(clamp(up.y, -1, 1));
        if (tilt < 0.05 || tilt > 1.45) continue;
        Y.cross(up, ax); ax.normalize();
        it.body.angularVelocity.x += ax.x * 16 * dt; it.body.angularVelocity.z += ax.z * 16 * dt;
      }
      if (dt > 0) world.step(1 / 60, dt, 4);
      sync();
    },
    // 弾が当たった所を押す
    hit(it, point, dir, power) {
      const b = it.body; b.wakeUp();
      // cannon-es の applyImpulse は「重心からの相対位置」で指定する
      b.applyImpulse(new CANNON.Vec3(dir.x * power, dir.y * power + power * 0.2, dir.z * power), new CANNON.Vec3(point.x - b.position.x, point.y - b.position.y, point.z - b.position.z));
    },
    // 周りを吹き飛ばす
    blast(pos, radius, power) {
      for (const it of items) {
        const b = it.body, dx = b.position.x - pos.x, dy = b.position.y - pos.y, dz = b.position.z - pos.z, d = Math.hypot(dx, dy, dz);
        if (d > radius || d < 1e-3) continue;
        const k = power * b.mass * (1 - d / radius) / d;
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
      b.position.set(x, y + cs / 2 + 0.05, z); b.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), ry);
      b.velocity.set(0, 0, 0); b.angularVelocity.set(0, 0, 0); b.wakeUp();
      sync();
    },
    reset() {
      for (const it of pool) if (world.bodies.includes(it.body)) world.removeBody(it.body);
      for (const it of items) {
        const b = it.body;
        b.position.copy(it.home.p); b.quaternion.copy(it.home.q);
        b.velocity.set(0, 0, 0); b.angularVelocity.set(0, 0, 0);
        b.force.set(0, 0, 0); b.torque.set(0, 0, 0);
        b.sleep();
      }
      sync();
    },
  };
})();
blockers = propMeshes.concat(physMeshes);
