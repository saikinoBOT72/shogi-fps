// アカウント（Firebase）：Google でログイン、またはゲスト（このブラウザだけ）
//   データベースに入れるのは users/番号 の「ゲーム内の名前・持ち物（スキン・装備・ポイント）・更新日時」、
//   names/名前（名前の早い者勝ち）、market/番号（出品。market.ts）だけ
//   メール・本名・Google の写真は入れない（何を入れるかは public/privacy.html に書いてある。増やすときはそちらも直す）
//   ログインしなくても今までどおり遊べる（持ち物はこのブラウザにだけ残る）
import { initializeApp } from 'firebase/app';
import {
  getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signInAnonymously, linkWithPopup,
  signInWithCredential, reauthenticateWithPopup, signOut, deleteUser, type Auth, type User,
} from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, serverTimestamp, writeBatch, type Firestore } from 'firebase/firestore';
import { firebaseConfig } from './firebase-config';
import { ECON, loadoutData, replaceLoadout, setCloudSave } from './loadout';
import { START_POINTS, refreshQuests, setQuestClock } from './quests';
import { VM } from './effects';
import { collectSales, deleteMyListings, renameListings } from './market';
import { paintActors } from './game';

// サイト（http/https）で開いたときだけ使える（dist の index.html をダブルクリックしたときは使えない）
export const accountAvailable = !!firebaseConfig && location.protocol.startsWith('http');

export const Account = {
  ready: !accountAvailable,   // ログイン状態がわかったか
  user: null as User | null,
  name: '',
  busy: false,
  msg: '',                    // 画面に出す知らせ（失敗したときなど）
  loginBonus: null as null | { day: number; pt: number },   // タイトルで見せるログインボーナス（見せたら null に戻す）
};
export const isGuest = () => !!Account.user?.isAnonymous;

