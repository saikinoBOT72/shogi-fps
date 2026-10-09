// 将棋モード：盤で駒を動かし、駒を取るときは一騎打ちで決着。相手の玉を一騎打ちで取れば勝ち
// ブラインド将棋（友達と対戦のときだけ）：始める前に自分の3段の中で駒を並べ替えられる。対局中、相手の駒は字の無い駒に見え
//   （持ち駒から打った駒・成った駒も）、一騎打ちが始まって相手の姿を見るまで何の駒か分からない。決着したら全部表に返す
import { P, css, rgba } from './palette';
import * as THREE from 'three';
import { gs } from './state';
import { $, BH, C, LIGHT, PIECES, Q, TIME_LIMIT, V3, duelType, rand, settings } from './core';
import { MAP_LIST, pickMap, selectableMaps } from './world';
import { questEvent } from './quests';
import { SFX } from './audio';
import { PIECE_DEPTH, boardTex, canvasTex, darkWoodTex, pieceGeo, renderer, speckle, toon } from './render';
import { pieceSolidMats } from './physics';
import { resetMatch } from './game';
import { bindMapPick, hideOverlay, keysHTML, mapPickHTML, overlay, sealHTML, showTitle, startMatch } from './screens';
import { Net } from './net';
import { leave, showLobby } from './online';
import { HAND_ORDER, PRO, allMoves, attackedBy, canPromote, deadEnd, dropSquares, findKing, inCheck, inZone, initialBoard, label, nifu, rawMoves } from './shogi/rules';
import { chooseMove, recordBattle } from './shogi/cpu';

