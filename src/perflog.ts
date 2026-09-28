// 重さログ：1コマが 20ms を超えた（FPS が 50 を下回った）瞬間に、何に時間がかかったか・何が起きていたかを記録する
// 試合のあとに文字でコピーして送れる（結果画面・一時停止の「重さログ」）
import { gs } from './state';

const SLOW = 20;   // これより長いコマを「重い」として記録（ms）
const KEEP = 40;   // 重かった順に残す数

export const PerfLog = (() => {
  let info = '', last = 0, frameT = 0, sec: Record<string, number> = {}, total: Record<string, number> = {};
  let frames = 0, sumMs = 0, worst = 0, slowN = 0, list = [], events: string[] = [], lastProg = -1, lastHeap = 0;
  let minuteBuckets: number[] = [];
  const now = () => performance.now();
  return {
    // 対局の始め
    reset(text: string) {
      info = text; sec = {}; total = {}; frames = 0; sumMs = 0; worst = 0; slowN = 0; list = []; events = []; lastProg = -1; minuteBuckets = [];
    },
    // 起きたこと（効果音の名前など）をこのコマに記録
    event(name: string) { if (gs.state === 'fight' && events.length < 12) events.push(name); },
    // コマの始め
    start() { frameT = last = now(); sec = {}; },
    // 前の mark からここまでの時間を name に数える
    mark(name: string) { const t = now(); sec[name] = (sec[name] || 0) + t - last; last = t; },
    // コマの終わり：interval は前のコマからの時間（ms）、ctx はそのときの様子
    end(interval: number, ctx: () => Record<string, any>, renderer) {
      const work = now() - frameT;
      const ev = events; events = [];
      if (gs.state !== 'fight' || gs.paused) return;
      frames++; sumMs += interval; worst = Math.max(worst, interval);
      for (const [k, v] of Object.entries(sec)) total[k] = (total[k] || 0) + v;
      const progs = renderer.info.programs ? renderer.info.programs.length : 0;
      if (lastProg >= 0 && progs > lastProg) ev.push(`シェーダー作成+${progs - lastProg}`);
      lastProg = progs;
      const mem = (performance as any).memory;
      const heap = mem ? mem.usedJSHeapSize / 1048576 : 0;
      if (mem && lastHeap - heap > 3) ev.push(`メモリ掃除(GC)-${(lastHeap - heap).toFixed(0)}MB`);
      lastHeap = heap;
      if (interval <= SLOW) return;
      slowN++;
      const c = ctx();
      const row = { interval, work, sec: { ...sec }, calls: renderer.info.render.calls, tris: renderer.info.render.triangles, heap, ev, ...c };
      list.push(row); list.sort((a, b) => b.interval - a.interval); if (list.length > KEEP) list.length = KEEP;
    },
    // コピー用の文字
    text() {
      const f = (n: number, d = 1) => (n ?? 0).toFixed(d);
      const avg = frames ? sumMs / frames : 0;
      const lines = [
        '[将棋FPS 重さログ]',
        info,
        `コマ数 ${frames} / 平均 ${f(avg)}ms（約${frames ? Math.round(1000 / avg) : 0}FPS） / 一番重い ${f(worst)}ms / ${SLOW}ms超え ${slowN}回`,
        '1コマあたりの平均(ms)：' + Object.entries(total).map(([k, v]) => `${k} ${f(v / Math.max(1, frames), 2)}`).join('  '),
        `--- 重かったコマ（重い順、最大${KEEP}件） ---`,
        '時刻s | 間隔ms 処理ms | 内訳ms | 描画calls 三角形 | メモリMB | 物理(起) 相手距離 相手の様子 | 出来事',
      ];
      for (const r of list) {
        const parts = Object.entries(r.sec).filter(([, v]) => (v as number) >= 0.3).sort((a, b) => (b[1] as number) - (a[1] as number)).map(([k, v]) => `${k}${f(v as number)}`).join(' ');
        lines.push(`${f(r.t)} | ${f(r.interval)} ${f(r.work)} | ${parts || '-'} | ${r.calls} ${Math.round(r.tris / 1000)}k | ${f(r.heap, 0)} | ${r.awake} ${f(r.dist)}m ${r.bot} | ${r.ev.join(' ') || '-'}`);
      }
      lines.push('（間隔が長いのに処理が短いコマは、ゲームの外＝描画の待ち・ブラウザ・メモリ掃除が原因）');
      return lines.join('\n');
    },
  };
})();
