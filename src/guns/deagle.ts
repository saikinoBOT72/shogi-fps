// デザートイーグル（Mark XIX・6インチ）見本
// 実銃の寸法：全長 269mm・高さ 149mm・幅 32mm。図面は横から見た mm で書き、面取りしたローポリにする
//
// 動く部品：slide（スライド）・hammer（撃鉄）・trigger（引き金）・mag（弾倉）・lhand（左手：リロードのとき）
// 動き　　：fire（撃つ）・fireLast（最後の1発：スライドが下がったまま）・release（スライドを戻す）
// 　　　　　reload（弾倉を落として入れ替える）・inspect（眺める）・equip（構える：スライドを引く）
import * as THREE from 'three';
import { GunAnimator, Clip, Track, Key } from './anim';
import { PartBuilder, Pt, flat, makeSpace } from './kit';
import { Addon, makeAddons } from './model';
import { DEFAULT_SKIN, skinMaterials } from './skins';

// 図面の原点：グリップの付け根（u=後ろから80mm、v=グリップの底から100mm）
const S = makeSpace(80, 100);
const RAKE = 0.21;                        // グリップの傾き（tan 12°）
const SLIDE_W = 29, FRAME_W = 26, BARREL_W = 30;
const LOCK = 0.03;                        // スライドが下がる量（m）

export type GunOpt = { skin?: string; hand?: THREE.Material };

