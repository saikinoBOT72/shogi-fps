// 通信：友達と P2P でつなぐ。PeerJS の無料の仲介サーバー（0.peerjs.com）で相手を見つけ、そのあとは相手と直接やりとりする
// 直接つながれないとき（回線の相性）は、PeerJS が用意している中継サーバーを自動で使う
import Peer from 'peerjs';

const PREFIX = 'shogifps-v1-';                       // ほかのアプリと部屋の名前がぶつからないように
const ABC = 'ABCDEGHJKLMNPQRSTUVWXYZ23456789';        // 部屋のコードに使う文字（見間違えやすい I・O・0・1 と、F を除く）
const newCode = () => Array.from({ length: 4 }, () => ABC[Math.floor(Math.random() * ABC.length)]).join('');

export const Net: any = {
  on: false,       // 相手とつながっている
  host: false,     // 部屋を作った側
  code: '',
  peer: null, conn: null,
  onMsg: (m: any) => {},        // 相手から届いたもの
  onClose: () => {},            // 相手との接続が切れた
  send(m: any) { if (this.conn && this.conn.open) this.conn.send(m); },
};

// 送る数字を短く（小数2桁）
export const r2 = (v: number) => Math.round(v * 100) / 100;
export const vec = (v: any) => [r2(v.x), r2(v.y), r2(v.z)];

// 仲介サーバーのエラーを分かる言葉に
function errText(e: any) {
  const t = e && e.type;
  if (t === 'peer-unavailable') return 'その部屋が見つかりません（コードを確かめてね）';
  if (t === 'browser-incompatible') return 'このブラウザは対応していません';
  if (t === 'network' || t === 'server-error' || t === 'socket-error' || t === 'socket-closed') return '仲介サーバーにつながりません。少し待ってからやり直してね';
  return 'つながりませんでした（' + (t || e) + '）';
}

function bind(conn: any, cb: any) {
  let opened = false;
  const timer = setTimeout(() => { if (!opened) { cb.error('相手につながりませんでした（回線の相性かも）'); leaveRoom(); } }, 20000);
  conn.on('open', () => {
    opened = true; clearTimeout(timer);
    Net.conn = conn; Net.on = true;
    cb.connected();
  });
  conn.on('data', (m: any) => Net.onMsg(m));
  conn.on('close', () => { if (Net.conn === conn) { Net.on = false; Net.conn = null; Net.onClose(); } });
  conn.on('error', () => {});
}

// 部屋を作る。cb: { code(c) 部屋ができた, connected() 相手が入った, error(text) }
export function hostRoom(cb: any, tries = 0) {
  leaveRoom();
  const code = newCode();
  const peer = new Peer(PREFIX + code);
  Net.peer = peer; Net.host = true; Net.code = code;
  peer.on('open', () => cb.code(code));
  peer.on('connection', (conn: any) => {
    if (Net.conn) { conn.on('open', () => conn.close()); return; }   // 2人目以降は入れない
    bind(conn, cb);
  });
  peer.on('error', (e: any) => {
    if (e.type === 'unavailable-id' && tries < 5) { hostRoom(cb, tries + 1); return; }   // コードが使われていたら作り直す
    if (!Net.on) cb.error(errText(e));
  });
}
// 部屋に入る
export function joinRoom(code: string, cb: any) {
  leaveRoom();
  const peer = new Peer();
  Net.peer = peer; Net.host = false; Net.code = code;
  peer.on('open', () => bind(peer.connect(PREFIX + code.toUpperCase(), { reliable: true }), cb));
  peer.on('error', (e: any) => { if (!Net.on) cb.error(errText(e)); });
}
export function leaveRoom() {
  const { conn, peer } = Net;
  Net.on = false; Net.conn = null; Net.peer = null;
  try { if (conn) conn.close(); } catch (e) {}
  try { if (peer) peer.destroy(); } catch (e) {}
}
