// クエストの画面（ログインボーナス・デイリー・ウィークリー）と、ログインボーナスの知らせ
//   見た目は持ち物・ガチャの画面にそろえる（上に見出し・ポイント・戻る、中身はパネル）
import { $ } from './core';
import { overlay } from './screens';
import { pointsText } from './loadout';
import { Account } from './account';
import {
  DAILY_BONUS, LOGIN_BONUS, Q, WEEKLY_BONUS, nextDayIn, nextWeekIn, questDef, questText, questsActive, refreshQuests, rerollDaily,
} from './quests';

const on = (id: string, fn: () => void) => { const el = $(id); if (el) el.onclick = e => { e.stopPropagation(); fn(); }; };
const left = (ms: number) => {
  const m = Math.max(0, Math.floor(ms / 60000)), d = Math.floor(m / 1440), h = Math.floor(m % 1440 / 60);
  return d ? `あと${d}日${h}時間` : h ? `あと${h}時間${m % 60}分` : `あと${m % 60}分`;
};
const TAG = (fr?: boolean) => fr === true ? '<span class="q-tag fr">友達</span>' : fr === false ? '<span class="q-tag cpu">CPU</span>' : '';

// 7日ぶんのマス：もらった日・今日・これから
export function loginCells(count: number, today: boolean) {
  const cyc = LOGIN_BONUS.length, done = count % cyc === 0 && count > 0 ? cyc : count % cyc;   // この周で、もらった日数
  return `<div class="q-login">${LOGIN_BONUS.map((pt, i) => {
    const st = i < done ? (today && i === done - 1 ? ' now' : ' got') : '';
    return `<div class="q-day${st}"><small>${i + 1}日目</small><b>${pt}</b>${st ? '<i>✓</i>' : ''}</div>`;
  }).join('')}</div>`;
}

function rowsHTML(list: { id: string; n: number; got?: boolean }[], daily: boolean, canReroll: boolean) {
  return list.map((s, i) => {
    const d = questDef(s.id), k = Math.min(1, s.n / d.need);
    return `<div class="q-row${s.got ? ' got' : ''}">
      <div class="q-main"><span class="q-text">${TAG(d.fr)}${questText(s.id)}</span>
        <div class="q-bar"><i style="width:${(k * 100).toFixed(1)}%"></i></div></div>
      <span class="q-n">${s.got ? '達成' : `${s.n.toLocaleString()} / ${d.need.toLocaleString()}`}</span>
      <b class="q-pt">+${d.pt}</b>
      ${daily ? (canReroll && !s.got ? `<button class="small q-re" data-i="${i}">引き直す</button>` : '<span class="q-re"></span>') : ''}
    </div>`;
  }).join('');
}

let back: () => void = () => {};
export function showQuests(onBack: () => void) { back = onBack; render(); }

function render() {
  const head = `<header class="qs-head">
      <h2 class="h">クエスト</h2>
      <div class="pts"><small>ポイント</small><b>${pointsText()}</b></div>
      <button class="btn sub" id="qsBack">戻る</button>
    </header>`;
  let body: string;
  if (!questsActive()) {
    body = `<div class="panel qs-off">
      <p>ログインすると、<b>ログインボーナス</b>と<b>クエスト</b>でポイントがもらえます（ゲストでも大丈夫です）。</p>
      <div class="menu"><button class="btn" id="qsLogin">ログインする</button></div>
    </div>`;
  } else {
    refreshQuests();
    const q = Q(), dDone = q.daily.filter(s => s.got).length, wDone = q.weekly.filter(s => s.got).length;
    body = `<section class="panel">
        <h3>ログインボーナス<span>休んでも最初には戻りません</span></h3>
        ${loginCells(q.loginCount, false)}
      </section>
      <section class="panel">
        <h3>デイリー<span>${left(nextDayIn())}で入れ替え（毎朝4時）${q.rerolled ? '・今日の引き直しは使いました' : '・1日1回引き直せます'}</span></h3>
        ${rowsHTML(q.daily, true, !q.rerolled)}
        <div class="q-row q-all${q.dailyGot ? ' got' : ''}"><div class="q-main"><span class="q-text">5つ全部できたボーナス</span></div>
          <span class="q-n">${q.dailyGot ? '達成' : `${dDone} / ${q.daily.length}`}</span><b class="q-pt">+${DAILY_BONUS}</b><span class="q-re"></span></div>
      </section>
      <section class="panel">
        <h3>ウィークリー<span>${left(nextWeekIn())}で入れ替え（月曜4時）</span></h3>
        ${rowsHTML(q.weekly, false, false)}
        <div class="q-row q-all${q.weeklyGot ? ' got' : ''}"><div class="q-main"><span class="q-text">10個全部できたボーナス</span></div>
          <span class="q-n">${q.weeklyGot ? '達成' : `${wDone} / ${q.weekly.length}`}</span><b class="q-pt">+${WEEKLY_BONUS}</b></div>
      </section>`;
  }
  overlay(`<div class="qs">${head}<div class="qs-body">${body}</div></div>`, true);
  on('qsBack', back);
  on('qsLogin', () => import('./accountScreen').then(m => m.showAccount(render)));
  document.querySelectorAll<HTMLElement>('.q-re[data-i]').forEach(b => b.onclick = e => { e.stopPropagation(); if (rerollDaily(+b.dataset.i)) render(); });
}

// ログインボーナスの知らせ（タイトルを開いたとき、その日の最初の1回）
export function showLoginBonus(b: { day: number; pt: number }, after: () => void) {
  overlay(`<div class="screen lb">
    <h2 class="h">ログインボーナス</h2>
    <div class="lb-get"><small>${b.day}日目</small><b>+${b.pt}</b><span>ポイント</span></div>
    <div class="panel">${loginCells(Q().loginCount, true)}</div>
    <div class="menu"><button class="btn" id="lbOk">受け取る</button></div>
  </div>`, true);
  on('lbOk', after);
}
// タイトルで呼ぶ：ログイン直後のボーナス、または日付が変わっていたらそのボーナスを見せる。見せたら true
export function takeLoginBonus(after: () => void) {
  const b = Account.loginBonus || refreshQuests();
  Account.loginBonus = null;
  if (!b) return false;
  showLoginBonus(b, after);
  return true;
}
