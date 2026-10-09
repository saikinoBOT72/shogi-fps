// カメラと一人称の銃の動き
import * as THREE from 'three';
import { Gadgets } from './gadgets';
import { gs } from './state';
import { LIGHT, SKILLS, V3, clamp, damp, lerp, rand, settings } from './core';
import { SFX } from './audio';
import { cam, sky } from './render';
import { HIP, Particles, VM, updateGunLod, vmCam, vmFlashLight } from './effects';
import { act, bot, botActor, eyeOf, player, playerActor, surfOf, view } from './game';
import { keys } from './input';
import { heardFoe } from './hud';
import { Sword } from './sword';

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
  // オートエイム（開発者メニュー）：キーを押している間、照準を相手の頭に合わせる
  const aimKey = (settings as any).dev.aimKey;
  if (canLook && aimKey && keys[aimKey] && bot && !bot.dead) {
    const from = eyeOf(p), head = new V3(bot.pos.x, bot.pos.y + bot.height * 0.88, bot.pos.z), d = head.sub(from);
    view.yaw = Math.atan2(-d.x, -d.z); view.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
  }
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
    const e = 1 - Math.pow(1 - Math.max(0, gs.stateT) / 1.3, 3);
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
  const dashing = !!act(p, 'dash'), guarding = !!act(p, 'guard'), blinking = !!act(p, 'blink');
  const targetFov = 2 * Math.atan(Math.tan(hipFov() / 2 * D2R) * zoomK) / D2R + (dashing ? 14 : 0) + (blinking ? 26 : 0) - (guarding ? 6 : 0) - (p.draw || 0) * 11;
  const rl0 = act(p, 'roll');
  if (rl0) { const k = Math.sin(Math.PI * (1 - rl0.t / rl0.sk.duration)); cam.position.y -= k * 0.85; cam.rotation.x -= k * 0.55; }
  // すり足：ステップした方向へ少し傾く
  view.stepRoll = damp(view.stepRoll || 0, 0, 6, rdt);
  if (act(p, 'step')) cam.rotation.z += (view.stepRoll || 0) * 0.06;
  // 刀を振った瞬間：振る向きへ傾いて揺れ、視野が少し狭まる（sword.ts が決める）
  view.swRoll = damp(view.swRoll || 0, 0, 7, rdt); view.swYaw = damp(view.swYaw || 0, 0, 7, rdt); view.swFov = damp(view.swFov || 0, 0, 6, rdt);
  cam.rotation.z += view.swRoll; cam.rotation.y += view.swYaw;
  view.fov = damp(view.fov, targetFov, dashing || blinking ? 22 : 12, rdt);
  if (!Number.isFinite(view.fov)) view.fov = Number.isFinite(targetFov) ? targetFov : 70;   // 画面の大きさが一瞬 0 になったときなどに壊れたままにならないように
  cam.fov = view.fov + (view.swFov || 0); cam.updateProjectionMatrix();
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
  // スライドに付いたサイト：覗いている間はスライドの動きを小さく（目の前まで跳ねてこないように）
  if (VM.pist.scope?.part && p.w && ads > 0) { const S0 = VM.pist.parts[VM.pist.scope.part]; S0.position.z = VM.pist.scopeRestZ + (S0.position.z - VM.pist.scopeRestZ) * (1 - ads * 0.8); }
  const rl = p.reloading > 0 && !VM.pist.anim ? Math.sin(Math.PI * (1 - p.reloading / p.w.reload)) : 0;
  VM.dash = damp(VM.dash || 0, dashing ? 1 : 0, 12, rdt);
  VM.guard = damp(VM.guard || 0, guarding ? 1 : 0, 14, rdt);
  // スコープ：覗くほど接眼レンズが目の前の真ん中へ。距離はスコープの外枠が画面の縦の scopeSize になるように
  const sc = VM.pist.adsEye ? ads : 0, ssw = p.w.scopeSway ?? 1;
  const adsPos = VM.pist.adsEye ? new V3(0, 0, -VM.pist.scopeR / ((p.w.scopeSize || 0.9) * Math.tan(25 * D2R))).sub(VM.pist.adsEye) : VM.pist.ads;
  const base = (VM.pist.hip || HIP).clone().lerp(adsPos, ads);
  if (VM.pist.isBow && p.draw > 0) {
    base.lerp(new V3(0.11, -0.17, -0.4), p.draw * (1 - ads));
    if (p.draw >= 1) base.add(new V3(rand(-0.003, 0.003), rand(-0.003, 0.003), 0));
  }
  // スコープ・ドットサイトを覗いている間：銃はそのまま、レンズの穴から景色を見せ、照準を重ねる（drawScope）
  VM.scoped = sc > 0.55 && !p.dead;
  VM.root.visible = true;
  if (VM.pist.portal) VM.pist.portal.visible = sc > 0.3;
  // 揺れの効き方：スコープは目の前にあるので、少し動くだけで大きくずれる。そのぶん小さく（scopeSway で調整）
  const swK = sc ? lerp(1, 0.05 * ssw, sc) : 1 - ads * 0.7, swR = sc ? lerp(1, 0.08 * ssw, sc) : 1;
  const bbK = sc ? lerp(1, 0.25 * ssw, sc) : 1 - ads;
  // 弓：弦を引く・追尾が準備できたら矢が光る
  if (VM.pist.isBow) {
    VM.pist.setDraw(p.draw || 0);
    VM.pist.arrow.visible = p.cd <= 0;
    VM.pist.arrowM.emissiveIntensity = act(p, 'homing') ? 1 + Math.sin(performance.now() / 90) * 0.4 : 0;
  }
  const r = VM.root;
  r.position.set(
    base.x + VM.sway.x * swK + bobX * 0.6 * bbK,
    base.y - VM.sway.y * swK + bobY * 0.7 * bbK - rl * 0.12 - VM.dip * 0.05 - VM.equip * 0.35 - VM.dash * 0.08 - VM.guard * 0.1,
    base.z + VM.kick * 0.07 * (1 - sc * 0.95)
  );
  const ar = VM.pist.adsRot || [0, 0];   // 覗き込むと銃口をまっすぐ前へ
  r.rotation.set(VM.kick * 0.22 * (1 - sc * 0.5) - rl * 0.55 - VM.equip * 0.6 - VM.dash * 0.3 + ar[0] * ads, VM.sway.x * 1.5 * swR + ar[1] * ads, VM.sway.x * 1.2 * swR + rl * 0.45 + VM.dash * 0.35);
  if (VM.pist.isSword) Sword.poseVM(p, rdt);   // 刀：振る動きは sword.ts が決める
  if (!VM.pist.anim) VM.pist.slide.position.z = VM.pist.slideZ + VM.slideT * VM.pist.slideAmt;
  // 盾（守りの構え）：下からせり上がる
  const du = !!act(p, 'dual');
  VM.leftMirror.visible = du && !p.dead;
  if (du) {
    VM.kickL = Math.max(0, (VM.kickL || 0) - rdt * 9);
    VM.leftRoot.position.set(r.position.x, r.position.y, r.position.z + (VM.kickL - VM.kick) * 0.07);
    VM.leftRoot.rotation.set(r.rotation.x + (VM.kickL - VM.kick) * 0.22, r.rotation.y, r.rotation.z);
  }
  VM.low = damp(VM.low || 0, act(p, 'medkit') || act(p, 'roll') ? 1 : VM.flareT > 0 ? 0.5 : 0, 10, rdt);
  if (VM.low > 0.01) { r.position.y -= VM.low * 0.12; r.rotation.x -= VM.low * 0.35; }
  poseItems(p, rdt, bobY);
  VM.shield.visible = VM.guard > 0.02;
  VM.shield.position.set(-0.04 + VM.sway.x, lerp(-0.75, -0.3, VM.guard) + bobY * 0.5, -0.56);
  VM.shield.rotation.set(-0.12, 0.1, 0);
  VM.flashT -= rdt;
  VM.flash.visible = VM.flashT > 0;
  if (VM.flash.visible) { VM.flash.rotation.z = rand(0, 6); VM.flash.scale.setScalar(rand(0.8, 1.3)); }
  vmFlashLight.position.set(r.position.x, r.position.y + 0.05, r.position.z - 0.3);
  vmFlashLight.intensity = VM.flash.visible ? 2.5 * LIGHT : 0;
  vmCam.fov = lerp(58, 50, ads); vmCam.updateProjectionMatrix();
  // 接眼レンズの穴が画面のどこにあるか（照準をその丸の中だけに出す）
  if (VM.scoped && VM.pist.portal) {
    const P0 = VM.pist.portal;
    r.updateMatrixWorld(true);
    const W = innerWidth / 2, H = innerHeight / 2;
    const c = P0.getWorldPosition(new V3()).project(vmCam), cx = (c.x + 1) * W, cy = (1 - c.y) * H;
    // 窓の形の点を画面へ（その形で照準を切り抜く）。r は中心から縁までの平均
    let rs = 0;
    const poly = VM.pist.lensPts.map(q => { const s = P0.localToWorld(q.clone()).project(vmCam), x = (s.x + 1) * W, y = (1 - s.y) * H; rs += Math.hypot(x - cx, y - cy); return x.toFixed(1) + 'px ' + y.toFixed(1) + 'px'; }).join(',');
    VM.lens = { x: cx, y: cy, r: rs / VM.pist.lensPts.length, poly, k: clamp((sc - 0.55) / 0.3, 0, 1), inf: (p.w.crossInf || 0) >= 0.5, ret: p.w.reticle || 'cross' };
  }
}

