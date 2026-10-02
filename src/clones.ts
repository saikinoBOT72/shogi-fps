// 影分身（侍のスキル）：自分のまわり 6 方向に分身を出す。分身は自分と同じ動きをする（Apex のミラージュのウルトのように）
//   ・分身は輪の外側を向いて出る。出た瞬間に向いている方向を「前」として、自分の動きをまねる
//     （自分が前へ歩けば、分身はそれぞれの前へ歩く。自分が右を向けば、分身もそれぞれ右を向く）。刀の振りも同じ
//     自分の動き・向きを、分身ごとの角度（off：自分の向きから見た分身の向き）だけ回してまねる。壁に当たった分身はそこで止まる
//   ・撃たれる・斬られる・斬撃が当たると煙になって消える。ダメージは与えない
//   ・CPU は出た瞬間に「どれが本物か」を思い込み、思い込んだ分身を狙う（7 つから選ぶので本物を当てるのは 1/7）
//     狙っていた分身が消えたら、残りの中から選び直す
//   ・オンライン：スキルを使った知らせ（'skill'）で相手の画面にも同じように出る。こちらが消した分身は 'cpop' で相手に知らせる
import * as THREE from 'three';
import { V3, PIECES, WEAPONS, SKILLS } from './core';
import { P } from './palette';
import { SFX } from './audio';
import { Particles, buildActor } from './effects';
import { floorBelow, insideCollider } from './world';
import { player, bot, view } from './game';
import { animateActor } from './camera';
import { Net } from './net';
import { Sword } from './sword';

type Clone = { i: number; A: any; e: any; alive: boolean; off: number };
type Group = { owner: any; list: Clone[]; t: number; last: THREE.Vector3; believed: number };
const UP = new V3(0, 1, 0);
const groups = new Map<any, Group>();   // 持ち主（player / bot）ごと
const pools = new Map<string, any[]>();  // 駒の見た目（使い回す）

function actorsFor(type: string, n: number) {
  let pool = pools.get(type);
  if (!pool) pools.set(type, pool = []);
  while (pool.length < n) {
    const d = PIECES[type], A = buildActor(d.name, d.size, WEAPONS[d.weapon].model);
    A.root.visible = false; pool.push(A);
  }
  return pool;
}
// 向いている向き（水平）
function facing(owner) {
  if (owner === player) return new V3(-Math.sin(view.yaw), 0, -Math.cos(view.yaw));
  const d = owner.aimPt ? owner.aimPt.clone().sub(owner.pos).setY(0) : new V3(0, 0, 1);
  return d.lengthSq() > 1e-4 ? d.normalize() : new V3(0, 0, 1);
}
// 分身の駒の様子（animateActor に渡すための、駒と同じ形の入れ物）
const fake = (owner, pos: THREE.Vector3) => ({ pos, vel: new V3(), vy: 0, onGround: true, def: owner.def, slots: [], stepPhase: Math.random() * 6, flashT: 0, draw: 0, cd: 0, isBot: false, height: owner.height, radius: owner.radius, eyeH: owner.eyeH, dead: false });

function pop(g: Group, c: Clone, quiet = false) {
  if (!c.alive) return;
  c.alive = false; c.A.root.visible = false;
  const p = c.e.pos.clone().setY(c.e.pos.y + c.e.height * 0.5);
  Particles.dust(c.e.pos, 14, 1.6);
  for (let k = 0; k < 10; k++) Particles.glow(p.clone().add(new V3(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).multiplyScalar(c.e.height * 0.8)), P.sumi[2]);
  if (!quiet) SFX.play('clonePop', p);
  // CPU が狙っていた分身なら、残りの中から選び直す
  if (g.believed === c.i) pickBelief(g);
}
function pickBelief(g: Group) {
  const alive = g.list.filter(c => c.alive).map(c => c.i);
  const n = Math.floor(Math.random() * (alive.length + 1));
  g.believed = n < alive.length ? alive[n] : -1;   // -1：本物を見ている
}

