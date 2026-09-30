// マーケットの画面：持ち物の画面と同じ並び（左：武器・真ん中：銃を回して見せる・右：札の一覧）
//   「買う」：ほかの人の出品。出品した人の名前（英語3文字）だけ見える
//   「自分の出品」：取り下げられる。出品は持ち物の画面から
import { $ } from './core';
import { overlay } from './screens';
import { DESIGNS, RARITY, gachaColors } from './guns/skins';
import { MODEL_OF_GUN, Owned, canSpend, pointsText, seedHex, weaponName } from './loadout';
import { Account } from './account';
import { Stage } from './inventory';
import { MARKET, Listing, buy, cancel, collectSales, expired, listingName, myListings, openListings } from './market';
import { notify } from './quests';

const MODELS = ['pistol', 'burst', 'mp5', 'ak', 'm870', 'mk2', 'm79', 'bow', 'karambit'];
const RANK = { N: 0, R: 1, SR: 2, LR: 3 };
const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const swatch = (cols: number[]) => `<span class="inv-sw">${cols.map(c => `<i style="background:${hex(c)}"></i>`).join('')}</span>`;
const rarOf = (l: Listing) => DESIGNS[l.base]?.rarity || 'N';
const modelOf = (l: Listing) => MODEL_OF_GUN[DESIGNS[l.base]?.gun];
const colorsOf = (l: Listing) => gachaColors(l.seed >>> 0, DESIGNS[l.base]?.colors.length || 2);
const on = (id: string, fn: () => void) => { const el = $(id); if (el) el.onclick = e => { e.stopPropagation(); fn(); }; };

let back: () => void = () => {};
let tab: 'buy' | 'mine' = 'buy', gun = 'all', sort: 'new' | 'cheap' | 'high' | 'rank' = 'new';
let all: Listing[] = [], mine: Listing[] = [], sel = '', loading = false, asking = false, msg = '';

export async function showMarket(onBack: () => void) {
  back = onBack; sel = ''; asking = false; msg = '';
  await reload();
}
async function reload() {
  if (!Account.user) { render(); return; }
  loading = true; render();
  try {
    await collectSales();
    [all, mine] = await Promise.all([openListings(), myListings()]);
    all = all.filter(l => l.seller !== Account.user.uid && DESIGNS[l.base]);
  } catch (e) { console.warn(e); msg = '読み込めませんでした。通信を確かめてください'; }
  loading = false; render();
}

function list() {
  let xs = tab === 'buy' ? all : mine;
  if (gun !== 'all') xs = xs.filter(l => modelOf(l) === gun);
  return xs.slice().sort((a, b) =>
    sort === 'cheap' ? a.price - b.price : sort === 'high' ? b.price - a.price
      : sort === 'rank' ? RANK[rarOf(b)] - RANK[rarOf(a)] || b.at - a.at : b.at - a.at);
}
const stateOf = (l: Listing) => l.status === 'sold' ? '売れました' : expired(l) ? '期限切れ' : '出品中';
const daysLeft = (l: Listing) => Math.max(0, Math.ceil((l.at + MARKET.days * 86400000 - Date.now()) / 86400000));

