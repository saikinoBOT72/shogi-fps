// 将棋モードのルール（盤の表示・一騎打ち・通信とは切り離した、中身だけ）
//   盤は board[y][x]。y = 0 が奥（相手の陣の一番奥）、y = 8 が手前。駒は { type, owner, promoted?, cracked? }
//   owner 0 = 手前（あなた）、1 = 奥（CPU・友達）。持ち駒は hands[owner] に駒の種類（'P' など）を並べる
// この将棋のルール：一騎打ちで逆転できるので、王手放置・千日手はあり。詰みでは終わらない（玉は一騎打ちで取る）
//   反則は「打ち歩詰め」だけ（歩を打って、相手が王手をかわす手が1つもない形にする）
//   二歩は打てるが、打つとその筋の自分の駒が（打った歩も王も）爆発四散して消える
//   駒を取るときは一騎打ち：勝てば相手の駒を取り（持ち駒になる）、負けると挑んだ駒を相手に取られる
//   取った駒を打つと「ひび入り」になり、次に一騎打ちで負けると割れて消える（相手の持ち駒にならない）
import { PIECES } from '../core';

export type Piece = { type: string; owner: number; promoted?: boolean; cracked?: boolean };
export type Board = (Piece | null)[][];
export type Hands = string[][];
export type Move = { kind: 'move' | 'drop'; fx?: number; fy?: number; tx: number; ty: number; type?: string; lost?: boolean; quiet?: boolean };

export const HAND_ORDER = ['R', 'B', 'G', 'S', 'N', 'L', 'P'];
// 成駒の字（赤）。成駒は盤上の動きが変わる（一騎打ちの性能は元の駒のまま）
export const PRO = { P: 'と', L: '杏', N: '圭', S: '全', R: '龍', B: '馬' };
export const label = (p: Piece) => (p.promoted ? PRO[p.type] : p.type === 'K' && p.owner === 1 ? '玉' : PIECES[p.type].name);
export const canPromote = (p: Piece) => !p.promoted && !!PRO[p.type];
export const inZone = (o: number, y: number) => (o === 0 ? y <= 2 : y >= 6);   // 敵陣（成れる所）
export const inB = (x: number, y: number) => x >= 0 && x < 9 && y >= 0 && y < 9;
const fwd = (o: number) => (o === 0 ? -1 : 1);
const fromEnd = (o: number, y: number) => (o === 0 ? y : 8 - y);   // 0 が相手陣の一番奥
const ORTH = [[1, 0], [-1, 0], [0, 1], [0, -1]], DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const GOLD = [[0, 1], [1, 1], [-1, 1], [1, 0], [-1, 0], [0, -1]];
const SILVER = [[0, 1], [1, 1], [-1, 1], [1, -1], [-1, -1]];

// 最初の並び
export function initialBoard(): Board {
  const board: Board = [...Array(9)].map(() => Array(9).fill(null));
  const back = 'LNSGKGSNL';
  for (let x = 0; x < 9; x++) {
    board[0][x] = { type: back[x], owner: 1 }; board[8][x] = { type: back[x], owner: 0 };
    board[2][x] = { type: 'P', owner: 1 }; board[6][x] = { type: 'P', owner: 0 };
  }
  board[7][7] = { type: 'R', owner: 0 }; board[7][1] = { type: 'B', owner: 0 };
  board[1][1] = { type: 'R', owner: 1 }; board[1][7] = { type: 'B', owner: 1 };
  return board;
}

