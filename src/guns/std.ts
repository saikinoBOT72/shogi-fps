// 銃の動きの決まった形（どの銃でも同じ「眺める」「構え始めの傾き」「リロードの持ち上げ」）
//   銃ごとに違う部品の動き（スライド・ボルト・弾倉・左手）は、それぞれの銃のファイルに書く
import { Clip, Track } from './anim';

// 眺める：右へ回して横を見て、左へ回して反対側と上を見る。long：長い銃ほど外へずらす量を大きく
export function inspectClip(long = 0): Clip {
  const px = -0.05 - long * 0.04, ry = 0.8 - long * 0.15;
  return {
    dur: 2.6,
    tracks: [
      ['root', 'ry', [[0, 0], [0.4, ry], [1.2, ry], [1.6, -ry * 0.7], [2.2, -ry * 0.7], [2.6, 0]]],
      ['root', 'rz', [[0, 0], [0.4, -0.25], [1.2, -0.1], [1.6, 0.35], [2.2, 0.35], [2.6, 0]]],
      ['root', 'px', [[0, 0], [0.4, px], [2.2, px * 0.8], [2.6, 0]]],
      ['root', 'py', [[0, 0], [0.4, 0.04], [2.2, 0.04], [2.6, 0]]],
    ],
  };
}
// リロードの間、銃を少し傾けて持ち上げる（t0〜t1 の間）
export function reloadTilt(t0 = 0.1, t1 = 0.85, rz = 0.32, rx = 0.1, py = 0.035): Track[] {
  return [
    ['root', 'rz', [[0, 0], [t0, rz], [t1, rz], [1, 0]]],
    ['root', 'rx', [[0, 0], [t0, rx], [t1, rx], [1, 0]]],
    ['root', 'py', [[0, 0], [t0, py], [t1, py], [1, 0]]],
  ];
}
// 構え始め：傾けたところから戻る
export const equipTilt = (dur = 0.6): Track => ['root', 'rz', [[0, 0.3], [dur * 0.5, 0.12], [dur, 0]]];
// 左手を「元の位置からのずれ」の点をたどって動かす：keys = [[時刻, {x,y,z}], ...]
export function handPath(keys: [number, { x?: number; y?: number; z?: number }][], part = 'lhand'): Track[] {
  return (['x', 'y', 'z'] as const).map(a => [part, ('p' + a) as 'px', keys.map(([t, p]) => [t, p[a] || 0])] as Track);
}
// 箱形の弾倉を落として入れ替える（落ちる → 見えなくなる → 下から戻る）
export function magDrop(tOut: number, tIn: number, drop = 0.25, part = 'mag'): Track[] {
  return [
    [part, 'py', [[0, 0], [tOut - 0.06, 0], [tOut + 0.02, -drop], [tOut + 0.03, -drop], [tOut + 0.05, -drop * 0.8], [tIn, 0]]],
    [part, 'vis', [[0, 1], [tOut + 0.02, 1], [tOut + 0.021, 0], [tOut + 0.049, 0], [tOut + 0.05, 1]]],
  ];
}
