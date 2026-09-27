// グレネード（角の武器）と煙幕（角のスキル）
import { P, rgba } from './palette';
import * as THREE from 'three';
import { C, V3, clamp, rand } from './core';
import { SFX } from './audio';
import { flatGeo, mat, scene, toon } from './render';
import { track } from './gadgets';
import { PHYS, blockers } from './physics';
import { Particles } from './effects';
import { bot, damageBot, eyeOf, hasLOS, player, ray, skillDamageMul, view } from './game';
import { damagePlayer } from './ai';
import { killBot } from './hud';

// 爆発：範囲内の駒にダメージと吹き飛ばし。knock: 吹き飛ばしの倍率 / big: 大玉（見た目も大きく）
export function explodeAt(p, owner, dmgBase, radius, knock = 1, big = false) {
  const chestOf = e => new V3(e.pos.x, e.pos.y + e.height * 0.55, e.pos.z);
  for (const e of [player, bot]) {
    if (!e || e.dead) continue;
    const c = chestOf(e), d = c.distanceTo(p);
    if (d > radius) continue;
    let k = 1 - d / radius;
    if (!hasLOS(p, c)) k *= 0.35;               // 物陰なら弱まる
    let dmg = dmgBase * (0.25 + 0.75 * k) * skillDamageMul(e, p);
    if (e === owner) dmg *= 0.4;                 // 自分も少し巻き込まれる
    const kk = big ? Math.max(k, 0.5) : k;       // 大玉は範囲のどこでも大きく飛ぶ
    const push = c.clone().sub(p).setY(0).normalize().multiplyScalar(9 * kk * knock);
    e.vel.add(push); e.vy = Math.max(e.vy, 5 * kk * Math.min(knock, 2)); e.onGround = false;
    if (e.isBot) {
      if (owner === player) damageBot({ dmg, head: false, point: c });
      else { bot.hp -= dmg; bot.sinceHit = 0; if (bot.hp <= 0) killBot(); }
    } else damagePlayer(dmg, p);
  }
  PHYS.blast(p, radius * 1.6, 10 * knock);
  Particles.explosion(p);
  if (big) { Particles.explosion(p.clone().add(new V3(0.8, 0.3, 0))); Particles.explosion(p.clone().add(new V3(-0.8, 0.5, 0.4))); }
  SFX.play('boom', p);
  const dp = p.distanceTo(eyeOf(player));
  view.shake = Math.max(view.shake, clamp(1 - dp / 18, 0, 1) * (big ? 1.2 : 0.9));
}

