// 和弓（桂の弓）見本
// 本物は 2m を超える長さで、握りが下から 1/3 の所にある上下非対称の弓。ゲームでは縮めて、形の特徴（非対称・先が反る）を残す
// 竹の弓に黒い籐（とう）巻き、革の握り、白い羽根の矢
//
// ゲームの弓の決まり（前の弓と同じ）：setDraw(0〜1) で引き具合、arrow（番えた矢）、arrowM（追尾のとき光る材質）、isBow
// 見本ページでは「撃つ」で引いて放つ
import * as THREE from 'three';
import { P } from '../palette';
import { toon, flatGeo } from '../materials';
import { SKINS, skinMaterials } from './skins';

const C = (n: number) => new THREE.Color(n);

export function buildYumi(opt: { hand?: THREE.Material } = {}) {
  const g = new THREE.Group(), bow = new THREE.Group();
  g.add(bow); bow.rotation.z = -0.28;   // 少し傾けて構える
  const woodM = toon({ color: C(P.kiji[1]) }), lacquer = toon({ color: C(P.sumi[0]) }), leather = toon({ color: C(P.kiji[0]) });

  // 弓の形（y: 上下、z: 手前が +）。握り（原点）から上は長く、下は短い。先は前へ反る
  const upper = [[0, 0], [0.2, 0.05], [0.45, 0.13], [0.62, 0.16], [0.72, 0.13]];
  const lower = [[0, 0], [-0.12, 0.04], [-0.26, 0.1], [-0.34, 0.11], [-0.39, 0.08]];
  const limbs = new THREE.Group(); bow.add(limbs);
  const limbMs: THREE.Mesh[] = [], bandMs: THREE.Mesh[] = [];   // 塗装で色を変える所（弓の本体・籐巻き）
  for (const pts of [upper, lower]) {
    const curve = new THREE.CatmullRomCurve3(pts.map(([y, z]) => new THREE.Vector3(0, y, z)));
    const m = new THREE.Mesh(flatGeo(new THREE.TubeGeometry(curve, 14, 0.013, 4)), woodM);
    m.castShadow = true; m.userData.slot = 'frame'; limbs.add(m); limbMs.push(m);
    // 籐巻き（黒い帯）
    for (const t of [0.25, 0.5, 0.8, 0.97]) {
      const b = new THREE.Mesh(flatGeo(new THREE.CylinderGeometry(0.016, 0.016, 0.018, 6)), lacquer);
      b.position.copy(curve.getPoint(t)); b.lookAt(b.position.clone().add(curve.getTangent(t))); b.rotateX(Math.PI / 2);
      b.userData.slot = 'detail'; limbs.add(b); bandMs.push(b);
    }
  }
  const tipU = new THREE.Vector3(0, upper[4][0], upper[4][1]), tipL = new THREE.Vector3(0, lower[4][0], lower[4][1]);
  // 握り（革巻き）
  const grip = new THREE.Mesh(flatGeo(new THREE.CylinderGeometry(0.02, 0.02, 0.12, 6)), leather);
  grip.position.set(0, 0.01, 0.005); grip.userData.slot = 'grip'; bow.add(grip);

  // 弦（上の先 → 番えた所 → 下の先）
  const strPos = new Float32Array(9);
  const strGeo = new THREE.BufferGeometry(); strGeo.setAttribute('position', new THREE.BufferAttribute(strPos, 3));
  const string = new THREE.Line(strGeo, new THREE.LineBasicMaterial({ color: P.shiro[1] }));
  string.frustumCulled = false; bow.add(string);

  // 矢（竹の軸・黒い矢じり・白い羽根）。和弓では矢は弓の右側を通る
  const arrowM = toon({ color: C(P.kiji[2]), emissive: C(P.mizu[1]), emissiveIntensity: 0 });
  const arrow = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.0065, 0.0065, 0.78, 5), arrowM); shaft.rotation.x = Math.PI / 2; shaft.position.z = -0.39;
  const tip = new THREE.Mesh(flatGeo(new THREE.ConeGeometry(0.014, 0.07, 4)), lacquer); tip.rotation.x = -Math.PI / 2; tip.position.z = -0.8;
  arrow.add(shaft, tip);
  const featherM = toon({ color: C(P.shiro[1]), side: THREE.DoubleSide }), bandM = toon({ color: C(P.sumi[1]), side: THREE.DoubleSide });
  [0, 2.09, 4.19].forEach(a => {
    for (const [z, m, h] of [[-0.07, featherM, 0.1], [-0.07, bandM, 0.02]] as [number, THREE.Material, number][]) {
      const f = new THREE.Mesh(new THREE.PlaneGeometry(0.022, h), m);
      f.position.set(Math.cos(a) * 0.012, Math.sin(a) * 0.012, z); f.rotation.set(Math.PI / 2, 0, a); arrow.add(f);
    }
  });
  const ARROW_Y = 0.07;   // 握りの少し上
  arrow.position.set(0.018, ARROW_Y, 0); bow.add(arrow);

  // ---------- スキンの飾り（m 単位。弓の先の飾りは limbs に付けて、引いてしなると一緒に動く） ----------
  const deco: { name: string; slot: string; mesh: THREE.Mesh }[] = [];
  const addDeco = (name: string, slot: string, geo: THREE.BufferGeometry, parent: THREE.Object3D = bow) => {
    const mesh = new THREE.Mesh(geo); mesh.visible = false; mesh.castShadow = true; mesh.userData.slot = slot; parent.add(mesh); deco.push({ name, slot, mesh });
  };
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const curveOf = (pts: number[][]) => new THREE.CatmullRomCurve3(pts.map(([y, z]) => V(0, y, z)));
  const cU = curveOf(upper), cL = curveOf(lower);
  const petalG = (len: number, wid: number) => { const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.quadraticCurveTo(wid, len * 0.5, 0, len); sh.quadraticCurveTo(-wid, len * 0.5, 0, 0); return new THREE.ExtrudeGeometry(sh, { depth: 0.002, bevelEnabled: false, curveSegments: 4 }).translate(0, 0, -0.001); };
  // 房（R）：tassels 両端から下がる紐と玉と房 / crest 握りの後ろの丸い紋
  for (const tip of [tipU, tipL]) {
    addDeco('tassels', 'cord', new THREE.BoxGeometry(0.0016, 0.05, 0.0016).translate(tip.x, tip.y - 0.025, tip.z), limbs);
    addDeco('tassels', 'tassel', new THREE.IcosahedronGeometry(0.007, 1).translate(tip.x, tip.y - 0.056, tip.z), limbs);
    addDeco('tassels', 'tassel', new THREE.ConeGeometry(0.009, 0.045, 7).translate(tip.x, tip.y - 0.085, tip.z), limbs);
  }
  addDeco('crest', 'tassel', new THREE.CylinderGeometry(0.017, 0.017, 0.004, 14).rotateX(Math.PI / 2).translate(0, 0.012, 0.024));
  addDeco('crest', 'cord', new THREE.TorusGeometry(0.017, 0.002, 4, 14).translate(0, 0.012, 0.026));
  // 鈴弓（SR）：bells 上の弓から下がる3つの鈴と、握りの下の鈴の房 / ribbons 握りの下と上の先から長く垂れる布
  {
    const p = cU.getPoint(0.45);
    addDeco('bells', 'cord', new THREE.BoxGeometry(0.0014, 0.09, 0.0014).translate(p.x, p.y - 0.045, p.z), limbs);
    for (let i = 0; i < 3; i++) addDeco('bells', 'bell', new THREE.IcosahedronGeometry(0.009, 1).translate(p.x + (i - 1) * 0.012, p.y - 0.09 - (i % 2) * 0.012, p.z), limbs);
    for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; addDeco('bells', 'bell', new THREE.IcosahedronGeometry(0.007, 1).translate(Math.cos(a) * 0.014, -0.1 - Math.sin(a) * 0.006, Math.sin(a) * 0.014)); }
    addDeco('bells', 'cord', new THREE.BoxGeometry(0.0014, 0.04, 0.0014).translate(0, -0.075, 0));
    for (const [x, rz] of [[-0.008, 0.06], [0.008, -0.05]]) addDeco('ribbons', 'ribbon', new THREE.BoxGeometry(0.014, 0.26, 0.0012).translate(0, -0.13, 0).rotateZ(rz).translate(x, -0.06, 0.004));
    addDeco('ribbons', 'ribbon', new THREE.BoxGeometry(0.01, 0.16, 0.0012).translate(0, -0.08, 0).rotateZ(0.12).translate(tipU.x, tipU.y, tipU.z), limbs);
  }
  // 光輪（LR）：halos 握りと上下の弓を囲む光の輪 / wings 両端に扇のように開く光の羽 / lines 弓の両脇に沿う光の筋 / tipGems 両端の光る結晶
  // 輪と羽は大げさに大きく（弓の細さに負けないように）
  addDeco('halos', 'line', new THREE.TorusGeometry(0.1, 0.006, 6, 40).rotateX(Math.PI / 2).translate(0, 0.012, 0));
  addDeco('halos', 'line', new THREE.TorusGeometry(0.075, 0.003, 6, 36).rotateX(Math.PI / 2 - 0.35).translate(0, 0.03, 0));
  for (const [c, t, r] of [[cU, 0.4, 0.055], [cU, 0.7, 0.045], [cL, 0.55, 0.05]] as [THREE.CatmullRomCurve3, number, number][]) {
    const p = c.getPoint(t);
    addDeco('halos', 'line', new THREE.TorusGeometry(r, 0.0045, 6, 32).rotateX(Math.PI / 2).translate(p.x, p.y, p.z), limbs);
  }
  for (const [tip, up] of [[tipU, 1], [tipL, -1]] as [THREE.Vector3, number][]) {
    for (const a of [-1.1, -0.55, 0, 0.55, 1.1]) addDeco('wings', 'line', petalG(0.12 - Math.abs(a) * 0.035, 0.022).rotateZ(a + (up < 0 ? Math.PI : 0)).translate(tip.x, tip.y, tip.z), limbs);
    addDeco('tipGems', 'gem', new THREE.OctahedronGeometry(0.018, 0).scale(1, 1.6, 1).translate(tip.x, tip.y + up * 0.018, tip.z), limbs);
  }
  for (const c of [cU, cL]) for (const x of [-0.013, 0.013]) addDeco('lines', 'line', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(c.getPoints(12).map(p => V(x, p.y, p.z))), 24, 0.0018, 4, false), limbs);

  // 塗装：弓の本体 = frame、籐巻き = detail、握り = grip（'' は元の竹と黒い籐と革）。飾りはスキンの addons にある名前だけ見せる
  let skin = '';
  function setSkin(id: string) {
    skin = id;
    const m = id ? skinMaterials(id) : null, on = (id && SKINS[id]?.addons) || [];
    limbMs.forEach(x => { x.material = m ? m.frame : woodM; });
    bandMs.forEach(x => { x.material = m ? m.detail : lacquer; });
    (grip as THREE.Mesh).material = m ? m.grip : leather;
    for (const d of deco) { d.mesh.visible = !!m && on.includes(d.name); if (m) d.mesh.material = m[d.slot] || m.frame; }
  }

  // 手（握る手・引く手）
  let pull = null;
  if (opt.hand) {
    const hand = new THREE.Mesh(new THREE.IcosahedronGeometry(0.066, 0), opt.hand); hand.scale.set(1.0, 1.25, 1.05); hand.position.set(-0.05, 0.01, 0); bow.add(hand);
    pull = new THREE.Mesh(new THREE.IcosahedronGeometry(0.058, 0), opt.hand); bow.add(pull);
  }
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, ARROW_Y, -0.8); bow.add(muzzle);

  // 引き具合：弦の真ん中を手前へ、弓がしなる
  const REST = 0.09;
  function setDraw(k: number) {
    const nz = REST + 0.34 * k;
    const s = 1 + 0.25 * k;   // しなって先が手前へ
    limbs.scale.set(1, 1 - 0.04 * k, s);
    strPos.set([0, tipU.y * (1 - 0.04 * k), tipU.z * s, 0.018, ARROW_Y, nz, 0, tipL.y * (1 - 0.04 * k), tipL.z * s]);
    strGeo.attributes.position.needsUpdate = true;
    arrow.position.z = nz;
    if (pull) pull.position.set(0.062, ARROW_Y - 0.02, nz + 0.03);
  }
  setDraw(0);

  // 見本ページ用：「撃つ」で引いて放つ
  let demo = -1;
  const anim = {
    clear() { demo = -1; arrow.visible = true; setDraw(0); }, stop() {}, play() {}, has() { return false; }, rebase() {},
    update(dt: number) {
      if (demo < 0) return;
      demo += dt;
      if (demo < 1) setDraw(demo); else if (demo < 1.3) { setDraw(1); arrow.visible = true; } else if (demo < 1.35) { setDraw(0); arrow.visible = false; } else if (demo > 1.8) { arrow.visible = true; demo = -1; }
    },
  };
  return {
    g, slide: new THREE.Object3D(), muzzle, slideZ: 0, slideAmt: 0, setDraw, arrow, arrowM, isBow: true,
    hip: new THREE.Vector3(0.17, -0.2, -0.42), ads: new THREE.Vector3(0.2, -0.28, -0.42),
    info: { name: '和弓', real: '本物は約221cm（ゲームでは縮めている）' }, eject: new THREE.Object3D(),
    anim, get skin() { return skin; }, setSkin, onEvent: null,
    fire() { demo = 0; }, reload() {}, inspect() {}, equip() {},
  };
}
