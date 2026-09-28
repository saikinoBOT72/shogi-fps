// 経路探索：地面を 1m のマス目にして、段差（階段でつながった所だけ）を考えながら A* で道を探す
import { GROUND, H, V3 } from './core';
import { colTop, colliders, onMapChange } from './world';

export const Nav = (() => {
  const N = 2 * H, off = H, R = 0.5, STEP = 0.45;   // STEP: 歩いて上り下りできる段差
  const hgt = new Float32Array(N * N), block = new Uint8Array(N * N);
  // 床として使うのは地面から立っている面だけ（屋根や吊り橋のような宙に浮いた床は、下の地面を隠さないように外す）
  // マスの高さ（盤・段・階段の上面）と、通れないマス。マップを切り替えたら作り直す
  function build() {
  const walkC = colliders.filter(c => c.walk && c.kind !== 'cyl' && c.min.y <= GROUND + 0.05), solidC = colliders.filter(c => !c.walk);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = i - off + 0.5, z = j - off + 0.5;
    let h = GROUND;
    for (const c of walkC) if (x >= c.min.x && x <= c.max.x && z >= c.min.z && z <= c.max.z) h = Math.max(h, colTop(c, x, z));
    hgt[j * N + i] = h;
    let b = Math.abs(x) > H - 1 || Math.abs(z) > H - 1;
    if (!b) for (const c of solidC) {
      const top = c.kind === 'cyl' ? c.y1 : c.max.y, bottom = c.kind === 'cyl' ? c.y0 : c.min.y;
      if (top <= h + 0.4 || bottom >= h + 1.8) continue;
      const hit = c.kind === 'cyl' ? Math.hypot(x - c.x, z - c.z) < c.r + R : x > c.min.x - R && x < c.max.x + R && z > c.min.z - R && z < c.max.z + R;
      if (hit) { b = true; break; }
    }
    block[j * N + i] = b ? 1 : 0;
  }
  }
  build();
  onMapChange.push(build);
  const idx = (x, z) => { const i = Math.floor(x + off), j = Math.floor(z + off); return i < 0 || j < 0 || i >= N || j >= N ? -1 : j * N + i; };
  const center = k => new V3((k % N) - off + 0.5, hgt[k], Math.floor(k / N) - off + 0.5);

  // 通れるマスが見つからないとき、近くの通れるマス（高さが近いものを優先）
  function nearestOpen(k, y) {
    if (k < 0) return -1;
    if (!block[k] && Math.abs(hgt[k] - y) < 1) return k;
    const ci = k % N, cj = Math.floor(k / N);
    let best = -1, bs = Infinity;
    for (let r = 1; r <= 5; r++) {
      for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const i = ci + di, j = cj + dj;
        if (i < 0 || j < 0 || i >= N || j >= N) continue;
        const kk = j * N + i;
        if (block[kk]) continue;
        const s = r + Math.abs(hgt[kk] - y) * 3;
        if (s < bs) { bs = s; best = kk; }
      }
      if (best >= 0) return best;
    }
    return -1;
  }

  // A*（8方向。斜めは両隣が通れるときだけ）
  const gS = new Float32Array(N * N), came = new Int32Array(N * N), closed = new Uint8Array(N * N);
  // 経路探索は1回に時間がかかることがあるので、少しずつ進められる形（ジェネレーター）にする。500 マスごとに一休み
  function* search(from, to) {
    const s = nearestOpen(idx(from.x, from.z), from.y), g = nearestOpen(idx(to.x, to.z), to.y);
    if (s < 0 || g < 0) return null;
    gS.fill(Infinity); came.fill(-1); closed.fill(0);
    const gi = g % N, gj = Math.floor(g / N);
    const hEst = k => { const dx = Math.abs(k % N - gi), dz = Math.abs(Math.floor(k / N) - gj); return Math.max(dx, dz) + 0.414 * Math.min(dx, dz); };
    // 二分ヒープ
    const heap = [];
    const push = (f, k) => { heap.push([f, k]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } }
      return top;
    };
    // 見積もりを少し強めにして（1.6 倍）探す範囲を絞る：ほぼ最短のまま何倍も速い
    gS[s] = 0; push(hEst(s) * 1.6, s);
    let iter = 0, best = s, bestH = hEst(s);
    while (heap.length && iter++ < 9000) {
      const [, k] = pop();
      if (closed[k]) continue;
      if (k === g) break;
      const hk = hEst(k); if (hk < bestH) { bestH = hk; best = k; }
      if (iter % 500 === 0) yield null;
      closed[k] = 1;
      const ci = k % N, cj = Math.floor(k / N);
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const i = ci + di, j = cj + dj;
        if (i < 0 || j < 0 || i >= N || j >= N) continue;
        const nk = j * N + i;
        if (block[nk] || closed[nk] || Math.abs(hgt[nk] - hgt[k]) > STEP) continue;
        if (di && dj && (block[cj * N + i] || block[j * N + ci])) continue;
        const ng = gS[k] + (di && dj ? 1.414 : 1);
        if (ng < gS[nk]) { gS[nk] = ng; came[nk] = k; push(ng + hEst(nk) * 1.6, nk); }
      }
    }
    // 行き先に届かなければ、一番近づける所までの道を返す
    const end = came[g] >= 0 || g === s ? g : best;
    if (end === s) return null;
    const path = [];
    for (let k = end; k !== s && k >= 0; k = came[k]) path.push(center(k));
    return path.reverse();
  }
  // すぐに全部探す
  function find(from, to) { const it = search(from, to); let r = it.next(); while (!r.done) r = it.next(); return r.value; }
  // 少しずつ探す：毎フレーム next() を呼び、done になったら value が道
  const plan = (from, to) => search(from.clone(), to.clone());
  return { find, plan, heightAt: (x, z) => { const k = idx(x, z); return k < 0 ? GROUND : hgt[k]; } };
})();
