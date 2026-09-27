// 将棋モード：盤で駒を動かし、駒を取るときは撃ち合いで決着。相手の玉を撃ち合いで取れば勝ち
import { P, css, rgba } from './palette';
import * as THREE from 'three';
import { gs } from './state';
import { $, BH, C, LIGHT, PIECES, Q, TIME_LIMIT, V3, rand } from './core';
import { SFX } from './audio';
import { PIECE_DEPTH, boardTex, canvasTex, darkWoodTex, pieceGeo, renderer, speckle, toon } from './render';
import { pieceSolidMats } from './physics';
import { resetMatch } from './game';
import { hideOverlay, keysHTML, overlay, showTitle, startMatch } from './screens';

export const BoardMode = (() => {
  const S = 1.15;                                   // マスの大きさ
  const sq = (x, y) => new V3((x - 4) * S, 0, (y - 4) * S);

  // ---------- 盤の部屋 ----------
  const bScene = new THREE.Scene();
  bScene.background = new THREE.Color(P.sumi[0]);
  const bCam = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 200);
  bCam.position.set(0, 14, 10.5); bCam.lookAt(0, 0, 0.9);
  bScene.add(new THREE.HemisphereLight(C(P.shiro[2]), C(P.sumi[1]), 0.5 * LIGHT));
  const key = new THREE.DirectionalLight(C(P.shiro[2]), 1.0 * LIGHT);
  key.position.set(6, 16, 8);
  key.castShadow = Q.shadow > 0; key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 40 });
  key.shadow.bias = -0.0005;
  bScene.add(key);

  const tatamiTex = canvasTex(512, 512, (g, w) => {
    g.fillStyle = css(P.ki[2]); g.fillRect(0, 0, w, w);
    for (let i = 0; i < w; i += 4) { g.fillStyle = rgba(P.ki[0], rand(0.05, 0.15)); g.fillRect(0, i, w, 2); }
    speckle(g, w, w, P.ki[0], 3000);
    g.fillStyle = css(P.midori[0]); g.fillRect(0, 0, w, 14); g.fillRect(0, w - 14, w, 14);
  });
  tatamiTex.wrapS = tatamiTex.wrapT = THREE.RepeatWrapping; tatamiTex.repeat.set(5, 5);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), toon({ map: tatamiTex, roughness: 0.95 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -2.4; floor.receiveShadow = true; bScene.add(floor);

  const BW = 9 * S / (1 - 2 / (2 * BH + 2));         // 盤の目の余白に合わせた盤の大きさ
  const sideM = toon({ map: darkWoodTex, roughness: 0.8 });
  const topM = toon({ map: boardTex, roughness: 0.75 });
  const boardMesh = new THREE.Mesh(new THREE.BoxGeometry(BW, 1.4, BW), [sideM, sideM, topM, sideM, sideM, sideM]);
  boardMesh.position.y = -0.7; boardMesh.castShadow = boardMesh.receiveShadow = true; bScene.add(boardMesh);
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => {
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.75, 1, 8), sideM);
    l.position.set(a * (BW / 2 - 1), -1.9, b * (BW / 2 - 1)); l.castShadow = true; bScene.add(l);
  });
  // 駒台
  [[1, 3.2], [-1, -3.2]].forEach(([sx, z]) => {
    const t = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.5, 3), sideM);
    t.position.set(sx * (BW / 2 + 2.2), -1.2, z); t.castShadow = t.receiveShadow = true; bScene.add(t);
  });

  // マス：クリック判定と色付け
  const tiles = [];
  const tileGeo = new THREE.PlaneGeometry(S * 0.96, S * 0.96);
  for (let y = 0; y < 9; y++) {
    tiles.push([]);
    for (let x = 0; x < 9; x++) {
      const m = new THREE.Mesh(tileGeo, new THREE.MeshBasicMaterial({ color: P.shiro[2], transparent: true, opacity: 0, depthWrite: false }));
      m.rotation.x = -Math.PI / 2; m.position.copy(sq(x, y)); m.position.y = 0.012;
      m.userData.sq = [x, y];
      bScene.add(m); tiles[y].push(m);
    }
  }
  const pieceGroup = new THREE.Group(); bScene.add(pieceGroup);
  const handGroup = new THREE.Group(); bScene.add(handGroup);

  // ---------- 将棋のルール（成りは未実装） ----------
  const HAND_ORDER = ['R', 'B', 'G', 'S', 'N', 'L', 'P'];
  let board, hands, turn, selected, targets, lastMove, preview, busy, over, anim = null;
  const inB = (x, y) => x >= 0 && x < 9 && y >= 0 && y < 9;
  const fwd = o => (o === 0 ? -1 : 1);
  const fromEnd = (o, y) => (o === 0 ? y : 8 - y);   // 0 が相手陣の一番奥
  const ORTH = [[1, 0], [-1, 0], [0, 1], [0, -1]], DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  const GOLD = [[0, 1], [1, 1], [-1, 1], [1, 0], [-1, 0], [0, -1]];
  // 成り：成駒の字（赤）。成駒は盤上の動きが変わる（撃ち合いの性能は元の駒のまま）
  const PRO = { P: 'と', L: '杏', N: '圭', S: '全', R: '龍', B: '馬' };
  const label = p => (p.promoted ? PRO[p.type] : p.type === 'K' && p.owner === 1 ? '玉' : PIECES[p.type].name);
  const canPromote = p => !p.promoted && !!PRO[p.type];
  const inZone = (o, y) => (o === 0 ? y <= 2 : y >= 6);

  function initBoard() {
    board = [...Array(9)].map(() => Array(9).fill(null));
    const back = 'LNSGKGSNL';
    for (let x = 0; x < 9; x++) {
      board[0][x] = { type: back[x], owner: 1 }; board[8][x] = { type: back[x], owner: 0 };
      board[2][x] = { type: 'P', owner: 1 }; board[6][x] = { type: 'P', owner: 0 };
    }
    board[7][7] = { type: 'R', owner: 0 }; board[7][1] = { type: 'B', owner: 0 };
    board[1][1] = { type: 'R', owner: 1 }; board[1][7] = { type: 'B', owner: 1 };
    hands = [[], []];
    turn = 0; selected = null; targets = []; lastMove = null; preview = null; busy = false; over = false;
  }
  function rawMoves(b, x, y) {
    const p = b[y][x], f = fwd(p.owner), res = [];
    const step = (dx, dy) => { const nx = x + dx, ny = y + dy * f; if (inB(nx, ny) && (!b[ny][nx] || b[ny][nx].owner !== p.owner)) res.push([nx, ny]); };
    const slide = (dx, dy) => {
      let nx = x + dx, ny = y + dy * f;
      while (inB(nx, ny)) { const q = b[ny][nx]; if (q) { if (q.owner !== p.owner) res.push([nx, ny]); break; } res.push([nx, ny]); nx += dx; ny += dy * f; }
    };
    const t = p.type, pr = p.promoted;
    if (t === 'K') [...ORTH, ...DIAG].forEach(d => step(d[0], d[1]));
    else if (t === 'R') { ORTH.forEach(d => slide(d[0], d[1])); if (pr) DIAG.forEach(d => step(d[0], d[1])); }   // 龍
    else if (t === 'B') { DIAG.forEach(d => slide(d[0], d[1])); if (pr) ORTH.forEach(d => step(d[0], d[1])); }   // 馬
    else if (t === 'G' || pr) GOLD.forEach(d => step(d[0], d[1]));                                          // 金・と・杏・圭・全
    else if (t === 'S') [[0, 1], [1, 1], [-1, 1], [1, -1], [-1, -1]].forEach(d => step(d[0], d[1]));
    else if (t === 'N') { step(1, 2); step(-1, 2); }
    else if (t === 'L') slide(0, 1);
    else if (t === 'P') step(0, 1);
    return res;
  }
  // 行き所のないマス（歩・香の最奥、桂の奥2段）：そこへ動くときは必ず成る。そこには打てない
  const deadEnd = (t, o, y) => ((t === 'P' || t === 'L') && fromEnd(o, y) === 0) || (t === 'N' && fromEnd(o, y) <= 1);
  const movesOf = (b, x, y) => rawMoves(b, x, y);
  function dropSquares(b, owner, type) {
    const res = [];
    for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
      if (b[y][x] || deadEnd(type, owner, y)) continue;
      if (type === 'P' && b.some(row => row[x] && row[x].type === 'P' && row[x].owner === owner)) continue;   // 二歩
      res.push([x, y]);
    }
    return res;
  }
  function attackedBy(b, owner, x, y) {
    for (let yy = 0; yy < 9; yy++) for (let xx = 0; xx < 9; xx++) {
      const p = b[yy][xx];
      if (p && p.owner === owner && rawMoves(b, xx, yy).some(([a, c]) => a === x && c === y)) return true;
    }
    return false;
  }
  function findKing(b, owner) {
    for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) { const p = b[y][x]; if (p && p.type === 'K' && p.owner === owner) return [x, y]; }
    return null;
  }

  // ---------- CPU の指し手 ----------
  // 撃ち合いの勝ちやすさを駒の価値から見積もる（王は 12 として計算）
  const val = t => (t === 'K' ? 12 : PIECES[t].value);
  const pWin = (a, d) => { const va = Math.pow(val(a), 1.1), vd = Math.pow(val(d), 1.1); return va / (va + vd); };
  function simulate(b, m, owner) {
    const nb = b.map(r => r.slice());
    if (m.kind === 'drop') nb[m.ty][m.tx] = { type: m.type, owner };
    else { nb[m.ty][m.tx] = nb[m.fy][m.fx]; nb[m.fy][m.fx] = null; }
    return nb;
  }
  function allMoves(owner) {
    const res = [];
    for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
      const p = board[y][x];
      if (p && p.owner === owner) movesOf(board, x, y).forEach(([tx, ty]) => res.push({ kind: 'move', fx: x, fy: y, tx, ty }));
    }
    [...new Set(hands[owner])].forEach(type => dropSquares(board, owner, type).forEach(([tx, ty]) => res.push({ kind: 'drop', type, tx, ty })));
    return res;
  }
  function aiChoose() {
    let best = null, bs = -Infinity;
    for (const m of allMoves(1)) {
      let s = Math.random() * 0.6;
      const me = m.kind === 'drop' ? { type: m.type, owner: 1 } : board[m.fy][m.fx];
      const worth = t => (t === 'K' ? 60 : val(t));
      if (m.kind === 'move') {
        const tgt = board[m.ty][m.tx];
        if (tgt) { const p = pWin(me.type, tgt.type); s += p * worth(tgt.type) - (1 - p) * worth(me.type); }
        if (attackedBy(board, 0, m.fx, m.fy)) s += val(me.type) * 0.4;   // 狙われている駒を逃がす
        if (canPromote(me) && (inZone(1, m.fy) || inZone(1, m.ty))) s += 1.5;   // 成れる手
        s += me.type === 'K' ? -0.3 : (m.ty - m.fy) * 0.12;
      } else s += 0.25;
      const nb = simulate(board, m, 1);
      if (attackedBy(nb, 0, m.tx, m.ty)) s -= worth(me.type) * 0.45;    // 取られそうな所は避ける（撃ち合いで守れることもある）
      const k = findKing(nb, 1);
      if (k && attackedBy(nb, 0, k[0], k[1])) s -= 25;
      if (s > bs) { bs = s; best = m; }
    }
    return best;
  }

  // ---------- 表示 ----------
  const SIZE = { K: 0.98, R: 0.93, B: 0.93, G: 0.88, S: 0.88, N: 0.84, L: 0.8, P: 0.76 };
  function pieceMesh(p) {
    const g = new THREE.Group(), z = SIZE[p.type];
    const m = new THREE.Mesh(pieceGeo, pieceSolidMats(label(p), p.promoted));
    m.scale.set(z * S * 0.82, z * S * 0.92, 0.3 / PIECE_DEPTH);
    m.rotation.x = -Math.PI / 2; m.position.y = 0.15; m.castShadow = true;
    g.add(m); g.rotation.y = p.owner === 1 ? Math.PI : 0;
    return g;
  }
  const pickables = [];
  function refresh(animMove?) {
    pieceGroup.clear(); pickables.length = 0;
    for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
      const p = board[y][x];
      if (!p) continue;
      const g = pieceMesh(p);
      g.position.copy(sq(x, y));
      g.children[0].userData.sq = [x, y];
      pieceGroup.add(g); pickables.push(g.children[0]);
      if (animMove && animMove.tx === x && animMove.ty === y) {
        const from = animMove.kind === 'drop' ? sq(x, y).add(new V3(0, 3, 0)) : sq(animMove.fx, animMove.fy);
        anim = { obj: g, from, to: sq(x, y), t: 0 };
        g.position.copy(from);
      }
    }
    // 持ち駒を駒台に並べる
    handGroup.clear();
    [0, 1].forEach(o => {
      const counts = {};
      hands[o].forEach(t => { counts[t] = (counts[t] || 0) + 1; });
      let i = 0;
      HAND_ORDER.forEach(t => {
        for (let n = 0; n < (counts[t] || 0); n++) {
          const g = pieceMesh({ type: t, owner: o });
          const col = i % 3, row = Math.floor(i / 3);
          const sx = o === 0 ? 1 : -1;
          g.position.set(sx * (BW / 2 + 1.4 + col * 0.8), -0.95, sx * (2.2 + row * 0.9) * (o === 0 ? 1 : 1));
          g.scale.setScalar(0.8);
          handGroup.add(g); i++;
        }
      });
    });
    paint();
    // 持ち駒ボタン
    const hp = $('bmHandP'); hp.innerHTML = '';
    HAND_ORDER.forEach(t => {
      const n = hands[0].filter(h => h === t).length;
      if (!n) return;
      const b = document.createElement('button');
      b.className = 'bm-hand' + (selected && selected.kind === 'drop' && selected.type === t ? ' sel' : '');
      b.innerHTML = PIECES[t].name + (n > 1 ? `<small>×${n}</small>` : '');
      b.onclick = e => {
        e.stopPropagation();
        if (busy || turn !== 0 || over) return;
        selected = { kind: 'drop', type: t }; targets = dropSquares(board, 0, t); refresh();
      };
      hp.appendChild(b);
    });
    const he = $('bmHandE');
    he.textContent = HAND_ORDER.map(t => PIECES[t].name.repeat(hands[1].filter(h => h === t).length)).join('') || 'なし';
  }
  function paint() {
    const set = ([x, y]: number[], c, o = 0.45) => { const m = tiles[y][x].material; m.color.setHex(c); m.opacity = o; };
    for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) tiles[y][x].material.opacity = 0;
    const lm = preview || lastMove;
    if (lm) { if (lm.kind === 'move') set([lm.fx, lm.fy], P.ki[2], 0.35); set([lm.tx, lm.ty], preview ? P.daidai[1] : P.ki[2], 0.45); }
    if (selected && selected.kind === 'move') set([selected.x, selected.y], P.ao[2], 0.55);
    targets.forEach(([x, y]) => set([x, y], board[y][x] ? P.shu[1] : P.midori[2], 0.5));
    const k = findKing(board, 0);
    if (k && attackedBy(board, 1, k[0], k[1])) set(k, P.shu[1], 0.55);
  }
  const setMsg = t => { $('bmMsg').textContent = t; };
  function turnMsg() {
    const k = findKing(board, 0);
    setMsg('あなたの番' + (k && attackedBy(board, 1, k[0], k[1]) ? ' ― 王手！' : ''));
  }

  // ---------- 操作 ----------
  const picker = new THREE.Raycaster(), mouse = new THREE.Vector2();
  renderer.domElement.addEventListener('click', e => {
    if (gs.state !== 'board' || busy || turn !== 0 || over) return;
    mouse.set(e.clientX / innerWidth * 2 - 1, -e.clientY / innerHeight * 2 + 1);
    picker.setFromCamera(mouse, bCam);
    const hit = picker.intersectObjects([...pickables, ...tiles.flat()], false)[0];
    if (!hit) { selected = null; targets = []; refresh(); return; }
    const [x, y] = hit.object.userData.sq;
    if (selected && targets.some(t => t[0] === x && t[1] === y)) {
      const m = selected.kind === 'drop' ? { kind: 'drop', type: selected.type, tx: x, ty: y } : { kind: 'move', fx: selected.x, fy: selected.y, tx: x, ty: y };
      selected = null; targets = [];
      doMove(m, 0);
      return;
    }
    const p = board[y][x];
    if (p && p.owner === 0) { selected = { kind: 'move', x, y }; targets = movesOf(board, x, y); SFX.play('clunk'); }
    else { selected = null; targets = []; }
    refresh();
  });

  // ---------- 撃ち合いへ ----------
  let battleDone = null;
  function battle(att, def, playerIsAttacker) {
    return new Promise(resolve => {
      battleDone = resolve;
      const me = playerIsAttacker ? att : def, foe = playerIsAttacker ? def : att;
      gs.matchCtx = { myType: me.type, foeType: foe.type, playerIsAttacker };
      showUI(false);
      const mn = label(me), fn = label(foe);
      overlay(`<div class="res" style="font-size:50px;color:${playerIsAttacker ? 'var(--kin-2)' : 'var(--ao-2)'}">${playerIsAttacker ? '攻め' : '守り'}</div>
        <div class="vs-line"><b class="bm-koma"${me.promoted ? ' style="color:var(--shu-0)"' : ''}>${mn}</b><span>あなた</span><em>VS</em><span>相手</span><b class="bm-koma"${foe.promoted ? ' style="color:var(--shu-0)"' : ''}>${fn}</b></div>
        <p>${playerIsAttacker ? `勝てば相手の「${fn}」を取れる。負けるとあなたの「${mn}」を取られる` : `守り切れば攻めてきた「${fn}」を取れる。負けるとあなたの「${mn}」を取られる`}</p>
        <p>制限時間 ${TIME_LIMIT} 秒・時間切れは守った側の勝ち</p>
        ${me.promoted || foe.promoted ? '<p style="opacity:.7">※成駒の撃ち合いはまだ元の駒の性能です</p>' : ''}
        <button class="btn" id="bmFight">撃ち合い開始</button>${keysHTML()}`, true);
      $('bmFight').onclick = e => { e.stopPropagation(); startMatch(); };
    });
  }
  // 撃ち合いの結果（win: プレイヤーの勝ち true / 負け false / 時間切れ null）
  function battleResult(win) {
    const ctx = gs.matchCtx;
    const attackerWon = win === null ? false : (win === true) === ctx.playerIsAttacker;
    const playerWon = win === null ? !ctx.playerIsAttacker : win;
    $('hud').style.display = 'none';
    overlay(`<div class="res" style="color:${playerWon ? 'var(--kin-2)' : 'var(--shu-1)'}">${
      ctx.playerIsAttacker ? (attackerWon ? '駒を取った！' : '取り返された…') : (attackerWon ? '駒を取られた…' : '守り切った！')}</div>
      <p>${win === null ? '時間切れ：守った側の勝ち' : ''}</p>
      <button class="btn" id="bmBack">盤面へ戻る</button>`, true);
    $('bmBack').onclick = e => {
      e.stopPropagation();
      gs.matchCtx = null;
      hideOverlay(); gs.state = 'board'; showUI(true);
      const r = battleDone; battleDone = null; r(attackerWon);
    };
  }

  async function doMove(m, owner) {
    busy = true;
    let winner = null;
    if (m.kind === 'drop') {
      hands[owner].splice(hands[owner].indexOf(m.type), 1);
      board[m.ty][m.tx] = { type: m.type, owner };
      SFX.play('clunk');
    } else {
      const p = board[m.fy][m.fx], t = board[m.ty][m.tx];
      if (t) {
        const attackerWon = await battle(p, t, owner === 0);
        if (attackerWon) {
          hands[owner].push(t.type);
          board[m.ty][m.tx] = p; board[m.fy][m.fx] = null;
          if (t.type === 'K') winner = owner;
        } else {
          hands[1 - owner].push(p.type);
          board[m.fy][m.fx] = null;
          if (p.type === 'K') winner = 1 - owner;
          m = Object.assign({}, m, { lost: true });
        }
      } else {
        board[m.ty][m.tx] = p; board[m.fy][m.fx] = null;
        SFX.play('clunk');
      }
    }
    // 成り：敵陣に入る・敵陣から出る・敵陣の中で動いたとき（行き所がなければ必ず成る。CPUはいつも成る）
    const moved = m.kind === 'move' && !m.lost && winner === null ? board[m.ty][m.tx] : null;
    if (moved && canPromote(moved) && (inZone(owner, m.fy) || inZone(owner, m.ty))) {
      moved.promoted = owner === 1 || deadEnd(moved.type, owner, m.ty) || await askPromote(moved);
      if (moved.promoted) SFX.play('ding');
    }
    lastMove = m.lost ? null : m; preview = null;
    refresh(m.lost ? null : m);
    if (winner !== null) { gameOver(winner); return; }
    turn = 1 - owner;
    busy = false;
    if (turn === 1) aiTurn(); else turnMsg();
  }
  async function aiTurn() {
    if (over) return;
    busy = true;
    setMsg('相手の番…');
    await sleep(700);
    const m = aiChoose();
    if (!m) { gameOver(0); return; }
    preview = m; paint();
    if (m.kind === 'move' && board[m.ty][m.tx]) {
      setMsg(`相手の「${label(board[m.fy][m.fx])}」が、あなたの「${label(board[m.ty][m.tx])}」を取りに来た！`);
      await sleep(1400);
    } else await sleep(350);
    await doMove(m, 1);
  }
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  function askPromote(p) {
    return new Promise(res => {
      overlay(`<div class="res" style="font-size:46px">成りますか？</div>
        <div class="vs-line"><b class="bm-koma">${label(p)}</b><em>→</em><b class="bm-koma" style="color:var(--shu-0)">${PRO[p.type]}</b></div>
        <p>成ると盤上の動きが変わります（撃ち合いの性能はまだ元の駒のままです）</p>
        <div class="modes"><button class="btn" id="bmPro">成る</button><button class="btn ghost-btn" id="bmNoPro">成らない</button></div>`, true);
      $('bmPro').onclick = e => { e.stopPropagation(); hideOverlay(); res(true); };
      $('bmNoPro').onclick = e => { e.stopPropagation(); hideOverlay(); res(false); };
    });
  }

  function gameOver(winner) {
    over = true; busy = true;
    setMsg('');
    overlay(`<div class="res" style="color:${winner === 0 ? 'var(--kin-2)' : 'var(--shu-1)'}">${winner === 0 ? '勝利' : '敗北'}</div>
      <p>${winner === 0 ? '相手の玉を討ち取った！' : 'あなたの王が討たれた…'}</p>
      <button class="btn" id="bmAgain">もう一局</button><button class="btn ghost" id="bmTitle">タイトルへ</button>`, true);
    $('bmAgain').onclick = e => { e.stopPropagation(); start(); };
    $('bmTitle').onclick = e => { e.stopPropagation(); exit(); };
  }

  // ---------- UI ----------
  const ui = document.createElement('div');
  ui.id = 'bmUI';
  ui.innerHTML = `<div id="bmMsg" class="shadow"></div>
    <div class="bm-panel bm-e"><h4>相手の持ち駒</h4><div id="bmHandE"></div></div>
    <div class="bm-panel bm-p"><h4>あなたの持ち駒（クリックで打つ）</h4><div id="bmHandP"></div></div>
    <div class="bm-btns"><button class="small" id="bmResign">投了</button><button class="small" id="bmQuit">タイトルへ</button></div>
    <div class="bm-help">駒をクリック → 光ったマスへ。赤いマスは相手の駒：撃ち合いで勝てば取れる、負けると取られる</div>`;
  document.body.appendChild(ui);
  function showUI(v) { ui.style.display = v ? 'block' : 'none'; }
  $('bmResign').onclick = e => { e.stopPropagation(); if (!over && !busy) gameOver(1); };
  $('bmQuit').onclick = e => { e.stopPropagation(); exit(); };

  function start() {
    SFX.init();
    initBoard();
    gs.matchCtx = null; anim = null;
    gs.state = 'board';
    hideOverlay(); $('hud').style.display = 'none';
    showUI(true);
    refresh();
    turnMsg();
  }
  function exit() {
    gs.matchCtx = null; over = true;
    showUI(false);
    resetMatch(); showTitle();
  }
  // 将棋モードの撃ち合いを途中でやめたとき
  function abort() { gs.matchCtx = null; battleDone = null; showUI(false); over = true; }

  let t = 0;
  function update(rdt) {
    t += rdt;
    // 駒が動く・打たれるアニメーション（ぴょんと跳ねる）
    if (anim) {
      anim.t = Math.min(1, anim.t + rdt / 0.3);
      const k = anim.t;
      anim.obj.position.lerpVectors(anim.from, anim.to, k);
      anim.obj.position.y += Math.sin(Math.PI * k) * 0.8 * (anim.from.y > 1 ? 0 : 1);
      if (k >= 1) anim = null;
    }
    // ゆっくり揺れるカメラ
    bCam.position.set(Math.sin(t * 0.15) * 0.4, 14, 10.5);
    bCam.lookAt(0, 0, 0.9);
  }
  addEventListener('resize', () => { bCam.aspect = innerWidth / innerHeight; bCam.updateProjectionMatrix(); });

  showUI(false);
  return {
    start, exit, abort, update, battleResult, scene: bScene, cam: bCam,
    // 確認用：盤面を直接いじって表示を更新する（開発中のテストに使う）
    debug: { get board() { return board; }, get hands() { return hands; }, refresh: () => refresh() },
  };
})();
