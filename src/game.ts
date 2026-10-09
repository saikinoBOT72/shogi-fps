// ゲーム状態・プレイヤー・スキル（移動と当たり判定は game/move.ts、武器は game/weapons.ts）
import { Gadgets } from './gadgets';
import { P } from './palette';
import * as THREE from 'three';
import { gs } from './state';
import { G, GROUND, H, NORMAL_PIECES, PIECES, RULES, SKILLS, V3, WEAPONS, clamp, damp, lerp, rand, pieceUsable, settings, specialOn } from './core';
import { SFX } from './audio';
import { cam, scene } from './render';
import { LV, SPAWN, SPAWN2, WATER_Y, colTop, colliders, floorBelow, groundAt, pickMap, useMap } from './world';
import { PHYS, blockers, physOf } from './physics';
import { Decals, DmgNums, Particles, Tracers, VM, buildActor, vmCam } from './effects';
import { Arrows } from './arrows';
import { Grenades, Smoke } from './grenades';
import { down, keys } from './input';
import { PERSONAS, aiHear, damagePlayer } from './ai';
import { heardFoe, initPips, killBot, showHitmarker } from './hud';
import { Replay } from './replay';
import { Net, r2, vec } from './net';
import { questEvent } from './quests';
import { equippedRef, paintGun, skinKey, validRef } from './loadout';
import { skinMaterials } from './guns/skins';
import { eyeOf, surfOf, hasLOS, act, moveEntity, tryJump } from './game/move';
import { currentSpread, canFire, holdFire, startReload, weaponTick, facingOf, skillDamageMul, fire } from './game/weapons';
import { Sword } from './sword';
import { Clones } from './clones';
import { Promo, callAirstrike, showThrowArc, spawnDome, startTornado, tossFlare } from './promo';
export * from './game/move';
export * from './game/weapons';

// ================= ゲーム状態 =================
gs.state = 'title';   // title / countdown / fight / end
gs.paused = false;
gs.stateT = 0;
gs.timeScale = 1;
gs.slowmoT = 0;
export let player, bot, playerActor, botActor, stats;
gs.matchCtx = null;   // 将棋モードの一騎打ち中：{ myType, foeType, playerIsAttacker }
export const view: any = { yaw: 0, pitch: 0, shake: 0, fov: 70.5, bobPhase: 0, dip: 0, dipV: 0, roll: 0 };
export const isPlaying = () => (gs.state === 'countdown' || gs.state === 'fight') && !gs.paused;

export function makeEntity(type, isBot) {
  const def = PIECES[type], w = WEAPONS[def.weapon];
  return {
    type, def, w, isBot,
    pos: new V3(), vel: new V3(), vy: 0, onGround: true, airT: 0, jumped: false,
    height: 1.85 * def.size, radius: 0.5 * def.size, eyeH: 1.85 * def.size * 0.83,
    hp: def.hp, dead: false, ammo: w.mag, cd: 0, reloading: 0, bloom: 0, moving: false,
    // スキルの枠：id / sk: 中身 / cd: 待ち時間 / charges: 使える回数 / t: 効いている残り時間 / dir: 使った向き
    slots: (def.skills || []).map(id => ({ id, sk: SKILLS[id], cd: 0, charges: SKILLS[id].charges || 1, t: 0, dir: new V3(), rammed: false })),
    stepPhase: 0, flashT: 0, draw: 0, sinceHit: 99, burstLeft: 0,
    mainW: w, mainAmmo: w.mag,   // メイン武器（ナイフに持ち替えている間の弾数も覚えておく）
  };
}
// 駒の見た目を用意（種類が変わったときだけ作り直す）
export function ensureActors(pType, bType) {
  const make = (old, type, isBot) => {
    if (old && old.type === type) return old;
    if (old) scene.remove(old.root);
    const d = PIECES[type], a = buildActor(type === 'K' && isBot ? '玉' : d.name, d.size, WEAPONS[d.weapon].model, !!d.red);
    a.type = type;
    return a;
  };
  playerActor = make(playerActor, pType, false);
  botActor = make(botActor, bType, true);
  paintActors();
}
// スキン：自分は装備しているもの。相手はオンラインのときだけ、相手が装備しているもの（CPU は初期スキン）
//   相手の銃は、戦いの間は飾りなしの形に色だけ（軽くするため）。リプレイ・キルカムでは飾りまで見せる（paintFoe）
export const foeRef = (model: string) => { const fr = Net.on && gs.foeSkins?.[model]; return validRef(model, fr) ? fr : null; };
export function paintActors() {
  if (!playerActor || !botActor) return;
  const pm = WEAPONS[PIECES[playerActor.type].weapon].model;
  paintGun(playerActor.gun, equippedRef(pm));
  if (playerActor.gun2) paintGun(playerActor.gun2, equippedRef('pistol'));   // と：2丁目のデザートイーグル
  paintFoe(false);
}
export function paintFoe(full: boolean) {
  if (!botActor) return;
  const bm = WEAPONS[PIECES[botActor.type].weapon].model, r = foeRef(bm);
  paintGun(botActor.gun, r, !full);
  if (botActor.gun2) paintGun(botActor.gun2, foeRef('pistol'), !full);
  if (r && !full) skinMaterials(skinKey(r));   // リプレイで使う材質も先に作っておく（リプレイの始まりで止まらないように）
}
// ランダムで出る駒：ふつうの駒と成駒（特殊駒は出ない）
export const pieceKeys = () => Object.keys(PIECES).filter(k => !PIECES[k].special);
export const resolveMe = () => (settings.myPiece === 'random' ? pieceKeys()[Math.floor(Math.random() * pieceKeys().length)] : pieceUsable(settings.myPiece) ? settings.myPiece : 'P');
export function resolveFoe() {
  const k = settings.foePiece;
  return k === 'random' ? pieceKeys()[Math.floor(Math.random() * pieceKeys().length)] : (PIECES[k] && (!PIECES[k].special || specialOn()) ? k : 'P');   // 特殊駒は開発者メニューでオンのときだけ
}

