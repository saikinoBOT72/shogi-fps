// 雪の温泉街の天気と地面：しんしんと降る雪、露天風呂と足湯の湯けむり、雪に残る足跡（10秒で消える）
// 砂に埋もれた神殿：ときどき来る砂嵐（霧が濃い砂色になり、砂が横に流れる。CPU も近くしか見えない）と、砂に残る足跡
import * as THREE from 'three';
import { P, rgba } from './palette';
import { C, GROUND, Q, V3, clamp, lerp, rand } from './core';
import { cam, canvasTex, hemi, scene, sky, sun } from './render';
import { currentAtmos, mapId } from './world';
import { bot, player, stats } from './game';
import { gs } from './state';
import { SFX } from './audio';

const softTex = (a0: number) => canvasTex(64, 64, (g, w) => {
  const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
  r.addColorStop(0, rgba(P.shiro[2], a0)); r.addColorStop(1, rgba(P.shiro[2], 0));
  g.fillStyle = r; g.fillRect(0, 0, w, w);
});

// ----- 降る雪（カメラの周りの箱の中だけに降らせ、はみ出したら反対側へ回す） -----
const SX = 50, SY = 26, N = Q.shadow ? (Q.aa ? 2200 : 1400) : 700;
const snowPos = new Float32Array(N * 3), drift = new Float32Array(N);
for (let i = 0; i < N; i++) { snowPos[i * 3] = rand(-SX / 2, SX / 2); snowPos[i * 3 + 1] = rand(-SY / 2, SY / 2); snowPos[i * 3 + 2] = rand(-SX / 2, SX / 2); drift[i] = rand(0, 6.3); }
const snowGeo = new THREE.BufferGeometry();
snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
const snow = new THREE.Points(snowGeo, new THREE.PointsMaterial({ size: 0.13, map: softTex(1), transparent: true, depthWrite: false, color: 0xffffff }));
snow.frustumCulled = false; snow.visible = false; scene.add(snow);

// ----- 湯けむり（ゆっくり昇って消える白いもや） -----
const steamTex = softTex(0.55);
const steams = [];
const addSteam = (cx, cz, r, n, y0, size) => {
  for (let i = 0; i < n; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: steamTex, transparent: true, depthWrite: false, opacity: 0 }));
    sp.visible = false; scene.add(sp);
    steams.push({ sp, cx, cz, r, y0, size, t: rand(0, 1), life: rand(5, 8), x: 0, z: 0 });
  }
};
const G0 = GROUND;
addSteam(0, 0, 13, 26, G0 + 0.7, 7);
for (const s of [1, -1]) addSteam(-3 * s, -25 * s, 3, 4, G0 + 1.4, 2.5);   // 足湯
const resetSteam = st => { const a = rand(0, 6.3), d = Math.sqrt(Math.random()) * st.r; st.x = st.cx + Math.cos(a) * d; st.z = st.cz + Math.sin(a) * d; st.t = 0; };
steams.forEach(st => { resetSteam(st); st.t = rand(0, 1); });

// ----- 足跡（雪の上だけ。左右交互に置き、10秒で消える） -----
const FP = 260, LIFE = 10;
const fpMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.13, 0.3).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: P.ai[0], transparent: true, opacity: 0.35, depthWrite: false }), FP);
const fps = [...Array(FP)].map(() => ({ t: LIFE, x: 0, y: 0, z: 0, ry: 0 }));
let fpI = 0;
const HIDE = new THREE.Matrix4().makeScale(0, 0, 0), M = new THREE.Matrix4(), QT = new THREE.Quaternion(), SC = new V3(), UP = new V3(0, 1, 0), POS = new V3();
for (let i = 0; i < FP; i++) fpMesh.setMatrixAt(i, HIDE);
fpMesh.frustumCulled = false; fpMesh.visible = false; scene.add(fpMesh);
const walkers = new Map();   // 体ごとに、最後に足跡を置いた所と左右
function track(e) {
  if (!e || e.dead || !e.onGround || (e.surf !== 'gravel' && e.surf !== 'sand')) return;
  let w = walkers.get(e);
  if (!w) { w = { x: e.pos.x, z: e.pos.z, side: 1 }; walkers.set(e, w); }
  const dx = e.pos.x - w.x, dz = e.pos.z - w.z, d = Math.hypot(dx, dz);
  if (d > 3) { w.x = e.pos.x; w.z = e.pos.z; return; }   // 飛んだ・生き返った
  if (d < 0.75) return;
  const ry = Math.atan2(dx, dz); w.side = -w.side;
  const f = fps[fpI]; fpI = (fpI + 1) % FP;
  f.t = 0; f.ry = ry; f.y = e.pos.y + 0.03;
  f.x = e.pos.x + Math.cos(ry) * 0.14 * w.side; f.z = e.pos.z - Math.sin(ry) * 0.14 * w.side;
  w.x = e.pos.x; w.z = e.pos.z;
}

