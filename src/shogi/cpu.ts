// 将棋モードの CPU（奥 = owner 1）：先を読んで指す
//   1手目はすべての手を浅く調べ、良さそうな手だけ「あなたの一番いい返し」まで読む（2手読み）
//   駒を取る手は撃ち合いで決まるので、勝った場合と負けた場合を、勝ちやすさで重みをつけて足す（期待値）
//   盤の評価：駒の値打ち（ひび入りは割り引く）・持ち駒・次に取れそうな駒・玉のまわりの守りと攻め・駒の動ける広さ
//   王手放置ありなので、玉が狙われていても「撃ち合いで取られる見込み」として点数に入る
// 撃ち合いの勝ちやすさは駒の強さから見積もり、あなたの実際の勝ち負けを覚えて少しずつ合わせる（skill）
import { PIECES, settings } from '../core';
import { Board, Hands, Move, Piece, allMoves, canPromote, inZone, rawMoves } from './rules';

// ---------- 撃ち合いの勝ちやすさ ----------
const SKILL_KEY = 'shogiFps.skill';
let skill = (() => { try { const v = +localStorage.getItem(SKILL_KEY); return v > 0 ? v : 1; } catch (e) { return 1; } })();   // あなたの撃ち合いの強さ（1 = 駒の強さどおり）
const DIFF_K = { easy: 1.4, normal: 1, hard: 0.75 };   // 撃ち合いの CPU の強さ（かんたんほど、あなたが勝ちやすい）
const fpsVal = (t: string) => Math.pow(t === 'K' ? 12 : PIECES[t].value, 0.6);
const youK = () => skill * (DIFF_K[settings.diff] || 1);
// attOwner の駒 att が def に挑んだとき、挑んだ側が勝つ見込み
export function pWin(att: string, def: string, attOwner: number) {
  const a = fpsVal(att) * (attOwner === 0 ? youK() : 1), d = fpsVal(def) * (attOwner === 0 ? 1 : youK());
  return a / (a + d);
}
// 撃ち合いの結果を覚える（一人のときだけ）：思ったより勝てていれば、あなたを強く見積もる
export function recordBattle(yourType: string, cpuType: string, youAttacked: boolean, youWon: boolean) {
  const expect = youAttacked ? pWin(yourType, cpuType, 0) : 1 - pWin(cpuType, yourType, 1);
  skill = Math.min(3, Math.max(0.35, skill * Math.exp(0.35 * ((youWon ? 1 : 0) - expect))));
  try { localStorage.setItem(SKILL_KEY, skill.toFixed(3)); } catch (e) {}
}

// ---------- 駒の値打ち ----------
const BASE = { P: 1, L: 3, N: 3.5, S: 5, G: 5.5, B: 8, R: 10, K: 0 };
const PROM = { P: 5.5, L: 5.5, N: 5.5, S: 5.5, B: 11, R: 13 };
const KING = 150;  // 玉を取られる＝負け（読みの先で本当に取る形と、評価の「取られそう」とで同じ重さにする）
const WIN = KING;
const worth = (p: Piece) => (p.type === 'K' ? KING : (p.promoted ? PROM[p.type] : BASE[p.type]) * (p.cracked ? 0.8 : 1));
const handWorth = (t: string) => BASE[t] * 0.92;   // 打つとひび入りになるが、どこにでも打てる

// ---------- 手を指したあとの形（撃ち合いは勝ち・負けの2通り） ----------
type Outcome = { b: Board; h: Hands; p: number; win?: number };
const copyH = (h: Hands): Hands => [h[0].slice(), h[1].slice()];
function outcomes(b: Board, h: Hands, m: Move, o: number): Outcome[] {
  if (m.kind === 'drop') {
    const nb = b.map(r => r.slice()), nh = copyH(h);
    nh[o].splice(nh[o].indexOf(m.type), 1);
    nb[m.ty][m.tx] = { type: m.type, owner: o, cracked: true };
    return [{ b: nb, h: nh, p: 1 }];
  }
  const a = b[m.fy][m.fx], t = b[m.ty][m.tx];
  // 進んだ駒：成れるなら成る（CPU はいつも成る。あなたも成るとみなす）
  const moved = (): Piece => (canPromote(a) && (inZone(o, m.fy) || inZone(o, m.ty)) ? { ...a, promoted: true } : a);
  if (!t) {
    const nb = b.map(r => r.slice());
    nb[m.ty][m.tx] = moved(); nb[m.fy][m.fx] = null;
    return [{ b: nb, h, p: 1 }];
  }
  const pw = pWin(a.type, t.type, o);
  const wb = b.map(r => r.slice()), wh = copyH(h);
  wb[m.ty][m.tx] = moved(); wb[m.fy][m.fx] = null;
  if (!t.cracked) wh[o].push(t.type);
  const lb = b.map(r => r.slice()), lh = copyH(h);
  lb[m.fy][m.fx] = null;
  if (!a.cracked) lh[1 - o].push(a.type);
  return [
    { b: wb, h: wh, p: pw, win: t.type === 'K' ? o : undefined },
    { b: lb, h: lh, p: 1 - pw, win: a.type === 'K' ? 1 - o : undefined },
  ];
}

