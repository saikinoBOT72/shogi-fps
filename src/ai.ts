// 一騎打ちの CPU：見つける・追う・撃つ・物陰から顔を出して撃つ・追い詰められたら退いて回復・見失ったら横から回り込む
//   見えていない相手は、最後に見た所（角の先）を狙って待つ（壁越しには狙わない）。スキルの使い方は SKILL_AI、性格は PERSONAS
import { Gadgets } from './gadgets';
import { gs } from './state';
import { DIFFS, V3, clamp, lerp, rand, settings } from './core';
import { SFX } from './audio';
import { cam } from './render';
import { MAPS, groundAt, insideCollider, mapId, propMeshes } from './world';
import { Nav } from './nav';
import { Smoke } from './grenades';
import { act, bot, botActor, canFire, holdFire, eyeOf, fire, fireGrenade, hasLOS, moveEntity, player, ray, regenTick, shootArrow, skillTick, startReload, stats, tryJump, useSkill, view, weaponTick } from './game';
import { addDamageDir, heardFoe, hud, killPlayer } from './hud';
import { Clones } from './clones';
import { Sword } from './sword';
import { swordTick } from './swordai';
import { Ninja } from './ninja';

// ================= CPU =================
// 浮島のマップで、(x, z) の足もとに床が無い（落ちたら負け）か
const overVoid = (x, z, y) => !!MAPS[mapId]?.void && groundAt(x, z) < y - 3;
export function steer(e, dir) {
  if (dir.lengthSq() < 1e-6) return dir;
  const o = new V3(e.pos.x, e.pos.y + 0.5, e.pos.z);
  const free = d => {
    if (overVoid(e.pos.x + d.x * 1.2, e.pos.z + d.z * 1.2, e.pos.y)) return false;   // 島の縁の先へは進まない
    // 上を歩ける面（急な階段・坂の上面）に当たったのは障害物に数えない（上っている途中で階段を壁と思って止まらないように）
    ray.set(o, d); ray.far = 1.8;
    const h = !ray.intersectObjects(propMeshes, true).some(hit => !hit.face || hit.face.normal.clone().transformDirection(hit.object.matrixWorld).y < 0.5);
    ray.far = Infinity; return h;
  };
  if (free(dir)) return dir;
  for (const a of [0.6, -0.6, 1.2, -1.2, 1.8, -1.8]) {
    const d = dir.clone().applyAxisAngle(new V3(0, 1, 0), a * (e.strafe || 1));
    if (free(d)) return d;
  }
  return overVoid(e.pos.x + dir.x * 1.2, e.pos.z + dir.z * 1.2, e.pos.y) ? new V3() : dir;
}
// 浮島のマップ：CPU が自分の動き（歩き・突進・跳び）で島の外へ出そうなら、縁で止める
//   爆風・体当たり・桂跳びの着地で飛ばされた時（knockT・pushedT）は止めない（落とせる）
function edgeBrake(b, dt) {
  b.pushedT = Math.max(0, (b.pushedT || 0) - dt);
  if ((b.knockT || 0) > 0 || b.pushedT > 0 || b.prevX === undefined) return;
  if (overVoid(b.pos.x, b.pos.z, b.pos.y) && !overVoid(b.prevX, b.prevZ, b.pos.y)) { b.pos.x = b.prevX; b.pos.z = b.prevZ; b.vel.x = b.vel.z = 0; }
}
// まっすぐ歩いて行けるか
export function reachable(e, from, to) {
  const d = to.clone().sub(from); d.y = 0;
  const len = d.length();
  if (len < 0.01) return true;
  d.normalize();
  // 浮島・屋上のマップ：途中に床の無い所（すき間）があれば、まっすぐは行けない
  if (MAPS[mapId]?.void) for (let t = 0.8; t < len; t += 0.8) if (overVoid(from.x + d.x * t, from.z + d.z * t, e.pos.y)) return false;
  // 体の真ん中と両肩の3本で調べる（真ん中だけだと、戸口の端を体がすり抜けられると思って引っかかる）
  const side = new V3(-d.z, 0, d.x).multiplyScalar(e.radius * 0.9);
  ray.far = len + e.radius;
  let hit = false;
  for (const k of [0, 1, -1]) {
    ray.set(new V3(from.x + side.x * k, e.pos.y + 0.5, from.z + side.z * k), d);
    if (ray.intersectObjects(propMeshes, true).length > 0) { hit = true; break; }
  }
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
  b.pathT = (b.pathT || 0) - dt; b.pathCd = (b.pathCd || 0) - dt;
  // まっすぐ行けるなら経路はいらない（覚えている経路は消さない：見えたり隠れたりで毎回探し直さないように）
  if (Math.abs(tgt.y - b.pos.y) < 0.6 && reachable(b, b.pos, tgt)) return null;
  // 経路探索は重いので、探し直すのは 1.5 秒ごとか、行き先が大きく変わったときだけ（最短でも 0.4 秒あける）
  // 探している途中なら少し進める（その間は前の道をたどる）。1回の探索で止まらないように、数フレームに分ける
  if (b.job) {
    const r = b.job.next();
    if (r.done) { b.path = r.value || []; b.pathI = 0; b.job = null; }
  } else if (b.pathCd <= 0 && (!b.path || b.pathT <= 0 || !b.pathGoal || b.pathGoal.distanceTo(tgt) > 3)) {
    b.job = Nav.plan(b.pos, tgt); b.pathT = 1.5; b.pathCd = 0.4; b.pathGoal = tgt.clone();
    const r = b.job.next();
    if (r.done) { b.path = r.value || []; b.pathI = 0; b.job = null; }
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
export function findCover(e, from, maxR = 11) {
  let best = null, bd = Infinity;
  for (let i = 0; i < 22; i++) {
    const a = rand(0, Math.PI * 2), r = rand(Math.min(2.5, maxR * 0.4), maxR);
    const x = e.pos.x + Math.cos(a) * r, z = e.pos.z + Math.sin(a) * r;
    if (insideCollider(x, z, e.radius + 0.2, e.pos.y)) continue;
    if (bodyVisible(new V3(x, e.pos.y, z), e, from)) continue;   // 体が少しでも見える所は隠れ場所にしない
    if (r < bd) { bd = r; best = new V3(x, 0, z); }
  }
  return best;
}
// 退く場所：相手から見えず、相手から遠ざかる所（まっすぐ行ける所を優先）
function findRetreat(e, from, foePos) {
  let best = null, bs = -Infinity;
  const d0 = Math.hypot(e.pos.x - foePos.x, e.pos.z - foePos.z);
  for (let i = 0; i < 28; i++) {
    const a = rand(0, Math.PI * 2), r = rand(3, 14);
    const x = e.pos.x + Math.cos(a) * r, z = e.pos.z + Math.sin(a) * r;
    if (insideCollider(x, z, e.radius + 0.2, e.pos.y)) continue;
    const p = new V3(x, e.pos.y, z);
    if (bodyVisible(p, e, from)) continue;
    const s = (Math.hypot(x - foePos.x, z - foePos.z) - d0) - r * 0.35 + (reachable(e, e.pos, p) ? 3 : 0);
    if (s > bs) { bs = s; best = p.setY(0); }
  }
  if (best) return best;
  // 隠れられる所が無ければ、相手と反対の方へ走る
  const away = new V3(e.pos.x - foePos.x, 0, e.pos.z - foePos.z).normalize();
  for (const r of [9, 6, 3.5]) { const x = e.pos.x + away.x * r, z = e.pos.z + away.z * r; if (!insideCollider(x, z, e.radius + 0.2, e.pos.y)) return new V3(x, 0, z); }
  return null;
}
// 物陰から撃つ：近くの隠れ場所（anchor）を覚え、顔を出して撃つ（out）→ 引っ込む（in）を繰り返す
function updatePeek(b, want, pEye, dt, fast = false) {
  if (!want) { b.anchor = null; b.peekIn = false; return; }
  b.anchorT = (b.anchorT || 0) - dt; b.peekT = (b.peekT || 0) - dt;
  const lost = b.anchor && bodyVisible(new V3(b.anchor.x, b.pos.y, b.anchor.z), b, pEye);
  if (!b.anchor || b.anchorT <= 0 || lost) { b.anchor = findCover(b, pEye, 5.5); b.anchorT = 2.5; }
  if (!b.anchor) { b.peekIn = false; return; }
  if (b.peekT <= 0) { b.peekIn = !b.peekIn; b.peekT = fast ? (b.peekIn ? rand(0.3, 0.6) : rand(0.7, 1.3)) : (b.peekIn ? rand(0.5, 1.1) : rand(1.3, 2.6)); }   // fast：鬼畜は短く顔を出してすぐ引っ込む
}

// ================= 最初の動き（どのマップでも使える） =================
// 自分の出る所 → 相手の出る所の向きを基準に、行き先を「どれだけ進むか f（0〜1）」「横にどれだけずれるか s（距離の何倍・+ が右）」で決める
// 相手を見つける・撃たれる・音を聞く・30 秒たつ・最後まで行く、のどれかで終わって、いつもの動きに戻る
//   wait：その場（cover なら近くの物陰）で待つ秒数
const OPENINGS: { name: string; steps: any[] }[] = [
  { name: 'まっすぐ', steps: [[1, 0]] },
  { name: '右から', steps: [[0.45, 0.3], [1, 0]] },
  { name: '左から', steps: [[0.45, -0.3], [1, 0]] },
  { name: '大きく右から', steps: [[0.2, 0.42], [0.7, 0.45], [1, 0]] },
  { name: '大きく左から', steps: [[0.2, -0.42], [0.7, -0.45], [1, 0]] },
  { name: '待つ', steps: [{ wait: [8, 14], cover: true }, [1, 0]] },
  { name: '途中で待ち伏せ', steps: [[0.35, 0], { wait: [8, 13], cover: true }, [1, 0]] },
  { name: '少し待って右から', steps: [{ wait: [3, 6], cover: true }, [0.5, 0.35], [1, 0]] },
  { name: '少し待って左から', steps: [{ wait: [3, 6], cover: true }, [0.5, -0.35], [1, 0]] },
  { name: 'ジグザグ', steps: [[0.25, 0.15], [0.5, -0.15], [0.75, 0.15], [1, 0]] },
];
let lastOpening = -1;
// 行ける点を探す：壁の中・高さが違いすぎる所（屋上の隙間など）・島の外なら、横のずれを少しずつ小さくする
function openPt(b, s0, ax, rt, L, f, s) {
  for (const k of [1, 0.75, 0.5, 0.25, 0]) {
    const side = clamp(L * s * k, -30, 30), x = s0.x + ax.x * L * f + rt.x * side, z = s0.z + ax.z * L * f + rt.z * side, y = groundAt(x, z);
    if (Math.abs(y - s0.y) > 8 || insideCollider(x, z, b.radius + 0.3, y)) continue;
    return new V3(x, y, z);
  }
  return null;
}
function startOpening(b) {
  b.openDone = true;
  let n = Math.floor(Math.random() * OPENINGS.length);
  if (n === lastOpening) n = (n + 1 + Math.floor(Math.random() * (OPENINGS.length - 1))) % OPENINGS.length;   // 前と同じにはしない
  lastOpening = n;
  const s0 = b.pos.clone(), goal = player.pos.clone(), ax = goal.clone().sub(s0).setY(0), L = ax.length();
  if (L < 4) return;
  ax.normalize();
  const rt = new V3(-ax.z, 0, ax.x);
  const steps = OPENINGS[n].steps.map(st => Array.isArray(st) ? (st[0] >= 1 && st[1] === 0 ? goal.clone() : openPt(b, s0, ax, rt, L, st[0], st[1])) : { wait: rand(st.wait[0], st.wait[1]), cover: st.cover }).filter(Boolean);
  b.opening = { name: OPENINGS[n].name, steps, i: 0, t: 0, stuck: 0 };
}
function endOpening(b) { b.opening = null; }
// 最初の動きを1こま進める（wish に向きを入れる）。終わったら false
function openStep(b, dt, wish, pEye) {
  const O = b.opening;
  O.t += dt;
  const st = O.steps[O.i];
  if (!st || O.t > 30 || b.hurtT > 0) { endOpening(b); return false; }
  if (st.wait !== undefined) {
    if (st.cover && st.at === undefined) st.at = findCover(b, pEye, 6);   // 相手のいる方から見えない近くの物陰
    if (st.at) { wish.copy(st.at).sub(b.pos).setY(0); if (wish.length() < 0.5) wish.set(0, 0, 0); }
    if ((st.wait -= dt) <= 0) O.i++;
    return true;
  }
  if (Math.hypot(st.x - b.pos.x, st.z - b.pos.z) < 2.5 || (O.stuck += b.stuck > 0.6 ? dt : 0) > 2.5) { O.i++; O.stuck = 0; return true; }   // 着いた（引っかかって進めないときも次へ）
  const next = navNext(b, st, dt, pEye);
  wish.copy(next || st).sub(b.pos).setY(0);
  return true;
}

export function updateBot(dt) {
  const b = bot, D = DIFFS[settings.diff];
  const wish = new V3();
  // ミサイルを操作している間は、その場で無防備
  if (gs.state === 'fight' && !b.dead && Gadgets.ctrlOf(b)) {
    weaponTick(b, dt); moveEntity(b, wish, dt); skillTick(b, dt); regenTick(b, dt);
    return;
  }
  // 刀を使う CPU（侍）は専用の動き（swordai.ts）
  if (gs.state === 'fight' && !b.dead && b.w.kind === 'sword') { swordTick(b, dt); skillTick(b, dt); regenTick(b, dt); return; }
  if (gs.state === 'fight' && !b.dead) {
    // 影分身：CPU は本物だと思い込んだ分身（T）を相手として見る・追う・狙う
    const T = Clones.believed(player) || player;
    const pEye = eyeOf(T), bEye = eyeOf(b);
    const toP = T.pos.clone().sub(b.pos); toP.y = 0;
    const dist = toP.length(); toP.normalize();
    // 透明化している相手は、すぐ近くでないと見えない
    // 目がくらんでいる間は見えない（閃光弾）
    if (b.blindT > 0) b.blindT -= dt;
    const los = !player.dead && hasLOS(bEye, pEye) && !(act(player, 'cloak') && dist > 3) && !Sword.hidden(player) && !(b.blindT > 0) && dist < (gs.stormVis ?? Infinity);   // 砂嵐の中は近くしか見えない
    if (!b.openDone) startOpening(b);
    if (los && b.opening) endOpening(b);   // 見つけたら最初の動きは終わり
    if (los) { b.seen += dt; b.lostT = 0; b.lastKnown.copy(T.pos); b.flankSide = 0; }
    else { b.seen = Math.max(0, b.seen - dt * 2); b.lostT += dt; }
    // 透視中は、見えていなくても居場所が分かる
    if (!los && act(b, 'xray')) { b.lastKnown.copy(player.pos); b.lostT = Math.min(b.lostT, 0.5); }
    // 鬼畜の勘：見失って2秒たつと、だいたいの居場所（数mずれる）が分かる
    if (D.oni && !los && b.lostT > 2) {
      b.senseT = (b.senseT || 0) - dt;
      if (b.senseT <= 0) { b.lastKnown.set(player.pos.x + rand(-2.5, 2.5), player.pos.y, player.pos.z + rand(-2.5, 2.5)); b.senseT = 1.5; }
    }

    b.strafeT -= dt;
    const aimedAt = new V3(0, 0, -1).applyQuaternion(cam.quaternion).dot(bEye.clone().sub(pEye).normalize()) > 0.995;
    // 狙われたら左右に切り返す（鬼畜はこまめに）
    if (b.strafeT <= 0 || (aimedAt && Math.random() < dt * (D.oni ? 6 : 2))) { b.strafe *= Math.random() < 0.7 ? -1 : 1; b.strafeT = D.oni ? rand(0.3, 0.9) : rand(0.5, 1.6); }
    const side = new V3(-toP.z, 0, toP.x).multiplyScalar(b.strafe);

    // 状態の決定
    const P = b.persona, pref = Math.max(3, b.w.pref + P.prefAdd);
    // HPが減っていて見つかっていないなら回復を待つ。回復したか、見つかったら再開
    if (!los && b.hp < b.def.hp * 0.5 && (P !== PERSONAS.rush || D.oni)) b.healing = true;
    if (b.hp >= b.def.hp * 0.9 || (los && b.hurtT > 0)) b.healing = false;
    const wantCover = los && (b.reloading > 0 || (b.hp < P.coverHp && player.hp > b.hp && b.ammo < b.w.mag * 0.4));
    if (wantCover) {
      b.coverT -= dt;
      if (!b.coverPt || b.coverT <= 0) { b.coverPt = findCover(b, pEye); b.coverT = 0.6; }
    } else b.coverPt = null;

    const guarding = !!act(b, 'guard');
    // 追い詰められたら退く：HP が少なく、相手の方が元気なとき（突撃型は退かない）。退いた先で回復を待つ
    const cornered = los && (P !== PERSONAS.rush || D.oni) &&b.hp < b.def.hp * 0.35 && player.hp > b.hp * 1.2;
    if (cornered && !b.retreatPt) { b.retreatPt = findRetreat(b, pEye, player.pos); b.retreatT = 3; }
    if (b.retreatPt) {
      b.retreatT -= dt;
      if (b.retreatT <= 0 || Math.hypot(b.retreatPt.x - b.pos.x, b.retreatPt.z - b.pos.z) < 0.8 || (!los && b.lostT > 0.6)) { b.retreatPt = null; if (!los) b.healing = true; }
    }
    b.retreating = !!b.retreatPt;
    // 物陰から撃つ：慎重型はいつも、バランス型は傷ついたときや遠いとき。近すぎるときは一騎打ちに集中
    //   遠くから撃たれたら（underFireT）、どの性格も物陰へ（突撃型はかなり遠いときだけ）
    if (los && b.hurtT > 1.1 && dist > 9) b.underFireT = 4;
    b.underFireT = Math.max(0, (b.underFireT || 0) - dt);
    // 鬼畜：相手がリロード中なら一気に詰める
    const push = D.oni && los && player.reloading > 0 && dist > 4 && !guarding && !b.retreating && !b.coverPt && b.w.kind !== 'melee';
    const wantPeek = los && !push && !guarding && !b.retreating && !b.coverPt && dist > 5 && b.w.kind !== 'melee'
      && (P === PERSONAS.careful || (P === PERSONAS.normal && (b.hp < b.def.hp * 0.75 || dist > 12)) || (b.underFireT > 0 && (P !== PERSONAS.rush || dist > 15)));
    updatePeek(b, wantPeek, pEye, dt, !!D.oni);
    const peekIn = wantPeek && b.anchor && b.peekIn;
    if (peekIn && b.w.kind !== 'bow' && b.ammo < b.w.mag * 0.7 && !b.reloading) startReload(b);   // 引っ込んでいる間にリロード
    if (guarding) {
      // 構えている間はまっすぐ詰める
      wish.copy(toP);
    } else if (b.retreatPt) {
      wish.copy(b.retreatPt).sub(b.pos).setY(0).normalize().addScaledVector(side, 0.35);   // ジグザグに退く
    } else if (push) {
      wish.copy(toP).addScaledVector(side, 0.5);
    } else if (peekIn) {
      wish.copy(b.anchor).sub(b.pos).setY(0);
      if (wish.length() < 0.4) wish.set(0, 0, 0);
    } else if (b.coverPt) {
      wish.copy(b.coverPt).sub(b.pos).setY(0);
      if (wish.length() < 0.5) { wish.set(0, 0, 0); if (bodyVisible(b.pos, b, pEye)) b.coverT = 0; }   // 着いても見えていたら探し直す
    } else if (los) {
      wish.addScaledVector(toP, dist > pref + 3 ? 1 : dist < pref - 4 ? -0.8 : 0).addScaledVector(side, 0.9);
      if (wantPeek && b.anchor) { const back = b.anchor.clone().sub(b.pos).setY(0); if (back.length() > 3.5) wish.addScaledVector(back.normalize(), 1.2); }
    } else if (b.healing) {
      // 回復待ち：体がはみ出していたり煙の中なら、ちゃんと隠れられる所へ移ってから待つ
      b.coverT -= dt;
      if (bodyVisible(b.pos, b, pEye) || Smoke.inside(b.pos)) {
        if (!b.healPt || b.coverT <= 0) { b.healPt = findCover(b, pEye); b.coverT = 0.8; }
        if (b.healPt) wish.copy(b.healPt).sub(b.pos).setY(0);
        else wish.copy(toP).negate().add(side);
      } else { wish.set(0, 0, 0); b.healPt = null; }
    } else if (b.opening && openStep(b, dt, wish, pEye)) {
      // 最初の動き（右から・左から・待つ など）
    } else {
      // 見失ったら最後に見た場所へ。まっすぐ行けなければ中継地点を経由
      let tgt = b.lostT < 3 ? b.lastKnown : player.pos;
      if (b.lostT >= 3 && dist > 12) {
        if (!b.flankSide) b.flankSide = Math.random() < 0.5 ? -1 : 1;
        const fx = player.pos.x - toP.z * b.flankSide * 9, fz = player.pos.z + toP.x * b.flankSide * 9;
        if (!insideCollider(fx, fz, b.radius + 0.2, player.pos.y)) tgt = new V3(fx, player.pos.y, fz);
      }
      const next = navNext(b, tgt, dt, pEye);
      wish.copy(next || tgt).sub(b.pos).setY(0);
      if (!next && wish.length() < 1.5) wish.copy(toP).add(side);
    }
    // 煙の中で立ち止まらない
    if (Smoke.inside(b.pos) && wish.lengthSq() < 0.05) wish.copy(side).addScaledVector(toP, 0.4);
    const ctx = { los, dist, toP, pref, dt, aimedAt, side };
    b.slots.forEach((s, i) => { const f = SKILL_AI[s.id] || SKILL_AI[s.sk.type]; if (f) f(b, ctx, i, s); });
    b.hurtT = Math.max(0, (b.hurtT || 0) - dt);
    if (wish.lengthSq() > 0) wish.normalize();
    const steered = steer(b, wish);
    b.jumpT -= dt;
    if (b.onGround && ((los && b.jumpT <= 0 && Math.random() < dt * (aimedAt ? 1.5 : 0.3) * P.jump * (D.oni ? 2 : 1)) || b.stuck > 0.6)) { tryJump(b); b.jumpT = rand(1, 2.5); }
    // 行き止まりの壁や、相手が高い所にいるときは壁を登る
    b.wantClimb = !!(b.wallN && steered.dot(b.wallN) < -0.2 && (b.stuck > 0.2 || player.pos.y > b.pos.y + 0.8));
    moveEntity(b, steered, dt);
    edgeBrake(b, dt);
    b.stuck = (wish.lengthSq() > 0 && b.pos.distanceTo(b.lastPos) < b.def.speed * 0.25 * dt) ? b.stuck + dt : 0;
    b.lastPos.copy(b.pos);

    // 照準：プレイヤーの位置を遅れて追いかけるので、横移動していると当てにくい
    const seenAt = los ? T.pos : b.lastKnown;
    const chest = new V3(seenAt.x, seenAt.y + player.height * (D.aimH || 0.62), seenAt.z);   // aimH：鬼畜は頭を狙う
    if (los && D.pred && T.vel) chest.addScaledVector(new V3(T.vel.x, 0, T.vel.z), D.pred / D.track);   // 追いかける遅れのぶん先を狙う
    b.aimPt.lerp(chest, 1 - Math.exp(-D.track * dt));
    weaponTick(b, dt);
    b.fireDelay -= dt;
    const busy = b.slots.some(s => s.t > 0 && ['dash', 'leap', 'heal', 'guard', 'grapple', 'roll', 'medkit'].includes(s.sk.type)) || peekIn;   // 引っ込んでいる間・回復中は撃たない
    if (b.w.kind === 'bow') {
      // 弓：引き絞ってから、相手の動きと矢の落ちを見越して放つ。追尾中は見えていなくても撃つ
      const armed = !!act(b, 'homing');
      const canShoot = !b.coverPt && ((los && b.seen > D.react) || (armed && b.lostT < 3));
      if (canShoot && b.cd <= 0 && !holdFire()) {
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
    } else if (b.w.kind === 'xbow') {
      if (los && b.seen > D.react && canFire(b) && b.fireDelay <= 0 && !b.coverPt && !busy) {
        const tgt = b.aimPt.clone(), speed = b.w.speedMax;
        let t = bEye.distanceTo(tgt) / speed;
        const lead = player.vel.clone().multiplyScalar(D.lead);
        for (let k = 0; k < 2; k++) t = bEye.distanceTo(tgt.clone().addScaledVector(lead, t)) / speed;
        const p = tgt.clone().addScaledVector(lead, t); p.y += 0.5 * b.w.gravity * t * t;
        const aim = p.sub(bEye).normalize(), err = D.err * 0.7;
        aim.add(new V3(rand(-err, err), rand(-err, err), rand(-err, err))).normalize();
        b.draw = 1;
        shootArrow(b, aim, bEye.clone().addScaledVector(aim, 0.7));
        b.fireDelay = Math.max(rand(D.gap[0], D.gap[1]), b.w.dmg / D.dps - b.w.reload);
      }
    } else if (b.w.kind === 'ninja') {
      // 手裏剣（忍）：相手の動きと落ちを見越して投げる
      if (los && b.seen > D.react && b.cd <= 0 && !holdFire() && b.fireDelay <= 0 && !b.coverPt && !busy) {
        const tgt = b.aimPt.clone(), speed = b.w.speed;
        let t = bEye.distanceTo(tgt) / speed;
        const lead = player.vel.clone().multiplyScalar(D.lead);
        for (let k = 0; k < 2; k++) t = bEye.distanceTo(tgt.clone().addScaledVector(lead, t)) / speed;
        const p = tgt.clone().addScaledVector(lead, t); p.y += 0.5 * b.w.gravity * t * t;
        const aim = p.sub(bEye).normalize(), err = D.err * 0.8;
        aim.add(new V3(rand(-err, err), rand(-err, err), rand(-err, err))).normalize();
        Ninja.aiThrow(b, aim);
        b.fireDelay = Math.max(rand(D.gap[0], D.gap[1]), b.w.dmg / D.dps - b.w.rate);
      }
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
    } else if (los && b.seen > D.react + (b.w.zoom ? 0.35 : 0) && canFire(b) && (b.fireDelay <= 0 || b.burstLeft > 0) && !b.coverPt && !busy) {
      const aimTgt = b.aimPt;
      const aim = aimTgt.clone().sub(bEye).normalize();
      const err = D.err + (act(player, 'dash') ? 0.08 : 0) + (player.onGround ? 0 : 0.02);
      aim.add(new V3(rand(-err, err), rand(-err, err), rand(-err, err))).normalize();
      botActor.root.updateMatrixWorld(true);
      const muzzle = botActor.gun.muzzle.getWorldPosition(new V3());
      const res = fire(b, player, bEye, muzzle, aim);
      const dps = D.dps * (b.w.aiDps || 1);   // 1秒あたりのダメージの上限（武器ごとに CPU だけ下げられる）
      // 連射武器は数発ずつ撃つ（バースト）
      if (b.w.auto) {
        if (!(b.burst > 0)) { b.burst = 3 + Math.floor(Math.random() * 5); b.burstN = b.burst; }
        b.burst--;
        // バーストの合間も、1秒あたりのダメージが上限を超えないよう間を空ける
        b.fireDelay = b.burst > 0 ? rand(0, 0.03) : Math.max(rand(D.gap[0], D.gap[1]) + 0.15, b.burstN * b.w.dmg / dps - b.burstN * b.w.rate);
      } else {
        b.fireDelay = rand(D.gap[0], D.gap[1]) + (b.w.zoom ? 0.9 : 0);
        // 1発が重い武器は、1秒あたりのダメージが上限を超えないよう間を空ける
        const perShot = b.w.dmg * (b.w.pellets ? b.w.pellets * 0.5 : 1);
        b.fireDelay = Math.max(b.fireDelay, perShot / dps - b.w.rate);
        // バースト：続きはすぐ撃ち、撃ち終わったら1回分の間を空ける
        if (b.w.burst) b.fireDelay = b.burstLeft > 0 ? 0 : Math.max(rand(D.gap[0], D.gap[1]), b.w.dmg * b.w.burst / dps - b.w.rate);
      }
      b.flashT = 0.05;
      SFX.play('shot', muzzle, b.w.model); heardFoe(muzzle, 'shot');
      if (res.dmg > 0) damagePlayer(res.dmg, b.pos);
      else if (res.miss) {
        ray.set(bEye, res.miss);
        const cd = ray.ray.distanceToPoint(pEye);
        if (cd < 1.6 && bEye.distanceTo(pEye) < res.wallDist) SFX.play('whiz', pEye.clone().addScaledVector(res.miss, 1));
      }
    } else if (b.w.kind !== 'bow' && b.ammo <= 0) startReload(b);
    else if (b.w.kind !== 'bow' && !los && b.ammo < b.w.mag * (D.oni ? 0.8 : 0.5)) startReload(b);
  } else {
    weaponTick(b, dt);
    moveEntity(b, wish, dt);
  }
  skillTick(b, dt);
  if (gs.state === 'fight') regenTick(b, dt);
}

// スキルごとのCPUの使い方（b: CPU, c: 状況, i: 何番目のスキルか, s: スキルの枠）
const ready = s => s.charges > 0 && s.t <= 0;
const chestOf = e => new V3(e.pos.x, e.pos.y + e.height * 0.6, e.pos.z);
export const SKILL_AI = {
  // 突撃：相手がリロード中、または遠いときに一気に詰める（突撃型ほど積極的）
  charge(b, c, i, s) {
    if (ready(s) && c.los && c.dist > 5 && b.seen > 0.5 && (player.reloading > 0 || c.dist > c.pref + 8 / b.persona.eager)) useSkill(b, i, c.toP);
  },
  // 身体強化：相手が遠くて詰めたいとき、または撃たれて逃げたいときに使う
  physical(b, c, i, s) {
    if (ready(s) && ((c.los && c.dist > c.pref + 4 && !b.retreating) || b.hurtT > 0.9 || b.retreating)) useSkill(b, i, c.toP);
  },
  // すり足：狙われている・撃たれたときに横へ逃げる
  step(b, c, i, s) {
    if (ready(s) && c.los && (b.hurtT > 0.9 || b.retreating || (c.aimedAt && Math.random() < c.dt * 3 * b.persona.eager))) useSkill(b, i, b.retreating ? c.side.clone().sub(c.toP) : c.side);
  },
  // 追尾：隠れた相手を曲がる矢で追い出す。見えていても時々使う
  homing(b, c, i, s) {
    if (ready(s) && ((!c.los && b.lostT > 0.4 && b.lostT < 2.5) || (c.los && c.dist > 10 && Math.random() < c.dt * 0.25 * b.persona.eager))) useSkill(b, i, c.toP);
  },
  // 桂跳び：中距離から飛びかかる
  leap(b, c, i, s) {
    if (!ready(s) || !b.onGround) return;
    if ((c.los && c.dist > 5 && c.dist < 15 && Math.random() < c.dt * 0.7 * b.persona.eager) || (!c.los && b.stuck > 0.4)) useSkill(b, i, c.toP);
  },
  // 煙幕：撃たれてHPが減ってきたら煙を張って身を隠す
  smoke(b, c, i, s) {
    if (ready(s) && c.los && ((b.hurtT > 0 && b.hp < b.def.hp * 0.6) || b.retreating)) useSkill(b, i, c.toP);
  },
  // 大玉：見えている相手へ撃ち込む前に使う
  bigshot(b, c, i, s) {
    if (ready(s) && c.los && c.dist > 6 && c.dist < 22 && Math.random() < c.dt * 0.4 * b.persona.eager) useSkill(b, i, c.toP);
  },
  // 透明化：見失っている間に回り込む。追い詰められたら逃げる
  cloak(b, c, i, s) {
    if (ready(s) && ((!c.los && b.lostT > 0.5 && c.dist > 8 && Math.random() < c.dt * 0.5 * b.persona.eager) || (c.los && ((b.hurtT > 0 && b.hp < b.def.hp * 0.4) || b.retreating)))) useSkill(b, i, c.toP);
  },
  // 透視：見失ったら居場所を探る
  xray(b, c, i, s) {
    if (ready(s) && !c.los && b.lostT > 1) useSkill(b, i, c.toP);
  },
  // C4：近い相手へ投げ、相手が近づいたら（貼りついたら）起爆
  c4(b, c, i, s) {
    const k = Gadgets.c4Of(b);
    if (k) {
      if (k.ent === player || (k.stuck && k.pos.distanceTo(chestOf(player)) < s.sk.radius * 0.5) || k.t > 15) useSkill(b, i, c.toP);
      return;
    }
    if (s.charges > 0 && c.los && c.dist < 5 && Math.random() < c.dt * 1.5 * b.persona.eager) useSkill(b, i, c.toP);
  },
  // ミサイル：隠れた相手や遠い相手へ飛ばす（その間は無防備なので、見えていない時が基本）
  missile(b, c, i, s) {
    if (Gadgets.ctrlOf(b) || s.charges <= 0 || b.coverPt) return;
    if ((!c.los && b.lostT > 0.5 && b.lostT < 4 && c.dist > 8) || (c.los && c.dist > 15 && Math.random() < c.dt * 0.3)) useSkill(b, i, c.toP);
  },
  // 連射：見えている相手に次の矢をまとめて放つ
  volley(b, c, i, s) {
    if (ready(s) && c.los && c.dist > 6 && c.dist < 30 && Math.random() < c.dt * 0.4 * b.persona.eager) useSkill(b, i, c.toP);
  },
  // 木箱：撃たれているとき、相手との間に遮蔽を作る
  boxes(b, c, i, s) {
    if (ready(s) && c.los && ((b.hurtT > 0 && c.dist > 8) || (b.retreating && c.dist > 4))) useSkill(b, i, c.toP);
  },
  // 鉤縄：相手が高い所にいるとき、見えていれば引き寄せられて一気に上がる。行き詰まったときも
  grapple(b, c, i, s) {
    if (!ready(s)) return;
    if ((c.los && player.pos.y > b.pos.y + 2.5 && c.dist < 30) || b.stuck > 0.8) useSkill(b, i, c.toP);
  },
  // EMP：見えている相手へ、一騎打ちの前に投げる（相手がスキルを使っている最中なら、切りに投げる）
  emp(b, c, i, s) {
    if (!ready(s) || !c.los || c.dist < 4 || c.dist > 22) return;
    const busy = player.slots.some(x => x.t > 0 && ['buff', 'cloak', 'guard', 'heal'].includes(x.sk.type));
    if (busy || Math.random() < c.dt * 0.35 * b.persona.eager) useSkill(b, i, c.toP);
  },
  // 閃光弾：中距離で撃ち合う前に投げる
  flash(b, c, i, s) {
    if (ready(s) && c.los && c.dist > 5 && c.dist < 18 && Math.random() < c.dt * 0.35 * b.persona.eager) useSkill(b, i, c.toP);
  },
  // エンダーパール：見失った相手の方へ一気に近づく（遠いとき）
  pearl(b, c, i, s) {
    if (ready(s) && !c.los && b.lostT > 1.5 && c.dist > 22 && b.hp > b.def.hp * 0.4) useSkill(b, i, c.toP);
    else if (ready(s) && b.retreating && b.retreatPt && c.dist < 14) {
      const e = new V3(b.pos.x, b.pos.y + b.eyeH, b.pos.z);
      b.skillAim = b.retreatPt.clone().setY(b.pos.y + 1).sub(e).normalize().add(new V3(0, 0.25, 0)).normalize();
      useSkill(b, i, c.toP); b.skillAim = null;
    }
  },
  // 衝撃波：近くに来た相手を吹き飛ばす
  // タレット歩：一騎打ちが始まったら目の前に置く
  turret(b, c, i, s) {
    if (ready(s) && c.los && c.dist < 30 && b.seen > 0.3) useSkill(b, i, c.toP);
  },
  shock(b, c, i, s) {
    if (ready(s) && c.los && c.dist < 6) useSkill(b, i, c.toP);
  },
  // 王の意地：HPが減ったら回復
  heal(b, c, i, s) {
    if (ready(s) && b.hp < b.def.hp * 0.45) useSkill(b, i, c.toP);
  },
  // ---------- 成駒 ----------
  // 早撃ち：見えている相手と撃ち合うとき
  dual(b, c, i, s) {
    if (ready(s) && c.los && c.dist < 22 && b.seen > 0.4 && Math.random() < c.dt * 0.8 * b.persona.eager) useSkill(b, i, c.toP);
  },
  // 前転：撃たれた・狙われているときに横へ転がる（弾が切れかけでも：転がるとリロードが済む）
  roll(b, c, i, s) {
    if (ready(s) && ((c.los && (b.hurtT > 0.9 || (c.aimedAt && Math.random() < c.dt * 2 * b.persona.eager))) || (b.ammo <= 1 && c.los))) useSkill(b, i, c.side);
  },
  // 貫通：見えている相手に次の1発を
  pierce(b, c, i, s) {
    if (ready(s) && c.los && b.seen > 0.5 && Math.random() < c.dt * 0.6) useSkill(b, i, c.toP);
  },
  // ランデブー：見えていない所で元気なうちに目印を置き、体力が減って撃たれたら離れた目印へ逃げる
  rendezvous(b, c, i, s) {
    if (!ready(s)) return;
    const A = Gadgets.anchorOf(b);
    if (!A) { if (!c.los && b.hp > b.def.hp * 0.7 && Math.random() < c.dt * 0.5) useSkill(b, i, c.toP); }
    else if (b.hp < b.def.hp * 0.45 && (c.los || b.hurtT > 0.5) && A.pos.distanceTo(b.pos) > 6) useSkill(b, i, c.toP);
  },
  // 毒矢・拡散：見えている相手へ
  poison(b, c, i, s) {
    if (ready(s) && c.los && c.dist > 6 && Math.random() < c.dt * 0.6 * b.persona.eager) useSkill(b, i, c.toP);
  },
  multishot(b, c, i, s) {
    if (ready(s) && c.los && c.dist > 5 && c.dist < 35 && Math.random() < c.dt * 0.5 * b.persona.eager) useSkill(b, i, c.toP);
  },
  // 救急キット：見えていない所で体力が減っているとき
  medkit(b, c, i, s) {
    if (ready(s) && !c.los && b.lostT > 0.6 && b.hp < b.def.hp * 0.65) useSkill(b, i, c.toP);
  },
  // ドーム：撃たれて体力が減ってきたら張る
  dome(b, c, i, s) {
    if (ready(s) && c.los && b.hurtT > 0 && b.hp < b.def.hp * 0.6) useSkill(b, i, c.toP);
  },
  // 地雷：相手の足元へ撃ち込む前に（次の弾が地雷になる）
  mine(b, c, i, s) {
    if (ready(s) && c.los && c.dist > 6 && c.dist < 28 && Math.random() < c.dt * 0.5 * b.persona.eager) useSkill(b, i, c.toP);
  },
  // フレア弾：中距離で撃ち合う前に投げる
  flare(b, c, i, s) {
    if (ready(s) && c.los && c.dist > 6 && c.dist < 20 && Math.random() < c.dt * 0.3 * b.persona.eager) useSkill(b, i, c.toP);
  },
  // 空爆要請：見えている相手の足元へ
  airstrike(b, c, i, s) {
    if (!ready(s) || !c.los || c.dist < 10 || c.dist > 38 || Math.random() > c.dt * 0.5 * b.persona.eager) return;
    const e = new V3(b.pos.x, b.pos.y + b.eyeH, b.pos.z);
    const to = player.pos.clone().sub(e); to.y += to.length() * 0.18;   // 山なりに投げる
    b.skillAim = to.normalize();
    useSkill(b, i, c.toP); b.skillAim = null;
  },
  // 竜巻：刀の届かない少し先の相手を引き寄せる
  tornado(b, c, i, s) {
    if (ready(s) && c.los && c.dist > 4 && c.dist < s.sk.radius - 0.5) useSkill(b, i, c.toP);
  },
  // 守りの構え：撃たれているのに遠いとき、構えて距離を詰める
  guard(b, c, i, s) {
    if (ready(s) && c.los && c.dist > c.pref + 2 && b.seen > 0.3 && (b.hurtT > 0 || Math.random() < c.dt * 0.4 * b.persona.eager)) useSkill(b, i, c.toP);
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
  if (bot.pos.distanceTo(pos) > radius * (DIFFS[settings.diff].oni ? 1.5 : 1) || bot.lostT === 0) return;   // 鬼畜は耳がいい
  bot.lastKnown.copy(pos); bot.lostT = 0.01; bot.wp = null; endOpening(bot);   // 音で気づいたら最初の動きは終わり
}

// quiet：毒のじわじわ（揺れ・音を小さく）
export function damagePlayer(dmg, from, quiet = false) {
  player.hp -= dmg; stats.taken += dmg; player.sinceHit = 0;
  hud.hurt = quiet ? Math.max(hud.hurt || 0, 0.3) : 0.85;
  if (!quiet) {
    view.shake = Math.max(view.shake, 0.35);
    view.pitch += rand(0.005, 0.015); view.yaw += rand(-0.01, 0.01);
    addDamageDir(from);
    SFX.play('hurt');
  }
  if (player.hp <= 0 && !player.dead) killPlayer();
}

// 体当たり
export function checkRam(a, b, onHit) {
  const s = act(a, 'dash');
  if (!s || s.rammed || a.dead || b.dead) return;
  const d = Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z);
  if (d > a.radius + b.radius + 0.35) return;
  s.rammed = true; s.t = 0; a.vel.multiplyScalar(-0.2);
  b.vel.copy(s.dir).multiplyScalar(14); b.vy = 5; b.onGround = false; b.pushedT = 0.8;   // pushedT：CPU が縁で踏みとどまらない（浮島から落とせる）
  SFX.play('ram');
  view.shake = Math.max(view.shake, 0.6);
  onHit(s.sk.ram);
}
