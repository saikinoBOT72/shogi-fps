// レンダラー・空・光・テクスチャ・駒と銃の形
import { P, css, rgba } from './palette';
import * as THREE from 'three';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';

// 当たり判定（レイキャスト）の高速化：三角形を空間ごとに整理して、調べる範囲を絞る（three-mesh-bvh）
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;
import { gs } from './state';
import { BH, C, LIGHT, Q, V3, rand } from './core';

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
sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.04;
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
  woodGrain(g, w, w, P.kiji[2], P.kiji[0], 160);
  const m = w / (2 * BH + 2), cell = (w - 2 * m) / 9;
  g.strokeStyle = css(P.sumi[1]); g.lineWidth = 5;
  for (let i = 0; i <= 9; i++) {
    g.beginPath(); g.moveTo(m + i * cell, m); g.lineTo(m + i * cell, w - m); g.stroke();
    g.beginPath(); g.moveTo(m, m + i * cell); g.lineTo(w - m, m + i * cell); g.stroke();
  }
  g.fillStyle = css(P.sumi[1]);
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
// 絵柄：トゥーン調（陰影を4段に塗り分ける）でそろえる。光の反射を計算しない分、軽い
export const TOON_RAMP = new THREE.DataTexture(new Uint8Array([95, 155, 210, 255]), 4, 1, THREE.RedFormat);
TOON_RAMP.minFilter = TOON_RAMP.magFilter = THREE.NearestFilter; TOON_RAMP.needsUpdate = true;
export const toon = (o: any = {}) => {
  const { roughness, metalness, flatShading, ...rest } = o;   // トゥーン材質に無い項目は捨てる
  return new THREE.MeshToonMaterial(Object.assign({ gradientMap: TOON_RAMP }, rest));
};
export const mat = (hex, o: any = {}) => toon(Object.assign({ color: C(hex) }, o));
export const pieceWoodMat = toon({ map: woodTex });
// 丸い形（円錐・円柱・多面体）も面ごとに陰影が分かれるローポリ調にする
const flatCache = new Map();
export function flatGeo(g) {
  if (g.userData.flat) return g;
  if (flatCache.has(g.uuid)) return flatCache.get(g.uuid);
  const f = g.index ? g.toNonIndexed() : g.clone();
  f.computeVertexNormals(); f.userData.flat = true;
  flatCache.set(g.uuid, f);
  return f;
}
const ROUND = new Set(['ConeGeometry', 'CylinderGeometry', 'IcosahedronGeometry', 'TorusGeometry', 'DodecahedronGeometry', 'OctahedronGeometry']);
export function flatten(root) {
  root.traverse((o: any) => { if (o.isMesh && !o.isInstancedMesh && ROUND.has(o.geometry.type)) o.geometry = flatGeo(o.geometry); });
}
// 動く駒の輪郭線（裏返した一回り大きい形を墨色で描く）
export const outlineMat = new THREE.MeshBasicMaterial({ color: P.sumi[0], side: THREE.BackSide });
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
export function buildPistol() {
  const g = new THREE.Group();
  const dark = mat(P.sumi[1], { roughness: 0.45, metalness: 0.35, flatShading: false });
  const mid = mat(P.sumi[2], { roughness: 0.55, metalness: 0.25, flatShading: false });
  const grip = mat(P.kiji[0]);
  const box = (w, h, d, m, x, y, z, rx = 0) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    b.position.set(x, y, z); b.rotation.x = rx; b.castShadow = true; g.add(b); return b;
  };
  const slide = box(0.07, 0.068, 0.3, dark, 0, 0.034, -0.06);
  box(0.064, 0.045, 0.26, mid, 0, -0.02, -0.05);
  box(0.058, 0.15, 0.074, grip, 0, -0.1, 0.05, 0.22);
  box(0.05, 0.012, 0.07, mid, 0, -0.062, -0.03);
  box(0.03, 0.03, 0.02, mid, 0, 0.034, -0.215);
  const fs = box(0.012, 0.018, 0.014, dark, 0, 0.077, -0.2);
  slide.attach(fs);
  [-0.018, 0.018].forEach(x => slide.attach(box(0.01, 0.018, 0.014, dark, x, 0.077, 0.075)));
  const hand = new THREE.Mesh(new THREE.IcosahedronGeometry(0.07, 0), toon({ map: woodTex, roughness: 0.7, flatShading: true }));
  hand.scale.set(1.05, 1.35, 1.15); hand.position.set(0.006, -0.1, 0.07); hand.castShadow = true;
  g.add(hand);
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.034, -0.24); g.add(muzzle);
  return { g, slide, muzzle, slideZ: slide.position.z, slideAmt: 0.05, ads: new V3(0.13, -0.27, -0.44) };
}
export function buildShotgun() {
  const g = new THREE.Group();
  const dark = mat(P.sumi[1], { roughness: 0.45, metalness: 0.35, flatShading: false });
  const wood = toon({ map: darkWoodTex, roughness: 0.7 });
  const box = (w, h, d, m, x, y, z, rx = 0) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    b.position.set(x, y, z); b.rotation.x = rx; b.castShadow = true; g.add(b); return b;
  };
  box(0.07, 0.085, 0.26, dark, 0, 0.01, 0);           // 機関部
  box(0.042, 0.042, 0.52, dark, 0, 0.03, -0.38);       // 銃身
  box(0.034, 0.03, 0.44, dark, 0, -0.014, -0.34);      // 弾倉
  const pump = box(0.064, 0.052, 0.17, wood, 0, -0.014, -0.3);
  box(0.058, 0.1, 0.26, wood, 0, -0.045, 0.24, 0.18);  // 銃床
  box(0.05, 0.11, 0.06, wood, 0, -0.08, 0.1, 0.3);     // グリップ
  box(0.012, 0.014, 0.012, dark, 0, 0.058, -0.62);     // 照星
  const handM = toon({ map: woodTex, roughness: 0.7, flatShading: true });
  [[0, -0.1, 0.11], [0, -0.05, -0.3]].forEach(([x, y, z]) => {
    const h = new THREE.Mesh(new THREE.IcosahedronGeometry(0.07, 0), handM);
    h.scale.set(1.05, 1.2, 1.15); h.position.set(x, y, z); h.castShadow = true; g.add(h);
  });
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.03, -0.66); g.add(muzzle);
  return { g, slide: pump, muzzle, slideZ: pump.position.z, slideAmt: 0.09, ads: new V3(0.15, -0.3, -0.5) };
}
export function buildSMG() {
  const g = new THREE.Group();
  const dark = mat(P.sumi[1], { roughness: 0.45, metalness: 0.35, flatShading: false });
  const mid = mat(P.sumi[2], { roughness: 0.55, metalness: 0.25, flatShading: false });
  const grip = mat(P.kiji[0]);
  const box = (w, h, d, m, x, y, z, rx = 0) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    b.position.set(x, y, z); b.rotation.x = rx; b.castShadow = true; g.add(b); return b;
  };
  box(0.065, 0.075, 0.3, dark, 0, 0.01, -0.02);        // 機関部
  box(0.028, 0.028, 0.14, mid, 0, 0.02, -0.24);        // 銃身
  box(0.038, 0.17, 0.05, mid, 0, -0.1, -0.08, -0.15);  // 弾倉
  box(0.05, 0.12, 0.06, grip, 0, -0.08, 0.08, 0.25);   // グリップ
  box(0.014, 0.016, 0.22, mid, 0.024, 0, 0.22); box(0.014, 0.016, 0.22, mid, -0.024, 0, 0.22); box(0.07, 0.06, 0.02, mid, 0, -0.01, 0.33);
  box(0.012, 0.02, 0.012, dark, 0, 0.058, -0.15);
  [-0.016, 0.016].forEach(x => box(0.008, 0.02, 0.012, dark, x, 0.058, 0.1));
  const bolt = box(0.014, 0.024, 0.06, mid, 0.04, 0.02, 0);
  const handM = toon({ map: woodTex, roughness: 0.7, flatShading: true });
  [[0, -0.1, 0.09], [0, -0.13, -0.08]].forEach(([x, y, z]) => {
    const h = new THREE.Mesh(new THREE.IcosahedronGeometry(0.066, 0), handM);
    h.scale.set(1.05, 1.2, 1.1); h.position.set(x, y, z); h.castShadow = true; g.add(h);
  });
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.02, -0.32); g.add(muzzle);
  return { g, slide: bolt, muzzle, slideZ: bolt.position.z, slideAmt: 0.04, ads: new V3(0.14, -0.28, -0.46) };
}
// 弓：setDraw(0〜1) で弦を引く。arrow は番えている矢
export function buildBow() {
  const g = new THREE.Group(), bow = new THREE.Group();
  g.add(bow); bow.rotation.z = -0.28;   // 少し傾けて構える
  const woodM = toon({ map: darkWoodTex, roughness: 0.6 });
  const R = 0.5, arc = 1.6, tipY = R * Math.sin(arc / 2), tipZ = R * (1 - Math.cos(arc / 2));
  const limb = new THREE.Mesh(new THREE.TorusGeometry(R, 0.016, 4, 14, arc), woodM);
  limb.rotation.set(0, Math.PI / 2, -arc / 2); limb.position.z = R;
  limb.castShadow = true; bow.add(limb);
  const gripB = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.1, 0.04), mat(P.kiji[0])); bow.add(gripB);
  const strPos = new Float32Array(9);
  const strGeo = new THREE.BufferGeometry(); strGeo.setAttribute('position', new THREE.BufferAttribute(strPos, 3));
  const string = new THREE.Line(strGeo, new THREE.LineBasicMaterial({ color: P.shiro[1] }));
  string.frustumCulled = false; bow.add(string);
  const arrowM = toon({ color: C(P.kiji[0]), emissive: C(P.mizu[1]), emissiveIntensity: 0 });
  const arrow = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.7, 5), arrowM); shaft.rotation.x = Math.PI / 2; shaft.position.z = -0.35;
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.06, 5), mat(P.sumi[2], { metalness: 0.4, roughness: 0.4 })); tip.rotation.x = -Math.PI / 2; tip.position.z = -0.72;
  arrow.add(shaft, tip);
  [0, 2.09, 4.19].forEach(a => {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(0.02, 0.09), toon({ color: C(P.shu[1]), side: THREE.DoubleSide }));
    f.position.set(Math.cos(a) * 0.012, Math.sin(a) * 0.012, -0.06); f.rotation.set(Math.PI / 2, 0, a); arrow.add(f);
  });
  bow.add(arrow);
  const hand = new THREE.Mesh(new THREE.IcosahedronGeometry(0.07, 0), toon({ map: woodTex, roughness: 0.7, flatShading: true }));
  hand.scale.set(1.05, 1.3, 1.1); bow.add(hand);
  const pull = new THREE.Mesh(new THREE.IcosahedronGeometry(0.06, 0), hand.material); bow.add(pull);
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0, -0.7); bow.add(muzzle);
  function setDraw(k) {
    const nz = tipZ + 0.3 * k;
    strPos.set([0, tipY, tipZ, 0, 0, nz, 0, -tipY, tipZ]); strGeo.attributes.position.needsUpdate = true;
    arrow.position.z = nz; pull.position.set(0, -0.02, nz + 0.03);
    limb.scale.set(1, 1, 1 - 0.12 * k);   // 引くとしなる
  }
  setDraw(0);
  return { g, slide: new THREE.Object3D(), muzzle, slideZ: 0, slideAmt: 0, setDraw, arrow, arrowM,
    hip: new V3(0.17, -0.2, -0.42), ads: new V3(0.2, -0.28, -0.42), isBow: true };
}
// 銃を組み立てる共通の道具
export function gunKit() {
  const dark = mat(P.sumi[1], { roughness: 0.45, metalness: 0.35, flatShading: false });
  const mid = mat(P.sumi[2], { roughness: 0.55, metalness: 0.25, flatShading: false });
  const wood = toon({ map: darkWoodTex, roughness: 0.7 });
  const handM = toon({ map: woodTex, roughness: 0.7, flatShading: true });
  const g = new THREE.Group();
  const box = (w, h, d, m, x, y, z, rx = 0) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.rotation.x = rx; b.castShadow = true; g.add(b); return b; };
  const cyl = (r, len, m, x, y, z, seg = 8) => { const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), m); c.rotation.x = Math.PI / 2; c.position.set(x, y, z); c.castShadow = true; g.add(c); return c; };
  const hand = (x, y, z) => { const h = new THREE.Mesh(new THREE.IcosahedronGeometry(0.066, 0), handM); h.scale.set(1.05, 1.2, 1.1); h.position.set(x, y, z); h.castShadow = true; g.add(h); return h; };
  const muzzleAt = (x, y, z) => { const o = new THREE.Object3D(); o.position.set(x, y, z); g.add(o); return o; };
  return { g, dark, mid, wood, box, cyl, hand, muzzleAt };
}
export function buildRevolver() {
  const K = gunKit();
  K.box(0.05, 0.07, 0.16, K.dark, 0, 0.02, 0);
  K.cyl(0.018, 0.2, K.mid, 0, 0.035, -0.17, 8);
  K.cyl(0.04, 0.07, K.mid, 0, 0.01, -0.02, 6);            // 回転弾倉
  K.box(0.045, 0.13, 0.06, K.wood, 0, -0.07, 0.07, 0.35);
  const hammer = K.box(0.014, 0.03, 0.02, K.dark, 0, 0.06, 0.08);
  K.box(0.01, 0.016, 0.012, K.dark, 0, 0.058, -0.25);
  K.hand(0, -0.09, 0.08);
  return { g: K.g, slide: hammer, muzzle: K.muzzleAt(0, 0.035, -0.28), slideZ: hammer.position.z, slideAmt: 0.02, ads: new V3(0.13, -0.27, -0.44) };
}
export function buildSniper() {
  const K = gunKit();
  K.box(0.06, 0.07, 0.34, K.dark, 0, 0.01, 0);
  K.cyl(0.017, 0.62, K.mid, 0, 0.025, -0.47, 8);
  K.cyl(0.03, 0.26, K.dark, 0, 0.085, -0.02, 10);         // スコープ
  K.cyl(0.036, 0.04, K.dark, 0, 0.085, -0.15, 10); K.cyl(0.036, 0.04, K.dark, 0, 0.085, 0.11, 10);
  K.box(0.056, 0.1, 0.34, K.wood, 0, -0.04, 0.3, 0.1);
  K.box(0.045, 0.1, 0.05, K.wood, 0, -0.07, 0.1, 0.3);
  const bolt = K.box(0.05, 0.014, 0.014, K.mid, 0.045, 0.03, 0.08);
  K.hand(0, -0.09, 0.1); K.hand(0, -0.04, -0.22);
  return { g: K.g, slide: bolt, muzzle: K.muzzleAt(0, 0.025, -0.8), slideZ: bolt.position.z, slideAmt: 0.06, ads: new V3(0.15, -0.32, -0.5) };
}
export function buildAR() {
  const K = gunKit();
  K.box(0.06, 0.08, 0.36, K.dark, 0, 0.01, -0.02);
  K.box(0.066, 0.066, 0.2, K.mid, 0, 0.012, -0.28);
  K.cyl(0.014, 0.12, K.dark, 0, 0.02, -0.44, 6);
  K.box(0.036, 0.15, 0.06, K.mid, 0, -0.1, -0.06, -0.3);
  K.box(0.045, 0.11, 0.055, K.wood, 0, -0.08, 0.1, 0.3);
  K.box(0.05, 0.08, 0.2, K.wood, 0, -0.01, 0.28);
  K.box(0.02, 0.02, 0.2, K.dark, 0, 0.06, -0.04);
  const bolt = K.box(0.014, 0.022, 0.05, K.mid, 0.036, 0.025, 0.02);
  K.hand(0, -0.09, 0.1); K.hand(0, -0.05, -0.28);
  return { g: K.g, slide: bolt, muzzle: K.muzzleAt(0, 0.02, -0.5), slideZ: bolt.position.z, slideAmt: 0.04, ads: new V3(0.15, -0.29, -0.5) };
}
export function buildLauncher() {
  const K = gunKit();
  K.cyl(0.05, 0.5, K.dark, 0, 0.03, -0.18, 10);
  const drum = K.cyl(0.075, 0.12, K.mid, 0, -0.01, 0.06, 6);   // 回転弾倉
  K.box(0.045, 0.11, 0.055, K.wood, 0, -0.08, 0.15, 0.3);
  K.box(0.05, 0.07, 0.2, K.wood, 0, 0, 0.3);
  K.box(0.04, 0.04, 0.12, K.wood, 0, -0.04, -0.25);
  K.hand(0, -0.09, 0.15); K.hand(0, -0.07, -0.25);
  return { g: K.g, slide: drum, muzzle: K.muzzleAt(0, 0.03, -0.45), slideZ: drum.position.z, slideAmt: 0.02, ads: new V3(0.17, -0.31, -0.52) };
}
export const GUN_BUILDERS = { pistol: buildPistol, shotgun: buildShotgun, smg: buildSMG, bow: buildBow, revolver: buildRevolver, sniper: buildSniper, ar: buildAR, launcher: buildLauncher };
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
