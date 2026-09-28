// 勝敗・HUD
import { Gadgets } from './gadgets';
import { P } from './palette';
import * as THREE from 'three';
import { gs } from './state';
import { $, TIME_LIMIT, V3, keyName, settings } from './core';
import { SFX } from './audio';
import { cam } from './render';
import { PHYS } from './physics';
import { Particles, VM } from './effects';
import { act, bot, botActor, currentSpread, eyeOf, player, stats, view } from './game';
import { Replay } from './replay';
import { showResult } from './screens';

// ================= 勝敗 =================
export function killBot() {
  bot.dead = true;
  botActor.dead = { a: 0, v: 2.2, dir: 1 };
  Particles.wood(eyeOf(bot), cam.getWorldDirection(new V3()), 40, 1.3);
  PHYS.blast(eyeOf(bot), 4, 6);
  SFX.play('kill');
  gs.timeScale = 0.25; gs.slowmoT = 1.1;
  endMatch(true);
}
export function killPlayer() {
  player.dead = true;
  SFX.play('kill');
  gs.timeScale = 0.35; gs.slowmoT = 0.9;
  endMatch(false);
}
export function endMatch(win) {
  gs.state = 'end'; gs.stateT = 0; gs.mouseDown = false; gs.rightDown = false;
  stats.time = TIME_LIMIT - Math.max(0, TIME_LIMIT - stats.time);
  showCenter(win === true ? '撃破！' : win === false ? '敗北' : '時間切れ', win === true ? 'var(--kin-2)' : 'var(--shu-1)');
  const toResult = () => { if (document.pointerLockElement) document.exitPointerLock(); showResult(win); };
  // 決着がついたら、決めた側の視点で直前を再生してから結果へ（時間切れは再生なし）
  setTimeout(() => { if (win === null || !Replay.start(win, toResult)) toResult(); }, win === false ? 1700 : 1900);
}

