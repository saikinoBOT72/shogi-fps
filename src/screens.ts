// タイトル・駒選択・設定・操作方法・一時停止・結果画面
import { gs } from './state';
import { $, DEFAULT_KEYS, DIFFS, KEY_ACTIONS, PIECES, QUALITIES, QUALITY_AT_LOAD, SKILLS, WEAPONS, keyName, saveSettings, settings } from './core';
import { SFX } from './audio';
import { requestLock } from './input';
import { bot, botActor, player, playerActor, resetMatch, resolveFoe, stats } from './game';
import { VM } from './effects';
import { SKINS } from './guns/skins';
import { initPips } from './hud';
import { BoardMode } from './boardmode';
import { Net } from './net';
import { leave, showLobby, showOnline } from './online';

// ================= 共通 =================
export function overlay(html, dim?) {
  const o = $('overlay'); o.innerHTML = html; o.style.display = 'flex'; o.classList.toggle('dim', !!dim);
  o.scrollTop = 0;
}
export const hideOverlay = () => { $('overlay').style.display = 'none'; };
const on = (id: string, fn: () => void) => { const el = $(id); if (el) el.onclick = e => { e.stopPropagation(); fn(); }; };
const koma = (ch: string, extra = '') => `<b class="koma${extra}">${ch}</b>`;

// ================= 設定 =================
export function settingsHTML() {
  const seg = (id, items, cur) => `<div class="seg" id="${id}">${items.map(([k, name]) => `<button data-v="${k}" class="${cur === k ? 'on' : ''}">${name}</button>`).join('')}</div>`;
  return `<div class="panel form">
    <div class="row"><span>CPUの強さ</span>${seg('diffSeg', Object.entries(DIFFS).map(([k, d]: any) => [k, d.name]), settings.diff)}</div>
    <div class="row"><span>マウス感度 <b id="sensV">${settings.sens.toFixed(2)}</b></span><input id="sens" type="range" min="0.2" max="3" step="0.05" value="${settings.sens}"></div>
    <div class="row"><span>画質<small>重いときは「低」</small></span>${seg('qSeg', Object.entries(QUALITIES).map(([k, q]: any) => [k, q.name]), settings.quality)}</div>
    <div class="row"><span>FPS表示</span>${seg('fpsSeg', [['1', 'ON'], ['0', 'OFF']], settings.showFps ? '1' : '0')}</div>
    <div class="row"><span>ハンドガンの塗装</span>${seg('skinSeg', Object.entries(SKINS).map(([k, s]) => [k, s.name]), settings.gunSkin)}</div>
    <div class="row"><span>音量</span><input id="vol" type="range" min="0" max="1" step="0.05" value="${settings.vol}"></div>
  </div>`;
}
export function bindSettings() {
  const segBind = (id, fn) => document.querySelectorAll<HTMLElement>(`#${id} button`).forEach(b => b.onclick = e => {
    e.stopPropagation(); fn(b.dataset.v); saveSettings();
    document.querySelectorAll<HTMLElement>(`#${id} button`).forEach(x => x.classList.toggle('on', x === b));
  });
  segBind('diffSeg', v => { settings.diff = v; });
  segBind('qSeg', v => { settings.quality = v; if (gs.state === 'title') location.reload(); });   // 画質は作り直しが必要なので再読み込み
  segBind('skinSeg', v => { settings.gunSkin = v; VM.setSkin(v); [playerActor, botActor].forEach(a => a && a.gun.setSkin && WEAPONS[PIECES[a.type].weapon].model === 'pistol' && a.gun.setSkin(v)); });
  segBind('fpsSeg', v => { settings.showFps = v === '1'; if (!settings.showFps) $('fps').textContent = ''; });
  $('sens').oninput = e => { settings.sens = +e.target.value; $('sensV').textContent = settings.sens.toFixed(2); saveSettings(); };
  $('vol').oninput = e => { settings.vol = +e.target.value; SFX.setVol(settings.vol); saveSettings(); };
  ['sens', 'vol'].forEach(id => $(id).onclick = e => e.stopPropagation());
}
function showSettings(back: () => void) {
  overlay(`<div class="screen">
    <h2 class="h">設定</h2>
    ${settingsHTML()}
    <div class="menu"><button class="btn sub" id="back">戻る</button></div>
  </div>`, true);
  bindSettings();
  on('back', back);
}

