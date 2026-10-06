import { initAccount } from './account';
// メインループ
import { Gadgets } from './gadgets';
import { P } from './palette';
import './style.css';
import { applyCssPalette } from './palette';
applyCssPalette();   // 画面（CSS）でもパレットの色を使う
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
import { updateVsCut } from './vscut';
import { $, Q, TIME_LIMIT, V3, clamp, settings } from './core';
import { SFX } from './audio';
import { SUN_DIR, cam, renderer, scene, sky, sun } from './render';
import { LV, clouds, mapId } from './world';
import { PHYS } from './physics';
import { DmgNums, Particles, Tracers, vmCam, vmScene } from './effects';
import { Arrows } from './arrows';
import { Grenades, Smoke } from './grenades';
import { bot, botActor, damageBot, eyeOf, player, playerActor, resetMatch, separate, stats, updatePlayer } from './game';
import { checkRam, damagePlayer, updateBot } from './ai';
import { endMatch, killBot, killPlayer, showCenter, updateHUD } from './hud';
import { animateActor, updateCamera } from './camera';
import { Replay } from './replay';
import { showTitle } from './screens';
import { BoardMode } from './boardmode';
import { Net } from './net';
import { Online } from './online';
import { Weather } from './weather';
import { updateYashiki } from './maps/yashiki';
import { aiHear } from './ai';
import { Sword } from './sword';
import { Clones } from './clones';

