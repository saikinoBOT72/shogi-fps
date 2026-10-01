// タイトル・駒選択・設定・操作方法・一時停止・結果画面
import { gs } from './state';
import { $, DEFAULT_KEYS, DEV_PASSWORD, DIFFS, KEY_ACTIONS, PIECES, QUALITIES, QUALITY_AT_LOAD, SKILLS, WEAPONS, keyName, saveSettings, settings } from './core';
import { SFX } from './audio';
import { requestLock } from './input';
import { bot, botActor, paintActors, player, playerActor, resetMatch, resolveFoe, resolveMe, stats } from './game';
import { VM } from './effects';
import { initPips } from './hud';
import { BoardMode } from './boardmode';
import { Net } from './net';
import { leave, resetNetMatch, showLobby, showOnline } from './online';
import { MAP_LIST, applyAtmos, playableMap, selectableMaps } from './world';
import { pointsText } from './loadout';
import { showInventory } from './inventory';
import { showGacha } from './gacha';
import { showAccount, POLICY_LINK } from './accountScreen';
import { showQuests, takeLoginBonus } from './questScreen';
import { showMarket } from './marketScreen';
import { Account, accountAvailable, onAccountChange } from './account';
import { VS_TIME, showVsCut } from './vscut';

// ================= 共通 =================
// 画面を出す。同じ画面を描き直すとき（見出しが同じ）は、スクロールの位置を保ち、出てくる動きもつけない
export function overlay(html, dim?) {
  const o = $('overlay'), shown = o.style.display === 'flex', top = o.scrollTop;
  const key = () => o.querySelector('.h, .res, .ga-head h2')?.textContent || '';
  const before = shown ? key() : null;
  o.innerHTML = html; o.style.display = 'flex'; o.classList.toggle('dim', !!dim);
  const same = before !== null && before === key();
  o.scrollTop = same ? top : 0;
  if (!same) { o.classList.remove('enter'); void o.offsetWidth; o.classList.add('enter'); }
}
export const hideOverlay = () => { $('overlay').style.display = 'none'; };
const on = (id: string, fn: () => void) => { const el = $(id); if (el) el.onclick = e => { e.stopPropagation(); fn(); }; };
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const koma = (ch: string, extra = '') => `<b class="koma${extra}">${ch}</b>`;