// ================= 操作方法 =================
// 操作説明（スキルは今の駒に合わせる）
export const keysHTML = (edit = false) => {
  const sks = (PIECES[gs.matchCtx ? gs.matchCtx.myType : settings.myPiece] || PIECES.P).skills.map(k => SKILLS[k]);
  const K = (settings as any).keys;
  const k = (key, what) => `<div><kbd>${key}</kbd><span>${what}</span></div>`;
  const bind = ([a, what]) => edit
    ? `<div><button class="kbd-btn" data-a="${a}">${keyName(K[a])}</button><span>${skillLine(a, what)}</span></div>`
    : k(keyName(K[a]), skillLine(a, what));
  function skillLine(a, what) {
    const i = a === 'skill' ? 0 : a === 'skill2' ? 1 : -1;
    if (i < 0) return what;
    return sks[i] ? `${what}：${sks[i].name}（${sks[i].help}）` : `${what}：なし`;
  }
  return `<div class="keys">
    ${KEY_ACTIONS.map(bind).join('')}${k('ホイール', '武器の切り替え')}${k('マウス', '狙う')}${k('左クリック', '撃つ（弓は長押しで引く）')}${k('右クリック', '覗き込み')}${k('ESC', '一時停止')}
  </div>`;
};
// キー設定：ボタンを押してから、割り当てたいキーを押す（ESC でやめる）。同じキーを使っていた操作とは入れ替える
function bindKeys(rerender: () => void) {
  document.querySelectorAll<HTMLElement>('.kbd-btn').forEach(b => b.onclick = e => {
    e.stopPropagation();
    if (gs.rebinding) return;
    gs.rebinding = true; b.textContent = 'キーを押す…'; b.classList.add('wait');
    const done = (code: string) => {
      removeEventListener('keydown', onKey, true); removeEventListener('mousedown', onMouse, true);
      gs.rebinding = false;
      const K = (settings as any).keys, a = b.dataset.a;
      if (code !== 'Escape') {
        const other = Object.keys(K).find(x => x !== a && K[x] === code);
        if (other) K[other] = K[a];
        K[a] = code; saveSettings();
      }
      rerender();
    };
    const onKey = (ev: KeyboardEvent) => { ev.preventDefault(); ev.stopPropagation(); done(ev.code); };
    // 左・右クリックは撃つ・覗き込み用なので、それ以外（ホイールボタン・横のボタン）だけ
    const onMouse = (ev: MouseEvent) => { if (ev.button === 0 || ev.button === 2) return; ev.preventDefault(); ev.stopPropagation(); done('Mouse' + ev.button); };
    setTimeout(() => { addEventListener('keydown', onKey, true); addEventListener('mousedown', onMouse, true); }, 0);
  });
}
function showControls(back: () => void) {
  const rows = Object.values(PIECES).map((p: any) => {
    const w = WEAPONS[p.weapon];
    return `<tr><td>${koma(p.name, ' s')}</td><td>${w.name}</td><td>${p.skills.map(k => `<b>${SKILLS[k].name}</b>　${SKILLS[k].help}`).join('<br>') || 'なし'}</td></tr>`;
  }).join('');
  overlay(`<div class="screen wide">
    <h2 class="h">操作方法</h2>
    <div class="panel">${keysHTML(true)}<p class="note">キーをクリックして、割り当てたいキーを押すと変えられます</p></div>
    <div class="panel"><table class="skills">${rows}</table></div>
    <div class="menu"><button class="btn sub" id="resetKeys">キーを初期設定に</button><button class="btn sub" id="back">戻る</button></div>
  </div>`, true);
  bindKeys(() => showControls(back));
  on('resetKeys', () => { (settings as any).keys = Object.assign({}, DEFAULT_KEYS); saveSettings(); showControls(back); });
  on('back', back);
}

// ================= タイトル =================
export function showTitle() {
  gs.state = 'title'; $('hud').style.display = 'none';
  overlay(`<div class="screen title">
    <div class="logo">将棋<span>FPS</span></div>
    <div class="tagline">駒を取るときは、撃ち合いで決める。</div>
    <div class="modes">
      <button class="mode" id="goBoard"><b>将棋モード</b><small>盤で指して、駒を取るときは撃ち合い</small></button>
      <button class="mode" id="goDuel"><b>撃ち合い</b><small>好きな駒どうしで 1 対 1</small></button>
      <button class="mode" id="goOnline"><b>友達と対戦</b><small>部屋のコードで友達と撃ち合い</small></button>
    </div>
    <div class="menu"><button class="btn sub" id="openSettings">設定</button><button class="btn sub" id="openControls">操作方法</button></div>
  </div>`);
  on('goBoard', () => BoardMode.open());
  on('goDuel', showPieceSelect);
  on('goOnline', () => showOnline());
  on('openSettings', () => showSettings(showTitle));
  on('openControls', () => showControls(showTitle));
}

