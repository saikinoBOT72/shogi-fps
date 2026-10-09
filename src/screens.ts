// タイトル・駒選択・設定・操作方法・一時停止・結果画面
import { gs } from './state';
import { $, DEFAULT_KEYS, DEV_PASSWORD, DIFFS, KEY_ACTIONS, PIECES, pieceUsable, specialOn, QUALITIES, QUALITY_AT_LOAD, SKILLS, WEAPONS, keyName, saveSettings, settings } from './core';
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
import { showHero } from './hero';
import { bindTouchSettings, touchSettingsHTML } from './touch';
import { openBalance } from './balance';

// ================= 共通 =================
const H_EN: Record<string, string> = {
  一人で遊ぶ: 'Solo', 設定: 'Settings', 操作方法: 'Controls', 開発者メニュー: 'Developer', 一時停止: 'Paused', メニュー: 'Menu', まもなく開始: 'Get ready',
  アカウント: 'Account', 持ち物: 'Collection', マーケット: 'Market', クエスト: 'Quests', ログインボーナス: 'Daily bonus', 友達と対戦: 'Friends', ガチャ: 'Gacha', 将棋モード: 'Shogi',
};
// 画面を出す。同じ画面を描き直すとき（見出しが同じ）は、スクロールの位置を保ち、出てくる動きもつけない
export function overlay(html, dim?) {
  const o = $('overlay'), shown = o.style.display === 'flex', top = o.scrollTop;
  const key = () => o.querySelector('.h, .res, .ga-head h2')?.textContent || '';
  const before = shown ? key() : null;
  o.innerHTML = html; o.style.display = 'flex'; o.classList.toggle('dim', !!dim);
  // 見出しの横に小さな英語（ゲームの画面らしく）。決まった見出しだけ
  o.querySelectorAll('.h').forEach(h => {
    const en = H_EN[(h.firstChild?.textContent || '').trim()];
    if (en && !h.querySelector('.en')) h.insertAdjacentHTML('beforeend', `<span class="en">${en}</span>`);
  });
  const same = before !== null && before === key();
  o.scrollTop = same ? top : 0;
  o.classList.remove('enter');   // 同じ画面の描き直し（設定のボタンを押したときなど）では出てくる動きをつけない（チカチカする）
  if (!same) { void o.offsetWidth; o.classList.add('enter'); }
}
export const hideOverlay = () => { $('overlay').style.display = 'none'; };
const on = (id: string, fn: () => void) => { const el = $(id); if (el) el.onclick = e => { e.stopPropagation(); fn(); }; };
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const koma = (ch: string, extra = '') => `<b class="koma${extra}">${ch}</b>`;
// 勝ち負け・駒を取った瞬間の判子（朱の四角に白い字＋下に小さく英語）。sumi：引き分けなど朱でないとき / cls：大きさ（'mid' で一回り小さく）
export const sealHTML = (txt: string, en = '', sumi = false, cls = '') =>
  `<div class="res${cls ? ' ' + cls : ''}"><span class="seal stamp${sumi ? ' sumi' : ''}">${txt}</span>${en ? `<em>${en}</em>` : ''}</div>`;

