// 成駒のスキルの仕組み：毒（成桂）・地雷（馬）・ドーム（成銀）・フレア弾（龍）・空爆要請（帝）・竜巻（侍）・幽体離脱（成香）
// 出した物の形はリプレイ用に gadgets.ts の track に登録する（対局中は消さずに隠すだけ）
import * as THREE from 'three';
import { P } from './palette';
import { C, V3, clamp, rand } from './core';
import { SFX } from './audio';
import { cam, flatGeo, toon } from './render';
import { blockers } from './physics';
import { DmgNums, Particles } from './effects';
import { bot, eyeOf, facingOf, hasLOS, player, view } from './game';
import { collide } from './game/move';
import { gs } from './state';
import { track } from './gadgets';
import { explodeAt } from './grenades';
import { Net } from './net';
import { damagePlayer } from './ai';

const foeOf = e => (e === player ? bot : player);
// 動きをこの画面で決めている駒か（自分・オフラインの CPU。オンラインの相手の位置は相手の画面が決める）
const local = e => e === player || !Net.on;

// ---------- 毒（成桂の毒矢）：5秒じわじわ減り、足が遅くなる。毒では体力1までしか減らない ----------
//   ダメージは撃った側の画面が決める（オンラインでは 'hit' で届く。届いた側は鈍足と見た目だけ）
export function applyPoison(target, sk, by) {
  target.poisonT = sk.time; target.poisonSk = sk; target.poisonBy = by; target.poisonAcc = 0; target.poisonTick = 0;
  if (!target.isBot) SFX.play('skHoming');
}
function poisonTick(e, dt) {
  if (!(e.poisonT > 0) || e.dead) { e.poisonT = 0; return; }
  e.poisonT -= dt;
  if (Math.random() < dt * 14) Particles.glow(e.pos.clone().add(new V3(rand(-0.5, 0.5), rand(0.2, e.height), rand(-0.5, 0.5))), P.moegi[2]);
  // ダメージを決めるのは：自分が撃った毒で相手（bot）が苦しむとき、またはオフラインで CPU の毒を受けたとき
  const mine = (e === bot && e.poisonBy === player) || (!Net.on && e === player);
  if (!mine) return;
  e.poisonAcc += e.poisonSk.dot * dt; e.poisonTick += dt;
  if (e.poisonTick < 0.5 && e.poisonT > 0) return;
  e.poisonTick = 0;
  const dmg = Math.min(e.poisonAcc, Math.max(0, e.hp - 1)); e.poisonAcc = 0;
  if (dmg <= 0) return;
  const pt = eyeOf(e);
  if (e === bot) {
    if (Net.on) Net.send({ t: 'hit', dmg: Math.round(dmg * 100) / 100, head: 0, po: 0.6 });
    else { bot.hp -= dmg; bot.sinceHit = 0; }
    DmgNums.add(pt, dmg, false);
  } else damagePlayer(dmg, e.pos, true);
}

// ---------- 地雷（馬）：次の弾が着弾した所に残る。1秒で起動、相手が近づくとピッと鳴って 0.5 秒後に爆発 ----------
//   1人12個まで（古いものから消える）。試合中ずっと残る。相手からは 3m 以内でないと見えない
const mineGeo = flatGeo(new THREE.CylinderGeometry(0.22, 0.26, 0.09, 8));
const mineM = toon({ color: C(P.sumi[1]) }), mineLight = new THREE.MeshBasicMaterial({ color: P.shu[1] });
const mines: any[] = [];
function makeMine() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(mineGeo, mineM); body.castShadow = true;
  const light = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.06), mineLight); light.position.y = 0.06; light.name = 'light';
  g.add(body, light);
  return g;
}
export function placeMine(owner, pos, sk) {
  const own = mines.filter(m => m.owner === owner);
  if (own.length >= sk.max) { const o = own[0]; o.m.visible = false; mines.splice(mines.indexOf(o), 1); }
  const m = track(makeMine()); m.position.copy(pos);
  mines.push({ owner, sk, m, pos: pos.clone(), t: 0, fuse: -1 });
  SFX.play('skC4Stick', pos);
}
function updateMines(dt) {
  for (let i = mines.length - 1; i >= 0; i--) {
    const M = mines[i]; M.t += dt;
    const foe = foeOf(M.owner);
    // 見える：自分の地雷はいつも。相手の地雷は 3m 以内だけ
    M.m.visible = M.owner === player || player.pos.distanceTo(M.pos) < M.sk.see;
    const light = M.m.getObjectByName('light');
    if (light) light.visible = M.t > M.sk.arm && Math.sin(M.t * (M.fuse >= 0 ? 30 : 4)) > 0;
    if (M.fuse < 0) {
      if (M.t > M.sk.arm && foe && !foe.dead && new V3(foe.pos.x, foe.pos.y + 0.5, foe.pos.z).distanceTo(M.pos) < M.sk.trigger) {
        M.fuse = M.sk.delay; SFX.play('blinkTick', M.pos, 3);
      }
      continue;
    }
    M.fuse -= dt;
    if (M.fuse <= 0) {
      M.m.visible = false; mines.splice(i, 1);
      explodeAt(M.pos.clone().add(new V3(0, 0.3, 0)), M.owner, M.sk.dmg, M.sk.radius, { knock: 12, lift: 9, self: 0.4 });
    }
  }
}