function render() {
  const head = `<header class="inv-head">
      <h2 class="h">マーケット</h2>
      <div class="pts"><small>ポイント</small><b>${pointsText()}</b></div>
      <button class="btn sub" id="mkBack">戻る</button>
    </header>`;
  if (!Account.user) {
    overlay(`<div class="qs">${head}<div class="panel qs-off">
      <p>マーケットでは、スキンをポイントで売り買いできます。使うには<b>ログイン</b>が必要です（ゲストでも大丈夫です）。</p>
      <div class="menu"><button class="btn" id="mkLogin">ログインする</button></div></div></div>`, true);
    on('mkBack', () => { Stage.hide(); back(); });
    on('mkLogin', () => import('./accountScreen').then(m => m.showAccount(() => showMarket(back))));
    return;
  }
  const items = list();
  const l = items.find(x => x.id === sel) || items[0] || null;
  sel = l ? l.id : '';
  const rar = l ? rarOf(l) : 'base';
  const guns = [['all', '全部'] as [string, string], ...MODELS.map(m => [m, weaponName(m)] as [string, string])].map(([m, n]) => {
    const c = (tab === 'buy' ? all : mine).filter(x => m === 'all' || modelOf(x) === m).length;
    return `<button class="inv-gun${m === gun ? ' on' : ''}" data-m="${m}"><b>${n}</b><small>${c}個</small></button>`;
  }).join('');
  const card = (x: Listing) => `<button class="inv-card r-${rarOf(x)}${x.id === sel ? ' sel' : ''}" data-id="${x.id}">
      ${swatch(colorsOf(x))}<em>${rarOf(x)}</em>
      <b>${esc(listingName(x))}</b>
      <small><span class="mk-price">${x.price.toLocaleString()}pt</span>　${tab === 'buy' ? esc(x.sellerName) : stateOf(x)}</small>
    </button>`;
  const openMine = mine.filter(x => x.status === 'open' && !expired(x)).length;
  let acts = '';
  if (l && tab === 'buy') {
    acts = asking
      ? `<div class="mk-ask"><span>${l.price.toLocaleString()}pt で買いますか？</span><button class="btn" id="mkYes">買う</button><button class="btn sub" id="mkNo">やめる</button></div>`
      : `<button class="btn" id="mkBuy"${canSpend(l.price) ? '' : ' disabled'}>${canSpend(l.price) ? `${l.price.toLocaleString()}pt で買う` : 'ポイントが足りません'}</button>`;
  } else if (l && tab === 'mine') {
    acts = l.status === 'open' && !expired(l) ? '<button class="btn sub" id="mkCancel">取り下げる</button>' : '';
  }
  overlay(`<div class="inv mk r-${rar}">
    ${head}
    <nav class="inv-guns">${guns}</nav>
    <section class="inv-stage">
      <div class="inv-view" id="mkView">${l ? '<span class="inv-hint">ドラッグで回す</span>' : `<span class="mk-empty">${loading ? '読み込み中…' : tab === 'buy' ? 'いまは出品がありません' : 'まだ出品していません。持ち物の画面から出品できます'}</span>`}</div>
      ${l ? `<div class="inv-info">
        <div class="inv-rar"><b>${rar}</b><span>${RARITY[rar]}</span></div>
        <div class="inv-name"><span>${esc(listingName(l))}</span></div>
        <div class="inv-meta">
          <span>値段 <b class="mk-price">${l.price.toLocaleString()}pt</b></span>
          <span>${tab === 'buy' ? `出品した人 <b>${esc(l.sellerName)}</b>` : stateOf(l)}</span>
          <span>${weaponName(modelOf(l))}・${esc(DESIGNS[l.base].name)}・番号 <b>${seedHex(l.seed)}</b></span>
          ${l.status === 'open' && !expired(l) ? `<span>あと${daysLeft(l)}日で取り下げ</span>` : ''}
        </div>
        <div class="inv-acts">${acts}</div>
        ${msg ? `<p class="inv-msg">${esc(msg)}</p>` : ''}
      </div>` : msg ? `<div class="inv-info"><p class="inv-msg">${esc(msg)}</p></div>` : ''}
    </section>
    <section class="inv-list">
      <div class="inv-tools">
        <div class="seg" id="mkTab"><button data-v="buy" class="${tab === 'buy' ? 'on' : ''}">買う</button><button data-v="mine" class="${tab === 'mine' ? 'on' : ''}">自分の出品 ${openMine}/${MARKET.max}</button></div>
        <button class="btn sub small" id="mkReload">更新</button>
      </div>
      <div class="inv-tools">
        <div class="seg" id="mkSort">${[['new', '新しい順'], ['cheap', '安い順'], ['high', '高い順'], ['rank', 'レア度順']].map(([k, n]) => `<button data-v="${k}" class="${sort === k ? 'on' : ''}">${n}</button>`).join('')}</div>
        <span class="inv-count">${items.length}個</span>
      </div>
      <div class="inv-grid">${items.map(card).join('')}</div>
    </section>
  </div>`, true);
  bind(l);
  if (l) Stage.show(modelOf(l), { id: 0, base: l.base, seed: l.seed >>> 0, at: 0 } as Owned, 'mkView');
}

function bind(l: Listing | null) {
  on('mkBack', () => { Stage.hide(); back(); });
  on('mkReload', () => { msg = ''; reload(); });
  document.querySelectorAll<HTMLElement>('.mk .inv-gun').forEach(b => b.onclick = e => { e.stopPropagation(); gun = b.dataset.m; sel = ''; asking = false; msg = ''; render(); });
  document.querySelectorAll<HTMLElement>('.mk .inv-card').forEach(b => b.onclick = e => { e.stopPropagation(); sel = b.dataset.id; asking = false; msg = ''; render(); });
  document.querySelectorAll<HTMLElement>('#mkTab button').forEach(b => b.onclick = e => { e.stopPropagation(); tab = b.dataset.v as any; sel = ''; asking = false; msg = ''; render(); });
  document.querySelectorAll<HTMLElement>('#mkSort button').forEach(b => b.onclick = e => { e.stopPropagation(); sort = b.dataset.v as any; render(); });
  on('mkBuy', () => { asking = true; render(); });
  on('mkNo', () => { asking = false; render(); });
  on('mkYes', async () => {
    asking = false;
    const name = listingName(l);
    const r = await buy(l);
    msg = r === 'gone' ? 'ひと足先に売れたか、取り下げられました' : r === 'points' ? 'ポイントが足りません' : r === 'ok' ? '' : '買えませんでした。通信を確かめてください';
    if (r === 'ok') notify(`「${name}」を買いました。持ち物に入っています`);
    await reload();
  });
  on('mkCancel', async () => {
    const name = listingName(l);
    const r = await cancel(l).catch(e => { console.warn(e); return 'fail' as const; });
    if (r === 'ok') notify(`「${name}」を取り下げました。持ち物に戻っています`);
    else if (r === 'fail') msg = '取り下げられませんでした。通信を確かめてください';
    await reload();
  });
}
