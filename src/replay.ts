// リプレイ：勝っても負けても、決着の直前を「決めた側」の一人称視点で再生する
// 勝ったとき＝あなたの視点（あなたの銃）、負けたとき＝相手の視点（相手の銃）
import { Gadgets } from './gadgets';
import { gs } from './state';
import { $, V3, damp } from './core';
import { SFX } from './audio';
import * as THREE from 'three';
import { buildGun, cam, renderer, scene, sky } from './render';
import { PHYS } from './physics';
import { DmgNums, HIP, Particles, Tracers, VM, fitViewModel, vmFlashLight } from './effects';
import { Arrows } from './arrows';
import { Grenades, Smoke } from './grenades';
import { act, bot, botActor, foeRef, paintFoe, player, playerActor, view } from './game';
import { afterimage } from './swordfx';
import { equippedRef, paintGun } from './loadout';
import { Net } from './net';
import { Sword } from './sword';
import { animateActor, drawScope, hipFov, poseViewModel } from './camera';

export const Replay = (() => {
  const KEEP = 9, BEFORE = 6, AFTER = 1.4;   // 覚えておく秒数・決着の何秒前から・何秒後まで
  let frames = [], events = [], t = 0, play = null;
  const recording = () => !play && (gs.state === 'fight' || gs.state === 'end');
  const cl = a => a && a.isVector3 ? a.clone() : a;

  // 画面に出たもの（光跡・火花・木くず・ダメージの数字・音）を記録して、再生で同じように出す
  const orig: any = {};
  const hook = (obj, name, kind) => {
    const f = obj[name].bind(obj); orig[kind] = f;
    obj[name] = (...a) => { f(...a); if (recording()) events.push({ kind, a: a.map(cl) }); };
  };
  hook(Tracers, 'add', 'tracer');
  hook(DmgNums, 'add', 'dmg');
  hook(SFX, 'play', 'snd');
  for (const k of ['impact', 'wood', 'dust', 'explosion', 'glow', 'trail', 'shards']) hook(Particles, k, k);   // shards：葉隠れの葉など
  // あなたにだけ聞こえていた音（相手の視点では鳴らさない）
  const MINE = new Set(['hit', 'head', 'kill', 'hurt', 'reloadStart', 'reloadEnd', 'empty', 'ram', 'heal', 'pierce', 'bowReady', 'bowDraw', 'ding', 'beep']);

  const ui = document.createElement('div');
  ui.id = 'killcam';
  ui.innerHTML = `<div id="kcScope"></div><div id="kcHurt"></div><div id="kcFlash"></div>
    <div class="kc-xh"></div><div class="kc-hm" id="kcHm"><i></i><i></i><i></i><i></i></div>
    <div class="kc-top"><b id="kcTitle"></b><span id="kcWho"></span></div>
    <div class="kc-bars"><div class="kc-bar"><span id="kcName0"></span><i><b id="kcHp0"></b></i></div><div class="kc-bar foe"><span id="kcName1"></span><i><b id="kcHp1"></b></i></div></div>
    <div class="kc-skip" id="kcSkip">クリックでスキップ</div><div class="kc-pip" id="kcPip"><span>やられた側</span></div>`;
  document.body.appendChild(ui);

  // ================= 小さい画面：やられた側の視点（右下・画面の約 1/8） =================
  // リプレイの間だけ、記録からもう1回描く（試合中は何も増えない）。銃は専用の小さな場面に作る（2丁持ち用の左の銃も）
  const pip = { cam: new THREE.PerspectiveCamera(60, 1, 0.1, 2000), vmCam: new THREE.PerspectiveCamera(58, 1, 0.004, 10), scene: new THREE.Scene(), root: new THREE.Group(), m: null as any, kick: 0, kickL: 0, leftShot: false, look: new V3(), bob: 0,
    leftMirror: new THREE.Group(), leftRoot: new THREE.Group(), left: null as any };
  pip.scene.add(new THREE.HemisphereLight(0xcfe0ff, 0xb08a5a, 0.8 * Math.PI));
  { const s = new THREE.DirectionalLight(0xffffff, 1.6 * Math.PI); s.position.set(0.6, 1, 0.5); pip.scene.add(s); }
  pip.scene.add(pip.root);
  pip.leftMirror.scale.x = -1; pip.leftMirror.add(pip.leftRoot); pip.scene.add(pip.leftMirror);
  function pipSetup(win) {
    if (pip.m) pip.root.remove(pip.m.g);
    const vic = win ? bot : player, model = vic.w.model;
    const m = buildGun(model);
    if (model === 'bow') m.g.scale.setScalar(0.44); else fitViewModel(m);
    paintGun(m, win ? foeRef(model) : equippedRef(model));
    pip.root.add(m.g); pip.m = m; pip.kick = 0; pip.kickL = 0; pip.bob = 0;
    // 2丁目（デザートイーグル）：持てる駒のときだけ作る
    if (pip.left) { pip.leftRoot.remove(pip.left.g); pip.left = null; }
    if (vic.slots.some(s => s.sk.type === 'dual')) {
      const l = buildGun('pistol'); fitViewModel(l); paintGun(l, win ? foeRef('pistol') : equippedRef('pistol'));
      pip.leftRoot.add(l.g); pip.left = l;
    }
    pip.leftMirror.visible = false;
    pip.look.copy(win ? frames[play.i].b.aim : frames[play.i].p.pos);
  }

  // foeSkipped：オンラインで勝った相手がもうスキップした（こちらのリプレイが始まる前に届いたとき用）
  // saved：結果の画面から「もう一回リプレイ」を見るための、決着のときの記録
  let foeSkipped = false, saved = null;
  function clear() { frames = []; events = []; t = 0; foeSkipped = false; saved = null; }

  // 刀を振っている様子（段・時間・振りかぶる前の形）と守りの構え。リプレイで刀の動きを再現する
  const swOf = e => (e.sw && e.sw.stage ? { stage: e.sw.stage, t: e.sw.t, serial: e.sw.serial, from: { p: e.sw.from.p.clone(), q: e.sw.from.q.clone() } } : null);
  // 鉤縄の的（張っている間だけ）
  const gtOf = e => { const g = act(e, 'grapple'); return g && g.target ? g.target.clone() : null; };
  let lastPcd = 0, lastBcd = 0;
  function record(dt) {
    t += dt;
    const p = player, b = bot;
    const q = cam.quaternion;
    frames.push({
      t,
      cam: [cam.position.x, cam.position.y, cam.position.z, q.x, q.y, q.z, q.w, cam.fov],
      p: {
        pos: p.pos.clone(), vel: p.vel.clone(), yaw: view.yaw, onGround: p.onGround, dead: p.dead, hp: p.hp,
        sk: p.slots.map(s => s.t), cd: p.cd, draw: p.draw, adsT: p.adsT || 0, reloading: p.reloading, ammo: p.ammo,
        fired: p.cd > lastPcd + 1e-4, sway: [VM.sway.x, VM.sway.y], bob: [view.bobX || 0, view.bobY || 0], sw: swOf(p), gk: p.swGuardK || 0,
        st: p.stillT || 0, ft: p.flareT || 0, bl: gs.flash || 0, gt: gtOf(p),   // 葉隠れ・フレアガン・目くらみ・鉤縄
      },
      b: {
        pos: b.pos.clone(), vel: b.vel.clone(), rotY: botActor.root.rotation.y, aim: (b.aimPt || p.pos).clone(), onGround: b.onGround, dead: b.dead, hp: b.hp,
        sk: b.slots.map(s => s.t), cd: b.cd, draw: b.draw, reloading: b.reloading, ammo: b.ammo, fired: b.cd > lastBcd + 1e-4, sw: swOf(b), gk: b.swGuardK || 0,
        st: b.stillT || 0, ft: b.flareT || 0, bl: b.blindT || 0, gt: gtOf(b),
      },
      ph: PHYS.snapshot(), ar: Arrows.snapshot(), gr: Grenades.snapshot(), gd: Gadgets.snapshot(),
      ev: events,
    });
    lastPcd = p.cd; lastBcd = b.cd;
    events = [];
    while (frames.length && frames[0].t < t - KEEP) frames.shift();
  }

  // 記録から動かす、見た目だけの駒
  const fakeOf = e => ({ pos: new V3(), vel: new V3(), vy: 0, onGround: true, def: e.def, w: e.w, slots: e.slots.map(s => ({ sk: s.sk, t: 0 })), stepPhase: 0, flashT: 0, isBot: false, draw: 0, cd: 0, adsT: 0, reloading: 0, dead: false });
  function apply(fk, r) {
    fk.pos.copy(r.pos); fk.vel.copy(r.vel); fk.onGround = r.onGround; fk.slots.forEach((s, i) => { s.t = r.sk[i] || 0; });
    fk.cd = r.cd; fk.draw = r.draw || 0; fk.reloading = r.reloading; fk.adsT = r.adsT || 0; fk.dead = r.dead;
    fk.sw = r.sw; fk.swGuardK = r.gk || 0; fk.stillT = r.st || 0; fk.flareT = r.ft || 0;
  }

  // win: true = あなたが倒した（あなたの視点）、false = 倒された（相手の視点）
  //   again：結果の画面から自分で見直す（オンラインでも相手とは関係なく、いつでもスキップできる）
  function start(win, onDone, again = false) {
    const victim = win ? 'b' : 'p';
    const death = frames.find(f => f[victim].dead);
    // オンラインで勝った側：リプレイが無いときは、すぐ相手のリプレイも終わらせる
    if (!death || frames.length < 20) { if (Net.on && win && !again) Net.send({ t: 'kcskip' }); return false; }
    if (!again) saved = { frames: frames.slice(), win };   // このあとも記録は続いて古いものから消えるので、写しを取っておく
    if (Net.on && !win && !again && foeSkipped) return false;   // 勝った相手がもうスキップした
    const t0 = Math.max(frames[0].t, death.t - BEFORE);
    const i = Math.max(0, frames.findIndex(f => f.t >= t0));
    const shooter = win ? player : bot, target = win ? bot : player;
    play = {
      i, win, time: frames[i].t, deathT: death.t, endT: Math.min(frames[frames.length - 1].t, death.t + AFTER), onDone,
      look: frames[i].b.aim.clone(), liveGadgets: Gadgets.snapshot(), fp: fakeOf(player), fb: fakeOf(bot), bobPhase: 0, hm: 0, hurt: 0, fovK: 1, ghostT: 0, again,
    };
    gs.state = 'killcam'; gs.mouseDown = false; gs.rightDown = false;
    // 決めた側の銃を持つ。相手の視点なら、一人称の銃も相手のスキン（飾りまで）にする
    paintFoe(true);
    pipSetup(win);
    if (!win) { paintGun(VM.models[shooter.w.model], foeRef(shooter.w.model)); paintGun(VM.left, foeRef('pistol')); }   // 2丁持ちの左の銃も相手のスキン
    VM.setWeapon(shooter.w.model);
    Object.assign(VM, { kick: 0, slideT: 0, flashT: 0, dip: 0, equip: 0, dash: 0, guard: 0 }); VM.sway.set(0, 0, 0);
    playerActor.root.visible = !win; botActor.root.visible = win;
    for (const A of [playerActor, botActor]) { A.dead = null; A.body.rotation.set(0, 0, 0); A.body.position.y = 0; A.xray.visible = false; }
    Arrows.setLiveVisible(false); Grenades.setLiveVisible(false);
    $('hud').style.display = 'none';
    ui.classList.toggle('win', win);
    $('kcTitle').textContent = win ? 'REPLAY' : 'KILLCAM';
    // オンラインで負けた側はスキップできない（勝った相手がスキップすると一緒に終わる）
    $('kcSkip').textContent = Net.on && !win && !again ? '相手がスキップすると終わります' : 'クリックでスキップ';
    $('kcWho').textContent = win ? 'あなたの視点' : `相手（${bot.def.name}）の視点`;
    $('kcName0').textContent = win ? `あなた ${player.def.name}` : `相手 ${bot.def.name}`;
    $('kcName1').textContent = win ? `相手 ${bot.def.name}` : `あなた ${player.def.name}`;
    ui.dataset.shooter = shooter.def.name; ui.dataset.target = target.def.name;
    ui.style.display = 'block';
    return true;
  }

  function playEvent(e, f) {
    const P = play;
    if (e.kind === 'dmg') { if (P.win) orig.dmg(...e.a); return; }   // 与えたダメージの数字は、あなたの画面にだけ出ていたもの
    if (e.kind === 'snd') {
      const a = e.a.slice();
      if (!P.win) {
        if (MINE.has(a[0])) return;
        if (typeof a[1] !== 'string' && (!a[1] || !a[1].isVector3)) a[1] = f.p.pos.clone().setY(f.p.pos.y + 1.2);   // あなたの出した音は、あなたの位置から
      }
      orig.snd(...a); return;
    }
    orig[e.kind](...e.a);
  }

  // 1コマ進んだときの出来事：効果・撃った瞬間・当たった瞬間・倒れた瞬間
  function onFrame(f, prev) {
    const P = play;
    for (const e of f.ev) playEvent(e, f);
    const povK = P.win ? 'p' : 'b', vicK = P.win ? 'b' : 'p';
    const vicA = P.win ? botActor : playerActor, vicFake = P.win ? P.fb : P.fp;
    const shooter = P.win ? player : bot;
    if (f[povK].fired) VM.fire(shooter.w, f[povK].ammo <= 0);
    if (prev && f[povK].reloading > 0 && !(prev[povK].reloading > 0)) VM.reload(shooter.w.reload);
    // やられた側が撃った：2丁持ちなら左右交互に跳ねる
    if (f[vicK].fired) { vicFake.flashT = 0.05; if (pip.left && act(vicFake, 'dual') && (pip.leftShot = !pip.leftShot)) pip.kickL = 1; else pip.kick = 1; }
    if (!prev) return;
    if (f[povK].ft > prev[povK].ft + 0.1) { VM.flareT = 0.75; VM.flareKick = 1; }   // 左手のフレアガンを構えて撃つ
    if (f[vicK].hp < prev[vicK].hp - 0.01) {
      vicA.wood.emissive.setRGB(0.6, 0.05, 0.02); vicA.flinch = (vicA.flinch || 0) + 0.3;
      P.hm = 0.22; $('kcHm').className = 'kc-hm';
      if (!P.win) orig.snd('hit');
    }
    if (f[povK].hp < prev[povK].hp - 0.01) P.hurt = 0.6;
    if (f[vicK].dead && !prev[vicK].dead) {
      vicA.dead = { a: 0, v: 2.2 };
      P.hm = 0.5; $('kcHm').className = 'kc-hm kill';
      if (!P.win) { orig.wood(new V3(vicFake.pos.x, vicFake.pos.y + player.eyeH, vicFake.pos.z), new V3(0, 1, 0), 30, 1.1); orig.snd('kill'); }
    }
  }

  function update(rdt) {
    const P = play;
    if (!P) return;
    // 決着の前後はスローに
    const slow = P.time > P.deathT - 0.6 && P.time < P.deathT + 0.5;
    const dt = rdt * (slow ? 0.3 : 1);
    P.time += dt;
    while (P.i < frames.length - 1 && frames[P.i + 1].t <= P.time) { P.i++; onFrame(frames[P.i], frames[P.i - 1]); }
    const f = frames[P.i];
    PHYS.restore(f.ph);
    Arrows.showGhosts(f.ar); Grenades.showGhosts(f.gr); Gadgets.restore(f.gd);
    apply(P.fp, f.p); apply(P.fb, f.b);
    P.fovK = damp(P.fovK, slow ? 0.82 : 1, 4, rdt);

    let bobX = 0, bobY = 0;
    if (P.win) {
      // 相手の駒を記録どおりに
      animateActor(botActor, P.fb, dt, null);
      botActor.root.rotation.y = f.b.rotY;
      if (P.fb.w.kind === 'sword') Sword.poseClone(botActor, P.fb);   // 刀の振り
      // カメラはあなたの目（記録したそのまま）
      const c = f.cam;
      cam.position.set(c[0], c[1], c[2]); cam.quaternion.set(c[3], c[4], c[5], c[6]);
      cam.fov = c[7] * P.fovK;
      [bobX, bobY] = f.p.bob;
    } else {
      // あなたの駒を記録どおりに
      const fwd = new V3(-Math.sin(f.p.yaw), 0, -Math.cos(f.p.yaw));
      animateActor(playerActor, P.fp, dt, P.fp.pos.clone().add(fwd));
      if (P.fp.w.kind === 'sword') Sword.poseClone(playerActor, P.fp);
      // カメラは相手の目。歩くと少し揺れる
      const b = P.fb, spd = Math.hypot(b.vel.x, b.vel.z), mk = b.onGround ? Math.min(1, spd / bot.def.speed) : 0;
      P.bobPhase += dt * spd * 1.35;
      bobY = Math.sin(P.bobPhase * 2) * 0.035 * mk; bobX = Math.cos(P.bobPhase) * 0.025 * mk;
      cam.position.set(b.pos.x, b.pos.y + bot.eyeH + bobY, b.pos.z);
      P.look.lerp(f.b.aim, 1 - Math.exp(-14 * dt));
      cam.lookAt(P.look);
      cam.fov = hipFov() * P.fovK;
    }
    cam.updateProjectionMatrix();
    // 小さい画面用：決めた側の駒も記録どおりに動かす（大きい画面では見えていない方）
    if (P.win) {
      const fwd = new V3(-Math.sin(f.p.yaw), 0, -Math.cos(f.p.yaw));
      animateActor(playerActor, P.fp, dt, P.fp.pos.clone().add(fwd));
      if (P.fp.w.kind === 'sword') Sword.poseClone(playerActor, P.fp);
    } else {
      animateActor(botActor, P.fb, dt, null);
      botActor.root.rotation.y = f.b.rotY;
      if (P.fb.w.kind === 'sword') Sword.poseClone(botActor, P.fb);
    }
    pipPose(f, dt);
    // 瞬で飛んでいる駒の残像・鉤縄の縄
    if ((P.ghostT -= dt) <= 0) { P.ghostT = 0.025; if (act(P.fb, 'blink')) afterimage(botActor.hitMesh); if (act(P.fp, 'blink')) afterimage(playerActor.hitMesh); }
    Gadgets.replayRopes([[player, P.fp, f.p.gt], [bot, P.fb, f.b.gt]]);
    sky.position.copy(cam.position);
    SFX.listener(cam);
    // 一人称の銃
    const me = P.win ? P.fp : P.fb;
    Sword.kcBlink = !!act(me, 'blink');   // 視点の駒が瞬なら集中線
    poseViewModel(me, dt, P.win ? f.p.sway[0] : 0, P.win ? f.p.sway[1] : 0, bobX, bobY);

    // 画面の表示
    P.hm -= rdt; P.hurt = Math.max(0, P.hurt - rdt * 2);
    const hm = $('kcHm');
    hm.style.opacity = P.hm > 0 ? '1' : '0';
    const hs = 8 + Math.max(0, P.hm) * 20;
    [...hm.children].forEach((c: any, i) => { c.style.transform = `rotate(${45 + i * 90}deg) translateY(${-hs}px)`; });
    $('kcHurt').style.opacity = P.hurt.toFixed(2);
    drawScope($('kcScope'), !!VM.scoped);
    ui.classList.toggle('scoped', !!VM.scoped);
    const pov = P.win ? f.p : f.b, tgt = P.win ? f.b : f.p;
    const povMax = (P.win ? player : bot).def.hp, tgtMax = (P.win ? bot : player).def.hp;
    $('kcHp0').style.transform = `scaleX(${Math.max(0, pov.hp / povMax).toFixed(3)})`;
    $('kcHp1').style.transform = `scaleX(${Math.max(0, tgt.hp / tgtMax).toFixed(3)})`;
    $('kcFlash').style.opacity = Math.min(1, pov.bl || 0).toFixed(2);   // フラッシュ・フレアの目くらみ

    Tracers.update(dt); Particles.update(dt); DmgNums.update(dt);
    if (P.time >= P.endT) finish();
  }

  // やられた側の目と銃（記録から）
  function pipPose(f, dt) {
    const P = play, c = pip.cam;
    if (P.win) {   // 相手の目：位置と狙っている所
      const b = P.fb, spd = Math.hypot(b.vel.x, b.vel.z), mk = b.onGround ? Math.min(1, spd / bot.def.speed) : 0;
      pip.bob += dt * spd * 1.35;
      c.position.set(b.pos.x, b.pos.y + bot.eyeH + Math.sin(pip.bob * 2) * 0.035 * mk, b.pos.z);
      pip.look.lerp(f.b.aim, 1 - Math.exp(-14 * dt));
      c.lookAt(pip.look);
    } else {       // あなたの目：記録したカメラそのまま
      const q = f.cam;
      c.position.set(q[0], q[1], q[2]); c.quaternion.set(q[3], q[4], q[5], q[6]);
    }
    c.aspect = pip.vmCam.aspect = innerWidth / innerHeight;
    c.fov = hipFov(); c.updateProjectionMatrix(); pip.vmCam.updateProjectionMatrix();
    // 銃：腰だめ（あなたなら覗き込みも）・撃つと跳ねる。倒れたら下げる
    const m = pip.m, ads = !P.win && !m.scope && m.ads ? f.p.adsT || 0 : 0, dead = (P.win ? f.b : f.p).dead;
    pip.kick = Math.max(0, pip.kick - dt * 9);
    const base = (m.hip || HIP).clone(); if (ads && m.ads) base.lerp(m.ads, ads);
    pip.root.position.set(base.x, base.y - (dead ? 0.4 : 0), base.z + pip.kick * 0.07);
    const ar = m.adsRot || [0, 0];
    pip.root.rotation.set(pip.kick * 0.22 + ar[0] * ads, ar[1] * ads, 0);
    // 2丁目（左右反対にした場面に置く）
    const du = !!pip.left && !!act(P.win ? P.fb : P.fp, 'dual') && !dead;
    pip.leftMirror.visible = du;
    pip.kickL = Math.max(0, pip.kickL - dt * 9);
    if (du) { pip.leftRoot.position.set(base.x, base.y, base.z + pip.kickL * 0.07); pip.leftRoot.rotation.set(pip.kickL * 0.22, 0, 0); }
  }
  // 大きい画面を描いたあとに呼ぶ（main.ts）：右下の四角にだけ描く。体力バーはそのすぐ上
  function renderPip() {
    const P = play;
    if (!P || !pip.m) return;
    const box = $('kcPip'), W = innerWidth, H = innerHeight, w = Math.round(W * 0.35), h = Math.round(H * 0.35);
    const x = W - w - 16, y = 16;
    Object.assign(box.style, { display: 'block', right: '16px', bottom: y + 'px', width: w + 'px', height: h + 'px' });
    (ui.querySelector('.kc-bars') as HTMLElement).style.bottom = (y + h + 8) + 'px';
    box.classList.toggle('dead', !!(P.win ? frames[P.i].b.dead : frames[P.i].p.dead));
    const vicA = P.win ? botActor : playerActor, shA = P.win ? playerActor : botActor;
    vicA.root.visible = false; shA.root.visible = true;
    const sk = sky.position.clone(); sky.position.copy(pip.cam.position);
    renderer.setScissorTest(true); renderer.setViewport(x, y, w, h); renderer.setScissor(x, y, w, h);
    renderer.clear();
    renderer.render(scene, pip.cam);
    renderer.clearDepth(); renderer.render(pip.scene, pip.vmCam);
    renderer.setScissorTest(false); renderer.setViewport(0, 0, W, H);
    sky.position.copy(sk);
    vicA.root.visible = true; shA.root.visible = false;
  }

  function finish() {
    if (!play) return;
    const done = play.onDone;
    PHYS.restore(frames[frames.length - 1].ph);
    Arrows.showGhosts([]); Arrows.setLiveVisible(true);
    Grenades.showGhosts([]); Grenades.setLiveVisible(true);
    Gadgets.restore(play.liveGadgets);
    // 銃と駒を元の状態へ（相手の銃は色だけに戻し、一人称の銃は自分のスキンに戻す）
    paintFoe(false); VM.applyLoadout();
    VM.setWeapon(player.w.model); VM.pist.anim?.update(0); VM.flashT = 0; VM.flash.visible = false; vmFlashLight.intensity = 0;
    playerActor.root.visible = false; playerActor.dead = null; playerActor.body.rotation.set(0, 0, 0);
    botActor.root.visible = true;
    botActor.dead = bot.dead ? { a: Math.PI / 2, v: 0 } : null;
    botActor.body.rotation.set(bot.dead ? -Math.PI / 2 : 0, 0, 0);
    ui.style.display = 'none'; $('kcPip').style.display = 'none'; $('kcFlash').style.opacity = '0';
    Sword.kcBlink = false;
    play = null;
    gs.state = 'end'; gs.mouseDown = false; gs.rightDown = false;
    done();
  }

  const isSkip = e => e.type === 'pointerdown' || e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape';
  const skip = e => {
    if (!play || !isSkip(e)) return;
    e.preventDefault();
    if (Net.on && !play.win && !play.again) return;   // 負けた側は、勝った相手がスキップするまで待つ（見直しは別）
    if (Net.on && !play.again) Net.send({ t: 'kcskip' });
    finish();
  };
  // 勝った相手がスキップした：こちらのリプレイも終わる（まだ始まっていなければ始めない）。自分で見直している分は止めない
  function foeSkip() { foeSkipped = true; if (play && !play.win && !play.again) finish(); }
  addEventListener('pointerdown', skip);
  addEventListener('keydown', skip);

  // 結果の画面から、もう一回見る（相手には何も送らない）
  function again(onDone) {
    if (!saved || play) return false;
    frames = saved.frames.slice();
    return start(saved.win, onDone, true);
  }

  return { clear, record, start, again, update, renderPip, finish, foeSkip, get playing() { return !!play; }, get canAgain() { return !!saved; } };
})();