// ---------- ドーム（成銀）：まわりに弾を通さないドーム（中から外へも撃てない）。歩いて出入りはできる ----------
const domeGeo = new THREE.IcosahedronGeometry(1, 3);
const domes: any[] = [];
export function spawnDome(e, sk) {
  const mat = new THREE.MeshBasicMaterial({ color: P.mizu[2], transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
  const shell = track(new THREE.Mesh(domeGeo, mat));
  const wire = track(new THREE.Mesh(domeGeo, new THREE.MeshBasicMaterial({ color: P.shiro[2], wireframe: true, transparent: true, opacity: 0.35, depthWrite: false })));
  const c = e.pos.clone();
  shell.position.copy(c); wire.position.copy(c); shell.scale.setScalar(0.01); wire.scale.setScalar(0.01);
  blockers.push(shell);
  domes.push({ shell, wire, t: 0, life: sk.duration, r: sk.radius });
  SFX.play('skEmp', e.isBot ? c : null);
}
function updateDomes(dt) {
  for (let i = domes.length - 1; i >= 0; i--) {
    const D = domes[i]; D.t += dt;
    const k = Math.min(1, D.t / 0.25), f = clamp((D.life - D.t) / 0.4, 0, 1);
    const r = Math.max(0.01, D.r * (1 - (1 - k) ** 3));
    D.shell.scale.setScalar(r); D.wire.scale.setScalar(r * 1.005);
    D.shell.material.opacity = 0.22 * f; D.wire.material.opacity = 0.35 * f; D.wire.rotation.y += dt * 0.6;
    if (D.t >= D.life) {
      D.shell.visible = D.wire.visible = false;
      const b = blockers.indexOf(D.shell); if (b >= 0) blockers.splice(b, 1);
      domes.splice(i, 1);
    }
  }
}

// ---------- フレア弾（龍）：閃光弾のように投げ、燃え出したら 6 秒光り続ける。見ている間は目がくらむ ----------
const flareGeo = flatGeo(new THREE.CylinderGeometry(0.05, 0.05, 0.2, 6)), flareM = toon({ color: C(P.shu[1]), emissive: C(P.daidai[2]), emissiveIntensity: 0.4 });
const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,240,200,0.8)'); r.addColorStop(1, 'rgba(255,200,120,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
const flares: any[] = [];
export function tossFlare(e, aim, sk) {
  const m = track(new THREE.Mesh(flareGeo, flareM));
  const glow = track(new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xfff0d0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false })));
  glow.visible = false;
  const pos = eyeOf(e).addScaledVector(aim, 0.6);
  m.position.copy(pos);
  flares.push({ owner: e, sk, m, glow, pos, vel: aim.clone().multiplyScalar(sk.speed).add(new V3(0, 3, 0)), t: 0, stuck: false, burning: false });
  SFX.play('skFlashPin', e.isBot ? pos : null);
}
// 目に入っているか（CPU は正面の約 ±53°、自分は画面の中）
function sees(e, p) {
  const eye = eyeOf(e);
  if (!hasLOS(eye, p, true)) return false;
  if (e.isBot) return facingOf(e).dot(p.clone().sub(eye).normalize()) > 0.6;
  const s = p.clone().project(cam);
  return s.z < 1 && Math.abs(s.x) <= 1.02 && Math.abs(s.y) <= 1.02;
}
function updateFlares(dt) {
  for (let i = flares.length - 1; i >= 0; i--) {
    const F = flares[i]; F.t += dt;
    if (!F.stuck) {
      F.vel.y -= 20 * dt;
      const next = F.pos.clone().addScaledVector(F.vel, dt), d = next.clone().sub(F.pos), len = d.length();
      if (len > 1e-6) {
        const r = new THREE.Raycaster(F.pos, d.normalize(), 0, len);
        const h = r.intersectObjects(blockers, true)[0];
        if (h) { const n = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : d.clone().negate(); F.pos.copy(h.point).addScaledVector(n, 0.1); F.stuck = true; }
        else F.pos.copy(next);
      }
      F.m.position.copy(F.pos); F.m.rotation.x += dt * 9;
    }
    if (!F.burning && F.t >= F.sk.fuse) { F.burning = true; F.burnT = F.sk.burn; F.glow.visible = true; SFX.play('skFlash', F.pos); }
    if (!F.burning) continue;
    F.burnT -= dt;
    const fl = 0.85 + Math.sin(F.t * 37) * 0.1 + rand(-0.05, 0.05);
    F.glow.position.copy(F.pos); F.glow.scale.setScalar(2.2 * fl);
    if (Math.random() < dt * 25) Particles.glow(F.pos.clone().add(new V3(rand(-0.15, 0.15), rand(0, 0.4), rand(-0.15, 0.15))), Math.random() < 0.5 ? P.daidai[2] : P.shiro[2]);
    // 見ている間は目がくらむ（見るのをやめると少しで戻る）
    for (const e of [player, bot]) {
      if (!e || e.dead || eyeOf(e).distanceTo(F.pos) > F.sk.radius || !sees(e, F.pos)) continue;
      if (e.isBot) e.blindT = Math.max(e.blindT || 0, F.sk.blind);
      else gs.flash = Math.max(gs.flash || 0, F.sk.blind);
    }
    if (F.burnT <= 0) { F.m.visible = false; F.glow.visible = false; flares.splice(i, 1); }
  }
}