// ================= 設定 =================
export function settingsHTML() {
  const seg = (id, items, cur) => `<div class="seg" id="${id}">${items.map(([k, name]) => `<button data-v="${k}" class="${cur === k ? 'on' : ''}">${name}</button>`).join('')}</div>`;
  return `<div class="panel form">
    <div class="row"><span>CPUの強さ</span>${seg('diffSeg', Object.entries(DIFFS).map(([k, d]: any) => [k, d.name]), settings.diff)}</div>
    <div class="row"><span>画質<small>重いときは「低」</small></span>${seg('qSeg', Object.entries(QUALITIES).map(([k, q]: any) => [k, q.name]), settings.quality)}</div>
    <div class="row"><span>自動で解像度を下げる<small>重いとき画面を粗くして FPS を保つ。良い PC なら OFF</small></span>${seg('autoResSeg', [['1', 'ON'], ['0', 'OFF']], settings.autoRes ? '1' : '0')}</div>
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
  segBind('autoResSeg', v => { settings.autoRes = v === '1'; });   // OFF にしたら、下がっていた解像度は perfTick ですぐ元に戻る
  segBind('fpsSeg', v => { settings.showFps = v === '1'; if (!settings.showFps) $('fps').textContent = ''; });
  $('vol').oninput = e => { settings.vol = +e.target.value; SFX.setVol(settings.vol); saveSettings(); };
  $('vol').onclick = e => e.stopPropagation();
}
// タブ：共通 / キーマウ操作（マウス感度・キー設定・駒とスキルの説明）/ タッチ操作（touch.ts）。タッチの端末なら最初はタッチのタブ
let setTab = '';
const SET_TABS: [string, string][] = [['common', '共通'], ['km', 'キーマウ操作'], ['touch', 'タッチ操作']];
function showSettings(back: () => void) {
  if (!setTab) setTab = document.body.classList.contains('touch') ? 'touch' : 'common';
  const again = () => showSettings(back);
  const body = setTab === 'km' ? kmHTML() : setTab === 'touch' ? touchSettingsHTML() : settingsHTML();
  overlay(`<div class="screen${setTab === 'common' ? '' : ' wide'}">
    <h2 class="h">設定</h2>
    <div class="seg set-tabs" id="setTabs">${SET_TABS.map(([k, n]) => `<button data-v="${k}" class="${setTab === k ? 'on' : ''}">${n}</button>`).join('')}</div>
    ${body}
    <div class="menu"><button class="btn sub" id="devBtn">開発者</button><button class="btn sub" id="back">戻る</button></div>
  </div>`, true);
  ($('overlay').querySelector('.screen') as HTMLElement).onclick = e => e.stopPropagation();   // 一時停止中に設定の中を押しても再開しないように
  document.querySelectorAll<HTMLElement>('#setTabs button').forEach(b => b.onclick = e => { e.stopPropagation(); setTab = b.dataset.v; again(); });
  if (setTab === 'km') bindKm(again);
  else if (setTab === 'touch') bindTouchSettings(again);
  else bindSettings();
  on('devBtn', () => showDevLogin(again));
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
      <div class="row"><span>特殊駒<small>オンにすると、一騎打ちの自分の駒・相手（CPU）の駒の欄に侍が出る</small></span>${seg('devSpecial', D.special ? '1' : '0')}</div>
      <div class="row"><span>駒の強さ表<small>今の数値で計算した一覧表・強さ指数・相性表</small></span><button class="small" id="devBalance">開く</button></div>
    </div>
    <div class="menu"><button class="btn sub" id="back">戻る</button></div>
  </div>`, true);
  document.querySelectorAll<HTMLElement>('#devMaps button').forEach(b => b.onclick = e => { e.stopPropagation(); D.hiddenMaps = b.dataset.v === '1'; saveSettings(); showDevMenu(back); });
  document.querySelectorAll<HTMLElement>('#devSpecial button').forEach(b => b.onclick = e => {
    e.stopPropagation();
    D.special = b.dataset.v === '1';
    if (!D.special) { if (!pieceUsable(settings.myPiece)) settings.myPiece = 'P'; if (PIECES[settings.foePiece]?.special) settings.foePiece = 'P'; }
    saveSettings(); showDevMenu(back);
  });
  on('devBalance', () => openBalance());
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
function kmHTML() {
  const rows = Object.values(PIECES).map((p: any) => {
    const w = WEAPONS[p.weapon];
    return `<tr><td>${koma(p.name, ' s')}</td><td>${w.name}</td><td>${p.skills.map(k => `<b>${SKILLS[k].name}</b>　${SKILLS[k].help}`).join('<br>') || 'なし'}</td></tr>`;
  }).join('');
  return `<div class="panel form">
      <div class="row"><span>マウス感度<small>VALORANT と同じ数値</small> <input id="sensV" type="number" min="0.01" max="10" step="0.001" value="${settings.sens}" style="width:5.5em"></span><input id="sens" type="range" min="0.05" max="2" step="0.005" value="${settings.sens}"></div>
    </div>
    <div class="panel">${keysHTML(true)}<p class="note">キーをクリックして、割り当てたいキーを押すと変えられます　<button class="small" id="resetKeys">キーを初期設定に</button></p></div>
    <div class="panel"><table class="skills">${rows}</table></div>`;
}
function bindKm(rerender: () => void) {
  $('sens').oninput = e => { settings.sens = +e.target.value; $('sensV').value = String(settings.sens); saveSettings(); };
  $('sensV').oninput = e => { const v = +e.target.value; if (!(v > 0)) return; settings.sens = v; $('sens').value = String(v); saveSettings(); };
  $('sensV').onkeydown = e => e.stopPropagation();   // 数字を打つときにゲームの操作に取られないように
  bindKeys(rerender);
  on('resetKeys', () => { (settings as any).keys = Object.assign({}, DEFAULT_KEYS); saveSettings(); rerender(); });
}

