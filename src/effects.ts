// エフェクト・一人称の銃・駒のキャラクター
import { P, css, rgba } from './palette';
import * as THREE from 'three';
import { C, LIGHT, V3, clamp, lerp, rand } from './core';
import { GUN_BUILDERS, buildGun, cam, flatten, handMat, makeEyes, makePiece, makeShield, pieceGeo, pieceWoodMat, scene, starTex, toon } from './render';
import { floorBelow, groundAt } from './world';
import { SKINS } from './guns/skins';
import { equippedRef, paintGun } from './loadout';
import { buildFlareGun, buildMedkit } from './guns/items';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// ================= エフェクト =================
// 破片・火花（インスタンス描画）
export const Particles = (() => {
  const N = 320, box = new THREE.BoxGeometry(1, 1, 1), dummy = new THREE.Object3D(), col = new THREE.Color();
  const make = m => { const im = new THREE.InstancedMesh(box, m, N); im.frustumCulled = false; for (let i = 0; i < N; i++) { dummy.scale.setScalar(0); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); im.setColorAt(i, col.set(1, 1, 1)); } scene.add(im); return im; };
  const lit = make(toon({ roughness: 0.9, flatShading: true }));
  const glow = make(new THREE.MeshBasicMaterial({ fog: false }));
  const sets = [{ im: lit, ps: [], i: 0 }, { im: glow, ps: [], i: 0 }];
  sets.forEach(s => { for (let i = 0; i < N; i++) s.ps.push({ life: 0 }); });
  function spawn(glowing, pos, vel, o) {
    const s = sets[glowing ? 1 : 0], idx = s.i = (s.i + 1) % N, p = s.ps[idx];
    const g0 = groundAt(pos.x, pos.z), roof = g0 > pos.y + 0.3;   // 屋根の下で出た（地面の高さが上の屋根になっている）
    p.floor = roof ? floorBelow(pos.x, pos.z, pos.y) : null;
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
        const gy = p.floor ?? groundAt(p.pos.x, p.pos.z);
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
  const WOOD = [C(P.kiji[2]), C(P.kiji[1]), C(P.kin[2])];
  return {
    update,
    impact(point, normal) {
      for (let i = 0; i < 6; i++) spawn(true, point, normal.clone().multiplyScalar(rand(3, 8)).add(new V3(rand(-3, 3), rand(-1, 4), rand(-3, 3))), { size: 0.035, life: rand(0.12, 0.28), color: C(P.kin[2]).multiplyScalar(3), grav: 12, bounce: 0.4 });
      for (let i = 0; i < 5; i++) spawn(false, point, normal.clone().multiplyScalar(rand(1, 3)).add(new V3(rand(-1, 1), rand(0, 1.5), rand(-1, 1))), { size: rand(0.07, 0.14), life: rand(0.35, 0.7), color: C(P.kiji[2]), grav: 2, drag: 3, grow: 1.5 });
    },
    wood(point, dir, n = 10, power = 1) {
      for (let i = 0; i < n; i++) spawn(false, point, dir.clone().multiplyScalar(rand(2, 6) * power).add(new V3(rand(-3, 3), rand(1, 5), rand(-3, 3)).multiplyScalar(power)), { size: rand(0.05, 0.15), life: rand(0.9, 1.8), color: WOOD[i % 3], grav: 18, bounce: 0.35 });
    },
    // かけら（割れた壺など）：色を選べる
    shards(point, cols, n = 12, power = 1) {
      for (let i = 0; i < n; i++) spawn(false, point, new V3(rand(-3, 3), rand(1.5, 5), rand(-3, 3)).multiplyScalar(power), { size: rand(0.06, 0.16), life: rand(0.9, 1.6), color: C(cols[i % cols.length]), grav: 18, bounce: 0.3 });
    },
    // 矢の軌跡
    trail(point, color) { spawn(true, point, new V3(0, 0, 0), { size: 0.045, life: 0.5, color: C(color).multiplyScalar(1.6), grav: 0, bounce: 0 }); },
    // 追尾の矢の光の尾
    glow(point, color) { spawn(true, point, new V3(rand(-0.3, 0.3), rand(-0.3, 0.3), rand(-0.3, 0.3)), { size: rand(0.05, 0.09), life: rand(0.2, 0.35), color: C(color).multiplyScalar(2.5), grav: 0, bounce: 0 }); },
    // 爆発：火花・閃光・黒い煙
    explosion(p) {
      for (let i = 0; i < 26; i++) spawn(true, p, new V3(rand(-1, 1), rand(-0.2, 1), rand(-1, 1)).normalize().multiplyScalar(rand(6, 16)), { size: rand(0.05, 0.12), life: rand(0.2, 0.5), color: C(P.daidai[1]).multiplyScalar(3), grav: 10, bounce: 0.3 });
      for (let i = 0; i < 8; i++) spawn(true, p, new V3(rand(-2, 2), rand(0, 2), rand(-2, 2)), { size: rand(0.5, 0.9), life: rand(0.08, 0.16), color: C(P.shiro[2]).multiplyScalar(3), grav: 0, bounce: 0, grow: 1.5 });
      for (let i = 0; i < 16; i++) spawn(false, p.clone().add(new V3(rand(-0.5, 0.5), rand(0, 0.5), rand(-0.5, 0.5))), new V3(rand(-3, 3), rand(0.5, 4), rand(-3, 3)), { size: rand(0.35, 0.7), life: rand(0.8, 1.4), color: C(P.sumi[2]), grav: -0.5, drag: 2.5, grow: 2 });
    },
    dust(point, n = 6, power = 1) {
      for (let i = 0; i < n; i++) spawn(false, point.clone().add(new V3(rand(-0.3, 0.3), 0.05, rand(-0.3, 0.3))), new V3(rand(-2, 2), rand(0.3, 1.5), rand(-2, 2)).multiplyScalar(power), { size: rand(0.12, 0.22), life: rand(0.35, 0.6), color: C(P.kiji[2]), grav: 0.5, drag: 4, grow: 1.8 });
    },
  };
})();