let auth: Auth, db: Firestore;
const listeners: (() => void)[] = [];
export const onAccountChange = (fn: () => void) => { listeners.push(fn); };
const changed = () => listeners.forEach(f => f());
const refreshGuns = () => { VM.applyLoadout(); paintActors(); };
export const fdb = () => db;
// 名前：英語の大文字3文字。同じ名前は1人だけ（names/名前 を先に作った人のもの）
export const NAME_RE = /^[A-Z]{3}$/;
const randName = () => Array.from({ length: 3 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join('');
// 名前を取る：names/新しい名前 を作り、users の名前を変え、前の名前を手放す（1回のまとめ書き。取られていたら失敗する）
async function claimName(n: string, uid: string) {
  const b = writeBatch(db);
  b.set(doc(db, 'names', n), { uid });
  b.set(doc(db, 'users', uid), { name: n, loadout: loadoutData(), updatedAt: serverTimestamp() });
  if (NAME_RE.test(Account.name) && Account.name !== n) b.delete(doc(db, 'names', Account.name));
  await b.commit();
  Account.name = n;
}
async function claimRandomName(uid: string) {
  for (let i = 0; i < 40; i++) { try { await claimName(randName(), uid); return; } catch (e) {} }
  throw new Error('名前を決められませんでした');
}

// 持ち物が変わったら少し待ってまとめて保存（続けて変わっても1回で済むように）
let saveTimer = 0;
function pushSoon() {
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(pushNow, 1200);
}
async function pushNow() {
  clearTimeout(saveTimer);
  const u = Account.user; if (!u) return;
  try {
    await setDoc(doc(db, 'users', u.uid), { name: Account.name, loadout: loadoutData(), updatedAt: serverTimestamp() });
  } catch (e) { console.warn('アカウントに保存できませんでした', e); }
}

// ログインしたら、アカウントの持ち物を読む。まだ無ければ最初のポイントを配って作る
//   （ログインしていないとポイントはもらえないので、このブラウザの持ち物は持っていかない）
//   ポイントの仕組みの版（ECON）が古いアカウントは、持ち物を最初からにする（テストで引いたスキンは消す）
async function loadUser(u: User) {
  const ref = doc(db, 'users', u.uid);
  const snap = await getDoc(ref);
  const d = snap.exists() ? snap.data() : null;
  replaceLoadout(d?.loadout, u.uid);
  if (!d || d.loadout?.econ !== ECON) replaceLoadout({ points: START_POINTS, econ: ECON }, u.uid);
  refreshGuns();
  // 名前：まだ無い（前の形の名前も）なら、空いている3文字をランダムに取る。保存も一緒にする
  Account.name = '';
  if (NAME_RE.test(d?.name || '')) { Account.name = d.name; await pushNow(); }
  else await claimRandomName(u.uid);
  // サーバーの時刻をもらう（保存した日時を読み返す）。日付の切り替えはこれで決める
  const t = (await getDoc(ref)).data()?.updatedAt;
  setQuestClock(t?.toMillis ? t.toMillis() : null, u.uid);
  Account.loginBonus = refreshQuests();
  collectSales().catch(e => console.warn(e));   // 売れた・期限切れの出品を片付ける
}

export function initAccount() {
  if (!accountAvailable) return;
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app); auth.languageCode = 'ja';
  db = getFirestore(app);
  onAuthStateChanged(auth, async u => {
    Account.user = u;
    if (u) {
      try { await loadUser(u); setCloudSave(pushSoon); }
      catch (e) { console.warn(e); Account.msg = 'アカウントの読み込みに失敗しました。通信を確かめてください'; }
    } else { setCloudSave(null); setQuestClock(null); }
    Account.ready = true;
    changed();
  });
  addEventListener('pagehide', () => { if (saveTimer) pushNow(); });
}

// 失敗したときの知らせ（ポップアップを閉じただけのときは何も出さない）
const errText = (e: any) => {
  const c = e?.code || '';
  if (c === 'auth/popup-closed-by-user' || c === 'auth/cancelled-popup-request') return '';
  if (c === 'auth/popup-blocked') return 'ログインの窓がブラウザに止められました。ポップアップを許可してください';
  if (c === 'auth/network-request-failed') return '通信できませんでした';
  if (c === 'auth/unauthorized-domain') return 'このサイトはまだログインを許可されていません（Firebase の設定）';
  return 'うまくいきませんでした（' + (c || e?.message || '不明') + '）';
};
async function run(fn: () => Promise<void>) {
  if (Account.busy) return;
  Account.busy = true; Account.msg = ''; changed();
  try { await fn(); } catch (e) { Account.msg = errText(e); console.warn(e); }
  Account.busy = false; changed();
}
const google = () => { const p = new GoogleAuthProvider(); p.setCustomParameters({ prompt: 'select_account' }); return p; };

export const loginGoogle = () => run(async () => { await signInWithPopup(auth, google()); });
export const loginGuest = () => run(async () => { await signInAnonymously(auth); });

// ゲストを Google につなぐ（持ち物はそのまま）
//   その Google がもう別のアカウントになっていたら 'exists' を返す（切り替えるかは画面で聞く）
let pendingCred: any = null;
export async function linkGoogle(): Promise<'ok' | 'exists' | 'fail'> {
  let res: 'ok' | 'exists' | 'fail' = 'fail';
  await run(async () => {
    try { await linkWithPopup(Account.user, google()); await Account.user.reload(); Account.user = auth.currentUser; res = 'ok'; }
    catch (e: any) {
      if (e?.code === 'auth/credential-already-in-use') { pendingCred = GoogleAuthProvider.credentialFromError(e); res = 'exists'; }
      else throw e;
    }
  });
  return res;
}
// ゲストをやめて、そのGoogle のアカウントに切り替える（ゲストの持ち物は消える）
export const switchToGoogle = () => run(async () => {
  if (!pendingCred) return;
  const g = Account.user;
  await wipeUser(g.uid).catch(() => {});
  await deleteUser(g).catch(() => {});
  replaceLoadout(null, undefined);
  await signInWithCredential(auth, pendingCred); pendingCred = null;
});

// 名前を変える。'bad' 形が違う / 'taken' もう使われている
export async function setName(s: string): Promise<'ok' | 'bad' | 'taken' | 'same'> {
  const n = s.trim().toUpperCase();
  if (!NAME_RE.test(n) || !Account.user) return 'bad';
  if (n === Account.name) return 'same';
  try { await claimName(n, Account.user.uid); } catch (e) { return 'taken'; }
  await renameListings(n).catch(e => console.warn(e));   // 出品中の札の名前も変える
  changed();
  return 'ok';
}
// アカウントのデータをすべて消す（出品・名前・持ち物）
async function wipeUser(uid: string) {
  await deleteMyListings(uid);
  const b = writeBatch(db);
  if (NAME_RE.test(Account.name)) b.delete(doc(db, 'names', Account.name));
  b.delete(doc(db, 'users', uid));
  await b.commit();
}

// ログアウト：このブラウザの持ち物も片付ける（アカウントには残っている）
export const logout = () => run(async () => {
  await pushNow();
  setCloudSave(null); setQuestClock(null);
  await signOut(auth);
  replaceLoadout(null, undefined); refreshGuns();
});

// アカウントを消す：データベースの中身とログインの記録を両方消す
export const deleteAccount = () => run(async () => {
  const u = Account.user; if (!u) return;
  // Google のときは先にもう一度ログインしてもらう（時間がたっていると消せないので。途中でやめても何も消えない）
  if (!u.isAnonymous) await reauthenticateWithPopup(u, google());
  setCloudSave(null); setQuestClock(null); clearTimeout(saveTimer);
  await wipeUser(u.uid);
  await deleteUser(u);
  replaceLoadout(null, undefined); refreshGuns();
});
