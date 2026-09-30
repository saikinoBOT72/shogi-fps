// マーケット：スキンをポイントで出品・購入する（プレイヤーどうし。お金は使わない）
//   market/番号 = { seller, sellerName, base, seed, price, at, status: 'open' | 'sold', buyer?, buyerName?, soldAt? }
//   出品するとスキンは持ち物から出品へ移る。取り下げ・期限切れで持ち物に戻る。売れたら、次に出品者が開いたときに代金を受け取る
//   値段は 1〜10000pt、手数料なし、1人10個まで、7日で期限切れ。守りはデータベースの決まり（firestore.rules）
//   ポイントは PC 側で数える（ズルはしない前提。利用規約で禁止している）
import {
  collection, query, where, getDocs, addDoc, doc, deleteDoc, runTransaction, writeBatch, serverTimestamp,
} from 'firebase/firestore';
import { Account, fdb } from './account';
import { Loadout, Owned, canSpend, itemName, saveLoadout } from './loadout';
import { notify, serverNow } from './quests';

export const MARKET = { max: 10, minPrice: 1, maxPrice: 10000, days: 7 };
export type Listing = { id: string; seller: string; sellerName: string; base: string; seed: number; price: number; at: number; status: string; buyer?: string; buyerName?: string };
const col = () => collection(fdb(), 'market');
const ms = (t: any) => (t?.toMillis ? t.toMillis() : 0);
const toListing = (d: any): Listing => { const x = d.data(); return { id: d.id, ...x, at: ms(x.at) } as Listing; };
export const expired = (l: Listing) => l.at > 0 && serverNow() > l.at + MARKET.days * 86400000;
export const listingName = (l: Listing) => itemName({ id: 0, base: l.base, seed: l.seed, at: 0 });
const back = (l: Listing) => { Loadout.items.push({ id: Loadout.nextId++, base: l.base, seed: l.seed >>> 0, at: Date.now() }); };

// 出品中のもの（期限切れと自分の出品は、買う画面には出さない）
export async function openListings() {
  const snap = await getDocs(query(col(), where('status', '==', 'open')));
  return snap.docs.map(toListing).filter(l => !expired(l));
}
export async function myListings(uid = Account.user?.uid) {
  if (!uid) return [];
  const snap = await getDocs(query(col(), where('seller', '==', uid)));
  return snap.docs.map(toListing);
}

// 出品する。'max' 10個まで / 'price' 値段が範囲外 / 'equipped' 装備中
export async function listItem(it: Owned, price: number): Promise<'ok' | 'max' | 'price' | 'equipped' | 'fail'> {
  if (!Account.user) return 'fail';
  if (!Number.isInteger(price) || price < MARKET.minPrice || price > MARKET.maxPrice) return 'price';
  if (Object.values(Loadout.equip).includes(it.id)) return 'equipped';
  const mine = (await myListings()).filter(l => l.status === 'open');
  if (mine.length >= MARKET.max) return 'max';
  await addDoc(col(), { seller: Account.user.uid, sellerName: Account.name, base: it.base, seed: it.seed >>> 0, price, at: serverTimestamp(), status: 'open' });
  Loadout.items = Loadout.items.filter(x => x.id !== it.id);
  saveLoadout();
  return 'ok';
}

// 買う。'gone' 先に売れた・取り下げられた / 'points' ポイントが足りない
export async function buy(l: Listing): Promise<'ok' | 'gone' | 'points' | 'self' | 'fail'> {
  const u = Account.user; if (!u) return 'fail';
  if (l.seller === u.uid) return 'self';
  if (!canSpend(l.price)) return 'points';
  const ref = doc(fdb(), 'market', l.id);
  try {
    await runTransaction(fdb(), async tx => {
      const s = await tx.get(ref);
      if (!s.exists() || s.data().status !== 'open') throw new Error('gone');
      tx.update(ref, { status: 'sold', buyer: u.uid, buyerName: Account.name, soldAt: serverTimestamp() });
    });
  } catch (e) { console.warn(e); return 'gone'; }
  Loadout.points -= l.price;
  Loadout.items.push({ id: Loadout.nextId++, base: l.base, seed: l.seed >>> 0, at: Date.now() });
  saveLoadout();
  return 'ok';
}

// 取り下げる（まだ売れていなければ持ち物に戻す。売れていたら代金を受け取る）
export async function cancel(l: Listing): Promise<'ok' | 'sold'> {
  const ref = doc(fdb(), 'market', l.id);
  let sold: Listing | null = null;
  await runTransaction(fdb(), async tx => {
    const s = await tx.get(ref);
    if (!s.exists()) return;
    if (s.data().status === 'sold') { sold = toListing(s); return; }
    tx.delete(ref);
  });
  if (sold) { await collectSales(); return 'sold'; }
  back(l); saveLoadout();
  return 'ok';
}

// 売れた出品の代金を受け取り、期限切れの出品を持ち物に戻す（ログインしたとき・マーケットを開いたとき）
let collecting = false;
export async function collectSales() {
  if (collecting || !Account.user) return;
  collecting = true;
  try {
    for (const l of await myListings()) {
      if (l.status === 'sold') {
        await deleteDoc(doc(fdb(), 'market', l.id));   // 先に消す（2回受け取らないように）
        Loadout.points += l.price;
        notify(`${l.buyerName || '誰か'} が「${listingName(l)}」を買いました　+${l.price}pt`);
      } else if (expired(l)) {
        await deleteDoc(doc(fdb(), 'market', l.id));
        back(l);
        notify(`「${listingName(l)}」は期限切れで持ち物に戻りました`);
      }
    }
    saveLoadout();
  } finally { collecting = false; }
}

// 名前を変えたら、出品中の札の名前も変える
export async function renameListings(name: string) {
  const open = (await myListings()).filter(l => l.status === 'open');
  if (!open.length) return;
  const b = writeBatch(fdb());
  for (const l of open) b.update(doc(fdb(), 'market', l.id), { sellerName: name });
  await b.commit();
}
// アカウントを消すとき：出品もすべて消す
export async function deleteMyListings(uid: string) {
  for (const l of await myListings(uid)) await deleteDoc(doc(fdb(), 'market', l.id)).catch(() => {});
}
