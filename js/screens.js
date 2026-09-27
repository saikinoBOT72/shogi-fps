// タイトル・一時停止・結果画面
'use strict';

// ================= 画面（タイトル・一時停止・結果） =================
function overlay(html, dim) {
  const o = $('overlay'); o.innerHTML = html; o.style.display = 'flex'; o.classList.toggle('dim', !!dim);
}
const hideOverlay = () => { $('overlay').style.display = 'none'; };
function settingsHTML() {
  return `<div class="card">
    <div class="row"><span>CPUの強さ</span><div class="seg" id="diffSeg">${Object.entries(DIFFS).map(([k, d]) => `<button data-d="${k}" class="${settings.diff === k ? 'on' : ''}">${d.name}</button>`).join('')}</div></div>
    <div class="row"><span>マウス感度 <b id="sensV">${settings.sens.toFixed(2)}</b></span><input id="sens" type="range" min="0.2" max="3" step="0.05" value="${settings.sens}"></div>
    <div class="row"><span>画質 <small style="opacity:.6">（重いときは「低」）</small></span><div class="seg" id="qSeg">${Object.entries(QUALITIES).map(([k, q]) => `<button data-q="${k}" class="${settings.quality === k ? "on" : ""}">${q.name}</button>`).join("")}</div></div>
    <div class="row"><span>FPS表示</span><div class="seg" id="fpsSeg"><button data-f="1" class="${settings.showFps ? "on" : ""}">ON</button><button data-f="0" class="${settings.showFps ? "" : "on"}">OFF</button></div></div>
    <div class="row"><span>音量</span><input id="vol" type="range" min="0" max="1" step="0.05" value="${settings.vol}"></div>
    <div class="row"><span>数値の調整 <small style="opacity:.6">（ダメージ・速さなど）</small></span><button class="small" id="tuneBtn">調整パネル</button></div>
  </div>`;
}
function bindSettings() {
  document.querySelectorAll('#diffSeg button').forEach(b => b.onclick = e => {
    e.stopPropagation(); settings.diff = b.dataset.d; saveSettings();
    document.querySelectorAll('#diffSeg button').forEach(x => x.classList.toggle('on', x === b));
  });
  $('sens').oninput = e => { settings.sens = +e.target.value; $('sensV').textContent = settings.sens.toFixed(2); saveSettings(); };
  $('vol').oninput = e => { settings.vol = +e.target.value; SFX.setVol(settings.vol); saveSettings(); };
  document.querySelectorAll("#qSeg button").forEach(b => b.onclick = e => {
    e.stopPropagation(); settings.quality = b.dataset.q; saveSettings();
    document.querySelectorAll("#qSeg button").forEach(x => x.classList.toggle("on", x === b));
    if (state === "title") location.reload();   // 画質は作り直しが必要なので再読み込み
  });
  document.querySelectorAll("#fpsSeg button").forEach(b => b.onclick = e => {
    e.stopPropagation(); settings.showFps = b.dataset.f === "1"; saveSettings();
    document.querySelectorAll("#fpsSeg button").forEach(x => x.classList.toggle("on", x === b));
    if (!settings.showFps) $("fps").textContent = "";
  });
  ['sens', 'vol'].forEach(id => $(id).onclick = e => e.stopPropagation());
  $('tuneBtn').onclick = e => { e.stopPropagation(); openTune(); };
}
// 操作説明（スキルは選んだ駒に合わせる）
const keysHTML = () => {
  const sk = SKILLS[(PIECES[settings.myPiece] || PIECES.P).skill];
  return `<div class="keys"><b>WASD</b>移動　<b>マウス</b>照準　<b>左クリック</b>射撃　<b>右クリック</b>覗き込み　<b>R</b>リロード<br><b>Space</b>ジャンプ　<b>E</b>${sk.name}（${sk.help}）　<b>F</b>フルスクリーン　<b>ESC</b>一時停止</div>`;
};
// 駒の紹介カード
function pieceCard(k) {
  const p = PIECES[k], w = WEAPONS[p.weapon], sk = SKILLS[p.skill];
  return `<b class="pc-name">${p.name}</b><span class="pc-val">価値 ${p.value >= 99 ? '∞' : p.value}</span><span>HP ${p.hp}</span><span>${w.name}</span><span>${sk.name}</span>`;
}
function pieceSelectHTML() {
  const opts = (sel, id, withRandom) => `<div class="pick" id="${id}">${Object.keys(PIECES).map(k =>
    `<button data-k="${k}" class="${sel === k ? 'on' : ''}">${pieceCard(k)}</button>`).join('')}${withRandom
    ? `<button data-k="random" class="${sel === 'random' ? 'on' : ''}"><b class="pc-name">？</b><span>ランダム</span></button>` : ''}</div>`;
  return `<div class="picks"><div><h3>あなたの駒</h3>${opts(settings.myPiece, 'pickMe', false)}</div>
    <div class="vs-mark">VS</div>
    <div><h3>相手の駒</h3>${opts(settings.foePiece, 'pickFoe', true)}</div></div>`;
}
function bindPieceSelect() {
  const bind = (id, key) => document.querySelectorAll(`#${id} button`).forEach(b => b.onclick = e => {
    e.stopPropagation();
    settings[key] = b.dataset.k; saveSettings();
    resetMatch(); showTitle();
  });
  bind('pickMe', 'myPiece'); bind('pickFoe', 'foePiece');
}

