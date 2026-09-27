// レンダラー・空・光・テクスチャ・駒と銃の形
'use strict';

// ================= レンダラー・シーン =================
const renderer = new THREE.WebGLRenderer({ antialias: Q.aa, powerPreference: 'high-performance' });
let resScale = 1;   // 重いときに自動で下げる解像度の倍率
renderer.setPixelRatio(Q.pr);
renderer.setSize(innerWidth, innerHeight);
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.shadowMap.enabled = Q.shadow > 0;
renderer.shadowMap.type = Q.soft ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
renderer.autoClear = false;
document.body.prepend(renderer.domElement);
const ANISO = renderer.capabilities.getMaxAnisotropy();

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(C(0xd6ecf7), 90, 430);
const cam = new THREE.PerspectiveCamera(80, innerWidth / innerHeight, 0.05, 1500);
cam.rotation.order = 'YXZ';

const SUN_DIR = new V3(0.45, 0.75, 0.35).normalize();
const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: {
    top: { value: new THREE.Color(0x3f8fe0) }, hor: { value: new THREE.Color(0xd6ecf7) },
    bot: { value: new THREE.Color(0x8fb878) }, sun: { value: SUN_DIR },
  },
  vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform vec3 top, hor, bot, sun; varying vec3 vP;
    void main(){
      vec3 d = normalize(vP); float h = d.y;
      vec3 c = h > 0.0 ? mix(hor, top, pow(h, 0.55)) : mix(hor, bot, pow(-h, 0.4));
      float s = max(dot(d, sun), 0.0);
      c += vec3(1.0, 0.92, 0.75) * (smoothstep(0.9975, 0.999, s) * 0.9 + pow(s, 48.0) * 0.25);
      gl_FragColor = vec4(c, 1.0);
    }`,
}));
sky.renderOrder = -1; sky.frustumCulled = false;
scene.add(sky);

scene.add(new THREE.HemisphereLight(C(0xcfe6ff), C(0x7a6040), 0.65));
const sun = new THREE.DirectionalLight(C(0xfff0d6), 1.9);
sun.position.copy(SUN_DIR).multiplyScalar(60);
sun.castShadow = Q.shadow > 0;
sun.shadow.mapSize.set(Q.shadow || 512, Q.shadow || 512);
Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 20, far: 110 });
sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.04;
scene.add(sun);

// ---------- テクスチャ ----------
function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.encoding = THREE.sRGBEncoding;
  t.anisotropy = ANISO;
  return t;
}
function woodGrain(g, w, h, base, dark, n = 60) {
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let i = 0; i < n; i++) {
    g.strokeStyle = `rgba(${dark},${rand(0.05, 0.18)})`; g.lineWidth = rand(1, 4);
    const y = rand(-20, h + 20);
    g.beginPath(); g.moveTo(0, y);
    g.bezierCurveTo(w * 0.3, y + rand(-25, 25), w * 0.7, y + rand(-25, 25), w, y + rand(-15, 15));
    g.stroke();
  }
}
const woodTex = canvasTex(512, 512, (g, w, h) => woodGrain(g, w, h, '#e6b872', '120,70,25'));
const darkWoodTex = canvasTex(512, 512, (g, w, h) => woodGrain(g, w, h, '#8a5a30', '50,25,8'));
darkWoodTex.wrapS = darkWoodTex.wrapT = THREE.RepeatWrapping;
const boardTex = canvasTex(2048, 2048, (g, w) => {
  woodGrain(g, w, w, '#dcab60', '110,65,20', 160);
  const m = w / (2 * H + 2), cell = (w - 2 * m) / 9;
  g.strokeStyle = '#3a2310'; g.lineWidth = 5;
  for (let i = 0; i <= 9; i++) {
    g.beginPath(); g.moveTo(m + i * cell, m); g.lineTo(m + i * cell, w - m); g.stroke();
    g.beginPath(); g.moveTo(m, m + i * cell); g.lineTo(w - m, m + i * cell); g.stroke();
  }
  g.fillStyle = '#3a2310';
  [[3, 3], [6, 3], [3, 6], [6, 6]].forEach(([a, b]) => { g.beginPath(); g.arc(m + a * cell, m + b * cell, 14, 0, 7); g.fill(); });
});
const starTex = canvasTex(128, 128, (g) => {
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,230,1)'); gr.addColorStop(0.25, 'rgba(255,210,120,.9)'); gr.addColorStop(1, 'rgba(255,140,40,0)');
  g.fillStyle = gr;
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 22 : 64, a = i / 10 * Math.PI * 2;
    g.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r);
  }
  g.fill();
});

// ---------- 材質ヘルパー ----------
const mat = (hex, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color: C(hex), roughness: 0.85, flatShading: true }, o));
const pieceWoodMat = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.7 });
const kanjiCache = {};
// small: 動く駒用（目を描く場所を空けるため、字を小さく下げる）
function kanjiMat(ch, red, small) {
  const k = ch + (red ? 'r' : '') + (small ? 's' : '');
  if (kanjiCache[k]) return kanjiCache[k];
  const tex = canvasTex(256, 256, g => {
    g.fillStyle = red ? '#a8161a' : '#1d1208';
    g.font = `900 ${small ? 104 : 136}px "Yu Mincho","Hiragino Mincho ProN","MS Mincho",serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(ch, 128, small ? 172 : 150);
  });
  return kanjiCache[k] = new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 });
}

