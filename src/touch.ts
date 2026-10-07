// タッチ操作（スマホ・iPad）：左で移動スティック、右のドラッグで視点、ボタンで撃つ・覗く・跳ぶなど
// キーボード・マウスと同じ所（keys / gs.mouseDown / gs.rightDown / gs.mdx）に入れるので、ゲームの中身はそのまま
// （侍なら「覗く」が構え、「撃つ」が刀を振る。E の2回押しなどもスキルボタンをそのまま押せばよい）
// 設定は設定画面の「タッチ操作」タブ（touchSettingsHTML）と、ボタンの配置の編集（openTouchEdit）
import { gs } from './state';
import { $, saveSettings, settings } from './core';
import { keys, press } from './input';
import { isPlaying, player, switchWeapon } from './game';
import { pause } from './screens';

// ボタン：id / 名前 / 初めの位置（画面の横・縦の割合）/ 大きさ（px、画面の大きさで伸び縮み）/ 初めは隠す
const BTNS: [string, string, number, number, number, boolean?][] = [
  ['stick', 'スティック', 0.16, 0.7, 150],
  ['fire', '撃つ', 0.86, 0.66, 92],
  ['fire2', '撃つ（左）', 0.3, 0.42, 70, true],
  ['ads', '覗く・構え', 0.94, 0.42, 62],
  ['jump', '跳ぶ', 0.94, 0.87, 64],
  ['reload', '装填', 0.77, 0.88, 52],
  ['sk0', 'スキル1', 0.73, 0.64, 60],
  ['sk1', 'スキル2', 0.78, 0.42, 60],
  ['wep', '持替', 0.86, 0.2, 50],
  ['insp', '眺める', 0.75, 0.2, 46],
  ['pause', '一時停止', 0.035, 0.07, 42],
];
const DEF = Object.fromEntries(BTNS.map(([id, name, x, y, size, hide]) => [id, { name, x, y, size, hide: !!hide }]));
const NO_HIDE = ['stick', 'pause'];   // 隠せないボタン
// アイコン（48×48。ユーザーが選んだ案：撃つ=弾 / 覗く=照準器 / 跳ぶ=二重山 / 装填=弾3つ / 持替=入れ替え矢印 / 一時停止=二本線 / 眺める=銃ときらり）。スキルは字だけ
const BULLET = '<path d="M19 22C19 13 24 6 24 6S29 13 29 22Z"/><path d="M19 23.5H29V40H19Z"/><path d="M17.5 41H30.5V43.5H17.5Z"/>';
const LINE = 'fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"';
const ICONS: Record<string, string> = {
  fire: BULLET, fire2: BULLET,
  ads: `<g ${LINE} stroke-width="3.2"><circle cx="24" cy="24" r="15"/><path d="M24 5v10M24 33v10M5 24h10M33 24h10"/></g><circle cx="24" cy="24" r="2.4"/>`,
  jump: `<path ${LINE} stroke-width="5" d="M11 24L24 12L37 24M11 37L24 25L37 37"/>`,
  reload: [-9, 0, 9].map(x => `<g transform="translate(${x} 0) scale(.85) translate(4 4)">${BULLET}</g>`).join(''),
  wep: '<path d="M8 13H31V8L42 16.5L31 25V20H8Z"/><path d="M40 35H17V40L6 31.5L17 23V28H40Z" opacity=".7"/>',
  pause: '<path d="M14 10H21V38H14ZM27 10H34V38H27Z"/>',
  insp: '<g transform="translate(2 8) scale(.8)"><path d="M6 12H41V20H22L20.5 25H17.5L15 37H7L10 20H6Z"/></g><path d="M37 3L39 9L45 11L39 13L37 19L35 13L29 11L35 9Z"/>',
};

// ================= 設定 =================
// 武器の種類（撃ち方の設定はこの単位）。ナイフは設定がないので入れない
const CATS: [string, string][] = [['hand', 'ハンドガン'], ['auto', '連射'], ['sniper', 'スナイパー'], ['shotgun', 'ショットガン'], ['launcher', 'グレネード'], ['bow', '弓'], ['sword', '刀']];
export const catOf = (w: any) => w.kind === 'melee' ? 'knife' : w.kind === 'sword' ? 'sword' : w.kind === 'bow' ? 'bow' : w.kind === 'grenade' ? 'launcher'
  : (w.pellets || 1) > 1 ? 'shotgun' : w.zoom && w.zoom <= 30 ? 'sniper' : w.auto ? 'auto' : 'hand';