export function resetMatch(foeType?, myPick?: string) {   // myPick：対局の始めに決めた自分の駒（ランダムのとき）
  // 将棋モードでは守る側が選んだマップ、オンラインでは部屋を作った人が選んだマップ（未公開でもそのまま遊べる）
  useMap(gs.boardMap || gs.netMap || pickMap(settings.map, !!myPick));
  const myType = gs.matchCtx ? gs.matchCtx.myType : myPick || (settings.myPiece === 'random' ? (player && player.type) || 'P' : pieceUsable(settings.myPiece) ? settings.myPiece : 'P');
  foeType = foeType || (gs.matchCtx && gs.matchCtx.foeType) || (settings.foePiece === 'random' ? (bot && bot.type) || 'P' : resolveFoe());
  ensureActors(myType, foeType);
  player = makeEntity(myType, false);
  bot = makeEntity(foeType, true);
  VM.setWeapon(player.w.model);
  // 出撃地点：外周の塀の裏（開始時にお互いが見えない）
  // 出撃：左右の橋のたもと（屋根つきの関所の中）
  // 攻め守りの形のマップ（SPAWN2 あり）は、一人で遊ぶときはどちら側から出るかを毎回ランダムに
  const side = Net.on ? (Net.host ? 1 : -1) : SPAWN2.on && Math.random() < 0.5 ? -1 : 1;   // オンラインで部屋に入った側は反対の橋から
  const spawnOf = s => (SPAWN2.on ? (s > 0 ? SPAWN : SPAWN2) : { x: s * SPAWN.x, z: s * SPAWN.z });
  const ps = spawnOf(side), bs = spawnOf(-side);
  player.pos.set(ps.x + rand(-1, 1), LV.V, ps.z + rand(-1, 1));
  bot.pos.set(bs.x + rand(-1, 1), LV.V, bs.z + rand(-1, 1));
  Object.assign(bot, { seen: 0, lostT: 0, strafe: 1, strafeT: 0, stuck: 0, lastPos: bot.pos.clone(), aimPt: player.pos.clone(), lastKnown: player.pos.clone(), coverPt: null, coverT: 0, retreatPt: null, retreatT: 0, retreating: false, anchor: null, anchorT: 0, peekIn: false, peekT: 0, flankSide: 0, opening: null, openDone: false, skillAim: null, fireDelay: 0, jumpT: 2, wp: null, wpT: 0, hurtT: 0,
    persona: Object.values(PERSONAS)[Math.floor(Math.random() * 3)] });
  stats = { shots: 0, hits: 0, heads: 0, dealt: 0, taken: 0, time: 0 };
  view.yaw = Math.atan2(-(bot.pos.x - player.pos.x), -(bot.pos.z - player.pos.z));
  view.pitch = 0; view.shake = 0; view.roll = 0; view.dip = 0; view.dipV = 0;
  botActor.body.rotation.set(0, 0, 0); botActor.body.position.y = 0; botActor.dead = null; botActor.root.visible = true;
  playerActor.body.rotation.set(0, 0, 0); playerActor.dead = null;
  Replay.clear();
  Arrows.clear(); Grenades.clear(); Smoke.clear(); Gadgets.clear(); Promo.clear(); Sword.clear(); Clones.clear();
  botActor.wood.emissive.setHex(0);
  Decals.clear();
  PHYS.reset();
  gs.timeScale = 1; gs.slowmoT = 0;
  VM.ready();
  document.querySelectorAll('.dd').forEach(e => e.remove());
}