// ---------- 駒の形 ----------
const pieceShape = new THREE.Shape();
pieceShape.moveTo(0.14, 0); pieceShape.lineTo(0.86, 0); pieceShape.lineTo(0.94, 0.7);
pieceShape.lineTo(0.5, 1); pieceShape.lineTo(0.06, 0.7); pieceShape.closePath();
const PIECE_DEPTH = 0.32;
const pieceGeo = new THREE.ExtrudeGeometry(pieceShape, { depth: 0.25, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.03, bevelSegments: 1 });
pieceGeo.translate(-0.5, -0.5, -0.125);
const planeGeo = new THREE.PlaneGeometry(1, 1);

// 中心が原点、表面(+z)に文字がある駒
function makePiece(ch, w, h, t, woodMat = pieceWoodMat, small = false) {
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
function buildPistol() {
  const g = new THREE.Group();
  const dark = mat(0x2a2c30, { roughness: 0.45, metalness: 0.35, flatShading: false });
  const mid = mat(0x44474d, { roughness: 0.55, metalness: 0.25, flatShading: false });
  const grip = mat(0x5a3a20);
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
  const hand = new THREE.Mesh(new THREE.IcosahedronGeometry(0.07, 0), new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.7, flatShading: true }));
  hand.scale.set(1.05, 1.35, 1.15); hand.position.set(0.006, -0.1, 0.07); hand.castShadow = true;
  g.add(hand);
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.034, -0.24); g.add(muzzle);
  return { g, slide, muzzle, slideZ: slide.position.z, slideAmt: 0.05, ads: new V3(0, -0.075, -0.33) };
}
function buildShotgun() {
  const g = new THREE.Group();
  const dark = mat(0x2a2c30, { roughness: 0.45, metalness: 0.35, flatShading: false });
  const wood = new THREE.MeshStandardMaterial({ map: darkWoodTex, roughness: 0.7 });
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
  const handM = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.7, flatShading: true });
  [[0, -0.1, 0.11], [0, -0.05, -0.3]].forEach(([x, y, z]) => {
    const h = new THREE.Mesh(new THREE.IcosahedronGeometry(0.07, 0), handM);
    h.scale.set(1.05, 1.2, 1.15); h.position.set(x, y, z); h.castShadow = true; g.add(h);
  });
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.03, -0.66); g.add(muzzle);
  return { g, slide: pump, muzzle, slideZ: pump.position.z, slideAmt: 0.09, ads: new V3(0, -0.055, -0.4) };
}
function buildSMG() {
  const g = new THREE.Group();
  const dark = mat(0x2a2c30, { roughness: 0.45, metalness: 0.35, flatShading: false });
  const mid = mat(0x44474d, { roughness: 0.55, metalness: 0.25, flatShading: false });
  const grip = mat(0x5a3a20);
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
  const handM = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.7, flatShading: true });
  [[0, -0.1, 0.09], [0, -0.13, -0.08]].forEach(([x, y, z]) => {
    const h = new THREE.Mesh(new THREE.IcosahedronGeometry(0.066, 0), handM);
    h.scale.set(1.05, 1.2, 1.1); h.position.set(x, y, z); h.castShadow = true; g.add(h);
  });
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.02, -0.32); g.add(muzzle);
  return { g, slide: bolt, muzzle, slideZ: bolt.position.z, slideAmt: 0.04, ads: new V3(0, -0.058, -0.34) };
}
// 弓：setDraw(0〜1) で弦を引く。arrow は番えている矢
function buildBow() {
  const g = new THREE.Group(), bow = new THREE.Group();
  g.add(bow); bow.rotation.z = -0.28;   // 少し傾けて構える
  const woodM = new THREE.MeshStandardMaterial({ map: darkWoodTex, roughness: 0.6 });
  const R = 0.5, arc = 1.6, tipY = R * Math.sin(arc / 2), tipZ = R * (1 - Math.cos(arc / 2));
  const limb = new THREE.Mesh(new THREE.TorusGeometry(R, 0.016, 4, 14, arc), woodM);
  limb.rotation.set(0, Math.PI / 2, -arc / 2); limb.position.z = R;
  limb.castShadow = true; bow.add(limb);
  const gripB = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.1, 0.04), mat(0x5a3a20)); bow.add(gripB);
  const strPos = new Float32Array(9);
  const strGeo = new THREE.BufferGeometry(); strGeo.setAttribute('position', new THREE.BufferAttribute(strPos, 3));
  const string = new THREE.Line(strGeo, new THREE.LineBasicMaterial({ color: 0xf2eee0 }));
  string.frustumCulled = false; bow.add(string);
  const arrowM = new THREE.MeshStandardMaterial({ color: C(0x8a5a30), emissive: C(0x39c6ff), emissiveIntensity: 0 });
  const arrow = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.7, 5), arrowM); shaft.rotation.x = Math.PI / 2; shaft.position.z = -0.35;
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.06, 5), mat(0x4a5058, { metalness: 0.4, roughness: 0.4 })); tip.rotation.x = -Math.PI / 2; tip.position.z = -0.72;
  arrow.add(shaft, tip);
  [0, 2.09, 4.19].forEach(a => {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(0.02, 0.09), new THREE.MeshStandardMaterial({ color: C(0xd8402e), side: THREE.DoubleSide }));
    f.position.set(Math.cos(a) * 0.012, Math.sin(a) * 0.012, -0.06); f.rotation.set(Math.PI / 2, 0, a); arrow.add(f);
  });
  bow.add(arrow);
  const hand = new THREE.Mesh(new THREE.IcosahedronGeometry(0.07, 0), new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.7, flatShading: true }));
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
    hip: new V3(0.09, -0.08, -0.4), ads: new V3(0, -0.012, -0.36), isBow: true };
}
const buildGun = model => model === 'shotgun' ? buildShotgun() : model === 'smg' ? buildSMG() : model === 'bow' ? buildBow() : buildPistol();
// 動く駒の目：縦長のゆるい目。まばたき・倒れると×目
const eyeMat = new THREE.MeshBasicMaterial({ color: 0x241408 });
const eyeGeo = new THREE.CircleGeometry(0.5, 14);
const eyeBarGeo = new THREE.PlaneGeometry(1, 1);
function makeEyes(w, h, z) {
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
const shieldMats = (() => {
  const side = new THREE.MeshStandardMaterial({ map: darkWoodTex, roughness: 0.8 });
  const face = new THREE.MeshStandardMaterial({ map: boardTex, roughness: 0.75 });
  return [side, side, side, side, face, side];
})();
function makeShield(w, h) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.12), shieldMats);
  m.castShadow = true;
  return m;
}