// ================= メインループ =================
export let last = performance.now(), titleT = 0, lastBeep = -1;
export function loop(now) {
  requestAnimationFrame(loop);
  const rdt = clamp((now - last) / 1000, 0, 0.05); last = now;   // 時計が戻っても壊れないよう 0 未満にしない
  if (gs.slowmoT > 0) { gs.slowmoT -= rdt; if (gs.slowmoT <= 0) gs.timeScale = 1; }
  const dt = rdt * Math.min(gs.timeScale, Sword.slowTick(rdt));   // 刀で斬ったときの白黒スローも
  Sword.frame(rdt);
  perfTick(rdt);
  // 影の範囲をプレイヤーの周りに（広いマップでも影をくっきり）
  const sc = gs.state === 'title' || !player ? new V3() : player.pos;
  // 高い所（屋上・浮島）でも影の範囲に入るよう、高さも合わせる
  sun.target.position.set(sc.x, sc.y, sc.z); sun.position.copy(sun.target.position).addScaledVector(SUN_DIR, 60);
  gs.sndBudget = 4;
  SFX.ambience(gs.state === 'board' ? null : mapId);   // 環境音（盤面では流さない）
  Weather.update(rdt, gs.paused && !Net.on ? 0 : dt, gs.state !== 'board');   // 雪の温泉街の雪・湯けむり・足跡

  updateVsCut();
  clouds.forEach(c => { c.position.x += dt * 2; if (c.position.x > 450) c.position.x = -450; });

  // 将棋モードの盤面
  if (gs.state === 'board') {
    BoardMode.update(rdt);
    renderer.shadowMap.needsUpdate = true;   // 盤面は別の描画経路なので、ここで影を更新する
    renderer.clear(); renderer.render(BoardMode.scene, BoardMode.cam);
    return;
  }

  if (gs.state === 'title') {
    titleT += rdt;
    const a = titleT * 0.07;
    cam.position.set(Math.sin(a) * 95, 42 + Math.sin(titleT * 0.3) * 3, Math.cos(a) * 95);
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
    render(true);   // 決めた側の銃も描く
    return;
  }

  // オンライン対戦はメニューを開いても止まらない
  const run = !gs.paused || Net.on;
  if (run) {
    gs.stateT += rdt;
    if (gs.state === 'countdown') {
      const n = 3 - Math.floor(gs.stateT);
      if (n !== lastBeep && n >= 1 && n <= 3) { lastBeep = n; showCenter(n); SFX.play('count'); }
      if (gs.stateT >= 3) { gs.state = 'fight'; lastBeep = -1; showCenter('FIGHT!', 'var(--accent-hi)'); SFX.play('fight'); setTimeout(() => { if ($('center').textContent === 'FIGHT!') $('center').textContent = ''; }, 900); }
    }
    if (gs.state === 'fight') stats.time += dt;
    updatePlayer(dt);
    if (Net.on) { Online.tick(dt); Online.updateRemote(dt); } else updateBot(dt);
    separate(player, bot);
    // 忍びの屋敷：回転扉（押し付けると半回転して運ばれる。向きはそのままなので、出たら部屋の中を向いている）
    if (mapId === 'yashiki') updateYashiki(dt, [[player, true], [bot, !Net.on]], { turn: () => {}, start: p => { SFX.play('donden', p); aiHear(p, 25); } });
    // 浮島のマップ：島から落ちて LV.KILL より下へ行ったら負け（オンラインの相手は、相手の画面で判定して届く）
    if (LV.KILL !== undefined && gs.state === 'fight') {
      if (!player.dead && player.pos.y < LV.KILL) { player.hp = 0; killPlayer(); }
      if (!Net.on && !bot.dead && bot.pos.y < LV.KILL) { bot.hp = 0; killBot(); }
    }
    if (gs.state === 'fight') {
      checkRam(player, bot, dmg => damageBot({ dmg, head: false, point: eyeOf(bot), kv: [bot.vel.x, bot.vy, bot.vel.z] }));
      if (!Net.on) checkRam(bot, player, dmg => damagePlayer(dmg, bot.pos));
    }
  }
  const pdt = run ? dt : 0;
  animateActor(botActor, bot, pdt, bot.dead ? null : bot.aimPt || player.pos);
 
  PHYS.step(pdt, [['player', player], ['bot', bot]]);
  if (run) { Arrows.update(dt); Grenades.update(dt); Smoke.update(dt); Gadgets.update(dt); Sword.update(dt); Clones.update(dt); }
 
  if (run && (gs.state === 'fight' || gs.state === 'end')) Replay.record(dt);
 
  Particles.update(pdt); Tracers.update(pdt); DmgNums.update(pdt);
  if (run) updateCamera(dt, rdt);
  if (gs.paused) gs.mdx = gs.mdy = 0;
 
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
  // 設定で「自動で解像度を下げる」を OFF にしているときは、いつも画質設定のままの解像度
  if (!settings.autoRes) {
    perf.low = perf.high = 0;
    if (gs.resScale !== 1) { gs.resScale = 1; renderer.setPixelRatio(Q.pr); renderer.setSize(innerWidth, innerHeight); }
    return;
  }
  // 2回続けて 50FPS 未満なら解像度を下げ、しばらく 58FPS 以上なら少し戻す
  // 解像度を変えると一瞬止まるので、ゆっくり判断する（1.5秒続けて重いなら下げ、10秒余裕が続いたら戻す）
  perf.low = fps < 45 ? perf.low + 1 : 0;
  perf.high = fps > 58 ? perf.high + 1 : 0;
  let next = gs.resScale;
  if (perf.low >= 3 && gs.resScale > 0.55) { next = Math.max(0.55, gs.resScale - 0.1); perf.low = 0; }
  else if (perf.high >= 20 && gs.resScale < 1) { next = Math.min(1, gs.resScale + 0.05); perf.high = 0; }
  if (next !== gs.resScale) { gs.resScale = next; renderer.setPixelRatio(Q.pr * gs.resScale); renderer.setSize(innerWidth, innerHeight); }
}
let frameNo = 0;
export function render(withGun?) {
  // 影は画質「中」なら 3 フレームに1回だけ描き直す（動きはほぼ変わらず、影の計算が 1/3）
  frameNo++;
  renderer.shadowMap.autoUpdate = false;
  if (!Q.shadowEvery || frameNo % Q.shadowEvery === 0) renderer.shadowMap.needsUpdate = true;
  renderer.clear();
  if (gs.menu3d) return;   // ガチャ・持ち物の画面が全面に出ている間は、後ろのゲームの画面を描かない
  renderer.render(scene, cam);
  if (withGun && gs.state !== 'title') { renderer.clearDepth(); renderer.render(vmScene, vmCam); }
}

