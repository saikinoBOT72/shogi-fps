// 経路探索：地面を 1m のマス目にして、段差（階段でつながった所だけ）を考えながら A* で道を探す
// 2階建てのマップ（MAPS[id].nav.layered）は、1つのマスに床を最大3枚（1階・2階・梁など）持たせて、階をまたいで道を探す
import { GROUND, H, V3 } from './core';
import { MAPS, colTop, colliders, mapId, onMapChange } from './world';

export const Nav = (() => {
  const N = 2 * H, NN = N * N, off = H, L = 3;
  let R = 0.5, STEP = 0.45, RAMP_STEP = 0.45, layered = false;
  // 屋内マップ用：当たり判定を 4m 四方の区画に分けたもの（マスどうしの間に薄い壁が無いかも、これで調べる）
  const BS = 4, BN = Math.ceil(N / BS); let buckets = null;
  const bucketAt = (x, z) => buckets[Math.min(BN - 1, Math.max(0, Math.floor((z + off) / BS))) * BN + Math.min(BN - 1, Math.max(0, Math.floor((x + off) / BS)))];
  // マスの真ん中どうしを結ぶ線の途中（間の点）に壁があるか。体の細いマップでは、薄い壁がマスとマスの間に収まって見落とされるので
  const midBlocked = (x, z, h) => bucketAt(x, z).some(c => !c.walk && !c.noNav && solidHit(c, x, z, h, 0.15));   // R：体の太さ（壁からこれだけ離れたマスを通る）、STEP：歩いて上り下りできる段差
  const hgt = new Float32Array(NN * L), block = new Uint8Array(NN * L), cnt = new Uint8Array(NN), rampAx = new Uint8Array(NN * L);   // rampAx：坂の上の床（1：x 向き、2：z 向き）
  // 床として使うのは地面から立っている面だけ（屋根や吊り橋のような宙に浮いた床は、下の地面を隠さないように外す）
  // マスの高さ（盤・段・階段の上面）と、通れないマス。マップを切り替えたら作り直す
  const covers = (c, x, z) => c.kind === 'cyl' ? Math.hypot(x - c.x, z - c.z) < c.r : x >= c.min.x && x <= c.max.x && z >= c.min.z && z <= c.max.z;
  const solidHit = (c, x, z, h, rr = R) => {
    const top = c.kind === 'cyl' ? c.y1 : c.max.y, bottom = c.kind === 'cyl' ? c.y0 : c.min.y;
    if (top <= h + 0.4 || bottom >= h + 1.8) return false;
    if (c.kind === 'pyr' && c.holes.some(o => x > o.x0 && x < o.x1 && z > o.z0 && z < o.z1)) return false;   // ピラミッドの通路・部屋
    return c.kind === 'cyl' ? Math.hypot(x - c.x, z - c.z) < c.r + rr : x > c.min.x - rr && x < c.max.x + rr && z > c.min.z - rr && z < c.max.z + rr;
  };
  function build() {
    const opt = MAPS[mapId]?.nav;
    R = opt?.r ?? 0.5; STEP = opt?.step ?? 0.45; RAMP_STEP = opt?.rampStep ?? STEP;
    hgt.fill(GROUND); block.fill(1); cnt.fill(0); rampAx.fill(0); layered = false;
    const solidC = colliders.filter(c => !c.walk && !c.noNav);   // noNav：回転扉など、CPU が通り抜けてよい物
    if (!opt?.layered) {
      // nav の付いた床（砂漠の神殿の回廊の天井など）は宙に浮いていても床として使う（下の通路は CPU は通らない）
      const walkC = colliders.filter(c => c.walk && c.kind !== 'cyl' && (c.min.y <= GROUND + 0.05 || c.nav));
      for (let k = 0; k < NN; k++) {
        const x = k % N - off + 0.5, z = Math.floor(k / N) - off + 0.5;
        let h = GROUND;
        for (const c of walkC) if (covers(c, x, z)) h = Math.max(h, colTop(c, x, z));
        hgt[k] = h; cnt[k] = 1;
        block[k] = Math.abs(x) > H - 1 || Math.abs(z) > H - 1 || solidC.some(c => solidHit(c, x, z, h)) ? 1 : 0;
      }
      return;
    }
    // 何枚も床があるマップ：そのマスに立てる高さ（上に頭がつかえる物が無い床）を、低い方から最大 L 枚
    layered = true;
    // 当たり判定を 4m 四方の区画に分けておき、マスごとに近くの物だけ調べる（屋内マップは数が多いので）
    buckets = [...Array(BN * BN)].map(() => []);
    for (const c of colliders) {
      const x0 = (c.kind === 'cyl' ? c.x - c.r : c.min.x) - R - 1, x1 = (c.kind === 'cyl' ? c.x + c.r : c.max.x) + R + 1;
      const z0 = (c.kind === 'cyl' ? c.z - c.r : c.min.z) - R - 1, z1 = (c.kind === 'cyl' ? c.z + c.r : c.max.z) + R + 1;
      for (let bj = Math.max(0, Math.floor((z0 + off) / BS)); bj <= Math.min(BN - 1, Math.floor((z1 + off) / BS)); bj++)
        for (let bi = Math.max(0, Math.floor((x0 + off) / BS)); bi <= Math.min(BN - 1, Math.floor((x1 + off) / BS)); bi++) buckets[bj * BN + bi].push(c);
    }
    for (let k = 0; k < NN; k++) {
      const x = k % N - off + 0.5, z = Math.floor(k / N) - off + 0.5;
      if (Math.abs(x) > H - 1 || Math.abs(z) > H - 1) continue;
      const near = buckets[Math.floor((Math.floor(k / N)) / BS) * BN + Math.floor((k % N) / BS)];
      const here = near.filter(c => !c.noNav && covers(c, x, z));
      const cand = [[GROUND, 0]];
      for (const c of here) if (c.walk && c.kind !== 'cyl') cand.push([colTop(c, x, z), c.kind === 'ramp' ? (c.axis === 'x' ? 1 : 2) : 0]);
      cand.sort((a, b) => a[0] - b[0]);
      let n = 0, last = -Infinity;
      for (const [h, ax] of cand) {
        // ほぼ同じ高さの床が重なっていたら、上の面を使う（地面の上の薄い床・床の上の鳴る床など）
        if (n > 0 && h - last < 0.3) { const kk = (n - 1) * NN + k; hgt[kk] = h; if (ax) rampAx[kk] = ax; block[kk] = near.some(c => !c.walk && !c.noNav && solidHit(c, x, z, h)) ? 1 : 0; last = h; continue; }
        if (n >= L) continue;
        // 体の入る所がふさがっている（床の箱の中・壁の中・すぐ上に天井）なら、立てない
        if (here.some(c => { const top = c.kind === 'cyl' ? c.y1 : colTop(c, x, z), bottom = c.kind === 'cyl' ? c.y0 : c.thick ? top - c.thick : c.min.y; return top > h + 0.4 && bottom < h + 1.6; })) continue;
        const kk = n * NN + k;
        hgt[kk] = h; rampAx[kk] = ax; block[kk] = near.some(c => !c.walk && !c.noNav && solidHit(c, x, z, h)) ? 1 : 0;
        n++; last = h;
      }
      cnt[k] = n;
    }
  }
  build();
  onMapChange.push(build);
  const cellAt = (x, z) => { const i = Math.floor(x + off), j = Math.floor(z + off); return i < 0 || j < 0 || i >= N || j >= N ? -1 : j * N + i; };
  const center = k => { const c = k % NN; return new V3((c % N) - off + 0.5, hgt[k], Math.floor(c / N) - off + 0.5); };
  // そのマスで、高さ h から歩いて行ける床（無ければ -1）
  //   急な階段（坂）は、坂の向きに沿って進むときだけ大きな段差（RAMP_STEP）を許す（横から坂に飛び乗る道を作らない）
  //   ax：進む向き（1：x だけ、2：z だけ、0：斜め）、from：今いる床
  const layerNear = (c, h, ax = 0, from = -1) => { for (let l = 0; l < cnt[c]; l++) { const k = l * NN + c, dh = Math.abs(hgt[k] - h); if (!block[k] && (dh <= STEP || (ax && dh <= RAMP_STEP && (rampAx[k] === ax || (from >= 0 && rampAx[from] === ax))))) return k; } return -1; };

  // 通れるマスが見つからないとき、近くの通れるマス（高さが近いものを優先）
  function nearestOpen(c, y) {
    if (c < 0) return -1;
    const ci = c % N, cj = Math.floor(c / N);
    let best = -1, bs = Infinity;
    for (let r = 0; r <= 5; r++) {
      for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const i = ci + di, j = cj + dj;
        if (i < 0 || j < 0 || i >= N || j >= N) continue;
        const cc = j * N + i;
        for (let l = 0; l < cnt[cc]; l++) {
          const kk = l * NN + cc;
          if (block[kk]) continue;
          if (r === 0) { if (Math.abs(hgt[kk] - y) < 1) return kk; continue; }   // 真下のマスは高さが近いときだけ
          const s = r + Math.abs(hgt[kk] - y) * 3;
          if (s < bs) { bs = s; best = kk; }
        }
      }
      if (best >= 0) return best;
    }
    return best;
  }

  // A*（8方向。斜めは両隣が通れるときだけ）
  const gS = new Float32Array(NN * L), came = new Int32Array(NN * L), closed = new Uint8Array(NN * L);
  // 経路探索は1回に時間がかかることがあるので、少しずつ進められる形（ジェネレーター）にする。500 マスごとに一休み
  function* search(from, to) {
    const s = nearestOpen(cellAt(from.x, from.z), from.y), g = nearestOpen(cellAt(to.x, to.z), to.y);
    if (s < 0 || g < 0) return null;
    gS.fill(Infinity); came.fill(-1); closed.fill(0);
    const gc = g % NN, gi = gc % N, gj = Math.floor(gc / N), gh = hgt[g];
    // 見積もり：横の距離（階が違えば、高さの差も少し足す）
    const hEst = k => { const c = k % NN, dx = Math.abs(c % N - gi), dz = Math.abs(Math.floor(c / N) - gj); return Math.max(dx, dz) + 0.414 * Math.min(dx, dz) + Math.abs(hgt[k] - gh) * 0.5; };
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
      const c = k % NN, ci = c % N, cj = Math.floor(c / N), h = hgt[k], cx = ci - off + 0.5, cz = cj - off + 0.5;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const i = ci + di, j = cj + dj;
        if (i < 0 || j < 0 || i >= N || j >= N) continue;
        const nk = layerNear(j * N + i, h, dj === 0 ? 1 : di === 0 ? 2 : 0, k);
        if (nk < 0 || closed[nk]) continue;
        if (layered && midBlocked(cx + di * 0.5, cz + dj * 0.5, Math.min(h, hgt[nk]))) continue;
        if (di && dj && (layered ? layerNear(cj * N + i, h) < 0 || layerNear(j * N + ci, h) < 0 : block[cj * N + i] || block[j * N + ci])) continue;
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
  return { find, plan, heightAt: (x, z) => { const c = cellAt(x, z); return c < 0 ? GROUND : hgt[c]; } };
})();