// ---------- 盤の評価（CPU = owner 1 から見た点数。stm：次に指す側） ----------
const sgn = (o: number) => (o === 1 ? 1 : -1);
export function evaluate(b: Board, h: Hands, stm: number) {
  let s = 0;
  const kings: number[][] = [null, null];
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) { const p = b[y][x]; if (p && p.type === 'K') kings[p.owner] = [x, y]; }
  if (!kings[0]) return WIN; if (!kings[1]) return -WIN;
  // 次に取れそうな駒（その側のいちばん得な挑み方）、守られている駒
  const best = [0, 0];
  const guarded = new Set<number>();
  const threats: [Piece, Piece, number][] = [];
  const near = (k: number[], x: number, y: number, r: number) => Math.max(Math.abs(k[0] - x), Math.abs(k[1] - y)) <= r;
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
    const p = b[y][x];
    if (!p) continue;
    const o = p.owner, g = sgn(o);
    s += g * worth(p) * (p.type === 'K' ? 0 : 1);
    if (p.type === 'P' && !p.promoted) s += g * 0.06 * (o === 1 ? y - 2 : 6 - y);   // 歩を進める
    const ok = kings[o], ek = kings[1 - o];
    if (p.type !== 'K') {
      if ((p.type === 'G' || p.type === 'S' || p.promoted) && near(ok, x, y, 1)) s += g * 0.45;   // 玉のそばの金銀
      if (near(ek, x, y, 2)) s += g * 0.3;                                                        // 相手の玉に迫る
    }
    for (const [tx, ty] of rawMoves(b, x, y, true)) {
      const q = b[ty][tx];
      guarded.add(o * 81 + ty * 9 + tx);                     // このマスに利いている（自分の駒なら守っている）
      if (q && q.owner === o) continue;
      s += g * 0.035;                                        // 動ける広さ
      if (q) threats.push([p, q, ty * 9 + tx]);
      if (near(ek, tx, ty, 1)) s += g * 0.12;                // 相手の玉のまわりのマスに利いている
    }
  }
  for (const [a, t, at] of threats) {
    const pw = pWin(a.type, t.type, a.owner);
    let gain = pw * worth(t) - (1 - pw) * worth(a);
    if (t.type !== 'K' && guarded.has(t.owner * 81 + at)) gain -= pw * 0.5 * worth(a);   // 取っても取り返されそう
    if (gain > best[a.owner]) best[a.owner] = gain;
  }
  s += sgn(stm) * best[stm] * 0.9 + sgn(1 - stm) * best[1 - stm] * 0.25;
  for (const o of [0, 1]) for (const t of h[o]) s += sgn(o) * handWorth(t);
  return s;
}

// ---------- 手を選ぶ（先読み） ----------
// 深さ depth まで読む。side：この局面で指す側。点数は CPU から見た値（CPU は大きく、あなたは小さくしようとする）
// 良さそうな手（浅い点数の上位 beam 個）だけを深く読み、残りは浅い点数のまま比べる
const expect = (os: Outcome[], f: (o: Outcome) => number) => os.reduce((acc, o) => acc + o.p * (o.win !== undefined ? (o.win === 1 ? WIN : -WIN) : f(o)), 0);
type Cand = { m: Move; os: Outcome[]; v: number };
function candidates(b: Board, h: Hands, side: number): Cand[] {
  return allMoves(b, h, side).map(m => { const os = outcomes(b, h, m, side); return { m, os, v: expect(os, o => evaluate(o.b, o.h, 1 - side)) }; })
    .sort((a, c) => (side === 1 ? c.v - a.v : a.v - c.v));
}
function search(b: Board, h: Hands, side: number, depth: number, beams: number[], until: number): number {
  const cs = candidates(b, h, side);
  if (!cs.length) return evaluate(b, h, side);
  if (depth > 1) for (const c of cs.slice(0, beams[depth - 1])) {
    if (performance.now() > until) break;
    c.v = expect(c.os, o => search(o.b, o.h, 1 - side, depth - 1, beams, until));
  }
  const pool = depth > 1 ? cs.slice(0, beams[depth - 1]) : cs;
  return side === 1 ? Math.max(...pool.map(c => c.v)) : Math.min(...pool.map(c => c.v));
}
// 強さ：かんたん = 1手だけ見る（ばらつき大）、ふつう = あなたの返しまで（2手）、むずかしい = さらにその次まで（3手）
//   beams[d]：残り d+1 手の所で深く読む手の数
const LEVEL = {
  easy: { depth: 1, beams: [0], noise: 1.6 },
  normal: { depth: 2, beams: [0, 24], noise: 0.25 },
  hard: { depth: 3, beams: [0, 10, 16], noise: 0.05 },
};
export function chooseMove(b: Board, h: Hands): Move | null {
  const lv = LEVEL[settings.diff] || LEVEL.normal;
  const until = performance.now() + 2500;   // 考えるのは長くても 2.5 秒ほど
  const cs = candidates(b, h, 1);
  if (!cs.length) return null;
  const top = lv.depth > 1 ? cs.slice(0, lv.beams[lv.depth - 1]) : cs;
  if (lv.depth > 1) for (const c of top) {
    if (performance.now() > until) break;
    c.v = expect(c.os, o => search(o.b, o.h, 0, lv.depth - 1, lv.beams, until));
  }
  let best = top[0], bv = -Infinity;
  for (const c of top) { const v = c.v + (Math.random() - 0.5) * lv.noise; if (v > bv) { bv = v; best = c; } }
  return best.m;
}