// 弾痕
export const Decals = (() => {
  const N = 80, list = [];
  const m = new THREE.MeshBasicMaterial({ color: P.sumi[0], transparent: true, opacity: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
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
export const Tracers = (() => {
  const N = 40, list = [];
  const geo = new THREE.BoxGeometry(0.022, 0.022, 1); geo.translate(0, 0, 0.5);
  for (let i = 0; i < N; i++) {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: P.kin[2], transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
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
export const DmgNums = (() => {
  const N = 12, list = [];
  for (let k = 0; k < N; k++) {
    const c = document.createElement('canvas'); c.width = 128; c.height = 64;
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
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
      g.lineWidth = 7; g.strokeStyle = rgba(P.sumi[0], 0.85); g.strokeText(Math.round(n), 64, 34);
      g.fillStyle = head ? css(P.kin[2]) : css(P.shiro[2]); g.fillText(Math.round(n), 64, 34);
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
export const vmScene = new THREE.Scene();
export const vmCam = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.004, 10);   // 手前を近くまで描く（スコープを目の前で覗くため）
vmScene.add(new THREE.HemisphereLight(C(P.ao[2]), C(P.kiji[0]), 0.8 * LIGHT));
export const vmSun = new THREE.DirectionalLight(C(P.shiro[2]), 1.6 * LIGHT); vmSun.position.set(0.6, 1, 0.5); vmScene.add(vmSun);
export const vmFlashLight = new THREE.PointLight(C(P.kin[2]), 0, 2, 1); vmScene.add(vmFlashLight);
// 一人称の銃の構えの目安（fitViewModel で使う）
export const VM_FIT = { grip: [0.55, -0.78], muzzle: [0.15, -0.14], gripDepth: 0.2, reach: 0.45, adsBelow: 0.17, adsPull: 0.35 };   // adsBelow：覗き込みで銃口を照準のどれだけ下に置くか（画面の縦の半分に対する割合）・adsPull：スコープの無い銃を覗き込みでどれだけ真ん中へ寄せるか（0〜1）
export const VM: any = (() => {
  const root = new THREE.Group();
  const models: any = {};
  for (const k of Object.keys(GUN_BUILDERS)) models[k] = buildGun(k);
  for (const [k, m] of Object.entries(models) as [string, any][]) {
    m.g.visible = false; root.add(m.g);
    // スコープ：接眼レンズの穴。色は塗らずに奥行きだけ書き、筒や飾りがその奥に描かれないようにする → 穴から景色（先に描いた画面）が見える
    //   窓の形の点（lensPts）は、画面のどこを切り抜いて照準を出すかに使う。スライドに付いたサイトはスライドと一緒に動く
    if (m.scope) {
      const sc = m.scope, shape = sc.shape;
      const portal = new THREE.Mesh(shape ? new THREE.ShapeGeometry(shape) : new THREE.CircleGeometry(sc.rin, 28), new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide }));
      const to = sc.part ? m.parts[sc.part] : m.g;
      portal.position.copy(sc.eye); if (to !== m.g) portal.position.sub(to.userData.pivotAt);
      portal.renderOrder = -1; portal.visible = false;
      to.add(portal); m.portal = portal;
      m.lensPts = shape ? shape.getPoints(3).map(p => new V3(p.x, p.y, 0)) : Array.from({ length: 32 }, (_, i) => new V3(Math.cos(i / 32 * Math.PI * 2) * sc.rin, Math.sin(i / 32 * Math.PI * 2) * sc.rin, 0));
      if (sc.part) m.scopeRestZ = to.position.z;
    }
    if (k === 'bow') m.g.scale.setScalar(0.44); else fitViewModel(m);
  }
  // 画面の大きさが変わったら構えを合わせ直す。銃口の光（flash）は銃の長さに数えないよう、いったん外す
  addEventListener('resize', () => {
    const fp = flash.parent; if (fp) fp.remove(flash);
    for (const [k, m] of Object.entries(models) as [string, any][]) if (k !== 'bow') fitViewModel(m);
    if (vm.left) fitViewModel(vm.left);
    if (fp) fp.add(flash);
  });
  vmScene.add(root);
  const leftMirror = new THREE.Group(); leftMirror.scale.x = -1; vmScene.add(leftMirror);
  const leftRoot = new THREE.Group(); leftMirror.add(leftRoot);
  const left = buildGun('pistol'); fitViewModel(left); leftRoot.add(left.g); leftMirror.visible = false;
  const pist = models.pistol;
  const flash = new THREE.Group();
  const fm = new THREE.MeshBasicMaterial({ map: starTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const f1 = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), fm);
  const f2 = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.34), fm); f2.rotation.x = Math.PI / 2;
  const f3 = f2.clone(); f3.rotation.set(Math.PI / 2, 0, Math.PI / 2);
  flash.add(f1, f2, f3); flash.visible = false;
  const shield = makeShield(0.56, 0.44); shield.visible = false; vmScene.add(shield);
  // 左手の道具（スキル）：救急キット（成銀）・フレアガン（龍）。camera.ts の poseItems が動かす（形は guns/items.ts）
  const items: any = {};
  {
    const wrap = (g, s) => { const w = new THREE.Group(); g.scale.setScalar(s); w.add(g); return w; };
    items.medkit = wrap(buildMedkit().g, 0.75);
    const fg = buildFlareGun(); items.flare = wrap(fg.g, 0.75);
    const ff = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.24), fm); ff.name = 'flash'; ff.position.copy(fg.muzzle).add(new V3(0, 0, -0.02)); fg.g.add(ff);
    for (const g of Object.values(items) as any[]) { g.visible = false; vmScene.add(g); }
  }
  // 薬莢：排莢口から右へ飛ぶ（一人称の画面の中だけ）
  const caseGeo = new THREE.CylinderGeometry(0.0068, 0.0068, 0.033, 6).rotateX(Math.PI / 2);
  const caseMat = toon({ color: C(P.kin[1]) });
  const casings = Array.from({ length: 6 }, () => { const m = new THREE.Mesh(caseGeo, caseMat); m.visible = false; vmScene.add(m); return { m, v: new V3(), s: new V3(), t: 0 }; });
  let caseI = 0;
  const eject = () => {
    const c = casings[caseI = (caseI + 1) % casings.length], e = vm.pist.eject;
    if (!e) return;
    e.getWorldPosition(c.m.position); c.m.visible = true; c.t = 0;
    c.v.set(rand(1.1, 1.6), rand(1.3, 1.9), rand(0.1, 0.5)); c.s.set(rand(8, 16), rand(3, 8), rand(10, 20));
  };
  for (const m of Object.values(models) as any[]) if (m.anim) m.onEvent = ev => { if (ev === 'eject' && m === vm.pist) eject(); };
  // スキンの演出（LR）：銃口の光の色・弾の線の色・眺めたときに舞う光。自分の画面にだけ出す
  const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.3, 'rgba(255,255,255,0.6)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const motes = Array.from({ length: 60 }, () => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false })); sp.visible = false; root.add(sp); return { sp, t: 0, life: 0, rise: 0 }; });
  const tmp = new V3();
  // 銃の表面の点をランダムに1つ（root から見た位置）
  const pointOnGun = (g, out) => {
    const meshes = []; g.traverse(o => { if (o.isMesh && o.visible && o.geometry.attributes.position) meshes.push(o); });
    const m = meshes[Math.floor(Math.random() * meshes.length)], pa = m.geometry.attributes.position;
    out.fromBufferAttribute(pa, Math.floor(Math.random() * pa.count)).applyMatrix4(m.matrixWorld);
    return root.worldToLocal(out);
  };
  const vm = {
    root, models, pist, flash, fx: {} as any, left, leftRoot, leftMirror, flashLeft: false, kickL: 0, items, itemK: 0, itemKind: '', flareT: 0, flareKick: 0, shield, shieldT: 0, kick: 0, slideT: 0, flashT: 0, sway: new V3(), bob: 0, equip: 1, dip: 0,
    // 持っている銃の見た目を切り替える
    setWeapon(model) {
      for (const [k, m] of Object.entries(models) as [string, any][]) m.g.visible = k === model;
      vm.pist = models[model]; vm.pist.muzzle.add(flash); vm.flashLeft = false;
      if (vm.pist.anim) vm.pist.anim.clear();
      vm.fx = SKINS[vm.pist.skin]?.fx || {};
      fm.color.setHex(vm.fx.flash ?? 0xffffff);
      for (const m of motes) m.sp.visible = false, m.life = 0;
    },
    // 撃った（反動・光・部品の動き）。empty：最後の1発
    fire(w, empty = false) {
      if (vm.flashLeft) { vm.pist.muzzle.add(flash); vm.flashLeft = false; }
      vm.kick = kickOf(w); vm.slideT = 1;
      if (w.kind !== 'bow' && w.kind !== 'melee') vm.flashT = 0.05;
      if (vm.pist.fire) vm.pist.fire(empty);
    },
    reload(dur) { if (vm.pist.reload) vm.pist.reload(dur); if (vm.leftMirror.visible && left.reload) left.reload(dur); },
    // 2丁持ち：左の銃で撃つ（光は左の銃口へ付け替える）
    fireLeft(w) { vm.kickL = kickOf(w); left.muzzle.add(flash); vm.flashT = 0.05; vm.flashLeft = true; if (left.fire) left.fire(false); },
    inspect() {
      if (vm.pist.inspect) vm.pist.inspect();
      if (vm.fx.aura === undefined) return;
      root.updateMatrixWorld(true);
      for (const m of motes) {
        pointOnGun(vm.pist.g, m.sp.position); m.sp.material.color.setHex(vm.fx.aura); m.sp.scale.setScalar(rand(0.006, 0.014));
        m.t = -rand(0, 2); m.life = 0.9; m.rise = rand(0.03, 0.06); m.sp.visible = false;
      }
    },
    // 装備しているスキンで全部の銃を塗り直す
    applyLoadout() {
      for (const [k, m] of Object.entries(models) as [string, any][]) paintGun(m, equippedRef(k));
      paintGun(left, equippedRef('pistol'));
      vm.setWeapon(Object.keys(models).find(k => models[k] === vm.pist) || 'pistol');
    },
    ready() { vm.equip = 1; if (vm.pist.equip) vm.pist.equip(); },   // 構える（対局の始め）
    // 部品の動きと薬莢を進める
    animate(dt) {
      if (vm.pist.anim) vm.pist.anim.update(dt);
      if (vm.leftMirror.visible && left.anim) left.anim.update(dt);
      for (const c of casings) {
        if (!c.m.visible) continue;
        c.t += dt; c.v.y -= 9.8 * dt; c.m.position.addScaledVector(c.v, dt);
        c.m.rotation.x += c.s.x * dt; c.m.rotation.y += c.s.y * dt; c.m.rotation.z += c.s.z * dt;
        if (c.t > 0.7) c.m.visible = false;
      }
      for (const m of motes) {
        if (m.life <= 0) continue;
        m.t += dt; m.sp.visible = m.t >= 0;
        if (m.t < 0) continue;
        m.sp.position.y += m.rise * dt; m.sp.material.opacity = 1 - m.t / m.life;
        if (m.t >= m.life) { m.sp.visible = false; m.life = 0; }
      }
    },
    // 塗装を変える（ハンドガン）
    setSkin(id) { if (models.pistol.setSkin) models.pistol.setSkin(id); },
  };
  vm.applyLoadout();
  vm.setWeapon('pistol');
  flatten(root);
  return vm;
})();
// 一人称の銃の構え：画面の右下 1/4 をしっかり使い、照準のまわりには被らないように自動で合わせる
//   グリップ（銃の原点）を画面の右下へ、銃口を照準の少し右下で止まるように、向き・大きさ・位置を決める
//   短い銃（ハンドガン）は銃口の位置を手前にして、大きくなりすぎないようにする
export function fitViewModel(m) {
  if (!(innerWidth > 0 && innerHeight > 0)) { if (!m.ads) { m.hip = HIP.clone(); m.ads = HIP.clone(); } return; }   // 画面が 0 の大きさのとき（最小化など）は合わせない（大きさが壊れるため）。次の画面の大きさの変化で合わせ直す
  if (m.anim) m.anim.rebase();
  // 決まった持ち方の武器（ナイフなど）：向き・大きさ・位置をそのまま使う
  if (m.vmFixed) {
    const f = m.vmFixed;
    m.g.rotation.order = 'ZYX'; m.g.rotation.set(f.rot[0], f.rot[1], f.rot[2]); m.g.scale.setScalar(f.scale);
    // turn：最後に縦の軸で回す（刃先を前へ向ける量）
    if (f.turn) m.g.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new V3(0, 1, 0), f.turn));
    m.hip = f.hip; m.ads = f.ads;
    return;
  }
  const th = Math.tan(THREE.MathUtils.degToRad(58 / 2)), a = innerWidth / innerHeight;
  const at = (nx, ny, t) => new V3(nx * th * a * t, ny * th * t, -t);
  m.g.rotation.set(0, 0, 0); m.g.scale.setScalar(1); m.g.updateMatrixWorld(true);
  const d = m.muzzle.position.clone();
  const len = new THREE.Box3().setFromObject(m.g).getSize(new V3()).z;
  const f = clamp(len / 0.85, 0.4, 1), F = VM_FIT;
  const G = at(F.grip[0], F.grip[1], F.gripDepth);
  const T = at(lerp(F.grip[0], F.muzzle[0], f), lerp(F.grip[1], F.muzzle[1], f), F.gripDepth + F.reach * f);
  const w = T.clone().sub(G);
  m.g.rotation.order = 'YXZ';
  m.g.rotation.set(Math.atan2(w.y, Math.hypot(w.x, w.z)) - Math.atan2(d.y, -d.z), Math.atan2(-w.x, -w.z), 0);
  const size = m.vmSize || 1;
  m.g.scale.setScalar(w.length() / d.length() * size);
  m.hip = G;
  // 覗き込み：銃口がまっすぐ前を向くように傾けを戻し（adsRot）、照準の真下に構える
  m.g.updateMatrix();
  const dW = d.clone().applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(m.g.rotation)).multiplyScalar(m.g.scale.x);
  m.adsRot = [-Math.atan2(dW.y, Math.hypot(dW.x, dW.z)), -Math.atan2(-dW.x, -dW.z)];
  const gd = 0.2, L = dW.length();
  m.ads = new V3(0.015, -F.adsBelow * th * (gd + L) - 0.012 - (m.adsDrop || 0), -gd);
  // スコープの無い銃は、真ん中まで持ってこず、少しだけ寄せる（覗いている気持ち程度。照準で狙う）
  //   向きは寄せる量に関係なく、銃身（模型の -z）を視線と平行に＝画面の真ん中（消失点）へ向ける
  if (!m.scope) {
    const k = F.adsPull; m.ads = G.clone().lerp(m.ads, k);
    const ax = new V3(0, 0, -1).applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(m.g.rotation));
    m.adsRot = [-Math.atan2(ax.y, Math.hypot(ax.x, ax.z)), -Math.atan2(-ax.x, -ax.z)];
  }
  // スコープのある銃：筒をまっすぐ前へ向け、接眼レンズの真ん中を画面の中心に置く（目からの距離は camera.ts がスコープの大きさから決める）
  if (m.scope) {
    const R = new THREE.Matrix4().makeRotationFromEuler(m.g.rotation), s = m.g.scale.x;
    const ax = new V3(0, 0, -1).applyMatrix4(R);
    m.adsRot = [-Math.atan2(ax.y, Math.hypot(ax.x, ax.z)), -Math.atan2(-ax.x, -ax.z)];
    m.adsEye = m.scope.eye.clone().multiplyScalar(s).applyMatrix4(R).applyEuler(new THREE.Euler(m.adsRot[0], m.adsRot[1], 0));
    m.scopeR = m.scope.r * s;
  }
}
// 撃ったときの銃の跳ね上がり
export const kickOf = w => w.kind === 'melee' ? 0 : w.kind === 'bow' ? 0.6 : w.kind === 'grenade' ? 1.6 : clamp(w.recoil / 0.022, 1, 2.2);
// 構えの位置（低めに構え、照準で狙う）。覗き込みも画面の下へ下げてズームするだけ
export const HIP = new V3(0.2, -0.24, -0.48);