// (x, y) の駒が動けるマス（自分の駒がいるマスは除く。相手の駒のマスは「挑む」マス）
// all：自分の駒がいるマスも入れる（その駒を守っているか、の判定用）
export function rawMoves(b: Board, x: number, y: number, all = false): number[][] {
  const p = b[y][x], f = fwd(p.owner), res = [];
  const step = (dx, dy) => { const nx = x + dx, ny = y + dy * f; if (inB(nx, ny) && (all || !b[ny][nx] || b[ny][nx].owner !== p.owner)) res.push([nx, ny]); };
  const slide = (dx, dy) => {
    let nx = x + dx, ny = y + dy * f;
    while (inB(nx, ny)) { const q = b[ny][nx]; if (q) { if (all || q.owner !== p.owner) res.push([nx, ny]); break; } res.push([nx, ny]); nx += dx; ny += dy * f; }
  };
  const t = p.type, pr = p.promoted;
  if (t === 'K') [...ORTH, ...DIAG].forEach(d => step(d[0], d[1]));
  else if (t === 'R') { ORTH.forEach(d => slide(d[0], d[1])); if (pr) DIAG.forEach(d => step(d[0], d[1])); }   // 龍
  else if (t === 'B') { DIAG.forEach(d => slide(d[0], d[1])); if (pr) ORTH.forEach(d => step(d[0], d[1])); }   // 馬
  else if (t === 'G' || pr) GOLD.forEach(d => step(d[0], d[1]));                                          // 金・と・杏・圭・全
  else if (t === 'S') SILVER.forEach(d => step(d[0], d[1]));
  else if (t === 'N') { step(1, 2); step(-1, 2); }
  else if (t === 'L') slide(0, 1);
  else if (t === 'P') step(0, 1);
  return res;
}
// 行き所のないマス（歩・香の最奥、桂の奥2段）：そこへ動くときは必ず成る。そこには打てない
export const deadEnd = (t: string, o: number, y: number) => ((t === 'P' || t === 'L') && fromEnd(o, y) === 0) || (t === 'N' && fromEnd(o, y) <= 1);
// 二歩になるか（その筋に自分の成っていない歩がある）
export const nifu = (b: Board, owner: number, x: number) => b.some(row => row[x] && row[x].type === 'P' && !row[x].promoted && row[x].owner === owner);

// 手を指したあとの盤（一騎打ちの結果は考えない：挑んだ駒がそのマスへ進んだ形）。元の盤は変えない
export function simulate(b: Board, m: Move, owner: number): Board {
  const nb = b.map(r => r.slice());
  if (m.kind === 'drop') nb[m.ty][m.tx] = { type: m.type, owner };
  else { nb[m.ty][m.tx] = nb[m.fy][m.fx]; nb[m.fy][m.fx] = null; }
  return nb;
}
export function findKing(b: Board, owner: number): number[] | null {
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) { const p = b[y][x]; if (p && p.type === 'K' && p.owner === owner) return [x, y]; }
  return null;
}
// owner の駒が (x, y) に挑めるか
export function attackedBy(b: Board, owner: number, x: number, y: number) {
  for (let yy = 0; yy < 9; yy++) for (let xx = 0; xx < 9; xx++) {
    const p = b[yy][xx];
    if (p && p.owner === owner && rawMoves(b, xx, yy).some(([a, c]) => a === x && c === y)) return true;
  }
  return false;
}
// その手のあと、自分の玉が狙われていないか
export const safe = (b: Board, owner: number, m: Move) => { const nb = simulate(b, m, owner), k = findKing(nb, owner); return !k || !attackedBy(nb, 1 - owner, k[0], k[1]); };
export const inCheck = (b: Board, owner: number) => { const k = findKing(b, owner); return !!k && attackedBy(b, 1 - owner, k[0], k[1]); };
// 王手をかわす手があるか（打ち歩詰めの判定用）
export function canEscape(b: Board, h: Hands, owner: number) {
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
    const p = b[y][x];
    if (p && p.owner === owner && rawMoves(b, x, y).some(([tx, ty]) => safe(b, owner, { kind: 'move', fx: x, fy: y, tx, ty }))) return true;
  }
  for (const type of new Set(h[owner])) for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++)
    if (!b[y][x] && !deadEnd(type, owner, y) && safe(b, owner, { kind: 'drop', type, tx: x, ty: y })) return true;
  return false;
}
// 持ち駒 type を打てるマス（打ち歩詰めになるマスは除く。二歩は打てる）
export function dropSquares(b: Board, owner: number, type: string, h: Hands): number[][] {
  const res = [];
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
    if (b[y][x] || deadEnd(type, owner, y)) continue;
    if (type === 'P') { const nb = simulate(b, { kind: 'drop', type, tx: x, ty: y }, owner); if (inCheck(nb, 1 - owner) && !canEscape(nb, h, 1 - owner)) continue; }
    res.push([x, y]);
  }
  return res;
}
// 指せる手をすべて。withNifu：二歩（自分の駒が爆発する手）も入れるか
export function allMoves(b: Board, h: Hands, owner: number, withNifu = false): Move[] {
  const res: Move[] = [];
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
    const p = b[y][x];
    if (p && p.owner === owner) for (const [tx, ty] of rawMoves(b, x, y)) res.push({ kind: 'move', fx: x, fy: y, tx, ty });
  }
  for (const type of new Set(h[owner])) for (const [tx, ty] of dropSquares(b, owner, type, h))
    if (withNifu || type !== 'P' || !nifu(b, owner, tx)) res.push({ kind: 'drop', type, tx, ty });
  return res;
}