// ================= HUD =================
export function showCenter(text, color = 'var(--shiro-2)') {
  const c = $('center');
  c.textContent = text; c.style.color = color;
  c.classList.remove('pop'); void c.offsetWidth; c.classList.add('pop');
}
export let hmT = 0;
export function showHitmarker(kind) {
  const h = $('hm'); h.className = kind; hmT = kind === 'kill' ? 0.5 : 0.22;
}
export const dds = [];
export function addDamageDir(from) {
  const el = document.createElement('div'); el.className = 'dd';
  $('dds').appendChild(el);
  dds.push({ el, from: from.clone(), t: 1.1 });
  if (dds.length > 4) dds.shift().el.remove();
}
// スキルの表示（枠の数だけ作る）
const cloakFx = document.createElement('div'); cloakFx.id = 'cloakfx'; $('hud').appendChild(cloakFx);
const flashFx = document.createElement('div'); flashFx.id = 'flashfx'; $('hud').appendChild(flashFx);
const guideTxt = document.createElement('div'); guideTxt.id = 'guideTxt'; guideTxt.className = 'shadow'; $('hud').appendChild(guideTxt);
const skillKey = i => keyName((settings as any).keys[i === 0 ? 'skill' : 'skill2']);
export function initSkills() {
  $('skill').innerHTML = player.slots.map((s, i) => `<div class="sk" id="sk${i}"><span class="nm"></span><div class="ring">
    <svg viewBox="0 0 54 54"><circle cx="27" cy="27" r="23" fill="rgba(0,0,0,.4)" stroke="rgba(255,255,255,.2)" stroke-width="4"/>
    <circle class="arc" cx="27" cy="27" r="23" fill="none" stroke="var(--info)" stroke-width="4" stroke-dasharray="144.5" stroke-dashoffset="0"/></svg>
    <div class="key">${skillKey(i)}</div></div></div>`).join('');
}
export function initPips() {
  hud.ammo = -1; hud.cache.clear();
  initSkills();
  $('pips').innerHTML = '';
  if (player.w.kind !== 'melee') for (let i = 0; i < player.w.mag; i++) $('pips').appendChild(document.createElement('i'));
  // 武器の名前：今持っている方を明るく
  const K = (settings as any).keys, knife = player.w.kind === 'melee';
  $('wepName').innerHTML = `<span class="${knife ? 'on' : ''}">${keyName(K.weapon1)} ナイフ</span>　<span class="${knife ? '' : 'on'}">${keyName(K.weapon2)} ${player.mainW.name}</span>`;
}
export function updateHUD(dt) {
  const p = player;
  // クロスヘア：実際のブレ幅に合わせて開く
  const spread = currentSpread(p);
  const px = Math.tan(spread) / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * innerHeight / 2;
  const gap = 4 + px, xh = $('xh').children;
  xh[0].style.top = (-gap - 9) + 'px'; xh[1].style.top = gap + 'px';
  xh[2].style.left = (-gap - 9) + 'px'; xh[3].style.left = gap + 'px';
  $('xh').style.opacity = p.dead || VM.scoped ? 0 : 1;
  // 次に撃てるまで（リロード中はリロードの進み）を照準の下の細いゲージで
  let ck = -1;
  if (p.reloading > 0) ck = 1 - p.reloading / p.w.reload;
  else {
    if (p.cd > hud.lastCd + 1e-3) hud.cdMax = p.cd;   // 撃った（間隔が始まった）
    if (p.cd > 0 && hud.cdMax >= 0.2) ck = 1 - p.cd / hud.cdMax;   // 連射の速い武器はちらつくので出さない
  }
  hud.lastCd = p.cd;
  setStyle($('cdBar'), 'opacity', ck >= 0 && !p.dead ? '1' : '0');
  if (ck >= 0) setStyle($('cdBar').firstChild, 'transform', `scaleX(${Math.max(0, ck).toFixed(2)})`);
  setStyle($('scope'), 'display', VM.scoped ? 'block' : 'none');
  // 弓の引き具合のリング
  const dr = p.w.kind === 'bow' && !p.dead ? p.draw || 0 : 0;
  setStyle($('drawRing'), 'opacity', dr > 0 ? '1' : '0');
  const dp = (dr * 100).toFixed(0) + '%';
  if (changed('drawP', dp)) $('drawRing').style.setProperty('--p', dp);
  if (changed('drawFull', dr >= 1)) $('drawRing').classList.toggle('full', dr >= 1);

  hmT -= dt;
  const hm = $('hm');
  hm.style.opacity = hmT > 0 ? 1 : 0;
  const hs = 8 + Math.max(0, hmT) * 20;
  [...hm.children].forEach((c, i) => { c.style.transform = `rotate(${45 + i * 90}deg) translateY(${-hs}px)`; });

  for (let i = dds.length - 1; i >= 0; i--) {
    const d = dds[i]; d.t -= dt;
    if (d.t <= 0) { d.el.remove(); dds.splice(i, 1); continue; }
    const v = d.from.clone().sub(p.pos);
    const lx = v.x * Math.cos(view.yaw) - v.z * Math.sin(view.yaw), lz = v.x * Math.sin(view.yaw) + v.z * Math.cos(view.yaw);
    d.el.style.transform = `rotate(${Math.atan2(lx, -lz)}rad)`;
    d.el.style.opacity = Math.min(1, d.t * 2);
  }

  const hpk = Math.max(0, p.hp / p.def.hp);
  setHTML('meHpNum', `${Math.max(0, Math.ceil(p.hp))}<small>/${p.def.hp}</small>`);
  setStyle($('meBar').children[1], 'transform', `scaleX(${hpk.toFixed(3)})`);
  setStyle($('meBar').children[0], 'transform', `scaleX(${hpk.toFixed(3)})`);
  const bk = Math.max(0, bot.hp / bot.def.hp);
  setStyle($('foeBar').children[1], 'transform', `scaleX(${bk.toFixed(3)})`);
  setStyle($('foeBar').children[0], 'transform', `scaleX(${bk.toFixed(3)})`);
  setStyle($('lowhp'), 'opacity', hpk < 0.35 && !p.dead ? (0.55 + Math.sin(performance.now() / 180) * 0.35).toFixed(2) : '0');
  hud.hurt = Math.max(0, hud.hurt - dt * 2.2); setStyle($('hurt'), 'opacity', hud.hurt.toFixed(2));
  hud.dash = act(p, 'dash') ? 1 : Math.max(0, hud.dash - dt * 4); setStyle($('dashfx'), 'opacity', hud.dash.toFixed(2));

  if (p.w.kind === 'melee') {
    setHTML('ammoNum', '—');
    setStyle($('reloadTxt'), 'opacity', '0');
  } else if (p.w.kind === 'bow') {
    // 弓は弾数なし。引き具合を表示
    setHTML('ammoNum', `${Math.round((p.draw || 0) * 100)}<small>%</small>`);
    setStyle($('reloadTxt'), 'opacity', '0');
  } else if (hud.ammo !== p.ammo) {
    hud.ammo = p.ammo;
    $('ammoNum').innerHTML = `${p.ammo}<small>/${p.w.mag}</small>`;
    $('ammoNum').classList.toggle('low', p.ammo <= 3);
    [...$('pips').children].forEach((c, i) => c.classList.toggle('e', i >= p.ammo));
  }
  if (p.w.kind !== 'bow' && p.w.kind !== 'melee') {
    setStyle($('reloadTxt'), 'opacity', p.reloading > 0 ? '1' : (p.ammo === 0 ? (0.7 + Math.sin(performance.now() / 120) * 0.3).toFixed(2) : '0'));
    setText('reloadTxt', p.reloading > 0 ? 'リロード中' : 'R でリロード');
  }

  p.slots.forEach((s, i) => {
    const el = $('sk' + i); if (!el) return;
    const sk = s.sk, max = sk.charges || 1;
    const k = s.charges >= max ? 1 : 1 - s.cd / sk.cooldown;
    setAttr(el.querySelector('.arc'), 'stroke-dashoffset', (144.5 * (1 - k)).toFixed(1));
    const again = (sk.type === 'c4' && Gadgets.c4Of(p)) || (sk.type === 'missile' && Gadgets.ctrlOf(p));
    const ready = s.charges > 0 || !!again;
    if (changed('skr' + i, ready)) el.classList.toggle('ready', ready);
    const armed = s.t > 0 && ['homing', 'bigshot', 'xray', 'cloak'].includes(sk.type);   // 鉤縄・投げ物はすぐ終わるので出さない
    const name = sk.type === 'c4' && Gadgets.c4Of(p) ? 'C4 起爆' : sk.type === 'missile' && Gadgets.ctrlOf(p) ? '戻る'
      : armed ? `${sk.name} ${sk.type === 'xray' || sk.type === 'cloak' ? s.t.toFixed(1) : '準備OK'}` : s.charges > 0 ? sk.name : `${sk.name} ${s.cd.toFixed(1)}`;
    const nm = el.querySelector('.nm'), txt = name + (max > 1 ? ` ×${s.charges}` : '');
    if (changed('skn' + i, txt)) nm.textContent = txt;
  });
  // 透明化中は画面の縁が青白く、ミサイル操作中は案内
  setStyle(cloakFx, 'opacity', act(p, 'cloak') ? '1' : '0');
  // 閃光弾で目がくらむ（最後の1秒でゆっくり戻る）
  if (gs.flash > 0) gs.flash = Math.max(0, gs.flash - dt);
  setStyle(flashFx, 'opacity', Math.min(1, gs.flash || 0).toFixed(2));
  const mi = p.slots.findIndex(s => s.sk.type === 'missile');
  setText('guideTxt', Gadgets.ctrlOf(p) ? `ミサイル操作中　マウスで曲げる・${skillKey(mi)} で自分に戻る` : '');
  if (changed('regen', !!p.regen)) $('meBar').classList.toggle('regen', !!p.regen);
  setText('timer', Math.max(0, Math.ceil(TIME_LIMIT - stats.time)));
}
// 前回と同じ値なら DOM に触らない（毎フレームの書き換えは重い）
export const hud: any = { hurt: 0, dash: 0, ammo: -1, ready: null, cache: new Map(), lastCd: 0, cdMax: 0 };
export function changed(key, v) { if (hud.cache.get(key) === v) return false; hud.cache.set(key, v); return true; }
export function setHTML(id, v) { if (changed(id + ':h', v)) $(id).innerHTML = v; }
export function setText(id, v) { if (changed(id + ':t', v)) $(id).textContent = v; }
export function setStyle(el, prop, v) { if (changed(el, prop + v)) el.style[prop] = v; }
export function setAttr(el, a, v) { if (changed(el, a + v)) el.setAttribute(a, v); }
