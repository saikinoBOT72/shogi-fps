// CPU
import { gs } from './state';
import { DIFFS, V3, clamp, lerp, rand, settings } from './core';
import { SFX } from './audio';
import { cam } from './render';
import { insideCollider, propMeshes } from './world';
import { Nav } from './nav';
import { Smoke } from './grenades';
import { bot, botActor, canFire, eyeOf, fire, fireGrenade, hasLOS, moveEntity, player, ray, regenTick, shootArrow, skillTick, startReload, stats, tryJump, useSkill, view, weaponTick } from './game';
import { addDamageDir, hud, killPlayer } from './hud';

// ================= CPU =================
export function steer(e, dir) {
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
export function reachable(e, from, to) {
  const d = to.clone().sub(from); d.y = 0;
  const len = d.length();
  if (len < 0.01) return true;
  ray.set(new V3(from.x, e.pos.y + 0.5, from.z), d.normalize()); ray.far = len + e.radius;
  const hit = ray.intersectObjects(propMeshes, true).length > 0;
  ray.far = Infinity;
  return !hit;
}
// 障害物を回り込むための中継地点（相手が見える場所を優先）
export function pickWaypoint(e, target, targetEye) {
  let best = null, bs = Infinity;
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * Math.PI * 2;
    for (const r of [2.5, 5, 8]) {
      const x = e.pos.x + Math.cos(a) * r, z = e.pos.z + Math.sin(a) * r;
      if (insideCollider(x, z, e.radius + 0.15, e.pos.y)) continue;
      const p = new V3(x, 0, z);
      if (!reachable(e, e.pos, p)) continue;
      let s = p.distanceTo(target);
      if (targetEye && hasLOS(new V3(x, e.pos.y + e.eyeH, z), targetEye)) s -= 6;
      if (s < bs) { bs = s; best = p; }
    }
  }
  return best;
}
// その位置に立ったとき、体のどこか（頭・胸・足・左右の端）が from から見えるか（煙は隠れ場所にならない）
export function bodyVisible(pos, e, from) {
  const side = new V3(-(from.z - pos.z), 0, from.x - pos.x).normalize().multiplyScalar(e.radius * 0.9);
  const pts = [0.92, 0.6, 0.25].map(k => new V3(pos.x, pos.y + e.height * k, pos.z));
  pts.push(pts[1].clone().add(side), pts[1].clone().sub(side));
  return pts.some(p => hasLOS(from, p, true));
}
// 経路探索で次に向かう点（まっすぐ行けるなら null）
export function navNext(b, tgt, dt, pEye) {
  if (Math.abs(tgt.y - b.pos.y) < 0.6 && reachable(b, b.pos, tgt)) { b.path = null; return null; }
  b.pathT = (b.pathT || 0) - dt;
  if (!b.path || b.pathT <= 0 || !b.pathGoal || b.pathGoal.distanceTo(tgt) > 3) {
    b.path = Nav.find(b.pos, tgt); b.pathI = 0; b.pathT = 1.5; b.pathGoal = tgt.clone();
  }
  if (!b.path || !b.path.length) {
    // 道が見つからない（相手が高い所など）：近くの中継地点へ。着いたら壁を登る
    b.wpT -= dt;
    if (b.wp && (Math.hypot(b.wp.x - b.pos.x, b.wp.z - b.pos.z) < 0.8 || b.wpT <= 0)) b.wp = null;
    if (!b.wp) { b.wp = pickWaypoint(b, tgt, pEye); b.wpT = 1.2; }
    return b.wp;
  }
  // 通り過ぎた点・見通せる先の点は飛ばす
  for (let n = 0; n < 6 && b.pathI < b.path.length - 1; n++) {
    const p = b.path[b.pathI], q = b.path[b.pathI + 1];
    if (Math.hypot(p.x - b.pos.x, p.z - b.pos.z) < 0.7 || (Math.abs(q.y - b.pos.y) < 0.2 && Math.abs(p.y - b.pos.y) < 0.2 && reachable(b, b.pos, q))) b.pathI++;
    else break;
  }
  return b.path[b.pathI];
}
export function findCover(e, from) {
  let best = null, bd = Infinity;
  for (let i = 0; i < 22; i++) {
    const a = rand(0, Math.PI * 2), r = rand(2.5, 11);
    const x = e.pos.x + Math.cos(a) * r, z = e.pos.z + Math.sin(a) * r;
    if (insideCollider(x, z, e.radius + 0.2, e.pos.y)) continue;
    if (bodyVisible(new V3(x, e.pos.y, z), e, from)) continue;   // 体が少しでも見える所は隠れ場所にしない
    if (r < bd) { bd = r; best = new V3(x, 0, z); }
  }
  return best;
}

