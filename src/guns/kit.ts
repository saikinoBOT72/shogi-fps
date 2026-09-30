// 銃づくりの道具：横から見た形（mm）を押し出して、面取りしたローポリの部品にする
//
// 座標の決まり（すべての銃で共通）
//   図面：u = 後ろ→前（mm）、v = 下→上（mm）。実銃の寸法をそのまま書く
//   3D ：前が -z、上が +y、幅が x（m）。ORIGIN（グリップの付け根あたり）が原点
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type Pt = [number, number];
export type ExtrudeOpt = {
  bevel?: number;              // 面取りの大きさ（mm）
  taper?: [number, number];    // 幅の倍率 [下, 上]（上が細い銃身など）
  taperFrom?: number;          // 細くなり始める高さ（0=下 〜 1=上）
  x?: number;                  // 幅方向のずらし（mm、右が +）
  holes?: Pt[][];              // 穴（用心鉄の中など）
};

export function makeSpace(ou: number, ov: number) {
  const S = {
    // 図面の点 → 3D の位置
    at: (u: number, v: number, x = 0) => new THREE.Vector3(x / 1000, (v - ov) / 1000, -(u - ou) / 1000),
    // 横から見た形を、幅 w(mm) で押し出す
    extrude(pts: Pt[], w: number, o: ExtrudeOpt = {}) {
      const bevel = Math.min(o.bevel ?? 1, w / 2 - 0.2);
      const shape = new THREE.Shape(pts.map(([u, v]) => new THREE.Vector2(u, v)));
      for (const h of o.holes || []) shape.holes.push(new THREE.Path(h.map(([u, v]) => new THREE.Vector2(u, v))));
      const g: THREE.BufferGeometry = new THREE.ExtrudeGeometry(shape, {
        depth: Math.max(0.1, w - bevel * 2), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 3,
      });
      g.translate(0, 0, -(w - bevel * 2) / 2);
      g.rotateY(Math.PI / 2);                   // 図面の u → -z、押し出し方向 → x
      if (o.taper) {
        const p = g.attributes.position, [a, b] = o.taper;
        let lo = Infinity, hi = -Infinity;
        for (let i = 0; i < p.count; i++) { lo = Math.min(lo, p.getY(i)); hi = Math.max(hi, p.getY(i)); }
        const f0 = o.taperFrom || 0;
        for (let i = 0; i < p.count; i++) {
          const k = Math.max(0, ((p.getY(i) - lo) / (hi - lo || 1) - f0) / (1 - f0));
          p.setX(i, p.getX(i) * (a + (b - a) * k));
        }
      }
      g.scale(1 / 1000, 1 / 1000, 1 / 1000);
      g.translate((o.x || 0) / 1000, -ov / 1000, ou / 1000);
      return flat(g);
    },
    // 箱（図面の範囲 u0..u1, v0..v1、幅 w、中心 x）
    box(u0: number, u1: number, v0: number, v1: number, w: number, x = 0) {
      const g = new THREE.BoxGeometry(w / 1000, (v1 - v0) / 1000, (u1 - u0) / 1000);
      const c = S.at((u0 + u1) / 2, (v0 + v1) / 2, x);
      g.translate(c.x, c.y, c.z);
      return flat(g);
    },
    // 輪（リング撃鉄など）：中心 (u,v)、外と内の半径、角の数
    ring(u: number, v: number, r0: number, r1: number, w: number, seg = 8, o: ExtrudeOpt = {}) {
      const circle = (r: number): Pt[] => Array.from({ length: seg }, (_, i) => [u + Math.cos(i / seg * Math.PI * 2 + Math.PI / seg) * r, v + Math.sin(i / seg * Math.PI * 2 + Math.PI / seg) * r] as Pt);
      return S.extrude(circle(r0), w, { ...o, holes: [circle(r1).reverse()] });
    },
    // 上半分だけの丸い棒（AK の上の蓋など、上が丸い部品）。底の平らな面は下の部品に載せる
    half(u0: number, u1: number, v: number, r: number, seg = 10, x = 0) {
      const g = new THREE.CylinderGeometry(r / 1000, r / 1000, (u1 - u0) / 1000, seg, 1, false, Math.PI / 2, Math.PI);
      g.rotateX(Math.PI / 2);
      const c = S.at((u0 + u1) / 2, v, x);
      g.translate(c.x, c.y, c.z);
      return flat(g);
    },
    // 好きな形（大きさは mm で作る）を図面の (u, v)・幅方向 x に置く。rot：[x, y, z] の回転（ラジアン）
    //   スキンの小さな飾り（宝石・鈴・鎖の輪など）に使う
    put(geo: THREE.BufferGeometry, u: number, v: number, x = 0, rot: [number, number, number] = [0, 0, 0]) {
      const g = geo.clone();
      g.rotateX(rot[0]); g.rotateY(rot[1]); g.rotateZ(rot[2]);
      g.scale(1 / 1000, 1 / 1000, 1 / 1000);
      const c = S.at(u, v, x); g.translate(c.x, c.y, c.z);
      return flat(g);
    },
    // 前後に向いた円柱（銃口の穴など）。seg を少なくしてローポリに
    rod(u0: number, u1: number, v: number, r: number, seg = 8, x = 0) {
      const g = new THREE.CylinderGeometry(r / 1000, r / 1000, (u1 - u0) / 1000, seg);
      g.rotateX(Math.PI / 2);
      const c = S.at((u0 + u1) / 2, v, x);
      g.translate(c.x, c.y, c.z);
      return flat(g);
    },
  };
  return S;
}

