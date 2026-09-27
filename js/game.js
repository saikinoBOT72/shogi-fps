// ゲーム状態・移動と当たり判定・武器・プレイヤー
'use strict';

// ================= ゲーム状態 =================
let state = 'title';   // title / countdown / fight / end
let paused = false, stateT = 0, timeScale = 1, slowmoT = 0;
let player, bot, playerActor, botActor, stats;
let matchCtx = null;   // 将棋モードの撃ち合い中：{ myType, foeType, playerIsAttacker }
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
    charges: SKILLS[def.skill].charges || 1, draw: 0, sinceHit: 99,
  };
}
// 駒の見た目を用意（種類が変わったときだけ作り直す）
function ensureActors(pType, bType) {
  const make = (old, type, isBot) => {
    if (old && old.type === type) return old;
    if (old) scene.remove(old.root);
    const d = PIECES[type], a = buildActor(type === 'K' && isBot ? '玉' : d.name, d.size, WEAPONS[d.weapon].model);
    a.type = type;
    return a;
  };
  playerActor = make(playerActor, pType, false);
  botActor = make(botActor, bType, true);
}
const pieceKeys = () => Object.keys(PIECES);
function resolveFoe() {
  const k = settings.foePiece;
  return k === 'random' ? pieceKeys()[Math.floor(Math.random() * pieceKeys().length)] : (PIECES[k] ? k : 'P');
}

function resetMatch(foeType) {
  const myType = matchCtx ? matchCtx.myType : PIECES[settings.myPiece] ? settings.myPiece : 'P';
  foeType = foeType || (matchCtx && matchCtx.foeType) || (settings.foePiece === 'random' ? (bot && bot.type) || 'P' : resolveFoe());
  ensureActors(myType, foeType);
  player = makeEntity(myType, false);
  bot = makeEntity(foeType, true);
  VM.setWeapon(player.w.model);
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
  Arrows.clear(); Grenades.clear(); Smoke.clear();
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
  if (Smoke.blocks(a, b)) return false;   // 煙の向こうは見えない
  const d = b.clone().sub(a), dist = d.length();
  ray.set(a, d.normalize()); ray.far = dist;
  const hit = ray.intersectObjects(blockers, true).length > 0;
  ray.far = Infinity;
  return !hit;
}

