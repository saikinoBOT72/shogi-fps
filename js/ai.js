// CPU
'use strict';

// ================= CPU =================
function steer(e, dir) {
  if (dir.lengthSq() < 1e-6) return dir;
  const o = new V3(e.pos.x, e.pos.y + 0.5, e.pos.z);
  const free = d => { ray.set(o, d); ray.far = 1.8; const h = ray.intersectObjects(propMeshes, true).length === 0; ray.far = Infinity; return h; };
  if (free(dir)) return dir;
  for (const a of [0.6, -0.6, 1.2, -1.2, 1.8, -1.8]) {
    const d = dir.clone().applyAxisAngle(new V3(0, 1, 0), a * (e.strafe || 1));
    if (free(d)) return d;
  }
  return dir;
}
// まっすぐ歩いて行けるか
function reachable(e, from, to) {
  const d = to.clone().sub(from); d.y = 0;
  const len = d.length();
  if (len < 0.01) return true;
  ray.set(new V3(from.x, e.pos.y + 0.5, from.z), d.normalize()); ray.far = len + e.radius;
  const hit = ray.intersectObjects(propMeshes, true).length > 0;
  ray.far = Infinity;
  return !hit;
}
// 障害物を回り込むための中継地点（相手が見える場所を優先）
function pickWaypoint(e, target, targetEye) {
  let best = null, bs = Infinity;
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * Math.PI * 2;
    for (const r of [2.5, 5, 8]) {
      const x = e.pos.x + Math.cos(a) * r, z = e.pos.z + Math.sin(a) * r;
      if (insideCollider(x, z, e.radius + 0.15)) continue;
      const p = new V3(x, 0, z);
      if (!reachable(e, e.pos, p)) continue;
      let s = p.distanceTo(target);
      if (targetEye && hasLOS(new V3(x, e.eyeH, z), targetEye)) s -= 6;
      if (s < bs) { bs = s; best = p; }
    }
  }
  return best;
}
function findCover(e, from) {
  let best = null, bd = Infinity;
  for (let i = 0; i < 22; i++) {
    const a = rand(0, Math.PI * 2), r = rand(2.5, 11);
    const x = e.pos.x + Math.cos(a) * r, z = e.pos.z + Math.sin(a) * r;
    if (insideCollider(x, z, e.radius + 0.2)) continue;
    if (hasLOS(new V3(x, e.eyeH, z), from)) continue;
    if (r < bd) { bd = r; best = new V3(x, 0, z); }
  }
  return best;
}

