// エフェクト・一人称の銃・駒のキャラクター
'use strict';

// ================= エフェクト =================
// 破片・火花（インスタンス描画）
const Particles = (() => {
  const N = 320, box = new THREE.BoxGeometry(1, 1, 1), dummy = new THREE.Object3D(), col = new THREE.Color();
  const make = m => { const im = new THREE.InstancedMesh(box, m, N); im.frustumCulled = false; for (let i = 0; i < N; i++) { dummy.scale.setScalar(0); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); im.setColorAt(i, col.set(1, 1, 1)); } scene.add(im); return im; };
  const lit = make(new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }));
  const glow = make(new THREE.MeshBasicMaterial({ fog: false }));
  const sets = [{ im: lit, ps: [], i: 0 }, { im: glow, ps: [], i: 0 }];
  sets.forEach(s => { for (let i = 0; i < N; i++) s.ps.push({ life: 0 }); });
  function spawn(glowing, pos, vel, o) {
    const s = sets[glowing ? 1 : 0], idx = s.i = (s.i + 1) % N, p = s.ps[idx];
    Object.assign(p, { pos: pos.clone(), vel, rot: new V3(rand(0, 6), rand(0, 6), rand(0, 6)), spin: new V3(rand(-12, 12), rand(-12, 12), rand(-12, 12)), size: o.size, life: o.life, max: o.life, grav: o.grav ?? 18, bounce: o.bounce ?? 0.3, grow: o.grow ?? 0, drag: o.drag ?? 0 });
    s.im.setColorAt(idx, col.copy(o.color));
    s.im.instanceColor.needsUpdate = true;
  }
  function update(dt) {
    for (const s of sets) {
      for (let i = 0; i < N; i++) {
        const p = s.ps[i];
        if (p.life <= 0) { if (p.was) { dummy.scale.setScalar(0); dummy.updateMatrix(); s.im.setMatrixAt(i, dummy.matrix); p.was = false; } continue; }
        p.was = true; p.life -= dt;
        p.vel.y -= p.grav * dt; p.vel.multiplyScalar(1 - p.drag * dt);
        p.pos.addScaledVector(p.vel, dt);
        const gy = Math.abs(p.pos.x) < H + 1 && Math.abs(p.pos.z) < H + 1 ? 0 : -4.5;
        if (p.pos.y < gy + p.size / 2) { p.pos.y = gy + p.size / 2; p.vel.y *= -p.bounce; p.vel.x *= 0.6; p.vel.z *= 0.6; p.spin.multiplyScalar(0.5); }
        p.rot.addScaledVector(p.spin, dt);
        const k = p.life / p.max;
        dummy.position.copy(p.pos); dummy.rotation.set(p.rot.x, p.rot.y, p.rot.z);
        dummy.scale.setScalar(p.size * (p.grow ? lerp(1 + p.grow, 1, k) : Math.min(1, k * 4)));
        dummy.updateMatrix(); s.im.setMatrixAt(i, dummy.matrix);
      }
      s.im.instanceMatrix.needsUpdate = true;
    }
  }
  const WOOD = [C(0xe6b872), C(0xc9954f), C(0xf2d19a)];
  return {
    update,
    impact(point, normal) {
      for (let i = 0; i < 6; i++) spawn(true, point, normal.clone().multiplyScalar(rand(3, 8)).add(new V3(rand(-3, 3), rand(-1, 4), rand(-3, 3))), { size: 0.035, life: rand(0.12, 0.28), color: C(0xffd070).multiplyScalar(3), grav: 12, bounce: 0.4 });
      for (let i = 0; i < 5; i++) spawn(false, point, normal.clone().multiplyScalar(rand(1, 3)).add(new V3(rand(-1, 1), rand(0, 1.5), rand(-1, 1))), { size: rand(0.07, 0.14), life: rand(0.35, 0.7), color: C(0xcaa878), grav: 2, drag: 3, grow: 1.5 });
    },
    wood(point, dir, n = 10, power = 1) {
      for (let i = 0; i < n; i++) spawn(false, point, dir.clone().multiplyScalar(rand(2, 6) * power).add(new V3(rand(-3, 3), rand(1, 5), rand(-3, 3)).multiplyScalar(power)), { size: rand(0.05, 0.15), life: rand(0.9, 1.8), color: WOOD[i % 3], grav: 18, bounce: 0.35 });
    },
    // 追尾の矢の光の尾
    glow(point, color) { spawn(true, point, new V3(rand(-0.3, 0.3), rand(-0.3, 0.3), rand(-0.3, 0.3)), { size: rand(0.05, 0.09), life: rand(0.2, 0.35), color: C(color).multiplyScalar(2.5), grav: 0, bounce: 0 }); },
    // 爆発：火花・閃光・黒い煙
    explosion(p) {
      for (let i = 0; i < 26; i++) spawn(true, p, new V3(rand(-1, 1), rand(-0.2, 1), rand(-1, 1)).normalize().multiplyScalar(rand(6, 16)), { size: rand(0.05, 0.12), life: rand(0.2, 0.5), color: C(0xffa040).multiplyScalar(3), grav: 10, bounce: 0.3 });
      for (let i = 0; i < 8; i++) spawn(true, p, new V3(rand(-2, 2), rand(0, 2), rand(-2, 2)), { size: rand(0.5, 0.9), life: rand(0.08, 0.16), color: C(0xffe0a0).multiplyScalar(3), grav: 0, bounce: 0, grow: 1.5 });
      for (let i = 0; i < 16; i++) spawn(false, p.clone().add(new V3(rand(-0.5, 0.5), rand(0, 0.5), rand(-0.5, 0.5))), new V3(rand(-3, 3), rand(0.5, 4), rand(-3, 3)), { size: rand(0.35, 0.7), life: rand(0.8, 1.4), color: C(0x5a524a), grav: -0.5, drag: 2.5, grow: 2 });
    },
    dust(point, n = 6, power = 1) {
      for (let i = 0; i < n; i++) spawn(false, point.clone().add(new V3(rand(-0.3, 0.3), 0.05, rand(-0.3, 0.3))), new V3(rand(-2, 2), rand(0.3, 1.5), rand(-2, 2)).multiplyScalar(power), { size: rand(0.12, 0.22), life: rand(0.35, 0.6), color: C(0xd8bf8e), grav: 0.5, drag: 4, grow: 1.8 });
    },
  };
})();