// ----- 砂嵐：戦いが始まって 30 秒後から 75 秒ごとに、4 秒で強まり 20 秒続いて 4 秒で弱まる（両方の画面で同じ時刻に来る） -----
const STORM = { first: 30, every: 75, up: 4, hold: 20, down: 4 };
const stormK = (t: number) => {
  if (t < STORM.first) return 0;
  const u = (t - STORM.first) % STORM.every;
  if (u < STORM.up) return u / STORM.up;
  if (u < STORM.up + STORM.hold) return 1;
  if (u < STORM.up + STORM.hold + STORM.down) return 1 - (u - STORM.up - STORM.hold) / STORM.down;
  return 0;
};
// 流れる砂（細かい粒）と、砂けむり（大きなもや）。カメラのまわりの箱の中で風下へ流し、はみ出したら風上へ戻す
const SN = Q.shadow ? 1600 : 800, DN = 60;
const sandPos = new Float32Array(SN * 3);
for (let i = 0; i < SN; i++) { sandPos[i * 3] = rand(-SX / 2, SX / 2); sandPos[i * 3 + 1] = rand(-SY / 2, SY / 2); sandPos[i * 3 + 2] = rand(-SX / 2, SX / 2); }
const sandGeo = new THREE.BufferGeometry(); sandGeo.setAttribute('position', new THREE.BufferAttribute(sandPos, 3));
const sandMat = new THREE.PointsMaterial({ size: 0.07, map: softTex(1), transparent: true, depthWrite: false, color: P.kiji[2], opacity: 0 });
const sand = new THREE.Points(sandGeo, sandMat); sand.frustumCulled = false; sand.visible = false; scene.add(sand);
const puffs = [...Array(DN)].map(() => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex(0.6), color: P.kiji[2], transparent: true, depthWrite: false, opacity: 0 })); sp.visible = false; scene.add(sp); return { sp, x: rand(-SX / 2, SX / 2), y: rand(-3, 8), z: rand(-SX / 2, SX / 2), s: rand(4, 9) }; });
const WIND = new V3(1, 0, 0.35).normalize();
const stormCol = C(P.kiji[1]).lerp(C(P.daidai[2]), 0.5);
let storm = 0;
function updateStorm(rdt: number, on: boolean) {
  const want = on && gs.state === 'fight' ? stormK(stats.time) : 0;
  storm += clamp(want - storm, -rdt / 1.5, rdt / 1.5);   // 急に切り替わらないように
  const k = storm, vis = on && k > 0.01;
  sand.visible = vis; puffs.forEach(p => p.sp.visible = vis);
  gs.stormVis = k > 0.05 ? lerp(160, 22, k) : Infinity;   // CPU が見える距離
  SFX.setStorm(on ? k : 0);
  if (!on) return;
  // 霧・空・光を砂色へ
  const a = currentAtmos(); if (!a) return;
  const f = scene.fog as THREE.Fog;
  f.near = lerp(a.near, 2, k); f.far = lerp(a.far, 30, k); f.color.copy(a.fog).lerp(stormCol, k);
  const u = (sky.material as any).uniforms;
  u.top.value.copy(a.top).lerp(stormCol, k * 0.9); u.hor.value.copy(a.hor).lerp(stormCol, k); u.bot.value.copy(a.bot).lerp(stormCol, k);
  sun.intensity = a.sunI * lerp(1, 0.45, k) * Math.PI; hemi.intensity = a.hemiI * lerp(1, 1.3, k) * Math.PI;
  if (!vis) return;
  sandMat.opacity = 0.85 * k;
  const cx = cam.position.x, cy = cam.position.y, cz = cam.position.z, tt = performance.now() / 1000;
  const wrap = (v, c, n) => ((v - c + n / 2) % n + n) % n - n / 2 + c;
  for (let i = 0; i < SN; i++) {
    const j = i * 3, gust = 16 + Math.sin(tt * 3 + i) * 5;
    sandPos[j] = wrap(sandPos[j] + WIND.x * gust * rdt, cx, SX); sandPos[j + 1] = wrap(sandPos[j + 1] + Math.sin(tt * 5 + i * 1.7) * 0.8 * rdt, cy, SY); sandPos[j + 2] = wrap(sandPos[j + 2] + WIND.z * gust * rdt, cz, SX);
  }
  sandGeo.attributes.position.needsUpdate = true;
  for (const p of puffs) {
    p.x = wrap(p.x + WIND.x * 9 * rdt, cx, SX); p.z = wrap(p.z + WIND.z * 9 * rdt, cz, SX);
    p.sp.position.set(p.x, cy + p.y - 2, p.z); p.sp.scale.setScalar(p.s);
    (p.sp.material as THREE.SpriteMaterial).opacity = 0.28 * k;
  }
}

