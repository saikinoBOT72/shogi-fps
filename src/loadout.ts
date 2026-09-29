// 持ち物（ガチャで引いたスキン）と、武器ごとの装備。この PC のブラウザに保存する
// スキン1つは「デザイン・色の番号」だけで決まる（色は番号から毎回同じに作れる）
import { DESIGNS, SKINS, gachaSkin } from './guns/skins';

// ゲームの武器の見た目（model）→ スキンのデザインの銃の名前
export const GUN_OF_MODEL: Record<string, string> = { pistol: 'pistol', burst: 'b93r', karambit: 'karambit', mp5: 'mp5', bow: 'yumi', mk2: 'mk2', ak: 'ak', m79: 'm79', m870: 'm870' };
export type SkinRef = [string, number];   // [デザイン, 色の番号]
export type Owned = { id: number; base: string; seed: number; at: number; fav?: boolean; name?: string };

const KEY = 'shogifps-skins';
export const Loadout = {
  items: [] as Owned[],
  equip: {} as Record<string, number>,   // model → 持ち物の id
  nextId: 1,
  points: 0,                              // ガチャを引くポイント
};
try { Object.assign(Loadout, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) {}
export const saveLoadout = () => { try { localStorage.setItem(KEY, JSON.stringify(Loadout)); } catch (e) {} };

// ================= ポイント =================
// ガチャは 1連 100・10連 1000。テスト中はポイントが無限（残りは ∞ と表示）。対戦でもらえる量はテストが終わってから決める
export const POINTS_UNLIMITED = true;
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
// 表示する名前：自分で付けた名前、無ければ「デザイン名 #番号」
export const seedHex = (seed: number) => '#' + (seed >>> 0).toString(16).toUpperCase().padStart(8, '0');
export const itemName = (it: Owned) => it.name || (DESIGNS[it.base]?.name || '?') + ' ' + seedHex(it.seed);
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

// 試し用（開発者メニュー）：全部の武器に、ランダムなデザインと色のスキンを持たせて装備する
export function devEquipRandom(rarity?: string) {
  for (const m of Object.keys(GUN_OF_MODEL)) {
    const ds = Object.keys(DESIGNS).filter(k => DESIGNS[k].gun === GUN_OF_MODEL[m] && (!rarity || DESIGNS[k].rarity === rarity));
    if (!ds.length) continue;
    const it: Owned = { id: Loadout.nextId++, base: ds[Math.floor(Math.random() * ds.length)], seed: (Math.random() * 4294967296) >>> 0, at: Date.now() };
    Loadout.items.push(it); Loadout.equip[m] = it.id;
  }
  saveLoadout();
}
export function devUnequipAll() { Loadout.equip = {}; saveLoadout(); }

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
