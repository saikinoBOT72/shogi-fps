// エフェクト・一人称の銃・駒のキャラクター
import { P, css, rgba } from './palette';
import * as THREE from 'three';
import { C, LIGHT, V3, clamp, lerp, rand } from './core';
import { GUN_BUILDERS, buildGun, cam, flatten, makeEyes, makePiece, makeShield, outlineMat, pieceGeo, pieceWoodMat, scene, starTex, toon } from './render';
import { groundAt } from './world';

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
        const gy = groundAt(p.pos.x, p.pos.z);
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
export const vmCam = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.01, 10);
vmScene.add(new THREE.HemisphereLight(C(P.ao[2]), C(P.kiji[0]), 0.8 * LIGHT));
export const vmSun = new THREE.DirectionalLight(C(P.shiro[2]), 1.6 * LIGHT); vmSun.position.set(0.6, 1, 0.5); vmScene.add(vmSun);
export const vmFlashLight = new THREE.PointLight(C(P.kin[2]), 0, 2, 1); vmScene.add(vmFlashLight);
// 一人称の銃の構えの目安（fitViewModel で使う）
export const VM_FIT = { grip: [0.55, -0.78], muzzle: [0.15, -0.14], gripDepth: 0.2, reach: 0.45, adsDrop: [-0.1, -0.25] };
export const VM: any = (() => {
  const root = new THREE.Group();
  const models: any = {};
  for (const k of Object.keys(GUN_BUILDERS)) models[k] = buildGun(k);
  for (const [k, m] of Object.entries(models) as [string, any][]) {
    m.g.visible = false; root.add(m.g);
    if (k === 'bow') m.g.scale.setScalar(0.34); else fitViewModel(m);
  }
  addEventListener('resize', () => { for (const [k, m] of Object.entries(models) as [string, any][]) if (k !== 'bow') fitViewModel(m); });
  vmScene.add(root);
  const pist = models.pistol;
  const flash = new THREE.Group();
  const fm = new THREE.MeshBasicMaterial({ map: starTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const f1 = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), fm);
  const f2 = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.34), fm); f2.rotation.x = Math.PI / 2;
  const f3 = f2.clone(); f3.rotation.set(Math.PI / 2, 0, Math.PI / 2);
  flash.add(f1, f2, f3); flash.visible = false;
  const shield = makeShield(0.56, 0.44); shield.visible = false; vmScene.add(shield);
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
  const vm = {
    root, models, pist, flash, shield, shieldT: 0, kick: 0, slideT: 0, flashT: 0, sway: new V3(), bob: 0, equip: 1, dip: 0,
    // 持っている銃の見た目を切り替える
    setWeapon(model) {
      for (const [k, m] of Object.entries(models) as [string, any][]) m.g.visible = k === model;
      vm.pist = models[model]; vm.pist.muzzle.add(flash);
      if (vm.pist.anim) vm.pist.anim.clear();
    },
    // 撃った（反動・光・部品の動き）。empty：最後の1発
    fire(w, empty = false) {
      vm.kick = kickOf(w); vm.slideT = 1;
      if (w.kind !== 'bow') vm.flashT = 0.05;
      if (vm.pist.fire) vm.pist.fire(empty);
    },
    reload(dur) { if (vm.pist.reload) vm.pist.reload(dur); },
    inspect() { if (vm.pist.inspect) vm.pist.inspect(); },
    ready() { vm.equip = 1; if (vm.pist.equip) vm.pist.equip(); },   // 構える（対局の始め）
    // 部品の動きと薬莢を進める
    animate(dt) {
      if (vm.pist.anim) vm.pist.anim.update(dt);
      for (const c of casings) {
        if (!c.m.visible) continue;
        c.t += dt; c.v.y -= 9.8 * dt; c.m.position.addScaledVector(c.v, dt);
        c.m.rotation.x += c.s.x * dt; c.m.rotation.y += c.s.y * dt; c.m.rotation.z += c.s.z * dt;
        if (c.t > 0.7) c.m.visible = false;
      }
    },
    // 塗装を変える（ハンドガン）
    setSkin(id) { if (models.pistol.setSkin) models.pistol.setSkin(id); },
  };
  vm.setWeapon('pistol');
  flatten(root);
  return vm;
})();
// 一人称の銃の構え：画面の右下 1/4 をしっかり使い、照準のまわりには被らないように自動で合わせる
//   グリップ（銃の原点）を画面の右下へ、銃口を照準の少し右下で止まるように、向き・大きさ・位置を決める
//   短い銃（ハンドガン）は銃口の位置を手前にして、大きくなりすぎないようにする
export function fitViewModel(m) {
  if (m.anim) m.anim.rebase();
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
  m.g.scale.setScalar(w.length() / d.length());
  m.hip = G;
  m.ads = at(F.grip[0] + F.adsDrop[0], F.grip[1] + F.adsDrop[1], F.gripDepth);
}
// 撃ったときの銃の跳ね上がり
export const kickOf = w => w.kind === 'bow' ? 0.6 : w.kind === 'grenade' ? 1.6 : clamp(w.recoil / 0.022, 1, 2.2);
// 構えの位置（低めに構え、照準で狙う）。覗き込みも画面の下へ下げてズームするだけ
export const HIP = new V3(0.2, -0.24, -0.48);

// ================= 駒のキャラクター =================
export function buildActor(ch, size, model = 'pistol'): any {
  const root = new THREE.Group(), body = new THREE.Group();
  const w = 1.2 * size, h = 1.85 * size, t = 0.42 * size;
  const wood = pieceWoodMat.clone();
  const piece = makePiece(ch, w, h, t, wood, true);
  const eyes = makeEyes(w, h, t / 2 + 0.008); piece.add(eyes);
  // 輪郭線：体より一回り大きい裏返しの形を墨色で
  const body0 = piece.userData.body, outline = new THREE.Mesh(pieceGeo, outlineMat);
  outline.scale.copy(body0.scale).multiply(new V3(1.06, 1.045, 1.12));
  piece.add(outline);
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
  gun.g.scale.setScalar(({ shotgun: 1.6, smg: 1.9, bow: 1.5, revolver: 2.0, sniper: 1.3, ar: 1.6, launcher: 1.5, ak: 1.25, mk2: 1.15, m870: 1.15, mp5: 1.4 }[model] || 2.2) * size); gun.g.rotation.y = Math.PI;
  gun.g.position.set(w * 0.52, h * 0.5, t + 0.12);
  body.add(gun.g);
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTex, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  flash.scale.setScalar(0.7); flash.visible = false; gun.muzzle.add(flash);
  const shield = makeShield(w * 1.05, h * 0.7);
  shield.position.set(0, h * 0.45, t + 0.45); shield.visible = false;
  body.add(shield);
  flatten(root);
  scene.add(root);
  return { root, body, piece, hitMesh: piece.userData.body, wood, gun, flash, shield, shieldT: 0, eyes, xray, ghost, w, h, t };
}