// 移動（加速・摩擦・コヨーテタイム）
function moveEntity(e, wish, dt) {
  wish = wish.clone();
  const sk = e.skill;
  // 横移動が遅い駒（香）：向いている方向に対して横の成分を縮める
  if (e.def.strafe && wish.lengthSq() > 0) {
    const f = facingOf(e), along = wish.dot(f);
    wish = f.clone().multiplyScalar(along).add(wish.clone().addScaledVector(f, -along).multiplyScalar(e.def.strafe));
  }
  if (e.skillT > 0 && (sk.type === 'dash' || sk.type === 'step')) {
    e.skillT -= dt;
    e.vel.copy(e.skillDir).multiplyScalar(sk.speed);
    if (e.skillT <= 0) e.vel.multiplyScalar(0.35);
  } else if (e.skillT > 0 && sk.type === 'leap') {
    e.skillT -= dt;   // 跳んでいる間は勢いのまま（空中で向きを変えられない）
  } else {
    let slow = 1;
    if (e.skillT > 0 && sk.type === 'guard') { e.skillT -= dt; slow = sk.slow; }
    const target = wish.clone().multiplyScalar(e.def.speed * (e.speedMul || 1) * slow);
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
  if (sk.type === 'leap' && e.skillT > 0 && e.onGround && sk.duration - e.skillT > 0.15) { e.skillT = 0; leapLand(e); }
  e.moving = Math.hypot(e.vel.x, e.vel.z) > 1;
}
function tryJump(e) {
  if (e.airT < 0.1 && !e.jumped) { e.vy = e.def.jump; e.jumped = true; e.onGround = false; e.airT = 1; return true; }
  return false;
}
// 桂跳びの着地：周りの相手と小物を吹き飛ばす
function leapLand(e) {
  const sk = e.skill, foe = e === player ? bot : player;
  Particles.dust(e.pos, 22, 2.2);
  PHYS.blast(e.pos.clone().setY(0.3), sk.radius * 1.3, 7);
  SFX.play('boom', e.pos);
  view.shake = Math.max(view.shake, clamp(1 - e.pos.distanceTo(player.pos) / 15, 0, 1) * 0.7);
  if (foe.dead) return;
  const d = Math.hypot(foe.pos.x - e.pos.x, foe.pos.z - e.pos.z);
  if (d > sk.radius || Math.abs(foe.pos.y - e.pos.y) > 2.5) return;
  const dmg = sk.dmg * (1 - d / sk.radius * 0.5) * skillDamageMul(foe, e.pos);
  foe.vel.add(foe.pos.clone().sub(e.pos).setY(0).normalize().multiplyScalar(10)); foe.vy = 6; foe.onGround = false;
  if (foe.isBot) damageBot({ dmg, head: false, point: eyeOf(foe) }); else damagePlayer(dmg, e.pos);
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
  let s = w.spread + e.bloom + (w.kind === 'bow' ? (1 - (e.draw || 0)) * w.drawSpread : 0);
  if (e.moving) s += w.move * clamp(Math.hypot(e.vel.x, e.vel.z) / e.def.speed, 0, 1);
  if (!e.onGround) s += w.air;
  if (!e.isBot) s *= lerp(1, w.ads, e.adsT || 0);
  else if (w.zoom) s *= w.ads;
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

// 向いている方向（盾の判定用）
function facingOf(e) {
  if (e.isBot) { const y = botActor.root.rotation.y; return new V3(Math.sin(y), 0, Math.cos(y)); }
  return new V3(-Math.sin(view.yaw), 0, -Math.cos(view.yaw));
}
// スキルによる被ダメージ倍率（守りの構えは前からの弾だけ減らす）
function skillDamageMul(target, from) {
  if (!(target.skillT > 0)) return 1;
  const sk = target.skill;
  if (sk.type !== 'guard') return sk.damageTaken;
  const to = from.clone().sub(target.pos).setY(0).normalize();
  return facingOf(target).dot(to) > 0.2 ? sk.damageTaken : 1;
}

// 撃つ：origin から dir に撃つ。ショットガンは粒ごとに判定して合計する
function fire(shooter, target, origin, muzzle, dir) {
  const w = shooter.w, sp = currentSpread(shooter);
  let dmg = 0, head = false, point = null, miss = null, wallDist = 300, blocked = false, first = true;
  for (let i = 0; i < (w.pellets || 1); i++) {
    const r = castShot(shooter, target, origin, muzzle, dir, sp, first);
    first = false;
    if (r.dmg > 0) { dmg += r.dmg; head = head || r.head; point = point || r.point; blocked = blocked || r.blocked; }
    else if (!miss) { miss = r.miss; wallDist = r.wallDist; }
  }
  shooter.ammo--; shooter.cd = w.rate;
  shooter.bloom = Math.min(w.bloomMax, shooter.bloom + w.bloomShot);
  if (shooter.ammo <= 0) startReload(shooter);
  if (blocked) { SFX.play('guard', point); Particles.wood(point, new V3(0, 1, 0), 5, 0.6); }
  if (shooter.skillT > 0 && shooter.skill.type === 'pierce') shooter.skillT = 0;   // 貫きは1発で終わり
  return { dmg, head, point, blocked, miss: dmg > 0 ? null : miss, wallDist };
}
function castShot(shooter, target, origin, muzzle, dir, sp, sound) {
  const w = shooter.w;
  const d = dir.clone().add(new V3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(rand(0, sp))).normalize();
  ray.set(origin, d); ray.far = 300;
  const pierce = shooter.skillT > 0 && shooter.skill.type === 'pierce';
  const walls = ray.intersectObjects(blockers, true);
  const wall = pierce ? null : walls[0];
  const wallDist = wall ? wall.distance : 300;
  const tracerColor = pierce ? 0xc47aff : shooter.isBot ? 0xff8a70 : 0xffe9a8;
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
  let res = { dmg: 0, head: false, point: null };
  if (hit) {
    const [f0, f1, fm] = w.falloff;
    let dmg = w.dmg * lerp(1, fm, clamp((hit.dist - f0) / (f1 - f0), 0, 1));
    const head = hit.point.y > target.pos.y + target.height * 0.76;
    if (head) dmg *= w.head;
    const mul = pierce && target.skill.type === 'guard' ? 1 : skillDamageMul(target, shooter.pos);
    dmg *= mul;
    res = { dmg, head, point: hit.point, blocked: mul < 1 && target.skill.type === 'guard' };
    Tracers.add(muzzle, hit.point, tracerColor);
    // 貫いた壁から破片
    if (pierce) walls.filter(h => h.distance < hit.dist).forEach(h => Particles.impact(h.point, d.clone().negate()));
  } else {
    const end = wall ? wall.point : origin.clone().addScaledVector(d, 150);
    Tracers.add(muzzle, end, tracerColor);
    if (wall) {
      const n = wall.face ? wall.face.normal.clone().transformDirection(wall.object.matrixWorld) : d.clone().negate();
      Particles.impact(wall.point, n);
      const ph = wall.object.userData.phys;
      if (ph) { PHYS.hit(ph, wall.point, d, w.dmg * 0.15); Particles.wood(wall.point, n, 4, 0.5); }
      else Decals.add(wall.point, n);
      if (sound) SFX.play(Math.random() < 0.3 ? 'ricochet' : 'thud', wall.point);
    }
    res.miss = d; res.wallDist = wallDist;
  }
  return res;
}

// ================= プレイヤー =================
// 使える回数（charges）を1つ使い、待ち時間で1つずつ戻る
function skillTick(e, dt) {
  const sk = e.skill;
  if (e.skillT > 0 && (sk.type === 'homing' || sk.type === 'pierce' || sk.type === 'heal')) {
    e.skillT -= dt;
    if (sk.type === 'heal' && !e.dead) {
      e.hp = Math.min(e.def.hp, e.hp + sk.amount / sk.duration * dt);
      if (Math.random() < 0.5) Particles.glow(e.pos.clone().add(new V3(rand(-0.6, 0.6), rand(0.2, e.height), rand(-0.6, 0.6))), 0x6dff8a);
    }
  }
  const max = sk.charges || 1;
  if (e.charges >= max) { e.skillCd = 0; return; }
  e.skillCd -= dt;
  if (e.skillCd <= 0) { e.charges++; e.skillCd = e.charges < max ? e.skill.cooldown : 0; }
}
function useSkill(e, dir) {
  if (e.charges <= 0 || e.dead || e.skillT > 0) return false;
  e.skillDir.copy(dir).setY(0).normalize();
  e.charges--; if (e.skillCd <= 0) e.skillCd = e.skill.cooldown;
  e.skillT = e.skill.duration; e.rammed = false;
  if (e.skill.type === 'step') {
    SFX.play('dash', e.pos);
    Particles.dust(e.pos, 5, 0.9);
    if (!e.isBot) { view.shake = Math.max(view.shake, 0.15); view.stepRoll = e.skillDir.dot(new V3(Math.cos(view.yaw), 0, -Math.sin(view.yaw))) > 0 ? -1 : 1; }
  } else if (e.skill.type === 'homing') {
    SFX.play('homing', e.isBot ? e.pos : null);
  } else if (e.skill.type === 'leap') {
    const sk = e.skill;
    e.vy = sk.up; e.vel.copy(e.skillDir).multiplyScalar(sk.fwd);
    e.onGround = false; e.jumped = true; e.airT = 1;
    SFX.play('leap', e.pos); Particles.dust(e.pos, 10, 1.4);
    if (!e.isBot) view.shake = Math.max(view.shake, 0.2);
  } else if (e.skill.type === 'smoke') {
    Smoke.spawn(e.pos.clone().add(new V3(0, 1.2, 0)), e.skill.radius, e.skill.life);
    e.skillT = 0;
  } else if (e.skill.type === 'pierce') {
    if (!e.isBot) SFX.play('pierce');
  } else if (e.skill.type === 'heal') {
    SFX.play('heal');
  } else if (e.skill.type === 'dash') {
    e.vy = Math.max(e.vy, 2);
    SFX.play('dash', e.pos);
    Particles.dust(e.pos, 8, 1.3);
    if (!e.isBot) view.shake = Math.max(view.shake, 0.25);
  } else {
    SFX.play('guardUp', e.pos);
    if (!e.isBot) view.shake = Math.max(view.shake, 0.12);
  }
  return true;
}
// 構えを解く（撃ったとき）
function endGuard(e) { if (e.skillT > 0 && e.skill.type === 'guard') e.skillT = 0; }

function updatePlayer(dt) {
  const p = player;
  const fwd = new V3(-Math.sin(view.yaw), 0, -Math.cos(view.yaw)), right = new V3(Math.cos(view.yaw), 0, -Math.sin(view.yaw));
  const wish = new V3();
  if (state === 'fight' && !p.dead) {
    if (keys.KeyW) wish.add(fwd); if (keys.KeyS) wish.sub(fwd);
    if (keys.KeyD) wish.add(right); if (keys.KeyA) wish.sub(right);
    if (wish.lengthSq() > 0) wish.normalize();
    if (jumpPressed > 0 && tryJump(p)) jumpPressed = 0;
    if (keys[p.skill.key] && !p.skillHeld) {
      // すり足は A/D の方向（押していなければ右）、他は前
      let sdir = fwd;
      if (p.skill.type === 'step') sdir = keys.KeyA ? right.clone().negate() : keys.KeyD ? right : keys.KeyS ? fwd.clone().negate() : right;
      useSkill(p, sdir);
    }
    p.skillHeld = !!keys[p.skill.key];
  }
  jumpPressed -= dt;
  const guardOrDash = p.skillT > 0 && ['guard', 'dash', 'step', 'leap'].includes(p.skill.type);   // 覗き込めないスキル中
  p.adsT = damp(p.adsT || 0, rightDown && !p.dead && p.reloading <= 0 && !guardOrDash ? 1 : 0, 14, dt);
  p.speedMul = lerp(1, 0.6, p.adsT) * (p.draw > 0 ? 0.75 : 1);
  moveEntity(p, wish, dt);
  skillTick(p, dt);
  regenTick(p, dt);

  // 足音
  if (p.onGround && p.moving) {
    const prev = Math.sin(view.bobPhase * 2);
    view.bobPhase += dt * Math.hypot(p.vel.x, p.vel.z) * 1.35;
    if (prev > 0 && Math.sin(view.bobPhase * 2) <= 0) { SFX.play('step', null, 0.7); if ((p.adsT || 0) < 0.5) aiHear(p.pos, 10); }
  }

  weaponTick(p, dt);
  if (state !== 'fight' || p.dead) return;
  // 弓：押している間は引き絞り、離したら放つ
  if (p.w.kind === 'bow') {
    if (mouseDown && p.cd <= 0) {
      if (!p.drawing) SFX.play('bowDraw');
      p.drawing = true;
      const was = p.draw;
      p.draw = Math.min(1, p.draw + dt / p.w.drawTime);
      if (was < 1 && p.draw >= 1) SFX.play('bowReady');   // 引き切った合図
    } else if (p.drawing && !mouseDown) {
      p.drawing = false;
      if (p.draw > 0.12) shootPlayerArrow(); else p.draw = 0;
    }
    return;
  }
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
  endGuard(p);
  if (p.w.kind === 'grenade') {
    fireGrenade(p, dir, eyeOf(p).addScaledVector(dir, 0.6));
    aiHear(p.pos, 45); stats.shots++;
    VM.kick = 1.6; VM.slideT = 1; VM.flashT = 0.05;
    view.pitch += p.w.recoil; view.shake = Math.max(view.shake, 0.15);
    return;
  }
  const res = fire(p, bot, eyeOf(p), muzzle, dir);
  aiHear(p.pos, 45);
  stats.shots++;
  SFX.play('shot', null, p.w.model);
  VM.kick = clamp(p.w.recoil / 0.022, 1, 2.2); VM.slideT = 1; VM.flashT = 0.05;
  view.pitch += p.w.recoil * lerp(1, 0.6, p.adsT); view.yaw += rand(-0.006, 0.006);
  view.shake = Math.max(view.shake, 0.12);
  if (res.dmg > 0) damageBot(res);
}

// グレネードを撃つ（プレイヤー・CPU共通）
function fireGrenade(e, dir, origin) {
  const w = e.w, sp = currentSpread(e);
  const d = dir.clone().add(new V3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(rand(0, sp))).normalize();
  e.ammo--; e.cd = w.rate;
  if (e.ammo <= 0) startReload(e);
  Grenades.fire({ owner: e, target: e === player ? bot : player, pos: origin, vel: d.multiplyScalar(w.speed), dmg: w.dmg, radius: w.radius, gravity: w.gravity, fuse: w.fuse });
  SFX.play('launcher', e.isBot ? origin : null);
}
// 矢を放つ（プレイヤー・CPU共通）
function shootArrow(e, dir, origin) {
  const w = e.w, k = (e.draw * e.draw + 2 * e.draw) / 3;   // マイクラと同じ引きの効き方
  const sp = currentSpread(e);
  const d = dir.clone().add(new V3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(rand(0, sp))).normalize();
  const homing = e.skillT > 0 && e.skill.type === 'homing';
  if (homing) e.skillT = 0;
  Arrows.fire({
    owner: e, target: e === player ? bot : player, pos: origin,
    vel: d.multiplyScalar(homing ? Math.min(e.skill.speed, lerp(w.speedMin, w.speedMax, k)) : lerp(w.speedMin, w.speedMax, k)),
    dmg: lerp(w.dmgMin, w.dmg, k), head: w.head, gravity: w.gravity, drag: w.drag || 0, homing, turn: e.skill.turn || 0, full: e.draw >= 1,
  });
  e.cd = w.rate; e.draw = 0;
  SFX.play('bow', e.isBot ? origin : null);
  if (!e.isBot) aiHear(e.pos, 20);
}
function shootPlayerArrow() {
  const p = player;
  cam.updateMatrixWorld();
  const dir = new V3(0, 0, -1).applyQuaternion(cam.quaternion);
  shootArrow(p, dir, eyeOf(p).addScaledVector(dir, 0.6));
  stats.shots++;
  VM.kick = 0.6; view.shake = Math.max(view.shake, 0.08);
}
// しばらく被弾しないと回復
function regenTick(e, dt) {
  e.sinceHit += dt;
  if (!e.dead && e.sinceHit > RULES.regenDelay && e.hp < e.def.hp) { e.hp = Math.min(e.def.hp, e.hp + RULES.regenRate * dt); e.regen = true; }
  else e.regen = false;
}

function damageBot(res) {
  bot.hp -= res.dmg; bot.sinceHit = 0;
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