// 弾痕
const Decals = (() => {
  const N = 80, list = [];
  const m = new THREE.MeshBasicMaterial({ color: 0x1a120a, transparent: true, opacity: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
  const geo = new THREE.CircleGeometry(0.07, 6);
  for (let i = 0; i < N; i++) { const d = new THREE.Mesh(geo, m); d.visible = false; scene.add(d); list.push(d); }
  let i = 0;
  return {
    add(point, normal) {
      const d = list[i = (i + 1) % N];
      d.visible = true; d.position.copy(point).addScaledVector(normal, 0.01);
      d.lookAt(point.clone().add(normal)); d.rotation.z = rand(0, 6); d.scale.setScalar(rand(0.8, 1.3));
    },
    clear() { list.forEach(d => d.visible = false); },
  };
})();

// 弾道の光跡
const Tracers = (() => {
  const N = 40, list = [];
  const geo = new THREE.BoxGeometry(0.022, 0.022, 1); geo.translate(0, 0, 0.5);
  for (let i = 0; i < N; i++) {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    m.visible = false; scene.add(m); list.push({ m, t: 0 });
  }
  let i = 0;
  return {
    add(a, b, color) {
      const tr = list[i = (i + 1) % N];
      tr.a = a.clone(); tr.b = b.clone(); tr.len = a.distanceTo(b); tr.t = 0; tr.m.visible = true;
      tr.m.material.color.setHex(color);
      tr.m.position.copy(a); tr.m.lookAt(b);
    },
    update(dt) {
      for (const tr of list) {
        if (!tr.m.visible) continue;
        tr.t += dt * 280;
        const head = Math.min(tr.t, tr.len), tail = Math.max(0, tr.t - 7);
        if (tail >= tr.len) { tr.m.visible = false; continue; }
        const dir = tr.b.clone().sub(tr.a).normalize();
        tr.m.position.copy(tr.a).addScaledVector(dir, tail);
        tr.m.scale.z = Math.max(0.01, head - tail);
      }
    },
  };
})();

// ダメージ数字
const DmgNums = (() => {
  const N = 12, list = [];
  for (let k = 0; k < N; k++) {
    const c = document.createElement('canvas'); c.width = 128; c.height = 64;
    const tex = new THREE.CanvasTexture(c); tex.encoding = THREE.sRGBEncoding;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, fog: false }));
    s.renderOrder = 10; s.visible = false; scene.add(s);
    list.push({ s, c, tex, t: 0 });
  }
  let i = 0;
  return {
    add(pos, n, head) {
      const d = list[i = (i + 1) % N], g = d.c.getContext('2d');
      g.clearRect(0, 0, 128, 64);
      g.font = 'italic 900 46px "Yu Gothic",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 7; g.strokeStyle = 'rgba(0,0,0,.8)'; g.strokeText(Math.round(n), 64, 34);
      g.fillStyle = head ? '#ffd23a' : '#ffffff'; g.fillText(Math.round(n), 64, 34);
      d.tex.needsUpdate = true;
      d.s.position.copy(pos).add(new V3(rand(-0.3, 0.3), 0.2, rand(-0.3, 0.3)));
      d.vel = new V3(rand(-0.6, 0.6), 2.2, rand(-0.6, 0.6));
      d.t = 0.8; d.s.visible = true;
    },
    update(dt) {
      for (const d of list) {
        if (!d.s.visible) continue;
        d.t -= dt; if (d.t <= 0) { d.s.visible = false; continue; }
        d.s.position.addScaledVector(d.vel, dt); d.vel.y -= 3 * dt;
        const dist = d.s.position.distanceTo(cam.position), sc = 0.35 + dist * 0.035;
        const pop = d.t > 0.65 ? 1 + (d.t - 0.65) * 4 : 1;
        d.s.scale.set(sc * pop, sc * 0.5 * pop, 1);
        d.s.material.opacity = Math.min(1, d.t * 3);
      }
    },
  };
})();

