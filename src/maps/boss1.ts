// マップ7：仮想空間１（ボス部屋1。32m 四方の浮島・点対称。開発者用＝未公開）
// 何もない暗い空間に、正方形の島が1つ浮いている。島の外へ落ちたら負け（LV.KILL より下）。見えない壁は無い
// 遮蔽物（B1 案）：自陣に「高い壁3枚」の列と、その前に「低い壁2枚」の列（互い違い）。真ん中の約16m は空けて撃ち合う所
//   真ん中の行の左右の端に、高い塊を1つずつ（そこを伝って詰められる）
// 色：暗い灰の床に赤い格子、遮蔽物は灰（高い・低いとも同じ色）に青い格子。島の縁は赤く光る線。はるか下にも赤い格子の面が見える
//   格子はぼやけないよう、面の大きさに合わせた細かいテクスチャを繰り返して貼る（uvBox）
import * as THREE from 'three';
import { C, V3 } from '../core';
import { canvasTex, mat, toon } from '../render';
import { G0, addSolid, beginMap, cur, deco, finishMap } from '../world/base';

const HALF = 16;             // 島の半分の広さ
const TOP = G0 + 50;         // 島の床の高さ（下の格子の面まで 50m）
const THICK = 2;             // 島の厚み
const TALL = 4.5, LOW = 1.45; // 高い遮蔽物（壁登りでも届かない）・低い遮蔽物（大きい駒だけ頭を出して越しに撃てる）
const RED = '#c0303a', EDGE = '#ff4652', BLUE = '#3f86e8';

// 面ごとに、だいたい tile m ごとの升目になる UV の箱（升目の線が面の端にぴったり来るよう、升目の数は整数に丸める）
function uvBox(w, h, d, tile) {
  const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];   // 右・左・上・下・前・後の面の (横, 縦)
  for (let f = 0; f < 6; f++) {
    const nu = Math.max(1, Math.round(dims[f][0] / tile)), nv = Math.max(1, Math.round(dims[f][1] / tile));
    for (let i = 0; i < 4; i++) { const k = f * 4 + i; uv.setXY(k, uv.getX(k) * nu, uv.getY(k) * nv); }
  }
  return g;
}
// 下端 y0 の箱を置く（both：点対称の位置にも）
function box(x0, x1, y0, y1, z0, z1, m, tile, walk = false, both = true) {
  for (const s of both ? [1, -1] : [1]) {
    const mesh = new THREE.Mesh(uvBox(x1 - x0, y1 - y0, z1 - z0, tile), m);
    mesh.position.set(s * (x0 + x1) / 2, (y0 + y1) / 2, s * (z0 + z1) / 2);
    addSolid(mesh, null, walk);
  }
}
// 升目1つぶんの模様（縁に線。隣の升目と合わせて1本の線になる）。glow：光る所だけ（黒地）
function gridTile(px, base, line, lw, fine = 0) {
  const t = canvasTex(px, px, g => {
    g.fillStyle = base; g.fillRect(0, 0, px, px);
    if (fine) { g.fillStyle = 'rgba(255,255,255,0.05)'; for (let i = 1; i < fine; i++) { const p = Math.round(i * px / fine); g.fillRect(p - 1, 0, 2, px); g.fillRect(0, p - 1, px, 2); } }
    g.fillStyle = line; g.fillRect(0, 0, px, lw); g.fillRect(0, px - lw, px, lw); g.fillRect(0, 0, lw, px); g.fillRect(px - lw, 0, lw, px);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
const gridMat = (base, line, glowLine, lw, fine = 0, glow = 1) =>
  toon({ map: gridTile(512, base, line, lw, fine), emissiveMap: gridTile(512, '#000', glowLine, lw), emissive: C(0xffffff), emissiveIntensity: glow });

export function buildBoss1() {
  beginMap('boss1', {
    lv: { V: TOP, KILL: TOP - 8 },
    spawn: { x: 0, z: -14.2 },   // 北の高い壁の真後ろ（相手は点対称の南）
    water: G0 - 100,
    void: true,
    atmos: () => ({
      top: C(0x050507), hor: C(0x121218), bot: C(0x050507),
      sunDir: new V3(0.4, 0.85, 0.3), sunCol: C(0xffffff), sunI: 0.85,
      hemiSky: C(0x9a9aa6), hemiGround: C(0x1a1a20), hemiI: 0.5,
      fog: C(0x08080b), near: 40, far: 170, clouds: false, noGround: true, noScenery: true,
    }),
  });

  // ----- 島（上面：4m の升目に赤い線・中に 1m の薄い線。赤い線は暗くても光る） -----
  const topM = gridMat('#1d1d23', RED, '#8a1e26', 5, 4);
  const sideM = mat(0x0e0e12), underM = mat(0x0b0b0e);
  topM.userData.surf = 'stone';
  box(-HALF, HALF, TOP - THICK, TOP, -HALF, HALF, [sideM, sideM, topM, underM, sideM, sideM], 4, true, false);
  cur.colliders[cur.colliders.length - 1].nav = true;   // 宙に浮いた床だが、CPU の道探しでは床として使う
  // 島の縁の赤く光る線（上面の縁と、横の面の上端をくるむ細い枠。当たり判定なし）
  {
    const edgeM = new THREE.MeshBasicMaterial({ color: EDGE });
    const W = 2 * HALF + 0.06;
    for (const [w, d, x, z] of [[W, 0.16, 0, -HALF + 0.05], [W, 0.16, 0, HALF - 0.05], [0.16, W, -HALF + 0.05, 0], [0.16, W, HALF - 0.05, 0]]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.14, d), edgeM);
      m.position.set(x, TOP - 0.065, z);
      deco(m, false); m.castShadow = false;
    }
  }

  // ----- 遮蔽物（灰に青い 1m の格子。北側だけ決めて、南側は点対称に写す） -----
  const lowM = gridMat('#6c6c76', BLUE, '#3a7ae0', 6, 0, 0.9), tallM = lowM;
  lowM.userData.surf = 'stone';
  for (const x of [-10, 0, 10]) box(x - 2, x + 2, TOP, TOP + TALL, -12.4, -11.6, tallM, 1);   // 自陣の奥の列：高い壁 4m × 3枚
  for (const x of [-5, 5]) box(x - 2, x + 2, TOP, TOP + LOW, -8.3, -7.7, lowM, 1);            // その前の列：低い壁 4m × 2枚（高い壁のすき間の前）
  box(-13, -10, TOP, TOP + TALL, -1.5, 1.5, tallM, 1);                                         // 真ん中の行の端：高い塊 3m 角（右端は点対称）

  // ----- はるか下の赤い格子の面（ここまで落ちる前に負けになる。霧でかすかに見えるだけ） -----
  {
    const tex = canvasTex(256, 256, g => { g.clearRect(0, 0, 256, 256); g.fillStyle = RED; g.fillRect(0, 0, 256, 4); g.fillRect(0, 0, 4, 256); });
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(100, 100);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(800, 800), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.55, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.y = G0 + 0.05;
    deco(m, false);
  }
  finishMap();
}
