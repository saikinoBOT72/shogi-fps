// 成駒のスキルの仕組み：毒（成桂）・地雷（馬）・ドーム（成銀）・フレア弾（龍）・空爆要請（帝）・竜巻（侍）
// 出した物の形はリプレイ用に gadgets.ts の track に登録する（対局中は消さずに隠すだけ）
import * as THREE from 'three';
import { P } from './palette';
import { C, V3, clamp, rand } from './core';
import { SFX } from './audio';
import { cam, flatGeo, toon } from './render';
import { blockers } from './physics';
import { DmgNums, Particles } from './effects';
import { bot, eyeOf, facingOf, hasLOS, player } from './game';
import { gs } from './state';
import { track } from './gadgets';
import { explodeAt } from './grenades';
import { Net } from './net';
import { damagePlayer } from './ai';

const foeOf = e => (e === player ? bot : player);
// 動きをこの画面で決めている駒か（自分・オフラインの CPU。オンラインの相手の位置は相手の画面が決める）
const local = e => e === player || !Net.on;
// 決まった並びの乱数（オンラインでも両方の画面で同じ所に落ちる）
const seeded = (n: number, k: number) => { const x = Math.sin(n * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };
// 投げた物を1こま進める（重力・壁や床で止まる）。止まったら当たった点を返す
const ray = new THREE.Raycaster();
function flyStep(o, dt, grav) {
  o.vel.y -= grav * dt;
  const next = o.pos.clone().addScaledVector(o.vel, dt), d = next.clone().sub(o.pos), len = d.length();
  if (len < 1e-6) return null;
  ray.set(o.pos, d.normalize()); ray.far = len;
  const h = ray.intersectObjects(blockers, true)[0];
  if (!h) { o.pos.copy(next); return null; }
  const n = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : d.clone().negate();
  o.pos.copy(h.point).addScaledVector(n, 0.08);
  return { point: h.point.clone(), n };
}

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

// ---------- ドーム（成銀）：金色の六角形の網の半球（EMP の青い球と見分けがつくように）。弾を通さない（中から外へも撃てない）。歩いて出入りはできる ----------
const domeGeo = new THREE.SphereGeometry(1, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2);
const domeRingGeo = new THREE.TorusGeometry(1, 0.025, 4, 48).rotateX(Math.PI / 2);
const domeMat = () => new THREE.ShaderMaterial({
  uniforms: { uColor: { value: new THREE.Color(P.kin[2]) }, uOp: { value: 0 }, uT: { value: 0 } },
  vertexShader: `varying vec3 vP; varying vec3 vN; varying vec3 vV;
    void main() { vP = position; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }`,
  fragmentShader: `uniform vec3 uColor; uniform float uOp; uniform float uT; varying vec3 vP; varying vec3 vN; varying vec3 vV;
    float hexD(vec2 p) { p = abs(p); return max(dot(p, vec2(0.5, 0.8660254)), p.x); }
    void main() {
      // 球の表面に六角形を並べる（横は一周でちょうど 36 個になるように）
      vec2 uv = vec2(atan(vP.z, vP.x) / 6.2831853 * 36.0, asin(clamp(vP.y, 0.0, 1.0)) * 9.0);
      vec2 r = vec2(1.0, 1.7320508), h = r * 0.5;
      vec2 a = mod(uv, r) - h, b = mod(uv - h, r) - h;
      vec2 g = dot(a, a) < dot(b, b) ? a : b;
      float edge = smoothstep(0.40, 0.47, hexD(g));
      float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.5);   // 縁ほど濃く
      float wave = smoothstep(0.92, 1.0, sin(vP.y * 9.0 - uT * 4.0));      // 下から上へ流れる光の帯
      float al = (0.06 + edge * (0.5 + wave * 0.4) + rim * 0.35) * uOp;
      gl_FragColor = vec4(uColor * (0.75 + edge * 0.5 + wave * 0.3), al);
    }`,
  transparent: true, depthWrite: false, side: THREE.DoubleSide,
});
const domes: any[] = [];
export function spawnDome(e, sk) {
  const shell = track(new THREE.Mesh(domeGeo, domeMat()));
  const ring = track(new THREE.Mesh(domeRingGeo, new THREE.MeshBasicMaterial({ color: P.kin[2], transparent: true, opacity: 0, depthWrite: false })));
  const c = e.pos.clone().add(new V3(0, -0.2, 0));   // 少し沈めて、坂でも足元にすき間ができないように
  shell.position.copy(c); ring.position.copy(c).add(new V3(0, 0.22, 0)); shell.scale.setScalar(0.01);
  blockers.push(shell);
  domes.push({ shell, ring, t: 0, life: sk.duration, r: sk.radius });
  for (let k = 0; k < 18; k++) { const a = rand(0, Math.PI * 2); Particles.glow(c.clone().add(new V3(Math.cos(a) * sk.radius, 0.4, Math.sin(a) * sk.radius)), P.kin[2]); }
  SFX.play('guardUp', e.isBot ? c : null);
}
function updateDomes(dt) {
  for (let i = domes.length - 1; i >= 0; i--) {
    const D = domes[i]; D.t += dt;
    const k = Math.min(1, D.t / 0.3), f = clamp((D.life - D.t) / 0.4, 0, 1);
    const r = Math.max(0.01, D.r * (1 - (1 - k) ** 3));
    D.shell.scale.setScalar(r); D.ring.scale.setScalar(r);
    const u = D.shell.material.uniforms; u.uT.value = D.t; u.uOp.value = f * (D.life - D.t < 1 ? 0.6 + 0.4 * Math.sign(Math.sin(D.t * 30)) : 1);   // 消える前の1秒はちらつく
    D.ring.material.opacity = 0.8 * f;
    if (D.t >= D.life) {
      D.shell.visible = D.ring.visible = false;
      const b = blockers.indexOf(D.shell); if (b >= 0) blockers.splice(b, 1);
      domes.splice(i, 1);
    }
  }
}

// ---------- フレア弾（龍）：フレアガンで撃つ。光りながらまっすぐ進み、3 秒で消える（壁に当たったらそこで燃える）。光を見た相手は目がくらむ ----------
const flareGeo = flatGeo(new THREE.CylinderGeometry(0.05, 0.05, 0.2, 6)), flareM = toon({ color: C(P.shu[1]), emissive: C(P.daidai[2]), emissiveIntensity: 0.6 });
const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,240,200,0.8)'); r.addColorStop(1, 'rgba(255,200,120,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
const flares: any[] = [];
export function tossFlare(e, aim, sk) {
  const m = track(new THREE.Mesh(flareGeo, flareM));
  const glow = track(new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xfff0d0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false })));
  const dir = aim.clone().normalize();
  const pos = eyeOf(e).addScaledVector(dir, 0.7);
  m.position.copy(pos); m.quaternion.setFromUnitVectors(new V3(0, 1, 0), dir);
  flares.push({ owner: e, sk, m, glow, pos, vel: dir.multiplyScalar(sk.speed), t: 0, stuck: false });
  SFX.play('m79', e.isBot ? pos : null);
  SFX.play('skFlash', pos);
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
      if (flyStep(F, dt, 0)) F.stuck = true;
      F.m.position.copy(F.pos);
      if (Math.random() < dt * 40) Particles.trail(F.pos.clone(), Math.random() < 0.5 ? P.daidai[2] : P.shu[2]);
    }
    const left = F.sk.burn - F.t, fl = (0.85 + Math.sin(F.t * 37) * 0.1 + rand(-0.05, 0.05)) * clamp(left / 0.3, 0, 1);
    F.glow.position.copy(F.pos); F.glow.scale.setScalar(2.4 * fl * Math.min(1, 0.2 + F.t * 3));   // 撃った直後は小さく（目の前でまぶしすぎないように）
    if (Math.random() < dt * 25) Particles.glow(F.pos.clone().add(new V3(rand(-0.15, 0.15), rand(0, 0.4), rand(-0.15, 0.15))), Math.random() < 0.5 ? P.daidai[2] : P.shiro[2]);
    // 見ている間は目がくらむ（見るのをやめると少しで戻る）。撃った本人は平気
    for (const e of [player, bot]) {
      if (!e || e === F.owner || e.dead || eyeOf(e).distanceTo(F.pos) > F.sk.radius || !sees(e, F.pos)) continue;
      if (e.isBot) e.blindT = Math.max(e.blindT || 0, F.sk.blind);
      else gs.flash = Math.max(gs.flash || 0, F.sk.blind);
    }
    if (left <= 0) { F.m.visible = false; F.glow.visible = false; flares.splice(i, 1); }
  }
}

