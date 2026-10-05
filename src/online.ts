// 友達と対戦：部屋を作る・入る → 遊び方（一騎打ち・将棋モード・ブラインド将棋）とマップを決め、おたがい準備OK → 開始
// 将棋モード・ブラインド将棋の盤の上のやりとりは boardmode.ts（ここからは届いたものを渡すだけ）
// 対戦中は、自分の位置・向き・スキルの状態を 1 秒に 30 回送り、撃った・投げた・当てた・倒れたはその場で送る
// 当たったかどうかは撃った側の画面で決め、ダメージは受けた側が自分の HP から引く（HP を決めるのは本人）
import { P } from './palette';
import { gs } from './state';
import { $, PIECES, SKILLS, V3, WEAPONS, pieceUsable, saveSettings, settings } from './core';
import { SFX } from './audio';
import { Net, hostRoom, joinRoom, leaveRoom, r2, vec } from './net';
import { Account, NAME_RE } from './account';
import { FULL_NAME, overlay, pieceInfoHTML, showTitle, startMatch } from './screens';
import { showHero } from './hero';
import { bot, botActor, eyeOf, player, resetMatch, useSkill, view } from './game';
import { Arrows } from './arrows';
import { Grenades } from './grenades';
import { Particles, Tracers } from './effects';
import { Gadgets } from './gadgets';
import { damagePlayer } from './ai';
import { killBot } from './hud';
import { BoardMode } from './boardmode';
import { MAP_LIST, applyAtmos, pickMap, selectableMaps } from './world';
import { equippedAll } from './loadout';
import { Sword } from './sword';
import { Replay } from './replay';
import { Clones } from './clones';

const on = (id: string, fn: () => void) => { const el = $(id); if (el) el.onclick = e => { e.stopPropagation(); fn(); }; };
const V = (a: number[]) => new V3(a[0], a[1], a[2]);
const inMatch = () => gs.state === 'countdown' || gs.state === 'fight';

let foe = { k: null, ready: false, nm: '' }, meReady = false, inLobby = false, snap = null, sendT = 0;
let mode = 'duel';
const room = { map: 'valley', dark: 'scary' };   // マップと暗さ（部屋を作った人が決める）
// 部屋の設定を画面の背景にも反映
function applyRoom() { gs.netMap = room.map; gs.netDark = room.dark; resetMatch(); applyAtmos(); }
const sendRoom = () => Net.send({ t: 'room', map: room.map, dark: room.dark });   // 遊び方：'duel' 一騎打ち / 'board' 将棋モード（部屋を作った側が決める）

// ================= 部屋を作る・入る =================
export function showOnline(msg = '') {
  gs.state = 'title';
  overlay(`<div class="screen">
    <h2 class="h">友達と対戦</h2>
    <div class="panel form">
      <div class="row"><span>部屋を作る<small>出てきたコードを友達に伝える</small></span><button class="btn small" id="olHost">作る</button></div>
      <div class="row"><span>部屋に入る<small>友達から聞いたコード（4文字）</small></span><span><input id="olCode" class="ol-input" maxlength="4" autocomplete="off"> <button class="btn small" id="olJoin">入る</button></span></div>
    </div>
    <p class="note" id="olMsg" style="color:var(--shu-2)">${msg}</p>
    <p class="note">相手と直接つながるので、おたがいの IP アドレスが相手に伝わります。知っている友達とだけ遊んでね</p>
    <div class="menu"><button class="btn sub" id="back">戻る</button></div>
  </div>`, true);
  const input = $('olCode') as HTMLInputElement;
  input.onclick = e => e.stopPropagation();
  input.onkeydown = e => { if (e.key === 'Enter') join(); };
  on('olHost', host);
  on('olJoin', join);
  on('back', () => { leaveRoom(); showTitle(); });
}
const cb = {
  code: (c: string) => waiting(`<div class="ol-code">${c}</div><p>このコードを友達に伝えてね。入ってくるのを待っています…</p>`),
  connected: () => {
    foe = { k: null, ready: false, nm: '' }; gs.foeName = ''; meReady = false; mode = 'duel';
    if (Net.host) { room.map = pickMap(settings.map, true); room.dark = settings.dark; Net.send({ t: 'mode', m: mode }); sendRoom(); }
    applyRoom(); sendPick(); showLobby();
  },
  error: (t: string) => showOnline(t),
};
function waiting(html: string) {
  overlay(`<div class="screen"><h2 class="h">友達と対戦</h2><div class="panel">${html}</div>
    <div class="menu"><button class="btn sub" id="olCancel">やめる</button></div></div>`, true);
  on('olCancel', () => { leaveRoom(); showOnline(); });
}
function host() { waiting('<p>部屋を作っています…</p>'); hostRoom(cb); }
function join() {
  const code = ($('olCode') as HTMLInputElement).value.trim().toUpperCase();
  if (code.length !== 4) { $('olMsg').textContent = 'コードは4文字です'; return; }
  waiting(`<p>部屋 ${code} につないでいます…</p>`);
  joinRoom(code, cb);
}

