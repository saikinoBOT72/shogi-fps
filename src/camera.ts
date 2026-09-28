// カメラと一人称の銃の動き
import { Gadgets } from './gadgets';
import { gs } from './state';
import { LIGHT, SKILLS, V3, clamp, damp, lerp, rand, settings } from './core';
import { SFX } from './audio';
import { cam, sky } from './render';
import { HIP, Particles, VM, vmCam, vmFlashLight } from './effects';
import { act, bot, botActor, eyeOf, player, playerActor, surfOf, view } from './game';

// ================= カメラ・銃の動き =================
const VAL_RAD = 0.07 * Math.PI / 180;   // VALORANT の感度 1 で 1カウントあたりに回る角度
const D2R = Math.PI / 180;
// 視野：VALORANT と同じ「横 103°」。three.js の fov は縦なので、画面の横長さから縦を出す
export const hipFov = () => 2 * Math.atan(Math.tan(103 / 2 * D2R) / cam.aspect) / D2R;
export function updateCamera(dt, rdt) {
  const p = player;
  // ADS の倍率（武器の zoom は縦 80° を基準に作ってあるので、その比で倍率を出す。1 = 等倍、小さいほど拡大）
  const zoomK = Math.tan(lerp(80, p.w.zoom || 56, p.adsT || 0) / 2 * D2R) / Math.tan(40 * D2R);
  // マウス：VALORANT と同じ「感度 1 = 1カウント 0.07°」。ADS は倍率の分だけ下げる（VALORANT のスコープ感度倍率 1 と同じ）
  const sens = VAL_RAD * settings.sens * zoomK;
  // ミサイル操作中：マウスでミサイルを曲げ、カメラはミサイルの後ろ
  const M = Gadgets.ctrlOf(p);
  playerActor.root.visible = !!M;
  if (M) {
    const ms = VAL_RAD * settings.sens;
    M.yaw -= gs.mdx * ms; M.pitch = clamp(M.pitch - gs.mdy * ms, -1.5, -0.35);   // いつも下向き
    gs.mdx = 0; gs.mdy = 0;
    const d = new V3(-Math.sin(M.yaw) * Math.cos(M.pitch), Math.sin(M.pitch), -Math.cos(M.yaw) * Math.cos(M.pitch));
    cam.position.copy(M.pos).addScaledVector(d, 0.3);   // ミサイルの先から見下ろす
    cam.rotation.set(M.pitch, M.yaw, 0);
    cam.fov = 70; cam.updateProjectionMatrix();
    sky.position.copy(cam.position); SFX.listener(cam);
    VM.root.visible = false; VM.shield.visible = false;
    animateActor(playerActor, p, dt, p.pos.clone().add(new V3(-Math.sin(view.yaw), 0, -Math.cos(view.yaw))));
    return;
  }
  const canLook = (gs.state === 'fight' || (gs.state === 'countdown' && gs.stateT > 1.3)) && !p.dead;
  if (canLook) { view.yaw -= gs.mdx * sens; view.pitch = clamp(view.pitch - gs.mdy * sens, -1.52, 1.52); }
  const swayX = clamp(-gs.mdx * 0.00035, -0.05, 0.05), swayY = clamp(gs.mdy * 0.00035, -0.05, 0.05);
  gs.mdx = 0; gs.mdy = 0;

  view.shake = Math.max(0, view.shake - rdt * 1.8);
  const s = view.shake * view.shake, t = performance.now() / 1000;
  const sx = Math.sin(t * 47) * 0.04 * s, sy = Math.sin(t * 53 + 1) * 0.04 * s, sr = Math.sin(t * 31 + 2) * 0.05 * s;

  view.dipV += (-view.dip * 120 - view.dipV * 14) * dt;
  view.dip += view.dipV * dt;

  const eye = eyeOf(p);
  const moveK = p.onGround ? clamp(Math.hypot(p.vel.x, p.vel.z) / p.def.speed, 0, 1) * (1 - (p.adsT || 0) * 0.8) : 0;
  const bobY = Math.sin(view.bobPhase * 2) * 0.035 * moveK, bobX = Math.cos(view.bobPhase) * 0.025 * moveK;
  view.bobX = bobX; view.bobY = bobY;   // リプレイ用に覚えておく

  if (gs.state === 'countdown' && gs.stateT < 1.3) {
    const e = 1 - Math.pow(1 - gs.stateT / 1.3, 3);
    const hi = eye.clone().add(new V3(Math.sin(view.yaw) * 6, 10, Math.cos(view.yaw) * 6));
    cam.position.lerpVectors(hi, eye, e);
    cam.rotation.set(lerp(-0.85, view.pitch, e), view.yaw, 0);
  } else if (p.dead) {
    view.roll = damp(view.roll, 1.1, 4, rdt);
    cam.position.set(p.pos.x, damp(cam.position.y, p.pos.y + 0.35, 4, rdt), p.pos.z);
    cam.rotation.set(damp(cam.rotation.x, 0.25, 4, rdt), view.yaw, view.roll);
  } else {
    const r = new V3(Math.cos(view.yaw), 0, -Math.sin(view.yaw));
    cam.position.copy(eye).addScaledVector(r, bobX);
    cam.position.y += bobY + view.dip;
    cam.rotation.set(view.pitch + sy, view.yaw + sx, sr);
  }
  const dashing = !!act(p, 'dash'), guarding = !!act(p, 'guard');
  const targetFov = 2 * Math.atan(Math.tan(hipFov() / 2 * D2R) * zoomK) / D2R + (dashing ? 14 : 0) - (guarding ? 6 : 0) - (p.draw || 0) * 11;
  // すり足：ステップした方向へ少し傾く
  view.stepRoll = damp(view.stepRoll || 0, 0, 6, rdt);
  if (act(p, 'step')) cam.rotation.z += (view.stepRoll || 0) * 0.06;
  view.fov = damp(view.fov, targetFov, dashing ? 20 : 12, rdt);
  cam.fov = view.fov; cam.updateProjectionMatrix();
  sky.position.copy(cam.position);
  SFX.listener(cam);

  // 透視中は相手が壁越しに見える
  botActor.xray.visible = !!act(p, 'xray') && !bot.dead;
  poseViewModel(p, rdt, swayX, swayY, bobX, bobY);
}

