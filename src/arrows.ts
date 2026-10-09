// 矢（弓の弾）：重力で落ちる飛び道具。刺さった矢はしばらく残る。追尾の矢は相手を追いかける
import { Net } from './net';
import { Gadgets } from './gadgets';
import { P } from './palette';
import * as THREE from 'three';
import { C, V3 } from './core';
import { SFX } from './audio';
import { mat, scene, toon } from './render';
import { PHYS, blockers, physOf } from './physics';
import { Particles } from './effects';
import { act, botActor, damageBot, eyeOf, player, ray, skillDamageMul } from './game';
import { damagePlayer } from './ai';
import { applyPoison } from './promo';

export const Arrows = (() => {
  const shaftGeo = new THREE.CylinderGeometry(0.016, 0.016, 1, 5); shaftGeo.rotateX(Math.PI / 2);
  const tipGeo = new THREE.ConeGeometry(0.04, 0.13, 5); tipGeo.rotateX(Math.PI / 2); tipGeo.translate(0, 0, 0.56);
  const featherGeo = new THREE.PlaneGeometry(0.16, 0.06); featherGeo.rotateY(Math.PI / 2); featherGeo.translate(0, 0.04, -0.4);
  const shaftM = mat(P.kiji[0]), tipM = mat(P.sumi[2], { metalness: 0.4, roughness: 0.4 });
  const featherM = toon({ color: C(P.shu[1]), side: THREE.DoubleSide, roughness: 0.9 });
  const glowM = toon({ color: C(P.kiji[0]), emissive: C(P.mizu[1]), emissiveIntensity: 1.2 });
  const TIP = 0.56;   // 矢の中心から先端まで

  function makeArrow(homing) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(shaftGeo, homing ? glowM : shaftM), new THREE.Mesh(tipGeo, tipM));
    for (let i = 0; i < 3; i++) { const f = new THREE.Mesh(featherGeo, featherM); f.rotation.z = i * Math.PI * 2 / 3; g.add(f); }
    g.traverse((o: any) => { if (o.isMesh) o.castShadow = true; });
    return g;
  }

  const live = [], stuck = [], ghosts = [];
  const orient = a => { a.mesh.position.copy(a.pos); a.mesh.lookAt(a.pos.clone().add(a.vel)); };
  const chestOf = e => new V3(e.pos.x, e.pos.y + e.height * 0.6, e.pos.z);

  // o: { owner, target, pos, vel, dmg, head, gravity, homing, turn }
  function fire(o) {
    const a = Object.assign({}, o, { pos: o.pos.clone(), vel: o.vel.clone(), life: 6, whiz: false });
    a.mesh = makeArrow(a.homing);
    scene.add(a.mesh); orient(a);
    live.push(a);
  }

  function keepStuck(m) {
    stuck.push(m);
    if (stuck.length > 30) { const o = stuck.shift(); if (o.parent) o.parent.remove(o); }
  }

  // 相手に命中
  function hitTarget(a, point, dir) {
    const t = a.target;
    const head = point.y > t.pos.y + t.height * 0.76;
    const mul = skillDamageMul(t, a.owner.pos);
    const dmg = a.dmg * (head ? a.head : 1) * mul;
    if (mul < 1 && act(t, 'guard')) SFX.play('guard', point);
    SFX.play('arrowHit', point);
    if (a.poison && !t.dead) applyPoison(t, a.poison, a.owner);   // 毒矢
    if (t.isBot) {
      damageBot({ dmg, head, point, po: a.poison ? 1 : 0 });
      SFX.play('ding');   // 当たった「ピン」
      // 駒に刺さったまま残る
      a.mesh.position.copy(point).addScaledVector(dir, 0.25 - TIP);
      botActor.body.attach(a.mesh); keepStuck(a.mesh);
    } else {
      if (!Net.on) damagePlayer(dmg, a.owner.pos);
      scene.remove(a.mesh);
    }
  }
  // 壁や小物に刺さる
  function stick(a, wall, dir) {
    a.mesh.position.copy(wall.point).addScaledVector(dir, 0.22 - TIP);
    const n = wall.face ? wall.face.normal.clone().transformDirection(wall.object.matrixWorld) : dir.clone().negate();
    Particles.impact(wall.point, n);
    SFX.play('arrowHit', wall.point);
    // タレット歩：銃と同じくダメージを与える（壊れたあと宙に浮かないよう、矢は刺さらずに消える）
    const tur = Gadgets.turretOfHit(wall.object);
    if (tur) { Gadgets.damageTurret(tur, a.dmg, a.owner); scene.remove(a.mesh); return; }
    const ph = physOf(wall);
    if (ph) { PHYS.hit(ph, wall.point, dir, a.dmg * 0.12); ph.obj.updateMatrixWorld(true); ph.obj.attach(a.mesh); }
    keepStuck(a.mesh);
  }

  function update(dt) {
    if (dt <= 0) return;
    for (let i = live.length - 1; i >= 0; i--) {
      const a = live[i];
      a.life -= dt;
      const tgt = a.target;
      if (a.homing && !tgt.dead) {
        // 追尾：向きを少しずつ相手の胸へ曲げる（重力なし）
        const want = chestOf(tgt).sub(a.pos).normalize();
        const spd = a.vel.length(), cur = a.vel.clone().normalize();
        const ang = cur.angleTo(want), max = a.turn * dt;
        if (ang > 1e-4) cur.lerp(want, Math.min(1, max / ang)).normalize();
        a.vel.copy(cur).multiplyScalar(spd);
        if (Math.random() < 0.8) Particles.glow(a.pos, P.mizu[1]);
      } else {
        a.vel.y -= a.gravity * dt;
        a.vel.multiplyScalar(Math.max(0, 1 - a.drag * dt));
        // 飛んだ弧が見えるように白い尾を残す
        if (Math.random() < 0.85) Particles.trail(a.pos, a.full ? P.kin[2] : P.shiro[2]);
      }

      const step = a.vel.clone().multiplyScalar(dt), len = step.length(), dir = step.clone().normalize();
      ray.set(a.pos, dir); ray.far = len + TIP;
      const wall = ray.intersectObjects(blockers, true)[0];
      let hit = null;
      if (!tgt.dead) {
        if (tgt.isBot) {
          const h = !botActor.dead && ray.intersectObject(botActor.hitMesh, false)[0];
          if (h) hit = { point: h.point, dist: h.distance };
        } else {
          const r = tgt.radius, p = tgt.pos;
          const hp = ray.ray.intersectBox(new THREE.Box3(new V3(p.x - r, p.y, p.z - r), new V3(p.x + r, p.y + tgt.height, p.z + r)), new V3());
          if (hp && hp.distanceTo(a.pos) <= len + TIP) hit = { point: hp, dist: hp.distanceTo(a.pos) };
        }
      }
      ray.far = Infinity;
      if (hit && (!wall || hit.dist < wall.distance)) { hitTarget(a, hit.point, dir); live.splice(i, 1); continue; }
      if (wall) { stick(a, wall, dir); live.splice(i, 1); continue; }
      a.pos.add(step);
      orient(a);
      // 相手の矢が顔の近くをかすめたら風切り音
      if (a.owner.isBot && !a.whiz && a.pos.distanceTo(eyeOf(player)) < 1.6) { a.whiz = true; SFX.play('whiz', a.pos); }
      if (a.life <= 0 || a.pos.y < -30) { scene.remove(a.mesh); live.splice(i, 1); }
    }
  }

  function clear() {
    live.forEach(a => scene.remove(a.mesh)); live.length = 0;
    stuck.forEach(m => { if (m.parent) m.parent.remove(m); }); stuck.length = 0;
    showGhosts([]);
  }
  // キルカム用：飛んでいる矢の位置と向き
  function snapshot() { return live.map(a => [a.pos.x, a.pos.y, a.pos.z, a.mesh.quaternion.x, a.mesh.quaternion.y, a.mesh.quaternion.z, a.mesh.quaternion.w, a.homing ? 1 : 0]); }
  function showGhosts(list) {
    while (ghosts.length < list.length) { const g = makeArrow(false); scene.add(g); ghosts.push(g); }
    ghosts.forEach((g, i) => {
      const s = list[i];
      g.visible = !!s;
      if (s) { g.position.set(s[0], s[1], s[2]); g.quaternion.set(s[3], s[4], s[5], s[6]); }
    });
  }
  function setLiveVisible(v) { live.forEach(a => { a.mesh.visible = v; }); }

  // 読み込み時の事前準備用（初めて撃ったときに固まらないように）
  const samples = () => [makeArrow(false), makeArrow(true)];
  return { fire, update, clear, snapshot, showGhosts, setLiveVisible, samples, last: () => live[live.length - 1] };
})();