// ================= プレイヤー =================
// 使える回数（charges）を1つ使い、待ち時間で1つずつ戻る
export function skillTick(e, dt) {
  if (e.empT > 0) e.empT = Math.max(0, e.empT - dt);
  for (const s of e.slots) {
    const sk = s.sk;
    // 動くスキル（突撃・すり足・桂跳び）の時間は moveEntity で進める
    if (s.t > 0 && !['dash', 'step', 'leap', 'grapple', 'blink', 'roll'].includes(sk.type)) {
      const was = s.t;
      s.t -= dt;
      // 救急キット：最後まで歩くだけでいられたら回復（体力を決めるのは自分の画面）
      if (sk.type === 'medkit' && s.t <= 0 && was > 0 && !e.dead && (e === player || !Net.on)) {
        e.hp = Math.min(e.def.hp, e.hp + sk.amount);
        for (let k = 0; k < 16; k++) Particles.glow(e.pos.clone().add(new V3(rand(-0.6, 0.6), rand(0.2, e.height), rand(-0.6, 0.6))), P.midori[2]);
        if (!e.isBot) SFX.play('heal');
      }
      if (sk.type === 'dual' && s.t <= 0) e.ammo = Math.min(e.ammo, e.w.mag);   // 2丁目をしまう
      if (sk.type === 'medkit' && s.t > 0 && Math.random() < dt * 10) Particles.glow(e.pos.clone().add(new V3(rand(-0.5, 0.5), rand(0.2, e.height), rand(-0.5, 0.5))), P.midori[2]);
      if (sk.type === 'heal' && !e.dead) {
        e.hp = Math.min(e.def.hp, e.hp + sk.amount / sk.duration * dt);
        if (Math.random() < 0.5) Particles.glow(e.pos.clone().add(new V3(rand(-0.6, 0.6), rand(0.2, e.height), rand(-0.6, 0.6))), P.midori[2]);
      }
    }
    const max = sk.charges || 1;
    if (s.charges >= max) { s.cd = 0; continue; }
    s.cd -= dt;
    if (s.cd <= 0) { s.charges++; s.cd = s.charges < max ? sk.cooldown : 0; }
  }
}
// i 番目のスキルを使う。dir は水平の向き
export function useSkill(e, i, dir, force = false) {
  const s = e.slots[i];
  if (!s || e.dead) return false;
  const sk = s.sk;
  // もう一度押す系：C4 の起爆・ミサイルの操作をやめる
  if (sk.type === 'c4' && Gadgets.c4Of(e)) { SFX.play('skC4b', e.isBot ? e.pos : null); Gadgets.detonate(e); return true; }
  if (sk.type === 'missile' && Gadgets.ctrlOf(e)) { Gadgets.release(e); return true; }
  // 鉤縄（2回）：引き寄せられている途中なら、縄を掛け替えて勢いのまま向きを変える
  const chain = sk.type === 'grapple' && sk.chain && s.t > 0 && s.charges > 0;
  if (!force && e.empT > 0) { if (!e.isBot) SFX.play('empty'); return false; }   // EMP を受けている間はスキルが使えない
  if (!force && (s.charges <= 0 || (s.t > 0 && !chain))) return false;
  if (!force && e.slots.some(x => x !== s && x.t > 0 && ['dash', 'step', 'leap', 'grapple', 'blink', 'roll'].includes(x.sk.type))) return false;   // 動くスキルの最中は重ねない
  // 狙っている向き（上下も含む）
  const aim = e.isBot && e.skillAim ? e.skillAim.clone() : e.isBot && e.netAim ? e.netAim.clone() : e.isBot ? new V3(player.pos.x, player.pos.y + player.height * 0.6, player.pos.z).sub(eyeOf(e)).normalize() : new V3(0, 0, -1).applyQuaternion(cam.quaternion);
  // 鉤縄は掛ける所が無ければ使わない（回数も減らさない）
  let hook = null;
  if (sk.type === 'grapple') { hook = Gadgets.grappleTarget(e, aim, sk.range); if (!hook) { if (!e.isBot) SFX.play('empty'); return false; } }
  cancelMedkit(e, s);   // ほかのスキルを使うと救急キットは中断
  s.dir.copy(dir).setY(0).normalize();
  s.charges--; if (s.cd <= 0) s.cd = sk.cooldown;
  s.t = sk.duration; s.rammed = false;
  const t = sk.type;
  if (t === 'blink') {
    // 瞬：溜めた分（e.blinkK 0〜1）だけ遠くへ、見ている向き（上下も）へ飛ぶ。前に相手がいたら手前で止まる
    const k = clamp(e.blinkK ?? 1, 0, 1), d3 = aim.clone().normalize();
    let dist = lerp(sk.minDist, sk.maxDist, k), full = dist;
    const foe = e === player ? bot : player, to = foe.pos.clone().sub(e.pos).setY(0), h = Math.hypot(d3.x, d3.z);
    if (!foe.dead && h > 0.3 && to.length() > 0.01 && to.clone().normalize().dot(new V3(d3.x, 0, d3.z).normalize()) > 0.8)
      dist = Math.min(dist, Math.max(0, to.length() - e.radius - foe.radius - sk.gap) / h);
    s.dir3 = d3; s.sp = sk.speed; s.t = Math.max(0.02, dist / sk.speed); s.capped = dist < full;   // 相手の手前で止めるときは勢いを残さない
    e.onGround = false; e.airT = 1; e.jumped = true;
    SFX.play('blink', e.isBot ? e.pos : null, k);
    Particles.dust(e.pos, 10, 1.4);
    if (!e.isBot) view.shake = Math.max(view.shake, 0.2);
    Sword.blinkStart(e, k);
  } else if (t === 'dual') {
    e.ammo += e.w.mag; e.reloading = 0;   // 2丁目（弾も2丁分）
    SFX.play('guardUp', e.isBot ? e.pos : null);
  } else if (t === 'roll') {
    SFX.play('skStep', e.isBot ? e.pos : null);
    Particles.dust(e.pos, 6, 1);
    e.reloading = 0;
  } else if (t === 'pierce' || t === 'poison' || t === 'multishot' || t === 'mine') {
    SFX.play(t === 'multishot' ? 'skVolley' : t === 'pierce' ? 'skXray' : t === 'mine' ? 'skC4' : 'skHoming', e.isBot ? e.pos : null);
  } else if (t === 'hearing') {
    SFX.play('skXray', e.isBot ? e.pos : null);
  } else if (t === 'medkit') {
    SFX.play('heal', e.isBot ? e.pos : null);
  } else if (t === 'dome') {
    spawnDome(e, sk);
  } else if (t === 'flare') {
    onAttack(e); tossFlare(e, aim, sk); e.flareT = 0.75;
    if (!e.isBot) { VM.flareT = 0.75; VM.flareKick = 1; view.shake = Math.max(view.shake, 0.12); }   // 左手のフレアガンを構えて撃つ
  } else if (t === 'airstrike') {
    onAttack(e); callAirstrike(e, aim, sk);
  } else if (t === 'tornado') {
    onAttack(e); startTornado(e, sk);
  } else if (t === 'hagakure') {
    if (!e.isBot) SFX.play('skCloak');
    Sword.leaves(e);
  } else if (t === 'clone') {
    Clones.spawn(e);
  } else if (t === 'step') {
    SFX.play('skStep', e.isBot ? e.pos : null);
    Particles.dust(e.pos, 5, 0.9);
    if (!e.isBot) { view.shake = Math.max(view.shake, 0.15); view.stepRoll = s.dir.dot(new V3(Math.cos(view.yaw), 0, -Math.sin(view.yaw))) > 0 ? -1 : 1; }
  } else if (t === 'buff') {
    SFX.play('skStep', e.isBot ? e.pos : null);
    for (let k = 0; k < 14; k++) Particles.glow(e.pos.clone().add(new V3(rand(-0.5, 0.5), rand(0.2, e.height), rand(-0.5, 0.5))), P.kin[2]);
    if (!e.isBot) view.shake = Math.max(view.shake, 0.12);
  } else if (t === 'homing' || t === 'bigshot' || t === 'volley') {
    SFX.play(t === 'homing' ? 'skHoming' : t === 'volley' ? 'skVolley' : 'skBig', e.isBot ? e.pos : null);
  } else if (t === 'leap') {
    e.vy = sk.up; e.vel.copy(s.dir).multiplyScalar(sk.fwd);
    e.onGround = false; e.jumped = true; e.airT = 1;
    SFX.play('leap', e.pos); Particles.dust(e.pos, 10, 1.4);
    if (!e.isBot) view.shake = Math.max(view.shake, 0.2);
  } else if (t === 'smoke') {
    Smoke.spawn(e.pos.clone().add(new V3(0, 1.2, 0)), sk.radius, sk.life);
  } else if (t === 'xray' || t === 'cloak') {
    if (!e.isBot) SFX.play(t === 'xray' ? 'skXray' : 'skCloak');
    if (t === 'cloak') for (let k = 0; k < 12; k++) Particles.glow(e.pos.clone().add(new V3(rand(-0.5, 0.5), rand(0.2, e.height), rand(-0.5, 0.5))), P.shiro[2]);
  } else if (t === 'boxes') {
    // 目の前に三角に積む（下2個・上1個）
    const right = new V3(-s.dir.z, 0, s.dir.x);
    const base = e.pos.clone().addScaledVector(s.dir, sk.dist), y0 = floorBelow(base.x, base.z, e.pos.y);   // 屋内でも天井の上ではなく床に
    for (const [side, row] of [[-0.62, 0], [0.62, 0], [0, 1]]) {
      const p = base.clone().addScaledVector(right, side);
      PHYS.spawnBox(p.x, y0 + row * 1.22, p.z, Math.atan2(s.dir.x, s.dir.z));
      Particles.dust(p, 6, 1);
    }
    SFX.play('skBoxes', e.isBot ? e.pos : null);
  } else if (t === 'grapple') {
    s.target = hook; SFX.play('skGrapple', e.isBot ? e.pos : null);
    if (chain) e.vel.multiplyScalar(1);   // 掛け替え：勢いはそのまま（向きは新しい縄の方へ）
  } else if (t === 'flash' || t === 'pearl' || t === 'emp') {
    if (t !== 'pearl') onAttack(e);
    Gadgets.toss(t, e, aim, sk);
  } else if (t === 'shock') {
    onAttack(e); Gadgets.shockwave(e, sk);
  } else if (t === 'turret') {
    Gadgets.placeTurret(e, s.dir, sk);
  } else if (t === 'c4') {
    onAttack(e); Gadgets.throwC4(e, aim, sk);
  } else if (t === 'missile') {
    onAttack(e); Gadgets.launch(e, aim, sk);
  } else if (t === 'heal') {
    SFX.play('heal');
  } else if (t === 'dash') {
    e.vy = Math.max(e.vy, 2);
    SFX.play('skDash', e.isBot ? e.pos : null);
    Particles.dust(e.pos, 8, 1.3);
    if (!e.isBot) view.shake = Math.max(view.shake, 0.25);
  } else {
    SFX.play('guardUp', e.isBot ? e.pos : null);
    if (!e.isBot) view.shake = Math.max(view.shake, 0.12);
  }
  if (!e.isBot) questEvent('skill', 1, !!Net.on);
  return true;
}
// 構えを解く（撃ったとき）
export function endGuard(e) { const g = act(e, 'guard'); if (g) g.t = 0; }
// 攻撃したら透明化が解ける
export function onAttack(e) { const c = act(e, 'cloak'); if (c) c.t = 0; cancelMedkit(e); }
// 救急キットを中断（回復しない）。keep：使ったばかりのその枠は除く
export function cancelMedkit(e, keep?) {
  for (const s of e.slots || []) if (s !== keep && s.t > 0 && s.sk.type === 'medkit') {
    s.t = 0; s.medCut = true;
    const max = s.sk.charges || 1;
    s.charges = Math.min(max, s.charges + 1); if (s.charges >= max) s.cd = 0;
  }
}