// ================= 駒のキャラクター =================
export function buildActor(ch, size, model = 'pistol', red = false): any {
  const root = new THREE.Group(), body = new THREE.Group();
  const w = 1.2 * size, h = 1.85 * size, t = 0.42 * size;
  const wood = pieceWoodMat.clone();
  const piece = makePiece(ch, w, h, t, wood, true, red);   // 成駒は赤い字
  const eyes = makeEyes(w, h, t / 2 + 0.008); piece.add(eyes);
  // 貫きの準備中に壁越しに見える姿
  const xray = new THREE.Mesh(pieceGeo, new THREE.MeshBasicMaterial({ color: P.shu[1], transparent: true, opacity: 0.5, depthTest: false, depthWrite: false }));
  xray.scale.copy(piece.userData.body.scale); xray.renderOrder = 20; xray.visible = false; piece.add(xray);
  // 透明化中の姿：うっすら揺らぐ影だけ
  const ghost = new THREE.Mesh(pieceGeo, new THREE.MeshBasicMaterial({ color: P.shiro[2], transparent: true, opacity: 0.1, depthWrite: false }));
  ghost.scale.copy(piece.userData.body.scale); ghost.visible = false;
  piece.position.set(0, h / 2, t / 2);
  body.position.z = -t / 2;
  body.add(piece); root.add(body);
  ghost.position.set(0, h / 2, t / 2); body.add(ghost);
  const gun = buildGun(model);
  gun.g.traverse(o => { o.castShadow = false; });   // 駒が持つ銃は影を落とさない（小さくてほとんど見えないため）
  // 相手から見て分かりやすいよう、銃と手は大きめ（1.4倍）。体の正面は +z なので、右手は -x 側
  gun.g.scale.setScalar(({ bow: 0.9, ak: 1.25, mk2: 1.15, m870: 1.15, mp5: 2.0, m79: 1.3, katana: 0.62, shuriken: 2.6, awm: 0.95, xbow: 1.05, famas: 1.3, mgl: 1.25, vector: 1.45, m4: 1.15 }[model] || 2.2) * 1.4 * size); gun.g.rotation.y = Math.PI;
  gun.g.position.set(-w * 0.55, h * 0.5, t + 0.16);
  if (model === 'shuriken') gun.parts.star.rotation.x = -1.3;   // 忍：手の上の手裏剣を立てて面を前へ向ける（寝かせたままだと正面から線にしか見えない）
  body.add(gun.g);
  // 2丁持ち（と）：左手のデザートイーグル。早撃ちの間だけ見える
  let gun2 = null;
  if (model === 'pistol') {
    gun2 = buildGun('pistol'); gun2.g.traverse(o => { o.castShadow = false; });
    gun2.g.scale.copy(gun.g.scale); gun2.g.rotation.y = Math.PI; gun2.g.position.set(w * 0.55, h * 0.5, t + 0.16);
    gun2.g.visible = false; body.add(gun2.g);
  }
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTex, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  flash.scale.setScalar(0.7); flash.visible = false; gun.muzzle.add(flash);
  // スキルの道具（ほかの人から見える）：救急キットは胸の前に、フレアガンは左手に。見やすいよう大きめ
  const items: any = { medkit: buildMedkit().g, flare: buildFlareGun().g };
  items.medkit.scale.setScalar(3.4 * size); items.medkit.position.set(0, h * 0.42, t + 0.3);
  items.flare.scale.setScalar(2.6 * size); items.flare.position.set(w * 0.55, h * 0.5, t + 0.2); items.flare.rotation.y = Math.PI;
  for (const g of Object.values(items) as any[]) { g.visible = false; body.add(g); }
  const shield = makeShield(w * 1.05, h * 0.7);
  shield.position.set(0, h * 0.45, t + 0.45); shield.visible = false;
  body.add(shield);
  flatten(root);
  scene.add(root);
  return { root, body, piece, hitMesh: piece.userData.body, wood, gun, gun2, flash, shield, shieldT: 0, eyes, xray, ghost, items, w, h, t };
}

