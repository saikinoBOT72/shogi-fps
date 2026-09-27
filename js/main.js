// メインループ
'use strict';

// ================= メインループ =================
let last = performance.now(), titleT = 0, lastBeep = -1;
function loop(now) {
  requestAnimationFrame(loop);
  const rdt = Math.min(0.05, (now - last) / 1000); last = now;
  if (slowmoT > 0) { slowmoT -= rdt; if (slowmoT <= 0) timeScale = 1; }
  const dt = rdt * timeScale;
  perfTick(rdt);
  sndBudget = 4;

  clouds.forEach(c => { c.position.x += dt * 2; if (c.position.x > 450) c.position.x = -450; });

  if (state === 'title') {
    titleT += rdt;
    const a = titleT * 0.07;
    cam.position.set(Math.sin(a) * 36, 13 + Math.sin(titleT * 0.3) * 2, Math.cos(a) * 36);
    cam.lookAt(0, 1.5, 0);
    cam.fov = 60; cam.updateProjectionMatrix();
    sky.position.copy(cam.position);
    if (!player) resetMatch();
    playerActor.root.visible = true;
    const idle = e => { e.vel.set(0, 0, 0); };
    idle(player); idle(bot);
    animateActor(playerActor, player, rdt, bot.pos);
    animateActor(botActor, bot, rdt, player.pos);
    playerActor.body.position.y = Math.abs(Math.sin(titleT * 3)) * 0.1;
    botActor.body.position.y = Math.abs(Math.sin(titleT * 3 + 1.5)) * 0.1;
    render(false);
    return;
  }

  // キルカム再生中
  if (state === 'killcam') {
    Replay.update(rdt);
    DmgNums.update(0);
    render(false);
    return;
  }

  if (!paused) {
    stateT += rdt;
    if (state === 'countdown') {
      const n = 3 - Math.floor(stateT);
      if (n !== lastBeep && n >= 1 && n <= 3) { lastBeep = n; showCenter(n); SFX.play('beep', false); }
      if (stateT >= 3) { state = 'fight'; lastBeep = -1; showCenter('FIGHT!', '#ffd23a'); SFX.play('beep', true); setTimeout(() => { if ($('center').textContent === 'FIGHT!') $('center').textContent = ''; }, 900); }
    }
    if (state === 'fight') stats.time += dt;
    updatePlayer(dt);
    updateBot(dt);
    separate(player, bot);
    if (state === 'fight') {
      checkRam(player, bot, dmg => damageBot({ dmg, head: false, point: eyeOf(bot) }));
      checkRam(bot, player, dmg => damagePlayer(dmg, bot.pos));
      if (stats.time >= TIME_LIMIT) endMatch(null);
    }
  }
  const pdt = paused ? 0 : dt;
  animateActor(botActor, bot, pdt, bot.dead ? null : bot.aimPt || player.pos);
  PHYS.step(pdt, [['player', player], ['bot', bot]]);
  if (!paused && (state === 'fight' || state === 'end')) Replay.record(dt);
  Particles.update(pdt); Tracers.update(pdt); DmgNums.update(pdt);
  if (!paused) updateCamera(dt, rdt); else { mdx = mdy = 0; }
  updateHUD(rdt);
  render(!player.dead);
}
// FPS計測と、重いときに自動で解像度を下げる仕組み（画質設定の倍率の 0.55 倍まで）
const perf = { t: 0, n: 0, low: 0, high: 0 };
function perfTick(rdt) {
  perf.t += rdt; perf.n++;
  if (perf.t < 0.5) return;
  const fps = perf.n / perf.t;
  perf.t = 0; perf.n = 0;
  if (settings.showFps) $("fps").textContent = `${Math.round(fps)} FPS  x${(Q.pr * resScale).toFixed(2)}`;
  if (document.hidden) return;
  // 2回続けて 50FPS 未満なら解像度を下げ、しばらく 58FPS 以上なら少し戻す
  perf.low = fps < 50 ? perf.low + 1 : 0;
  perf.high = fps > 58 ? perf.high + 1 : 0;
  let next = resScale;
  if (perf.low >= 2 && resScale > 0.55) { next = Math.max(0.55, resScale - 0.1); perf.low = 0; }
  else if (perf.high >= 6 && resScale < 1) { next = Math.min(1, resScale + 0.05); perf.high = 0; }
  if (next !== resScale) { resScale = next; renderer.setPixelRatio(Q.pr * resScale); renderer.setSize(innerWidth, innerHeight); }
}
function render(withGun) {
  renderer.clear();
  renderer.render(scene, cam);
  if (withGun && state !== 'title') { renderer.clearDepth(); renderer.render(vmScene, vmCam); }
}

resetMatch();
showTitle();
requestAnimationFrame(loop);