export const BoardMode = (() => {
  const S = 1.15;                                   // マスの大きさ
  const sq = (x, y) => new V3((x - 4) * S, 0, (y - 4) * S);

  // ---------- 盤の部屋 ----------
  const bScene = new THREE.Scene();
  bScene.background = new THREE.Color(P.sumi[0]);
  const bCam = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 200);
  bCam.position.set(0, 14, 10.5); bCam.lookAt(0, 0, 0.9);
  bScene.add(new THREE.HemisphereLight(C(P.shiro[2]).lerp(C(P.kiji[2]), 0.45), C(P.kiji[0]), 0.5 * LIGHT));   // 影は茶色
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

  // ---------- 対局の状態（ルールそのものは shogi/rules.ts、CPU の指し手は shogi/cpu.ts） ----------
  let board, hands, turn, selected, targets, lastMove, preview, busy, over, anim = null;
  let contest = null;   // 一騎打ちの最中：{ fx, fy, tx, ty, att: 挑んだ駒 }
  let blind = false, setup = false, setupSel = null, hostSide = true;   // ブラインド将棋：setup = 並べ替えの最中
  // この駒を字の無い駒に見せるか（ブラインドの相手の駒。決着したら見せる）
  const hidden = p => blind && !over && p.owner === 1;
  let gen = 0, online = false;   // online: 友達と対戦（相手 = 1 は CPU ではなく友達。自分は必ず手前側）   // gen: 対局ごとの番号（途中でやめた対局の続きを止める）
  const movesOf = (b, x, y) => rawMoves(b, x, y);

  // 途中の対局を保存（1手ごと）。決着したら消す
  const SAVE = 'shogiFps.board';
  // ブラインド将棋（CPU）は途中保存しない（ふつうの将棋の続きを消さないように）
  const save = () => { if (online || blind) return; try { localStorage.setItem(SAVE, JSON.stringify({ board, hands, turn, lastMove })); } catch (e) {} };
  const clearSave = () => { if (blind) return; try { localStorage.removeItem(SAVE); } catch (e) {} };
  function loadSave() {
    try { const d = JSON.parse(localStorage.getItem(SAVE) || 'null'); return d && d.board && d.hands ? d : null; } catch (e) { return null; }
  }
  function initBoard() {
    board = initialBoard(); hands = [[], []];
    turn = 0; selected = null; targets = []; lastMove = null; preview = null; busy = false; over = false;
  }

  // ---------- 表示 ----------
  const SIZE = { K: 0.98, R: 0.93, B: 0.93, G: 0.88, S: 0.88, N: 0.84, L: 0.8, P: 0.76 };
  // ひび（相手から取った駒）：表面に重ねる黒いひびの模様
  const clampN = (v, a, b) => Math.max(a, Math.min(b, v));
  // 割れ方は何通りか作っておき、駒ごとに選ぶ（全部同じだと不自然なので）
  const crackMats = [0, 1, 2, 3, 4, 5].map(v => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, map: canvasTex(128, 128, (g, w) => {
    g.strokeStyle = rgba(P.sumi[0], 0.85); g.lineCap = 'round';
    const branch = (x, y, a, len, width, depth, wob = 0.6) => {
      if (depth <= 0 || len < 4) return;
      g.lineWidth = width; g.beginPath(); g.moveTo(x, y);
      const n = 3 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) { a += rand(-wob, wob); x += Math.cos(a) * len / n; y += Math.sin(a) * len / n; g.lineTo(clampN(x, 14, w - 14), clampN(y, 14, w - 14)); }
      g.stroke();
      branch(x, y, a + rand(0.5, 1.1), len * 0.55, width * 0.7, depth - 1, wob);
      branch(x, y, a - rand(0.5, 1.1), len * 0.5, width * 0.7, depth - 1, wob);
    };
    const c = w / 2, side = Math.random() < 0.5 ? 1 : -1;
    if (v === 0) for (let k = 0; k < 3; k++) branch(c + rand(-10, 10), c + rand(-10, 10), k * 2.1 + rand(0, 1), 46, 3.2, 3);   // 真ん中から放射状
    if (v === 1) { branch(c, c, -2.4 + rand(-0.3, 0.3), 60, 3.4, 2, 0.35); branch(c, c, 0.7 + rand(-0.3, 0.3), 60, 3.4, 2, 0.35); }   // 斜めに一本、割れ目が走る
    if (v === 2) { const x = c + side * 44, y = c + 44; for (let k = 0; k < 2; k++) branch(x, y, (side > 0 ? -2.4 : -0.7) + rand(-0.5, 0.5), 64, 3.2, 3); }   // 角から入ったひび
    if (v === 3) { branch(16, c + rand(-20, 20), rand(-0.3, 0.3), 52, 3, 3); branch(w - 16, c + rand(-20, 20), Math.PI + rand(-0.3, 0.3), 52, 3, 3); }   // 両側から入って真ん中で止まる
    if (v === 4) {   // 蜘蛛の巣：細かい放射＋輪
      const n = 6, r = [14, 28];
      for (let k = 0; k < n; k++) branch(c, c, k * Math.PI * 2 / n + rand(-0.2, 0.2), 44, 2.4, 2, 0.25);
      g.lineWidth = 1.6; for (const rr of r) { g.beginPath(); for (let k = 0; k <= n; k++) { const a = k * Math.PI * 2 / n, q = rr * rand(0.85, 1.15); k ? g.lineTo(c + Math.cos(a) * q, c + Math.sin(a) * q) : g.moveTo(c + Math.cos(a) * q, c + Math.sin(a) * q); } g.stroke(); }
    }
    if (v === 5) { branch(c + side * 46, 18, Math.PI / 2 + side * 0.5 + rand(-0.2, 0.2), 70, 3.6, 3, 0.45); branch(c - side * 30, w - 18, -Math.PI / 2 + rand(-0.4, 0.4), 30, 2.4, 2); }   // 上の端から欠けるように
  }) }));
  function pieceMesh(p) {
    const hide = hidden(p);
    const g = new THREE.Group(), z = hide ? 0.88 : SIZE[p.type];
    const m = new THREE.Mesh(pieceGeo, pieceSolidMats(hide ? '' : label(p), !hide && p.promoted));
    m.scale.set(z * S * 0.82, z * S * 0.92, 0.3 / PIECE_DEPTH);
    m.rotation.x = -Math.PI / 2; m.position.y = 0.15; m.castShadow = true;
    g.add(m); g.rotation.y = p.owner === 1 ? Math.PI : 0;
    if (p.cracked && !hide) {
      m.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(m), sz = b.getSize(new V3());
      if (p.crackV == null) p.crackV = Math.floor(Math.random() * crackMats.length);   // 盤の駒は一度決めた割れ方のまま
      const c = new THREE.Mesh(new THREE.PlaneGeometry(sz.x * 0.8, sz.z * 0.8), crackMats[p.crackV % crackMats.length]);
      c.rotation.x = -Math.PI / 2; c.position.set((b.min.x + b.max.x) / 2, b.max.y + 0.004, (b.min.z + b.max.z) / 2); g.add(c);
    }
    return g;
  }
  // 爆発四散：駒が回りながら飛び散り、火の粉が舞う
  const debris = [];
  const sparkGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
  const sparkMs = [P.daidai[2], P.ki[2], P.shu[1]].map(c => new THREE.MeshBasicMaterial({ color: c }));
  function blowUp(list, x) {
    SFX.play('nifu');
    for (const [p, y] of list) {
      const at = sq(x, y);
      const g = pieceMesh(p); g.position.copy(at); bScene.add(g);
      debris.push({ o: g, v: new V3(rand(-4, 4), rand(6, 10), rand(-4, 4)), s: new V3(rand(-14, 14), rand(-14, 14), rand(-14, 14)), t: 0, life: 1.4 });
      for (let i = 0; i < 10; i++) {
        const k = new THREE.Mesh(sparkGeo, sparkMs[i % 3]); k.position.copy(at).setY(0.3); bScene.add(k);
        debris.push({ o: k, v: new V3(rand(-6, 6), rand(3, 9), rand(-6, 6)), s: new V3(rand(-9, 9), rand(-9, 9), 0), t: 0, life: rand(0.5, 0.9) });
      }
    }
  }
  function updateDebris(dt) {
    for (let i = debris.length - 1; i >= 0; i--) {
      const d = debris[i]; d.t += dt;
      d.v.y -= 20 * dt; d.o.position.addScaledVector(d.v, dt);
      d.o.rotation.x += d.s.x * dt; d.o.rotation.y += d.s.y * dt; d.o.rotation.z += d.s.z * dt;
      const k = Math.max(0, 1 - Math.max(0, d.t - d.life * 0.6) / (d.life * 0.4));
      d.o.scale.setScalar(k);
      if (d.t >= d.life) { bScene.remove(d.o); debris.splice(i, 1); }
    }
  }
  const pickables = [];
  function refresh(animMove?) {
    pieceGroup.clear(); pickables.length = 0;
    for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
      const p = board[y][x];
      if (!p || (setup && p.owner === 1)) continue;
      if (contest && contest.fx === x && contest.fy === y) continue;   // 挑んでいる駒は相手のマスに描く
      const g = pieceMesh(p);
      g.position.copy(sq(x, y));
      // 一騎打ちの最中：1マスに両方の駒を並べて見せる（守る駒は左、挑んだ駒は右）
      if (contest && contest.tx === x && contest.ty === y) {
        g.scale.setScalar(0.72); g.position.x -= S * 0.24;
        const a = pieceMesh(contest.att); a.scale.setScalar(0.72); a.position.copy(sq(x, y)); a.position.x += S * 0.24; a.position.y += 0.02;
        pieceGroup.add(g, a); continue;
      }
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
      const order = blind && !over && o === 1 ? hands[o].map((t, k) => ({ t, k })) : null;
      if (order) for (const { t } of order) {
        const g = pieceMesh({ type: t, owner: o, cracked: true, crackV: i * 5 + o });
        const col = i % 3, row = Math.floor(i / 3);
        g.position.set(-(BW / 2 + 1.4 + col * 0.8), -0.95, -(2.2 + row * 0.9)); g.scale.setScalar(0.8);
        handGroup.add(g); i++;
      }
      if (!order) HAND_ORDER.forEach(t => {
        for (let n = 0; n < (counts[t] || 0); n++) {
          const g = pieceMesh({ type: t, owner: o, cracked: true, crackV: i * 5 + o });   // 持ち駒は相手から取った駒なので、ひび入り
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
        selected = { kind: 'drop', type: t }; targets = dropSquares(board, 0, t, hands); refresh();
      };
      hp.appendChild(b);
    });
    const he = $('bmHandE');
    he.textContent = blind && !over ? (hands[1].length ? `？ ×${hands[1].length}` : 'なし') : HAND_ORDER.map(t => PIECES[t].name.repeat(hands[1].filter(h => h === t).length)).join('') || 'なし';
    $('bmSetup').style.display = setup ? 'flex' : 'none';
  }
  function paint() {
    const set = ([x, y]: number[], c, o = 0.45) => { const m = tiles[y][x].material; m.color.setHex(c); m.opacity = o; };
    for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) tiles[y][x].material.opacity = 0;
    const lm = preview || lastMove;
    if (lm) { if (lm.kind === 'move') set([lm.fx, lm.fy], P.ki[2], 0.35); set([lm.tx, lm.ty], preview ? P.daidai[1] : P.ki[2], 0.45); }
    if (selected && selected.kind === 'move') set([selected.x, selected.y], P.ao[2], 0.55);
    targets.forEach(([x, y]) => set([x, y], board[y][x] ? P.shu[1] : P.midori[2], 0.5));
    if (setup) {
      for (let y = 6; y < 9; y++) for (let x = 0; x < 9; x++) set([x, y], P.midori[2], 0.12);
      if (setupSel) set(setupSel, P.ao[2], 0.6);
      return;
    }
    const k = findKing(board, 0);
    if (!blind && k && attackedBy(board, 1, k[0], k[1])) set(k, P.shu[1], 0.55);
  }
  const setMsg = t => { $('bmMsg').textContent = t; };
  function turnMsg() {
    const k = findKing(board, 0), check = !blind && k && attackedBy(board, 1, k[0], k[1]);
    setMsg('あなたの番' + (check ? ' ― 王手！' : ''));
    if (check) SFX.play('check');
  }

  // ---------- 操作 ----------
  const picker = new THREE.Raycaster(), mouse = new THREE.Vector2();
  renderer.domElement.addEventListener('click', e => {
    if (gs.state !== 'board' || over) return;
    mouse.set(e.clientX / innerWidth * 2 - 1, -e.clientY / innerHeight * 2 + 1);
    picker.setFromCamera(mouse, bCam);
    if (setup) { setupClick(picker.intersectObjects([...pickables, ...tiles.flat()], false)[0]); return; }
    if (busy || turn !== 0) return;
    const hit = picker.intersectObjects([...pickables, ...tiles.flat()], false)[0];
    if (!hit) { selected = null; targets = []; refresh(); return; }
    const [x, y] = hit.object.userData.sq;
    if (selected && targets.some(t => t[0] === x && t[1] === y)) {
      const m = selected.kind === 'drop' ? { kind: 'drop', type: selected.type, tx: x, ty: y } : { kind: 'move', fx: selected.x, fy: selected.y, tx: x, ty: y };
      selected = null; targets = [];
      if (online) Net.send({ t: 'bm', m: flip(m) });
      doMove(m, 0);
      return;
    }
    const p = board[y][x];
    if (p && p.owner === 0) { selected = { kind: 'move', x, y }; targets = movesOf(board, x, y); SFX.play('sel'); }
    else { selected = null; targets = []; }
    refresh();
  });

  // ---------- ブラインド将棋：始める前の並べ替え ----------
  function setupClick(hit) {
    if (!hit || setupDone) { setupSel = null; refresh(); return; }
    const [x, y] = hit.object.userData.sq;
    if (y < 6) { setupSel = null; refresh(); return; }   // 自分の3段の中だけ
    if (!setupSel) { if (board[y][x]) { setupSel = [x, y]; SFX.play('sel'); } refresh(); return; }
    const [sx, sy] = setupSel;
    if (sx !== x || sy !== y) { const t = board[y][x]; board[y][x] = board[sy][sx]; board[sy][sx] = t; SFX.play('place'); refresh({ kind: 'move', fx: sx, fy: sy, tx: x, ty: y }); }
    setupSel = null; refresh();
  }
  let setupDone = false;
  // 並べ終わった：自分の3段を送り、相手の並びが届いたら（向きを反対にして）盤に置いて始める
  async function finishSetup() {
    if (setupDone) return;
    const g = gen;
    setupDone = true; setupSel = null;
    if (!online) {   // CPU と：CPU も自分の3段を並べ替えて始める（あなたが先手）
      cpuSetup();
      setup = false; turn = 0; SFX.play('battle'); refresh(); nextTurn(); return;
    }
    Net.send({ t: 'bsetup', v: [6, 7, 8].map(y => board[y].map(p => (p ? p.type : null))) });
    setMsg('相手が並べ終わるのを待っています…'); refresh();
    const v = await waitNet('bsetup');
    if (g !== gen) return;
    for (let i = 0; i < 3; i++) for (let x = 0; x < 9; x++) { const t = v[i] && v[i][x]; board[2 - i][8 - x] = t ? { type: t, owner: 1 } : null; }
    setup = false; turn = hostSide ? 0 : 1;
    SFX.play('battle');
    refresh(); nextTurn();
  }
  // CPU の並べ方：玉の場所を散らし（端寄りが多い）、金銀で囲い、歩は筋ごとに1枚（たまに1段下げる）、
  // 飛は玉と反対側に寄せ、残りの角・桂・香は空いたマスへ。ときどき玉の定位置に金を置いてごまかす
  function cpuSetup() {
    const rnd = n => Math.floor(Math.random() * n);
    const pick = (arr, w) => { let s = w.reduce((a, b) => a + b, 0) * Math.random(); for (let i = 0; i < arr.length; i++) if ((s -= w[i]) < 0) return arr[i]; return arr[arr.length - 1]; };
    const cells = []; for (let y = 0; y < 3; y++) for (let x = 0; x < 9; x++) { board[y][x] = null; cells.push([x, y]); }
    const free = () => cells.filter(([x, y]) => !board[y][x]);
    const put = ([x, y], type) => { board[y][x] = { type, owner: 1 }; };
    // 玉：端寄り（穴熊・美濃っぽい）が多く、真ん中もある。たまに2段目
    const kx = pick([0, 1, 2, 3, 4, 5, 6, 7, 8], [3, 5, 4, 2, 2, 2, 4, 5, 3]), ky = Math.random() < 0.75 ? 0 : 1;
    put([kx, ky], 'K');
    // 歩：筋ごとに1枚。ふつうは3段目、ときどき2段目に下げて形を崩す
    for (let x = 0; x < 9; x++) put(!board[1][x] && Math.random() < 0.18 ? [x, 1] : [x, 2], 'P');
    // 金銀：玉の近く（近いほど選ばれやすい）
    for (const t of ['G', 'G', 'S', 'S']) {
      const f = free(), w = f.map(([x, y]) => { const d = Math.max(Math.abs(x - kx), Math.abs(y - ky)); return d <= 1 ? 6 : d === 2 ? 2 : 0.15; });
      put(pick(f, w), t);
    }
    // 飛：玉と反対側に寄せる
    { const f = free(); put(pick(f, f.map(([x]) => 1 + Math.abs(x - kx) ** 1.5)), 'R'); }
    for (const t of ['B', 'N', 'N', 'L', 'L']) { const f = free(); put(f[rnd(f.length)], t); }
    // ときどき：玉がいそうな真ん中の奥に金を置いて、本物の玉は端に
    if (Math.abs(kx - 4) >= 2 && Math.random() < 0.3 && board[0][4]?.type !== 'G') {
      const g = cells.find(([x, y]) => board[y][x]?.type === 'G' && !(x === 4 && y === 0));
      if (g) { const t = board[0][4]; board[0][4] = board[g[1]][g[0]]; board[g[1]][g[0]] = t; }
    }
  }
  function setupMsg() { setMsg('ブラインド将棋：自分の3段の中で並べ替えられます（動かす駒 → 置きたいマス）'); }

  // ---------- 一騎打ちへ ----------
  let battleDone = null;
  function battle(att, def, playerIsAttacker) {
    return new Promise(resolve => {
      battleDone = resolve;
      const me = playerIsAttacker ? att : def, foe = playerIsAttacker ? def : att;
      gs.matchCtx = { myType: duelType(me.type, me.promoted), foeType: duelType(foe.type, foe.promoted), playerIsAttacker };   // 成っていれば成駒で戦う
      showUI(false);
      SFX.play('battle');
      const mn = label(me), hideFoe = blind, fn = hideFoe ? '？' : label(foe);
      // ステージは攻められた（守る）側が選ぶ。CPU が守るときは、選べるマップからランダム
      const meDef = !playerIsAttacker, done = resolve;
      let stage = meDef ? pickMap(settings.map, true) : online ? null : selectableMaps()[Math.floor(Math.random() * selectableMaps().length)][0];
      let sent = false;
      gs.boardMap = stage;
      const mapName = id => (MAP_LIST.find(m => m[0] === id) || [id, id])[1];
      const draw = () => {
        const stageHTML = meDef && !sent
          ? mapPickHTML({ map: stage }, false, '守るあなたがステージを選ぶ') + (online ? '<button class="btn" id="bmStage">このステージで決定</button>' : '')
          : stage ? `<p>ステージ：<b>${mapName(stage)}</b>（${meDef ? 'あなた' : '相手'}が選んだ）</p>` : '<p>相手がステージを選んでいます…</p>';
        overlay(`${playerIsAttacker ? sealHTML('攻め', 'ATTACK', false, 'mid') : sealHTML('守り', 'DEFENSE', true, 'mid')}
        <div class="vs-line"><b class="bm-koma"${me.promoted ? ' style="color:var(--shu-0)"' : ''}>${mn}</b><span>あなた</span><em>VS</em><span>相手</span><b class="bm-koma"${foe.promoted && !hideFoe ? ' style="color:var(--shu-0)"' : ''}>${fn}</b></div>
        <p>${hideFoe ? (playerIsAttacker ? '勝てば相手の駒を取れる（何の駒かは、一騎打ちで姿を見るまで分からない）' : '守り切れば攻めてきた駒を取れる（何の駒かは、一騎打ちで姿を見るまで分からない）') : playerIsAttacker ? `勝てば相手の「${fn}」を${foe.cracked ? '割れる（ひび入りなので消える）' : '取れる'}` : `守り切れば攻めてきた「${fn}」を${foe.cracked ? '割れる（ひび入りなので消える）' : '取れる'}`}。負けるとあなたの「${mn}」は${me.cracked ? 'ひび入りなので割れて消える' : '取られる'}</p>
        ${stageHTML}
        ${online ? '' : '<button class="btn" id="bmFight">一騎打ち開始</button>'}${keysHTML()}`, true);
        if (!online) $('bmFight').onclick = e => { e.stopPropagation(); gs.boardMap = stage; startMatch(); };
        if (meDef && !sent) bindMapPick((k, v) => { if (k === 'map') { stage = gs.boardMap = v; draw(); } });
        if (online && meDef && !sent) $('bmStage').onclick = e => { e.stopPropagation(); sent = true; gs.boardMap = stage; Net.send({ t: 'bstage', v: stage }); draw(); ready(); };
      };
      // 友達と対戦：ステージが決まって、おたがいこの画面に来たら、少し待って一緒に始める
      const ready = () => { meWait = true; Net.send({ t: 'bwait' }); tryFight(); };
      draw();
      if (online && !meDef) waitNet('bstage').then(v => { if (battleDone !== done) return; stage = gs.boardMap = v; draw(); ready(); });
    });
  }
  // 一騎打ちの結果（win: プレイヤーの勝ち true / 負け false）
  function battleResult(win) {
    const ctx = gs.matchCtx;
    const attackerWon = win === null ? false : (win === true) === ctx.playerIsAttacker;
    const playerWon = win === null ? !ctx.playerIsAttacker : win;
    if (!online && win !== null) recordBattle(ctx.myType, ctx.foeType, ctx.playerIsAttacker, playerWon);
    if (playerWon) questEvent('capture', 1, online);   // 攻めて勝っても守り切っても、相手の駒が1つ盤から消える
    $('hud').style.display = 'none';
    overlay(`${ctx.playerIsAttacker ? (attackerWon ? sealHTML('取った', 'CAPTURE') : sealHTML('取られた', 'CAPTURED'))
      : (attackerWon ? sealHTML('取られた', 'CAPTURED') : sealHTML('守った', 'DEFENDED'))}
      <p>${ctx.playerIsAttacker ? (attackerWon ? '駒を取った！' : '取り返された…') : (attackerWon ? '駒を取られた…' : '守り切った！')}</p>
      <button class="btn" id="bmBack">盤面へ戻る</button>`, true);
    $('bmBack').onclick = e => {
      e.stopPropagation();
      gs.matchCtx = null; gs.boardMap = null;
      hideOverlay(); gs.state = 'board'; showUI(true);
      const r = battleDone; battleDone = null; r(attackerWon);
      setTimeout(pump, 0);
    };
  }

  async function doMove(m, owner) {
    const g = gen;
    busy = true;
    let winner = null, why = '';
    if (m.kind === 'drop') {
      const boom = m.type === 'P' && nifu(board, owner, m.tx);
      hands[owner].splice(hands[owner].indexOf(m.type), 1);
      board[m.ty][m.tx] = { type: m.type, owner, cracked: true };   // 相手から取った駒：ひび入り。次に負けたら消える
      SFX.play('place');
      if (boom) {
        // 二歩：その筋の自分の駒がすべて爆発四散
        refresh(m); await sleep(500);
        if (g !== gen) return;
        const lost = [];
        for (let y = 0; y < 9; y++) {
          const p = board[y][m.tx];
          if (p && p.owner === owner) { lost.push([p, y]); board[y][m.tx] = null; if (p.type === 'K') { winner = 1 - owner; why = owner === 0 ? '二歩で王まで爆発四散…' : '相手が二歩で玉ごと爆発四散！'; } }
        }
        blowUp(lost, m.tx);
        setMsg(`二歩！ ${owner === 0 ? 'あなた' : '相手'}の筋の駒が爆発四散（${lost.length}枚）`);
        m = Object.assign({}, m, { lost: true });
        refresh(); await sleep(1300);
        if (g !== gen) return;
      }
    } else {
      const p = board[m.fy][m.fx], t = board[m.ty][m.tx];
      if (t) {
        // 挑んだ瞬間から決着まで、1マスに両方の駒を並べて見せる
        contest = { fx: m.fx, fy: m.fy, tx: m.tx, ty: m.ty, att: p };
        refresh(); SFX.play('place');
        const attackerWon = await battle(p, t, owner === 0);
        contest = null;
        // 取った駒は持ち駒になる。ただし、ひび入りの駒（前に取られてきた駒）は割れて消える
        if (attackerWon) {
          if (!t.cracked) hands[owner].push(t.type);
          board[m.ty][m.tx] = p; board[m.fy][m.fx] = null;
          if (t.type === 'K') winner = owner;
        } else {
          if (!p.cracked) hands[1 - owner].push(p.type);
          board[m.fy][m.fx] = null;
          if (p.type === 'K') winner = 1 - owner;
          m = Object.assign({}, m, { lost: true });
        }
      } else {
        board[m.ty][m.tx] = p; board[m.fy][m.fx] = null;
        m = Object.assign({}, m, { quiet: true });   // 置いた音は、成るかを決めてから
      }
    }
    // 成り：敵陣に入る・敵陣から出る・敵陣の中で動いたとき（行き所がなければ必ず成る。CPUはいつも成る）
    const moved = m.kind === 'move' && !m.lost && winner === null ? board[m.ty][m.tx] : null;
    let justPromoted = false;
    if (moved && canPromote(moved) && (inZone(owner, m.fy) || inZone(owner, m.ty))) {
      const forced = deadEnd(moved.type, owner, m.ty);
      moved.promoted = justPromoted = forced || (owner === 1 ? (online ? await waitNet('bp') : true) : await askPromote(moved));
      if (online && owner === 0 && !forced) Net.send({ t: 'bp', v: moved.promoted });
    }
    if (g !== gen) return;
    if (m.quiet) SFX.play('place');   // 置いた音（成るかを決めたあと）
    if (justPromoted && !(blind && owner === 1)) SFX.play('promo');   // ブラインドでは相手が成ったことも知らせない
    lastMove = m.lost ? null : m; preview = null;
    refresh(m.lost ? null : m);
    if (winner !== null) { gameOver(winner, why); return; }
    turn = 1 - owner;
    save();
    busy = false;
    nextTurn();
  }
  function nextTurn() {
    if (!online) { if (turn === 1) aiTurn(); else turnMsg(); return; }
    if (turn === 1) { setMsg(`${gs.foeName || '相手'} の番…`); pump(); } else turnMsg();
  }
  async function aiTurn() {
    if (over) return;
    const g = gen;
    busy = true;
    setMsg('相手の番…');
    await sleep(700);
    if (g !== gen) return;
    await sleep(30);   // 考える前に「相手の番…」を画面に出す
    if (g !== gen) return;
    const m = blind ? blindMove() : chooseMove(board, hands);
    if (!m) { gameOver(0, '相手が指せる手がなくなった'); return; }
    preview = m; paint();
    if (m.kind === 'move' && board[m.ty][m.tx]) {
      setMsg(`相手の${blind ? '駒' : `「${label(board[m.fy][m.fx])}」`}が、あなたの「${label(board[m.ty][m.tx])}」を取りに来た！`);
      await sleep(1400);
    } else await sleep(350);
    if (g !== gen) return;
    await doMove(m, 1);
  }
  // ブラインド将棋の CPU：あなたの駒が何かは知らない（盤の上のあなたの駒を、全部「歩」だと思って考える）。
  //   選んだ手は本当の盤で指せるか確かめ、だめなら（打ち歩詰めなど）ふつうに考え直す
  function blindMove() {
    const masked = board.map(row => row.map(p => (p && p.owner === 0 ? { ...p, type: 'P', promoted: false } : p)));
    const m = chooseMove(masked, hands);
    const same = x => x.kind === m.kind && x.tx === m.tx && x.ty === m.ty && (x.kind === 'drop' ? x.type === m.type : x.fx === m.fx && x.fy === m.fy);
    return m && allMoves(board, hands, 1, true).some(same) ? m : chooseMove(board, hands);
  }
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  // ---------- 友達と対戦：届いたもの ----------
  const flip = m => (m.kind === 'drop' ? { kind: 'drop', type: m.type, tx: 8 - m.tx, ty: 8 - m.ty } : { kind: 'move', fx: 8 - m.fx, fy: 8 - m.fy, tx: 8 - m.tx, ty: 8 - m.ty });
  let inbox = [], waiters = [], meWait = false, foeWait = false;
  // 種類 t のものが届くまで待つ（先に届いていればすぐ）
  function waitNet(t) {
    const i = inbox.findIndex(x => x.t === t);
    if (i >= 0) return Promise.resolve(inbox.splice(i, 1)[0].v);
    return new Promise(r => waiters.push({ t, r }));
  }
  // 相手の手：自分の番の途中（一騎打ちの結果画面など）なら、盤に戻るまで取っておく
  function pump() {
    if (!online || over || busy || turn !== 1 || gs.state !== 'board') return;
    const i = inbox.findIndex(x => x.t === 'bm');
    if (i < 0) return;
    const m = inbox.splice(i, 1)[0].m;
    if (m.kind === 'move' && board[m.ty][m.tx]) setMsg(`相手の${blind ? '駒' : `「${label(board[m.fy][m.fx])}」`}が、あなたの「${label(board[m.ty][m.tx])}」を取りに来た！`);
    doMove(m, 1);
  }
  function tryFight() {
    if (!meWait || !foeWait) return;
    meWait = foeWait = false;
    const g = gen;
    setTimeout(() => { if (g === gen && battleDone) startMatch(); }, 2200);
  }
  function onNet(m) {
    if (!online) return;
    if (m.t === 'bwait') { foeWait = true; tryFight(); return; }
    if (m.t === 'bresign') { if (!over) { gen++; gameOver(0, '相手が投了しました'); } return; }
    const w = waiters.findIndex(x => x.t === m.t);
    if (w >= 0) { waiters.splice(w, 1)[0].r(m.v); return; }
    inbox.push(m);
    pump();
  }
  function askPromote(p) {
    return new Promise(res => {
      overlay(`<div class="res" style="font-size:46px">成りますか？</div>
        <div class="vs-line"><b class="bm-koma">${label(p)}</b><em>→</em><b class="bm-koma" style="color:var(--shu-0)">${PRO[p.type]}</b></div>
        <p>${p.type === 'K' ? '帝になると、盤の上の動きは王のままで、一騎打ちでは武器・スキル・性能が変わります' : '成ると盤の上の動きが変わり、一騎打ちでは武器・スキル・性能が変わります'}</p>
        <div style="display:flex;gap:14px;justify-content:center"><button class="btn" id="bmPro">成る</button><button class="btn ghost" id="bmNoPro">成らない</button></div>`, true);
      $('bmPro').onclick = e => { e.stopPropagation(); hideOverlay(); res(true); };
      $('bmNoPro').onclick = e => { e.stopPropagation(); hideOverlay(); res(false); };
    });
  }

  // winner: 0 あなた / 1 相手 / -1 引き分け。why: 決着の理由（なければ玉を取った）
  function gameOver(winner, why = '') {
    over = true; busy = true;
    questEvent('shogi', 1, online);
    if (winner === 0) questEvent('shogiWin', 1, online);
    if (blind) { setup = false; refresh(); why = (why || (winner === 0 ? '相手の玉を討ち取った！' : 'あなたの王が討たれた…')) + '（相手の駒を表に返しました）'; }
    clearSave();
    if (winner >= 0) SFX.play(winner === 0 ? 'win' : 'lose');
    setMsg('');
    overlay(`${winner === 0 ? sealHTML('勝ち', 'VICTORY') : winner === 1 ? sealHTML('負け', 'DEFEAT') : sealHTML('引き分け', 'DRAW', true)}
      <p>${why || (winner === 0 ? '相手の玉を討ち取った！' : 'あなたの王が討たれた…')}</p>
      <div class="menu"><button class="btn ghost" id="bmTitle">タイトルへ</button><button class="btn white" id="bmAgain">もう一局</button></div>`, true);
    $('bmAgain').onclick = e => { e.stopPropagation(); if (online) { close(); showLobby(); } else start(); };
    $('bmTitle').onclick = e => { e.stopPropagation(); if (online) { close(); leave(); } else exit(); };
    if (online) $('bmAgain').textContent = 'もう一局（部屋に戻る）';
  }

  // ---------- UI ----------
  const ui = document.createElement('div');
  ui.id = 'bmUI';
  ui.innerHTML = `<button class="small bm-quit" id="bmQuit">タイトルへ</button><div id="bmMsg" class="shadow"></div>
    <div class="bm-panel bm-e"><h4>相手の持ち駒</h4><div id="bmHandE"></div></div>
    <div class="bm-panel bm-p"><h4>あなたの持ち駒（クリックで打つ）</h4><div id="bmHandP"></div></div>
    <div class="bm-btns"><button class="small" id="bmResign">投了</button></div>
    <div class="bm-setup" id="bmSetup"><button class="small" id="bmSetupReset">元の並びに戻す</button><button class="btn" id="bmSetupDone">並べ終わった</button></div>
    <div class="bm-help">駒をクリック → 光ったマスへ。赤いマスは相手の駒：一騎打ちで勝てば取れる、負けると取られる。取った駒を打つとひび入りになり、次に負けると割れて消える</div>`;
  document.body.appendChild(ui);
  function showUI(v) { ui.style.display = v ? 'block' : 'none'; }
  $('bmSetupDone').onclick = e => { e.stopPropagation(); if (setup) finishSetup(); };
  $('bmSetupReset').onclick = e => {
    e.stopPropagation();
    if (!setup || setupDone) return;
    const b0 = initialBoard(); for (let y = 6; y < 9; y++) board[y] = b0[y];
    setupSel = null; refresh();
  };
  // はい／いいえを、ゲームの画面の中で聞く（ブラウザの確認の窓は使わない）
  function askYesNo(q: string, yes: string, no: string, note = '') {
    return new Promise<boolean>(res => {
      overlay(`<div class="res" style="font-size:40px">${q}</div>${note ? `<p>${note}</p>` : ''}
        <div style="display:flex;gap:14px;justify-content:center"><button class="btn ghost" id="bmNo">${no}</button><button class="btn" id="bmYes">${yes}</button></div>`, true);
      $('bmYes').onclick = e => { e.stopPropagation(); hideOverlay(); res(true); };
      $('bmNo').onclick = e => { e.stopPropagation(); hideOverlay(); res(false); };
    });
  }
  $('bmResign').onclick = async e => {
    e.stopPropagation();
    if (over || !(await askYesNo('投了しますか？', '投了する', '続ける')) || over) return;
    gen++; if (online) Net.send({ t: 'bresign' }); gameOver(1, '投了');
  };
  $('bmQuit').onclick = e => { e.stopPropagation(); quit(); };
  // 対局の途中でタイトルへ（相手の番・一騎打ちの前後でも）
  async function quit() {
    if (!over && !(await askYesNo('対局をやめますか？', 'タイトルへ戻る', '続ける', online ? '友達との部屋からも抜けます' : '途中の対局は保存されているので、あとで続きから遊べます'))) return;
    battleDone = null; hideOverlay();
    if (online) { close(); leave(); } else exit();
  }
  // 盤を片付ける（タイトルやロビーに移る前）
  function close() { gs.matchCtx = null; gs.boardMap = null; over = true; gen++; battleDone = null; online = false; inbox = []; waiters = []; showUI(false); }
  // 友達と対戦を始める（部屋を作った側が先手）
  function startOnline(host, blindMode = false) {
    start(false, true, blindMode);
    hostSide = host;
    if (blindMode) { turn = -1; refresh(); setupMsg(); return; }   // 並べ終わるまで、どちらの番でもない
    turn = host ? 0 : 1;
    refresh(); nextTurn();
  }

  // タイトルから：途中の対局があれば「続きから／最初から」を選ぶ
  function open() {
    const has = !!loadSave();
    overlay(`<div class="screen"><h2 class="h">将棋モード</h2>${has ? '<p>前回の対局の途中があります</p>' : ''}
      <div class="menu">${has ? '<button class="btn" id="bmCont">続きから</button>' : ''}<button class="btn${has ? ' sub' : ''}" id="bmNew">${has ? '最初から' : 'ふつうの将棋'}</button><button class="btn sub" id="bmBlind">ブラインド将棋</button></div>
      <p class="note" style="max-width:560px">ブラインド将棋：始める前に、自分の3段の中で駒を並べ替えられる。CPU の駒は字の無い駒に見える（CPU もあなたの駒が何かは知らない）。あなたが先手。途中保存はしない</p>
      <div class="menu"><button class="btn ghost" id="bmBackT">戻る</button></div></div>`, true);
    if (has) $('bmCont').onclick = e => { e.stopPropagation(); start(true); };
    $('bmNew').onclick = e => { e.stopPropagation(); clearSave(); start(); };
    $('bmBlind').onclick = e => { e.stopPropagation(); start(false, false, true); };
    $('bmBackT').onclick = e => { e.stopPropagation(); showTitle(); };
  }
  function start(resume = false, net = false, blindMode = false) {
    SFX.init();
    gen++;
    online = net; inbox = []; waiters = []; meWait = foeWait = false;
    blind = blindMode; setup = blind; setupSel = null; setupDone = false;
    initBoard();
    const d = resume && loadSave();
    if (d) { board = d.board; hands = d.hands; turn = d.turn; lastMove = d.lastMove; }
    else save();
    gs.matchCtx = null; anim = null;
    gs.state = 'board';
    hideOverlay(); $('hud').style.display = 'none';
    showUI(true);
    refresh();
    if (setup) setupMsg(); else nextTurn();
  }
  function exit() {
    gs.matchCtx = null; gs.boardMap = null; over = true; gen++;
    showUI(false);
    resetMatch(); showTitle();
  }
  // 将棋モードの一騎打ちを途中でやめたとき
  function abort() { gs.matchCtx = null; battleDone = null; showUI(false); over = true; gen++; }

  let t = 0;
  function update(rdt) {
    t += rdt;
    updateDebris(rdt);
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
    start, open, exit, abort, close, startOnline, onNet, get online() { return online; }, get blind() { return blind; }, update, battleResult, scene: bScene, cam: bCam,
    // 確認用：盤面を直接いじって表示を更新する（開発中のテストに使う）
    debug: { get board() { return board; }, get hands() { return hands; }, refresh: () => refresh(), drops: (o, t) => dropSquares(board, o, t, hands), inCheck: o => inCheck(board, o) },
  };
})();