// ================= 遠くの駒の銃：簡単な形 =================
// 15m より遠いと銃は小さく、つや・照り返しは見分けられないので、見えている部品を1つの形にまとめ、部品ごとの色だけで描く
//   （部品ごとに描くと 10〜20 回かかるのが 1 回で済む）。スキンごとに一度だけ作って使い回す。銃口の光はそのまま出る
const LOD_FAR = 15;
const lodMat = toon({ vertexColors: true });
function slotColor(id: string, slot: string, mat: any): number {
  const s = SKINS[id];
  if (mat === handMat) return P.kiji[1];
  if (s && slot) {
    if (slot === 'line') return s.line ?? s.detail.c;
    if (slot === 'slideDark') return s.slide.c;
    if (slot === 'bore') return P.sumi[0];
    const st = s[slot] || s.extra?.[slot] || (slot === 'mag' ? { c: P.sumi[2] } : null);
    if (st) return st.fade ? st.fade[0] : st.c;
  }
  if (mat?.color && !mat.map && !mat.isMeshMatcapMaterial) return mat.color.getHex();
  return P.sumi[1];
}
function buildLod(gun) {
  gun.g.updateMatrixWorld(true);
  const inv = gun.g.matrixWorld.clone().invert(), geos = [], col = new THREE.Color();
  gun.g.traverse(o => {
    if (!o.isMesh || !o.geometry.attributes.position) return;
    for (let p = o; p && p !== gun.g; p = p.parent) if (!p.visible) return;
    const g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone());
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    col.setHex(slotColor(gun.skin, o.userData.slot, o.material)).convertSRGBToLinear();
    const n = g.attributes.position.count, c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    geos.push(g);
  });
  const m = new THREE.Mesh(mergeGeometries(geos), lodMat);
  m.visible = false;
  return m;
}
// 駒の銃の近い・遠いを切り替える（毎フレーム。切り替わったときだけ中身を入れ替える）
export function updateGunLod(A, camPos) {
  const far = camPos.distanceTo(A.root.position) > LOD_FAR;
  const key = far ? A.gun.skin : null;
  if (A.lodKey === key) return;
  A.lodKey = key;
  if (A.lod) A.lod.visible = false;
  A.gun.g.traverse(o => { if (o.isMesh) o.layers.set(far ? 1 : 0); });   // 近いときの部品は、遠いと描かない（カメラは 0 番だけ描く）
  if (!far) return;
  A.lods = A.lods || {};
  if (!A.lods[key]) { A.lods[key] = buildLod(A.gun); A.gun.g.add(A.lods[key]); }
  A.lod = A.lods[key]; A.lod.layers.set(0); A.lod.visible = true;
}
