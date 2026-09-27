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
    const P = b.persona, pref = Math.max(3, b.w.pref + P.prefAdd);
    const wantCover = los && (b.reloading > 0 || (b.hp < P.coverHp && player.hp > b.hp && b.ammo < b.w.mag * 0.4));
    if (wantCover) {
      b.coverT -= dt;
      if (!b.coverPt || b.coverT <= 0) { b.coverPt = findCover(b, pEye); b.coverT = 0.6; }
    } else b.coverPt = null;

    if (b.coverPt) {
      wish.copy(b.coverPt).sub(b.pos).setY(0);
      if (wish.length() < 0.5) wish.set(0, 0, 0);
    } else if (los) {
      wish.addScaledVector(toP, dist > pref + 3 ? 1 : dist < pref - 4 ? -0.8 : 0).addScaledVector(side, 0.9);
    } else {
      // 見失ったら最後に見た場所へ。まっすぐ行けなければ中継地点を経由
      const tgt = b.lostT < 3 ? b.lastKnown : player.pos;
      b.wpT -= dt;
      if (b.wp && (b.wp.distanceTo(b.pos.clone().setY(0)) < 0.8 || b.wpT <= 0)) b.wp = null;
      if (!b.wp && !reachable(b, b.pos, tgt)) { b.wp = pickWaypoint(b, tgt, pEye); b.wpT = 1.2; }
      wish.copy(b.wp || tgt).sub(b.pos).setY(0);
      if (!b.wp && wish.length() < 1.5) wish.copy(toP).add(side);
    }
    if (b.skillCd <= 0 && SKILL_AI[b.def.skill]) SKILL_AI[b.def.skill](b, { los, dist, toP, pref });
    b.hurtT = Math.max(0, (b.hurtT || 0) - dt);
    if (wish.lengthSq() > 0) wish.normalize();
    const steered = steer(b, wish);
    b.jumpT -= dt;
    if (b.onGround && ((los && b.jumpT <= 0 && Math.random() < dt * (aimedAt ? 1.5 : 0.3) * P.jump) || b.stuck > 0.6)) { tryJump(b); b.jumpT = rand(1, 2.5); }
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

// スキルごとのCPUの使い方
const SKILL_AI = {
  // 突撃：相手がリロード中、または遠いときに一気に詰める（突撃型ほど積極的）
  charge(b, c) {
    if (c.los && c.dist > 5 && b.seen > 0.5 && (player.reloading > 0 || c.dist > c.pref + 8 / b.persona.eager)) useSkill(b, c.toP);
  },
};
// CPUの性格（対局ごとにランダム）：prefAdd 間合いの増減 / coverHp 隠れ始めるHP / eager スキルの積極さ / jump ジャンプの多さ
const PERSONAS = {
  rush:    { name: '突撃型',     prefAdd: -4, coverHp: 15, eager: 1.8, jump: 1.6 },
  careful: { name: '慎重型',     prefAdd: 4,  coverHp: 45, eager: 0.6, jump: 0.6 },
  normal:  { name: 'バランス型', prefAdd: 0,  coverHp: 30, eager: 1,   jump: 1 },
};
// 音で気づく：見えていなくても、聞こえた位置を「最後に見た場所」にする
function aiHear(pos, radius) {
  if (!bot || bot.dead || state !== 'fight') return;
  if (bot.pos.distanceTo(pos) > radius || bot.lostT === 0) return;
  bot.lastKnown.copy(pos); bot.lostT = 0.01; bot.wp = null;
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
