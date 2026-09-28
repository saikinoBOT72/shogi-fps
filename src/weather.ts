// 雪の温泉街の天気と地面：しんしんと降る雪、露天風呂と足湯の湯けむり、雪に残る足跡（10秒で消える）
import * as THREE from 'three';
import { P, rgba } from './palette';
import { GROUND, Q, V3, rand } from './core';
import { cam, canvasTex, scene } from './render';
import { mapId } from './world';
import { bot, player } from './game';

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
  if (!e || e.dead || !e.onGround || e.surf !== 'gravel') return;
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

export const Weather = {
  update(rdt: number, dt: number, show: boolean) {
    const on = show && mapId === 'onsen';
    snow.visible = on; fpMesh.visible = on;
    steams.forEach(st => st.sp.visible = on);
    if (!on) return;
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
    // 足跡
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
  },
};