export function updatePlayer(dt) {
  const p = player;
  const fwd = new V3(-Math.sin(view.yaw), 0, -Math.cos(view.yaw)), right = new V3(Math.cos(view.yaw), 0, -Math.sin(view.yaw));
  const wish = new V3();
  if (gs.state === 'fight' && !p.dead && !gs.paused) {
    // ミサイルを操作している間は、自分の駒は動かない
    if (!Gadgets.ctrlOf(p)) {
      if (down('forward')) wish.add(fwd); if (down('back')) wish.sub(fwd);
      if (down('right')) wish.add(right); if (down('left')) wish.sub(right);
      if (wish.lengthSq() > 0) wish.normalize();
      if (gs.jumpPressed > 0 && tryJump(p)) { gs.jumpPressed = 0; cancelMedkit(p); }
    }
    p.skillHeld = p.skillHeld || [];
    p.slots.forEach((s, i) => {
      const k = down(i === 0 ? 'skill' : 'skill2');
      // 瞬：1回押すと溜め始め（足が遅くなる。溜めきったらそのまま待つ）、もう1回押すと飛ぶ
      if (s.sk.type === 'blink') {
        const press = k && !p.skillHeld[i];
        if (press && p.blinkCh == null) {
          if (s.charges > 0 && !(s.t > 0) && !(p.empT > 0)) { p.blinkCh = 0; p.blinkLv = 0; SFX.play('blinkTick', 0); }
        } else if (p.blinkCh != null && !press) {
          p.blinkCh = Math.min(s.sk.chargeMax, p.blinkCh + dt);
          const lv = Math.floor(p.blinkCh / s.sk.chargeMax * 3 + 1e-6);   // 1/3 ごとに音が上がる
          if (lv > p.blinkLv) { p.blinkLv = lv; SFX.play('blinkTick', lv); }
        } else if (press && p.blinkCh != null) {
          p.blinkK = p.blinkCh / s.sk.chargeMax; p.blinkCh = null;
          const a = new V3(0, 0, -1).applyQuaternion(cam.quaternion);
          if (useSkill(p, i, fwd) && Net.on) Net.send({ t: 'skill', i, d: vec(fwd), a: vec(a), k: r2(p.blinkK) });
        }
        p.skillHeld[i] = k;
        return;
      }
      if (s.sk.type === 'airstrike') {
        const ready = s.charges > 0 && !(p.empT > 0);
        if (k && ready) p.strikeAim = i;
        else if (p.strikeAim === i) {
          p.strikeAim = null;
          if (!k && ready && useSkill(p, i, fwd) && Net.on) Net.send({ t: 'skill', i, d: vec(fwd), a: vec(new V3(0, 0, -1).applyQuaternion(cam.quaternion)) });
        }
        p.skillHeld[i] = k;
        return;
      }
      if (k && !p.skillHeld[i]) {
        // すり足は A/D の方向（押していなければ右）、他は前
        let sdir = fwd;
        if (s.sk.type === 'step') sdir = down('left') ? right.clone().negate() : down('right') ? right : down('back') ? fwd.clone().negate() : right;
        if (s.sk.type === 'roll') sdir = wish.lengthSq() > 0 ? wish.clone() : fwd;
        if (useSkill(p, i, sdir) && Net.on) Net.send({ t: 'skill', i, d: vec(sdir), a: vec(new V3(0, 0, -1).applyQuaternion(cam.quaternion)) });
      }
      p.skillHeld[i] = k;
    });
    // 空爆要請のキーを押している間：投げる線
    showThrowArc(p, new V3(0, 0, -1).applyQuaternion(cam.quaternion), p.strikeAim != null ? p.slots[p.strikeAim].sk : null);
    // V：銃を眺める
    if (down('inspect') && !p.inspectHeld) { VM.inspect(); SFX.play('inspect'); }
    p.inspectHeld = down('inspect');
  }
  gs.jumpPressed -= dt;
  const guardOrDash = p.slots.some(s => s.t > 0 && ['guard', 'dash', 'step', 'leap', 'grapple', 'blink', 'roll', 'dual', 'medkit'].includes(s.sk.type)) || !!Gadgets.ctrlOf(p);   // 覗き込めないスキル中
  p.adsT = damp(p.adsT || 0, gs.rightDown && !p.dead && p.reloading <= 0 && !guardOrDash && p.w.kind !== 'melee' && p.w.kind !== 'sword' ? 1 : 0, p.w.adsSpeed || 14, dt);
  // 壁に向かってジャンプ長押しで登る
  p.wantClimb = !!(down('jump') && p.wallN && wish.dot(p.wallN) < -0.2 && gs.state === 'fight');
  if (p.climbing && (p.climbSnd = (p.climbSnd || 0) - dt) <= 0) { SFX.play('climb'); p.climbSnd = 0.22; }
  p.running = down('run') && !act(p, 'medkit');   // 救急キット中は走れない（歩きのまま続く）
  p.speedMul = lerp(1, 0.6, p.adsT) * (p.draw > 0 ? 0.75 : 1) * (p.w.moveMul || 1) * (p.blinkCh != null ? 0.5 : 1) * (p.swGuard ? 0.35 : 1);   // 瞬を溜めている間は遅い・刀で守っている間はかなり遅い
  moveEntity(p, wish, dt);
  skillTick(p, dt);
  regenTick(p, dt);
  p.flareT = Math.max(0, (p.flareT || 0) - dt);   // 左手のフレアガンをしまう（自分の駒は対局中に animateActor を通らないので、ここで減らす。リプレイがこれを使う）

  // 足音
  if (p.onGround && p.moving) {
    const prev = Math.sin(view.bobPhase * 2);
    view.bobPhase += dt * Math.hypot(p.vel.x, p.vel.z) * 1.35;
    if (prev > 0 && Math.sin(view.bobPhase * 2) <= 0) { const sf = surfOf(p); if (p.running) SFX.play('step', null, 0.7, sf); if (sf === 'squeak') aiHear(p.pos, 30); else if ((p.adsT || 0) < 0.5) aiHear(p.pos, p.running ? 10 : 4); }   // 鳴る床は忍び足でも遠くまで聞こえる。歩きは聞こえる範囲が狭い
  }

  weaponTick(p, dt);
  if (gs.state !== 'fight' || holdFire() || p.dead || gs.paused || Gadgets.ctrlOf(p)) { if (p.w.kind === 'sword') Sword.input(p, false, false); return; }
  // 刀：連打で1段目・長押しで4段目まで（sword.ts）
  if (p.w.kind === 'sword') { Sword.input(p, !!gs.mouseDown, !!gs.rightDown); return; }
  // 弓：押している間は引き絞り、離したら放つ
  if (p.w.kind === 'bow') {
    if (gs.mouseDown && p.cd <= 0) {
      if (!p.drawing) SFX.play('bowDraw');
      p.drawing = true;
      const was = p.draw;
      p.draw = Math.min(1, p.draw + dt / p.w.drawTime);
      if (was < 1 && p.draw >= 1) SFX.play('bowReady');   // 引き切った合図
    } else if (p.drawing && !gs.mouseDown) {
      p.drawing = false;
      if (p.draw > 0.12) shootPlayerArrow(); else p.draw = 0;
    }
    return;
  }
  if (down('reload')) startReload(p);
  if (p.w.kind === 'xbow') {
    if (gs.mouseDown && !gs.triggerUsed) {
      gs.triggerUsed = true;
      if (p.ammo <= 0 && p.reloading <= 0) { SFX.play('empty'); startReload(p); }
      else if (canFire(p)) shootPlayerXbow();
    }
    return;
  }
  if (p.burstLeft > 0) { if (canFire(p)) shootPlayer(); }   // バーストの続き
  else if (gs.mouseDown && !gs.triggerUsed) {
    gs.triggerUsed = !p.w.auto;
    if (p.ammo <= 0 && p.reloading <= 0) { SFX.play('empty'); startReload(p); }
    else if (canFire(p)) shootPlayer();
  }
}

