// キーボード・マウス・フルスクリーン
import { gs } from './state';
import { settings } from './core';
import { cam, renderer } from './render';
import { vmCam } from './effects';
import { isPlaying, player, switchWeapon } from './game';
import { onLocked, pause } from './screens';

// ================= 入力 =================
export const keys: any = {};
// 割り当てたキーが押されているか（action は core.ts の KEY_ACTIONS）
export const down = (action: string) => !!keys[(settings as any).keys[action]];
gs.mouseDown = false;
gs.rightDown = false;
gs.triggerUsed = false;
gs.jumpPressed = 0;
export let lockGrace = 0, lockFailed = false;
gs.mdx = 0;
gs.mdy = 0;
// キー・マウスのボタンを押したとき（押した瞬間だけの操作もここで）。マウスのボタンは 'Mouse1'（ホイール）'Mouse3'/'Mouse4'（横）
function press(code: string) {
  if (gs.rebinding) return;   // キー設定の入力待ち
  const K = (settings as any).keys, first = !keys[code];
  if (code === K.jump && first) gs.jumpPressed = 0.15;
  if (code === K.fullscreen && first) toggleFullscreen();
  if (first && isPlaying() && gs.state === 'fight') {
    if (code === K.weapon1) switchWeapon(player, 'knife');
    if (code === K.weapon2) switchWeapon(player, 'main');
  }
  keys[code] = true;
}
addEventListener('keydown', e => {
  if (gs.rebinding || (e.target as HTMLElement).tagName === 'INPUT') return;   // 文字の入力中（部屋のコードなど）
  const K = (settings as any).keys;
  if (e.code === K.jump || e.code === 'Space' || e.code === 'Tab') e.preventDefault();
  press(e.code);
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('mousedown', e => {
  if (e.button !== 0 && e.button !== 2) { if (e.button >= 3) e.preventDefault(); press('Mouse' + e.button); return; }
  if (!isPlaying()) return;
  if (e.button === 0) { gs.mouseDown = true; gs.triggerUsed = false; }
  if (e.button === 2) gs.rightDown = true;
});
addEventListener('mouseup', e => {
  if (e.button >= 3) e.preventDefault();   // 横のボタンでブラウザが「戻る」をしないように
  if (e.button !== 0 && e.button !== 2) { keys['Mouse' + e.button] = false; return; }
  if (e.button === 0) gs.mouseDown = false; if (e.button === 2) gs.rightDown = false;
});
addEventListener('auxclick', e => e.preventDefault());
// ホイールで武器を切り替える
let wheelT = 0;
addEventListener('wheel', e => {
  if (!isPlaying() || gs.state !== 'fight' || performance.now() < wheelT) return;
  wheelT = performance.now() + 180;
  switchWeapon(player, 'toggle');
}, { passive: true });
addEventListener('contextmenu', e => e.preventDefault());
addEventListener('mousemove', e => {
  const locked = document.pointerLockElement === renderer.domElement;
  if (!locked && !lockFailed) return;
  // 視点が飛ぶ対策：固定直後の数イベントと、明らかに異常な移動量は捨てる
  if (lockGrace > 0) { lockGrace--; return; }
  if (Math.abs(e.movementX) > 350 || Math.abs(e.movementY) > 350) return;
  gs.mdx += e.movementX; gs.mdy += e.movementY;
});
export function requestLock() {
  const el = renderer.domElement;
  lockGrace = 2;
  const fallback = () => { lockFailed = true; onLocked(); };
  try {
    const p = el.requestPointerLock({ unadjustedMovement: true });
    if (p && p.catch) p.catch(() => {
      try {
        const p2 = el.requestPointerLock();
        if (p2 && p2.catch) p2.catch(fallback);
      } catch (e) { fallback(); }
    });
  } catch (e) { fallback(); }
}
document.addEventListener('pointerlockerror', () => { lockFailed = true; onLocked(); });
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === renderer.domElement) onLocked();
  else if (isPlaying()) pause();
});
export function toggleFullscreen() {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
  else document.exitFullscreen();
}
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  cam.aspect = vmCam.aspect = innerWidth / innerHeight;
  cam.updateProjectionMatrix(); vmCam.updateProjectionMatrix();
});
