// 新しい版のお知らせ：ホーム画面に追加した iPhone は開き直しても読み込み直さないので、
// 起動したとき・画面に戻ったときに最新の index.html の先頭だけを取りに行き、ビルドの時刻（vite.config.ts が書く）が違えば「更新」を出す
const stampOf = (html: string) => (html.match(/<meta name="build" content="(\d+)">/) || [])[1] || '';
const mine = document.querySelector<HTMLMetaElement>('meta[name="build"]')?.content || '';
let shown = false;
async function check() {
  if (!mine || shown) return;   // 開発サーバー（時刻がない）では何もしない
  try {
    // ページは 2MB あるので先頭だけ（Range が効かないサーバーなら全部来るが、それでも動く）
    const res = await fetch(location.pathname, { cache: 'no-store', headers: { Range: 'bytes=0-1023' } });
    const latest = stampOf(await res.text());
    if (!latest || latest === mine) return;
    shown = true;
    const b = document.createElement('button');
    b.id = 'newVer';
    b.textContent = '新しいバージョンがあります　タップで更新';
    b.onclick = () => location.replace(location.pathname + '?v=' + latest);   // URL を変えて、古いページを使わせない
    document.body.appendChild(b);
  } catch (e) {}
}
check();
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