// ---------- 空爆要請（帝）：発煙筒を投げ、落ちた所のまわりに砲弾が降り続ける（Apex のジブラルタルのウルトのように） ----------
//   落ちる所は決まった並びの乱数（オンラインでも同じ所に落ちる）。自分が巻き込まれたときは少しだけ減る
const canGeo = flatGeo(new THREE.CylinderGeometry(0.05, 0.05, 0.24, 8)), canM = toon({ color: C(P.shu[1]), emissive: C(P.shu[1]), emissiveIntensity: 0.3 });
const markGeo = new THREE.TorusGeometry(1, 0.03, 4, 56).rotateX(Math.PI / 2);
const strikes: any[] = [];
const FALL = 0.45;   // 砲弾が見えてから落ちるまでの秒数
export function callAirstrike(e, aim, sk) {
  const m = track(new THREE.Mesh(canGeo, canM));
  const pos = eyeOf(e).addScaledVector(aim, 0.6);
  m.position.copy(pos);
  strikes.push({ owner: e, sk, m, pos, vel: aim.clone().multiplyScalar(sk.speed).add(new V3(0, 3, 0)), t: 0, landed: false, lt: 0, n: 0, falling: [] });
  SFX.play('skFlashPin', e.isBot ? pos : null);
  return true;
}
function landStrike(S) {
  S.landed = true; S.lt = 0;
  S.mark = track(new THREE.Mesh(markGeo, new THREE.MeshBasicMaterial({ color: P.shu[2], transparent: true, opacity: 0.8, depthWrite: false })));
  S.mark.position.copy(S.pos).add(new V3(0, 0.1, 0)); S.mark.scale.setScalar(S.sk.area);
  SFX.play('skMissile', S.pos);
}
// 砲弾が落ちる地面：上から下へ調べる（屋根があれば屋根に落ちる）
function groundUnder(x, y, z) {
  ray.set(new V3(x, y + 25, z), new V3(0, -1, 0)); ray.far = 60;
  const h = ray.intersectObjects(blockers, true)[0];
  return h ? h.point : new V3(x, y, z);
}
function updateStrikes(dt) {
  for (let i = strikes.length - 1; i >= 0; i--) {
    const S = strikes[i]; S.t += dt;
    if (!S.landed) {
      if (flyStep(S, dt, 20) || S.t > 5) landStrike(S);
      S.m.position.copy(S.pos); S.m.rotation.x += dt * 9;
      continue;
    }
    S.lt += dt;
    // 発煙筒：赤い煙を上げ続ける・印の輪が回る
    if (S.n < S.sk.count && Math.random() < dt * 30) Particles.trail(S.pos.clone().add(new V3(rand(-0.1, 0.1), rand(0.1, 1.2), rand(-0.1, 0.1))), P.shu[2]);
    S.mark.rotation.y += dt * 0.8; S.mark.material.opacity = 0.45 + Math.sin(S.lt * 10) * 0.25;
    // 次の砲弾：落ちる少し前から空に光の筋が見える
    const gap = S.sk.time / S.sk.count;
    while (S.n < S.sk.count && S.lt >= S.sk.delay + S.n * gap - FALL) {
      const a = seeded(S.n, 1) * Math.PI * 2, r = Math.sqrt(seeded(S.n, 2)) * S.sk.area;
      S.falling.push({ q: groundUnder(S.pos.x + Math.cos(a) * r, S.pos.y, S.pos.z + Math.sin(a) * r), t: 0 });
      S.n++;
    }
    for (let k = S.falling.length - 1; k >= 0; k--) {
      const F = S.falling[k]; F.t += dt;
      const hgt = 18 * Math.max(0, 1 - F.t / FALL);
      Particles.trail(F.q.clone().add(new V3(0, hgt + 0.5, 0)), P.daidai[2]);
      if (F.t >= FALL) {
        explodeAt(F.q.clone().add(new V3(0, 0.4, 0)), S.owner, S.sk.dmg, S.sk.radius, { knock: S.sk.knock, lift: S.sk.lift, self: S.sk.self });
        S.falling.splice(k, 1);
      }
    }
    if (S.n >= S.sk.count && !S.falling.length) { S.mark.visible = false; S.m.visible = false; strikes.splice(i, 1); }
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
    for (const e of [player, bot]) if (e) e.poisonT = 0;
  },
  minesOf: e => mines.filter(m => m.owner === e).length,
};
