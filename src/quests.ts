// ポイントを稼ぐ仕組み：ログインボーナス・デイリークエスト・ウィークリークエスト（ログインした人だけ。ゲストも含む）
//   日付は毎朝4時（日本時間）に変わり、週は月曜4時に変わる。時刻はサーバーの時計で決める（PC の時計を動かしてもずれない）
//   目安は1日にガチャ約20連分（2000pt 前後）。数字を変えるときは下の表だけ直せばよい
//   駒・マップ・モード・CPU の難しさが増えても困らないクエストだけにする（「全部の駒で」などは作らない）
import { Loadout, addPoints } from './loadout';
import { PIECES } from './core';
import { MAP_LIST } from './world/base';

// ================= 表 =================
export const LOGIN_BONUS = [100, 100, 200, 100, 100, 200, 500];   // 7日で1周。休んでも最初に戻らない
export const DAILY_COUNT = 5, DAILY_BONUS = 300, DAILY_FRIEND_MAX = 1;
export const WEEKLY_COUNT = 10, WEEKLY_BONUS = 600, WEEKLY_FRIEND_MAX = 3;
export const START_POINTS = 1000;   // アカウントを作ったときに配る

// ev：数える出来事（questEvent で送る）。fr：true 友達との試合だけ / false CPU だけ / なし どちらでも
//   match 1試合（一騎打ち・将棋モードの一騎打ち）/ win 勝った試合 / duelWin 一騎打ちで勝った / kill 倒した / upset 格上の駒を倒した
//   head ヘッドショット / dmg ダメージ / skill スキル / capture 将棋モードで駒を取った / shogi 将棋モードを1局終えた / shogiWin 1局勝った
//   pieceKill 今日の駒で倒した / mapMatch 今日のマップで1試合 / gacha ガチャを引いた回数 / login ログインした日 / dailyAll デイリーを全部達成した日
type QDef = { id: string; text: string; ev: string; need: number; pt: number; fr?: boolean };
export const DAILY: QDef[] = [
  { id: 'd_play', text: '一騎打ちを3回する', ev: 'match', need: 3, pt: 200 },
  { id: 'd_kill', text: '駒を合計10回取る', ev: 'kill', need: 10, pt: 200 },
  { id: 'd_skill', text: 'スキルを5回使う', ev: 'skill', need: 5, pt: 150 },
  { id: 'd_head', text: 'ヘッドショットを5回決める', ev: 'head', need: 5, pt: 200 },
  { id: 'd_piece', text: '今日の駒（{piece}）で3回取る', ev: 'pieceKill', need: 3, pt: 200 },
  { id: 'd_map', text: '今日のマップ（{map}）で1試合遊ぶ', ev: 'mapMatch', need: 1, pt: 150 },
  { id: 'd_dmg', text: '合計1000ダメージを与える', ev: 'dmg', need: 1000, pt: 200 },
  { id: 'd_gacha', text: 'ガチャを1回引く', ev: 'gacha', need: 1, pt: 150 },
  { id: 'd_cpuwin', text: 'CPU との一騎打ちで1勝する', ev: 'duelWin', need: 1, pt: 200, fr: false },
  { id: 'd_cpucap', text: 'CPU との将棋モードで駒を3つ取る', ev: 'capture', need: 3, pt: 250, fr: false },
  { id: 'd_cpushogi', text: 'CPU と将棋モードを1局指す', ev: 'shogi', need: 1, pt: 200, fr: false },
  { id: 'd_fr', text: '友達と1試合遊ぶ', ev: 'match', need: 1, pt: 250, fr: true },
  { id: 'd_frwin', text: '友達に1勝する', ev: 'win', need: 1, pt: 300, fr: true },
];
export const WEEKLY: QDef[] = [
  { id: 'w_duel', text: '一騎打ちで10勝する', ev: 'duelWin', need: 10, pt: 400 },
  { id: 'w_shogi', text: '将棋モードで3局勝つ', ev: 'shogiWin', need: 3, pt: 400 },
  { id: 'w_kill', text: '駒を合計100回取る', ev: 'kill', need: 100, pt: 300 },
  { id: 'w_head', text: 'ヘッドショットを30回決める', ev: 'head', need: 30, pt: 300 },
  { id: 'w_upset', text: '格上の駒を5回倒す（歩で飛車など）', ev: 'upset', need: 5, pt: 300 },
  { id: 'w_dmg', text: '合計5000ダメージを与える', ev: 'dmg', need: 5000, pt: 300 },
  { id: 'w_skill', text: 'スキルを30回使う', ev: 'skill', need: 30, pt: 300 },
  { id: 'w_cap', text: '将棋モードで駒を10個取る', ev: 'capture', need: 10, pt: 300 },
  { id: 'w_daily', text: 'デイリーを5日分すべて達成する', ev: 'dailyAll', need: 5, pt: 500 },
  { id: 'w_login', text: 'ログインを5日する', ev: 'login', need: 5, pt: 200 },
  { id: 'w_gacha', text: 'ガチャを10回引く', ev: 'gacha', need: 10, pt: 200 },
  { id: 'w_cpu', text: 'CPU に5勝する', ev: 'win', need: 5, pt: 400, fr: false },
  { id: 'w_fr', text: '友達と5試合する', ev: 'match', need: 5, pt: 500, fr: true },
  { id: 'w_frwin', text: '友達に3勝する', ev: 'win', need: 3, pt: 500, fr: true },
];
const DEF = Object.fromEntries([...DAILY, ...WEEKLY].map(q => [q.id, q]));

