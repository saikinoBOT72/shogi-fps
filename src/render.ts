// レンダラー・空・光・テクスチャ・駒と銃の形
import { P, css, rgba } from './palette';
import * as THREE from 'three';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';

// 当たり判定（レイキャスト）の高速化：三角形を空間ごとに整理して、調べる範囲を絞る（three-mesh-bvh）
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;
import { gs } from './state';
import { BH, C, LIGHT, Q, V3, rand, settings } from './core';
import { buildDeagle } from './guns/deagle';
import { buildAK47 } from './guns/ak47';
import { buildMk2 } from './guns/mk2';
import { buildM870 } from './guns/m870';
import { buildMP5 } from './guns/mp5';
import { buildB93R } from './guns/b93r';
import { buildM79 } from './guns/m79';
import { buildYumi } from './guns/yumi';
import { buildKarambit } from './guns/karambit';
import { TOON_RAMP, flatGeo, flatten, mat, outlineMat, toon } from './materials';
export { TOON_RAMP, flatGeo, flatten, mat, outlineMat, toon };   // 前からの読み込み先を変えずに使えるように

// ================= レンダラー・シーン =================
export const renderer = new THREE.WebGLRenderer({ antialias: Q.aa, powerPreference: 'high-performance' });
gs.resScale = 1;   // 重いときに自動で下げる解像度の倍率
renderer.setPixelRatio(Q.pr);
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = Q.shadow > 0;
renderer.shadowMap.type = Q.soft ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
renderer.autoClear = false;
document.body.prepend(renderer.domElement);
export const ANISO = renderer.capabilities.getMaxAnisotropy();

export const scene = new THREE.Scene();
scene.fog = new THREE.Fog(C(P.ao[2]), 90, 430);
export const cam = new THREE.PerspectiveCamera(80, innerWidth / innerHeight, 0.05, 1500);
cam.rotation.order = 'YXZ';

export const SUN_DIR = new V3(0.45, 0.75, 0.35).normalize();
export const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: {
    top: { value: new THREE.Color(P.ao[1]) }, hor: { value: new THREE.Color(P.ao[2]) },
    bot: { value: new THREE.Color(P.moegi[2]) }, sun: { value: SUN_DIR },
  },
  vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform vec3 top, hor, bot, sun; varying vec3 vP;
    void main(){
      vec3 d = normalize(vP); float h = d.y;
      vec3 c = h > 0.0 ? mix(hor, top, pow(h, 0.55)) : mix(hor, bot, pow(-h, 0.4));
      float s = max(dot(d, sun), 0.0);
      c += vec3(1.0, 0.92, 0.75) * (smoothstep(0.9975, 0.999, s) * 0.9 + pow(s, 48.0) * 0.25);
      gl_FragColor = vec4(c, 1.0);
      #include <colorspace_fragment>
    }`,
}));
sky.renderOrder = -1; sky.frustumCulled = false;
scene.add(sky);

scene.add(new THREE.HemisphereLight(C(P.ao[2]), C(P.kiji[0]), 0.45 * LIGHT));
export const sun = new THREE.DirectionalLight(C(P.shiro[2]), 1.15 * LIGHT);
sun.position.copy(SUN_DIR).multiplyScalar(60);
sun.castShadow = Q.shadow > 0;
sun.shadow.mapSize.set(Q.shadow || 512, Q.shadow || 512);
Object.assign(sun.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 20, far: 120 });
// 影の縞（シャドウアクネ）が出ないよう、影の地図の1マスぶんくらい面から浮かせる（地図が粗いほど大きく）
sun.shadow.bias = -0.0005; sun.shadow.normalBias = Math.max(0.05, 64 / (Q.shadow || 512) * 1.6);
scene.add(sun); scene.add(sun.target);

// ---------- テクスチャ ----------
export function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = ANISO;
  return t;
}
// 質感の下地：細かい点描（すべてのテクスチャで同じ粒の細かさにして、絵柄をそろえる）
export function speckle(g, w, h, color: number, n: number, alpha = [0.03, 0.09]) {
  for (let i = 0; i < n; i++) { g.fillStyle = rgba(color, rand(alpha[0], alpha[1])); g.fillRect(rand(0, w), rand(0, h), rand(1, 3), rand(1, 3)); }
}
export function woodGrain(g, w, h, base: number, dark: number, n = 60) {
  g.fillStyle = css(base); g.fillRect(0, 0, w, h);
  speckle(g, w, h, dark, w * h / 180);
  for (let i = 0; i < n; i++) {
    g.strokeStyle = rgba(dark, rand(0.06, 0.2)); g.lineWidth = rand(1, 4);
    const y = rand(-20, h + 20);
    g.beginPath(); g.moveTo(0, y);
    g.bezierCurveTo(w * 0.3, y + rand(-25, 25), w * 0.7, y + rand(-25, 25), w, y + rand(-15, 15));
    g.stroke();
  }
}
export const woodTex = canvasTex(512, 512, (g, w, h) => woodGrain(g, w, h, P.kiji[2], P.kiji[0]));
export const darkWoodTex = canvasTex(512, 512, (g, w, h) => woodGrain(g, w, h, P.kiji[0], P.sumi[0]));
darkWoodTex.wrapS = darkWoodTex.wrapT = THREE.RepeatWrapping;
export const boardTex = canvasTex(2048, 2048, (g, w) => {
  woodGrain(g, w, w, P.kiji[1], P.kiji[0], 160);   // 盤は駒（明るい木地）より一段暗く
  const m = w / (2 * BH + 2), cell = (w - 2 * m) / 9;
  g.strokeStyle = css(P.sumi[0]); g.lineWidth = 6;
  for (let i = 0; i <= 9; i++) {
    g.beginPath(); g.moveTo(m + i * cell, m); g.lineTo(m + i * cell, w - m); g.stroke();
    g.beginPath(); g.moveTo(m, m + i * cell); g.lineTo(w - m, m + i * cell); g.stroke();
  }
  g.fillStyle = css(P.sumi[0]);
  [[3, 3], [6, 3], [3, 6], [6, 6]].forEach(([a, b]) => { g.beginPath(); g.arc(m + a * cell, m + b * cell, 14, 0, 7); g.fill(); });
});
export const starTex = canvasTex(128, 128, (g) => {
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, rgba(P.shiro[2], 1)); gr.addColorStop(0.25, rgba(P.kin[2], 0.9)); gr.addColorStop(1, rgba(P.daidai[1], 0));
  g.fillStyle = gr;
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 22 : 64, a = i / 10 * Math.PI * 2;
    g.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r);
  }
  g.fill();
});

// ---------- 材質ヘルパー ----------
export const pieceWoodMat = toon({ map: woodTex });
export const kanjiCache = {};
// small: 動く駒用（目を描く場所を空けるため、字を小さく下げる）
export function kanjiMat(ch, red?, small?) {
  const k = ch + (red ? 'r' : '') + (small ? 's' : '');
  if (kanjiCache[k]) return kanjiCache[k];
  const tex = canvasTex(256, 256, g => {
    g.fillStyle = red ? css(P.shu[0]) : css(P.sumi[0]);
    g.font = `900 ${small ? 104 : 136}px "Yu Mincho","Hiragino Mincho ProN","MS Mincho",serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(ch, 128, small ? 172 : 150);
  });
  return kanjiCache[k] = toon({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
}

// ---------- 駒の形 ----------
export const pieceShape = new THREE.Shape();
pieceShape.moveTo(0.14, 0); pieceShape.lineTo(0.86, 0); pieceShape.lineTo(0.94, 0.7);
pieceShape.lineTo(0.5, 1); pieceShape.lineTo(0.06, 0.7); pieceShape.closePath();
export const PIECE_DEPTH = 0.32;
export const pieceGeo = new THREE.ExtrudeGeometry(pieceShape, { depth: 0.25, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.03, bevelSegments: 1 });
pieceGeo.translate(-0.5, -0.5, -0.125);
export const planeGeo = new THREE.PlaneGeometry(1, 1);

// 中心が原点、表面(+z)に文字がある駒
export function makePiece(ch, w, h, t, woodMat = pieceWoodMat, small = false) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(pieceGeo, woodMat);
  m.scale.set(w, h, t / PIECE_DEPTH);
  m.castShadow = m.receiveShadow = true;
  const d = new THREE.Mesh(planeGeo, kanjiMat(ch, false, small));
  d.scale.set(w, h, 1); d.position.z = t / 2 + 0.004;
  g.add(m, d);
  g.userData.body = m;
  return g;
}