// 武器の持ち替え：'knife'（ナイフ）/ 'main'（メイン武器）/ 'toggle'
export function switchWeapon(e, which) {
  const isKnife = e.w.kind === 'melee';
  const toKnife = which === 'toggle' ? !isKnife : which === 'knife';
  if (toKnife === isKnife || e.dead || e.mainW.kind === 'sword') return;   // 侍は刀だけ
  if (toKnife) { e.mainAmmo = e.ammo; e.w = WEAPONS.knife; e.ammo = 1; }
  else { e.w = e.mainW; e.ammo = e.mainAmmo; }
  e.reloading = 0; e.draw = 0; e.drawing = false; e.burstLeft = 0; e.bloom = 0;
  e.cd = Math.max(e.cd, 0.3);   // 持ち替えの間は撃てない
  if (!e.isBot) { VM.setWeapon(e.w.model); VM.ready(); initPips(); SFX.play('swap'); }
}
// ナイフで切る：目の前の届く範囲の相手に当たる。背中からは強い
export function meleePlayer() {
  const p = player, w = p.w;
  p.cd = w.rate;
  onAttack(p); endGuard(p);
  VM.fire(w);
  SFX.play('knife', null);
  if (Net.on) Net.send({ t: 'melee' });
  const dir = new V3(0, 0, -1).applyQuaternion(cam.quaternion);
  const eye = eyeOf(p), chest = new V3(bot.pos.x, bot.pos.y + bot.height * 0.6, bot.pos.z);
  const to = chest.clone().sub(eye), d = to.length();
  if (bot.dead || d > w.range + bot.radius || to.normalize().dot(dir) < w.cone || !hasLOS(eye, chest, true)) return;
  const behind = facingOf(bot).dot(p.pos.clone().sub(bot.pos).setY(0).normalize()) < -0.3;
  const dmg = w.dmg * (behind ? w.back : 1) * skillDamageMul(bot, p.pos);
  damageBot({ dmg, head: false, point: chest.clone().addScaledVector(to, -0.3) });
  view.shake = Math.max(view.shake, 0.15);
}
// 弾の線の出どころ：一人称の銃口が画面に見えている所（覗き込みでも真ん中へ寄せきらないので、銃口から出て見えるように）
function muzzleOnScreen(left: boolean) {
  const m = left ? VM.left.muzzle : VM.pist.muzzle;
  if (!m) return null;
  (left ? VM.leftMirror : VM.root).updateMatrixWorld(true); vmCam.updateMatrixWorld();
  const s = m.getWorldPosition(new V3()).project(vmCam);
  if (!Number.isFinite(s.x) || Math.abs(s.x) > 1.2 || Math.abs(s.y) > 1.2 || s.z > 1) return null;
  const pt = new V3(s.x, s.y, 0.5).unproject(cam).sub(cam.position).normalize();
  return cam.position.clone().addScaledVector(pt, 0.9);
}
export function shootPlayer() {
  const p = player;
  if (p.w.kind === 'melee') { meleePlayer(); return; }
  cam.updateMatrixWorld();
  const dir = new V3(0, 0, -1).applyQuaternion(cam.quaternion);
  const dual = !!act(p, 'dual');
  if (dual) p.dualLeft = !p.dualLeft;
  const muzzle = (!VM.scoped && muzzleOnScreen(dual && p.dualLeft)) || cam.localToWorld(new V3(lerp(0.19, 0, p.adsT) * 0.9 * (dual && p.dualLeft ? -1 : 1), -0.14, -0.9));
  endGuard(p);
  if (p.w.kind === 'grenade') {
    fireGrenade(p, dir, eyeOf(p).addScaledVector(dir, 0.6));
    aiHear(p.pos, 45); stats.shots++;
    VM.fire(p.w, p.ammo <= 0);
    view.pitch += p.w.recoil; view.shake = Math.max(view.shake, 0.15);
    return;
  }
  const res = fire(p, bot, eyeOf(p), muzzle, dir);
  aiHear(p.pos, 45);
  stats.shots++;
  SFX.play('shot', null, p.w.model);
  if (dual && p.dualLeft) VM.fireLeft(p.w); else VM.fire(p.w, p.ammo <= 0);
  view.pitch += p.w.recoil * lerp(1, 0.6, p.adsT); view.yaw += rand(-0.006, 0.006);
  view.shake = Math.max(view.shake, 0.12);
  if (res.dmg > 0) damageBot(res);
}

