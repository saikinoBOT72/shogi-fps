// リプレイ：勝っても負けても、決着の直前を「決めた側」の一人称視点で再生する
// 勝ったとき＝あなたの視点（あなたの銃）、負けたとき＝相手の視点（相手の銃）
import { gs } from './state';
import { $, V3, damp } from './core';
import { SFX } from './audio';
import { cam, sky } from './render';
import { PHYS } from './physics';
import { DmgNums, Particles, Tracers, VM, vmFlashLight } from './effects';
import { Arrows } from './arrows';
import { Grenades, Smoke } from './grenades';
import { bot, botActor, player, playerActor, view } from './game';
import { animateActor, kickOf, poseViewModel } from './camera';

export const Replay = (() => {
  const KEEP = 7, BEFORE = 4, AFTER = 1.4;   // 覚えておく秒数・決着の何秒前から・何秒後まで
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
  for (const k of ['impact', 'wood', 'dust', 'explosion', 'glow', 'trail']) hook(Particles, k, k);
  // あなたにだけ聞こえていた音（相手の視点では鳴らさない）
  const MINE = new Set(['hit', 'head', 'kill', 'hurt', 'reloadStart', 'reloadEnd', 'empty', 'ram', 'heal', 'pierce', 'bowReady', 'bowDraw', 'ding', 'beep']);

  const ui = document.createElement('div');
  ui.id = 'killcam';
  ui.innerHTML = `<div id="kcScope"></div><div id="kcHurt"></div>
    <div class="kc-xh"></div><div class="kc-hm" id="kcHm"><i></i><i></i><i></i><i></i></div>
    <div class="kc-top"><b id="kcTitle"></b><span id="kcWho"></span></div>
    <div class="kc-bars"><div class="kc-bar"><span id="kcName0"></span><i><b id="kcHp0"></b></i></div><div class="kc-bar foe"><span id="kcName1"></span><i><b id="kcHp1"></b></i></div></div>
    <div class="kc-skip">クリックでスキップ</div>`;
  document.body.appendChild(ui);

  function clear() { frames = []; events = []; t = 0; }

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
        skillT: p.skillT, cd: p.cd, draw: p.draw, adsT: p.adsT || 0, reloading: p.reloading,
        fired: p.cd > lastPcd + 1e-4, sway: [VM.sway.x, VM.sway.y], bob: [view.bobX || 0, view.bobY || 0],
      },
      b: {
        pos: b.pos.clone(), vel: b.vel.clone(), rotY: botActor.root.rotation.y, aim: (b.aimPt || p.pos).clone(), onGround: b.onGround, dead: b.dead, hp: b.hp,
        skillT: b.skillT, cd: b.cd, draw: b.draw, reloading: b.reloading, fired: b.cd > lastBcd + 1e-4,
      },
      ph: PHYS.snapshot(), ar: Arrows.snapshot(), gr: Grenades.snapshot(), sm: Smoke.snapshot(),
      ev: events,
    });
    lastPcd = p.cd; lastBcd = b.cd;
    events = [];
    while (frames.length && frames[0].t < t - KEEP) frames.shift();
  }

  // 記録から動かす、見た目だけの駒
  const fakeOf = e => ({ pos: new V3(), vel: new V3(), vy: 0, onGround: true, def: e.def, w: e.w, skill: e.skill, skillT: 0, stepPhase: 0, flashT: 0, isBot: false, draw: 0, cd: 0, adsT: 0, reloading: 0, dead: false });
  function apply(fk, r) {
    fk.pos.copy(r.pos); fk.vel.copy(r.vel); fk.onGround = r.onGround; fk.skillT = r.skillT;
    fk.cd = r.cd; fk.draw = r.draw || 0; fk.reloading = r.reloading; fk.adsT = r.adsT || 0; fk.dead = r.dead;
  }

  // win: true = あなたが倒した（あなたの視点）、false = 倒された（相手の視点）
  function start(win, onDone) {
    const victim = win ? 'b' : 'p';
    const death = frames.find(f => f[victim].dead);
    if (!death || frames.length < 20) return false;
    const t0 = Math.max(frames[0].t, death.t - BEFORE);
    const i = Math.max(0, frames.findIndex(f => f.t >= t0));
    const shooter = win ? player : bot, target = win ? bot : player;
    play = {
      i, win, time: frames[i].t, deathT: death.t, endT: Math.min(frames[frames.length - 1].t, death.t + AFTER), onDone,
      look: frames[i].b.aim.clone(), fp: fakeOf(player), fb: fakeOf(bot), bobPhase: 0, hm: 0, hurt: 0, fovK: 1,
    };
    gs.state = 'killcam'; gs.mouseDown = false; gs.rightDown = false;
    // 決めた側の銃を持つ
    VM.setWeapon(shooter.w.model);
    Object.assign(VM, { kick: 0, slideT: 0, flashT: 0, dip: 0, equip: 0, dash: 0, guard: 0 }); VM.sway.set(0, 0, 0);
    playerActor.root.visible = !win; botActor.root.visible = win;
    for (const A of [playerActor, botActor]) { A.dead = null; A.body.rotation.set(0, 0, 0); A.body.position.y = 0; A.xray.visible = false; }
    Arrows.setLiveVisible(false); Grenades.setLiveVisible(false);
    $('hud').style.display = 'none';
    ui.classList.toggle('win', win);
    $('kcTitle').textContent = win ? 'REPLAY' : 'KILLCAM';
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
        if (!a[1] || !a[1].isVector3) a[1] = f.p.pos.clone().setY(f.p.pos.y + 1.2);   // あなたの出した音は、あなたの位置から
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
    if (f[povK].fired) { VM.kick = kickOf(shooter.w); VM.slideT = 1; if (shooter.w.kind !== 'bow') VM.flashT = 0.05; }
    if (f[vicK].fired) vicFake.flashT = 0.05;
    if (!prev) return;
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
    Arrows.showGhosts(f.ar); Grenades.showGhosts(f.gr); Smoke.restore(f.sm);
    apply(P.fp, f.p); apply(P.fb, f.b);
    P.fovK = damp(P.fovK, slow ? 0.82 : 1, 4, rdt);

    let bobX = 0, bobY = 0;
    if (P.win) {
      // 相手の駒を記録どおりに
      animateActor(botActor, P.fb, dt, null);
      botActor.root.rotation.y = f.b.rotY;
      // カメラはあなたの目（記録したそのまま）
      const c = f.cam;
      cam.position.set(c[0], c[1], c[2]); cam.quaternion.set(c[3], c[4], c[5], c[6]);
      cam.fov = c[7] * P.fovK;
      [bobX, bobY] = f.p.bob;
    } else {
      // あなたの駒を記録どおりに
      const fwd = new V3(-Math.sin(f.p.yaw), 0, -Math.cos(f.p.yaw));
      animateActor(playerActor, P.fp, dt, P.fp.pos.clone().add(fwd));
      // カメラは相手の目。歩くと少し揺れる
      const b = P.fb, spd = Math.hypot(b.vel.x, b.vel.z), mk = b.onGround ? Math.min(1, spd / bot.def.speed) : 0;
      P.bobPhase += dt * spd * 1.35;
      bobY = Math.sin(P.bobPhase * 2) * 0.035 * mk; bobX = Math.cos(P.bobPhase) * 0.025 * mk;
      cam.position.set(b.pos.x, b.pos.y + bot.eyeH + bobY, b.pos.z);
      P.look.lerp(f.b.aim, 1 - Math.exp(-14 * dt));
      cam.lookAt(P.look);
      cam.fov = 80 * P.fovK;
    }
    cam.updateProjectionMatrix();
    sky.position.copy(cam.position);
    SFX.listener(cam);
    // 一人称の銃
    const me = P.win ? P.fp : P.fb;
    poseViewModel(me, dt, P.win ? f.p.sway[0] : 0, P.win ? f.p.sway[1] : 0, bobX, bobY);

    // 画面の表示
    P.hm -= rdt; P.hurt = Math.max(0, P.hurt - rdt * 2);
    const hm = $('kcHm');
    hm.style.opacity = P.hm > 0 ? '1' : '0';
    const hs = 8 + Math.max(0, P.hm) * 20;
    [...hm.children].forEach((c: any, i) => { c.style.transform = `rotate(${45 + i * 90}deg) translateY(${-hs}px)`; });
    $('kcHurt').style.opacity = P.hurt.toFixed(2);
    $('kcScope').style.display = VM.scoped ? 'block' : 'none';
    ui.classList.toggle('scoped', !!VM.scoped);
    const pov = P.win ? f.p : f.b, tgt = P.win ? f.b : f.p;
    const povMax = (P.win ? player : bot).def.hp, tgtMax = (P.win ? bot : player).def.hp;
    $('kcHp0').style.transform = `scaleX(${Math.max(0, pov.hp / povMax).toFixed(3)})`;
    $('kcHp1').style.transform = `scaleX(${Math.max(0, tgt.hp / tgtMax).toFixed(3)})`;

    Tracers.update(dt); Particles.update(dt); DmgNums.update(dt);
    if (P.time >= P.endT) finish();
  }

  function finish() {
    if (!play) return;
    const done = play.onDone;
    PHYS.restore(frames[frames.length - 1].ph);
    Arrows.showGhosts([]); Arrows.setLiveVisible(true);
    Grenades.showGhosts([]); Grenades.setLiveVisible(true);
    Smoke.restore(null);
    // 銃と駒を元の状態へ
    VM.setWeapon(player.w.model); VM.flashT = 0; VM.flash.visible = false; vmFlashLight.intensity = 0;
    playerActor.root.visible = false; playerActor.dead = null; playerActor.body.rotation.set(0, 0, 0);
    botActor.root.visible = true;
    botActor.dead = bot.dead ? { a: Math.PI / 2, v: 0 } : null;
    botActor.body.rotation.set(bot.dead ? -Math.PI / 2 : 0, 0, 0);
    ui.style.display = 'none';
    play = null;
    gs.state = 'end'; gs.mouseDown = false; gs.rightDown = false;
    done();
  }

  const isSkip = e => e.type === 'mousedown' || e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape';
  const skip = e => { if (play && isSkip(e)) { e.preventDefault(); finish(); } };
  addEventListener('mousedown', skip);
  addEventListener('keydown', skip);

  return { clear, record, start, update, finish, get playing() { return !!play; } };
})();
