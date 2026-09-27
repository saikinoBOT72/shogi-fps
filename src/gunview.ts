// 銃の見本ページ（開発用・guns.html）：形・塗装・動きを1丁ずつ確かめる
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { P, applyCssPalette, css } from './palette';
import { LIGHT } from './core';
import { toon } from './materials';
import { SKINS } from './guns/skins';
import { buildDeagle } from './guns/deagle';

applyCssPalette();
const style = document.createElement('style');
style.textContent = `
  body { margin: 0; overflow: hidden; background: ${css(P.sumi[0])}; font-family: system-ui, sans-serif; color: ${css(P.shiro[1])} }
  #gv-ui { position: fixed; left: 16px; top: 12px; width: 300px; max-width: calc(100vw - 32px) }
  #gv-ui h1 { font-size: 20px; margin: 0 0 4px } #gv-ui h1 small { font-size: 14px; color: ${css(P.kin[2])} }
  #gv-ui h2 { font-size: 12px; margin: 12px 0 4px; color: ${css(P.nezumi[2])} }
  #gv-ui p { margin: 0; font-size: 12px; color: ${css(P.nezumi[2])} }
  .gv-row { display: flex; flex-wrap: wrap; gap: 6px }
  .gv-row button { font: inherit; font-size: 13px; padding: 5px 10px; border-radius: 6px; cursor: pointer; border: 1px solid ${css(P.sumi[2])}; background: ${css(P.sumi[1])}; color: inherit }
  .gv-row button.on { border-color: ${css(P.kin[1])}; color: ${css(P.kin[2])} }
  .gv-note { margin-top: 14px !important } .gv-note a { color: ${css(P.mizu[2])} }
`;
document.head.appendChild(style);

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio)); renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(P.ai[0]);
const cam = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.01, 20);
cam.position.set(0.55, 0.12, 0.05);
const ctl = new OrbitControls(cam, renderer.domElement);
ctl.target.set(0, 0.01, -0.05); ctl.enableDamping = true; ctl.update();
// ゲームの一人称の銃と同じ光
scene.add(new THREE.HemisphereLight(new THREE.Color(P.ao[2]), new THREE.Color(P.kiji[0]), 0.8 * LIGHT));
const sun = new THREE.DirectionalLight(new THREE.Color(P.shiro[2]), 1.6 * LIGHT); sun.position.set(0.6, 1, 0.5); scene.add(sun);
// 大きさの目安：10cm ごとの線
const grid = new THREE.GridHelper(0.6, 6, P.nezumi[0], P.sumi[2]); grid.position.y = -0.12; scene.add(grid);

const hand = toon({ color: new THREE.Color(P.kiji[2]) });
let gun = buildDeagle({ hand });
scene.add(gun.g);
const box = new THREE.Box3().setFromObject(gun.g), size = box.getSize(new THREE.Vector3());
document.getElementById('gv-name').textContent = gun.info.name;
document.getElementById('gv-size').textContent = `実銃 ${gun.info.real} ／ この模型 ${Math.round(size.z * 1000)}×${Math.round(size.y * 1000)}×${Math.round(size.x * 1000)}mm（手を含む）`;

// 薬莢が飛ぶ
const casings: any[] = [];
const caseGeo = new THREE.CylinderGeometry(0.0068, 0.0068, 0.033, 6).rotateX(Math.PI / 2);
const caseMat = toon({ color: new THREE.Color(P.kin[2]) });
gun.onEvent = ev => {
  if (ev !== 'eject') return;
  const m = new THREE.Mesh(caseGeo, caseMat);
  gun.eject.getWorldPosition(m.position); scene.add(m);
  casings.push({ m, v: new THREE.Vector3(1.6, 1.8, 0.4), s: new THREE.Vector3(12, 5, 20), t: 0 });
};

const buttons = (id: string, items: [string, string][], fn: (k: string) => void, sel?: string) => {
  const el = document.getElementById(id);
  el.innerHTML = items.map(([k, n]) => `<button data-k="${k}" class="${k === sel ? 'on' : ''}">${n}</button>`).join('');
  el.querySelectorAll('button').forEach((b: HTMLButtonElement) => b.onclick = () => {
    fn(b.dataset.k);
    if (sel !== undefined) el.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
  });
};
buttons('gv-skins', Object.entries(SKINS).map(([k, s]) => [k, s.name]), k => gun.setSkin(k), gun.skin);
let ammo = 7;
buttons('gv-anims', [['fire', '撃つ'], ['last', '最後の1発'], ['reload', 'リロード'], ['inspect', '眺める'], ['equip', '構える']], k => {
  if (k === 'fire') gun.fire(false);
  if (k === 'last') gun.fire(true);
  if (k === 'reload') gun.reload(1.3);
  if (k === 'inspect') gun.inspect();
  if (k === 'equip') gun.equip();
});
let spin = false, slow = 1;
let showHand = true;
buttons('gv-view', [['side', '真横'], ['fps', '一人称'], ['spin', '回す'], ['slow', 'スロー'], ['hand', '手']], k => {
  if (k === 'hand') { showHand = !showHand; gun.g.traverse((o: any) => { if (o.material === hand) o.visible = showHand; }); }
  if (k === 'side') { cam.position.set(0.8, 0.01, -0.05); ctl.target.set(0, 0.01, -0.05); }
  if (k === 'fps') { cam.position.set(-0.2, 0.2, 0.48); ctl.target.set(0, 0, -0.1); }
  if (k === 'spin') spin = !spin;
  if (k === 'slow') slow = slow === 1 ? 0.2 : 1;
});

let last = performance.now();
function frame(now: number) {
  requestAnimationFrame(frame);
  tick(Math.min(0.05, (now - last) / 1000)); last = now;
}
function tick(rdt: number) {
  const dt = rdt * slow;
  gun.anim.update(dt);
  if (spin) gun.g.rotation.y += rdt * 0.6;
  for (let i = casings.length - 1; i >= 0; i--) {
    const c = casings[i]; c.t += dt;
    c.v.y -= 9.8 * dt; c.m.position.addScaledVector(c.v, dt);
    c.m.rotation.x += c.s.x * dt; c.m.rotation.y += c.s.y * dt; c.m.rotation.z += c.s.z * dt;
    if (c.t > 1.2) { scene.remove(c.m); casings.splice(i, 1); }
  }
  ctl.update();
  renderer.render(scene, cam);
}
requestAnimationFrame(frame);
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); });
// 確認用
(window as any).gv = { gun, cam, ctl, scene, renderer, tick, THREE, setGun: (g: any) => { scene.remove(gun.g); gun = g; scene.add(g.g); } };