// グレネードを撃つ（プレイヤー・CPU共通）
export function fireGrenade(e, dir, origin) {
  const w = e.w, sp = currentSpread(e);
  const d = dir.clone().add(new V3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(rand(0, sp))).normalize();
  e.ammo--; e.cd = w.rate;
  if (e.ammo <= 0) startReload(e);
  onAttack(e);
  // 大玉：次の1発だけ大きく、敵も自分も大きく吹き飛ばす
  const big = act(e, 'bigshot');
  if (big) big.t = 0;
  const mn = act(e, 'mine');   // 地雷：この弾が着弾した所に地雷が残る
  if (mn) mn.t = 0;
  Grenades.fire({ owner: e, target: e === player ? bot : player, pos: origin, vel: d.multiplyScalar(w.speed), dmg: w.dmg, radius: big ? big.sk.radius : w.radius, gravity: w.gravity, fuse: w.fuse,
    big: !!big, knock: big ? big.sk.knock : w.knock, lift: big ? big.sk.lift : w.lift, self: w.self, mine: mn ? mn.sk : null });
  SFX.play('m79', e.isBot ? origin : null);
  if (e.isBot) heardFoe(origin, 'shot');
  if (Net.on && e === player) Net.send({ t: 'gren', p: vec(origin), v: vec(d), dmg: w.dmg, r: big ? big.sk.radius : w.radius, g: w.gravity, fu: w.fuse,
    big: big ? 1 : 0, kn: big ? big.sk.knock : w.knock, li: big ? big.sk.lift : w.lift, se: w.self, mn: mn ? 1 : 0 });
}
// 矢を放つ（プレイヤー・CPU共通）
export function shootArrow(e, dir, origin) {
  const w = e.w, k = (e.draw * e.draw + 2 * e.draw) / 3;   // マイクラと同じ引きの効き方
  const sp = currentSpread(e);
  const d = dir.clone().add(new V3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(rand(0, sp))).normalize();
  const hs = act(e, 'homing'), homing = !!hs;
  if (hs) hs.t = 0;
  const po = act(e, 'poison');   // 毒矢：次の矢（拡散中は同時の3本とも）
  if (po) po.t = 0;
  const ms = act(e, 'multishot');
  // 連射：この1本に続けて残りを放つ
  const vs = act(e, 'volley');
  if (vs) { vs.t = 0; e.volleyLeft = vs.sk.count - 1; e.volleyGap = vs.sk.gap; e.volleyT = vs.sk.gap; e.volleyDraw = e.draw; }
  onAttack(e);
  // 拡散：真ん中と左右（水平に少し開く）
  const dirs = [d];
  if (ms) for (const a of [-ms.sk.angle, ms.sk.angle]) dirs.push(d.clone().applyAxisAngle(new V3(0, 1, 0), a));
  for (const dd of dirs) {
    Arrows.fire({
      owner: e, target: e === player ? bot : player, pos: origin,
      vel: dd.clone().multiplyScalar(homing ? Math.min(hs.sk.speed, lerp(w.speedMin, w.speedMax, k)) : lerp(w.speedMin, w.speedMax, k)),
      dmg: lerp(w.dmgMin, w.dmg, k), head: w.head, gravity: w.gravity, drag: w.drag || 0, homing, turn: hs ? hs.sk.turn : 0, full: e.draw >= 1, poison: po ? po.sk : null,
    });
    if (Net.on && e === player) { const a = Arrows.last(); Net.send({ t: 'arrow', p: vec(a.pos), v: vec(a.vel), dmg: r2(a.dmg), hd: a.head, g: a.gravity, dr: a.drag, hm: homing ? 1 : 0, tu: a.turn, fu: a.full ? 1 : 0 }); }
  }
  if (w.kind === 'xbow') { e.ammo--; if (e.ammo <= 0) startReload(e); }   // クロスボウは1本ずつ込める
  e.cd = w.rate; e.draw = 0;
  SFX.play('bow', e.isBot ? origin : null);
  if (e.isBot) heardFoe(origin, 'shot');
  if (!e.isBot) aiHear(e.pos, 20);
}
// クロスボウを撃つ（いつも引き切った強さ）
export function shootPlayerXbow() {
  const p = player;
  cam.updateMatrixWorld();
  const dir = new V3(0, 0, -1).applyQuaternion(cam.quaternion);
  p.draw = 1;
  shootArrow(p, dir, eyeOf(p).addScaledVector(dir, 0.6));
  stats.shots++;
  VM.fire(p.w, true);
  view.pitch += p.w.recoil; view.shake = Math.max(view.shake, 0.1);
}
export function shootPlayerArrow() {
  const p = player;
  cam.updateMatrixWorld();
  const dir = new V3(0, 0, -1).applyQuaternion(cam.quaternion);
  shootArrow(p, dir, eyeOf(p).addScaledVector(dir, 0.6));
  stats.shots++;
  VM.kick = 0.6; view.shake = Math.max(view.shake, 0.08);
}
// しばらく被弾しないと回復
export function regenTick(e, dt) {
  e.sinceHit += dt;
  if (!e.dead && e.sinceHit > RULES.regenDelay && e.hp < e.def.hp) { e.hp = Math.min(e.def.hp, e.hp + RULES.regenRate * dt); e.regen = true; }
  else e.regen = false;
}

