// グレネード（角の武器）と煙幕（角のスキル）
import * as THREE from 'three';
import { V3, clamp, rand } from './core';
import { SFX } from './audio';
import { canvasTex, mat, scene } from './render';
import { PHYS, blockers } from './physics';
import { Particles } from './effects';
import { bot, damageBot, eyeOf, hasLOS, player, ray, skillDamageMul, view } from './game';
import { damagePlayer } from './ai';
import { killBot } from './hud';

// グレネード：速くまっすぐ気味に飛び、何かに当たった瞬間に爆発
export const Grenades = (() => {
  const geo = new THREE.IcosahedronGeometry(0.14, 0);
  const m = mat(0x3d5a2e, { roughness: 0.6 });
  const bandM = mat(0xc9a13a, { roughness: 0.5 });
  const list = [];

  // o: { owner, target, pos, vel, dmg, radius, gravity, fuse }
  function fire(o) {
    const mesh = new THREE.Mesh(geo, m);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.025, 4, 8), bandM); mesh.add(band);
    mesh.castShadow = true; scene.add(mesh);
    list.push(Object.assign({}, o, { pos: o.pos.clone(), vel: o.vel.clone(), mesh, spin: new V3(rand(-9, 9), rand(-9, 9), rand(-9, 9)), bounces: 0 }));
  }
  const chestOf = e => new V3(e.pos.x, e.pos.y + e.height * 0.55, e.pos.z);

  function explode(g) {
    scene.remove(g.mesh);
    const p = g.pos;
    for (const e of [player, bot]) {
      if (!e || e.dead) continue;
      const c = chestOf(e), d = c.distanceTo(p);
      if (d > g.radius) continue;
      let k = 1 - d / g.radius;
      if (!hasLOS(p, c)) k *= 0.35;               // 物陰なら弱まる
      let dmg = g.dmg * (0.25 + 0.75 * k) * skillDamageMul(e, p);
      if (e === g.owner) dmg *= 0.4;               // 自分も少し巻き込まれる
      const push = c.clone().sub(p).setY(0).normalize().multiplyScalar(9 * k);
      e.vel.add(push); e.vy = Math.max(e.vy, 5 * k); e.onGround = false;
      if (e.isBot) {
        if (g.owner === player) damageBot({ dmg, head: false, point: c });
        else { bot.hp -= dmg; bot.sinceHit = 0; if (bot.hp <= 0) killBot(); }
      } else damagePlayer(dmg, p);
    }
    PHYS.blast(p, g.radius * 1.6, 10);
    Particles.explosion(p);
    SFX.play('boom', p);
    const dp = p.distanceTo(eyeOf(player));
    view.shake = Math.max(view.shake, clamp(1 - dp / 18, 0, 1) * 0.9);
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
  return { fire, update, clear };
})();

// 煙幕：その場に煙の玉を張る。中や向こう側は見えない（CPUも見えない）
export const Smoke = (() => {
  const tex = canvasTex(128, 128, g => {
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(235,235,235,1)'); gr.addColorStop(0.55, 'rgba(215,215,215,.7)'); gr.addColorStop(1, 'rgba(200,200,200,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  });
  const clouds = [];
  function spawn(pos, r, life) {
    const g = new THREE.Group(), puffs = [];
    for (let i = 0; i < 24; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xdcdcdc, transparent: true, depthWrite: false, opacity: 0 }));
      const off = new V3(rand(-1, 1), rand(-0.5, 1), rand(-1, 1)).normalize().multiplyScalar(r * rand(0.1, 0.75));
      puffs.push({ s, off, sc: r * rand(0.8, 1.25), rot: rand(-0.3, 0.3) });
      g.add(s);
    }
    g.position.copy(pos);
    scene.add(g);
    clouds.push({ g, puffs, pos: pos.clone(), r, t: 0, life });
    SFX.play('smoke', pos);
  }
  function update(dt) {
    for (let i = clouds.length - 1; i >= 0; i--) {
      const c = clouds[i];
      c.t += dt;
      const grow = Math.min(1, c.t / 0.8), fade = clamp((c.life - c.t) / 1.5, 0, 1);
      for (const p of c.puffs) {
        p.s.position.copy(p.off).multiplyScalar(0.3 + 0.7 * grow);
        p.s.position.y += c.t * 0.08;
        p.s.scale.setScalar(p.sc * (0.4 + 0.6 * grow));
        p.s.material.opacity = 0.9 * fade;
        p.s.material.rotation += p.rot * dt;
      }
      c.eff = c.r * 0.85 * grow * (fade > 0.3 ? 1 : fade / 0.3);
      if (c.t >= c.life) { scene.remove(c.g); clouds.splice(i, 1); }
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
  function clear() { clouds.forEach(c => scene.remove(c.g)); clouds.length = 0; }
  // その位置（足元）が煙の中か
  const inside = p => clouds.some(c => c.eff > 0.3 && c.pos.distanceTo(new V3(p.x, p.y + 1, p.z)) < c.eff);
  return { spawn, update, blocks, clear, inside };
})();
