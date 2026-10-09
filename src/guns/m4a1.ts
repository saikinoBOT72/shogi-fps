// M4A1（ストックを伸ばした形）見本
// 実銃の寸法：全長 840mm・銃身 368mm。上のレール（フラットトップ）、後ろの跳ね上げ照門、三角の照星、四面レールのハンドガード、伸縮ストック、少し曲がった30連弾倉
//
// 動く部品：carrier（排莢口から見えるボルトキャリア）・chandle（後ろの上のチャージングハンドル）・trigger・mag・lhand（左手：ハンドガード）
// 動き　　：fire（キャリアが往復）・reload（弾倉を落として入れる → チャージングハンドルを引く）・inspect・equip
import * as THREE from 'three';
import { Clip } from './anim';
import { PartBuilder, makeSpace } from './kit';
import { handMesh, makeGun } from './model';
import { inspectClip, handPath, magDrop, reloadTilt } from './std';

// 図面は写真（全長 840mm）の座標そのまま。u=0 が床尾の後ろ、v=0 が弾倉の底
const S = makeSpace(240, 150);  // 原点：グリップの付け根
const TRAVEL = 0.06, PULL = 0.06;
const RW = 30;                  // 機関部の幅
const BV = 196;                 // 銃身の中心の高さ

export function buildM4A1(opt: { skin?: string; hand?: THREE.Material } = {}) {
  const B = new PartBuilder(S);
  const carrier = B.part('carrier', [320, 198]);
  const chandle = B.part('chandle', [214, 218]);
  const trigger = B.part('trigger', [294, 140]);
  const mag = B.part('mag', [370, 60]);
  const lhand = B.part('lhand', [520, 160]);

  const ribs = (u0: number, u1: number, v0: number, v1: number, w: number, x = 0, slot = 'frame') => { for (let u = u0; u < u1; u += 10) B.add(slot, S.box(u, u + 5, v0, v1, w, x)); };
  const pin = (u: number, v: number, x: number, r = 3.5) => S.put(new THREE.CylinderGeometry(r, r, 2, 8).rotateZ(Math.PI / 2), u, v, x);

  // ---------- 伸縮ストック（上の丸い筒が太い緩衝管を包む。下へ床尾が下がる） ----------
  B.add('frame', S.rod(60, 214, 192, 15, 12));                             // 緩衝管
  B.add('frame', S.rod(14, 150, 194, 21, 12));                             // ストックの筒（管を包む）
  B.add('frame', S.extrude([[4, 120], [4, 206], [14, 214], [150, 206], [150, 176], [110, 154], [60, 124], [44, 82], [22, 76], [12, 96]], 34, { bevel: 3, taper: [0.82, 1] }));
  for (const x of [-1, 1]) for (const [a, b2, v] of [[30, 120, 178], [34, 104, 160]]) B.add('slideDark', S.extrude([[a, v], [b2, v + (b2 - a) * 0.12], [b2, v + 6 + (b2 - a) * 0.12], [a, v + 6]], 0.6, { bevel: 0, x: x * 15.6 }));   // 横の肉抜き
  B.add('slideDark', S.extrude([[0, 74], [0, 214], [6, 218], [10, 218], [10, 74]], 40, { bevel: 3 }));   // 床尾の当て
  for (let v = 82; v < 212; v += 9) B.add('slideDark', S.box(-1.5, 1.5, v, v + 4, 41));
  B.add('frame', S.box(96, 140, 166, 174, 12));                            // 伸縮のレバー
  B.add('frame', S.rod(196, 206, 192, 19, 10));                            // 留めナット
  B.add('frame', S.box(198, 206, 176, 210, 32));                           // 端の板（負い紐を付ける）
  // ---------- 下の機関部・弾倉の入口（少し広がる）・用心鉄・グリップ ----------
  B.add('frame', S.extrude([[206, 150], [206, 182], [400, 182], [404, 166], [400, 140], [262, 140], [240, 150]], RW, { bevel: 2 }));
  B.add('frame', S.extrude([[326, 152], [330, 114], [406, 118], [406, 152]], RW + 4, { bevel: 2.5, taper: [1.1, 0.95] }));   // 弾倉の入口
  B.add('frame', S.extrude([[262, 142], [262, 112], [268, 107], [322, 107], [328, 113], [328, 142]], 8, {
    bevel: 1, holes: [[[266, 140], [267, 116], [272, 112], [318, 112], [323, 117], [323, 140]]],
  }));
  B.add('detail', S.extrude([[290, 140], [297, 140], [298, 130], [301, 120], [297, 118], [293, 124], [291, 132]], 6, { bevel: 0.6 }), trigger);
  B.add('grip', S.extrude([[178, 50], [182, 44], [220, 38], [230, 46], [242, 78], [250, 88], [244, 96], [262, 112], [266, 150], [236, 150], [220, 126], [190, 82]], 30, { bevel: 4 }));
  B.add('detail', S.box(232, 248, 160, 168, 3, -(RW / 2 + 1)));           // セレクター（左）
  for (const x of [-1, 1]) { B.add('detail', pin(214, 168, x * (RW / 2 + 0.6))); B.add('detail', pin(380, 172, x * (RW / 2 + 0.6))); }   // 分解ピン
  B.add('frame', S.extrude([[332, 146], [350, 146], [350, 164], [332, 164]], RW + 4, { bevel: 1.5, holes: [[[336, 150], [346, 150], [346, 160], [336, 160]]] }));   // 弾倉ボタンの囲い
  B.add('detail', S.box(337, 345, 151, 159, RW + 5));                     // 弾倉を外すボタン
  B.add('detail', S.extrude([[316, 146], [328, 146], [330, 168], [318, 170]], 3, { bevel: 0.6, x: -(RW / 2 + 1.5) }));   // ボルトキャッチ（左）
  // ---------- 上の機関部・レール・跳ね上げ照門・排莢口・前進補助・薬莢よけ ----------
  B.add('frame', S.extrude([[204, 182], [204, 214], [410, 214], [410, 182]], RW + 2, { bevel: 2 }));
  B.add('frame', S.box(208, 410, 214, 220, 22));
  ribs(212, 406, 220, 223.5, 22);
  B.add('detail', S.box(256, 286, 222, 228, 18));                         // 跳ね上げ照門：台
  for (const x of [-1, 1]) B.add('detail', S.extrude([[258, 227], [284, 227], [282, 240], [276, 247], [266, 247], [260, 240]], 3, { bevel: 0.6, x: x * 7.5 }));   // 両側の耳
  B.add('detail', S.extrude([[268, 227], [274, 227], [273, 244], [269, 244]], 11, { bevel: 0.5 }));   // のぞき穴の板
  B.add('bore', S.rod(267.5, 274.5, 239, 1.6, 8));
  B.add('bore', S.box(296, 350, 188, 206, 0.8, RW / 2 + 1.2));            // 排莢口（右）
  B.add('frame', S.box(296, 350, 184, 188, 3, RW / 2 + 1.8));             // 蓋のちょうつがい
  B.add('frame', S.extrude([[288, 200], [296, 200], [296, 214], [284, 214]], 6, { bevel: 1, x: RW / 2 + 2.5 }));   // 薬莢よけ
  B.add('frame', S.put(new THREE.CylinderGeometry(9, 9, 34, 10).rotateX(Math.PI / 2).rotateY(-0.35), 362, 196, RW / 2 + 6));   // 前進補助
  B.add('detail', S.put(new THREE.CylinderGeometry(10, 10, 5, 10).rotateX(Math.PI / 2).rotateY(-0.35), 350, 196, RW / 2 + 10));
  // ---------- 四面レールのハンドガード（芯の筒に上下左右のレール）・照星・銃身・消炎器 ----------
  B.add('frame', S.rod(404, 414, BV, 30, 12));                           // 付け根の輪
  B.add('frame', S.extrude([[412, 172], [412, 222], [610, 222], [610, 172]], 38, { bevel: 6 }));   // 芯
  B.add('frame', S.box(414, 608, 222, 228, 22)); ribs(418, 604, 228, 231.5, 22);   // 上
  B.add('frame', S.box(414, 608, 166, 172, 22)); ribs(418, 604, 162.5, 166, 22);   // 下
  for (const x of [-1, 1]) { B.add('frame', S.box(414, 608, 186, 208, 6, x * 20)); ribs(418, 604, 186, 208, 3.5, x * 24.2); }   // 左右
  B.add('frame', S.rod(606, 616, BV, 26, 12));                           // 前の輪
  B.add('slide', S.rod(610, 792, BV, 9.5, 8));
  B.add('frame', S.box(618, 656, 178, 212, 24));                          // 照星の台
  B.add('frame', S.extrude([[620, 212], [628, 230], [648, 266], [658, 266], [658, 212]], 14, { bevel: 1.5, holes: [[[634, 216], [640, 230], [650, 252], [650, 216]]] }));   // 三角の照星
  B.add('detail', S.box(650, 655, 256, 272, 3));
  B.add('frame', S.box(640, 652, 166, 178, 8));                           // 銃剣の留め
  B.add('detail', S.put(new THREE.TorusGeometry(6, 1.8, 5, 10), 630, 170, 0, [0, Math.PI / 2, 0]));   // 負い紐の輪
  B.add('slide', S.rod(790, 840, BV, 11, 8));                             // 消炎器
  for (const x of [-6, 0, 6]) B.add('bore', S.box(806, 834, 203.5, 207.6, 3, x));   // 上の切れ目
  B.add('bore', S.rod(839.5, 840.6, BV, 5, 8));
  // ---------- 弾倉（30連・少し前へ曲がる） ----------
  B.add('mag', S.extrude([[332, 122], [402, 122], [406, 72], [414, 20], [416, 10], [352, 2], [346, 30], [336, 80]], 24, { bevel: 1.2 }), mag);
  B.add('slideDark', S.extrude([[350, 6], [416, 14], [418, 8], [352, 0]], 25, { bevel: 0.4 }), mag);
  // ---------- 動く部品：キャリア（排莢口の奥）・チャージングハンドル ----------
  B.add('slideDark', S.box(298, 348, 190, 204, 1, RW / 2 + 0.5), carrier);
  B.add('detail', S.extrude([[196, 214], [226, 214], [226, 222], [204, 222], [192, 226], [192, 218]], 26, { bevel: 1 }), chandle);

  if (opt.hand) {
    const rh = handMesh(opt.hand, 0.75, 0.95, 0.85); rh.position.copy(S.at(222, 100, 40)); B.root.add(rh);
    const lh = handMesh(opt.hand, 0.8, 0.8, 0.95); lh.position.set(-0.045, -0.005, 0); lhand.add(lh);
  }
  const muzzle = new THREE.Object3D(); muzzle.position.copy(S.at(842, BV));
  const eject = new THREE.Object3D(); eject.position.copy(S.at(322, 198, RW / 2 + 3)); B.root.add(eject);

  const toMag = { y: -0.1, z: 0.15 }, toCh = { x: 0.03, y: 0.07, z: 0.27 };
  const clips: Record<string, Clip> = {
    fire: {
      dur: 0.08, events: [[0.015, 'eject']],
      tracks: [
        ['carrier', 'pz', [[0, 0], [0.02, TRAVEL], [0.065, 0]], 'out'],
        ['trigger', 'rx', [[0, 0], [0.01, -0.25], [0.05, -0.25], [0.08, 0]]],
      ],
    },
    reload: {
      dur: 1, events: [[0.3, 'magOut'], [0.56, 'magIn'], [0.8, 'rack']],
      tracks: [
        ...reloadTilt(0.1, 0.88, 0.35, 0.12, 0.04),
        ...magDrop(0.3, 0.56, 0.3),
        ['chandle', 'pz', [[0, 0], [0.72, 0], [0.78, PULL], [0.8, PULL], [0.82, 0]], 'lin'],
        ['carrier', 'pz', [[0, 0], [0.72, 0], [0.78, TRAVEL], [0.8, TRAVEL], [0.82, 0]], 'lin'],
        ...handPath([[0, {}], [0.2, toMag], [0.3, { ...toMag, y: toMag.y - 0.24 }], [0.36, { ...toMag, y: toMag.y - 0.24 }], [0.56, toMag], [0.62, toMag], [0.7, toCh], [0.78, { ...toCh, z: toCh.z + PULL }], [0.84, toCh], [0.94, {}]]),
      ],
    },
    inspect: inspectClip(1),
    equip: {
      dur: 0.7,
      tracks: [
        ['root', 'rz', [[0, 0.3], [0.35, 0.15], [0.6, 0]]],
        ['chandle', 'pz', [[0, 0], [0.3, 0], [0.38, PULL], [0.44, 0]], 'lin'],
        ['carrier', 'pz', [[0, 0], [0.3, 0], [0.38, TRAVEL], [0.44, 0]], 'lin'],
        ...handPath([[0, {}], [0.2, toCh], [0.3, toCh], [0.38, { ...toCh, z: toCh.z + PULL }], [0.46, toCh], [0.62, {}]]),
      ],
    },
  };
  return makeGun({
    B, clips, muzzle, eject, skin: opt.skin || 'kurogane',
    info: { name: 'M4A1', real: '全長 840mm・銃身 368mm', reload: 2.0 },
    vm: { scale: 1, hip: new THREE.Vector3(), ads: new THREE.Vector3(), size: 0.85 },
  });
}