// ================= 駒選択（撃ち合い） =================
// 駒の紹介カード
export function pieceCard(k) {
  const p = PIECES[k], w = WEAPONS[p.weapon];
  return `${koma(p.name)}<span class="val">価値 ${p.value >= 99 ? '∞' : p.value}</span><span>HP ${p.hp}</span><span>${w.name}</span>`;
}
export function pieceSelectHTML() {
  const opts = (sel, id, withRandom) => `<div class="pick" id="${id}">${Object.keys(PIECES).map(k =>
    `<button data-k="${k}" class="${sel === k ? 'on' : ''}">${pieceCard(k)}</button>`).join('')}${withRandom
    ? `<button data-k="random" class="${sel === 'random' ? 'on' : ''}">${koma('？')}<span class="val">ランダム</span></button>` : ''}</div>`;
  const me = PIECES[settings.myPiece] || PIECES.P;
  return `<section class="panel"><h3>あなたの駒</h3>${opts(settings.myPiece, 'pickMe', false)}
      <p class="detail">${koma(me.name, ' s')}<b>${WEAPONS[me.weapon].name}</b>　${me.skills.map(k => `スキル「${SKILLS[k].name}」：${SKILLS[k].help}`).join('　') || 'スキルなし'}</p></section>
    <div class="vs-mark">VS</div>
    <section class="panel"><h3>相手の駒</h3>${opts(settings.foePiece, 'pickFoe', true)}</section>`;
}
export function bindPieceSelect() {
  const bind = (id, key) => document.querySelectorAll<HTMLElement>(`#${id} button`).forEach(b => b.onclick = e => {
    e.stopPropagation();
    settings[key] = b.dataset.k; saveSettings();
    resetMatch(); showPieceSelect();
  });
  bind('pickMe', 'myPiece'); bind('pickFoe', 'foePiece');
}
function showPieceSelect() {
  gs.state = 'title';
  overlay(`<div class="screen wide">
    <h2 class="h">撃ち合い</h2>
    ${pieceSelectHTML()}
    <div class="menu"><button class="btn sub" id="back">戻る</button><button class="btn" id="go">対局開始</button></div>
  </div>`, true);
  bindPieceSelect();
  on('back', showTitle);
  on('go', startMatch);
}

// ================= 一時停止 =================
export function showPause() {
  overlay(`<div class="screen">
    <h2 class="h big">${Net.on ? 'メニュー' : '一時停止'}</h2>
    <div class="menu col">
      <button class="btn" id="resume">再開</button>
      <button class="btn sub" id="pSettings">設定</button>
      <button class="btn sub" id="pControls">操作方法</button>
      <button class="btn sub" id="quit">タイトルへ</button>
    </div>
    <p class="note">${Net.on ? '友達との対戦は止まっていません！ 画面をクリックで戻る' : '画面をクリックしても再開できます'}</p>
  </div>`, true);
  on('resume', () => { SFX.init(); requestLock(); });
  on('pSettings', () => showSettings(showPause));
  on('pControls', () => showControls(showPause));
  on('quit', () => {
    gs.paused = false;
    if (Net.on) { leave(); return; }
    if (gs.matchCtx) BoardMode.abort();
    if (settings.quality !== QUALITY_AT_LOAD) { location.reload(); return; }
    resetMatch(); showTitle();
  });
}

// ================= 結果 =================
export function showResult(win) {
  $('hud').style.display = 'none';
  if (gs.matchCtx) { BoardMode.battleResult(win); return; }   // 将棋モードなら盤面へ
  const acc = stats.shots ? Math.round(stats.hits / stats.shots * 100) : 0;
  overlay(`<div class="screen">
    <div class="res ${win === true ? 'win' : win === false ? 'lose' : ''}">${win === true ? '勝利' : win === false ? '敗北' : '引き分け'}</div>
    <div class="stats">
      <div><b>${acc}%</b><span>命中率 (${stats.hits}/${stats.shots})</span></div>
      <div><b>${stats.heads}</b><span>ヘッドショット</span></div>
      <div><b>${Math.round(stats.dealt)}</b><span>与ダメージ</span></div>
      <div><b>${stats.time.toFixed(1)}s</b><span>決着タイム</span></div>
    </div>
    <div class="menu">
      <button class="btn sub" id="toTitle">${Net.on ? '部屋から抜ける' : 'タイトルへ'}</button>
      <button class="btn" id="again">${Net.on ? 'もう一戦（駒を選ぶ）' : 'もう一局'}</button>
    </div>
  </div>`, true);
  if (Net.on) { on('again', () => { resetMatch(); showLobby(); }); on('toTitle', leave); return; }
  on('again', startMatch);
  on('toTitle', () => { resetMatch(); showTitle(); });
}

// ================= 対局の開始・一時停止 =================
export function startMatch(foeType?: string) {
  SFX.init();
  resetMatch(foeType || (gs.matchCtx ? gs.matchCtx.foeType : resolveFoe()));
  initPips();
  $('meName').textContent = `${player.def.name}　${player.w.name}`;
  $('foeTag').textContent = bot.def.name;
  $('center').textContent = '';
  gs.state = 'countdown'; gs.stateT = 0; gs.paused = true;
  playerActor.root.visible = false;
  // オンライン：相手の合図で始まるので、クリックしてから操作（カウントダウンは進む）
  if (Net.on) overlay(`<div class="screen"><h2 class="h big">まもなく開始</h2><p>画面をクリックして操作を始める</p>${keysHTML()}</div>`, true);
  else requestLock();
}
export function onLocked() {
  if (gs.state === 'countdown' || gs.state === 'fight') {
    gs.paused = false; hideOverlay(); $('hud').style.display = 'block';
    if ($('tune')) $('tune').style.display = 'none';
  }
}
export function pause() {
  if (gs.paused) return;
  gs.paused = true; gs.mouseDown = false; gs.rightDown = false;
  showPause();
}
$('overlay').addEventListener('click', () => { if (gs.paused && (gs.state === 'countdown' || gs.state === 'fight')) { SFX.init(); requestLock(); } });