// スコープの照準（HUD とキルカメラで共通）：十字と赤い点（ドットサイトは赤い点と輪）をレンズの丸の中だけに描く
//   赤い点はいつも画面の真ん中（＝弾が飛ぶ遠くの一点）。十字は crossInf が 0 なら枠と一緒に揺れる
// 左手の道具：救急キット（使っている間・ふたを開けて手当て）・フレアガン（構えて撃つ）
function poseItems(p, rdt, bobY) {
  const I = VM.items, med = act(p, 'medkit');
  VM.flareT = Math.max(0, VM.flareT - rdt); VM.flareKick = Math.max(0, VM.flareKick - rdt * 5);
  const kind = p.dead ? null : med ? 'medkit' : VM.flareT > 0 ? 'flare' : null;
  if (kind) VM.itemKind = kind;
  VM.itemK = damp(VM.itemK, kind ? 1 : 0, kind === 'flare' ? 30 : 12, rdt);
  for (const k in I) I[k].visible = k === VM.itemKind && VM.itemK > 0.02;
  if (VM.itemK <= 0.02) return;
  const k = VM.itemK, g = I[VM.itemKind];
  if (VM.itemKind === 'medkit') {
    const u = med ? 1 - med.t / med.sk.duration : 1;   // 使い始め 0 → 終わり 1
    const open = clamp((u - 0.1) / 0.2, 0, 1), ap = clamp((u - 0.35) / 0.65, 0, 1), w = Math.sin(ap * Math.PI * 4);
    g.position.set(-0.09 + ap * 0.03, lerp(-0.45, -0.13, k) + bobY * 0.4 + w * 0.008, -0.4 + ap * 0.03);
    g.rotation.set(0.6 - open * 0.25 + w * 0.06, 0.3 - ap * 0.15, 0.05);
    g.getObjectByName('lid').rotation.x = -open * 1.9;
  } else {
    const kk = VM.flareKick;
    g.position.set(-0.12, lerp(-0.45, -0.15, k) + kk * 0.015 + bobY * 0.4, -0.4 + kk * 0.05);
    g.rotation.set(kk * 0.3, -0.45, 0.3);   // 横を少し見せて照準の方へ向ける
    const fl = g.getObjectByName('flash'); fl.visible = kk > 0.8; fl.rotation.z = rand(0, 6);
  }
}
export function drawScope(el: HTMLElement, on: boolean) {
  const L = VM.lens;
  el.style.display = on && L ? 'block' : 'none';
  if (!on || !L) return;
  if (!el.firstChild) el.innerHTML = '<i class="sc-shade"></i><i class="sc-v sc-a"></i><i class="sc-v sc-b"></i><i class="sc-h sc-a"></i><i class="sc-h sc-b"></i><i class="sc-ring"></i><i class="sc-dot"></i>';
  if (el.dataset.ret !== L.ret) el.dataset.ret = L.ret;
  const s = el.style;
  s.setProperty('--lx', L.x.toFixed(1) + 'px'); s.setProperty('--ly', L.y.toFixed(1) + 'px'); s.setProperty('--lr', L.r.toFixed(1) + 'px');
  s.setProperty('--cx', (L.inf ? innerWidth / 2 : L.x).toFixed(1) + 'px'); s.setProperty('--cy', (L.inf ? innerHeight / 2 : L.y).toFixed(1) + 'px');
  s.clipPath = `polygon(${L.poly})`;
  s.opacity = L.k.toFixed(2);
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
  // 盤の駒らしく：硬いまま小さく跳ねて、コトッと着く（半分は床に着いている）。着いた瞬間に足音
  const prev = Math.sin(e.stepPhase * 2);
  e.stepPhase += dt * (6 + spd * 1.3);
  const hop = Math.max(0, Math.sin(e.stepPhase * 2));
  if (e.isBot && mk > 0.3 && prev > 0 && Math.sin(e.stepPhase * 2) <= 0) { SFX.play('step', e.pos, 1, surfOf(e)); heardFoe(e.pos, 'step'); }
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
  A.body.rotation.z = damp(A.body.rotation.z, Math.sign(Math.sin(e.stepPhase)) * hop * 0.05 * mk - ls * 0.02, 20, dt);   // 跳ぶたびに左右へ少し傾く
  A.body.position.y = hop * 0.11 * mk;
  const rl = act(e, 'roll');
  if (rl) {
    // 転がる向き：リプレイの駒（向きを持たない）は動いている向き
    const rd = rl.dir ? rl.dir.clone() : new V3(e.vel.x, 0, e.vel.z);
    if (rd.lengthSq() < 1e-4) rd.set(Math.sin(inv), 0, Math.cos(inv));
    const k = clamp(1 - rl.t / rl.sk.duration, 0, 1), dl = rd.normalize().applyAxisAngle(new V3(0, 1, 0), -inv);
    const q = new THREE.Quaternion().setFromAxisAngle(new V3(dl.z, 0, -dl.x).normalize(), k * Math.PI * 2);
    const c = new V3(0, A.h * 0.5, 0);
    A.body.quaternion.copy(q);
    A.body.position.set(0, -Math.sin(k * Math.PI) * A.h * 0.3, -A.t / 2).add(c).sub(c.clone().applyQuaternion(q));
    A.rolling = true;
  } else if (A.rolling) { A.rolling = false; A.body.rotation.set(0, 0, 0); A.body.position.set(0, 0, -A.t / 2); }
  // スキルの道具：救急キット（使っている間・ふたを開けて手当て）・フレアガン（撃つときに左手で構える）
  const med = act(e, 'medkit'), shown = !Sword.hidden(e) && !act(e, 'cloak');
  A.items.medkit.visible = !!med && shown;
  if (med) {
    const u = 1 - med.t / med.sk.duration;
    A.items.medkit.getObjectByName('lid').rotation.x = -clamp((u - 0.1) / 0.2, 0, 1) * 1.9;
    A.items.medkit.position.y = A.h * 0.42 + Math.sin(u * Math.PI * 4) * 0.03;
  }
  e.flareT = Math.max(0, (e.flareT || 0) - dt);
  A.items.flare.visible = e.flareT > 0 && shown;
  if (e.flareT > 0) A.items.flare.rotation.x = -0.25 - clamp((e.flareT - 0.45) / 0.3, 0, 1) * 0.5;   // 撃った瞬間に跳ね上がる
  A.wood.emissive.multiplyScalar(Math.max(0, 1 - dt * 10));
  // 透明化：体と銃を隠して、うっすらした影だけ
  const cloaked = !!act(e, 'cloak'), hid = Sword.hidden(e);   // 葉隠れで止まっている間は影も含めて全く見えない
  A.piece.visible = !cloaked && !hid; A.gun.g.visible = !cloaked && !hid; A.ghost.visible = cloaked && !hid;
  if (A.gun2) A.gun2.g.visible = !!act(e, 'dual') && !cloaked && !hid;   // 2丁持ち
  updateGunLod(A, cam.position);
  e.flashT -= dt;
  A.flash.visible = e.flashT > 0;
  if (A.flash.visible) A.flash.material.rotation = rand(0, 6);
}