// ================= 一人称の銃（別シーンで描画して壁にめり込まない） =================
const vmScene = new THREE.Scene();
const vmCam = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.01, 10);
vmScene.add(new THREE.HemisphereLight(C(0xdcecff), C(0x806040), 0.8));
const vmSun = new THREE.DirectionalLight(C(0xfff0d6), 1.6); vmSun.position.set(0.6, 1, 0.5); vmScene.add(vmSun);
const vmFlashLight = new THREE.PointLight(C(0xffc870), 0, 2); vmScene.add(vmFlashLight);
const VM = (() => {
  const root = new THREE.Group();
  const models = {};
  for (const k of Object.keys(GUN_BUILDERS)) models[k] = buildGun(k);
  for (const [k, m] of Object.entries(models)) { m.g.scale.setScalar(k === 'bow' ? 0.34 : 0.85); m.g.visible = false; root.add(m.g); }
  vmScene.add(root);
  const pist = models.pistol;
  const flash = new THREE.Group();
  const fm = new THREE.MeshBasicMaterial({ map: starTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const f1 = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), fm);
  const f2 = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.34), fm); f2.rotation.x = Math.PI / 2;
  const f3 = f2.clone(); f3.rotation.set(Math.PI / 2, 0, Math.PI / 2);
  flash.add(f1, f2, f3); flash.visible = false;
  const shield = makeShield(0.56, 0.44); shield.visible = false; vmScene.add(shield);
  const vm = {
    root, models, pist, flash, shield, shieldT: 0, kick: 0, slideT: 0, flashT: 0, sway: new V3(), bob: 0, equip: 1, dip: 0,
    // 持っている銃の見た目を切り替える
    setWeapon(model) {
      for (const [k, m] of Object.entries(models)) m.g.visible = k === model;
      vm.pist = models[model]; vm.pist.muzzle.add(flash);
    },
  };
  vm.setWeapon('pistol');
  return vm;
})();
// 構えの位置（低めに構え、照準で狙う）。覗き込みも画面の下へ下げてズームするだけ
const HIP = new V3(0.2, -0.24, -0.48);

// ================= 駒のキャラクター =================
function buildActor(ch, size, model = 'pistol') {
  const root = new THREE.Group(), body = new THREE.Group();
  const w = 1.2 * size, h = 1.85 * size, t = 0.42 * size;
  const wood = pieceWoodMat.clone();
  const piece = makePiece(ch, w, h, t, wood, true);
  const eyes = makeEyes(w, h, t / 2 + 0.008); piece.add(eyes);
  // 貫きの準備中に壁越しに見える姿
  const xray = new THREE.Mesh(pieceGeo, new THREE.MeshBasicMaterial({ color: 0xff3050, transparent: true, opacity: 0.5, depthTest: false, depthWrite: false }));
  xray.scale.copy(piece.userData.body.scale); xray.renderOrder = 20; xray.visible = false; piece.add(xray);
  piece.position.set(0, h / 2, t / 2);
  body.position.z = -t / 2;
  body.add(piece); root.add(body);
  const gun = buildGun(model);
  gun.g.scale.setScalar(({ shotgun: 1.6, smg: 1.9, bow: 1.5, revolver: 2.0, sniper: 1.3, ar: 1.6, launcher: 1.5 }[model] || 2.2) * size); gun.g.rotation.y = Math.PI;
  gun.g.position.set(w * 0.52, h * 0.5, t + 0.12);
  body.add(gun.g);
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTex, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  flash.scale.setScalar(0.7); flash.visible = false; gun.muzzle.add(flash);
  const shield = makeShield(w * 1.05, h * 0.7);
  shield.position.set(0, h * 0.45, t + 0.45); shield.visible = false;
  body.add(shield);
  scene.add(root);
  return { root, body, piece, hitMesh: piece.userData.body, wood, gun, flash, shield, shieldT: 0, eyes, xray, w, h, t };
}