function updateBot(dt) {
  const b = bot, D = DIFFS[settings.diff];
  const wish = new V3();
  if (state === 'fight' && !b.dead) {
    const pEye = eyeOf(player), bEye = eyeOf(b);
    const toP = player.pos.clone().sub(b.pos); toP.y = 0;
    const dist = toP.length(); toP.normalize();
    const los = !player.dead && hasLOS(bEye, pEye);
    if (los) { b.seen += dt; b.lostT = 0; b.lastKnown.copy(player.pos); }
    else { b.seen = Math.max(0, b.seen - dt * 2); b.lostT += dt; }

    b.strafeT -= dt;
    const aimedAt = new V3(0, 0, -1).applyQuaternion(cam.quaternion).dot(bEye.clone().sub(pEye).normalize()) > 0.995;
    if (b.strafeT <= 0 || (aimedAt && Math.random() < dt * 2)) { b.strafe *= Math.random() < 0.7 ? -1 : 1; b.strafeT = rand(0.5, 1.6); }
    const side = new V3(-toP.z, 0, toP.x).multiplyScalar(b.strafe);

    // 状態の決定
    const wantCover = los && (b.reloading > 0 || (b.hp < 30 && player.hp > b.hp && b.ammo < 5));
    if (wantCover) {
      b.coverT -= dt;
      if (!b.coverPt || b.coverT <= 0) { b.coverPt = findCover(b, pEye); b.coverT = 0.6; }
    } else b.coverPt = null;

    if (b.coverPt) {
      wish.copy(b.coverPt).sub(b.pos).setY(0);
      if (wish.length() < 0.5) wish.set(0, 0, 0);
    } else if (los) {
      const pref = b.w.pref;
      wish.addScaledVector(toP, dist > pref + 3 ? 1 : dist < pref - 4 ? -0.8 : 0).addScaledVector(side, 0.9);
      if ((player.reloading > 0 || dist > pref + 8) && dist > 5 && b.seen > 0.5) useSkill(b, toP);
    } else {
      // 見失ったら最後に見た場所へ。まっすぐ行けなければ中継地点を経由
      const tgt = b.lostT < 3 ? b.lastKnown : player.pos;
      b.wpT -= dt;
      if (b.wp && (b.wp.distanceTo(b.pos.clone().setY(0)) < 0.8 || b.wpT <= 0)) b.wp = null;
      if (!b.wp && !reachable(b, b.pos, tgt)) { b.wp = pickWaypoint(b, tgt, pEye); b.wpT = 1.2; }
      wish.copy(b.wp || tgt).sub(b.pos).setY(0);
      if (!b.wp && wish.length() < 1.5) wish.copy(toP).add(side);
    }
    if (wish.lengthSq() > 0) wish.normalize();
    const steered = steer(b, wish);
    b.jumpT -= dt;
    if (b.onGround && ((los && b.jumpT <= 0 && Math.random() < dt * (aimedAt ? 1.5 : 0.3)) || b.stuck > 0.6)) { tryJump(b); b.jumpT = rand(1, 2.5); }
    moveEntity(b, steered, dt);
    b.stuck = (wish.lengthSq() > 0 && b.pos.distanceTo(b.lastPos) < b.def.speed * 0.25 * dt) ? b.stuck + dt : 0;
    b.lastPos.copy(b.pos);

    // 照準：プレイヤーの位置を遅れて追いかけるので、横移動していると当てにくい
    const chest = new V3(player.pos.x, player.pos.y + player.height * 0.62, player.pos.z);
    b.aimPt.lerp(chest, 1 - Math.exp(-D.track * dt));
    weaponTick(b, dt);
    b.fireDelay -= dt;
    if (los && b.seen > D.react && canFire(b) && b.fireDelay <= 0 && !b.coverPt && b.skillT <= 0) {
      const aim = b.aimPt.clone().sub(bEye).normalize();
      const err = D.err + (player.skillT > 0 ? 0.08 : 0) + (player.onGround ? 0 : 0.02);
      aim.add(new V3(rand(-err, err), rand(-err, err), rand(-err, err))).normalize();
      botActor.root.updateMatrixWorld(true);
      const muzzle = botActor.gun.muzzle.getWorldPosition(new V3());
      const res = fire(b, player, bEye, muzzle, aim);
      b.fireDelay = rand(...D.gap);
      b.flashT = 0.05;
      SFX.play('shot', muzzle);
      if (res.dmg > 0) damagePlayer(res.dmg, b.pos);
      else if (res.miss) {
        ray.set(bEye, res.miss);
        const cd = ray.ray.distanceToPoint(pEye);
        if (cd < 1.6 && bEye.distanceTo(pEye) < res.wallDist) SFX.play('whiz', pEye.clone().addScaledVector(res.miss, 1));
      }
    } else if (b.ammo <= 0) startReload(b);
    else if (!los && b.ammo < b.w.mag * 0.5) startReload(b);
  } else {
    weaponTick(b, dt);
    moveEntity(b, wish, dt);
  }
  b.skillCd = Math.max(0, b.skillCd - dt);
}

function damagePlayer(dmg, from) {
  player.hp -= dmg; stats.taken += dmg;
  hud.hurt = 0.85;
  view.shake = Math.max(view.shake, 0.35);
  view.pitch += rand(0.005, 0.015); view.yaw += rand(-0.01, 0.01);
  addDamageDir(from);
  SFX.play('hurt');
  if (player.hp <= 0 && !player.dead) killPlayer();
}

// 体当たり
function checkRam(a, b, onHit) {
  if (a.skillT <= 0 || a.rammed || a.dead || b.dead) return;
  const d = Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z);
  if (d > a.radius + b.radius + 0.35) return;
  a.rammed = true; a.skillT = 0; a.vel.multiplyScalar(-0.2);
  b.vel.copy(a.skillDir).multiplyScalar(14); b.vy = 5; b.onGround = false;
  SFX.play('ram');
  view.shake = Math.max(view.shake, 0.6);
  onHit(a.skill.ram);
}