export function buildDeagle(opt: GunOpt = {}) {
  const B = new PartBuilder(S);

  // ---------- 動く部品の入れ物（回転の中心） ----------
  const slide = B.part('slide', [60, 118]);
  const hammer = B.part('hammer', [-2, 99]);
  const trigger = B.part('trigger', [104, 84]);
  const mag = B.part('mag', [22, 0]);

  // ---------- フレーム（下の骨組み・グリップの芯） ----------
  const gripFront = (v: number) => 58 + v * RAKE, gripBack = (v: number) => -14 + v * RAKE;
  B.add('frame', S.extrude([
    [6, 102], [262, 102], [266, 99], [254, 84], [gripFront(84), 84], [gripFront(0), 0], [gripBack(0), 0],
    [gripBack(86), 86], [-4, 92], [-3, 97], [4, 100],
  ], FRAME_W, { bevel: 1.4 }));
  // 用心鉄（引き金のまわりの輪）
  B.add('frame', S.extrude([[150, 86], [151, 74], [149, 62], [155, 58], [153, 52], [145, 49], [82, 49], [66, 62], [70, 86]], 12, {
    bevel: 1.2, holes: [[[144, 82], [144.5, 60], [140, 54.5], [88, 54.5], [78, 64], [78, 82]]],
  }));
  // スライドストップ（左側のレバー）
  B.add('detail', S.box(72, 112, 95.5, 100, 2, -(FRAME_W / 2 + 1)));
  B.add('detail', S.box(104, 114, 92, 100, 2.4, -(FRAME_W / 2 + 1.2)));

  // グリップの板（滑り止め）
  const inset = 4.5;
  B.add('grip', S.extrude([
    [gripBack(80) + inset, 80], [gripFront(80) - inset, 80], [gripFront(6) - inset, 6], [gripBack(6) + inset, 6],
  ], FRAME_W + 7, { bevel: 1.6 }));

  // ---------- 銃身（前の大きな塊・上にレール） ----------
  // 下半分はまっすぐ、上半分は細くなる（面が折れないよう2つに分ける。境目の線も Mark XIX らしさ）
  B.add('barrel', S.extrude([[112, 102], [260, 102], [269, 110], [269, 116], [112, 116]], BARREL_W, { bevel: 1.5 }));
  B.add('barrel', S.extrude([[112, 116], [269, 116], [269, 136], [112, 136]], BARREL_W, { bevel: 1.5, taper: [1, 0.55] }));
  // レール（照準器を付ける溝つきの台）
  B.add('barrel', S.box(124, 264, 135.5, 137.5, 15));
  for (let u = 128; u < 258; u += 11) B.add('barrel', S.box(u, u + 6.5, 137.5, 140, 15));
  // 照星（前の照準）
  B.add('detail', S.extrude([[252, 140], [261, 140], [261, 143], [258, 146.5], [252, 146.5]], 5, { bevel: 0.6 }));
  // 銃口の穴
  B.add('bore', S.rod(268, 270.2, 123, 6.4, 8));
  // 銃身横の刻印の代わりの浅い溝（左右）
  for (const x of [-1, 1]) B.add('slideDark', S.box(150, 250, 107, 110, 0.6, x * (BARREL_W / 2 + 0.2)));

  // ---------- スライド ----------
  // 上の面は銃身の上の面（136）とわずかにずらす（同じ高さで重なると、境目がちらつくので）
  B.add('slide', S.extrude([[0, 102], [0, 131.5], [4, 136.6], [113, 136.6], [119, 102]], SLIDE_W, { bevel: 1.5 }), slide);
  // 後ろの斜めの滑り止め（左右）
  for (const x of [-1, 1]) for (let u = 14; u <= 42; u += 4) {
    B.add('slideDark', S.extrude([[u, 106], [u + 1.8, 106], [u + 8.8, 132], [u + 7, 132]], 1, { bevel: 0, x: x * (SLIDE_W / 2 + 0.3) }), slide);
  }
  // 排莢口（右側）
  B.add('bore', S.box(80, 110, 114, 130, 0.8, SLIDE_W / 2 + 0.25), slide);
  // 安全装置（左右のレバー）
  for (const x of [-1, 1]) B.add('detail', S.extrude([[8, 110], [26, 112], [26, 118.5], [8, 118.5]], 2.2, { bevel: 0.5, x: x * (SLIDE_W / 2 + 1.2) }), slide);
  // 照門（後ろの照準：まん中に切り欠き）
  for (const x of [-1, 1]) B.add('detail', S.extrude([[4, 135], [15, 135], [15, 141], [12, 143.5], [4, 143.5]], 8, { bevel: 0.6, x: x * 8 }), slide);

  // ---------- 撃鉄・引き金 ----------
  B.add('detail', S.extrude([[-5, 97], [1, 97], [-1, 110], [-7, 111]], 8, { bevel: 0.8 }), hammer);
  B.add('detail', S.ring(-7, 116, 7, 3.2, 8, 8, { bevel: 0.8 }), hammer);
  B.add('detail', S.extrude([[101, 84], [107, 84], [108, 76], [111, 65], [108, 62], [105, 66], [102, 76]], 7, { bevel: 0.8 }), trigger);

  // ---------- 弾倉（グリップの中。リロードで抜ける） ----------
  B.add('mag', S.extrude([[-8, 2], [46, 2], [46 + 80 * RAKE, 80], [-8 + 80 * RAKE, 80]], 21, { bevel: 0.8 }), mag);
  B.add('frame', S.extrude([[gripBack(0) - 1, -6], [gripFront(0) + 1, -6], [gripFront(0) + 1, 0], [gripBack(0), 0]], FRAME_W + 4, { bevel: 1.2 }), mag);

  // ---------- 手（持ち手の右手と、リロードで弾倉を入れる左手） ----------
  let lhand = null;
  if (opt.hand) {
    const handGeo = new THREE.IcosahedronGeometry(0.066, 0);
    const rh = new THREE.Mesh(handGeo, opt.hand);
    rh.scale.set(0.72, 0.95, 0.8); rh.position.copy(S.at(34, 46, 40));   // 右手は銃の右側に添える rh.castShadow = true;
    B.root.add(rh);
    lhand = B.part('lhand', [30, -30], mag);
    const lh = new THREE.Mesh(handGeo, opt.hand); lh.scale.set(0.8, 0.7, 0.8); lh.position.x = -0.04; lhand.add(lh);
    lhand.visible = false;
  }
  B.finish();

  // ---------- スキンの飾り（LR はスキンごとに専用） ----------
  const addons: Addon[] = [];
  const petal = (len: number, wid: number) => {
    const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.quadraticCurveTo(wid, len * 0.45, 0, len); sh.quadraticCurveTo(-wid, len * 0.45, 0, 0);
    return new THREE.ExtrudeGeometry(sh, { depth: 1, bevelEnabled: false, curveSegments: 3 }).translate(0, 5, -0.5);
  };
  const gem = (r: number) => new THREE.OctahedronGeometry(r, 0), ball = (r: number, d = 0) => new THREE.IcosahedronGeometry(r, d);
  const GRIP_U = 31, GRIP_V = 43, GRIP_X = (FRAME_W + 7) / 2 + 0.6;   // グリップの板の真ん中と、その表面

  // 紅蓮（燃える紅い蓮）：銃口の蓮・銃身の光る線・スライドの蓮の紋と棘・グリップの火の玉・用心鉄の結晶・グリップから垂れる黒い鎖
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2;
    addons.push({ name: 'gr_lotus', slot: 'line', geo: S.put(petal(15, 5), 262, 123, 0, [-0.95, 0, a]) });
    addons.push({ name: 'gr_lotus', slot: 'barrel', geo: S.put(petal(10, 3.5), 264, 123, 0, [-0.7, 0, a + Math.PI / 8]) });
  }
  for (const s of [1, -1]) {
    for (const v of [104.2, 111.4]) addons.push({ name: 'gr_lines', slot: 'line', geo: S.box(120, 262, v, v + 1.3, 0.8, (BARREL_W / 2 + 0.4) * s) });
    for (const a of [-0.6, 0, 0.6]) addons.push({ name: 'gr_crest', slot: 'line', geo: S.put(petal(8, 3).rotateZ(a), 62, 110, (SLIDE_W / 2 + 0.5) * s, [0, Math.PI / 2, 0]), part: slide });
    addons.push({ name: 'gr_core', slot: 'barrel', geo: S.ring(GRIP_U, GRIP_V, 9, 6, 2.4, 10, { x: GRIP_X * s }) });
    addons.push({ name: 'gr_core', slot: 'line', geo: S.put(ball(5.5, 1), GRIP_U, GRIP_V, (GRIP_X + 0.4) * s) });
  }
  for (const u of [24, 40, 56, 72, 88, 104]) addons.push({ name: 'gr_thorns', slot: 'barrel', geo: S.put(new THREE.ConeGeometry(2.6, 10, 5), u, 139, 0, [0.45, 0, 0]), part: slide });
  for (const [u, v, len, tilt] of [[153, 56, 14, -1.9], [148, 50, 10, -2.3], [157, 63, 9, -1.5]]) {
    const g = new THREE.OctahedronGeometry(3.4, 0); g.scale(1, len / 3.4, 1);
    addons.push({ name: 'gr_shards', slot: 'accent', geo: S.put(g, u, v, 0, [tilt, 0, 0]) });
  }
  for (let i = 0; i <= 7; i++) addons.push({ name: 'gr_chain', slot: 'chain', geo: S.put(new THREE.TorusGeometry(3, 1, 4, 8), 12 + i * 0.8, -10 - i * 6.2, 0, [0, i % 2 ? Math.PI / 2 : 0, 0]) });
  addons.push({ name: 'gr_chain', slot: 'line', geo: S.put(ball(5, 1), 18.5, -60) });

  // 黄金（王者の金）：スライドの王冠・グリップの宝石・スライドのダイヤの列・銃身の金の縁取り・フレームの月桂樹・銃口の宝石の輪・金の房
  {
    const crown = (a: number) => [30 + 5 * Math.cos(a), 5 * Math.sin(a)];
    addons.push({ name: 'og_crown', slot: 'accent', geo: S.put(new THREE.CylinderGeometry(6, 6.5, 4, 10), 30, 138), part: slide });
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * Math.PI * 2, [u, x] = crown(a);
      addons.push({ name: 'og_crown', slot: 'accent', geo: S.put(new THREE.ConeGeometry(1.7, 7, 4), u, 143.5, x), part: slide });
      addons.push({ name: 'og_crown', slot: 'gem', geo: S.put(gem(1.4), u, 147.5, x), part: slide });
    }
  }
  for (const s of [1, -1]) {
    addons.push({ name: 'og_jewels', slot: 'line', geo: S.put(gem(7), GRIP_U, GRIP_V, (GRIP_X + 1) * s, [0, 0, Math.PI / 4]) });
    for (const [du, dv] of [[-11, 0], [11, 0], [0, 14], [0, -14]]) addons.push({ name: 'og_jewels', slot: 'gem', geo: S.put(gem(3), GRIP_U + du, GRIP_V + dv, (GRIP_X + 0.6) * s) });
    for (let u = 54; u <= 110; u += 8) addons.push({ name: 'og_studs', slot: 'gem', geo: S.put(gem(2.3), u, 106, (SLIDE_W / 2 + 0.6) * s), part: slide });
    for (const v of [102.8, 115.2]) addons.push({ name: 'og_trim', slot: 'accent', geo: S.box(114, 266, v, v + 1.6, 1, (BARREL_W / 2 + 0.3) * s) });
    for (let i = 0; i < 7; i++) {
      const u = 166 + i * 12;
      for (const a of [-0.7, 0.7]) addons.push({ name: 'og_laurel', slot: 'accent', geo: S.put(petal(7, 2.6).rotateZ(a - 1.57), u, 93, (FRAME_W / 2 + 0.6) * s, [0, Math.PI / 2, 0]) });
    }
  }
  addons.push({ name: 'og_muzzle', slot: 'accent', geo: S.put(new THREE.TorusGeometry(10, 1.6, 4, 14), 270.5, 123) });
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; addons.push({ name: 'og_muzzle', slot: 'gem', geo: S.put(gem(2), 271.5, 123 + 10 * Math.sin(a), 10 * Math.cos(a)) }); }
  addons.push({ name: 'og_tassel', slot: 'accent', geo: S.box(21, 23, -34, -6, 1.2) });
  addons.push({ name: 'og_tassel', slot: 'accent', geo: S.put(ball(4.5), 22, -37) });
  addons.push({ name: 'og_tassel', slot: 'accent', geo: S.put(new THREE.ConeGeometry(6, 24, 8), 22, -52) });
  // 照準（SR）：レールの上の小さなドットサイト（黒い箱と光るレンズ）と、銃口の補正器（上に逃がし穴2つ）
  // ドットサイトは薄く、レールの溝にめり込ませる（台はレールの中、本体は低く細く）
  addons.push({ name: 'dot', slot: 'dotBody', geo: S.box(152, 188, 135.8, 139.6, 11) });
  addons.push({ name: 'dot', slot: 'dotBody', geo: S.extrude([[157, 139], [186, 139], [186, 147.5], [183, 150], [160, 150], [157, 147.5]], 10, { bevel: 0.8 }) });
  addons.push({ name: 'dot', slot: 'line', geo: S.box(186, 187.2, 141, 148.5, 7.5) });
  addons.push({ name: 'comp', slot: 'comp', geo: S.extrude([[268, 104], [292, 104], [292, 132], [288, 136], [268, 136]], BARREL_W - 2, { bevel: 1.5 }) });
  for (const u of [274, 283]) addons.push({ name: 'comp', slot: 'bore', geo: S.box(u, u + 5, 134, 136.6, 10) });
  addons.push({ name: 'comp', slot: 'bore', geo: S.rod(291.5, 292.6, 123, 6.4, 8) });
  // 照準（SR）の追加：laser フレームの下のレーザー照準器（箱と光る窓） / extMag 弾倉の底の大きな継ぎ足し
  addons.push({ name: 'laser', slot: 'dotBody', geo: S.extrude([[186, 84], [252, 84], [252, 70], [244, 64], [192, 64], [186, 70]], 20, { bevel: 1.2 }) });
  addons.push({ name: 'laser', slot: 'line', geo: S.box(252, 253.4, 68, 80, 12) });
  addons.push({ name: 'laser', slot: 'comp', geo: S.box(200, 238, 82, 84.5, 22) });
  addons.push({ name: 'extMag', slot: 'comp', geo: S.extrude([[gripBack(0) - 3, -26], [gripFront(0) + 3, -26], [gripFront(0) + 2, -6], [gripBack(0) - 1, -6]], FRAME_W + 6, { bevel: 1.5 }), part: mag });
  addons.push({ name: 'extMag', slot: 'line', geo: S.box(gripBack(0) + 6, gripFront(0) - 6, -18, -15, FRAME_W + 6.6), part: mag });

  // 漆と木（R）：medal グリップの両脇の銀のメダル（縁つき） / lanyard 底の吊り輪から下がる紐と玉 / sightDots 照準の白い点
  for (const s of [1, -1]) {
    addons.push({ name: 'medal', slot: 'medal', geo: S.put(new THREE.CylinderGeometry(8, 8, 1.4, 14).rotateZ(Math.PI / 2), GRIP_U, GRIP_V, (GRIP_X + 0.5) * s) });
    addons.push({ name: 'medal', slot: 'medal', geo: S.put(new THREE.TorusGeometry(8, 1.1, 4, 14).rotateY(Math.PI / 2), GRIP_U, GRIP_V, (GRIP_X + 1.1) * s) });
    addons.push({ name: 'medal', slot: 'dots', geo: S.put(new THREE.CylinderGeometry(2.4, 2.4, 1.4, 8).rotateZ(Math.PI / 2), GRIP_U, GRIP_V, (GRIP_X + 1) * s) });
    addons.push({ name: 'sightDots', slot: 'dots', geo: S.box(14.8, 15.8, 138, 140.4, 1.8, 8 * s), part: slide });
  }
  addons.push({ name: 'sightDots', slot: 'dots', geo: S.box(260.8, 261.8, 142, 144.4, 1.8) });
  addons.push({ name: 'lanyard', slot: 'medal', geo: S.put(new THREE.TorusGeometry(5, 1.3, 4, 10).rotateY(Math.PI / 2), 8, -11) });
  addons.push({ name: 'lanyard', slot: 'cord', geo: S.box(7, 9, -40, -15, 1.4) });
  addons.push({ name: 'lanyard', slot: 'bead', geo: S.put(new THREE.IcosahedronGeometry(5.5, 1), 8, -45) });
  addons.push({ name: 'lanyard', slot: 'cord', geo: S.put(new THREE.ConeGeometry(3.2, 12, 6), 8, -56) });
  // 花札（LR 2つ目）：hf_ で始まる
  //   hf_bozu：スライドの両脇の「坊主」の月（c2）と黒い山 / hf_tanzaku：銃身の横に斜めに貼った短冊（c1、縁は生成り）
  //   hf_maku：銃身の下の段に垂れる幕（生成りに c2 の裾と c1 の紋） / hf_sun：銃身の前の横の日（c2）
  //   hf_cards：底の輪から扇に広がる5枚の札と、まわりに浮く4枚の札（札は 22×35mm。地は生成り、縁は黒、絵は c1・c2・黒）
  const circ = (u: number, v: number, r: number, n = 12): Pt[] => Array.from({ length: n }, (_, i) => [u + r * Math.cos(i / n * Math.PI * 2), v + r * Math.sin(i / n * Math.PI * 2)] as Pt);
  // 銃身の横の面に沿わせる（上の段は上へ細くなる：v116 で幅 30、v136 で 0.55 倍）。押し出した薄い板の x を面の位置へ移す
  const barrelHalf = (v: number) => BARREL_W / 2 * (v <= 116 ? 1 : 1 - 0.45 * Math.min(1, (v - 116) / 20));
  const onBarrel = (pts: Pt[], t: number, off: number, s: number) => {
    const g = S.extrude(pts, t, { bevel: 0 }), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setX(i, s * (barrelHalf(p.getY(i) * 1000 + 100) + off) / 1000 + p.getX(i));
    return flat(g);
  };
  for (const s of [1, -1]) {
    addons.push({ name: 'hf_bozu', slot: 'art2', geo: S.extrude(circ(66, 124, 9, 14), 0.8, { bevel: 0, x: (SLIDE_W / 2 + 0.6) * s }), part: slide });
    addons.push({ name: 'hf_bozu', slot: 'hill', geo: S.extrude([[28, 103], [50, 113], [72, 109], [96, 113], [112, 103]], 0.8, { bevel: 0, x: (SLIDE_W / 2 + 0.7) * s }), part: slide });
    // 幕：上はまっすぐ、裾は波。生成りの布に c2 の裾の線と c1 の紋3つ
    const hem: Pt[] = []; for (let i = 0; i <= 14; i++) hem.push([264 - i * 10, i % 2 ? 105.5 : 108.5]);
    addons.push({ name: 'hf_maku', slot: 'face', geo: onBarrel([[124, 115], [264, 115], ...hem], 0.6, 0.3, s) });
    addons.push({ name: 'hf_maku', slot: 'art2', geo: onBarrel(hem.map(([u, v]) => [u, v + 1.6] as Pt).concat(hem.slice().reverse()), 0.6, 0.6, s) });
    for (const u of [150, 200, 240]) addons.push({ name: 'hf_maku', slot: 'art1', geo: onBarrel(circ(u, 111.5, 2.6, 8), 0.6, 0.6, s) });
    addons.push({ name: 'hf_tanzaku', slot: 'face', geo: onBarrel([[156, 103.5], [168, 103.5], [204, 133], [192, 133]], 0.6, 0.9, s) });
    addons.push({ name: 'hf_tanzaku', slot: 'art1', geo: onBarrel([[158.5, 105], [166, 105], [200, 131.5], [192.5, 131.5]], 0.6, 1.2, s) });
    addons.push({ name: 'hf_sun', slot: 'art2', geo: onBarrel(circ(250, 124, 6, 12), 0.6, 0.6, s) });
  }
  // 札：横から見た面に描く。kind 0 坊主（空・月・山）/ 1 桜に幕（幕と花の点）/ 2 短冊 / 3 日（日と黒い茎）
  //   (u, v) が札の上の真ん中、a が回転（ラジアン）、k が大きさ、x が幅方向の位置
  const card = (u: number, v: number, a: number, kind: number, x: number, k = 1, part?: THREE.Object3D) => {
    const ca = Math.cos(a), sa = Math.sin(a);
    const T = (pts: Pt[]): Pt[] => pts.map(([px, py]) => [u + (px * k) * ca - (py * k) * sa, v + (px * k) * sa + (py * k) * ca] as Pt);   // 札の中の座標（上の真ん中が原点、下が -）
    const rect = (x0: number, x1: number, y0: number, y1: number): Pt[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    const add = (slot: string, pts: Pt[], dx: number) => { for (const s of [1, -1]) addons.push({ name: 'hf_cards', slot, geo: S.extrude(T(pts), 0.4, { bevel: 0, x: x + s * dx }), part }); };
    addons.push({ name: 'hf_cards', slot: 'hill', geo: S.extrude(T(rect(-11, 11, -35, 0)), 1, { bevel: 0, x }), part });   // 黒い縁（裏の芯）
    add('face', rect(-10, 10, -34, -1), 0.6);
    if (kind === 0) { add('art1', rect(-9, 9, -33, -2), 0.9); add('art2', circ(0, -13, 5, 12), 1.2); add('hill', [[-9, -33], [-9, -25], [0, -21], [9, -27], [9, -33]], 1.2); }
    if (kind === 1) { add('art1', [[-9, -2], [9, -2], [9, -9], [4.5, -6], [0, -11], [-4.5, -6], [-9, -9]], 0.9); for (const px of [-6, -2, 2, 6]) add('art2', circ(px, -24, 1.8, 6), 0.9); }
    if (kind === 2) add('art1', [[-6, -3], [-1, -3], [7, -31], [2, -31]], 0.9);
    if (kind === 3) { add('art2', circ(0, -14, 6, 12), 0.9); for (const px of [-6, 0, 6]) add('hill', rect(px - 1, px + 1, -32, -24), 0.9); }
  };
  addons.push({ name: 'hf_cards', slot: 'hill', geo: S.put(new THREE.TorusGeometry(4, 1.2, 4, 10).rotateY(Math.PI / 2), 14, -9) });
  [-0.55, -0.27, 0, 0.27, 0.55].forEach((a, i) => card(14 + Math.sin(a) * 3, -13, a, [0, 1, 2, 3, 0][i], (i - 2) * 1.6));
  card(292, 112, 0.35, 0, 6, 0.8);      // 銃口の先に浮く2枚（照準の線より下）
  card(306, 80, -0.25, 2, -4, 0.8);
  card(-40, 140, 0.18, 1, 4, 0.7);      // 撃鉄の後ろ
  card(214, 152, -0.45, 3, 24, 0.7);    // 銃身の右の上（照準の線の外）
  const deco = makeAddons(B, addons);

  // ---------- 塗装 ----------
  let skin = opt.skin || DEFAULT_SKIN;
  function setSkin(id: string) {
    skin = id;
    const m = skinMaterials(id);
    for (const [slot, meshes] of Object.entries(B.slots)) meshes.forEach(x => { x.material = m[slot] || m.frame; });
    deco.apply(id, m);
  }
  setSkin(skin);

  // ---------- 動き ----------
  const muzzle = new THREE.Object3D(); muzzle.position.copy(S.at(271, 123)); B.root.add(muzzle);
  const eject = new THREE.Object3D(); eject.position.copy(S.at(95, 122, SLIDE_W / 2 + 2)); slide.add(eject);
  eject.position.sub(slide.userData.pivotAt);
  // 弾倉はグリップの傾きに沿って抜き差しする
  const along = (keys: Key[]): Track[] => [['mag', 'py', keys.map(([t, d]) => [t, -0.978 * d] as Key)], ['mag', 'pz', keys.map(([t, d]) => [t, 0.206 * d] as Key)]];
  const COCK = 0.55;   // 撃鉄を起こした角度
  hammer.rotation.x = COCK;
  const clips: Record<string, Clip> = {
    fire: {
      dur: 0.16, events: [[0.02, 'eject']],
      tracks: [
        ['slide', 'pz', [[0, 0], [0.022, LOCK], [0.11, 0]], 'out'],
        ['hammer', 'rx', [[0, 0], [0.01, -COCK], [0.025, -0.1], [0.05, 0]], 'lin'],
        ['trigger', 'rx', [[0, 0], [0.015, -0.3], [0.08, -0.3], [0.16, 0]]],
      ],
    },
    fireLast: {
      dur: 0.1, hold: true, events: [[0.02, 'eject']],
      tracks: [
        ['slide', 'pz', [[0, 0], [0.022, LOCK]], 'out'],
        ['hammer', 'rx', [[0, 0], [0.01, -COCK], [0.025, 0]], 'lin'],
        ['trigger', 'rx', [[0, 0], [0.015, -0.3], [0.1, 0]]],
      ],
    },
    release: {
      dur: 0.14,
      tracks: [
        ['slide', 'pz', [[0, LOCK], [0.04, -0.002], [0.07, 0]], 'in'],
        ['root', 'rx', [[0, 0], [0.04, 0.06], [0.14, 0]]],
      ],
    },
    // 長さ 1 で書き、武器のリロード時間に合わせて伸ばす
    reload: {
      dur: 1, events: [[0.14, 'magOut'], [0.58, 'magIn'], [0.72, 'release']],
      tracks: [
        // 画面のまん中へ持ち上げ、傾けて弾倉の口を見せる
        ['root', 'rz', [[0, 0], [0.12, -0.95], [0.8, -0.95], [1, 0]]],
        ['root', 'rx', [[0, 0], [0.12, 0.22], [0.56, 0.22], [0.6, 0.34], [0.66, 0.22], [0.8, 0.22], [1, 0]]],
        ['root', 'px', [[0, 0], [0.12, -0.06], [0.8, -0.06], [1, 0]]],
        ['root', 'py', [[0, 0], [0.12, 0.08], [0.8, 0.08], [1, 0]]],
        ...along([[0, 0], [0.12, 0], [0.3, 0.2], [0.34, 0.2], [0.38, 0.14], [0.56, 0.005], [0.58, 0]]),
        ['mag', 'vis', [[0, 1], [0.3, 1], [0.301, 0], [0.379, 0], [0.38, 1]]],
        ['lhand', 'vis', [[0, 0], [0.34, 0], [0.341, 1], [0.66, 1], [0.661, 0]]],
        ['lhand', 'py', [[0.34, -0.06], [0.4, 0], [0.58, 0], [0.66, -0.1]]],
      ],
    },
    inspect: {
      dur: 2.6,
      tracks: [
        ['root', 'ry', [[0, 0], [0.4, 1.0], [1.2, 1.0], [1.6, -0.55], [2.2, -0.55], [2.6, 0]]],
        ['root', 'rz', [[0, 0], [0.4, -0.3], [1.2, -0.15], [1.6, 0.45], [2.2, 0.45], [2.6, 0]]],
        ['root', 'rx', [[0, 0], [0.4, 0.12], [1.2, 0.28], [1.6, 0.06], [2.6, 0]]],
        ['root', 'px', [[0, 0], [0.4, -0.08], [1.2, -0.08], [1.6, -0.05], [2.2, -0.05], [2.6, 0]]],
        ['root', 'py', [[0, 0], [0.4, 0.05], [2.2, 0.05], [2.6, 0]]],
        ['root', 'pz', [[0, 0], [0.4, 0.04], [2.2, 0.04], [2.6, 0]]],
      ],
    },
    equip: {
      dur: 0.62,
      tracks: [
        ['slide', 'pz', [[0, 0], [0.34, 0], [0.42, LOCK], [0.5, 0]], 'out'],
        ['root', 'rz', [[0, 0.35], [0.3, 0.2], [0.5, 0], [0.62, 0]]],
      ],
    },
  };
  const anim = new GunAnimator({ root: B.root, slide, hammer, trigger, mag, ...(lhand ? { lhand } : {}) }, clips);
  const onEvent: Record<string, () => void> = {
    // 弾倉を入れ終えて、スライドが下がったままなら戻す
    release: () => { if (anim.has('fireLast')) { anim.stop('fireLast'); anim.play('release'); } },
  };
  anim.on = ev => { onEvent[ev]?.(); model.onEvent?.(ev); };

  const model = {
    g: B.root, parts: B.parts, slots: B.slots, muzzle, eject, anim,
    // 前の銃と同じ形の項目（スライドは動きの仕組みで動かすので、ここでは動かさない）
    slide, slideZ: slide.position.z, slideAmt: 0,
    // 一人称の構え：大きさ・腰だめ・覗き込みの位置
    vmScale: 1.1, vmYaw: -0.1, vmSize: 0.72,   // vmSize：一人称での大きさの倍率
    hip: new THREE.Vector3(0.17, -0.2, -0.44), ads: new THREE.Vector3(0.12, -0.25, -0.42),
    info: { name: 'デザートイーグル', real: '全長 269mm・高さ 149mm' },
    get skin() { return skin; }, setSkin,
    onEvent: null as null | ((ev: string) => void),
    // 撃つ・リロード・眺める
    fire(empty = false) { anim.stop('inspect'); anim.stop('equip'); anim.play(empty ? 'fireLast' : 'fire'); },
    reload(dur = 1.3) { anim.stop('inspect'); anim.play('reload', dur); },
    inspect() { if (!anim.has('reload') && !anim.has('fireLast')) anim.play('inspect'); },
    equip() { anim.clear(); anim.play('equip'); },
  };
  return model;
}
