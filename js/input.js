// キーボード・マウス・フルスクリーン
'use strict';

// ================= 入力 =================
const keys = {};
let mouseDown = false, rightDown = false, triggerUsed = false, jumpPressed = 0;
let mdx = 0, mdy = 0, lockGrace = 0, lockFailed = false;
addEventListener('keydown', e => {
  if (e.code === 'Space') { e.preventDefault(); if (!keys.Space) jumpPressed = 0.15; }
  if (e.code === 'KeyF' && !e.repeat) toggleFullscreen();
  keys[e.code] = true;
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('mousedown', e => {
  if (!isPlaying()) return;
  if (e.button === 0) { mouseDown = true; triggerUsed = false; }
  if (e.button === 2) rightDown = true;
});
addEventListener('mouseup', e => { if (e.button === 0) mouseDown = false; if (e.button === 2) rightDown = false; });
addEventListener('contextmenu', e => e.preventDefault());
addEventListener('mousemove', e => {
  const locked = document.pointerLockElement === renderer.domElement;
  if (!locked && !lockFailed) return;
  // 視点が飛ぶ対策：固定直後の数イベントと、明らかに異常な移動量は捨てる
  if (lockGrace > 0) { lockGrace--; return; }
  if (Math.abs(e.movementX) > 350 || Math.abs(e.movementY) > 350) return;
  mdx += e.movementX; mdy += e.movementY;
});
function requestLock() {
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
function toggleFullscreen() {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
  else document.exitFullscreen();
}
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  cam.aspect = vmCam.aspect = innerWidth / innerHeight;
  cam.updateProjectionMatrix(); vmCam.updateProjectionMatrix();
});