// fire：'press' 押したら撃つ / 'release' 離したら撃つ　adsFire：撃つボタンで覗きも開く　ads：'toggle' タップで切り替え / 'hold' 押している間　adsSens：覗いている間の視点の速さ（倍）
const wDef = (c: string) => ({ fire: c === 'sniper' ? 'release' : 'press', adsFire: c === 'sniper', ads: 'toggle', adsSens: 1 });
const KNIFE = { fire: 'press', adsFire: false, ads: 'toggle', adsSens: 1 };
// stick：'float' 触った所に出る / 'fixed' 場所固定　dead：スティックが反応し始める倒し具合　runAt：走り始める倒し具合　runLock：上へ大きく引いて離すと走りっぱなし
// sens：視点の速さ　invY：上下反転　fireLook：撃つボタンを押したまま指をずらすと視点も動く　alpha：ボタン全体の濃さ
// lay：ボタンごとの位置・大きさ（s）・濃さ（a）・隠す（hide）　slots：保存した設定（3つ）
const T = (settings as any).touch = Object.assign({ stick: 'float', dead: 0.2, runAt: 0.92, runLock: true, sens: 1, invY: false, fireLook: true, alpha: 1, lay: {}, weapon: {}, slots: [] }, (settings as any).touch || {});
for (const [c] of CATS) T.weapon[c] = Object.assign(wDef(c), T.weapon[c] || {});
delete T.ads;   // 前の版の「覗く」の設定（今は武器の種類ごと）
const W = () => !player ? KNIFE : T.weapon[catOf(player.w)] || KNIFE;

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
const lay = (id: string) => { const d = DEF[id], l = T.lay[id] || {}; return { x: l.x ?? d.x, y: l.y ?? d.y, s: l.s ?? 1, a: l.a ?? 1, hide: NO_HIDE.includes(id) ? false : l.hide ?? d.hide }; };
const setLay = (id: string, v: any) => { T.lay[id] = Object.assign(lay(id), v); };
const scaleK = () => Math.min(1.25, Math.max(0.7, Math.min(innerWidth, innerHeight) / 700));
const sizeOf = (id: string) => DEF[id].size * lay(id).s * scaleK();
// 字だけのボタン（スキル）：字数に合わせて、円からはみ出さない大きさにする
function fitText(el: HTMLElement) {
  const b = el.querySelector<HTMLElement>('b'), w = el.clientWidth || sizeOf(el.dataset.id), n = Math.max(2, (b?.textContent || '').length);
  const fs = Math.min(w * 0.22, w * 0.7 / n).toFixed(1) + 'px';
  if (b && b.style.fontSize !== fs) b.style.fontSize = fs;
}
function place(root: HTMLElement) {
  root.style.setProperty('--tb-a', String(T.alpha));
  root.querySelectorAll<HTMLElement>('.tb').forEach(el => {
    const id = el.dataset.id, L = lay(id), sz = sizeOf(id);
    el.style.left = L.x * 100 + '%'; el.style.top = L.y * 100 + '%';
    el.style.width = el.style.height = sz + 'px';
    el.style.fontSize = Math.max(11, sz * 0.24) + 'px';
    el.style.setProperty('--b-a', String(L.a));
    el.classList.toggle('uhide', L.hide);   // 設定で隠したボタン（.hide は武器などで自動で隠すもの）
    if (!el.classList.contains('ic')) fitText(el);
  });
}
// edit：配置の編集画面（スキルは「スキル1」「スキル2」と出す）
function build(root: HTMLElement, edit = false) {
  root.innerHTML = BTNS.map(([id, name]) => id === 'stick'
    ? `<div class="tb stick" data-id="stick"><i class="lk"><svg viewBox="0 0 48 48">${ICONS.jump.replace('stroke-width="5"', 'stroke-width="6"')}</svg></i><i class="knob"></i></div>`
    : `<div class="tb${ICONS[id] ? ' ic' : ''}" data-id="${id}">${ICONS[id] ? `<svg viewBox="0 0 48 48" fill="currentColor">${ICONS[id]}</svg>` : ''}<b>${edit && !ICONS[id] ? name : ''}</b><small></small></div>`).join('');
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
// role：'fire' / 'ads' など（左の撃つボタンも 'fire'）。el：押したボタンの id
type Finger = { role: string, el?: string, x: number, y: number, cx?: number, cy?: number, release?: boolean, adsBefore?: boolean, adsFire?: boolean, lockReady?: boolean };
const fingers = new Map<number, Finger>();
const K = () => (settings as any).keys;
const KEY_OF = { jump: 'jump', reload: 'reload', sk0: 'skill', sk1: 'skill2', insp: 'inspect' };
let runLocked = false;
// 離したら撃つ：撃つまで（弾が減るまで、長くて 0.35 秒）撃つ入力を入れておき、撃ったら覗きを元に戻す
let shot: { until: number, ammo: number, ads: boolean | null } | null = null;
// 指で押したボタン（スティックは除く）。見た目の円より少し広めに当たりをとる
function hit(x: number, y: number) {
  let best = '', bd = Infinity;
  layer.querySelectorAll<HTMLElement>('.tb:not(.stick)').forEach(el => {
    if (el.classList.contains('hide') || el.classList.contains('uhide')) return;
    const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const d = Math.hypot(x - cx, y - cy);
    if (d < r.width / 2 * 1.2 && d < bd) { bd = d; best = el.dataset.id; }
  });
  return best;
}
const gunLike = (k: string) => k !== 'sword' && k !== 'melee';
function start(t: Touch) {
  const x = t.clientX, y = t.clientY, b = hit(x, y);
  if (b) {
    const role = b === 'fire2' ? 'fire' : b, f: Finger = { role, el: b, x, y };
    fingers.set(t.identifier, f);
    btn(b).classList.add('down');
    if (role === 'fire') {
      const w = W(), kind = player.w.kind;
      f.adsBefore = !!gs.rightDown;
      f.adsFire = w.adsFire && gunLike(kind);
      if (f.adsFire) gs.rightDown = true;
      f.release = w.fire === 'release' && gunLike(kind) && kind !== 'bow';
      if (!f.release) { gs.mouseDown = true; gs.triggerUsed = false; }
    }
    else if (role === 'ads') gs.rightDown = W().ads === 'hold' ? true : !gs.rightDown;
    else if (KEY_OF[role]) press(K()[KEY_OF[role]]);
    else if (role === 'wep') { if (gs.state === 'fight') switchWeapon(player, 'toggle'); }
    else if (role === 'pause') { releaseAll(); pause(); }
    return;
  }
  // 左側：移動スティック（1本の指だけ）。それ以外は視点
  if (x < innerWidth * 0.45 && ![...fingers.values()].some(f => f.role === 'stick')) {
    if (runLocked) setRunLock(false);   // 走りっぱなしは、スティックを触ると解ける
    const r = stickEl.getBoundingClientRect(), R = r.width / 2;
    let cx = r.left + R, cy = r.top + R;
    if (T.stick === 'float') { cx = Math.max(R, Math.min(innerWidth - R, x)); cy = Math.max(R * 2.2, Math.min(innerHeight - R, y)); stickEl.style.left = cx + 'px'; stickEl.style.top = cy + 'px'; }
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
  // 視点：マウスの感度とは別（1px = 0.2° × タッチ感度）。覗いている間は武器の種類ごとの倍率
  if (f.role === 'look' || (f.role === 'fire' && T.fireLook)) {
    const z = player ? player.adsT || 0 : 0;
    const k = T.sens * 0.2 / (0.07 * ((settings as any).sens || 1)) * (1 + (W().adsSens - 1) * z);
    gs.mdx += (x - f.x) * k; gs.mdy += (y - f.y) * k * (T.invY ? -1 : 1);
  }
  f.x = x; f.y = y;
}
function setMove(fw: boolean, bk: boolean, lf: boolean, rt: boolean, run: boolean) {
  const k = K();
  keys[k.forward] = fw; keys[k.back] = bk; keys[k.left] = lf; keys[k.right] = rt; keys[k.run] = run;
}
function setRunLock(v: boolean) {
  runLocked = v;
  stickEl.classList.toggle('locked', v);
  if (v) { setMove(true, false, false, false, true); knob.style.transform = 'translate(-50%, -150%)'; }
  else { setMove(false, false, false, false, false); knob.style.transform = ''; }
}
function moveStick(x: number, y: number) {
  const f = [...fingers.values()].find(f => f.role === 'stick');
  if (!f) return;
  const R = stickEl.getBoundingClientRect().width / 2;
  let dx = x - f.cx, dy = y - f.cy;
  const len = Math.hypot(dx, dy), m = Math.min(1, len / R);
  const nx = len ? dx / len : 0, ny = len ? dy / len : 0, live = m > T.dead;
  // 上へ大きく引いた（輪の外の▲まで）：離すと走りっぱなし
  f.lockReady = T.runLock && ny < -0.8 && len > R * 1.7;
  stickEl.classList.toggle('lockReady', f.lockReady);
  if (len > R) { dx *= R / len; dy *= R / len; }
  knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  setMove(live && ny < -0.38, live && ny > 0.38, live && nx < -0.38, live && nx > 0.38, m >= T.runAt);   // 走り始める倒し具合まで倒すと走る
}
function end(id: number) {
  const f = fingers.get(id);
  if (!f) return;
  fingers.delete(id);
  const still = (role: string) => [...fingers.values()].some(g => g.role === role);
  if (f.role === 'stick') {
    stickEl.classList.remove('down', 'lockReady');
    if (f.lockReady && isPlaying()) setRunLock(true);
    else { setMove(false, false, false, false, false); knob.style.transform = ''; }
    if (T.stick === 'float') place(layer);   // 元の位置に戻す
    return;
  }
  if (f.role === 'look') return;
  btn(f.el).classList.remove('down');
  if (still(f.role)) return;
  if (f.role === 'fire') {
    if (f.release && isPlaying()) {
      gs.mouseDown = true; gs.triggerUsed = false;
      shot = { until: performance.now() + 350, ammo: player.ammo, ads: f.adsFire ? f.adsBefore : null };
    } else {
      gs.mouseDown = false;
      if (f.adsFire) gs.rightDown = f.adsBefore;
    }
  }
  else if (f.role === 'ads' && W().ads === 'hold') gs.rightDown = false;
  else if (KEY_OF[f.role]) keys[K()[KEY_OF[f.role]]] = false;
}
function releaseAll() {
  for (const id of [...fingers.keys()]) end(id);
  if (runLocked) setRunLock(false);
  if (shot) { gs.mouseDown = false; shot = null; }
}
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
  if (!isPlaying() && (fingers.size || runLocked || shot)) releaseAll();   // 一時停止したら、押しっぱなしを離す
  const p = player, kind = p.w.kind;
  // 離したら撃つ：弾が減った（撃てた）か時間切れで、撃つ入力を止めて覗きを戻す
  if (shot && (p.ammo !== shot.ammo || performance.now() > shot.until || !gunLike(kind))) {
    if (![...fingers.values()].some(f => f.role === 'fire')) gs.mouseDown = false;
    if (shot.ads !== null) gs.rightDown = shot.ads;
    shot = null;
  }
  if (p.w !== lastW) { if (lastW && W().ads === 'toggle') gs.rightDown = false; lastW = p.w; }   // 持ち替えたら覗き込み（構え）を解く
  // 刀・ナイフのときは銃のアイコンを隠して字だけ
  for (const id of ['fire', 'fire2']) { btn(id).classList.toggle('txt', !gunLike(kind)); txt(btn(id), 'b', gunLike(kind) ? '' : '斬る'); }
  btn('ads').classList.toggle('txt', kind === 'sword');
  txt(btn('ads'), 'b', kind === 'sword' ? '構え' : '');
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
    fitText(el);
    txt(el, 'small', s.t > 0 ? s.t.toFixed(0) : !ready && s.cd > 0 ? Math.ceil(s.cd) + '' : '');
  });
}