export function updateBot(dt) {
  const b = bot, D = DIFFS[settings.diff];
  const wish = new V3();
  if (gs.state === 'fight' && !b.dead) {
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
    // HPが減っていて見つかっていないなら回復を待つ。回復したか、見つかったら再開
    if (!los && b.hp < b.def.hp * 0.5 && P !== PERSONAS.rush) b.healing = true;
    if (b.hp >= b.def.hp * 0.9 || (los && b.hurtT > 0)) b.healing = false;
    const wantCover = los && (b.reloading > 0 || (b.hp < P.coverHp && player.hp > b.hp && b.ammo < b.w.mag * 0.4));
    if (wantCover) {
      b.coverT -= dt;
      if (!b.coverPt || b.coverT <= 0) { b.coverPt = findCover(b, pEye); b.coverT = 0.6; }
    } else b.coverPt = null;

    const guarding = b.skillT > 0 && b.skill.type === 'guard';
    if (guarding) {
      // 構えている間はまっすぐ詰める
      wish.copy(toP);
    } else if (b.coverPt) {
      wish.copy(b.coverPt).sub(b.pos).setY(0);
      if (wish.length() < 0.5) { wish.set(0, 0, 0); if (bodyVisible(b.pos, b, pEye)) b.coverT = 0; }   // 着いても見えていたら探し直す
    } else if (los) {
      wish.addScaledVector(toP, dist > pref + 3 ? 1 : dist < pref - 4 ? -0.8 : 0).addScaledVector(side, 0.9);
    } else if (b.healing) {
      // 回復待ち：体がはみ出していたり煙の中なら、ちゃんと隠れられる所へ移ってから待つ
      b.coverT -= dt;
      if (bodyVisible(b.pos, b, pEye) || Smoke.inside(b.pos)) {
        if (!b.healPt || b.coverT <= 0) { b.healPt = findCover(b, pEye); b.coverT = 0.8; }
        if (b.healPt) wish.copy(b.healPt).sub(b.pos).setY(0);
        else wish.copy(toP).negate().add(side);
      } else { wish.set(0, 0, 0); b.healPt = null; }
    } else {
      // 見失ったら最後に見た場所へ。まっすぐ行けなければ中継地点を経由
      const tgt = b.lostT < 3 ? b.lastKnown : player.pos;
      const next = navNext(b, tgt, dt, pEye);
      wish.copy(next || tgt).sub(b.pos).setY(0);
      if (!next && wish.length() < 1.5) wish.copy(toP).add(side);
    }
    // 煙の中で立ち止まらない
    if (Smoke.inside(b.pos) && wish.lengthSq() < 0.05) wish.copy(side).addScaledVector(toP, 0.4);
    const skAI = SKILL_AI[b.def.skill] || SKILL_AI[b.skill.type];
    if (b.charges > 0 && skAI) skAI(b, { los, dist, toP, pref, dt, aimedAt, side });
    b.hurtT = Math.max(0, (b.hurtT || 0) - dt);
    if (wish.lengthSq() > 0) wish.normalize();
    const steered = steer(b, wish);
    b.jumpT -= dt;
    if (b.onGround && ((los && b.jumpT <= 0 && Math.random() < dt * (aimedAt ? 1.5 : 0.3) * P.jump) || b.stuck > 0.6)) { tryJump(b); b.jumpT = rand(1, 2.5); }
    // 行き止まりの壁や、相手が高い所にいるときは壁を登る
    b.wantClimb = !!(b.wallN && steered.dot(b.wallN) < -0.2 && (b.stuck > 0.2 || player.pos.y > b.pos.y + 0.8));
    moveEntity(b, steered, dt);
    b.stuck = (wish.lengthSq() > 0 && b.pos.distanceTo(b.lastPos) < b.def.speed * 0.25 * dt) ? b.stuck + dt : 0;
    b.lastPos.copy(b.pos);

    // 照準：プレイヤーの位置を遅れて追いかけるので、横移動していると当てにくい
    const chest = new V3(player.pos.x, player.pos.y + player.height * 0.62, player.pos.z);
    b.aimPt.lerp(chest, 1 - Math.exp(-D.track * dt));
    weaponTick(b, dt);
    b.fireDelay -= dt;
    const busy = b.skillT > 0 && b.skill.type !== 'homing' && b.skill.type !== 'step';
    if (b.w.kind === 'bow') {
      // 弓：引き絞ってから、相手の動きと矢の落ちを見越して放つ。追尾中は見えていなくても撃つ
      const armed = b.skillT > 0 && b.skill.type === 'homing';
      const canShoot = !b.coverPt && ((los && b.seen > D.react) || (armed && b.lostT < 3));
      if (canShoot && b.cd <= 0) {
        b.draw = Math.min(1, b.draw + dt / b.w.drawTime);
        if (!b.drawGoal) b.drawGoal = clamp(dist / 22, 0.55, 1) * rand(0.9, 1);
        if (b.draw >= b.drawGoal) {
          const tgt = los ? b.aimPt.clone() : b.lastKnown.clone().setY(b.lastKnown.y + player.height * 0.6);
          const speed = lerp(b.w.speedMin, b.w.speedMax, b.draw);
          let aim;
          if (armed) aim = tgt.sub(bEye).normalize().add(new V3(0, 0.2, 0)).normalize();
          else {
            // 偏差撃ち：飛ぶ時間ぶん先を狙い、落ちるぶん上を狙う
            let t = bEye.distanceTo(tgt) / speed;
            const lead = player.vel.clone().multiplyScalar(D.lead);
            for (let k = 0; k < 2; k++) t = bEye.distanceTo(tgt.clone().addScaledVector(lead, t)) / speed;
            const p = tgt.clone().addScaledVector(lead, t); p.y += 0.5 * b.w.gravity * t * t;
            aim = p.sub(bEye).normalize();
          }
          const err = D.err * 0.75;
          aim.add(new V3(rand(-err, err), rand(-err, err), rand(-err, err))).normalize();
          shootArrow(b, aim, bEye.clone().addScaledVector(aim, 0.7));
          b.drawGoal = 0;
          b.cd += rand(D.gap[0], D.gap[1]) * 1.2;   // 次の矢を番えるまで少し間を置く
        }
      } else if (!canShoot) b.draw = Math.max(0, b.draw - dt * 2);
    } else if (b.w.kind === 'grenade') {
      // グレネード：相手の足元へ、動きと落ちを見越して撃つ（近すぎると自分も巻き込むので撃たない）
      if (los && b.seen > D.react && canFire(b) && b.fireDelay <= 0 && !b.coverPt && !busy && dist > 3.5) {
        const tgt = player.pos.clone().setY(player.pos.y + 0.3), speed = b.w.speed;
        const lead = player.vel.clone().multiplyScalar(D.lead);
        let t = bEye.distanceTo(tgt) / speed;
        for (let k = 0; k < 2; k++) t = bEye.distanceTo(tgt.clone().addScaledVector(lead, t)) / speed;
        const p = tgt.clone().addScaledVector(lead, t); p.y += 0.5 * b.w.gravity * t * t;
        const aim = p.sub(bEye).normalize(), err = D.err * 0.6;
        aim.add(new V3(rand(-err, err), rand(-err, err), rand(-err, err))).normalize();
        fireGrenade(b, aim, bEye.clone().addScaledVector(aim, 0.7));
        b.fireDelay = rand(D.gap[0], D.gap[1]) + 0.5;
      }
    } else if (((los && b.seen > D.react + (b.w.zoom ? 0.35 : 0)) || (b.skillT > 0 && b.skill.type === 'pierce' && b.lostT < 3)) && canFire(b) && b.fireDelay <= 0 && !b.coverPt && !busy) {
      // 貫き準備中は、見えていなくても最後に見た場所へ撃ち込む
      const aimTgt = los ? b.aimPt : b.lastKnown.clone().setY(b.lastKnown.y + player.height * 0.6);
      const aim = aimTgt.clone().sub(bEye).normalize();
      const err = D.err + (player.skillT > 0 && player.skill.type === 'dash' ? 0.08 : 0) + (player.onGround ? 0 : 0.02);
      aim.add(new V3(rand(-err, err), rand(-err, err), rand(-err, err))).normalize();
      botActor.root.updateMatrixWorld(true);
      const muzzle = botActor.gun.muzzle.getWorldPosition(new V3());
      const res = fire(b, player, bEye, muzzle, aim);
      // 連射武器は数発ずつ撃つ（バースト）
      if (b.w.auto) {
        if (!(b.burst > 0)) { b.burst = 3 + Math.floor(Math.random() * 5); b.burstN = b.burst; }
        b.burst--;
        // バーストの合間も、1秒あたりのダメージが上限を超えないよう間を空ける
        b.fireDelay = b.burst > 0 ? rand(0, 0.03) : Math.max(rand(D.gap[0], D.gap[1]) + 0.15, b.burstN * b.w.dmg / D.dps - b.burstN * b.w.rate);
      } else {
        b.fireDelay = rand(D.gap[0], D.gap[1]) + (b.w.zoom ? 0.9 : 0);
        // 1発が重い武器は、1秒あたりのダメージが上限を超えないよう間を空ける
        const perShot = b.w.dmg * (b.w.pellets ? b.w.pellets * 0.5 : 1);
        b.fireDelay = Math.max(b.fireDelay, perShot / D.dps - b.w.rate);
      }
      b.flashT = 0.05;
      SFX.play('shot', muzzle, b.w.model);
      if (res.dmg > 0) damagePlayer(res.dmg, b.pos);
      else if (res.miss) {
        ray.set(bEye, res.miss);
        const cd = ray.ray.distanceToPoint(pEye);
        if (cd < 1.6 && bEye.distanceTo(pEye) < res.wallDist) SFX.play('whiz', pEye.clone().addScaledVector(res.miss, 1));
      }
    } else if (b.w.kind !== 'bow' && b.ammo <= 0) startReload(b);
    else if (b.w.kind !== 'bow' && !los && b.ammo < b.w.mag * 0.5) startReload(b);
  } else {
    weaponTick(b, dt);
    moveEntity(b, wish, dt);
  }
  skillTick(b, dt);
  if (gs.state === 'fight') regenTick(b, dt);
}