// ================= 駒選び（おたがい準備OKで開始） =================
const sendPick = () => Net.send({ t: 'pick', k: settings.myPiece, ready: meReady, sk: equippedAll(), nm: Account.user ? Account.name : '' });   // sk：装備しているスキン（武器ごとにデザインと色の番号）・nm：名前（英語3文字。ログインしていなければ空）
export function showLobby() {
  inLobby = true; gs.state = 'title';
  if (!pieceUsable(settings.myPiece)) settings.myPiece = 'P';
  const f = foe.k && PIECES[foe.k], duel = mode === 'duel', host = Net.host, dis = host ? '' : ' disabled';
  // 一騎打ちの駒選びと同じ形：上に遊び方とステージ、左に駒の一覧、真ん中に自分の駒、右に性能、下に相手の様子と準備OK
  const maps = selectableMaps(), mi = Math.max(0, maps.findIndex(m => m[0] === room.map));
  const mapName = (MAP_LIST.find(m => m[0] === room.map) || [room.map, room.map])[1];
  const rows = Object.keys(PIECES).filter(pieceUsable).map(k => { const p = PIECES[k]; return `<button class="prow${settings.myPiece === k ? ' on' : ''}" data-k="${k}"><b class="koma">${p.name}</b><span>${(FULL_NAME[p.name] || [p.name])[0]}</span><small>${WEAPONS[p.weapon].name}</small></button>`; }).join('');
  const note = mode === 'blind'
    ? '始める前に、自分の3段の中で駒を並べ替えられる。対局中、相手の駒は字の無い駒に見える（打った駒・成った駒も）。<br>動きから何の駒か覚えながら戦い、一騎打ちで姿を見て答え合わせ。部屋を作った人が先手'
    : '部屋を作った人が先手。駒を取るときは一騎打ち（ステージは守る側が選ぶ）';
  overlay(`<div class="duel">
    <div class="hero" id="lobbyHero"></div>
    <div class="duel-top"><b>控室</b><span class="lab">Lobby　部屋 ${Net.code}</span>
      <div class="duel-tabs" id="olMode">${[['duel', '一騎打ち'], ['board', '将棋モード'], ['blind', 'ブラインド将棋']].map(([k, n]) => `<button data-v="${k}" class="${mode === k ? 'on' : ''}"${dis}>${n}</button>`).join('')}</div></div>
    <div class="duel-stage"><span class="lab">Stage</span><button id="stPrev" aria-label="前のステージ"${dis}>‹</button><b>${mapName}</b><button id="stNext" aria-label="次のステージ"${dis}>›</button></div>
    ${duel ? `<div class="plist" id="olPick">${rows}</div><div class="pinfo">${pieceInfoHTML(settings.myPiece)}</div>` : `<div class="lobby-note">${note}</div>`}
    <div class="duel-bottom"><button class="btn sub small" id="olLeave">抜ける</button>
      <span class="vsinfo">${host ? '' : '遊び方とステージは部屋を作った人が決める　'}相手${foe.nm ? `（<b class="ol-name">${foe.nm}</b>）` : ''}：${duel ? (f ? `<b>${f.name}</b> ${WEAPONS[f.weapon].name}　` : '選んでいます…　') : ''}${foe.ready ? '<b>準備OK</b>' : '準備中'}</span>
      <button class="btn${meReady ? ' sub' : ''}" id="olReady">${meReady ? '準備OK を取り消す' : '準備OK'}</button></div>
  </div>`, true);
  if (duel) showHero($('lobbyHero'), settings.myPiece, true, true);
  document.querySelectorAll<HTMLElement>('#olPick .prow').forEach(b => b.onclick = e => {
    e.stopPropagation();
    settings.myPiece = b.dataset.k; saveSettings(); meReady = false;
    sendPick(); showLobby();
  });
  document.querySelectorAll<HTMLElement>('#olMode button').forEach(b => b.onclick = e => {
    e.stopPropagation();
    if (!Net.host) return;
    mode = b.dataset.v; meReady = false; Net.send({ t: 'mode', m: mode }); sendPick(); showLobby();
  });
  const stage = (d: number) => { if (!Net.host || !maps.length) return; room.map = maps[(mi + d + maps.length) % maps.length][0]; meReady = false; sendRoom(); sendPick(); applyRoom(); showLobby(); };
  on('stPrev', () => stage(-1)); on('stNext', () => stage(1));
  on('olReady', () => { meReady = !meReady; sendPick(); showLobby(); maybeStart(); });
  on('olLeave', leave);
}
function maybeStart() { if (Net.host && inLobby && meReady && foe.ready && foe.k) { Net.send({ t: 'start', m: mode }); begin(); } }
function begin() {
  inLobby = false; meReady = false; foe.ready = false; snap = null; sendT = 0;
  if (mode === 'board' || mode === 'blind') BoardMode.startOnline(Net.host, mode === 'blind');
  else startMatch(foe.k);
}
// 一騎打ちが始まるとき（将棋モードの一騎打ちでも）：前の様子を捨てる
export function resetNetMatch() { snap = null; sendT = 0; }
// 部屋から抜ける（相手にも知らせる）
export function leave() {
  Net.send({ t: 'bye' });
  leaveRoom(); inLobby = false;
  gs.paused = false; gs.netMap = gs.netDark = gs.foeSkins = null;
  if (BoardMode.online) BoardMode.close();
  resetMatch(); showTitle();
}
function lost() {
  inLobby = false; gs.netMap = gs.netDark = null; gs.foeSkins = null;
  if (BoardMode.online) BoardMode.close();
  if (document.pointerLockElement) document.exitPointerLock();
  gs.paused = false;
  resetMatch(); showOnline('相手との接続が切れました');
}
addEventListener('beforeunload', () => { if (Net.on) Net.send({ t: 'bye' }); });