// ================= 設定画面の「タッチ操作」タブ =================
let wcat = 'hand';   // 撃ち方の設定で見ている武器の種類
const seg = (id: string, items: [string, string][], cur: string) => `<div class="seg" id="${id}">${items.map(([k, n]) => `<button data-v="${k}" class="${cur === k ? 'on' : ''}">${n}</button>`).join('')}</div>`;
const onOff = (id: string, v: boolean) => seg(id, [['1', 'ON'], ['0', 'OFF']], v ? '1' : '0');
const range = (id: string, min: number, max: number, step: number, v: number, label: string) =>
  `<span class="tset-range"><input id="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${v}"><b id="${id}V">${label}</b></span>`;
const pct = (v: number) => Math.round(v * 100) + '%';
export function touchSettingsHTML() {
  const w = T.weapon[wcat], sword = wcat === 'sword', bow = wcat === 'bow';
  const slot = (i: number) => {
    const s = T.slots[i];
    return `<div class="row"><span>スロット${i + 1}<small>${s ? '保存済み ' + new Date(JSON.parse(s).at).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '空き'}</small></span>
      <span class="tset-btns"><button class="small" data-save="${i}">保存</button><button class="small" data-load="${i}" ${s ? '' : 'disabled'}>読み込み</button></span></div>`;
  };
  return `<div class="panel form tset">
    <h3>ボタン</h3>
    <div class="row"><span>ボタンの配置<small>動かす・大きさ・濃さ・出す／隠す（左の撃つボタンもここで出せます）</small></span><button class="small" id="tsEdit">配置を編集</button></div>
  </div>
  <div class="panel form tset">
    <h3>撃ち方（武器の種類ごと）</h3>
    ${seg('tsCat', CATS, wcat)}
    ${sword ? '' : bow ? '' : `<div class="row"><span>撃つタイミング<small>離したら撃つ：押している間に狙って、指を離すと撃つ</small></span>${seg('tsFire', [['press', '押したら撃つ'], ['release', '離したら撃つ']], w.fire)}</div>`}
    ${sword ? '' : `<div class="row"><span>撃つボタンで覗く<small>撃つボタンを押すとスコープも開く（離すと元に戻る）</small></span>${onOff('tsAdsFire', w.adsFire)}</div>`}
    <div class="row"><span>${sword ? '構えボタン' : '覗くボタン'}</span>${seg('tsAds', [['toggle', 'タップで切り替え'], ['hold', '押している間']], w.ads)}</div>
    ${sword ? '' : `<div class="row"><span>覗いている間の視点の速さ<small>ふだんの速さに掛ける倍率</small></span>${range('tsAdsSens', 0.2, 2, 0.05, w.adsSens, '×' + w.adsSens.toFixed(2))}</div>`}
  </div>
  <div class="panel form tset">
    <h3>視点</h3>
    <div class="row"><span>視点の速さ<small>マウス感度とは別</small></span>${range('tsSens', 0.2, 3, 0.05, T.sens, T.sens.toFixed(2))}</div>
    <div class="row"><span>上下反転</span>${onOff('tsInvY', T.invY)}</div>
    <div class="row"><span>撃つボタンで視点も動かす<small>撃つボタンを押したまま指をずらすと視点が動く</small></span>${onOff('tsFireLook', T.fireLook)}</div>
  </div>
  <div class="panel form tset">
    <h3>スティック</h3>
    <div class="row"><span>出る場所</span>${seg('tsStick', [['float', '触った所に出る'], ['fixed', '固定']], T.stick)}</div>
    <div class="row"><span>反応し始める倒し具合<small>小さいほど少し倒しただけで歩く</small></span>${range('tsDead', 0.05, 0.5, 0.05, T.dead, pct(T.dead))}</div>
    <div class="row"><span>走り始める倒し具合<small>100% で端まで倒したときだけ</small></span>${range('tsRunAt', 0.5, 1, 0.02, T.runAt, pct(T.runAt))}</div>
    <div class="row"><span>走りっぱなし<small>スティックを上の ▲ まで引いて離すと走り続ける。もう一度触ると止まる</small></span>${onOff('tsRunLock', T.runLock)}</div>
  </div>
  <div class="panel form tset">
    <h3>保存</h3>
    <p class="note">今のタッチ操作の設定（ボタンの配置も）を保存して、あとで読み込めます</p>
    ${[0, 1, 2].map(slot).join('')}
  </div>`;
}
export function bindTouchSettings(rerender: () => void) {
  const done = () => { saveSettings(); place(layer); };
  const segBind = (id: string, fn: (v: string) => void) => document.querySelectorAll<HTMLElement>(`#${id} button`).forEach(b => b.onclick = e => { e.stopPropagation(); fn(b.dataset.v); done(); rerender(); });
  const rangeBind = (id: string, fn: (v: number) => string) => { const el = $(id) as HTMLInputElement; if (el) el.oninput = () => { $(id + 'V').textContent = fn(+el.value); done(); }; };
  const w = T.weapon[wcat];
  segBind('tsCat', v => { wcat = v; });
  segBind('tsFire', v => { w.fire = v; });
  segBind('tsAdsFire', v => { w.adsFire = v === '1'; });
  segBind('tsAds', v => { w.ads = v; });
  rangeBind('tsAdsSens', v => { w.adsSens = v; return '×' + v.toFixed(2); });
  rangeBind('tsSens', v => { T.sens = v; return v.toFixed(2); });
  segBind('tsInvY', v => { T.invY = v === '1'; });
  segBind('tsFireLook', v => { T.fireLook = v === '1'; });
  segBind('tsStick', v => { T.stick = v; });
  rangeBind('tsDead', v => { T.dead = v; return pct(v); });
  rangeBind('tsRunAt', v => { T.runAt = v; return pct(v); });
  segBind('tsRunLock', v => { T.runLock = v === '1'; });
  $('tsEdit').onclick = e => { e.stopPropagation(); openTouchEdit(); };
  document.querySelectorAll<HTMLElement>('[data-save]').forEach(b => b.onclick = e => {
    e.stopPropagation();
    const { slots, ...rest } = T;
    T.slots[+b.dataset.save] = JSON.stringify(Object.assign({}, rest, { at: Date.now() }));
    done(); rerender();
  });
  document.querySelectorAll<HTMLElement>('[data-load]').forEach(b => b.onclick = e => {
    e.stopPropagation();
    const s = T.slots[+b.dataset.load];
    if (!s) return;
    const { at, slots, ...rest } = JSON.parse(s);
    Object.assign(T, rest);
    for (const [c] of CATS) T.weapon[c] = Object.assign(wDef(c), T.weapon[c] || {});
    done(); rerender();
  });
}