// 面ごとに陰影が分かれるように（ローポリ調）
export function flat(g: THREE.BufferGeometry) {
  const f = g.index ? g.toNonIndexed() : g;
  f.deleteAttribute('normal'); f.computeVertexNormals();
  return f;
}

// 動かない部品は、塗り（スロット）ごとに1つのメッシュにまとめて描く回数を減らす
export class PartBuilder {
  root = new THREE.Group();
  parts: Record<string, THREE.Object3D> = {};
  slots: Record<string, THREE.Mesh[]> = {};
  private pending = new Map<THREE.Object3D, Record<string, THREE.BufferGeometry[]>>();
  constructor(private space: ReturnType<typeof makeSpace>) { this.parts.root = this.root; }

  // 動く部品：pivot（図面の点）を回転の中心にした入れ物を作る。x：回転の中心を左右にずらす（mm。リボルバーのクレーンなど）
  part(name: string, pivot: Pt, parent: THREE.Object3D = this.root, x = 0) {
    const g = new THREE.Group();
    const p = this.space.at(pivot[0], pivot[1], x);
    // 親の原点からの位置にする
    const pp = parent === this.root ? new THREE.Vector3() : (parent.userData.pivotAt as THREE.Vector3);
    g.position.copy(p).sub(pp);
    g.userData.pivotAt = p;
    parent.add(g);
    this.parts[name] = g;
    return g;
  }
  // 形を足す（あとで塗りごとにまとめる）
  add(slot: string, geo: THREE.BufferGeometry, to: THREE.Object3D = this.root) {
    const at = to === this.root ? null : (to.userData.pivotAt as THREE.Vector3);
    if (at) geo.translate(-at.x, -at.y, -at.z);
    let m = this.pending.get(to);
    if (!m) this.pending.set(to, m = {});
    (m[slot] = m[slot] || []).push(geo);
  }
  finish() {
    for (const [to, bySlot] of this.pending) {
      for (const [slot, geos] of Object.entries(bySlot)) {
        const g = mergeGeometries(geos.map(x => { for (const k of Object.keys(x.attributes)) if (!['position', 'normal', 'uv'].includes(k)) x.deleteAttribute(k); return x; }));
        const mesh = new THREE.Mesh(g);
        mesh.castShadow = true; mesh.userData.slot = slot;
        to.add(mesh);
        (this.slots[slot] = this.slots[slot] || []).push(mesh);
      }
    }
    this.pending.clear();
  }
}
