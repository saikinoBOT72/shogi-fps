// ゲーム状態・移動と当たり判定・武器・プレイヤー
'use strict';

// ================= ゲーム状態 =================
let state = 'title';   // title / countdown / fight / end
let paused = false, stateT = 0, timeScale = 1, slowmoT = 0;
let player, bot, playerActor, botActor, stats;
const view = { yaw: 0, pitch: 0, shake: 0, fov: 80, bobPhase: 0, dip: 0, dipV: 0, roll: 0 };
const isPlaying = () => (state === 'countdown' || state === 'fight') && !paused;

function makeEntity(type, isBot) {
  const def = PIECES[type], w = WEAPONS[def.weapon];
  return {
    type, def, w, skill: SKILLS[def.skill], isBot,
    pos: new V3(), vel: new V3(), vy: 0, onGround: true, airT: 0, jumped: false,
    height: 1.85 * def.size, radius: 0.5 * def.size, eyeH: 1.85 * def.size * 0.83,
    hp: def.hp, dead: false, ammo: w.mag, cd: 0, reloading: 0, bloom: 0, moving: false,
    skillCd: 0, skillT: 0, skillDir: new V3(), rammed: false, stepPhase: 0, flashT: 0,
  };
}
playerActor = buildActor(PIECES.P.name, PIECES.P.size);
botActor = buildActor(PIECES.P.name, PIECES.P.size);

function resetMatch() {
  player = makeEntity('P', false);
  bot = makeEntity('P', true);
  player.pos.set(rand(-4, 4), 0, H - 3);
  bot.pos.set(rand(-4, 4), 0, -(H - 3));
  Object.assign(bot, { seen: 0, lostT: 0, strafe: 1, strafeT: 0, stuck: 0, lastPos: bot.pos.clone(), aimPt: player.pos.clone(), lastKnown: player.pos.clone(), coverPt: null, coverT: 0, fireDelay: 0, jumpT: 2, wp: null, wpT: 0, hurtT: 0,
    persona: Object.values(PERSONAS)[Math.floor(Math.random() * 3)] });
  stats = { shots: 0, hits: 0, heads: 0, dealt: 0, taken: 0, time: 0 };
  view.yaw = Math.atan2(-(bot.pos.x - player.pos.x), -(bot.pos.z - player.pos.z));
  view.pitch = 0; view.shake = 0; view.roll = 0; view.dip = 0; view.dipV = 0;
  botActor.body.rotation.set(0, 0, 0); botActor.body.position.y = 0; botActor.dead = null; botActor.root.visible = true;
  playerActor.body.rotation.set(0, 0, 0); playerActor.dead = null;
  Replay.clear();
  botActor.wood.emissive.setHex(0);
  Decals.clear();
  PHYS.reset();
  timeScale = 1; slowmoT = 0;
  VM.equip = 1;
  document.querySelectorAll('.dd').forEach(e => e.remove());
}

// ================= 物理・当たり判定 =================
const ray = new THREE.Raycaster();
const eyeOf = e => new V3(e.pos.x, e.pos.y + e.eyeH, e.pos.z);

