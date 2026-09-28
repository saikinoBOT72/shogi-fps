// デザートイーグル（Mark XIX・6インチ）見本
// 実銃の寸法：全長 269mm・高さ 149mm・幅 32mm。図面は横から見た mm で書き、面取りしたローポリにする
//
// 動く部品：slide（スライド）・hammer（撃鉄）・trigger（引き金）・mag（弾倉）・lhand（左手：リロードのとき）
// 動き　　：fire（撃つ）・fireLast（最後の1発：スライドが下がったまま）・release（スライドを戻す）
// 　　　　　reload（弾倉を落として入れ替える）・inspect（眺める）・equip（構える：スライドを引く）
import * as THREE from 'three';
import { GunAnimator, Clip, Track, Key } from './anim';
import { PartBuilder, Pt, makeSpace } from './kit';
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
  B.add('slide', S.extrude([[0, 102], [0, 131], [4, 136], [113, 136], [119, 102]], SLIDE_W, { bevel: 1.5 }), slide);
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
    rh.scale.set(0.72, 0.95, 0.8); rh.position.copy(S.at(34, 46, 3)); rh.castShadow = true;
    B.root.add(rh);
    lhand = B.part('lhand', [30, -30], mag);
    const lh = new THREE.Mesh(handGeo, opt.hand); lh.scale.set(0.8, 0.7, 0.8); lhand.add(lh);
    lhand.visible = false;
  }
  B.finish();

  // ---------- 塗装 ----------
  let skin = opt.skin || DEFAULT_SKIN;
  function setSkin(id: string) {
    skin = id;
    const m = skinMaterials(id);
    for (const [slot, meshes] of Object.entries(B.slots)) meshes.forEach(x => { x.material = m[slot] || m.frame; });
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