// ---------- 銃モデル ----------
// ハンドガン：デザートイーグル（src/guns/deagle.ts。実銃の寸法から作った見本）
export const handMat = toon({ map: woodTex, flatShading: true });
export function buildPistol() {
  return buildDeagle({ skin: settings.gunSkin, hand: handMat });
}
// 武器の見た目（WEAPONS の model の名前 → 作る関数）
export const GUN_BUILDERS = {
  pistol: buildPistol, burst: () => buildB93R({ hand: handMat }), bow: () => buildYumi({ hand: handMat }), sniper: undefined as any,
  mk2: () => buildMk2({ hand: handMat }), m870: () => buildM870({ hand: handMat }), mp5: () => buildMP5({ hand: handMat }),
  ak: () => buildAK47({ hand: handMat }), m79: () => buildM79({ hand: handMat }), karambit: () => buildKarambit({ hand: handMat }),
};
delete GUN_BUILDERS.sniper;
export const buildGun = model => (GUN_BUILDERS[model] || buildPistol)();
// 動く駒の目：縦長のゆるい目。まばたき・倒れると×目
export const eyeMat = new THREE.MeshBasicMaterial({ color: P.sumi[0] });
export const eyeGeo = new THREE.CircleGeometry(0.5, 14);
export const eyeBarGeo = new THREE.PlaneGeometry(1, 1);
export function makeEyes(w, h, z) {
  const eyes = new THREE.Group();
  const list = [-1, 1].map(s => {
    const e = new THREE.Group();
    e.position.set(s * w * 0.14, h * 0.2, z);
    const oval = new THREE.Mesh(eyeGeo, eyeMat); oval.scale.set(w * 0.055, h * 0.13, 1);
    const cross = new THREE.Group(); cross.visible = false;
    [1, -1].forEach(r => { const b = new THREE.Mesh(eyeBarGeo, eyeMat); b.scale.set(w * 0.035, h * 0.12, 1); b.rotation.z = r * 0.785; cross.add(b); });
    e.add(oval, cross); eyes.add(e);
    return { oval, cross };
  });
  eyes.userData = { list, blinkT: rand(1.5, 4), shut: 0 };
  return eyes;
}
// 盾（将棋盤）：表面に盤の目
export const shieldMats = (() => {
  const side = toon({ map: darkWoodTex, roughness: 0.8 });
  const face = toon({ map: boardTex, roughness: 0.75 });
  return [side, side, side, side, face, side];
})();
export function makeShield(w, h) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.12), shieldMats);
  m.castShadow = true;
  return m;
}