// ---------- 空爆要請（帝）：狙った所に印、1.5 秒後に 3 回の爆撃（落ちる所は決まった形にずらす：オンラインでも同じ所に落ちる） ----------
const markGeo = new THREE.TorusGeometry(1, 0.08, 4, 28).rotateX(Math.PI / 2);
const strikes: any[] = [];
export function callAirstrike(e, aim, sk) {
  const from = eyeOf(e), r = new THREE.Raycaster(from, aim.clone().normalize(), 0, sk.range);
  const h = r.intersectObjects(blockers, true)[0];
  if (!h) return false;
  const p = h.point.clone();
  const mark = track(new THREE.Mesh(markGeo, new THREE.MeshBasicMaterial({ color: P.shu[2], transparent: true, opacity: 0.8, depthWrite: false })));
  mark.position.copy(p).add(new V3(0, 0.08, 0)); mark.scale.setScalar(sk.spread);
  // 落ちる所：狙った向き（左右）に合わせて、真ん中・右前・左後ろ
  const yaw = Math.atan2(aim.x, aim.z), rt = new V3(Math.cos(yaw), 0, -Math.sin(yaw)), fw = new V3(Math.sin(yaw), 0, Math.cos(yaw));
  const offs = [[0, 0], [0.8, 0.5], [-0.7, -0.6]].map(([a, b]) => rt.clone().multiplyScalar(a * sk.spread).addScaledVector(fw, b * sk.spread));
  strikes.push({ owner: e, sk, p, mark, t: 0, n: 0, offs });
  SFX.play('skMissile', e.isBot ? p : null);
  return true;
}
function updateStrikes(dt) {
  for (let i = strikes.length - 1; i >= 0; i--) {
    const S = strikes[i]; S.t += dt;
    S.mark.rotation.y += dt * 2; S.mark.material.opacity = 0.5 + Math.sin(S.t * 18) * 0.3;
    while (S.n < S.sk.count && S.t >= S.sk.delay + S.n * S.sk.gap) {
      const q = S.p.clone().add(S.offs[S.n % S.offs.length]).add(new V3(0, 0.4, 0));
      for (let k = 0; k < 6; k++) Particles.trail(q.clone().add(new V3(0, 3 + k * 2.5, 0)), P.daidai[2]);
      explodeAt(q, S.owner, S.sk.dmg, S.sk.radius, { knock: S.sk.knock, lift: S.sk.lift, self: S.sk.self });
      S.n++;
    }
    if (S.n >= S.sk.count) { S.mark.visible = false; strikes.splice(i, 1); }
  }
}

