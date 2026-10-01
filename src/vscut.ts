// 戦いの前の「○○ VS ○○」カット（スマブラ風の斜め分割）。約2秒、クリックで飛ばせる
import { gs } from './state';
import { Net } from './net';

export const VS_TIME = 2;
const FULL = { 歩: '歩兵', 香: '香車', 桂: '桂馬', 銀: '銀将', 金: '金将', 角: '角行', 飛: '飛車', 王: '王将', 玉: '玉将' };

let el: HTMLDivElement | null = null;

function side(cls: string, label: string, def, wName: string, nm: string) {
  return `<div class="vs-side ${cls}">
    <div class="vs-bar"><span class="vs-who">${label}</span><span class="vs-name">${FULL[def.name] || def.name}</span></div>
    <div class="koma vs-koma">${def.name}</div>
    <div class="vs-sub">${nm ? `<b>${nm}</b>　` : ''}<span>${wName}</span></div>
  </div>`;
}

export function showVsCut(me: { def; w; nm?: string }, foe: { def; w; nm?: string }) {
  hideVsCut();
  el = document.createElement('div');
  el.id = 'vscut';
  el.innerHTML = side('l', 'あなた', me.def, me.w.name, me.nm || '') + side('r', '相手', foe.def, foe.w.name, foe.nm || '') + '<div class="vs-mark-big">VS</div>';
  document.body.appendChild(el);
}
export function hideVsCut() { if (el) { el.remove(); el = null; } }

// 毎フレーム：カウントダウンに入ったら（または試合を抜けたら）消す
export function updateVsCut() {
  if (el && (gs.state !== 'countdown' || gs.stateT >= 0)) hideVsCut();
}

// クリックで飛ばす（オンラインは相手と揃えるため、絵だけ消してカウントは待つ）
addEventListener('mousedown', () => {
  if (!el || gs.state !== 'countdown' || gs.stateT >= 0) return;
  hideVsCut();
  if (!Net.on) gs.stateT = 0;
}, true);