function collide(e) {
  const R = e.radius;
  e.onGround = false;
  if (e.pos.y <= 0) { e.pos.y = 0; if (e.vy < 0) e.vy = 0; e.onGround = true; }
  for (const c of colliders) {
    let cx, cz, top, bottom;
    if (c.kind === 'box') { cx = clamp(e.pos.x, c.min.x, c.max.x); cz = clamp(e.pos.z, c.min.z, c.max.z); top = c.max.y; bottom = c.min.y; }
    else {
      const dx = e.pos.x - c.x, dz = e.pos.z - c.z, d = Math.hypot(dx, dz);
      if (d <= c.r) { cx = e.pos.x; cz = e.pos.z; } else { cx = c.x + dx / d * c.r; cz = c.z + dz / d * c.r; }
      top = c.y1; bottom = c.y0;
    }
    const dx = e.pos.x - cx, dz = e.pos.z - cz, d2 = dx * dx + dz * dz;
    if (d2 >= R * R) continue;
    if (e.pos.y >= top - 0.4 && e.vy <= 0) { e.pos.y = top; e.vy = 0; e.onGround = true; continue; }
    if (e.pos.y + e.height <= bottom || e.pos.y >= top) continue;
    let nx, nz, push;
    if (d2 > 1e-8) { const d = Math.sqrt(d2); nx = dx / d; nz = dz / d; push = R - d; }
    else if (c.kind === 'cyl') {
      const vx = e.pos.x - c.x, vz = e.pos.z - c.z, d = Math.hypot(vx, vz) || 1;
      nx = vx / d; nz = vz / d; push = c.r + R - d;
    } else {
      const o = [[-1, 0, e.pos.x - c.min.x], [1, 0, c.max.x - e.pos.x], [0, -1, e.pos.z - c.min.z], [0, 1, c.max.z - e.pos.z]].sort((a, b) => a[2] - b[2])[0];
      nx = o[0]; nz = o[1]; push = o[2] + R;
    }
    e.pos.x += nx * push; e.pos.z += nz * push;
    const vn = e.vel.x * nx + e.vel.z * nz;
    if (vn < 0) { e.vel.x -= vn * nx; e.vel.z -= vn * nz; }
  }
  const lim = H - R;
  if (Math.abs(e.pos.x) > lim) { e.pos.x = clamp(e.pos.x, -lim, lim); e.vel.x = 0; }
  if (Math.abs(e.pos.z) > lim) { e.pos.z = clamp(e.pos.z, -lim, lim); e.vel.z = 0; }
}
function hasLOS(a, b) {
  const d = b.clone().sub(a), dist = d.length();
  ray.set(a, d.normalize()); ray.far = dist;
  const hit = ray.intersectObjects(blockers, true).length > 0;
  ray.far = Infinity;
  return !hit;
}

// 移動（加速・摩擦・コヨーテタイム）
function moveEntity(e, wish, dt) {
  const sk = e.skill;
  if (e.skillT > 0) {
    e.skillT -= dt;
    e.vel.copy(e.skillDir).multiplyScalar(sk.speed);
    if (e.skillT <= 0) e.vel.multiplyScalar(0.35);
  } else {
    const target = wish.clone().multiplyScalar(e.def.speed * (e.speedMul || 1));
    const dv = target.sub(e.vel); dv.y = 0;
    const acc = (e.onGround ? 75 : 22) * dt;
    if (dv.length() > acc) dv.setLength(acc);
    e.vel.add(dv);
  }
  e.pos.x += e.vel.x * dt; e.pos.z += e.vel.z * dt;
  const prevVy = e.vy;
  e.vy -= G * dt; e.pos.y += e.vy * dt;
  const was = e.onGround;
  collide(e);
  if (e.onGround) { e.airT = 0; e.jumped = false; } else e.airT += dt;
  if (!was && e.onGround && prevVy < -4) onLand(e, -prevVy);
  e.moving = Math.hypot(e.vel.x, e.vel.z) > 1;
}
function tryJump(e) {
  if (e.airT < 0.1 && !e.jumped) { e.vy = e.def.jump; e.jumped = true; e.onGround = false; e.airT = 1; return true; }
  return false;
}
function onLand(e, v) {
  SFX.play('land', e.pos);
  Particles.dust(e.pos, 5, 0.8);
  if (!e.isBot) { view.dipV -= v * 0.012; VM.dip = Math.min(1, v * 0.05); }
}
function separate(a, b) {
  const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d = Math.hypot(dx, dz), min = a.radius + b.radius;
  if (d >= min || d < 1e-6) return;
  if (a.pos.y + a.height < b.pos.y || b.pos.y + b.height < a.pos.y) return;
  const p = (min - d) / 2, nx = dx / d, nz = dz / d;
  a.pos.x -= nx * p; a.pos.z -= nz * p; b.pos.x += nx * p; b.pos.z += nz * p;
}

