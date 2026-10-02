// 打刀（侍の刀）：全長 約 960mm・刃長 約 710mm・反り 約 18mm
//   柄：柄糸を菱に巻いた黒い柄（菱の間から白い鮫皮が見える）。柄頭・縁は金
//   鍔：楕円の鉄鍔 / はばき：金 / 刃：鎬造り（背→鎬→刃の三面）。刃先側（刃文のあたり）は別の塗り（barrel）
//
// 原点は握る手の真ん中（柄の中ほど）。刃は前（-z）、刃先は下（-y）を向く
// 動き（振る・構える）は sword.ts が毎フレーム直接決める（部品の動きは使わない）
import * as THREE from 'three';
import { Clip } from './anim';
import { PartBuilder, Pt, flat, makeSpace } from './kit';
import { handMesh, makeGun } from './model';

const S = makeSpace(0, 0);
export const KATANA = { tip: 820, hand: 0, bladeFrom: 112 };   // 図面の u（mm）：刃先・手・刃の根元

// 刃の背（上）の高さ：先へ行くほど反る
const spineV = (u: number) => 14 + 18 * Math.pow(Math.max(0, (u - 112) / 708), 1.7);

function bladeGeo(n = 28) {
  const posBy: Record<string, number[]> = { slide: [], barrel: [] };
  const uvBy: Record<string, number[]> = { slide: [], barrel: [] };
  const tri = (slot: string, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, want: THREE.Vector3) => {
    const nrm = b.clone().sub(a).cross(c.clone().sub(a));
    if (nrm.dot(want) < 0) [b, c] = [c, b];
    for (const p of [a, b, c]) { posBy[slot].push(p.x, p.y, p.z); uvBy[slot].push(p.z * 4, p.y * 4); }
  };
  const quad = (slot, a, b, c, d, want) => { tri(slot, a, b, c, want); tri(slot, a, c, d, want); };
  const u0 = 112, u1 = 820, kis = 46;   // 切先（先の 46mm）
  const rows = [];
  for (let i = 0; i <= n; i++) {
    const u = u0 + (u1 - u0) * i / n, s = i / n;
    const sv = spineV(u), wid = 30 - 8 * s;
    let ev = sv - wid;
    // 切先：刃の線が背の先へ向かって持ち上がる
    const k = clamp01((u - (u1 - kis)) / kis);
    ev = ev + (sv - 1 - ev) * Math.pow(k, 1.6);
    const shv = sv - (sv - ev) * 0.3;              // 鎬（いちばん厚い所）
    const ts = (3.2 - 1.4 * s) * (1 - 0.6 * k);   // 背の厚み（半分）
    const th = (3.8 - 1.6 * s) * (1 - 0.5 * k);   // 鎬の厚み（半分）
    rows.push({ u, sv, shv, ev, ts, th });
  }
  for (let i = 0; i < n; i++) {
    const A = rows[i], B = rows[i + 1];
    for (const side of [1, -1]) {
      const want = new THREE.Vector3(side, 0, 0);
      quad('slide', S.at(A.u, A.sv, side * A.ts), S.at(B.u, B.sv, side * B.ts), S.at(B.u, B.shv, side * B.th), S.at(A.u, A.shv, side * A.th), want);   // 背〜鎬
      quad('barrel', S.at(A.u, A.shv, side * A.th), S.at(B.u, B.shv, side * B.th), S.at(B.u, B.ev, side * 0.3), S.at(A.u, A.ev, side * 0.3), want);   // 鎬〜刃
    }
    quad('slide', S.at(A.u, A.sv, -A.ts), S.at(B.u, B.sv, -B.ts), S.at(B.u, B.sv, B.ts), S.at(A.u, A.sv, A.ts), new THREE.Vector3(0, 1, 0));   // 背
    quad('barrel', S.at(A.u, A.ev, -0.3), S.at(B.u, B.ev, -0.3), S.at(B.u, B.ev, 0.3), S.at(A.u, A.ev, 0.3), new THREE.Vector3(0, -1, 0));   // 刃先の細い面
  }
  const out: Record<string, THREE.BufferGeometry> = {};
  for (const slot of ['slide', 'barrel']) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(posBy[slot], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvBy[slot], 2));
    out[slot] = flat(g);
  }
  return out;
}
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export function buildKatana(opt: { skin?: string; hand?: THREE.Material } = {}) {
  const B = new PartBuilder(S);
  // 柄：少し平たい楕円の断面。柄頭へ向かって少し細る
  const tsuka: Pt[] = [[-138, -14], [96, -15.5], [96, 15.5], [-138, 14]];
  B.add('grip', S.extrude(tsuka, 25, { bevel: 5 }));
  // 柄糸の菱：両脇に、鮫皮（白）が菱形にのぞく
  for (let u = -118; u <= 80; u += 26) for (const s of [1, -1]) {
    const d: Pt[] = [[u - 9, 0], [u, 9], [u + 9, 0], [u, -9]];
    B.add('detail', S.extrude(d, 1.2, { bevel: 0.3, x: s * 12.6 }));
  }
  // 柄頭・縁（金）
  B.add('accent', S.extrude([[-150, -13], [-136, -15.5], [-136, 15.5], [-150, 13]], 26, { bevel: 3 }));
  B.add('accent', S.extrude([[92, -16.5], [104, -17], [104, 17], [92, 16.5]], 27, { bevel: 1.5 }));
  // 鍔：楕円の鉄の板（縦 78mm・横 70mm・厚さ 6mm）
  {
    const g = new THREE.CylinderGeometry(1, 1, 6, 16).rotateX(Math.PI / 2);
    g.scale(35, 39, 1);
    B.add('frame', S.put(g, 107, 0));
    const rim = new THREE.TorusGeometry(1, 0.07, 4, 16); rim.scale(35, 39, 30);
    B.add('accent', S.put(rim, 107, 0));
  }
  // はばき（金）
  B.add('accent', S.extrude([[110, -17], [138, -16], [138, 16], [110, 17]], 9, { bevel: 1 }));
  // 刃
  const bl = bladeGeo();
  B.add('slide', bl.slide); B.add('barrel', bl.barrel);

  const rhand = B.part('rhand', [0, 0]);
  if (opt.hand) { const h = handMesh(opt.hand, 0.62, 0.72, 0.9); h.position.set(0.02, -0.004, 0); rhand.add(h); }
  const muzzle = new THREE.Object3D(); muzzle.position.copy(S.at(800, spineV(800) - 8));   // 刃先
  const eject = new THREE.Object3D(); B.root.add(eject);
  const clips: Record<string, Clip> = {};
  const model = makeGun({
    B, clips, muzzle, eject, skin: opt.skin || 'tamahagane',
    info: { name: '打刀', real: '全長 960mm・刃長 710mm' },
    vm: { scale: 1, hip: new THREE.Vector3(), ads: new THREE.Vector3() },
  });
  // 一人称：向き・位置は sword.ts が毎フレーム決める。ここでは大きさだけ
  model.vmFixed = { scale: 0.5, rot: [0, 0, 0], hip: new THREE.Vector3(), ads: new THREE.Vector3() };
  model.isSword = true;
  return model;
}
