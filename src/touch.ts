// タッチ操作（スマホ・iPad）：左で移動スティック、右のドラッグで視点、ボタンで撃つ・覗く・跳ぶなど
// キーボード・マウスと同じ所（keys / gs.mouseDown / gs.rightDown / gs.mdx）に入れるので、ゲームの中身はそのまま
// （侍なら「覗く」が構え、「撃つ」が刀を振る。E の2回押しなどもスキルボタンをそのまま押せばよい）
import { gs } from './state';
import { $, saveSettings, settings } from './core';
import { keys, press } from './input';
import { isPlaying, player, switchWeapon } from './game';
import { pause } from './screens';

// ボタン：id / 字 / 初めの位置（画面の横・縦の割合）/ 大きさ（px、画面の大きさで伸び縮み）
const BTNS: [string, string, number, number, number][] = [
  ['stick', '', 0.16, 0.7, 150],
  ['fire', '撃つ', 0.86, 0.66, 92],
  ['ads', '覗く', 0.94, 0.42, 62],
  ['jump', '跳ぶ', 0.94, 0.87, 64],
  ['reload', '装填', 0.77, 0.88, 52],
  ['sk0', '', 0.73, 0.64, 60],
  ['sk1', '', 0.78, 0.42, 60],
  ['wep', '持替', 0.86, 0.2, 50],
  ['insp', '眺める', 0.75, 0.2, 46],
  ['pause', '', 0.035, 0.07, 42],
];
// アイコン（48×48。ユーザーが選んだ案：撃つ=弾 / 覗く=照準器 / 跳ぶ=二重山 / 装填=弾3つ / 持替=入れ替え矢印 / 一時停止=二本線 / 眺める=銃ときらり）。スキルは字だけ
const BULLET = '<path d="M19 22C19 13 24 6 24 6S29 13 29 22Z"/><path d="M19 23.5H29V40H19Z"/><path d="M17.5 41H30.5V43.5H17.5Z"/>';
const LINE = 'fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"';
const ICONS: Record<string, string> = {
  fire: BULLET,
  ads: `<g ${LINE} stroke-width="3.2"><circle cx="24" cy="24" r="15"/><path d="M24 5v10M24 33v10M5 24h10M33 24h10"/></g><circle cx="24" cy="24" r="2.4"/>`,
  jump: `<path ${LINE} stroke-width="5" d="M11 24L24 12L37 24M11 37L24 25L37 37"/>`,
  reload: [-9, 0, 9].map(x => `<g transform="translate(${x} 0) scale(.85) translate(4 4)">${BULLET}</g>`).join(''),
  wep: '<path d="M8 13H31V8L42 16.5L31 25V20H8Z"/><path d="M40 35H17V40L6 31.5L17 23V28H40Z" opacity=".7"/>',
  pause: '<path d="M14 10H21V38H14ZM27 10H34V38H27Z"/>',
  insp: '<g transform="translate(2 8) scale(.8)"><path d="M6 12H41V20H22L20.5 25H17.5L15 37H7L10 20H6Z"/></g><path d="M37 3L39 9L45 11L39 13L37 19L35 13L29 11L35 9Z"/>',
};
const DEF = Object.fromEntries(BTNS.map(([id, label, x, y, size]) => [id, { label, x, y, size }]));
// stick：'float' 触った所に出る / 'fixed' 場所固定　ads：'toggle' タップで切り替え / 'hold' 押している間　sens：視点の速さ　alpha：ボタンの濃さ（1 = そのまま）　lay：動かしたボタンの位置と大きさ
const T = (settings as any).touch = Object.assign({ stick: 'float', ads: 'toggle', sens: 1, alpha: 1, lay: {} }, (settings as any).touch || {});

// タッチの端末か（指で触ったら ON、マウスを使ったら OFF）。body.touch でボタンを出す
export const Touch = { on: matchMedia('(pointer: coarse)').matches };
document.body.classList.toggle('touch', Touch.on);
addEventListener('pointerdown', e => {
  const v = e.pointerType === 'touch' ? true : e.pointerType === 'mouse' ? false : Touch.on;
  if (v !== Touch.on) { Touch.on = v; document.body.classList.toggle('touch', v); }
}, true);