// ================= 武器 =================
function currentSpread(e) {
  const w = e.w;
  let s = w.spread + e.bloom;
  if (e.moving) s += w.move * clamp(Math.hypot(e.vel.x, e.vel.z) / e.def.speed, 0, 1);
  if (!e.onGround) s += w.air;
  if (!e.isBot) s *= lerp(1, w.ads, e.adsT || 0);
  return s;
}
const canFire = e => e.cd <= 0 && e.reloading <= 0 && e.ammo > 0 && !e.dead;
function startReload(e) {
  if (e.reloading > 0 || e.ammo >= e.w.mag) return;
  e.reloading = e.w.reload;
  if (!e.isBot) SFX.play('reloadStart');
}
function weaponTick(e, dt) {
  e.cd -= dt;
  e.bloom = Math.max(0, e.bloom - e.w.bloomRecover * dt);
  if (e.reloading > 0) {
    e.reloading -= dt;
    if (e.reloading <= 0) { e.ammo = e.w.mag; if (!e.isBot) SFX.play('reloadEnd'); }
  }
}

// 撃つ：origin から dir に撃ち、target に当たったら結果を返す
function fire(shooter, target, origin, muzzle, dir) {
  const w = shooter.w, sp = currentSpread(shooter);
  const d = dir.clone().add(new V3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(rand(0, sp))).normalize();
  ray.set(origin, d); ray.far = 300;
  const wall = ray.intersectObjects(blockers, true)[0];
  const wallDist = wall ? wall.distance : 300;
  let hit = null;
  if (target.isBot) {
    const h = !botActor.dead && ray.intersectObject(botActor.hitMesh, false)[0];
    if (h && h.distance < wallDist) hit = { point: h.point, dist: h.distance };
  } else {
    const r = target.radius, p = target.pos;
    const box = new THREE.Box3(new V3(p.x - r, p.y, p.z - r), new V3(p.x + r, p.y + target.height, p.z + r));
    const hp = ray.ray.intersectBox(box, new V3());
    if (hp && hp.distanceTo(origin) < wallDist) hit = { point: hp, dist: hp.distanceTo(origin) };
  }
  shooter.ammo--; shooter.cd = w.rate;
  shooter.bloom = Math.min(w.bloomMax, shooter.bloom + w.bloomShot);
  if (shooter.ammo <= 0) startReload(shooter);

  let res = { dmg: 0, head: false, point: null };
  if (hit) {
    const [f0, f1, fm] = w.falloff;
    let dmg = w.dmg * lerp(1, fm, clamp((hit.dist - f0) / (f1 - f0), 0, 1));
    const head = hit.point.y > target.pos.y + target.height * 0.76;
    if (head) dmg *= w.head;
    if (target.skillT > 0) dmg *= target.skill.damageTaken;
    res = { dmg, head, point: hit.point };
    Tracers.add(muzzle, hit.point, shooter.isBot ? 0xff8a70 : 0xffe9a8);
  } else {
    const end = wall ? wall.point : origin.clone().addScaledVector(d, 150);
    Tracers.add(muzzle, end, shooter.isBot ? 0xff8a70 : 0xffe9a8);
    if (wall) {
      const n = wall.face ? wall.face.normal.clone().transformDirection(wall.object.matrixWorld) : d.clone().negate();
      Particles.impact(wall.point, n);
      const ph = wall.object.userData.phys;
      if (ph) { PHYS.hit(ph, wall.point, d, w.dmg * 0.15); Particles.wood(wall.point, n, 4, 0.5); }
      else Decals.add(wall.point, n);
      if (Math.random() < 0.3) SFX.play('ricochet', wall.point);
      else SFX.play('thud', wall.point);
    }
    res.miss = d; res.wallDist = wallDist;
  }
  return res;
}