// グレネード：速くまっすぐ気味に飛び、何かに当たった瞬間に爆発
export const Grenades = (() => {
  const geo = flatGeo(new THREE.IcosahedronGeometry(0.14, 0));
  const m = mat(P.moegi[0], { roughness: 0.6 });
  const bandM = mat(P.kin[1], { roughness: 0.5 });
  const list = [];

  // o: { owner, target, pos, vel, dmg, radius, gravity, fuse }
  function fire(o) {
    const mesh = new THREE.Mesh(geo, m);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.025, 4, 8), bandM); mesh.add(band);
    mesh.castShadow = true; scene.add(mesh);
    if (o.big) mesh.scale.setScalar(2.4);   // 大玉
    list.push(Object.assign({}, o, { pos: o.pos.clone(), vel: o.vel.clone(), mesh, spin: new V3(rand(-9, 9), rand(-9, 9), rand(-9, 9)), bounces: 0 }));
  }
  const chestOf = e => new V3(e.pos.x, e.pos.y + e.height * 0.55, e.pos.z);

  function explode(g) {
    scene.remove(g.mesh);
    explodeAt(g.pos, g.owner, g.dmg, g.radius, g.knock || 1, g.big);
  }

  function update(dt) {
    if (dt <= 0) return;
    for (let i = list.length - 1; i >= 0; i--) {
      const g = list[i];
      g.fuse -= dt;
      g.vel.y -= g.gravity * dt;
      const step = g.vel.clone().multiplyScalar(dt), len = step.length();
      if (len > 1e-5) {
        const dir = step.clone().normalize();
        ray.set(g.pos, dir); ray.far = len + 0.14;
        let hit: any = ray.intersectObjects(blockers, true)[0];
        // 相手の体を通り抜けないよう、進む線分で当たりを見る（速いので点の判定だと飛び越える）
        const t = g.target;
        if (!t.dead) {
          const r = t.radius + 0.15, p = t.pos;
          const hp = ray.ray.intersectBox(new THREE.Box3(new V3(p.x - r, p.y, p.z - r), new V3(p.x + r, p.y + t.height, p.z + r)), new V3());
          if (hp && hp.distanceTo(g.pos) <= len + 0.14 && (!hit || hp.distanceTo(g.pos) < hit.distance)) hit = { point: hp, direct: true };
        }
        ray.far = Infinity;
        if (hit && hit.direct) { g.pos.copy(hit.point); g.fuse = 0; }
        else if (hit) {
          // 何かに当たったらその場で爆発
          const n = hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : dir.clone().negate();
          g.pos.copy(hit.point).addScaledVector(n, 0.15);
          const ph = hit.object.userData.phys;
          if (ph) PHYS.hit(ph, hit.point, dir, 3);
          g.fuse = 0;
        } else g.pos.add(step);
      }
      // 相手に直撃
      const t = g.target;
      if (!t.dead) {
        const c = chestOf(t);
        if (Math.hypot(g.pos.x - c.x, g.pos.z - c.z) < t.radius + 0.2 && g.pos.y > t.pos.y - 0.1 && g.pos.y < t.pos.y + t.height + 0.1) g.fuse = 0;
      }
      g.mesh.position.copy(g.pos);
      g.mesh.rotation.x += g.spin.x * dt; g.mesh.rotation.y += g.spin.y * dt; g.mesh.rotation.z += g.spin.z * dt;
      if (g.fuse <= 0 || g.pos.y < -20) { if (g.pos.y > -20) explode(g); else scene.remove(g.mesh); list.splice(i, 1); }
    }
  }
  function clear() { list.forEach(g => scene.remove(g.mesh)); list.length = 0; }
  const makeMesh = () => { const s = new THREE.Mesh(geo, m); s.add(new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.025, 4, 8), bandM)); return s; };
  const samples = () => [makeMesh()];
  // リプレイ用：飛んでいる弾の位置と回転
  const ghosts = [];
  const snapshot = () => list.map(g => [g.pos.x, g.pos.y, g.pos.z, g.mesh.rotation.x, g.mesh.rotation.y, g.mesh.rotation.z, g.mesh.scale.x]);
  function showGhosts(snap) {
    while (ghosts.length < snap.length) { const s = makeMesh(); scene.add(s); ghosts.push(s); }
    ghosts.forEach((g, i) => { const s = snap[i]; g.visible = !!s; if (s) { g.position.set(s[0], s[1], s[2]); g.rotation.set(s[3], s[4], s[5]); g.scale.setScalar(s[6] || 1); } });
  }
  const setLiveVisible = v => list.forEach(g => { g.mesh.visible = v; });
  return { fire, update, clear, samples, snapshot, showGhosts, setLiveVisible };
})();

// 煙幕：その場に球の煙幕を張る。中や向こう側は見えない（CPUも見えない）
export const Smoke = (() => {
  const geo = flatGeo(new THREE.IcosahedronGeometry(1, 2));
  const clouds = [];
  function spawn(pos, r, life) {
    const m = track(new THREE.Mesh(geo, toon({ color: C(P.nezumi[2]), emissive: C(P.ai[0]), emissiveIntensity: 0.25, transparent: true, opacity: 0.96, side: THREE.DoubleSide })));
    m.position.copy(pos); m.scale.setScalar(0.01);
    clouds.push({ m, pos: pos.clone(), r, t: 0, life });
    SFX.play('smoke', pos);
  }
  function update(dt) {
    for (let i = clouds.length - 1; i >= 0; i--) {
      const c = clouds[i];
      c.t += dt;
      const grow = Math.min(1, c.t / 0.6), g = 1 - (1 - grow) * (1 - grow), fade = clamp((c.life - c.t) / 1, 0, 1);
      c.m.scale.setScalar(Math.max(0.01, c.r * g)); c.m.material.opacity = 0.96 * fade;
      c.eff = c.r * 0.95 * g * (fade > 0.3 ? 1 : fade / 0.3);
      if (c.t >= c.life) { c.m.visible = false; clouds.splice(i, 1); }
    }
  }
  // a→b の線が煙の玉を通るか
  function blocks(a, b) {
    for (const c of clouds) {
      if (!(c.eff > 0.3)) continue;
      const ab = b.clone().sub(a), t = clamp(c.pos.clone().sub(a).dot(ab) / ab.lengthSq(), 0, 1);
      if (a.clone().addScaledVector(ab, t).distanceTo(c.pos) < c.eff) return true;
    }
    return false;
  }
  function clear() { clouds.length = 0; }   // 形は Gadgets.clear で消える
  // その位置（足元）が煙の中か
  const inside = p => clouds.some(c => c.eff > 0.3 && c.pos.distanceTo(new V3(p.x, p.y + 1, p.z)) < c.eff);
  const samples = () => [new THREE.Mesh(geo, toon({ color: C(P.nezumi[2]), transparent: true, side: THREE.DoubleSide }))];
  return { spawn, update, blocks, clear, inside, samples };
})();