// ================= ボタンの配置の編集 =================
export function openTouchEdit() {
  const ed = document.createElement('div');
  ed.id = 'touchEdit';
  document.body.appendChild(ed);
  let sel = '';
  const render = () => {
    build(ed, true);
    const L = sel ? lay(sel) : null;
    ed.insertAdjacentHTML('beforeend', `<div class="te-panel panel form">
      <h3>ボタンの配置</h3>
      <p class="note">ボタンを指（マウス）で動かせます。選んだボタンは大きさ・濃さ・出す／隠すを変えられます</p>
      <div class="row"><span>全体の濃さ</span>${range('teAlpha', 0.15, 1, 0.05, T.alpha, pct(T.alpha))}</div>
      <div class="te-sel"><b>${sel ? DEF[sel].name : 'ボタンを選んでください'}</b></div>
      ${sel ? `<div class="row"><span>大きさ</span>${range('teSize', 0.5, 2, 0.05, L.s, '×' + L.s.toFixed(2))}</div>
      <div class="row"><span>濃さ</span>${range('teA', 0.15, 1, 0.05, L.a, pct(L.a))}</div>
      ${NO_HIDE.includes(sel) ? '' : `<div class="row"><span>表示</span>${seg('teShow', [['1', '出す'], ['0', '隠す']], L.hide ? '0' : '1')}</div>`}` : ''}
      <div class="menu"><button class="btn sub small" id="teReset">初期に戻す</button><button class="btn small" id="teDone">完了</button></div>
    </div>`);
    ed.querySelectorAll<HTMLElement>('.tb').forEach(el => el.classList.toggle('sel', el.dataset.id === sel));
    const upd = () => { place(ed); place(layer); saveSettings(); };
    const rangeBind = (id: string, fn: (v: number) => string) => { const el = $(id) as HTMLInputElement; if (el) el.oninput = () => { $(id + 'V').textContent = fn(+el.value); upd(); }; };
    rangeBind('teAlpha', v => { T.alpha = v; return pct(v); });
    rangeBind('teSize', v => { setLay(sel, { s: v }); return '×' + v.toFixed(2); });
    rangeBind('teA', v => { setLay(sel, { a: v }); return pct(v); });
    ed.querySelectorAll<HTMLElement>('#teShow button').forEach(b => b.onclick = () => { setLay(sel, { hide: b.dataset.v === '0' }); upd(); render(); });
    $('teReset').onclick = () => { T.lay = {}; T.alpha = 1; upd(); render(); };
    $('teDone').onclick = () => { ed.remove(); place(layer); };
    // ボタンを選んで、引っぱって動かす
    ed.querySelectorAll<HTMLElement>('.tb').forEach(el => {
      el.onpointerdown = e => {
        e.preventDefault();
        const id = el.dataset.id, L0 = lay(id), ox = e.clientX - L0.x * innerWidth, oy = e.clientY - L0.y * innerHeight;
        let moved = false;
        try { el.setPointerCapture(e.pointerId); } catch (err) {}
        el.onpointermove = ev => {
          moved = true;
          setLay(id, { x: Math.max(0.02, Math.min(0.98, (ev.clientX - ox) / innerWidth)), y: Math.max(0.03, Math.min(0.97, (ev.clientY - oy) / innerHeight)) });
          place(ed);
        };
        el.onpointerup = el.onpointercancel = () => {
          el.onpointermove = null;
          if (moved) upd();
          if (sel !== id) { sel = id; render(); }   // 選んだボタンの設定を出す（動かし終わってから描き直す）
        };
      };
    });
  };
  render();
}