// 一人称の銃の構え・揺れ・反動（リプレイでも同じ動きを使う）
// p: adsT, draw, reloading, w, slots, cd, dead を持つもの
export function poseViewModel(p, rdt, swayX, swayY, bobX, bobY) {
  const ads = p.adsT || 0;
  const dashing = !!act(p, 'dash'), guarding = !!act(p, 'guard');
  VM.sway.x = damp(VM.sway.x, swayX, 10, rdt); VM.sway.y = damp(VM.sway.y, swayY, 10, rdt);
  VM.kick = Math.max(0, VM.kick - rdt * 9);
  VM.slideT = Math.max(0, VM.slideT - rdt * 14);
  VM.dip = Math.max(0, VM.dip - rdt * 4);
  VM.equip = Math.max(0, VM.equip - rdt * 2.2);
  // リロード：部品が動く銃は、その動き（弾倉の抜き差し）に任せる
  VM.animate(rdt);
  const rl = p.reloading > 0 && !VM.pist.anim ? Math.sin(Math.PI * (1 - p.reloading / p.w.reload)) : 0;
  VM.dash = damp(VM.dash || 0, dashing ? 1 : 0, 12, rdt);
  VM.guard = damp(VM.guard || 0, guarding ? 1 : 0, 14, rdt);
  const base = (VM.pist.hip || HIP).clone().lerp(VM.pist.ads, ads);
  if (VM.pist.isBow && p.draw > 0) {
    base.lerp(new V3(0.11, -0.17, -0.4), p.draw * (1 - ads));
    if (p.draw >= 1) base.add(new V3(rand(-0.003, 0.003), rand(-0.003, 0.003), 0));
  }
  // スナイパーを覗いている間は銃を消してスコープ画面に
  VM.scoped = !!p.w.zoom && ads > 0.8 && !p.dead;
  VM.root.visible = !VM.scoped;
  // 弓：弦を引く・追尾が準備できたら矢が光る
  if (VM.pist.isBow) {
    VM.pist.setDraw(p.draw || 0);
    VM.pist.arrow.visible = p.cd <= 0;
    VM.pist.arrowM.emissiveIntensity = act(p, 'homing') ? 1 + Math.sin(performance.now() / 90) * 0.4 : 0;
  }
  const r = VM.root;
  r.position.set(
    base.x + VM.sway.x * (1 - ads * 0.7) + bobX * 0.6 * (1 - ads),
    base.y - VM.sway.y * (1 - ads * 0.7) + bobY * 0.7 * (1 - ads) - rl * 0.12 - VM.dip * 0.05 - VM.equip * 0.35 - VM.dash * 0.08 - VM.guard * 0.1,
    base.z + VM.kick * 0.07
  );
  const ar = VM.pist.adsRot || [0, 0];   // 覗き込むと銃口をまっすぐ前へ
  r.rotation.set(VM.kick * 0.22 - rl * 0.55 - VM.equip * 0.6 - VM.dash * 0.3 + ar[0] * ads, VM.sway.x * 1.5 + ar[1] * ads, VM.sway.x * 1.2 + rl * 0.45 + VM.dash * 0.35);
  if (!VM.pist.anim) VM.pist.slide.position.z = VM.pist.slideZ + VM.slideT * VM.pist.slideAmt;
  // 盾（守りの構え）：下からせり上がる
  VM.shield.visible = VM.guard > 0.02;
  VM.shield.position.set(-0.04 + VM.sway.x, lerp(-0.75, -0.3, VM.guard) + bobY * 0.5, -0.56);
  VM.shield.rotation.set(-0.12, 0.1, 0);
  VM.flashT -= rdt;
  VM.flash.visible = VM.flashT > 0;
  if (VM.flash.visible) { VM.flash.rotation.z = rand(0, 6); VM.flash.scale.setScalar(rand(0.8, 1.3)); }
  vmFlashLight.position.set(r.position.x, r.position.y + 0.05, r.position.z - 0.3);
  vmFlashLight.intensity = VM.flash.visible ? 2.5 * LIGHT : 0;
  vmCam.fov = lerp(58, 50, ads); vmCam.updateProjectionMatrix();
}