// ================= 時刻（サーバーの時計） =================
// ログインしたときにサーバーの時刻を1回もらい、あとは PC の経過時間（performance.now）で進める
let clock: { server: number; perf: number } | null = null;
let uid = '';
export function setQuestClock(serverMs: number | null, user = '') {
  clock = serverMs === null ? null : { server: serverMs, perf: performance.now() };
  uid = user;
}
export const questsActive = () => !!clock;
const now = () => clock.server + (performance.now() - clock.perf);
const DAY = 86400000, SHIFT = (9 - 4) * 3600000;   // 日本時間の4時で日付が変わる
const dayOf = (t: number) => Math.floor((t + SHIFT) / DAY);
const weekOf = (d: number) => Math.floor((d + 3) / 7);   // 1970/1/1 は木曜 → 月曜で区切る
export const nextDayIn = () => (dayOf(now()) + 1) * DAY - SHIFT - now();
export const nextWeekIn = () => ((weekOf(dayOf(now())) + 1) * 7 - 3) * DAY - SHIFT - now();

// 日替わりの駒・マップ：その日の番号で決める（みんな同じ）。そのとき遊べるものから選ぶので、増えても大丈夫
const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
const rng = (seed: number) => () => { seed = (seed + 0x6d2b79f5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
export const todayPiece = () => { const ks = Object.keys(PIECES).filter(k => !PIECES[k].special); return ks[hash('piece' + dayOf(now())) % ks.length]; };
export const todayMap = () => { const ms = MAP_LIST.filter(m => !m[2]); return ms[hash('map' + dayOf(now())) % ms.length][0]; };
export const questText = (id: string) => DEF[id].text
  .replace('{piece}', PIECES[todayPiece()].name)
  .replace('{map}', (MAP_LIST.find(m => m[0] === todayMap()) || ['', '?'])[1]);
export const questDef = (id: string) => DEF[id];

// ================= 状態（持ち物と一緒にアカウントへ保存） =================
type QState = { id: string; n: number; got?: boolean };
export type Quests = {
  day: number; daily: QState[]; rerolled?: boolean; dailyGot?: boolean;
  week: number; weekly: QState[]; weeklyGot?: boolean;
  loginDay: number; loginCount: number;   // 最後にボーナスをもらった日・もらった日数（何日目かを数える）
};
export const Q = () => (Loadout as any).quest as Quests;

// 引き直しや入れ替えのとき：友達用の数の上限を守って、ランダムに選ぶ
function pick(pool: QDef[], n: number, frMax: number, r: () => number, have: string[] = []) {
  const out: string[] = [];
  let fr = have.filter(id => DEF[id].fr === true).length;
  const left = pool.filter(q => !have.includes(q.id));
  while (out.length < n && left.length) {
    const i = Math.floor(r() * left.length), q = left.splice(i, 1)[0];
    if (q.fr === true) { if (fr >= frMax) continue; fr++; }
    out.push(q.id);
  }
  return out;
}

// 日付・週が変わっていたら入れ替え、ログインボーナスを配る。もらったボーナスを返す（無ければ null）
export function refreshQuests(): null | { day: number; pt: number } {
  if (!clock) return null;
  const d = dayOf(now()), w = weekOf(d);
  let q = Q(), bonus = null, dirty = false;
  if (!q) { q = (Loadout as any).quest = { day: -1, daily: [], week: -1, weekly: [], loginDay: -1, loginCount: 0 }; dirty = true; }
  if (q.week !== w) {
    q.week = w; q.weeklyGot = false;
    q.weekly = pick(WEEKLY, WEEKLY_COUNT, WEEKLY_FRIEND_MAX, rng(hash(uid + 'w' + w))).map(id => ({ id, n: 0 }));
    dirty = true;
  }
  if (q.day !== d) {
    q.day = d; q.rerolled = false; q.dailyGot = false;
    q.daily = pick(DAILY, DAILY_COUNT, DAILY_FRIEND_MAX, rng(hash(uid + 'd' + d))).map(id => ({ id, n: 0 }));
    dirty = true;
  }
  if (q.loginDay !== d) {
    const pt = LOGIN_BONUS[q.loginCount % LOGIN_BONUS.length];
    bonus = { day: q.loginCount % LOGIN_BONUS.length + 1, pt };
    q.loginDay = d; q.loginCount++;
    Loadout.points += pt;
    count(q.weekly, 'login', 1);
    dirty = true;
  }
  if (dirty) addPoints(0);   // 保存（アカウントにも）
  return bonus;
}

// デイリーを1つ引き直す（1日1回。まだ達成していないものだけ）
export function rerollDaily(i: number) {
  const q = Q(); if (!q || q.rerolled || !q.daily[i] || q.daily[i].got) return false;
  const have = q.daily.map(x => x.id);
  const others = have.filter((_, j) => j !== i);
  // 今のものと同じのは出さない。友達用の上限は、残りの4つで数える
  const [id] = pick(DAILY.filter(x => x.id !== have[i]), 1, DAILY_FRIEND_MAX, Math.random, others);
  if (!id) return false;
  q.daily[i] = { id, n: 0 }; q.rerolled = true;
  addPoints(0);
  return true;
}

// ================= 数える =================
const toasts: string[] = [];
function count(list: QState[], ev: string, n: number, fr?: boolean) {
  let pt = 0;
  for (const s of list) {
    const d = DEF[s.id];
    if (s.got || d.ev !== ev || (d.fr !== undefined && d.fr !== fr)) continue;
    s.n = Math.min(d.need, s.n + n);
    if (s.n >= d.need) { s.got = true; pt += d.pt; toasts.push(`クエスト達成　${questText(s.id)}　+${d.pt}pt`); }
  }
  return pt;
}
// ゲームの中の出来事を送る（fr：友達との試合なら true、CPU なら false、どちらでもないなら undefined）
export function questEvent(ev: string, n = 1, fr?: boolean) {
  if (!clock || n <= 0) return;
  refreshQuests();
  const q = Q(); if (!q) return;
  let pt = count(q.daily, ev, n, fr) + count(q.weekly, ev, n, fr);
  if (!q.dailyGot && q.daily.length && q.daily.every(s => s.got)) {
    q.dailyGot = true; pt += DAILY_BONUS; toasts.push(`デイリーを全部達成　+${DAILY_BONUS}pt`);
    pt += count(q.weekly, 'dailyAll', 1);
  }
  if (!q.weeklyGot && q.weekly.length && q.weekly.every(s => s.got)) {
    q.weeklyGot = true; pt += WEEKLY_BONUS; toasts.push(`ウィークリーを全部達成　+${WEEKLY_BONUS}pt`);
  }
  addPoints(pt);   // 進み具合も一緒に保存する
  showToasts();
}

// 1試合の終わりにまとめて送る（一騎打ち・将棋モードの一騎打ちの両方）
export function questMatch(o: { win: boolean | null; fr: boolean; duel: boolean; map: string; me: string; foe: string; heads: number; dmg: number }) {
  if (!clock) return;
  questEvent('match', 1, o.fr);
  if (o.map === todayMap()) questEvent('mapMatch', 1, o.fr);
  questEvent('head', o.heads, o.fr);
  questEvent('dmg', Math.round(o.dmg), o.fr);
  if (o.win !== true) return;
  questEvent('win', 1, o.fr);
  questEvent('kill', 1, o.fr);
  questEvent('duelWin', 1, o.fr);   // 将棋モードで駒を取り合う戦いも一騎打ちとして数える
  if (o.me === todayPiece()) questEvent('pieceKill', 1, o.fr);
  if (PIECES[o.foe] && PIECES[o.me] && PIECES[o.foe].value > PIECES[o.me].value) questEvent('upset', 1, o.fr);
}

// ================= 達成の知らせ（画面の上に少し出す） =================
let toastEl: HTMLElement | null = null, showing = false;
function showToasts() {
  if (showing || !toasts.length) return;
  if (!toastEl) { toastEl = document.createElement('div'); toastEl.id = 'questToast'; document.body.appendChild(toastEl); }
  showing = true;
  toastEl.textContent = toasts.shift();
  toastEl.classList.remove('on'); void toastEl.offsetWidth; toastEl.classList.add('on');
  setTimeout(() => { toastEl.classList.remove('on'); setTimeout(() => { showing = false; showToasts(); }, 300); }, 2600);
}
// ほかの知らせ（マーケットで売れたときなど）も同じ場所に出す
export function notify(msg: string) { toasts.push(msg); showToasts(); }
export const serverNow = () => (clock ? now() : Date.now());
