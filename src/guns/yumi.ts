// 和弓（桂の弓）見本
// 本物は 2m を超える長さで、握りが下から 1/3 の所にある上下非対称の弓。ゲームでは縮めて、形の特徴（非対称・先が反る）を残す
// 竹の弓に黒い籐（とう）巻き、革の握り、白い羽根の矢
//
// ゲームの弓の決まり（前の弓と同じ）：setDraw(0〜1) で引き具合、arrow（番えた矢）、arrowM（追尾のとき光る材質）、isBow
// 見本ページでは「撃つ」で引いて放つ
import * as THREE from 'three';
import { P } from '../palette';
import { toon, flatGeo } from '../materials';

const C = (n: number) => new THREE.Color(n);

export function buildYumi(opt: { hand?: THREE.Material } = {}) {
  const g = new THREE.Group(), bow = new THREE.Group();
  g.add(bow); bow.rotation.z = -0.28;   // 少し傾けて構える
  const woodM = toon({ color: C(P.kiji[1]) }), lacquer = toon({ color: C(P.sumi[0]) }), leather = toon({ color: C(P.kiji[0]) });

  // 弓の形（y: 上下、z: 手前が +）。握り（原点）から上は長く、下は短い。先は前へ反る
  const upper = [[0, 0], [0.2, 0.05], [0.45, 0.13], [0.62, 0.16], [0.72, 0.13]];
  const lower = [[0, 0], [-0.12, 0.04], [-0.26, 0.1], [-0.34, 0.11], [-0.39, 0.08]];
  const limbs = new THREE.Group(); bow.add(limbs);
  for (const pts of [upper, lower]) {
    const curve = new THREE.CatmullRomCurve3(pts.map(([y, z]) => new THREE.Vector3(0, y, z)));
    const m = new THREE.Mesh(flatGeo(new THREE.TubeGeometry(curve, 14, 0.013, 4)), woodM);
    m.castShadow = true; limbs.add(m);
    // 籐巻き（黒い帯）
    for (const t of [0.25, 0.5, 0.8, 0.97]) {
      const b = new THREE.Mesh(flatGeo(new THREE.CylinderGeometry(0.016, 0.016, 0.018, 6)), lacquer);
      b.position.copy(curve.getPoint(t)); b.lookAt(b.position.clone().add(curve.getTangent(t))); b.rotateX(Math.PI / 2);
      limbs.add(b);
    }
  }
  const tipU = new THREE.Vector3(0, upper[4][0], upper[4][1]), tipL = new THREE.Vector3(0, lower[4][0], lower[4][1]);
  // 握り（革巻き）
  const grip = new THREE.Mesh(flatGeo(new THREE.CylinderGeometry(0.02, 0.02, 0.12, 6)), leather);
  grip.position.set(0, 0.01, 0.005); bow.add(grip);

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

  // 手（握る手・引く手）
  let pull = null;
  if (opt.hand) {
    const hand = new THREE.Mesh(new THREE.IcosahedronGeometry(0.066, 0), opt.hand); hand.scale.set(1.0, 1.25, 1.05); hand.position.set(0, 0.01, 0); bow.add(hand);
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
    if (pull) pull.position.set(0.02, ARROW_Y - 0.02, nz + 0.03);
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
    anim, skin: '', setSkin() {}, onEvent: null,
    fire() { demo = 0; }, reload() {}, inspect() {}, equip() {},
  };
}