// ---------- 竜巻（侍）：まわりの相手を自分の方へ引き寄せる ----------
const tornadoGeo = new THREE.TorusGeometry(1, 0.06, 4, 24).rotateX(Math.PI / 2);
const twisters: any[] = [];
export function startTornado(e, sk) {
  const rings = [0, 1, 2].map(k => track(new THREE.Mesh(tornadoGeo, new THREE.MeshBasicMaterial({ color: P.shiro[2], transparent: true, opacity: 0.5, depthWrite: false }))));
  twisters.push({ e, sk, rings, t: 0 });
  SFX.play('skShock', e.isBot ? e.pos : null);
}
function updateTwisters(dt) {
  for (let i = twisters.length - 1; i >= 0; i--) {
    const T = twisters[i]; T.t += dt;
    const k = T.t / T.sk.duration;
    T.rings.forEach((m, j) => {
      const r = T.sk.radius * (1 - ((k * 2 + j / 3) % 1));
      m.position.copy(T.e.pos).add(new V3(0, 0.3 + j * 0.6, 0)); m.scale.setScalar(Math.max(0.2, r)); m.material.opacity = 0.5 * (1 - k);
    });
    if (Math.random() < dt * 40) { const a = rand(0, Math.PI * 2), r = rand(1, T.sk.radius); Particles.dust(T.e.pos.clone().add(new V3(Math.cos(a) * r, 0.2, Math.sin(a) * r)), 1, 0.6); }
    const foe = foeOf(T.e);
    if (foe && !foe.dead && local(foe)) {
      const to = T.e.pos.clone().sub(foe.pos), d = Math.hypot(to.x, to.z);
      if (d < T.sk.radius && d > 1.2 && Math.abs(to.y) < 4) {
        to.setY(0).normalize();
        const want = to.multiplyScalar(T.sk.pull * (0.5 + 0.5 * d / T.sk.radius));
        foe.vel.lerp(want, 1 - Math.exp(-10 * dt));
        foe.vy = Math.max(foe.vy, T.sk.lift); foe.onGround = false; foe.airT = 1; foe.knockT = Math.max(foe.knockT || 0, 0.2);
      }
    }
    if (T.t >= T.sk.duration) { T.rings.forEach(m => { m.visible = false; }); twisters.splice(i, 1); }
  }
}

// ---------- 幽体離脱（成香）：体はその場に残り、幽体で偵察する（壁はすり抜けない） ----------
//   幽体は自分の画面の中だけ（相手には見えない）。ジャンプ長押しで上昇、離すと下降
export function startGhost(e, sk) {
  e.ghost = { pos: eyeOf(e).add(new V3(0, -0.3, 0)), vel: new V3(), vy: 0, radius: 0.25, height: 0.5, onGround: false, sk };
  SFX.play('skCloak');
  for (let k = 0; k < 14; k++) Particles.glow(e.pos.clone().add(new V3(rand(-0.4, 0.4), rand(0.3, e.height), rand(-0.4, 0.4))), P.shiro[2]);
}
export function endGhost(e) {
  if (!e.ghost) return;
  e.ghost = null;
  const s = e.slots.find(x => x.sk.type === 'ghost'); if (s) s.t = 0;
  if (!e.isBot) SFX.play('skCloak');
}
// 幽体を動かす（wish：水平の向き、up：ジャンプを押しているか）
export function moveGhost(e, wish, up, dt) {
  const g = e.ghost; if (!g) return;
  const sp = g.sk.speed;
  g.vel.lerp(wish.clone().multiplyScalar(sp), 1 - Math.exp(-8 * dt));
  g.vy += ((up ? g.sk.rise : -g.sk.rise * 0.7) - g.vy) * (1 - Math.exp(-4 * dt));   // ゆるやかに上がる・下がる
  g.prevX = g.pos.x; g.prevZ = g.pos.z; g.prevY = g.pos.y;
  g.pos.x += g.vel.x * dt; g.pos.z += g.vel.z * dt; g.pos.y += g.vy * dt;
  g.pos.y = Math.min(g.pos.y, 60);
  collide(g);   // 壁・床・天井で止まる
  if (g.onGround && g.vy < 0) g.vy = 0;
}

export const Promo = {
  update(dt) {
    if (dt <= 0) return;
    for (const e of [player, bot]) if (e) poisonTick(e, dt);
    updateMines(dt); updateDomes(dt); updateFlares(dt); updateStrikes(dt); updateTwisters(dt);
  },
  clear() {
    mines.length = 0; flares.length = 0; strikes.length = 0; twisters.length = 0;
    for (const D of domes) { const b = blockers.indexOf(D.shell); if (b >= 0) blockers.splice(b, 1); }
    domes.length = 0;
    for (const e of [player, bot]) if (e) { e.poisonT = 0; e.ghost = null; }
  },
  minesOf: e => mines.filter(m => m.owner === e).length,
};
