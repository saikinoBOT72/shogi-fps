// 画面の主役：3D の駒（タイトル・一騎打ちの駒選び）
// ゲームの描画とは別の小さな描画。画面に置いた入れ物（host）が残っている間だけ動かす
import * as THREE from 'three';
import { P } from './palette';
import { C, LIGHT, PIECES, WEAPONS } from './core';
import { scene as mainScene } from './render';
import { buildActor } from './effects';
import { equippedRef, paintGun } from './loadout';

let renderer: THREE.WebGLRenderer | null = null, scene: THREE.Scene, camera: THREE.PerspectiveCamera;
let actor: any = null, host: HTMLElement | null = null, running = false, t = 0, last = 0, spin = false;
const actors = new Map<string, any>();

function init() {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(26, 1, 0.1, 50);
  // 正面からやわらかく、斜め上から日の光、うしろから赤い縁の光
  scene.add(new THREE.HemisphereLight(C(P.shiro[2]), C(P.kiji[0]), 0.7 * LIGHT));
  const key = new THREE.DirectionalLight(C(P.shiro[2]), 1.2 * LIGHT); key.position.set(2, 3, 4); scene.add(key);
  const rim = new THREE.DirectionalLight(C(P.aka[1]), 1.6 * LIGHT); rim.position.set(-3, 1.6, -2.5); scene.add(rim);
  // 足もとの影（ぼかした丸）
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(0,0,0,.55)'); r.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.3), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.01; scene.add(shadow);
}
function actorFor(type: string, mine: boolean) {
  const d = PIECES[type] || PIECES.P, model = WEAPONS[d.weapon].model, key = type + (mine ? ':me' : ':foe');
  if (!actors.has(key)) {
    const A = buildActor(d.name, d.size, model);
    mainScene.remove(A.root);   // buildActor はゲームの場面に置くので、こちらへ移す
    actors.set(key, A);
  }
  const A = actors.get(key);
  paintGun(A.gun, mine ? equippedRef(model) : null);   // 自分の駒は装備しているスキンで
  return A;
}
// host の中に駒を映す。type：PIECES の種類 / mine：自分の駒（スキンを付ける）/ spinOn：ゆっくり回し続ける
export function showHero(el: HTMLElement, type: string, mine = true, spinOn = false) {
  if (!renderer) init();
  host = el; el.appendChild(renderer.domElement);
  const A = actorFor(type, mine);
  if (actor !== A) { if (actor) scene.remove(actor.root); actor = A; scene.add(A.root); A.root.position.set(0, 0, 0); }
  spin = spinOn;
  if (!running) { running = true; last = performance.now(); requestAnimationFrame(loop); }
}
function loop(now: number) {
  if (!running || !renderer) return;
  if (!host || !host.isConnected || host.offsetParent === null) { running = false; return; }   // 画面が替わった・隠れたら止める（対局中に裏で描かない）
  const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
  const w = host.clientWidth, h = host.clientHeight;
  if (w && h) {
    const pr = renderer.getPixelRatio();
    if (renderer.domElement.width !== Math.round(w * pr) || renderer.domElement.height !== Math.round(h * pr)) { renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
    // 駒（高さ ht）と銃（横に約 1.1 倍の幅）が入る距離から見る。縦長・横長どちらの箱でも収まるように
    const ht = actor ? actor.h : 1.85, half = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const dist = Math.max(ht * 0.9 / half, ht * 0.7 / (half * camera.aspect));
    camera.position.set(0, ht * 0.62, dist); camera.lookAt(0, ht * 0.5, 0);
    if (actor) actor.root.rotation.y = spin ? t * 0.6 : -0.45 + Math.sin(t * 0.5) * 0.28;
    renderer.render(scene, camera);
  }
  requestAnimationFrame(loop);
}