// スキルごとのCPUの使い方
export const SKILL_AI = {
  // 突撃：相手がリロード中、または遠いときに一気に詰める（突撃型ほど積極的）
  charge(b, c) {
    if (c.los && c.dist > 5 && b.seen > 0.5 && (player.reloading > 0 || c.dist > c.pref + 8 / b.persona.eager)) useSkill(b, c.toP);
  },
  // すり足：狙われている・撃たれたときに横へ逃げる
  step(b, c) {
    if (c.los && b.skillT <= 0 && (b.hurtT > 0.9 || (c.aimedAt && Math.random() < c.dt * 3 * b.persona.eager))) useSkill(b, c.side);
  },
  // 追尾：隠れた相手を曲がる矢で追い出す。見えていても時々使う
  homing(b, c) {
    if (b.skillT > 0) return;
    if ((!c.los && b.lostT > 0.4 && b.lostT < 2.5) || (c.los && c.dist > 10 && Math.random() < c.dt * 0.25 * b.persona.eager)) useSkill(b, c.toP);
  },
  // 桂跳び：中距離から飛びかかって着地の衝撃を当てる。見失ったときも跳んで回り込む
  leap(b, c) {
    if (b.skillT > 0 || !b.onGround) return;
    if ((c.los && c.dist > 5 && c.dist < 15 && Math.random() < c.dt * 0.7 * b.persona.eager) || (!c.los && b.stuck > 0.4)) useSkill(b, c.toP);
  },
  // 煙幕：撃たれてHPが減ってきたら煙を張って身を隠す
  smoke(b, c) {
    if (c.los && b.hurtT > 0 && b.hp < b.def.hp * 0.6) useSkill(b, c.toP);
  },
  // 貫き：物陰に隠れた相手を壁越しに撃つ
  pierce(b, c) {
    if (b.skillT <= 0 && !c.los && b.lostT > 0.3 && b.lostT < 2.5) useSkill(b, c.toP);
  },
  // 王の意地：HPが減ったら回復
  heal(b, c) {
    if (b.skillT <= 0 && b.hp < b.def.hp * 0.45) useSkill(b, c.toP);
  },
  // 守りの構え：撃たれているのに遠いとき、構えて距離を詰める
  guard(b, c) {
    if (c.los && c.dist > c.pref + 2 && b.seen > 0.3 && (b.hurtT > 0 || Math.random() < c.dt * 0.4 * b.persona.eager)) useSkill(b, c.toP);
  },
};
// CPUの性格（対局ごとにランダム）：prefAdd 間合いの増減 / coverHp 隠れ始めるHP / eager スキルの積極さ / jump ジャンプの多さ
export const PERSONAS = {
  rush:    { name: '突撃型',     prefAdd: -4, coverHp: 15, eager: 1.8, jump: 1.6 },
  careful: { name: '慎重型',     prefAdd: 4,  coverHp: 45, eager: 0.6, jump: 0.6 },
  normal:  { name: 'バランス型', prefAdd: 0,  coverHp: 30, eager: 1,   jump: 1 },
};
// 音で気づく：見えていなくても、聞こえた位置を「最後に見た場所」にする
export function aiHear(pos, radius) {
  if (!bot || bot.dead || gs.state !== 'fight') return;
  if (bot.pos.distanceTo(pos) > radius || bot.lostT === 0) return;
  bot.lastKnown.copy(pos); bot.lostT = 0.01; bot.wp = null;
}

export function damagePlayer(dmg, from) {
  player.hp -= dmg; stats.taken += dmg; player.sinceHit = 0;
  hud.hurt = 0.85;
  view.shake = Math.max(view.shake, 0.35);
  view.pitch += rand(0.005, 0.015); view.yaw += rand(-0.01, 0.01);
  addDamageDir(from);
  SFX.play('hurt');
  if (player.hp <= 0 && !player.dead) killPlayer();
}

// 体当たり
export function checkRam(a, b, onHit) {
  if (a.skillT <= 0 || a.skill.type !== 'dash' || a.rammed || a.dead || b.dead) return;
  const d = Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z);
  if (d > a.radius + b.radius + 0.35) return;
  a.rammed = true; a.skillT = 0; a.vel.multiplyScalar(-0.2);
  b.vel.copy(a.skillDir).multiplyScalar(14); b.vy = 5; b.onGround = false;
  SFX.play('ram');
  view.shake = Math.max(view.shake, 0.6);
  onHit(a.skill.ram);
}