// ================= 相手から届いたもの =================
Net.onClose = lost;
Net.onMsg = (m: any) => {
  switch (m.t) {
    case 'pick': foe.k = m.k; foe.ready = m.ready; foe.nm = gs.foeName = NAME_RE.test(m.nm || '') ? m.nm : ''; gs.foeSkins = m.sk && typeof m.sk === 'object' ? m.sk : null; if (inLobby) { showLobby(); maybeStart(); } break;
    case 'start': if (!Net.host) { mode = m.m || 'duel'; begin(); } break;
    case 'room': room.map = m.map; room.dark = m.dark; meReady = false; sendPick(); applyRoom(); if (inLobby) showLobby(); break;
    case 'mode': mode = m.m; meReady = false; sendPick(); if (inLobby) showLobby(); break;
    case 'bm': case 'bp': case 'bwait': case 'bresign': case 'bstage': case 'bsetup': BoardMode.onNet(m); break;
    case 'bye': leaveRoom(); lost(); break;
    case 's': snap = m; break;
    case 'fire': if (inMatch()) remoteFire(m); break;
    case 'melee': if (inMatch()) SFX.play('knife', bot.pos); break;
    case 'sw': if (inMatch()) Sword.remoteSwing(m.s | 0); break;   // 刀を振った（段）
    case 'wv': if (inMatch()) Sword.remoteWave(m.p, m.d); break;   // 斬撃が飛んだ
    case 'slow': if (inMatch() || gs.state === 'end') Sword.remoteSlow(m.s | 0); break;   // 刀が当たった：2人とも白黒スロー
    case 'arrow':
      if (!inMatch()) break;
      Arrows.fire({ owner: bot, target: player, pos: V(m.p), vel: V(m.v), dmg: m.dmg, head: m.hd, gravity: m.g, drag: m.dr || 0, homing: !!m.hm, turn: m.tu || 0, full: !!m.fu });
      SFX.play('bow', V(m.p));
      break;
    case 'gren':
      if (!inMatch()) break;
      Grenades.fire({ owner: bot, target: player, pos: V(m.p), vel: V(m.v), dmg: m.dmg, radius: m.r, gravity: m.g, fuse: m.fu,
        big: !!m.big, knock: m.kn, lift: m.li, self: m.se });
      SFX.play('m79', V(m.p));
      break;
    case 'skill':
      if (!inMatch() || bot.dead) break;
      bot.netAim = V(m.a); bot.blinkK = m.k ?? 1;   // k：瞬の溜め具合
      useSkill(bot, m.i, V(m.d), true);
      break;
    case 'hit':
      if (!inMatch() || player.dead) break;
      damagePlayer(m.dmg, bot.pos);
      if (m.kv) { player.vel.x = m.kv[0]; player.vel.z = m.kv[2]; player.vy = m.kv[1]; player.onGround = false; player.airT = 1; player.knockT = 0.6; }
      break;
    case 'dead': if (inMatch() && !bot.dead) { bot.hp = 0; killBot(); } break;
    case 'cpop': if (inMatch()) Clones.pop(player, m.i | 0); break;   // 相手が自分の影分身を消した
    case 'kcskip': Replay.foeSkip(); break;   // 勝った相手がリプレイをスキップした
    case 'thit': if (inMatch()) Gadgets.damageTurret(Gadgets.myTurret(), m.dmg, bot, true); break;   // 自分のタレット歩が撃たれた
  }
};
// 相手が撃った：銃口から弾の行き先へ光跡
function remoteFire(m) {
  botActor.root.updateMatrixWorld(true);
  const mz = botActor.gun.muzzle ? botActor.gun.muzzle.getWorldPosition(new V3()) : eyeOf(bot);
  for (const e of m.e) {
    const end = V(e);
    Tracers.add(mz, end, P.shu[2]);
    if (e[3]) Particles.impact(end, mz.clone().sub(end).normalize());
  }
  bot.flashT = 0.05;
  SFX.play('shot', mz, bot.w.model);
}

