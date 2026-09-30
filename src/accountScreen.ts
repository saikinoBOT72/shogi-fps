// アカウントの画面：ログイン（Google／ゲスト）、名前、ゲスト → Google、ログアウト、アカウントを消す
import { $ } from './core';
import { overlay } from './screens';
import { Account, isGuest, loginGoogle, loginGuest, linkGoogle, switchToGoogle, setName, logout, deleteAccount, onAccountChange } from './account';

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const POLICY_LINK = `<a class="policy-link" href="./privacy.html" target="_blank" rel="noopener">プライバシーポリシー・利用規約</a>`;

let back: () => void = () => {}, open = false, nameMsg = '';
let ask: null | 'logout' | 'delete' | 'switch' = null, listening = false;

export function showAccount(onBack: () => void) {
  if (!listening) { listening = true; onAccountChange(() => { if (open) render(); }); }   // 読み込みの順の都合で、最初に開いたときに登録
  back = onBack; open = true; ask = null; Account.msg = ''; nameMsg = '';
  render();
}

// 取り返しのつかないことは、画面の中でもう一度聞く
const QUESTIONS = {
  logout: () => isGuest()
    ? ['ゲストのままログアウトしますか？', 'ゲストは一度ログアウトすると戻れません。持ち物もすべて消えます。残すなら先に「Google につなぐ」を押してください', 'ログアウトして消す']
    : ['ログアウトしますか？', '持ち物はアカウントに残っています。もう一度ログインすれば戻ります', 'ログアウト'],
  delete: () => ['アカウントを消しますか？', '持ち物（スキン・装備・ポイント）と名前がすべて消え、元に戻せません', '消す'],
  switch: () => ['その Google はもう別のアカウントになっています', 'そちらに切り替えると、いまのゲストの持ち物は消えます', '切り替える'],
};

function render() {
  const u = Account.user, busy = Account.busy ? ' disabled' : '';
  let body: string;
  if (!Account.ready) body = `<div class="panel"><p class="note">読み込み中…</p></div>`;
  else if (ask) {
    const [q, note, yes] = QUESTIONS[ask]();
    body = `<div class="panel acct-ask"><b>${q}</b><p class="note">${note}</p></div>
      <div class="menu"><button class="btn${ask === 'switch' ? '' : ' danger'}" id="acYes"${busy}>${yes}</button><button class="btn sub" id="acNo"${busy}>やめる</button></div>`;
  } else if (!u) {
    body = `<div class="panel acct-intro">
        <p>ログインすると、持ち物（スキン・装備・ポイント）が<b>別の PC やブラウザでも同じ</b>になります。</p>
        <p class="note">ログインしなくても遊べます（持ち物はこのブラウザにだけ残ります）。</p>
      </div>
      <div class="menu col">
        <button class="btn" id="acGoogle"${busy}>Google でログイン</button>
        <button class="btn sub" id="acGuest"${busy}>ゲストで始める</button>
      </div>
      <p class="note">ゲストはこのブラウザだけのアカウントです。あとで Google につなげば、ほかの PC でも使えます。</p>`;
  } else {
    body = `<div class="panel form">
        <div class="row"><span>名前<small>英語の大文字3文字。マーケットと友達との対戦で相手に見える。同じ名前は早い者勝ち</small></span>
          <span class="acct-name"><input id="acName" maxlength="3" autocomplete="off" spellcheck="false" value="${esc(Account.name)}"><button class="btn small" id="acSave"${busy}>変える</button></span></div>
        ${nameMsg ? `<p class="acct-msg">${esc(nameMsg)}</p>` : ''}
        <div class="row"><span>種類</span><b>${isGuest() ? 'ゲスト（このブラウザだけ）' : 'Google'}</b></div>
      </div>
      ${isGuest() ? `<div class="menu"><button class="btn" id="acLink"${busy}>Google につなぐ</button></div>
        <p class="note">つなぐと、いまの持ち物のまま、ほかの PC でも同じ Google でログインできます。</p>` : ''}
      <div class="menu"><button class="btn sub" id="acOut"${busy}>ログアウト</button><button class="btn sub danger-text" id="acDel"${busy}>アカウントを消す</button></div>`;
  }
  overlay(`<div class="screen acct">
    <h2 class="h">アカウント</h2>
    ${body}
    ${Account.msg ? `<p class="acct-msg">${esc(Account.msg)}</p>` : ''}
    <div class="menu"><button class="btn sub" id="acBack">戻る</button></div>
    ${POLICY_LINK}
  </div>`, true);
  bind();
}

function bind() {
  const on = (id: string, fn: () => void) => { const el = $(id); if (el) el.onclick = e => { e.stopPropagation(); fn(); }; };
  on('acBack', () => { open = false; back(); });
  on('acGoogle', loginGoogle);
  on('acGuest', loginGuest);
  on('acLink', async () => { if (await linkGoogle() === 'exists') { ask = 'switch'; render(); } });
  on('acOut', () => { ask = 'logout'; render(); });
  on('acDel', () => { ask = 'delete'; render(); });
  on('acNo', () => { ask = null; render(); });
  on('acYes', async () => {
    const a = ask; ask = null;
    if (a === 'logout') await logout();
    else if (a === 'delete') await deleteAccount();
    else if (a === 'switch') await switchToGoogle();
    render();
  });
  const inp = $('acName') as HTMLInputElement;
  if (inp) {
    const save = async () => {
      const r = await setName(inp.value);
      nameMsg = r === 'bad' ? '英語の大文字3文字にしてください（例：ABC）' : r === 'taken' ? 'その名前はもう使われています' : r === 'ok' ? '名前を変えました' : '';
      render();
    };
    inp.oninput = () => { const p = inp.selectionStart; inp.value = inp.value.toUpperCase().replace(/[^A-Z]/g, ''); inp.setSelectionRange(p, p); };
    inp.onclick = e => e.stopPropagation();
    inp.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') save(); };
    on('acSave', save);
  }
  document.querySelectorAll<HTMLElement>('.policy-link').forEach(a => a.onclick = e => e.stopPropagation());
}