// ================= プレイヤー =================
function useSkill(e, dir) {
  if (e.skillCd > 0 || e.dead) return false;
  e.skillDir.copy(dir).setY(0).normalize();
  e.skillT = e.skill.duration; e.skillCd = e.skill.cooldown; e.rammed = false;
  e.vy = Math.max(e.vy, 2);
  SFX.play('dash', e.pos);
  Particles.dust(e.pos, 8, 1.3);
  if (!e.isBot) view.shake = Math.max(view.shake, 0.25);
  return true;
}

function updatePlayer(dt) {
  const p = player;
  const fwd = new V3(-Math.sin(view.yaw), 0, -Math.cos(view.yaw)), right = new V3(Math.cos(view.yaw), 0, -Math.sin(view.yaw));
  const wish = new V3();
  if (state === 'fight' && !p.dead) {
    if (keys.KeyW) wish.add(fwd); if (keys.KeyS) wish.sub(fwd);
    if (keys.KeyD) wish.add(right); if (keys.KeyA) wish.sub(right);
    if (wish.lengthSq() > 0) wish.normalize();
    if (jumpPressed > 0 && tryJump(p)) jumpPressed = 0;
    if (keys[p.skill.key]) useSkill(p, fwd);
  }
  jumpPressed -= dt;
  p.adsT = damp(p.adsT || 0, rightDown && !p.dead && p.reloading <= 0 && p.skillT <= 0 ? 1 : 0, 14, dt);
  p.speedMul = lerp(1, 0.6, p.adsT);
  moveEntity(p, wish, dt);
  p.skillCd = Math.max(0, p.skillCd - dt);

  // 足音
  if (p.onGround && p.moving) {
    const prev = Math.sin(view.bobPhase * 2);
    view.bobPhase += dt * Math.hypot(p.vel.x, p.vel.z) * 1.35;
    if (prev > 0 && Math.sin(view.bobPhase * 2) <= 0) { SFX.play('step', null, 0.7); if ((p.adsT || 0) < 0.5) aiHear(p.pos, 10); }
  }

  weaponTick(p, dt);
  if (state !== 'fight' || p.dead) return;
  if (keys.KeyR) startReload(p);
  if (mouseDown && !triggerUsed) {
    triggerUsed = !p.w.auto;
    if (p.ammo <= 0 && p.reloading <= 0) { SFX.play('empty'); startReload(p); }
    else if (canFire(p)) shootPlayer();
  }
}

function shootPlayer() {
  const p = player;
  cam.updateMatrixWorld();
  const dir = new V3(0, 0, -1).applyQuaternion(cam.quaternion);
  const muzzle = cam.localToWorld(new V3(lerp(0.19, 0, p.adsT) * 0.9, -0.14, -0.9));
  const res = fire(p, bot, eyeOf(p), muzzle, dir);
  aiHear(p.pos, 45);
  stats.shots++;
  SFX.play('shot');
  VM.kick = 1; VM.slideT = 1; VM.flashT = 0.05;
  view.pitch += p.w.recoil * lerp(1, 0.6, p.adsT); view.yaw += rand(-0.006, 0.006);
  view.shake = Math.max(view.shake, 0.12);
  if (res.dmg > 0) damageBot(res);
}

function damageBot(res) {
  bot.hp -= res.dmg;
  // 撃たれたら横移動の向きを変え、撃ってきた場所を覚える
  bot.strafe *= -1; bot.strafeT = rand(0.4, 1); bot.hurtT = 1.2;
  bot.lastKnown.copy(player.pos); if (bot.lostT > 0) bot.lostT = 0.01;
  stats.hits++; stats.dealt += res.dmg; if (res.head) stats.heads++;
  DmgNums.add(res.point, res.dmg, res.head);
  Particles.wood(res.point, cam.getWorldDirection(new V3()), res.head ? 14 : 8);
  botActor.wood.emissive.setRGB(0.6, 0.05, 0.02);
  botActor.flinch = (botActor.flinch || 0) + (res.head ? 0.5 : 0.3);
  const killed = bot.hp <= 0;
  showHitmarker(killed ? 'kill' : res.head ? 'head' : '');
  SFX.play(res.head ? 'head' : 'hit');
  if (killed) killBot();
}