// ================= 毎フレーム =================
export const Online = {
  // 自分の様子を送る（1 秒に 30 回）
  tick(dt: number) {
    if (!Net.on || !inMatch() && gs.state !== 'end') return;
    sendT -= dt;
    if (sendT > 0) return;
    sendT = 1 / 30;
    const p = player, M = Gadgets.ctrlOf(p);
    Net.send({
      t: 's', p: vec(p.pos), v: [r2(p.vel.x), r2(p.vy), r2(p.vel.z)], yw: Math.round(view.yaw * 1000) / 1000, pt: Math.round(view.pitch * 1000) / 1000,
      hp: r2(p.hp), k: p.w.kind === 'melee' ? 1 : 0, st: p.slots.map(s => r2(s.t)), g: p.onGround ? 1 : 0, dr: r2(p.draw || 0), gd: p.swGuard ? 1 : 0,
      ms: M ? [...vec(M.pos), ...vec(M.dir)] : 0,
    });
  },
  // 相手の駒を、届いた様子に合わせて動かす（CPU の代わり）
  updateRemote(dt: number) {
    const b = bot, s = snap;
    if (!s || b.dead) return;
    const tgt = V(s.p);
    if (b.pos.distanceTo(tgt) > 4) b.pos.copy(tgt); else b.pos.lerp(tgt, 1 - Math.exp(-20 * dt));
    b.vel.set(s.v[0], 0, s.v[2]); b.vy = s.v[1]; b.onGround = !!s.g; b.moving = Math.hypot(s.v[0], s.v[2]) > 1;
    const dir = new V3(-Math.sin(s.yw) * Math.cos(s.pt), Math.sin(s.pt), -Math.cos(s.yw) * Math.cos(s.pt));
    b.aimPt = eyeOf(b).addScaledVector(dir, 20);
    b.hp = s.hp;
    s.st.forEach((t, i) => { if (b.slots[i]) b.slots[i].t = t; });
    b.draw = s.dr; b.swGuard = !!s.gd;   // 刀の守りの構え
    const knife = !!s.k;
    if (knife !== (b.w.kind === 'melee')) b.w = knife ? WEAPONS.knife : b.mainW;
    b.netMis = s.ms ? { p: new V3(s.ms[0], s.ms[1], s.ms[2]), d: new V3(s.ms[3], s.ms[4], s.ms[5]) } : null;
  },
};