// ================= タイトル =================
// ログインの状態が変わったら、タイトルの名前とポイントを出し直す（読み込みの順の都合で、最初に出したときに登録）
let titleListen = false;
export function showTitle() {
  if (!titleListen) { titleListen = true; onAccountChange(() => { if (gs.state === 'title' && $('goSolo')) showTitle(); }); }
  gs.state = 'title'; $('hud').style.display = 'none';
  if (takeLoginBonus(showTitle)) return;   // その日の最初：ログインボーナスを見せてからタイトルへ
  // 左上にロゴ、左下に縦のメニュー、右に自分の駒（3D）
  const mi = (id: string, ja: string, en: string, big = false) => `<button class="mi${big ? ' big' : ''}" id="${id}">${ja}<small>${en}</small></button>`;
  overlay(`<div class="home">
    <div class="hero" id="homeHero"></div>
    <div class="logo">将棋<span class="fps">FPS</span><span class="lab">Shogi × FPS　<span class="beta">Beta</span></span><div class="tagline">駒を取るときは、一騎打ちで決める。</div></div>
    <nav class="home-menu">
      ${mi('goSolo', '一人で遊ぶ', 'Solo', true)}${mi('goOnline', '友達と遊ぶ', 'Friends', true)}
      ${mi('openGacha', 'ガチャ', 'Gacha')}${mi('openInv', '持ち物', 'Collection')}${mi('openQuests', 'クエスト', 'Quests')}${mi('openMarket', 'マーケット', 'Market')}
      ${mi('openSettings', '設定', 'Settings')}
    </nav>
    <div class="home-top">
      ${accountAvailable ? `<button class="acct-chip" id="openAcct">${!Account.ready ? '…' : Account.user ? `<small>${Account.user.isAnonymous ? 'ゲスト' : 'ログイン中'}</small><b>${esc(Account.name)}</b>` : '<b>ログイン</b>'}</button>` : ''}
      <div class="pts"><small>PT</small><b>${pointsText()}</b></div>
    </div>
    <div class="home-foot">${POLICY_LINK}</div>
  </div>`);
  showHero($('homeHero'), resolveMe());
  document.querySelectorAll<HTMLElement>('.policy-link').forEach(a => a.onclick = e => e.stopPropagation());
  on('openAcct', () => showAccount(showTitle));
  on('openQuests', () => showQuests(showTitle));
  on('openMarket', () => showMarket(showTitle));
  on('goSolo', showSolo);
  on('goOnline', () => showOnline());
  on('openGacha', () => showGacha(showTitle));
  on('openInv', () => showInventory(showTitle));
  on('openSettings', () => showSettings(showTitle));
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
    <div class="modes">
      <button class="mode" id="goBoard"><b>将棋モード</b><small>盤で指して、駒を取るときは一騎打ち（ステージは守る側が選ぶ）</small></button>
      <button class="mode" id="goDuel"><b>一騎打ち</b><small>好きな駒どうしで 1 対 1</small></button>
    </div>
    <div class="menu"><button class="btn sub" id="back">戻る</button></div>
  </div>`);
  on('goBoard', () => BoardMode.open());
  on('goDuel', showPieceSelect);
  on('back', showTitle);
}

// ================= 駒選択（一騎打ち） =================
// 駒の紹介カード（友達との部屋の駒選びで使う）
export function pieceCard(k) {
  const p = PIECES[k], w = WEAPONS[p.weapon];
  return `${koma(p.name)}<span class="val">価値 ${p.value >= 99 ? '∞' : p.value}</span><span>HP ${p.hp}</span><span>${w.name}</span>`;
}
// 駒の正式な名前と読み（駒選びの右側の見出し）
export const FULL_NAME = { 歩: ['歩兵', 'Fuhyo'], 香: ['香車', 'Kyosha'], 桂: ['桂馬', 'Keima'], 銀: ['銀将', 'Ginsho'], 金: ['金将', 'Kinsho'], 角: ['角行', 'Kakugyo'], 飛: ['飛車', 'Hisha'], 王: ['王将', 'Osho'], 侍: ['侍', 'Samurai'],
  と: ['と金', 'Tokin'], 杏: ['成香', 'Narikyo'], 圭: ['成桂', 'Narikei'], 全: ['成銀', 'Narigin'], 馬: ['竜馬', 'Ryuma'], 龍: ['竜王', 'Ryuo'], 帝: ['帝', 'Mikado'] };
// 性能（右側）：名前・価値・HP の目盛り・武器・スキル
export function pieceInfoHTML(k: string) {
  if (k === 'random') return `<div class="nm">？</div><span class="lab">Random</span><p class="note">対局ごとに、どの駒になるかが変わる</p>`;
  const p = PIECES[k] || PIECES.P, w = WEAPONS[p.weapon], [full, en] = FULL_NAME[p.name] || [p.name, ''], K = (settings as any).keys;
  const seg = Array.from({ length: 15 }, (_, i) => `<i class="${i < Math.round(p.hp / 10) ? '' : 'e'}"></i>`).join('');
  return `<div class="nm">${full}</div><span class="lab">${en}　Value ${p.value >= 99 ? '∞' : p.value}</span>
    <div class="kv"><span>HP</span><b>${p.hp}</b></div><div class="segbar">${seg}</div>
    <div class="kv"><span>武器</span><b>${w.name}</b></div>
    ${p.skills.map((s, i) => `<div class="sk"><span class="keycap">${keyName(K[i ? 'skill2' : 'skill'])}</span><span><b>${SKILLS[s].name}</b>　${SKILLS[s].help}</span></div>`).join('')}`;
}
// 左の一覧で、自分の駒と相手の駒のどちらを選んでいるか
let duelSide: 'me' | 'foe' = 'me';
function showPieceSelect() {
  gs.state = 'title';
  const mine = duelSide === 'me', cur = mine ? settings.myPiece : settings.foePiece;
  // 特殊駒（侍）は、開発者メニューでオンのときだけ自分・相手の両方に出る（自分は解放していても出る）
  const keys = Object.keys(PIECES).filter(k => mine ? pieceUsable(k) : !PIECES[k].special || specialOn());
  const row = (k: string, ch: string, nm: string, sub: string) => `<button class="prow${cur === k ? ' on' : ''}" data-k="${k}">${koma(ch)}<span>${nm}</span><small>${sub}</small></button>`;
  const rows = keys.map(k => row(k, PIECES[k].name, (FULL_NAME[PIECES[k].name] || [PIECES[k].name])[0], WEAPONS[PIECES[k].weapon].name)).join('') + row('random', '？', 'ランダム', '対局ごとに変わる');
  const nameOf = (k: string) => (k === 'random' ? '？' : (PIECES[k] || PIECES.P).name);
  const maps: [string, string][] = [...MAP_LIST.filter(m => selectableMaps().includes(m)).map(m => [m[0], m[1]] as [string, string]), ['random', 'ランダム']];
  const mapI = Math.max(0, maps.findIndex(m => m[0] === (settings.map === 'random' ? 'random' : playableMap(settings.map))));
  overlay(`<div class="duel">
    <div class="hero" id="duelHero"></div>
    <div class="duel-top"><b>一騎打ち</b><span class="lab">Duel</span>
      <div class="duel-tabs"><button id="sideMe" class="${mine ? 'on' : ''}">あなたの駒</button><button id="sideFoe" class="${mine ? '' : 'on'}">相手の駒</button></div></div>
    <div class="duel-stage"><span class="lab">Stage</span><button id="stPrev" aria-label="前のステージ">‹</button><b>${maps[mapI][1]}</b><button id="stNext" aria-label="次のステージ">›</button></div>
    <div class="plist" id="plist">${rows}</div>
    <div class="pinfo">${pieceInfoHTML(cur)}</div>
    <div class="duel-bottom"><button class="btn sub small" id="back">戻る</button>
      <span class="vsinfo">あなた <b>${nameOf(settings.myPiece)}</b>　VS　相手 <b>${nameOf(settings.foePiece)}</b>（CPU ${DIFFS[settings.diff]?.name || ''}）</span>
      <button class="btn" id="go">対局開始</button></div>
  </div>`, true);
  if (cur === 'random') $('duelHero').innerHTML = '<b class="koma" style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) scale(3)">？</b>';
  else showHero($('duelHero'), cur, mine, true);
  document.querySelectorAll<HTMLElement>('#plist .prow').forEach(b => b.onclick = e => {
    e.stopPropagation();
    settings[mine ? 'myPiece' : 'foePiece'] = b.dataset.k; saveSettings();
    const st = $('plist').scrollTop;
    resetMatch(); showPieceSelect();
    $('plist').scrollTop = st;
  });
  const stage = (d: number) => { settings.map = maps[(mapI + d + maps.length) % maps.length][0]; saveSettings(); resetMatch(); showPieceSelect(); };
  on('stPrev', () => stage(-1)); on('stNext', () => stage(1));
  on('sideMe', () => { duelSide = 'me'; showPieceSelect(); });
  on('sideFoe', () => { duelSide = 'foe'; showPieceSelect(); });
  on('back', () => { duelSide = 'me'; showSolo(); });
  on('go', () => { duelSide = 'me'; startMatch(); });
}

// ================= 一時停止 =================
export function showPause() {
  overlay(`<div class="screen">
    <h2 class="h big">${Net.on ? 'メニュー' : '一時停止'}</h2>
    <div class="menu col">
      <button class="btn" id="resume">再開</button>
      <button class="btn sub" id="pSettings">設定</button>
      <button class="btn sub" id="quit">タイトルへ</button>
    </div>
    <p class="note">${Net.on ? '友達との対戦は止まっていません！ 画面をクリックで戻る' : '画面をクリックしても再開できます'}</p>
  </div>`, true);
  on('resume', () => { SFX.init(); requestLock(); });
  on('pSettings', () => showSettings(showPause));
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
  overlay(`<div class="screen center">
    ${win === true ? sealHTML('勝ち', 'VICTORY') : win === false ? sealHTML('負け', 'DEFEAT') : sealHTML('引き分け', 'DRAW', true)}
    <div class="stats-h">棋譜<span class="en">RESULT</span></div>
    <div class="stats">
      <div><b>${acc}%</b><span>命中率 (${stats.hits}/${stats.shots})</span></div>
      <div><b>${stats.heads}</b><span>ヘッドショット</span></div>
      <div><b>${Math.round(stats.dealt)}</b><span>与ダメージ</span></div>
      <div><b>${stats.time.toFixed(1)}s</b><span>決着タイム</span></div>
    </div>
    <div class="menu">
      <button class="btn sub" id="toTitle">${Net.on ? '部屋から抜ける' : 'タイトルへ'}</button>
      <button class="btn white" id="again">${Net.on ? 'もう一戦（駒を選ぶ）' : 'もう一局'}</button>
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
  $('meName').innerHTML = `<b class="koma s">${player.def.name}</b>`;   // 体力の横に自分の駒の印
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