// ================= 誤操作を止める（拡大・スクロール・長押しのメニュー） =================
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, e => e.preventDefault(), { passive: false } as any);   // iOS の2本指の拡大
document.addEventListener('touchmove', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
addEventListener('selectstart', e => { if (!(e.target as HTMLElement).closest?.('input, textarea')) e.preventDefault(); });

// ================= ボタンを並べる =================
const lay = (id: string) => { const d = DEF[id], l = T.lay[id] || {}; return { x: l.x ?? d.x, y: l.y ?? d.y, s: l.s ?? 1 }; };
const scaleK = () => Math.min(1.25, Math.max(0.7, Math.min(innerWidth, innerHeight) / 700));
const sizeOf = (id: string) => DEF[id].size * lay(id).s * scaleK();
function place(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>('.tb').forEach(el => {
    const id = el.dataset.id, L = lay(id), sz = sizeOf(id);
    el.style.left = L.x * 100 + '%'; el.style.top = L.y * 100 + '%';
    el.style.width = el.style.height = sz + 'px';
    el.style.fontSize = Math.max(11, sz * (id === 'fire' ? 0.2 : 0.24)) + 'px';
  });
}
// edit：配置の編集画面（スキルは「スキル1」「スキル2」と出す）
function build(root: HTMLElement, edit = false) {
  root.innerHTML = BTNS.map(([id, label]) => id === 'stick'
    ? `<div class="tb stick" data-id="stick"><i class="knob"></i></div>`
    : `<div class="tb${ICONS[id] ? ' ic' : ''}" data-id="${id}">${ICONS[id] ? `<svg viewBox="0 0 48 48" fill="currentColor">${ICONS[id]}</svg>` : ''}<b>${edit && id === 'sk0' ? 'スキル1' : edit && id === 'sk1' ? 'スキル2' : label}</b><small></small></div>`).join('');
  root.style.setProperty('--tb-a', String(T.alpha));
  place(root);
}
const layer = document.createElement('div');
layer.id = 'touch';
$('hud').appendChild(layer);
build(layer);
addEventListener('resize', () => { place(layer); const ed = $('touchEdit'); if (ed) place(ed); });
const btn = (id: string) => layer.querySelector<HTMLElement>(`.tb[data-id="${id}"]`);
const stickEl = btn('stick'), knob = stickEl.querySelector<HTMLElement>('.knob');

// ================= 指の動き =================
type Finger = { role: string, x: number, y: number, cx?: number, cy?: number };
const fingers = new Map<number, Finger>();
const K = () => (settings as any).keys;
// 指で押したボタン（スティックは除く）。見た目の円より少し広めに当たりをとる
function hit(x: number, y: number) {
  let best = '', bd = Infinity;
  layer.querySelectorAll<HTMLElement>('.tb:not(.stick)').forEach(el => {
    if (el.classList.contains('hide')) return;
    const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const d = Math.hypot(x - cx, y - cy);
    if (d < r.width / 2 * 1.2 && d < bd) { bd = d; best = el.dataset.id; }
  });
  return best;
}
const KEY_OF = { jump: 'jump', reload: 'reload', sk0: 'skill', sk1: 'skill2', insp: 'inspect' };
function start(t: Touch) {
  const x = t.clientX, y = t.clientY, b = hit(x, y);
  if (b) {
    fingers.set(t.identifier, { role: b, x, y });
    btn(b).classList.add('down');
    if (b === 'fire') { gs.mouseDown = true; gs.triggerUsed = false; }
    else if (b === 'ads') gs.rightDown = T.ads === 'hold' ? true : !gs.rightDown;
    else if (KEY_OF[b]) press(K()[KEY_OF[b]]);
    else if (b === 'wep') { if (gs.state === 'fight') switchWeapon(player, 'toggle'); }
    else if (b === 'pause') { releaseAll(); pause(); }
    return;
  }
  // 左側：移動スティック（1本の指だけ）。それ以外は視点
  if (x < innerWidth * 0.45 && ![...fingers.values()].some(f => f.role === 'stick')) {
    const r = stickEl.getBoundingClientRect(), R = r.width / 2;
    let cx = r.left + R, cy = r.top + R;
    if (T.stick === 'float') { cx = Math.max(R, Math.min(innerWidth - R, x)); cy = Math.max(R, Math.min(innerHeight - R, y)); stickEl.style.left = cx + 'px'; stickEl.style.top = cy + 'px'; }
    fingers.set(t.identifier, { role: 'stick', x, y, cx, cy });
    stickEl.classList.add('down');
    moveStick(x, y);
    return;
  }
  fingers.set(t.identifier, { role: 'look', x, y });
}
function move(t: Touch) {
  const f = fingers.get(t.identifier);
  if (!f) return;
  const x = t.clientX, y = t.clientY;
  if (f.role === 'stick') { moveStick(x, y); return; }
  // 視点：「撃つ」を押しながらずらしても視点が動く。マウスの感度とは別（1px = 0.2° × タッチ感度）
  if (f.role === 'look' || f.role === 'fire') {
    const k = T.sens * 0.2 / (0.07 * ((settings as any).sens || 1));
    gs.mdx += (x - f.x) * k; gs.mdy += (y - f.y) * k;
  }
  f.x = x; f.y = y;
}
function moveStick(x: number, y: number) {
  const f = [...fingers.values()].find(f => f.role === 'stick');
  if (!f) return;
  const R = stickEl.getBoundingClientRect().width / 2;
  let dx = x - f.cx, dy = y - f.cy;
  const len = Math.hypot(dx, dy), m = Math.min(1, len / R);
  if (len > R) { dx *= R / len; dy *= R / len; }
  knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  const nx = len ? dx / Math.hypot(dx, dy) : 0, ny = len ? dy / Math.hypot(dx, dy) : 0, live = m > 0.2;
  const k = K();
  keys[k.forward] = live && ny < -0.38; keys[k.back] = live && ny > 0.38;
  keys[k.left] = live && nx < -0.38; keys[k.right] = live && nx > 0.38;
  keys[k.run] = m > 0.92;   // 端まで倒すと走る
}
function end(id: number) {
  const f = fingers.get(id);
  if (!f) return;
  fingers.delete(id);
  const still = (role: string) => [...fingers.values()].some(g => g.role === role);
  if (f.role === 'stick') {
    const k = K();
    keys[k.forward] = keys[k.back] = keys[k.left] = keys[k.right] = keys[k.run] = false;
    knob.style.transform = ''; stickEl.classList.remove('down');
    if (T.stick === 'float') place(layer);   // 元の位置に戻す
    return;
  }
  if (f.role === 'look' || still(f.role)) return;
  btn(f.role).classList.remove('down');
  if (f.role === 'fire') gs.mouseDown = false;
  else if (f.role === 'ads' && T.ads === 'hold') gs.rightDown = false;
  else if (KEY_OF[f.role]) keys[K()[KEY_OF[f.role]]] = false;
}
function releaseAll() { for (const id of [...fingers.keys()]) end(id); }
layer.addEventListener('touchstart', e => {
  if (!isPlaying()) return;   // 止まっている間はそのまま（リプレイを飛ばすタップなど）
  e.preventDefault();
  for (const t of Array.from(e.changedTouches)) start(t);
}, { passive: false });
layer.addEventListener('touchmove', e => { e.preventDefault(); for (const t of Array.from(e.changedTouches)) move(t); }, { passive: false });
for (const ev of ['touchend', 'touchcancel']) layer.addEventListener(ev, (e: TouchEvent) => { for (const t of Array.from(e.changedTouches)) end(t.identifier); });

// ================= 毎フレーム：字や状態を合わせる =================
const txt = (el: HTMLElement, sel: string, s: string) => { const e = el.querySelector(sel); if (e && e.textContent !== s) e.textContent = s; };
let lastW = null;
export function touchTick() {
  if (!Touch.on || !player) return;
  if (!isPlaying() && fingers.size) releaseAll();   // 一時停止したら、押しっぱなしを離す
  const p = player, kind = p.w.kind;
  if (p.w !== lastW) { if (lastW && T.ads === 'toggle') gs.rightDown = false; lastW = p.w; }   // 持ち替えたら覗き込み（構え）を解く
  txt(btn('fire'), 'b', kind === 'sword' || kind === 'melee' ? '斬る' : '撃つ');
  txt(btn('ads'), 'b', kind === 'sword' ? '構え' : '覗く');
  // 刀・ナイフのときは銃のアイコンを隠して字だけ
  btn('fire').classList.toggle('txt', kind === 'sword' || kind === 'melee');
  btn('ads').classList.toggle('txt', kind === 'sword');
  btn('ads').classList.toggle('off', kind === 'melee');
  btn('ads').classList.toggle('on', !!gs.rightDown);
  btn('wep').classList.toggle('hide', p.mainW.kind === 'sword');   // 侍は刀だけ
  ['sk0', 'sk1'].forEach((id, i) => {
    const el = btn(id), s = p.slots[i];
    el.classList.toggle('hide', !s);
    if (!s) return;
    const ready = s.charges > 0 && !(s.t > 0) && !(p.empT > 0);
    el.classList.toggle('off', !ready);
    txt(el, 'b', s.sk.name);
    txt(el, 'small', s.t > 0 ? s.t.toFixed(0) : !ready && s.cd > 0 ? Math.ceil(s.cd) + '' : '');
  });
}

// ================= 配置の編集（設定から） =================
export function openTouchEdit() {
  const ed = document.createElement('div');
  ed.id = 'touchEdit';
  document.body.appendChild(ed);
  let sel = '';
  const seg = (id: string, items: [string, string][], cur: string) => `<div class="seg" id="${id}">${items.map(([k, n]) => `<button data-v="${k}" class="${cur === k ? 'on' : ''}">${n}</button>`).join('')}</div>`;
  const render = () => {
    build(ed, true);
    ed.insertAdjacentHTML('beforeend', `<div class="te-panel panel form">
      <h3>タッチ操作の配置</h3>
      <p class="note">ボタンを指（マウス）で動かせます。選んだボタンは大きさも変えられます</p>
      <div class="row"><span>スティック</span>${seg('teStick', [['float', '触った所に出る'], ['fixed', '固定']], T.stick)}</div>
      <div class="row"><span>覗く・構え</span>${seg('teAds', [['toggle', 'タップで切り替え'], ['hold', '押している間']], T.ads)}</div>
      <div class="row"><span>視点の感度 <b id="teSensV">${T.sens.toFixed(2)}</b></span><input id="teSens" type="range" min="0.2" max="3" step="0.05" value="${T.sens}"></div>
      <div class="row"><span>ボタンの濃さ <b id="teAlphaV">${Math.round(T.alpha * 100)}%</b></span><input id="teAlpha" type="range" min="0.15" max="1" step="0.05" value="${T.alpha}"></div>
      <div class="row"><span>大きさ <b id="teSizeV">${sel ? lay(sel).s.toFixed(2) : '－'}</b><small id="teSel">${sel ? '' : 'ボタンを選んでください'}</small></span><input id="teSize" type="range" min="0.5" max="2" step="0.05" value="${sel ? lay(sel).s : 1}" ${sel ? '' : 'disabled'}></div>
      <div class="menu"><button class="btn sub small" id="teReset">初期に戻す</button><button class="btn small" id="teDone">完了</button></div>
    </div>`);
    const segBind = (id: string, fn: (v: string) => void) => ed.querySelectorAll<HTMLElement>(`#${id} button`).forEach(b => b.onclick = () => { fn(b.dataset.v); saveSettings(); render(); });
    segBind('teStick', v => { T.stick = v; });
    segBind('teAds', v => { T.ads = v; });
    $('teSens').oninput = e => { T.sens = +(e.target as HTMLInputElement).value; $('teSensV').textContent = T.sens.toFixed(2); saveSettings(); };
    $('teAlpha').oninput = e => {
      T.alpha = +(e.target as HTMLInputElement).value; $('teAlphaV').textContent = Math.round(T.alpha * 100) + '%';
      ed.style.setProperty('--tb-a', String(T.alpha)); layer.style.setProperty('--tb-a', String(T.alpha)); saveSettings();
    };
    $('teSize').oninput = e => {
      if (!sel) return;
      const s = +(e.target as HTMLInputElement).value, L = lay(sel);
      T.lay[sel] = { x: L.x, y: L.y, s }; $('teSizeV').textContent = s.toFixed(2);
      place(ed); place(layer); saveSettings();
    };
    $('teReset').onclick = () => { T.lay = {}; saveSettings(); place(layer); render(); };
    $('teDone').onclick = () => { ed.remove(); place(layer); };
    // ボタンを選んで、引っぱって動かす
    const select = (id: string) => {
      sel = id;
      ed.querySelectorAll<HTMLElement>('.tb').forEach(el => el.classList.toggle('sel', el.dataset.id === sel));
      const size = $('teSize') as HTMLInputElement;
      size.disabled = false; size.value = String(lay(id).s);
      $('teSizeV').textContent = lay(id).s.toFixed(2); $('teSel').textContent = '';
    };
    ed.querySelectorAll<HTMLElement>('.tb').forEach(el => {
      el.onpointerdown = e => {
        e.preventDefault();
        const id = el.dataset.id;
        select(id);
        try { el.setPointerCapture(e.pointerId); } catch (err) {}
        const L = lay(id), ox = e.clientX - L.x * innerWidth, oy = e.clientY - L.y * innerHeight;
        el.onpointermove = ev => {
          const x = Math.max(0.02, Math.min(0.98, (ev.clientX - ox) / innerWidth)), y = Math.max(0.03, Math.min(0.97, (ev.clientY - oy) / innerHeight));
          T.lay[id] = { x, y, s: lay(id).s };
          place(ed);
        };
        el.onpointerup = el.onpointercancel = () => { el.onpointermove = null; saveSettings(); place(layer); };
      };
    });
    if (sel) select(sel);
  };
  render();
}