// ================= 設定 =================
export function settingsHTML() {
  const seg = (id, items, cur) => `<div class="seg" id="${id}">${items.map(([k, name]) => `<button data-v="${k}" class="${cur === k ? 'on' : ''}">${name}</button>`).join('')}</div>`;
  return `<div class="panel form">
    <div class="row"><span>CPUの強さ</span>${seg('diffSeg', Object.entries(DIFFS).map(([k, d]: any) => [k, d.name]), settings.diff)}</div>
    <div class="row"><span>マウス感度<small>VALORANT と同じ数値</small> <input id="sensV" type="number" min="0.01" max="10" step="0.001" value="${settings.sens}" style="width:5.5em"></span><input id="sens" type="range" min="0.05" max="2" step="0.005" value="${settings.sens}"></div>
    <div class="row"><span>画質<small>重いときは「低」</small></span>${seg('qSeg', Object.entries(QUALITIES).map(([k, q]: any) => [k, q.name]), settings.quality)}</div>
    <div class="row"><span>FPS表示</span>${seg('fpsSeg', [['1', 'ON'], ['0', 'OFF']], settings.showFps ? '1' : '0')}</div>
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
  segBind('fpsSeg', v => { settings.showFps = v === '1'; if (!settings.showFps) $('fps').textContent = ''; });
  $('sens').oninput = e => { settings.sens = +e.target.value; $('sensV').value = String(settings.sens); saveSettings(); };
  $('sensV').oninput = e => { const v = +e.target.value; if (!(v > 0)) return; settings.sens = v; $('sens').value = String(v); saveSettings(); };
  $('sensV').onkeydown = e => e.stopPropagation();   // 数字を打つときにゲームの操作に取られないように
  $('vol').oninput = e => { settings.vol = +e.target.value; SFX.setVol(settings.vol); saveSettings(); };
  ['sens', 'sensV', 'vol'].forEach(id => $(id).onclick = e => e.stopPropagation());
}
function showSettings(back: () => void) {
  overlay(`<div class="screen">
    <h2 class="h">設定</h2>
    ${settingsHTML()}
    <div class="menu"><button class="btn sub" id="devBtn">開発者</button><button class="btn sub" id="back">戻る</button></div>
  </div>`, true);
  bindSettings();
  on('devBtn', () => showDevLogin(() => showSettings(back)));
  on('back', back);
}

// ================= 開発者メニュー（パスワードで開く） =================
function showDevLogin(back: () => void) {
  overlay(`<div class="screen">
    <h2 class="h">開発者メニュー</h2>
    <div class="panel form"><div class="row"><span>パスワード</span><input id="devPw" type="password" style="width:9em"></div><p class="note" id="devErr"></p></div>
    <div class="menu"><button class="btn" id="devOk">開く</button><button class="btn sub" id="back">戻る</button></div>
  </div>`, true);
  const pw = $('devPw'); pw.focus();
  const ok = () => { if (pw.value === DEV_PASSWORD) showDevMenu(back); else { $('devErr').textContent = 'パスワードが違います'; pw.value = ''; } };
  pw.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') ok(); };
  pw.onclick = e => e.stopPropagation();
  on('devOk', ok);
  on('back', back);
}
function showDevMenu(back: () => void) {
  const D = (settings as any).dev;
  const seg = (id, cur) => `<div class="seg" id="${id}">${[['1', 'ON'], ['0', 'OFF']].map(([k, n]) => `<button data-v="${k}" class="${cur === k ? 'on' : ''}">${n}</button>`).join('')}</div>`;
  overlay(`<div class="screen">
    <h2 class="h">開発者メニュー</h2>
    <div class="panel form">
      <div class="row"><span>未公開マップ<small>オンにすると選べる（${MAP_LIST.filter(m => m[2]).map(m => m[1]).join('・')}）</small></span>${seg('devMaps', D.hiddenMaps ? '1' : '0')}</div>
      <div class="row"><span>オートエイム<small>押している間、相手の頭に照準が吸い付く</small></span>
        <span><button class="kbd-btn" id="devAim">${D.aimKey ? keyName(D.aimKey) : 'なし'}</button> <button class="small" id="devAimClear">なしにする</button></span></div>
    </div>
    <div class="menu"><button class="btn sub" id="back">戻る</button></div>
  </div>`, true);
  document.querySelectorAll<HTMLElement>('#devMaps button').forEach(b => b.onclick = e => { e.stopPropagation(); D.hiddenMaps = b.dataset.v === '1'; saveSettings(); showDevMenu(back); });
  on('devAimClear', () => { D.aimKey = ''; saveSettings(); showDevMenu(back); });
  // キー設定と同じ：押してから割り当てたいキー（またはホイール・横のボタン）を押す。ESC でやめる
  on('devAim', () => {
    if (gs.rebinding) return;
    gs.rebinding = true; $('devAim').textContent = 'キーを押す…';
    const done = (code: string) => {
      removeEventListener('keydown', onKey, true); removeEventListener('mousedown', onMouse, true);
      gs.rebinding = false;
      if (code !== 'Escape') { D.aimKey = code; saveSettings(); }
      showDevMenu(back);
    };
    const onKey = (ev: KeyboardEvent) => { ev.preventDefault(); ev.stopPropagation(); done(ev.code); };
    const onMouse = (ev: MouseEvent) => { if (ev.button === 0 || ev.button === 2) return; ev.preventDefault(); ev.stopPropagation(); done('Mouse' + ev.button); };
    setTimeout(() => { addEventListener('keydown', onKey, true); addEventListener('mousedown', onMouse, true); }, 0);
  });
  on('back', back);
}

// ================= 操作方法 =================
// 操作説明（スキルは今の駒に合わせる）
export const keysHTML = (edit = false) => {
  const sks = (PIECES[gs.matchCtx ? gs.matchCtx.myType : player ? player.type : settings.myPiece] || PIECES.P).skills.map(k => SKILLS[k]);
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
// ログインの状態が変わったら、タイトルの名前とポイントを出し直す（読み込みの順の都合で、最初に出したときに登録）
let titleListen = false;
export function showTitle() {
  if (!titleListen) { titleListen = true; onAccountChange(() => { if (gs.state === 'title' && $('goSolo')) showTitle(); }); }
  gs.state = 'title'; $('hud').style.display = 'none';
  if (takeLoginBonus(showTitle)) return;   // その日の最初：ログインボーナスを見せてからタイトルへ
  overlay(`<div class="screen title">
    ${accountAvailable ? `<button class="acct-chip" id="openAcct">${!Account.ready ? '…' : Account.user ? `<small>${Account.user.isAnonymous ? 'ゲスト' : 'ログイン中'}</small><b>${esc(Account.name)}</b>` : '<b>ログイン</b>'}</button>` : ''}
    <div class="pts title-pts"><small>ポイント</small><b>${pointsText()}</b></div>
    <div class="logo">将棋<span>FPS</span></div>
    <div class="beta">ベータ版</div>
    <div class="tagline">駒を取るときは、一騎打ちで決める。</div>
    <div class="modes">
      <button class="mode" id="goSolo"><b>一人で遊ぶ</b><small>CPU と将棋モード・一騎打ち</small></button>
      <button class="mode" id="goOnline"><b>友達と遊ぶ</b><small>部屋のコードで友達と対戦</small></button>
    </div>
    <div class="menu"><button class="btn" id="openGacha">ガチャ</button><button class="btn sub" id="openQuests">クエスト</button><button class="btn sub" id="openMarket">マーケット</button><button class="btn sub" id="openInv">持ち物</button><button class="btn sub" id="openSettings">設定</button><button class="btn sub" id="openControls">操作方法</button></div>
    <div class="title-foot">${POLICY_LINK}</div>
  </div>`);
  document.querySelectorAll<HTMLElement>('.policy-link').forEach(a => a.onclick = e => e.stopPropagation());
  on('openAcct', () => showAccount(showTitle));
  on('openQuests', () => showQuests(showTitle));
  on('openMarket', () => showMarket(showTitle));
  on('goSolo', showSolo);
  on('goOnline', () => showOnline());
  on('openGacha', () => showGacha(showTitle));
  on('openInv', () => showInventory(showTitle));
  on('openSettings', () => showSettings(showTitle));
  on('openControls', () => showControls(showTitle));
}

// マップ（v: { map }。dis: 選べない＝部屋を作った人が決める）。山寺の暗さは「こわい」で固定
// 未公開のマップは、開発者メニューでオンにした人だけに出る（相手が選んだときは、選べない表示のまま見える）
export function mapPickHTML(v, dis = false, title = 'マップ', withRandom = false) {   // withRandom：「ランダム」も選べる（一人で遊ぶとき）
  const list: [string, string][] = MAP_LIST.filter(m => selectableMaps().includes(m) || (dis && m[0] === v.map)).map(m => [m[0], m[1]]);
  if (withRandom) list.push(['random', 'ランダム']);
  const cur = dis ? v.map : withRandom && v.map === 'random' ? 'random' : playableMap(v.map);
  const seg = (id, items, cur) => `<div class="seg" id="${id}">${items.map(([k, n]) => `<button data-v="${k}" class="${cur === k ? 'on' : ''}"${dis ? ' disabled' : ''}>${n}</button>`).join('')}</div>`;
  return `<div class="panel form"><div class="row"><span>${title}</span>${seg('mapSeg', list, cur)}</div></div>`;
}
export function bindMapPick(onPick: (key: 'map' | 'dark', v: string) => void) {
  for (const [id, key] of [['mapSeg', 'map'], ['darkSeg', 'dark']] as const)
    document.querySelectorAll<HTMLElement>(`#${id} button`).forEach(b => b.onclick = e => { e.stopPropagation(); onPick(key, b.dataset.v); });
}
// 一人で遊ぶ：CPU と
function showSolo() {
  gs.state = 'title';
  overlay(`<div class="screen title">
    <h2 class="h">一人で遊ぶ</h2>
    ${mapPickHTML(settings, false, 'マップ', true)}
    <div class="modes">
      <button class="mode" id="goBoard"><b>将棋モード</b><small>盤で指して、駒を取るときは一騎打ち（ステージは守る側が選ぶ）</small></button>
      <button class="mode" id="goDuel"><b>一騎打ち</b><small>好きな駒どうしで 1 対 1</small></button>
    </div>
    <div class="menu"><button class="btn sub" id="back">戻る</button></div>
  </div>`);
  bindMapPick((k, v) => { settings[k] = v; saveSettings(); if (k === 'map') resetMatch(); else applyAtmos(); showSolo(); });
  on('goBoard', () => BoardMode.open());
  on('goDuel', showPieceSelect);
  on('back', showTitle);
}

