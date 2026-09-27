// 物理演算で動く小物（cannon.js）
'use strict';

// ================= 物理演算（cannon.js）：撃つ・押す・体当たりで動く小物 =================
const physMeshes = [];       // 弾と視線を遮る（CPUの経路探索には使わない＝押しのけて進める）
let blockers = propMeshes;   // 弾・視線を遮るもの全部
let sndBudget = 4;           // 1フレームに鳴らす衝突音の上限（小物が一斉に崩れても音割れしない）
// 文字入りの木目を表面に焼き込んだ駒（1メッシュで描けるので軽い）
const solidMatCache = {};
function pieceSolidMats(ch, red) {
  const key = ch + (red ? 'r' : '');
  if (solidMatCache[key]) return solidMatCache[key];
  const tex = canvasTex(256, 256, (g, w, h) => {
    woodGrain(g, w, h, '#e6b872', '120,70,25', 30);
    g.fillStyle = red ? '#a8161a' : '#1d1208'; g.font = '900 136px "Yu Mincho","Hiragino Mincho ProN","MS Mincho",serif';
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ch, 128, 150);
  });
  return solidMatCache[key] = [new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }), pieceWoodMat];
}
const crateTex = canvasTex(256, 256, (g, w) => {
  woodGrain(g, w, w, '#b98a52', '60,30,10', 40);
  g.strokeStyle = '#5a3818'; g.lineWidth = 26; g.strokeRect(13, 13, w - 26, w - 26);
  g.lineWidth = 22; g.beginPath(); g.moveTo(20, 20); g.lineTo(w - 20, w - 20); g.stroke();
});
const crateMat = new THREE.MeshStandardMaterial({ map: crateTex, roughness: 0.8 });

const PHYS = (() => {
  const world = new CANNON.World();
  world.gravity.set(0, -G, 0);
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.allowSleep = true;
  world.solver.iterations = 8;
  world.defaultContactMaterial.friction = 0.45;
  world.defaultContactMaterial.restitution = 0.2;
  const items = [];
  const addStatic = (shape, x, y, z, q) => {
    const b = new CANNON.Body({ mass: 0 }); b.addShape(shape); b.position.set(x, y, z);
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
    } else addStatic(new CANNON.Cylinder(c.r, c.r, c.y1 - c.y0, 10), c.x, (c.y0 + c.y1) / 2, c.z, gq);
  }

  // ドミノ同士は滑りやすく（もたれ合って止まらないように）
  const dominoMat = new CANNON.Material("domino");
  world.addContactMaterial(new CANNON.ContactMaterial(dominoMat, dominoMat, { friction: 0.02, restitution: 0.05 }));
  function addDynamic(obj, half, mass, x, y, z, ry = 0, pitch = 1, material) {
    // 眠る条件を厳しめに（ゆっくり傾き始めたドミノが途中で止まらないように）
    const body = new CANNON.Body({ mass, sleepSpeedLimit: 0.08, sleepTimeLimit: 1.2, linearDamping: 0.03, angularDamping: 0.05 });
    body.addShape(new CANNON.Box(new CANNON.Vec3(...half)));
    if (material) body.material = material;
    const domino = material === dominoMat;
    body.position.set(x, y, z);
    body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), ry);
    world.addBody(body);
    scene.add(obj);
    const it = { body, obj, pitch, domino, lastSnd: 0, home: { p: new CANNON.Vec3().copy(body.position), q: new CANNON.Quaternion().copy(body.quaternion) } };
    obj.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; o.userData.phys = it; } });
    physMeshes.push(obj);
    body.addEventListener('collide', e => {
      const v = Math.abs(e.contact.getImpactVelocityAlongNormal()), now = performance.now();
      if (v > 1.8 && now - it.lastSnd > 90 && sndBudget > 0) { it.lastSnd = now; sndBudget--; SFX.play('knock', body.position, clamp(v / 9, 0.15, 1), pitch); }
    });
    items.push(it);
    return it;
  }
  // 見た目（原点が中心）
  const pieceObj = (ch, w, h, t, lying) => {
    const g = new THREE.Group(), m = new THREE.Mesh(pieceGeo, pieceSolidMats(ch));
    m.scale.set(w, h, t / PIECE_DEPTH);
    if (lying) m.rotation.x = -Math.PI / 2;
    g.add(m); return g;
  };
  const crateObj = s => { const g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.BoxGeometry(s, s, s), crateMat)); return g; };

  // 配置（点対称）
  const TOWER = ['歩', '香', '桂', '銀', '金', '角', '飛'];
  [1, -1].forEach(s => {
    // 駒の塔：寝かせた駒を積み上げる
    TOWER.forEach((ch, i) => addDynamic(pieceObj(ch, 1.4, 1.7, 0.34, true), [0.7, 0.17, 0.85], 1, -16 * s, 0.17 + i * 0.34, -14 * s, rand(-0.12, 0.12)));
    // ドミノ：立てた駒を並べる（1枚倒すと連鎖する）
    for (let i = 0; i < 8; i++) addDynamic(pieceObj('歩', 0.9, 1.3, 0.26), [0.45, 0.65, 0.13], 0.8, (1.5 + i * 0.75) * s, 0.65, -18.5 * s, Math.PI / 2, 1.25, dominoMat);
    // 木箱のピラミッド
    const cs = 1.2;
    [[-0.62, 0], [0.62, 0], [0, 1]].forEach(([dx, row]) => addDynamic(crateObj(cs), [cs / 2, cs / 2, cs / 2], 4, (9 + dx) * s, cs / 2 + row * cs, -4 * s, 0, 0.65));
    // 散らばった小さい駒
    for (let i = 0; i < 5; i++) {
      let x, z;
      do { x = rand(-BH + 2, BH - 2); z = rand(-BH + 3, -1); } while (insideCollider(x, z, 1, 0) || Math.abs(x) < 3);
      addDynamic(pieceObj('歩', 0.7, 0.85, 0.2, true), [0.35, 0.1, 0.425], 0.4, x * s, 0.1, z * s, rand(0, 6), 1.7);
    }
  });

  // プレイヤーとCPUは「押す側」の見えない体（キネマティック）として参加
  const kin = {};
  function kinFor(key, e) {
    if (kin[key] && (kin[key].r !== e.radius || kin[key].h !== e.height)) { world.removeBody(kin[key]); kin[key] = null; }
    if (!kin[key]) {
      const b = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC });
      b.allowSleep = false;
      [e.radius, e.height / 2, e.height - e.radius].forEach(y => b.addShape(new CANNON.Sphere(e.radius), new CANNON.Vec3(0, y, 0)));
      b.r = e.radius; b.h = e.height;
      world.addBody(b); kin[key] = b;
    }
    return kin[key];
  }
  function sync() { for (const it of items) { it.obj.position.copy(it.body.position); it.obj.quaternion.copy(it.body.quaternion); } }
  return {
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
      b.applyImpulse(new CANNON.Vec3(dir.x * power, dir.y * power + power * 0.2, dir.z * power), new CANNON.Vec3(point.x, point.y, point.z));
    },
    // 周りを吹き飛ばす
    blast(pos, radius, power) {
      for (const it of items) {
        const b = it.body, dx = b.position.x - pos.x, dy = b.position.y - pos.y, dz = b.position.z - pos.z, d = Math.hypot(dx, dy, dz);
        if (d > radius || d < 1e-3) continue;
        const k = power * b.mass * (1 - d / radius) / d;
        b.wakeUp(); b.applyImpulse(new CANNON.Vec3(dx * k, Math.abs(dy * k) + power * b.mass * 0.4, dz * k), b.position);
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
    reset() {
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
