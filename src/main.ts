// メインループ
import './style.css';
import './core';
import './tune';
import './audio';
import './render';
import './world';
import './nav';
import './physics';
import './effects';
import './arrows';
import './grenades';
import './input';
import './game';
import './ai';
import './hud';
import './camera';
import './replay';
import './screens';
import './boardmode';
import { gs } from './state';
import { $, Q, TIME_LIMIT, V3, clamp, settings } from './core';
import { SFX } from './audio';
import { SUN_DIR, cam, renderer, scene, sky, sun } from './render';
import { clouds } from './world';
import { PHYS } from './physics';
import { DmgNums, Particles, Tracers, vmCam, vmScene } from './effects';
import { Arrows } from './arrows';
import { Grenades, Smoke } from './grenades';
import { bot, botActor, damageBot, eyeOf, player, playerActor, resetMatch, separate, stats, updatePlayer } from './game';
import { checkRam, damagePlayer, updateBot } from './ai';
import { endMatch, showCenter, updateHUD } from './hud';
import { animateActor, updateCamera } from './camera';
import { Replay } from './replay';
import { showTitle } from './screens';
import { BoardMode } from './boardmode';

// ================= メインループ =================
export let last = performance.now(), titleT = 0, lastBeep = -1;
export function loop(now) {
  requestAnimationFrame(loop);
  const rdt = clamp((now - last) / 1000, 0, 0.05); last = now;   // 時計が戻っても壊れないよう 0 未満にしない
  if (gs.slowmoT > 0) { gs.slowmoT -= rdt; if (gs.slowmoT <= 0) gs.timeScale = 1; }
  const dt = rdt * gs.timeScale;
  perfTick(rdt);
  // 影の範囲をプレイヤーの周りに（広いマップでも影をくっきり）
  const sc = gs.state === 'title' || !player ? new V3() : player.pos;
  sun.target.position.set(sc.x, 0, sc.z); sun.position.copy(sun.target.position).addScaledVector(SUN_DIR, 60);
  gs.sndBudget = 4;

  clouds.forEach(c => { c.position.x += dt * 2; if (c.position.x > 450) c.position.x = -450; });

  // 将棋モードの盤面
  if (gs.state === 'board') {
    BoardMode.update(rdt);
    renderer.clear(); renderer.render(BoardMode.scene, BoardMode.cam);
    return;
  }

  if (gs.state === 'title') {
    titleT += rdt;
    const a = titleT * 0.07;
    cam.position.set(Math.sin(a) * 62, 26 + Math.sin(titleT * 0.3) * 3, Math.cos(a) * 62);
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
  if (gs.state === 'killcam') {
    Replay.update(rdt);
    DmgNums.update(0);
    render(false);
    return;
  }

  if (!gs.paused) {
    gs.stateT += rdt;
    if (gs.state === 'countdown') {
      const n = 3 - Math.floor(gs.stateT);
      if (n !== lastBeep && n >= 1 && n <= 3) { lastBeep = n; showCenter(n); SFX.play('beep', false); }
      if (gs.stateT >= 3) { gs.state = 'fight'; lastBeep = -1; showCenter('FIGHT!', '#ffd23a'); SFX.play('beep', true); setTimeout(() => { if ($('center').textContent === 'FIGHT!') $('center').textContent = ''; }, 900); }
    }
    if (gs.state === 'fight') stats.time += dt;
    updatePlayer(dt);
    updateBot(dt);
    separate(player, bot);
    if (gs.state === 'fight') {
      checkRam(player, bot, dmg => damageBot({ dmg, head: false, point: eyeOf(bot) }));
      checkRam(bot, player, dmg => damagePlayer(dmg, bot.pos));
      if (stats.time >= TIME_LIMIT) endMatch(null);
    }
  }
  const pdt = gs.paused ? 0 : dt;
  animateActor(botActor, bot, pdt, bot.dead ? null : bot.aimPt || player.pos);
  PHYS.step(pdt, [['player', player], ['bot', bot]]);
  if (!gs.paused) { Arrows.update(dt); Grenades.update(dt); Smoke.update(dt); }
  if (!gs.paused && (gs.state === 'fight' || gs.state === 'end')) Replay.record(dt);
  Particles.update(pdt); Tracers.update(pdt); DmgNums.update(pdt);
  if (!gs.paused) updateCamera(dt, rdt); else { gs.mdx = gs.mdy = 0; }
  updateHUD(rdt);
  render(!player.dead);
}
// FPS計測と、重いときに自動で解像度を下げる仕組み（画質設定の倍率の 0.55 倍まで）
export const perf = { t: 0, n: 0, low: 0, high: 0 };
export function perfTick(rdt) {
  perf.t += rdt; perf.n++;
  if (perf.t < 0.5) return;
  const fps = perf.n / perf.t;
  perf.t = 0; perf.n = 0;
  if (settings.showFps) $("fps").textContent = `${Math.round(fps)} FPS  x${(Q.pr * gs.resScale).toFixed(2)}`;
  if (document.hidden) return;
  // 2回続けて 50FPS 未満なら解像度を下げ、しばらく 58FPS 以上なら少し戻す
  perf.low = fps < 50 ? perf.low + 1 : 0;
  perf.high = fps > 58 ? perf.high + 1 : 0;
  let next = gs.resScale;
  if (perf.low >= 2 && gs.resScale > 0.55) { next = Math.max(0.55, gs.resScale - 0.1); perf.low = 0; }
  else if (perf.high >= 6 && gs.resScale < 1) { next = Math.min(1, gs.resScale + 0.05); perf.high = 0; }
  if (next !== gs.resScale) { gs.resScale = next; renderer.setPixelRatio(Q.pr * gs.resScale); renderer.setSize(innerWidth, innerHeight); }
}
export function render(withGun?) {
  renderer.clear();
  renderer.render(scene, cam);
  if (withGun && gs.state !== 'title') { renderer.clearDepth(); renderer.render(vmScene, vmCam); }
}

resetMatch();
showTitle();
requestAnimationFrame(loop);

// 開発中だけ：ブラウザのコンソールから中身を確かめられるように（配布用には入らない）
if (import.meta.env.DEV) {
  Promise.all([
    import('./core'), import('./game'), import('./ai'), import('./hud'), import('./screens'), import('./input'), import('./boardmode'),
    import('./physics'), import('./effects'), import('./world'), import('./nav'), import('./camera'), import('./grenades'), import('./arrows'),
    import('./render'), import('./replay'), import('./state'),
  ]).then(([core, game, ai, hud, screens, input, boardmode, physics, effects, world, nav, camera, grenades, arrows, render, replay, state]) => {
    (window as any).dev = {
      core, game, ai, hud, screens, input, boardmode, physics, effects, world, nav, camera, grenades, arrows, render, replay, gs: state.gs,
      // 画面が非表示でも、テストからゲームを n フレーム進められるように
      step(n: number, each?: (i: number) => void) { for (let i = 0; i < n; i++) { loop(last + 1000 / 60); if (each) each(i); } },
    };
  });
}
