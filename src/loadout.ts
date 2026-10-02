// 持ち物（ガチャで引いたスキン）と、武器ごとの装備。この PC のブラウザに保存し、ログイン中はアカウント（account.ts）にも保存する
// スキン1つは「デザイン・色の番号」だけで決まる（色は番号から毎回同じに作れる）
import { DESIGNS, SKINS, gachaSkin } from './guns/skins';
import { UNLOCKED, WEAPONS } from './core';
// 武器の見た目（model）の名前。どの画面でも WEAPONS の名前にそろえる
export const weaponName = (m: string) => (Object.values(WEAPONS) as any[]).find(w => w.model === m)?.name || m;

// ゲームの武器の見た目（model）→ スキンのデザインの銃の名前
export const GUN_OF_MODEL: Record<string, string> = { pistol: 'pistol', burst: 'b93r', karambit: 'karambit', mp5: 'mp5', bow: 'yumi', mk2: 'mk2', ak: 'ak', m79: 'm79', m870: 'm870' };
export type SkinRef = [string, number];   // [デザイン, 色の番号]
export type Owned = { id: number; base: string; seed: number; at: number; fav?: boolean };

const KEY = 'shogifps-skins';
export const Loadout = {
  items: [] as Owned[],
  equip: {} as Record<string, number>,   // model → 持ち物の id
  nextId: 1,
  points: 0,                              // ガチャを引くポイント
  owner: undefined as string | undefined, // この持ち物がどのアカウントのものか（別の人がログインしたときに持ち物が混ざらないように）
  econ: 0,                                // ポイントの仕組みの版。ECON と違えば持ち物とポイントを最初からにする
  unlocks: [] as string[],                // 使えるようになった特殊駒（'SA' 侍。今は手に入れる方法なし＝開発者メニューで試す）。ECON が変わっても消さない
  quest: undefined as any,                // クエストの進み具合（quests.ts）
};
// 1：ポイント無限のテストを終えて、ログインボーナス・クエストで稼ぐ形にした版（テストで引いたスキンは全員消す）
export const ECON = 1;
try { Object.assign(Loadout, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) {}
if (Loadout.econ !== ECON) Object.assign(Loadout, { items: [], equip: {}, nextId: 1, points: 0, econ: ECON, quest: undefined });
const syncUnlocks = () => { if (!Array.isArray(Loadout.unlocks)) Loadout.unlocks = []; UNLOCKED.clear(); for (const k of Loadout.unlocks) UNLOCKED.add(k); };
syncUnlocks();
const saveLocal = () => { try { localStorage.setItem(KEY, JSON.stringify(Loadout)); } catch (e) {} };
let cloudSave: (() => void) | null = null;
export const setCloudSave = (fn: (() => void) | null) => { cloudSave = fn; };
export const saveLoadout = () => { saveLocal(); cloudSave?.(); };
// アカウントに保存する中身と、アカウントから読んだ中身への入れ替え
export const loadoutData = () => ({ items: Loadout.items, equip: Loadout.equip, nextId: Loadout.nextId, points: Loadout.points, econ: Loadout.econ, quest: Loadout.quest ?? null, unlocks: Loadout.unlocks });
export function replaceLoadout(d: any, owner: string | undefined) {
  Loadout.items = Array.isArray(d?.items) ? d.items : [];
  Loadout.equip = d?.equip && typeof d.equip === 'object' ? d.equip : {};
  Loadout.nextId = Number.isFinite(d?.nextId) ? d.nextId : Loadout.items.reduce((m: number, x: Owned) => Math.max(m, x.id + 1), 1);
  Loadout.points = Number.isFinite(d?.points) ? d.points : 0;
  Loadout.econ = d?.econ ?? 0;
  Loadout.quest = d?.quest || undefined;
  Loadout.unlocks = Array.isArray(d?.unlocks) ? d.unlocks.filter((k: any) => typeof k === 'string') : [];
  syncUnlocks();
  Loadout.owner = owner;
  saveLocal();
}

// 駒を解放する（ボスに勝った）。初めてなら true
export function unlockPiece(k: string) {
  if (Loadout.unlocks.includes(k)) return false;
  Loadout.unlocks.push(k); syncUnlocks(); saveLoadout();
  return true;
}

// ================= ポイント =================
// ガチャは 1連 100・10連 1000。ポイントはログインボーナスとクエストでもらう（quests.ts）
export const POINTS_UNLIMITED = false;
export const PULL_COST = { 1: 100, 10: 1000 };
export const pointsText = () => (POINTS_UNLIMITED ? '∞' : Loadout.points.toLocaleString());
export const canSpend = (n: number) => POINTS_UNLIMITED || Loadout.points >= n;
export function spendPoints(n: number) {
  if (!canSpend(n)) return false;
  if (!POINTS_UNLIMITED) { Loadout.points -= n; saveLoadout(); }
  return true;
}
export function addPoints(n: number) { Loadout.points += n; saveLoadout(); }

// ================= 持ち物 =================
// 表示する名前：「デザイン名 #番号」（名前は付けられない）
export const seedHex = (seed: number) => '#' + (seed >>> 0).toString(16).toUpperCase().padStart(8, '0');
export const itemName = (it: Owned) => (DESIGNS[it.base]?.name || '?') + ' ' + seedHex(it.seed);
export const itemsOf = (model: string) => Loadout.items.filter(it => DESIGNS[it.base]?.gun === GUN_OF_MODEL[model]);
export function equipItem(model: string, id: number | null) {
  if (id === null) delete Loadout.equip[model]; else Loadout.equip[model] = id;
  saveLoadout();
}

// その武器に付けられるデザインか（オンラインで届いたものも、これで確かめてから使う）
export const validRef = (model: string, r: any): r is SkinRef =>
  Array.isArray(r) && typeof r[0] === 'string' && Number.isFinite(r[1]) && DESIGNS[r[0]]?.gun === GUN_OF_MODEL[model];

// 装備しているスキン（無ければ null ＝ 初期スキン）
export function equippedRef(model: string): SkinRef | null {
  const it = Loadout.items.find(x => x.id === Loadout.equip[model]);
  return it && validRef(model, [it.base, it.seed]) ? [it.base, it.seed] : null;
}
// 全部の武器の装備（オンラインで相手に送る）
export function equippedAll() {
  const out: Record<string, SkinRef> = {};
  for (const m of Object.keys(GUN_OF_MODEL)) { const r = equippedRef(m); if (r) out[m] = r; }
  return out;
}
// スキンを SKINS に登録して、その名前を返す
//   lite：飾りと演出を外し、初期の形に色だけ付ける（相手の銃を軽く見せる設定）
export function skinKey(r: SkinRef, lite = false) {
  const k = (lite ? 'gl:' : 'g:') + r[0] + ':' + (r[1] >>> 0);
  if (!SKINS[k]) {
    const s = gachaSkin(r[0], r[1] >>> 0);
    SKINS[k] = lite ? { ...s, addons: [], fx: undefined } : s;
  }
  return k;
}
// 銃の模型に、そのスキン（無ければ初期スキン）を塗る
export function paintGun(gun: any, r: SkinRef | null, lite = false) {
  if (!gun?.setSkin) return;
  if (gun.baseSkin === undefined) gun.baseSkin = gun.skin;
  const id = r ? skinKey(r, lite) : gun.baseSkin;
  if (gun.skin !== id) gun.setSkin(id);   // 同じなら塗り直さない
}

// ================= ガチャを引く =================
// 1回ごとに レア度 → 武器（9武器から同じ確率）→ 色の番号（完全にランダム）の順に決める
export const RATES: [string, number][] = [['LR', 2], ['SR', 10], ['R', 28], ['N', 60]];
export const MODEL_OF_GUN = Object.fromEntries(Object.entries(GUN_OF_MODEL).map(([m, g]) => [g, m]));
export const modelOf = (it: Owned) => MODEL_OF_GUN[DESIGNS[it.base]?.gun];
function rollRarity() {
  let x = Math.random() * 100;
  for (const [r, p] of RATES) { if (x < p) return r; x -= p; }
  return 'N';
}
export function pull(n: 1 | 10): Owned[] | null {
  if (!spendPoints(PULL_COST[n])) return null;
  const out: Owned[] = [], now = Date.now(), models = Object.keys(GUN_OF_MODEL);
  for (let i = 0; i < n; i++) {
    const r = rollRarity();
    const m = models[Math.floor(Math.random() * models.length)];
    const base = Object.keys(DESIGNS).find(k => DESIGNS[k].gun === GUN_OF_MODEL[m] && DESIGNS[k].rarity === r)
      || Object.keys(DESIGNS).find(k => DESIGNS[k].rarity === r);
    const it: Owned = { id: Loadout.nextId++, base, seed: (Math.random() * 4294967296) >>> 0, at: now + i };
    Loadout.items.push(it); out.push(it);
  }
  saveLoadout();
  return out;
}