export const Weather = {
  update(rdt: number, dt: number, show: boolean) {
    updateStorm(rdt, show && mapId === 'desert');
    const on = show && mapId === 'onsen';
    snow.visible = on;
    fpMesh.visible = on || (show && mapId === 'desert');   // 足跡は雪と砂の上
    steams.forEach(st => st.sp.visible = on);
    if (!on) { if (fpMesh.visible) updateFootprints(dt); return; }
    // 雪：ゆっくり落ち、少し横に揺れる
    const cx = cam.position.x, cy = cam.position.y, cz = cam.position.z, tt = performance.now() / 1000;
    for (let i = 0; i < N; i++) {
      const k = i * 3;
      let x = snowPos[k] + Math.sin(tt * 0.7 + drift[i]) * 0.3 * rdt, y = snowPos[k + 1] - 1.1 * rdt, z = snowPos[k + 2] + Math.cos(tt * 0.5 + drift[i]) * 0.25 * rdt;
      // カメラからの相対位置で箱の中に回す
      const rx = ((x - cx + SX / 2) % SX + SX) % SX - SX / 2, ry = ((y - cy + SY / 2) % SY + SY) % SY - SY / 2, rz = ((z - cz + SX / 2) % SX + SX) % SX - SX / 2;
      snowPos[k] = cx + rx; snowPos[k + 1] = cy + ry; snowPos[k + 2] = cz + rz;
    }
    snowGeo.attributes.position.needsUpdate = true;
    // 湯けむり：昇りながら広がり、最初と最後はうすく
    for (const st of steams) {
      st.t += rdt / st.life;
      if (st.t >= 1) resetSteam(st);
      const a = Math.sin(Math.PI * st.t);
      st.sp.position.set(st.x + Math.sin(st.t * 3) * 0.4, st.y0 + st.t * 4, st.z);
      st.sp.scale.setScalar(st.size * (0.6 + st.t * 0.8));
      (st.sp.material as THREE.SpriteMaterial).opacity = a * 0.5;
    }
    updateFootprints(dt);
  },
};
// 足跡（雪と砂の上）
function updateFootprints(dt: number) {
  track(player); track(bot);
  for (let i = 0; i < FP; i++) {
    const f = fps[i];
    if (f.t >= LIFE) continue;
    f.t += dt;
    if (f.t >= LIFE) { fpMesh.setMatrixAt(i, HIDE); continue; }
    const s = f.t > LIFE - 2 ? (LIFE - f.t) / 2 : 1;   // 最後の2秒で小さくなって消える
    fpMesh.setMatrixAt(i, M.compose(POS.set(f.x, f.y, f.z), QT.setFromAxisAngle(UP, f.ry), SC.set(s, 1, s)));
  }
  fpMesh.instanceMatrix.needsUpdate = true;
}
