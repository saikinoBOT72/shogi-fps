// 勝敗・HUD
'use strict';

// ================= 勝敗 =================
function killBot() {
  bot.dead = true;
  botActor.dead = { a: 0, v: 2.2, dir: 1 };
  Particles.wood(eyeOf(bot), cam.getWorldDirection(new V3()), 40, 1.3);
  PHYS.blast(eyeOf(bot), 4, 6);
  SFX.play('kill');
  timeScale = 0.25; slowmoT = 1.1;
  endMatch(true);
}
function killPlayer() {
  player.dead = true;
  SFX.play('kill');
  timeScale = 0.35; slowmoT = 0.9;
  endMatch(false);
}
function endMatch(win) {
  state = 'end'; stateT = 0; mouseDown = false; rightDown = false;
  stats.time = TIME_LIMIT - Math.max(0, TIME_LIMIT - stats.time);
  showCenter(win === true ? '撃破！' : win === false ? '敗北' : '時間切れ', win === true ? '#ffd23a' : '#ff6b5b');
  const toResult = () => { if (document.pointerLockElement) document.exitPointerLock(); showResult(win); };
  // 負けたときは、相手の視点で直前を再生してから結果へ
  setTimeout(() => { if (win !== false || !Replay.start(toResult)) toResult(); }, win === false ? 1700 : 2600);
}

// ================= HUD =================
function showCenter(text, color = '#fff') {
  const c = $('center');
  c.textContent = text; c.style.color = color;
  c.classList.remove('pop'); void c.offsetWidth; c.classList.add('pop');
}
let hmT = 0;
function showHitmarker(kind) {
  const h = $('hm'); h.className = kind; hmT = kind === 'kill' ? 0.5 : 0.22;
}
const dds = [];
function addDamageDir(from) {
  const el = document.createElement('div'); el.className = 'dd';
  $('dds').appendChild(el);
  dds.push({ el, from: from.clone(), t: 1.1 });
  if (dds.length > 4) dds.shift().el.remove();
}
function initPips() {
  hud.ammo = -1; hud.cache.clear();
  $('pips').innerHTML = '';
  for (let i = 0; i < player.w.mag; i++) $('pips').appendChild(document.createElement('i'));
}
function updateHUD(dt) {
  const p = player;
  // クロスヘア：実際のブレ幅に合わせて開く
  const spread = currentSpread(p);
  const px = Math.tan(spread) / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * innerHeight / 2;
  const gap = 4 + px, xh = $('xh').children;
  xh[0].style.top = (-gap - 9) + 'px'; xh[1].style.top = gap + 'px';
  xh[2].style.left = (-gap - 9) + 'px'; xh[3].style.left = gap + 'px';
  $('xh').style.opacity = p.dead ? 0 : lerp(1, 0.25, p.adsT || 0);

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
  hud.dash = p.skillT > 0 && p.skill.type === 'dash' ? 1 : Math.max(0, hud.dash - dt * 4); setStyle($('dashfx'), 'opacity', hud.dash.toFixed(2));

  if (p.w.kind === 'bow') {
    // 弓は弾数なし。引き具合を表示
    setHTML('ammoNum', `${Math.round((p.draw || 0) * 100)}<small>%</small>`);
    setStyle($('reloadTxt'), 'opacity', '0');
  } else if (hud.ammo !== p.ammo) {
    hud.ammo = p.ammo;
    $('ammoNum').innerHTML = `${p.ammo}<small>/${p.w.mag}</small>`;
    $('ammoNum').classList.toggle('low', p.ammo <= 3);
    [...$('pips').children].forEach((c, i) => c.classList.toggle('e', i >= p.ammo));
  }
  if (p.w.kind !== 'bow') {
    setStyle($('reloadTxt'), 'opacity', p.reloading > 0 ? '1' : (p.ammo === 0 ? (0.7 + Math.sin(performance.now() / 120) * 0.3).toFixed(2) : '0'));
    setText('reloadTxt', p.reloading > 0 ? 'リロード中' : 'R でリロード');
  }

  const max = p.skill.charges || 1;
  const k = p.charges >= max ? 1 : 1 - p.skillCd / p.skill.cooldown;
  setAttr($('skillArc'), 'stroke-dashoffset', (144.5 * (1 - k)).toFixed(1));
  const ready = p.charges > 0;
  if (hud.ready !== ready) { hud.ready = ready; $('skill').classList.toggle('ready', ready); }
  const armed = p.skillT > 0 && p.skill.type === 'homing';
  setText('skillName', (armed ? `${p.skill.name} 準備OK` : p.charges > 0 ? p.skill.name : `${p.skill.name} ${p.skillCd.toFixed(1)}`) + (max > 1 ? ` ×${p.charges}` : ''));
  if (changed('regen', !!p.regen)) $('meBar').classList.toggle('regen', !!p.regen);
  setText('timer', Math.max(0, Math.ceil(TIME_LIMIT - stats.time)));
}
// 前回と同じ値なら DOM に触らない（毎フレームの書き換えは重い）
const hud = { hurt: 0, dash: 0, ammo: -1, ready: null, cache: new Map() };
function changed(key, v) { if (hud.cache.get(key) === v) return false; hud.cache.set(key, v); return true; }
function setHTML(id, v) { if (changed(id + ':h', v)) $(id).innerHTML = v; }
function setText(id, v) { if (changed(id + ':t', v)) $(id).textContent = v; }
function setStyle(el, prop, v) { if (changed(el, prop + v)) el.style[prop] = v; }
function setAttr(el, a, v) { if (changed(el, a + v)) el.setAttribute(a, v); }