// 駒のアニメーション（ぴょこぴょこ歩く・よろける・倒れる）
export function animateActor(A, e, dt, lookAt) {
  A.root.position.copy(e.pos);
  if (lookAt) {
    const d = lookAt.clone().sub(e.pos);
    const target = Math.atan2(d.x, d.z);
    let diff = target - A.root.rotation.y;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    A.root.rotation.y += diff * (1 - Math.exp(-10 * dt));
  }
  // 目：ときどきまばたき。倒れたら×目
  const E = A.eyes && A.eyes.userData;
  if (E) {
    E.blinkT -= dt;
    if (E.blinkT <= 0) { E.shut = 0.12; E.blinkT = rand(2, 5); }
    E.shut = Math.max(0, E.shut - dt);
    for (const eye of E.list) {
      eye.oval.visible = !A.dead; eye.cross.visible = !!A.dead;
      eye.oval.scale.y = (E.shut > 0 ? 0.15 : 1) * A.h * 0.13;
    }
  }
  if (A.gun.setDraw) { A.gun.setDraw(e.draw || 0); A.gun.arrow.visible = !(e.cd > 0); }
  if (A.dead) {
    const D = A.dead;
    D.v += 9 * dt; D.a += D.v * dt;
    if (D.a >= Math.PI / 2) { D.a = Math.PI / 2; if (Math.abs(D.v) > 0.8) { D.v *= -0.3; SFX.play('step', e.pos, 1.5); Particles.dust(e.pos, 8, 1.2); } else D.v = 0; }
    A.body.rotation.set(-D.a, 0, 0);
    A.body.position.y = 0;
    return;
  }
  const spd = Math.hypot(e.vel.x, e.vel.z);
  const mk = e.onGround ? clamp(spd / e.def.speed, 0, 1) : 0;
  const prev = Math.sin(e.stepPhase);
  e.stepPhase += dt * (6 + spd * 1.3);
  if (e.isBot && mk > 0.3 && prev > 0 && Math.sin(e.stepPhase) <= 0) SFX.play('step', e.pos, 1, surfOf(e));
  const inv = A.root.rotation.y;
  const lf = e.vel.x * Math.sin(inv) + e.vel.z * Math.cos(inv);  // 前後
  const ls = e.vel.x * Math.cos(inv) - e.vel.z * Math.sin(inv);  // 左右
  A.flinch = Math.max(0, (A.flinch || 0) - dt * 3);
  const dashA = act(e, 'dash'), guardA = act(e, 'guard');
  A.body.rotation.x = damp(A.body.rotation.x, lf * 0.025 - A.flinch * 0.6 + (dashA ? 0.35 : 0), 12, dt);
  // 盾
  A.shieldT = damp(A.shieldT || 0, guardA ? 1 : 0, 14, dt);
  A.shield.visible = A.shieldT > 0.02;
  A.shield.scale.set(1, Math.max(0.01, A.shieldT), 1);
  A.body.rotation.z = damp(A.body.rotation.z, Math.sin(e.stepPhase) * 0.13 * mk - ls * 0.02, 14, dt);
  A.body.position.y = Math.abs(Math.sin(e.stepPhase)) * 0.14 * mk;
  A.wood.emissive.multiplyScalar(Math.max(0, 1 - dt * 10));
  // 透明化：体と銃を隠して、うっすらした影だけ
  const cloaked = !!act(e, 'cloak');
  A.piece.visible = !cloaked; A.gun.g.visible = !cloaked; A.ghost.visible = cloaked;
  e.flashT -= dt;
  A.flash.visible = e.flashT > 0;
  if (A.flash.visible) A.flash.material.rotation = rand(0, 6);
}