export function damageBot(res) {
  if (Net.on) Net.send({ t: 'hit', dmg: r2(res.dmg), head: res.head ? 1 : 0, kv: res.kv, po: res.po || 0 });
  else bot.hp -= res.dmg;
  bot.sinceHit = 0;
  // 撃たれたら横移動の向きを変え、撃ってきた場所を覚える
  bot.strafe *= -1; bot.strafeT = rand(0.4, 1); bot.hurtT = 1.2;
  bot.lastKnown.copy(player.pos); if (bot.lostT > 0) bot.lostT = 0.01;
  stats.hits++; stats.dealt += res.dmg; if (res.head) stats.heads++;
  DmgNums.add(res.point, res.dmg, res.head);
  Particles.wood(res.point, cam.getWorldDirection(new V3()), res.head ? 14 : 8);
  botActor.wood.emissive.setRGB(0.6, 0.05, 0.02);
  botActor.flinch = (botActor.flinch || 0) + (res.head ? 0.5 : 0.3);
  const killed = !Net.on && bot.hp <= 0;
  showHitmarker(killed ? 'kill' : res.head ? 'head' : '');
  SFX.play(res.head ? 'head' : 'hit');
  if (killed) killBot();
}

// ================= 砂漠の神殿の仕掛け =================
// 壺が割れた：素焼きのかけらと砂けむり
PHYS.onBreak = (p, kind) => {
  if (kind !== 'jar') return;
  Particles.shards(p, [P.daidai[1], P.daidai[0], P.kiji[2]], 14, 0.9);
  Particles.dust(p, 8, 1.2);
  SFX.play('jarBreak', p);
};