// ================= 駒選択（一騎打ち） =================
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
  return `<section class="panel"><h3>あなたの駒</h3>${opts(settings.myPiece, 'pickMe', true)}
      <p class="detail">${settings.myPiece === 'random' ? `${koma('？', ' s')}<b>ランダム</b>　対局ごとに、どの駒になるかが変わる`
        : `${koma(me.name, ' s')}<b>${WEAPONS[me.weapon].name}</b>　${me.skills.map(k => `スキル「${SKILLS[k].name}」：${SKILLS[k].help}`).join('　') || 'スキルなし'}`}</p></section>
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
    <h2 class="h">一騎打ち</h2>
    ${pieceSelectHTML()}
    <div class="menu"><button class="btn sub" id="back">戻る</button><button class="btn" id="go">対局開始</button></div>
  </div>`, true);
  bindPieceSelect();
  on('back', showSolo);
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
  if (Net.on) resetNetMatch();
  resetMatch(foeType || (gs.matchCtx ? gs.matchCtx.foeType : resolveFoe()), gs.matchCtx ? undefined : resolveMe());
  initPips();
  $('meName').textContent = `${player.def.name}　${player.w.name}`;
  $('foeTag').textContent = bot.def.name;
  $('center').textContent = '';
  gs.state = 'countdown'; gs.stateT = -VS_TIME; gs.paused = true;   // マイナスの間は VS カット
  const hideFoe = gs.matchCtx && BoardMode.blind;   // ブラインド将棋：盤と同じく相手の駒は伏せる
  showVsCut({ def: player.def, w: player.w, nm: Account.user ? Account.name : '' },
    hideFoe ? { def: { name: '？' }, w: { name: '？' }, nm: gs.foeName } : { def: bot.def, w: bot.w, nm: Net.on ? gs.foeName : 'CPU' });
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
// ボタンを押した音（画面のどのボタンでも）
addEventListener('pointerdown', e => { if ((e.target as HTMLElement).closest && (e.target as HTMLElement).closest('button')) { SFX.init(); SFX.play('btn'); } }, true);
$('overlay').addEventListener('click', () => { if (gs.paused && (gs.state === 'countdown' || gs.state === 'fight')) { SFX.init(); requestLock(); } });
