// カメラと一人称の銃の動き
'use strict';

// ================= カメラ・銃の動き =================
function updateCamera(dt, rdt) {
  const p = player;
  // マウス（感度は ADS 中に下げる）
  const sens = 0.0021 * settings.sens * lerp(1, 0.65, p.adsT || 0);
  const canLook = (state === 'fight' || (state === 'countdown' && stateT > 1.3)) && !p.dead;
  if (canLook) { view.yaw -= mdx * sens; view.pitch = clamp(view.pitch - mdy * sens, -1.52, 1.52); }
  const swayX = clamp(-mdx * 0.00035, -0.05, 0.05), swayY = clamp(mdy * 0.00035, -0.05, 0.05);
  mdx = 0; mdy = 0;

  view.shake = Math.max(0, view.shake - rdt * 1.8);
  const s = view.shake * view.shake, t = performance.now() / 1000;
  const sx = Math.sin(t * 47) * 0.04 * s, sy = Math.sin(t * 53 + 1) * 0.04 * s, sr = Math.sin(t * 31 + 2) * 0.05 * s;

  view.dipV += (-view.dip * 120 - view.dipV * 14) * dt;
  view.dip += view.dipV * dt;

  const eye = eyeOf(p);
  const moveK = p.onGround ? clamp(Math.hypot(p.vel.x, p.vel.z) / p.def.speed, 0, 1) * (1 - (p.adsT || 0) * 0.8) : 0;
  const bobY = Math.sin(view.bobPhase * 2) * 0.035 * moveK, bobX = Math.cos(view.bobPhase) * 0.025 * moveK;

  if (state === 'countdown' && stateT < 1.3) {
    const e = 1 - Math.pow(1 - stateT / 1.3, 3);
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
    cam.rotation.set(view.pitch + sy, view.yaw + sx, sr + (p.skillT > 0 ? 0 : 0));
  }
  const targetFov = lerp(80, 56, p.adsT || 0) + (p.skillT > 0 ? 14 : 0);
  view.fov = damp(view.fov, targetFov, p.skillT > 0 ? 20 : 12, rdt);
  cam.fov = view.fov; cam.updateProjectionMatrix();
  sky.position.copy(cam.position);
  SFX.listener(cam);

  // 一人称の銃
  const ads = p.adsT || 0;
  VM.sway.x = damp(VM.sway.x, swayX, 10, rdt); VM.sway.y = damp(VM.sway.y, swayY, 10, rdt);
  VM.kick = Math.max(0, VM.kick - rdt * 9);
  VM.slideT = Math.max(0, VM.slideT - rdt * 14);
  VM.dip = Math.max(0, VM.dip - rdt * 4);
  VM.equip = Math.max(0, VM.equip - rdt * 2.2);
  const rl = p.reloading > 0 ? Math.sin(Math.PI * (1 - p.reloading / p.w.reload)) : 0;
  const dash = p.skillT > 0 ? 1 : 0;
  VM.dash = damp(VM.dash || 0, dash, 12, rdt);
  const base = HIP.clone().lerp(ADS, ads);
  const r = VM.root;
  r.position.set(
    base.x + VM.sway.x * (1 - ads * 0.7) + bobX * 0.6 * (1 - ads),
    base.y - VM.sway.y * (1 - ads * 0.7) + bobY * 0.7 * (1 - ads) - rl * 0.12 - VM.dip * 0.05 - VM.equip * 0.35 - VM.dash * 0.08,
    base.z + VM.kick * 0.07
  );
  r.rotation.set(VM.kick * 0.22 - rl * 0.55 - VM.equip * 0.6 - VM.dash * 0.3, VM.sway.x * 1.5, VM.sway.x * 1.2 + rl * 0.45 + VM.dash * 0.35);
  VM.pist.slide.position.z = VM.pist.slideZ + VM.slideT * 0.05;
  VM.flashT -= rdt;
  VM.flash.visible = VM.flashT > 0;
  if (VM.flash.visible) { VM.flash.rotation.z = rand(0, 6); VM.flash.scale.setScalar(rand(0.8, 1.3)); }
  vmFlashLight.position.set(r.position.x, r.position.y + 0.05, r.position.z - 0.3);
  vmFlashLight.intensity = VM.flash.visible ? 2.5 : 0;
  vmCam.fov = lerp(58, 50, ads); vmCam.updateProjectionMatrix();
}

// 駒のアニメーション（ぴょこぴょこ歩く・よろける・倒れる）
function animateActor(A, e, dt, lookAt) {
  A.root.position.copy(e.pos);
  if (lookAt) {
    const d = lookAt.clone().sub(e.pos);
    const target = Math.atan2(d.x, d.z);
    let diff = target - A.root.rotation.y;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    A.root.rotation.y += diff * (1 - Math.exp(-10 * dt));
  }
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
  if (e.isBot && mk > 0.3 && prev > 0 && Math.sin(e.stepPhase) <= 0) SFX.play('step', e.pos, 1);
  const inv = A.root.rotation.y;
  const lf = e.vel.x * Math.sin(inv) + e.vel.z * Math.cos(inv);  // 前後
  const ls = e.vel.x * Math.cos(inv) - e.vel.z * Math.sin(inv);  // 左右
  A.flinch = Math.max(0, (A.flinch || 0) - dt * 3);
  A.body.rotation.x = damp(A.body.rotation.x, lf * 0.025 - A.flinch * 0.6 + (e.skillT > 0 ? 0.35 : 0), 12, dt);
  A.body.rotation.z = damp(A.body.rotation.z, Math.sin(e.stepPhase) * 0.13 * mk - ls * 0.02, 14, dt);
  A.body.position.y = Math.abs(Math.sin(e.stepPhase)) * 0.14 * mk;
  A.wood.emissive.multiplyScalar(Math.max(0, 1 - dt * 10));
  e.flashT -= dt;
  A.flash.visible = e.flashT > 0;
  if (A.flash.visible) A.flash.material.rotation = rand(0, 6);
}