// 読み込み時に、あとで初めて表示される物の描画の準備（シェーダーの作成とテクスチャの転送）を済ませておく。
// 初めて撃った・爆発した・盾を構えた瞬間などに一瞬固まるのを防ぐ
function warmUp() {
  const extra = [...Arrows.samples(), ...Grenades.samples(), ...Smoke.samples(), ...Gadgets.samples()];
  extra.forEach(o => scene.add(o));
  // 隠れている物も表示し、画面外の物も省かずに描く（Windows の Chrome は「実際に初めて描いた瞬間」にシェーダーの変換をするため）
  const flipped: any[] = [], culled: any[] = [];
  for (const root of [scene, vmScene, BoardMode.scene]) root.traverse((o: any) => {
    if (!o.visible) { o.visible = true; flipped.push(o); }
    if (o.frustumCulled) { o.frustumCulled = false; culled.push(o); }
  });
  const textures = new Set<any>();
  for (const root of [scene, vmScene, BoardMode.scene]) root.traverse((o: any) => {
    const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    ms.forEach(m => ['map', 'gradientMap'].forEach(k => m[k] && textures.add(m[k])));
  });
  textures.forEach(t => renderer.initTexture(t));
  renderer.compile(scene, cam); renderer.compile(vmScene, vmCam); renderer.compile(BoardMode.scene, BoardMode.cam);
  renderer.shadowMap.needsUpdate = true; renderer.render(scene, cam);
  renderer.render(vmScene, vmCam);
  renderer.shadowMap.needsUpdate = true; renderer.render(BoardMode.scene, BoardMode.cam);
  flipped.forEach(o => { o.visible = false; });
  culled.forEach(o => { o.frustumCulled = true; });
  extra.forEach(o => scene.remove(o));
  // 物理と演出の計算も一度通しておく（初めて爆発・崩れたときの処理が一番重いため）。終わったら元に戻す
  for (const [x, z] of [[-16, -14], [16, 14], [9, -4], [-9, 4], [4, -18.5], [-4, 18.5]]) PHYS.blast(new V3(x, 0.5, z), 5, 10);
  for (let i = 0; i < 90; i++) PHYS.step(1 / 60, []);
  PHYS.reset();
  Particles.explosion(new V3(0, 1, 0)); Particles.wood(new V3(0, 1, 0), new V3(0, 1, 0), 10); DmgNums.add(new V3(0, 1, 0), 10, false);
  for (let i = 0; i < 60; i++) { Particles.update(1 / 60); DmgNums.update(1 / 60); Tracers.update(1 / 60); }
}

resetMatch();
warmUp();
initAccount();
showTitle();
requestAnimationFrame(loop);

// 開発中だけ：ブラウザのコンソールから中身を確かめられるように（配布用には入らない）
if (import.meta.env.DEV) {
  Promise.all([
    import('./core'), import('./game'), import('./ai'), import('./hud'), import('./screens'), import('./input'), import('./boardmode'),
    import('./physics'), import('./effects'), import('./world'), import('./nav'), import('./camera'), import('./grenades'), import('./arrows'),
    import('./render'), import('./replay'), import('./state'), import('./audio'), import('./gadgets'), import('./sword'), import('./clones'),
  ]).then(([core, game, ai, hud, screens, input, boardmode, physics, effects, world, nav, camera, grenades, arrows, render, replay, state, audio, gadgets, sword, clones]) => {
    (window as any).dev = {
      core, game, ai, hud, screens, input, boardmode, physics, effects, world, nav, camera, grenades, arrows, render, replay, audio, gadgets, sword, clones, gs: state.gs,
      // 画面が非表示でも、テストからゲームを n フレーム進められるように
      step(n: number, each?: (i: number) => void, ms = 1000 / 60) { for (let i = 0; i < n; i++) { loop(last + ms); if (each) each(i); } },
    };
  });
}