function showTitle() {
  state = 'title'; $('hud').style.display = 'none';
  overlay(`<div class="logo">将棋<span>FPS</span></div>
    ${pieceSelectHTML()}
    ${settingsHTML()}
    <button class="btn" id="go">対局開始</button>
    ${keysHTML()}`);
  bindSettings();
  bindPieceSelect();
  $('go').onclick = e => { e.stopPropagation(); startMatch(); };
}
function showPause() {
  overlay(`<div class="res" style="font-size:56px">一時停止</div>
    ${settingsHTML()}
    <button class="btn" id="resume">再開</button>
    <button class="btn ghost" id="quit">タイトルへ</button>${keysHTML()}`, true);
  bindSettings();
  $('resume').onclick = e => { e.stopPropagation(); SFX.init(); requestLock(); };
  $('quit').onclick = e => { e.stopPropagation(); paused = false;
    if (settings.quality !== QUALITY_AT_LOAD) { location.reload(); return; }
    resetMatch(); showTitle();
  };
}
function showResult(win) {
  $('hud').style.display = 'none';
  const acc = stats.shots ? Math.round(stats.hits / stats.shots * 100) : 0;
  overlay(`<div class="res" style="color:${win === true ? '#ffd23a' : win === false ? '#ff6b5b' : '#fff'}">${win === true ? '勝利' : win === false ? '敗北' : '引き分け'}</div>
    <div class="stats">
      <div><b>${acc}%</b><span>命中率 (${stats.hits}/${stats.shots})</span></div>
      <div><b>${stats.heads}</b><span>ヘッドショット</span></div>
      <div><b>${Math.round(stats.dealt)}</b><span>与ダメージ</span></div>
      <div><b>${stats.time.toFixed(1)}s</b><span>決着タイム</span></div>
    </div>
    <button class="btn" id="again">もう一局</button>
    <button class="btn ghost" id="toTitle">タイトルへ</button>
    <button class="btn ghost" id="resTune">調整パネル</button>`, true);
  $('resTune').onclick = e => { e.stopPropagation(); openTune(); };
  $('again').onclick = e => { e.stopPropagation(); startMatch(); };
  $('toTitle').onclick = e => { e.stopPropagation(); resetMatch(); showTitle(); };
}

function startMatch() {
  SFX.init();
  resetMatch(resolveFoe());
  initPips();
  $('meName').textContent = `あなた：${player.def.name}　${player.w.name}`;
  $('foeTag').textContent = bot.def.name;
  $('wepName').textContent = player.w.name;
  $('center').textContent = '';
  state = 'countdown'; stateT = 0; paused = true;
  playerActor.root.visible = false;
  requestLock();
}
function onLocked() {
  if (state === 'countdown' || state === 'fight') {
    paused = false; hideOverlay(); $('hud').style.display = 'block';
    if ($('tune')) $('tune').style.display = 'none';
  }
}
function pause() {
  if (paused) return;
  paused = true; mouseDown = false; rightDown = false;
  showPause();
}
$('overlay').addEventListener('click', () => { if (paused && (state === 'countdown' || state === 'fight')) { SFX.init(); requestLock(); } });
