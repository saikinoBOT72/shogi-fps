// 忍：手裏剣（連打で1枚ずつ）。長押しの苦無・残像疾風・変わり身はこのあと足していく
//   投げた手裏剣は arrows.ts（kind 'shuriken'）が飛ばし、当たり・刺さりも矢と同じ仕組み
//   オンライン：投げた手裏剣は矢と同じ 'arrow' の知らせ（k: 'shuriken'）で相手の画面にも飛ぶ
import * as THREE from 'three';
import { V3 } from './core';
import { SFX } from './audio';
import { cam } from './render';
import { blockers } from './physics';
import { Arrows } from './arrows';
import { VM } from './effects';
import { Net, r2, vec } from './net';
import { aiHear } from './ai';
import { heardFoe } from './hud';
import { bot, botActor, player, playerActor, stats, view, onAttack, eyeOf, ray, currentSpread } from './game';

const ROLL = -0.35, TILT = 0.75;   // 右手で横に投げるので少し右下がり。面も前へ倒す（投げた人からも相手からも、回る星の形が見えるように）
const BUFFER = 0.12;  // 投げられるようになる少し前に押しても、間に合ったら投げる

// 照準の先（壁・相手に当たる所。何もなければ遠く）
function aimPoint(eye: THREE.Vector3, dir: THREE.Vector3) {
  ray.set(eye, dir); ray.far = 150;
  const w = ray.intersectObjects(blockers, true)[0];
  let d = w ? w.distance : 150;
  const h = !bot.dead && botActor && ray.intersectObject(botActor.hitMesh, false)[0];
  if (h && h.distance < d) d = h.distance;
  ray.far = Infinity;
  return eye.clone().addScaledVector(dir, Math.max(d, 2));
}

// 手裏剣を1枚投げる（プレイヤー・CPU 共通）
export function throwStar(e, dir: THREE.Vector3, origin: THREE.Vector3) {
  const w = e.w, sp = currentSpread(e);
  const d = dir.clone().add(new V3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(Math.random() * sp)).normalize();
  Arrows.fire({ owner: e, target: e === player ? bot : player, pos: origin, vel: d.multiplyScalar(w.speed), dmg: w.dmg, head: w.head, gravity: w.gravity, drag: w.drag || 0,
    homing: false, turn: 0, full: false, kind: 'shuriken', roll: ROLL, tilt: TILT });
  if (Net.on && e === player) { const a = Arrows.last(); Net.send({ t: 'arrow', p: vec(a.pos), v: vec(a.vel), dmg: r2(a.dmg), hd: a.head, g: a.gravity, dr: a.drag, k: 'shuriken', ro: ROLL, ti: TILT }); }
  e.cd = w.rate; e.njThrowT = 0;
  onAttack(e);
  SFX.play('swing', e.isBot ? origin : null, !e.isBot);
  if (e.isBot) heardFoe(origin, 'shot'); else aiHear(e.pos, 14);
}

export const Ninja = {
  // 自分：押した瞬間に1枚（押しっぱなしでは続けて投げない）
  input(p, down: boolean, dt: number) {
    if (down && !p.njHeld) p.njBuf = BUFFER;
    p.njHeld = down;
    p.njBuf = (p.njBuf || 0) - dt;
    if (p.njBuf > 0 && p.cd <= 0) {
      p.njBuf = 0;
      cam.updateMatrixWorld();
      const look = new V3(0, 0, -1).applyQuaternion(cam.quaternion);
      const target = aimPoint(eyeOf(p), look);
      const origin = cam.localToWorld(new V3(0.16, -0.1, -0.45));   // 右手のあたりから照準の先へ
      throwStar(p, target.sub(origin).normalize(), origin);
      stats.shots++;
      VM.fire(p.w);
      view.shake = Math.max(view.shake, 0.05);
    }
  },
  // CPU：狙った所（aim）へ1枚
  aiThrow(b, aim: THREE.Vector3) {
    const eye = eyeOf(b);
    throwStar(b, aim, eye.addScaledVector(aim, 0.6));
  },
  // 毎フレーム：駒が持つ手裏剣（ほかの人から見える）。投げた直後は手から消え、手首を振る
  update(dt: number) {
    for (const [e, A] of [[player, playerActor], [bot, botActor]] as any[]) {
      if (!e || !A || e.w.kind !== 'ninja' || !A.gun.parts.star) continue;
      e.njThrowT = Math.min(1, (e.njThrowT ?? 1) + dt);
      const t = e.njThrowT;
      A.gun.parts.star.visible = !(t > 0.04 && t < 0.2);
      A.gun.parts.rhand.rotation.y = t < 0.06 ? t / 0.06 * 0.6 : t < 0.16 ? 0.6 - (t - 0.06) / 0.1 * 1.4 : t < 0.34 ? -0.8 * (1 - (t - 0.16) / 0.18) : 0;
    }
  },
  clear() { if (player) player.njHeld = false; },
};
