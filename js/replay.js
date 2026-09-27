// キルカム：倒されたとき、直前の数秒を相手の視点で再生する
'use strict';

const Replay = (() => {
  const KEEP = 6;                         // 覚えておく秒数
  const PLAYER_TRACER = 0xffe9a8;
  let frames = [], events = [], t = 0, play = null;

  // 弾の光跡を記録（再生中は記録しない）
  const addTracer = Tracers.add;
  Tracers.add = (a, b, color) => { addTracer(a, b, color); if (!play) events.push({ a: a.clone(), b: b.clone(), color }); };

  const ui = document.createElement('div');
  ui.id = 'killcam';
  ui.innerHTML = '<div class="kc-top"><b>KILLCAM</b><span id="kcWho"></span></div><div class="kc-skip">クリックでスキップ</div>';
  document.body.appendChild(ui);

  function clear() { frames = []; events = []; t = 0; }

  function record(dt) {
    t += dt;
    frames.push({
      t,
      p: { pos: player.pos.clone(), vel: player.vel.clone(), yaw: view.yaw, onGround: player.onGround, dead: player.dead, skillT: player.skillT },
      b: { pos: bot.pos.clone(), aim: (bot.aimPt || player.pos).clone() },
      ph: PHYS.snapshot(),
      ev: events,
    });
    events = [];
    while (frames.length && frames[0].t < t - KEEP) frames.shift();
  }

  function start(onDone) {
    const death = frames.find(f => f.p.dead);
    if (!death || frames.length < 20) return false;
    const t0 = Math.max(frames[0].t, death.t - 3.5);
    const i = Math.max(0, frames.findIndex(f => f.t >= t0));
    play = {
      i, time: frames[i].t, deathT: death.t, endT: Math.min(frames[frames.length - 1].t, death.t + 1.4), onDone,
      look: frames[i].b.aim.clone(),
      fake: { pos: new V3(), vel: new V3(), vy: 0, onGround: true, def: player.def, skillT: 0, stepPhase: 0, flashT: 0, isBot: false },
    };
    state = 'killcam';
    playerActor.root.visible = true; playerActor.dead = null; playerActor.body.rotation.set(0, 0, 0);
    botActor.root.visible = false;
    $('hud').style.display = 'none';
    $('kcWho').textContent = `相手（${bot.def.name}）の視点`;
    ui.style.display = 'block';
    return true;
  }

  function update(rdt) {
    const P = play;
    if (!P) return;
    // 倒される瞬間の前後はスローに
    const slow = P.time > P.deathT - 0.7 && P.time < P.deathT + 0.5;
    const dt = rdt * (slow ? 0.3 : 1);
    P.time += dt;
    while (P.i < frames.length - 1 && frames[P.i + 1].t <= P.time) {
      P.i++;
      for (const e of frames[P.i].ev) { addTracer(e.a, e.b, e.color); if (e.color === PLAYER_TRACER) P.fake.flashT = 0.05; }
    }
    const f = frames[P.i];
    PHYS.restore(f.ph);

    // あなたの駒を記録どおりに動かす
    const fk = P.fake;
    fk.pos.copy(f.p.pos); fk.vel.copy(f.p.vel); fk.onGround = f.p.onGround; fk.skillT = f.p.skillT;
    if (f.p.dead && !playerActor.dead) { playerActor.dead = { a: 0, v: 2.2 }; Particles.wood(new V3(fk.pos.x, fk.pos.y + player.eyeH, fk.pos.z), new V3(0, 1, 0), 30, 1.1); }
    const fwd = new V3(-Math.sin(f.p.yaw), 0, -Math.cos(f.p.yaw));
    animateActor(playerActor, fk, dt, fk.pos.clone().add(fwd));

    // カメラは相手の目
    cam.position.set(f.b.pos.x, f.b.pos.y + bot.eyeH, f.b.pos.z);
    P.look.lerp(f.b.aim, 1 - Math.exp(-14 * dt));
    cam.lookAt(P.look);
    cam.fov = damp(cam.fov, slow ? 55 : 70, 4, rdt); cam.updateProjectionMatrix();
    sky.position.copy(cam.position);
    SFX.listener(cam);
    Tracers.update(dt); Particles.update(dt);
    if (P.time >= P.endT) finish();
  }

  function finish() {
    if (!play) return;
    const done = play.onDone;
    PHYS.restore(frames[frames.length - 1].ph);
    playerActor.root.visible = false; playerActor.dead = null; playerActor.body.rotation.set(0, 0, 0);
    botActor.root.visible = true;
    ui.style.display = 'none';
    play = null;
    state = 'end';
    done();
  }

  const skip = e => { if (play && P_ok(e)) { e.preventDefault(); finish(); } };
  const P_ok = e => e.type === 'mousedown' || e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape';
  addEventListener('mousedown', skip);
  addEventListener('keydown', skip);

  return { clear, record, start, update, finish, get playing() { return !!play; } };
})();
