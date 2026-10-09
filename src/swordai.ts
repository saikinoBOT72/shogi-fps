// 刀を使う CPU（相手の駒が侍のとき）：侍と同じ技を全部使う
//   ・遠い：一閃の斬撃を飛ばす。見えていて遠ければ、瞬を溜めて一気に詰める（届く分だけ溜める）
//   ・近い：長押しの連撃（2〜4段のどこまで続けるかは毎回変える）
//   ・撃たれると：守りの構え（被ダメ半分・遅い）で受けながら近づく
//   ・刀の届かない少し先（4〜8m）に相手がいるとき：竜巻で引き寄せて斬りかかる
// 刀の入力は自分と同じ Sword.input（押す・離す・右クリック）で動かす
import * as THREE from 'three';
import { DIFFS, V3, clamp, rand, settings } from './core';
import { act, eyeOf, hasLOS, moveEntity, player, tryJump, useSkill, weaponTick } from './game';
import { navNext, steer } from './ai';
import { Sword } from './sword';

const BLINK = 0, PULL = 1;   // スキルの枠（侍：E 瞬・Q 竜巻）
const ready = s => s && s.charges > 0 && !(s.t > 0);

export function swordTick(b, dt) {
  const s = b.bs || (b.bs = { waveCd: 1, guardT: 0, hideT: 0, strafe: 1, strafeT: 0, charge: -1, chargeTo: 0, hold: false, holdTo: 0, tap: false, stuckT: 0, last: b.pos.clone() });
  const D = DIFFS[settings.diff], T = player;
  const bEye = eyeOf(b), pEye = eyeOf(T);
  const toP = T.pos.clone().sub(b.pos).setY(0), dist = toP.length();
  toP.normalize();
  const los = !T.dead && hasLOS(bEye, pEye) && !Sword.hidden(T) && !(act(T, 'cloak') && dist > 3) && !(b.blindT > 0);
  if (los) { b.lastKnown.copy(T.pos); b.lostT = 0; b.seen += dt; } else { b.lostT += dt; b.seen = 0; }
  if (b.blindT > 0) b.blindT -= dt;
  // 狙い：相手の胸を、少し遅れて追う（難易度の追いつく速さの 1.3 倍）
  const seenAt = los ? T.pos : b.lastKnown;
  b.aimPt.lerp(new V3(seenAt.x, seenAt.y + T.height * 0.6, seenAt.z), 1 - Math.exp(-D.track * 1.3 * dt));
  weaponTick(b, dt);
  s.waveCd -= dt; s.guardT -= dt; s.strafeT -= dt; b.hurtT = Math.max(0, (b.hurtT || 0) - dt);
  const sw = b.sw || { stage: 0 }, swinging = !!sw.stage;
  let down = false, right = false;
  const wish = new V3();

  // ---------- 竜巻で引き寄せて斬る ----------
  const pull = b.slots[PULL];
  if (ready(pull) && pull.sk.type === 'tornado' && los && dist > 4 && dist < pull.sk.radius - 0.5 && !swinging && s.charge < 0 && Math.random() < dt * 2) {
    useSkill(b, PULL, toP);
    s.hold = true; s.holdTo = 3 + Math.floor(Math.random() * 2);   // 寄ってきたところへ連撃
  }

  // ---------- 瞬：溜めてから詰める ----------
  const blink = b.slots[BLINK], sk = blink.sk;
  if (s.charge < 0 && ready(blink) && los && dist > 10 && !swinging && b.onGround && Math.random() < dt * 1.2) {
    // 相手の手前（約2m）まで届く分だけ溜める
    const need = clamp((dist - 2.5 - sk.minDist) / (sk.maxDist - sk.minDist), 0, 1);
    s.charge = 0; s.chargeTo = need * sk.chargeMax;
  }
  if (s.charge >= 0) {
    s.charge += dt;
    b.blinkCharging = true;
    if (!los && b.lostT > 0.6) s.charge = -1;   // 見失ったらやめる
    else if (s.charge >= s.chargeTo) {
      b.blinkK = s.chargeTo / sk.chargeMax;
      b.skillAim = pEye.clone().sub(bEye).normalize();
      useSkill(b, BLINK, toP);
      b.skillAim = null; s.charge = -1;
      s.hold = true; s.holdTo = 2 + Math.floor(Math.random() * 3);   // 着いたら連撃
    }
  } else b.blinkCharging = false;

  // ---------- 刀 ----------
  if (s.charge < 0) {
    if (!s.hold && !swinging && los && dist < 3.4) { s.hold = true; s.holdTo = 2 + Math.floor(Math.random() * 3); }
    if (s.hold) {
      down = true;
      if (sw.stage >= s.holdTo || (!swinging && dist > 6)) { s.hold = false; down = false; }
    } else if (los && dist > 5 && dist < 45 && !swinging && s.waveCd <= 0 && b.seen > D.react) {
      // 一閃の斬撃（1 フレームだけ押す）
      down = !s.tap; s.tap = !s.tap;
      if (!down) s.waveCd = rand(0.9, 1.8);
    }
    // 撃たれたら守りの構え（近いときは構えず斬り合う）
    if (b.hurtT > 0.8 && dist > 4 && !swinging && !s.hold && Math.random() < 0.6) s.guardT = rand(0.6, 1.3);
    if (s.guardT > 0 && !s.hold) { right = true; down = false; }
  }

  // ---------- 動き ----------
  if (s.charge < 0) {
    // 相手へ向かう。まっすぐ行けなければ経路探索（ふつうの CPU と同じ navNext）。見失って 3 秒たったら相手の今の場所へ
    const tgt = los || b.lostT < 3 ? b.lastKnown : T.pos;
    if (dist > 2.6 || !los) {
      const next = navNext(b, tgt, dt, pEye);
      wish.copy(next || tgt).sub(b.pos).setY(0);
      if (!next && !los && wish.length() < 1.2) wish.set(0, 0, 0);
    } else if (dist < 1.6) wish.copy(toP).negate();
    if (los) {
      // 中距離では横へ揺れて弾を避けながら詰める
      if (dist > 5 && dist < 16) {
        if (s.strafeT <= 0) { s.strafe = Math.random() < 0.5 ? -1 : 1; s.strafeT = rand(0.5, 1.3); }
        wish.add(new V3(-toP.z, 0, toP.x).multiplyScalar(s.strafe * 0.8));
      }
    }
  }
  finish(b, wish, dt, down, right);
}

// 壁や島の縁を避けて動き、刀の入力を渡す
function finish(b, wish: THREE.Vector3, dt: number, down: boolean, right: boolean) {
  const s = b.bs;
  // 壁・崖・島の縁はふつうの CPU と同じ steer で避ける
  if (wish.lengthSq() > 1e-4) wish.normalize();
  const steered = steer(b, wish);
  // 引っかかったら跳ぶ・行き止まりの壁は登る
  const moved = b.pos.distanceTo(s.last); s.last.copy(b.pos);
  s.stuckT = wish.lengthSq() > 0 && moved < dt * 0.8 ? s.stuckT + dt : 0;
  if (s.stuckT > 0.4 && b.onGround) { tryJump(b); s.stuckT = 0; }
  b.wantClimb = !!(b.wallN && steered.dot(b.wallN) < -0.2 && (s.stuckT > 0.2 || player.pos.y > b.pos.y + 0.8));
  b.speedMul = (b.swGuard ? 0.35 : 1) * (b.blinkCharging ? 0.5 : 1);
  moveEntity(b, steered, dt);
  Sword.input(b, down, right);
}
