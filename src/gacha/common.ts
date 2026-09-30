// ガチャの画面（gacha.ts）と 3D の演出（gacha/scene.ts）で使う共通のもの
import { P } from '../palette';
import { DESIGNS } from '../guns/skins';
import { Owned } from '../loadout';

export const RAR_COL = { N: P.shiro[2], R: P.ao[2], SR: P.fuji[2], LR: P.kin[2] };
export const RAR_CH = { N: '歩', R: '銀', SR: '金', LR: '王' };   // 裏返ると出てくる駒の字
export const RANK = { N: 0, R: 1, SR: 2, LR: 3 };
export const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');
export const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const rarOf = (it: Owned) => DESIGNS[it.base].rarity;
export const wait = (s: number) => new Promise<void>(r => setTimeout(r, s * 1000));
export const rand = (a: number, b: number) => a + Math.random() * (b - a);

// 流れの状態：いまの画面・引いた回の番号（画面を離れたり、スキップしたら古い流れを止める）・クリックで次へ
export const flow = { phase: 'top' as 'top' | 'drop' | 'reveal' | 'result', runId: 0, advance: null as (() => void) | null };