export const Clones = {
  // 分身を出す（useSkill から）
  spawn(owner) {
    Clones.clear(owner);
    const sk = SKILLS.clone, A = actorsFor(owner.type, sk.count), f = facing(owner);
    const yaw = Math.atan2(f.x, f.z), list: Clone[] = [];
    for (let i = 0; i < sk.count; i++) {
      const a = yaw + (i + 0.5) * Math.PI * 2 / sk.count;
      let pos = null;
      // 狭い所では近くに出す（どこも壁なら、自分のすぐ隣）
      for (const r of [sk.radius, sk.radius * 0.6, sk.radius * 0.35, 0.3]) {
        const x = owner.pos.x + Math.sin(a) * r, z = owner.pos.z + Math.cos(a) * r;
        if (!insideCollider(x, z, owner.radius, owner.pos.y)) { pos = new V3(x, floorBelow(x, z, owner.pos.y + 0.5), z); break; }
      }
      const c: Clone = { i, A: A[i], e: fake(owner, pos || owner.pos.clone()), alive: !!pos, off: a - yaw };
      c.A.root.visible = !!pos;
      if (pos) { Particles.dust(pos, 8, 1.2); c.A.root.position.copy(pos); c.A.root.rotation.y = a; }   // 輪の外側を向いて出る
      list.push(c);
    }
    const g: Group = { owner, list, t: sk.duration, last: owner.pos.clone(), believed: -1 };
    groups.set(owner, g);
    if (owner === player) pickBelief(g);   // CPU の思い込み
    SFX.play('cloneSpawn', owner === player ? null : owner.pos);
  },
  // 毎フレーム（ゲームの時間）：持ち主の動きをまねる
  update(dt: number) {
    for (const g of groups.values()) {
      const o = g.owner;
      g.t -= dt;
      if (g.t <= 0 || o.dead) { for (const c of g.list) pop(g, c, true); groups.delete(o); continue; }
      const step = o.pos.clone().sub(g.last); g.last.copy(o.pos);
      const air = o.pos.y - floorBelow(o.pos.x, o.pos.z, o.pos.y + 0.1);
      const f = facing(o);
      for (const c of g.list) {
        if (!c.alive) continue;
        const e = c.e, mv = step.clone().setY(0).applyAxisAngle(UP, c.off), x = e.pos.x + mv.x, z = e.pos.z + mv.z;
        if (!insideCollider(x, z, e.radius, e.pos.y)) { e.pos.x = x; e.pos.z = z; }   // 壁に当たった分身はそこで止まる
        e.pos.y = floorBelow(e.pos.x, e.pos.z, e.pos.y + 1) + Math.max(0, air);
        e.vel.set(mv.x / Math.max(dt, 1e-4), 0, mv.z / Math.max(dt, 1e-4)); e.onGround = air < 0.05;
        animateActor(c.A, e, dt, e.pos.clone().addScaledVector(f.clone().applyAxisAngle(UP, c.off), 5));
        Sword.poseClone(c.A, o);   // 刀の振りも同じ
      }
    }
  },
  // CPU が本物だと思っている分身（無ければ null＝本物を見ている）
  believed(owner) {
    const g = groups.get(owner);
    const c = g && g.believed >= 0 ? g.list[g.believed] : null;
    return c && c.alive ? c.e : null;
  },
  // 弾の線が分身に当たるか（owner：撃たれる側。max より手前だけ）
  rayHit(r: THREE.Ray, max: number, owner) {
    const g = groups.get(owner);
    if (!g) return null;
    let best = null;
    for (const c of g.list) {
      if (!c.alive) continue;
      const e = c.e, R = e.radius;
      const box = new THREE.Box3(new V3(e.pos.x - R, e.pos.y, e.pos.z - R), new V3(e.pos.x + R, e.pos.y + e.height, e.pos.z + R));
      const hp = r.intersectBox(box, new V3());
      if (!hp) continue;
      const d = hp.distanceTo(r.origin);
      if (d < max && (!best || d < best.dist)) best = { i: c.i, dist: d, point: hp };
    }
    return best;
  },
  // 点が分身の中か（斬撃）
  pointHit(p: THREE.Vector3, r: number, owner) {
    const g = groups.get(owner);
    if (!g) return -1;
    const c = g.list.find(c => c.alive && Math.hypot(p.x - c.e.pos.x, p.z - c.e.pos.z) < c.e.radius + r && p.y > c.e.pos.y - r && p.y < c.e.pos.y + c.e.height + r);
    return c ? c.i : -1;
  },
  // 刀の届く範囲の分身（いちばん近いもの）
  meleeHit(eye: THREE.Vector3, dir: THREE.Vector3, range: number, cone: number, owner, foeDist: number) {
    const g = groups.get(owner);
    if (!g) return -1;
    let best = -1, bd = foeDist;
    for (const c of g.list) {
      if (!c.alive) continue;
      const to = new V3(c.e.pos.x, c.e.pos.y + c.e.height * 0.6, c.e.pos.z).sub(eye), d = to.length();
      if (d < range + c.e.radius && d < bd && to.normalize().dot(dir) >= cone) { best = c.i; bd = d; }
    }
    return best;
  },
  // i 番の分身を消す。mine：こちらが消した（オンラインなら相手に知らせる）
  pop(owner, i: number, mine = false) {
    const g = groups.get(owner), c = g && g.list[i];
    if (!c || !c.alive) return;
    pop(g, c);
    if (mine && Net.on && owner === bot) Net.send({ t: 'cpop', i });
  },
  count(owner) { const g = groups.get(owner); return g ? g.list.filter(c => c.alive).length : 0; },
  clear(owner?) {
    for (const [o, g] of [...groups]) {
      if (owner && o !== owner) continue;
      for (const c of g.list) { c.alive = false; c.A.root.visible = false; }
      groups.delete(o);
    }
  },
};
