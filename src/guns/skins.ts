// 銃の塗装（スキン）：部品を「塗りの場所（スロット）」に分けて、場所ごとに色と質感を決める
// スキンは銃ごとに作る。模様で埋めず、色・質感（金属・漆・木・樹脂）・照り返しの色で見せる
//
//   slide  : スライド（上の動く部分）      barrel : 銃身
//   frame  : フレーム・用心鉄              grip   : グリップの板
//   detail : 照準・ハンマー・引き金など小物  mag    : 弾倉
//   （slideDark はスライドの色から自動で作る溝の色、bore は銃口の穴）
// 色は初期スキン・N・R はパレット（P）から選ぶ。SR 以上は自由な色も使ってよい
import * as THREE from 'three';
import { P, css, rgba } from '../palette';
import { toon } from '../materials';

// 質感：metal 金属のつや / gloss 漆・焼き物のような艶（色は均一で、光の点だけ鋭く光る）/ どちらも無ければつや消し
// sheen：照り返しの色（光の当たる所と影の縁がこの色に染まる。無ければ白い光）
// fade：銃の後ろから前へ、色がなめらかに移り変わる（2〜4色）。fadeLen：その銃の長さ（図面の mm、無ければ 270）
// glow：自分で光る（照準・引き金などの小物を光らせる）
// tex：グリップの表面（滑り止めの点々・木目）
export type SlotStyle = { c: number; metal?: boolean; gloss?: boolean; sheen?: number; fade?: number[]; fadeLen?: number; glow?: boolean; tex?: 'stipple' | 'wood' };
// rarity：N ノーマル / R レア / SR スーパーレア / LR レジェンドレア（無いものは初期スキン）
export type Skin = { name: string; gun?: string; rarity?: 'N' | 'R' | 'SR' | 'LR'; slide: SlotStyle; barrel: SlotStyle; frame: SlotStyle; grip: SlotStyle; detail: SlotStyle; mag?: SlotStyle };
export const RARITY = { N: 'ノーマル', R: 'レア', SR: 'スーパーレア', LR: 'レジェンドレア' };

export const SKINS: Record<string, Skin> = {
  // ===== 初期スキン =====
  kurogane: {   // ハンドガン・93R・MP5K
    name: '黒鉄',
    slide: { c: P.sumi[1], metal: true }, barrel: { c: P.sumi[1], metal: true }, frame: { c: P.sumi[1] },
    grip: { c: P.sumi[0], tex: 'stipple' }, detail: { c: P.sumi[2] },
  },
  mokume: {     // 木の銃床の銃（AK・Mk2・M870・M79）
    name: '木目',
    slide: { c: P.sumi[1], metal: true }, barrel: { c: P.sumi[1], metal: true }, frame: { c: P.sumi[1] },
    grip: { c: P.kiji[1], tex: 'wood' }, detail: { c: P.sumi[0] }, mag: { c: P.sumi[1], metal: true },
  },
  hagane: {     // カランビット
    name: '鋼',
    slide: { c: P.nezumi[2], metal: true }, barrel: { c: P.nezumi[2], metal: true }, frame: { c: P.nezumi[2], metal: true },
    grip: { c: P.sumi[1] }, detail: { c: P.sumi[1] },
  },

  // ===== ハンドガン（デザートイーグル） =====
  // N・R はパレットの色だけ。SR 以上は自由な色も使う
  // ノーマル（採用）
  nibi: {
    name: '鈍色', gun: 'pistol', rarity: 'N',
    slide: { c: P.nezumi[1], metal: true }, barrel: { c: P.nezumi[1], metal: true }, frame: { c: P.sumi[2] },
    grip: { c: P.sumi[1], tex: 'stipple' }, detail: { c: P.sumi[0] },
  },
  sabaku: {
    name: '砂漠', gun: 'pistol', rarity: 'N',
    slide: { c: P.kiji[2] }, barrel: { c: P.sumi[1], metal: true }, frame: { c: P.kiji[2] },
    grip: { c: P.kiji[1], tex: 'stipple' }, detail: { c: P.sumi[1] },
  },
  // レア：白磁（採用）・桜餅（候補）
  hakuji: {
    name: '白磁', gun: 'pistol', rarity: 'R',
    slide: { c: P.shiro[2], gloss: true, sheen: P.mizu[2] }, barrel: { c: P.nezumi[2], metal: true }, frame: { c: P.shiro[1], gloss: true },
    grip: { c: P.seiji[1], gloss: true }, detail: { c: P.seiji[0] },
  },
  sakuramochi: {
    name: '桜餅', gun: 'pistol', rarity: 'R',
    slide: { c: P.momo[2], gloss: true, sheen: P.shiro[2] }, barrel: { c: P.nezumi[2], metal: true, sheen: P.momo[2] }, frame: { c: P.shiro[2], gloss: true, sheen: P.momo[2] },
    grip: { c: P.momo[1], gloss: true, sheen: P.momo[2] }, detail: { c: P.shiro[2], metal: true, sheen: P.momo[2] },
  },
  // スーパーレア：黒曜（採用）・極光（候補）
  kokuyou: {
    name: '黒曜', gun: 'pistol', rarity: 'SR',
    slide: { c: P.sumi[0], metal: true, sheen: P.seiji[2] }, barrel: { c: P.sumi[0], metal: true, sheen: P.fuji[2] }, frame: { c: P.sumi[0], metal: true, sheen: P.fuji[2] },
    grip: { c: P.sumi[0], gloss: true, sheen: P.seiji[2] }, detail: { c: P.seiji[2], metal: true, sheen: P.shiro[2] },
  },
  kyokkou: {   // オーロラ：翠 → 空色 → 菫へ流れる金属。縁に光る緑が差す
    name: '極光', gun: 'pistol', rarity: 'SR',
    slide: { c: 0x2aa8ff, metal: true, sheen: 0xc8fff0, fade: [0x19e3b1, 0x2aa8ff, 0x9b5cff] }, barrel: { c: 0x9b5cff, metal: true, sheen: 0xd8c8ff },
    frame: { c: 0x10141c, metal: true, sheen: 0x5cffd0 }, grip: { c: 0x0c0f16, gloss: true, sheen: 0x5cffd0 }, detail: { c: 0x7dffe0, glow: true },
  },
  // レジェンドレア（候補）：紅蓮・黄金
  guren: {     // 赤黒：黒い本体に血のような赤の照り返し。スライドは銃口へ向かって紅く燃え、照準と引き金は赤く光る
    name: '紅蓮', gun: 'pistol', rarity: 'LR',
    slide: { c: 0x8a0010, metal: true, sheen: 0xff3040, fade: [0x0a0a0c, 0x3a0008, 0xd0101e] }, barrel: { c: 0xb0101c, metal: true, sheen: 0xff6070 },
    frame: { c: 0x0b0b0d, metal: true, sheen: 0xff2030 }, grip: { c: 0x09090a, gloss: true, sheen: 0xff2030 }, detail: { c: 0xff1a2e, glow: true },
  },
  ougon: {     // 金ぴか：全部が磨いた金。照り返しは白に近い光、小物は淡い金に光る
    name: '黄金', gun: 'pistol', rarity: 'LR',
    slide: { c: 0xe0a91a, metal: true, sheen: 0xfff4c0 }, barrel: { c: 0xf2c230, metal: true, sheen: 0xffffff }, frame: { c: 0xc8900e, metal: true, sheen: 0xfff0a0 },
    grip: { c: 0xb07a08, gloss: true, sheen: 0xffe27a }, detail: { c: 0xfff0b0, glow: true },
  },
};
export const DEFAULT_SKIN = 'kurogane';

// ===== 紅蓮（LR）を全部の武器に =====
// 黒い本体に赤の照り返し、銃口へ向かって紅く燃える色の流れ、照準・引き金などの小物は赤く光る
// 長い銃は本体（frame）を後ろの黒から銃口の紅へ流す。スライドのある銃（ハンドガン・93R）はスライドを流す
const GUREN = { black: 0x0b0b0d, deep: 0x3a0008, red: 0xd0101e, crimson: 0xb0101c, glow: 0xff1a2e, sheen: 0xff2030 };
function guren(gun: string, len: number, frameFade: boolean): Skin {
  const flow = [0x0a0a0c, 0x0a0a0c, GUREN.deep, GUREN.red];
  return {
    name: '紅蓮', gun, rarity: 'LR',
    slide: { c: 0x8a0010, metal: true, sheen: 0xff3040, fade: [0x0a0a0c, GUREN.deep, GUREN.red], fadeLen: len },
    barrel: { c: GUREN.crimson, metal: true, sheen: 0xff6070 },
    frame: frameFade ? { c: GUREN.black, metal: true, sheen: GUREN.sheen, fade: flow, fadeLen: len } : { c: GUREN.black, metal: true, sheen: GUREN.sheen },
    grip: { c: 0x09090a, gloss: true, sheen: GUREN.sheen }, detail: { c: GUREN.glow, glow: true }, mag: { c: GUREN.black, metal: true, sheen: GUREN.sheen },
  };
}
for (const [gun, len, ff] of [['b93r', 244, false], ['mp5', 337, true], ['ak', 884, true], ['mk2', 1033, true], ['m870', 973, true], ['m79', 733, true]] as [string, number, boolean][])
  SKINS['guren_' + gun] = guren(gun, len, ff);
// カランビット：刃（frame）は紅い金属、そのほかは黒
SKINS.guren_karambit = { ...guren('karambit', 190, false), frame: { c: GUREN.crimson, metal: true, sheen: 0xff6070 }, slide: { c: GUREN.black, metal: true, sheen: GUREN.sheen } };
// 和弓：黒漆の弓に、赤く光る籐巻き、紅い握り
SKINS.guren_yumi = { ...guren('yumi', 270, false), frame: { c: GUREN.black, gloss: true, sheen: GUREN.sheen }, grip: { c: 0x8a0010, gloss: true, sheen: 0xff3040 } };

// ---------- 質感 ----------
const canvas = (w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) => {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
};
const shade = (n: number, k: number) => new THREE.Color(n).multiplyScalar(k).getHex();
const mix = (a: number, b: number, k: number) => new THREE.Color(a).lerp(new THREE.Color(b), k).getHex();

// つや：光の当たり方を段々に塗った球の絵（マットキャップ）。光の計算が要らず軽い
//   金属：暗い縁 → 影 → 基本の色 → 明るい → 光の点。上を向いた面には空が少し映る
//   艶（漆・焼き物）：色はほとんど均一で、光の点だけが小さく鋭く光る
// sheen があれば、明るい段と影の縁がその色に染まる（見る角度で色が変わって見える）
const matcapCache = new Map<string, THREE.Texture>();
function matcap(c: number, sheen: number | undefined, gloss: boolean) {
  const key = c + ':' + (sheen ?? '') + ':' + gloss;
  if (matcapCache.has(key)) return matcapCache.get(key);
  const N = 96;
  const t = canvas(N, N, g => {
    const img = g.createImageData(N, N);
    const L = new THREE.Vector3(-0.5, 0.72, 0.48).normalize();   // 真正面を向いた面が「基本の色」の段に入るように
    const hi = sheen ?? P.shiro[2];
    const bands = (gloss
      ? [shade(c, 0.45), sheen !== undefined ? mix(shade(c, 0.8), sheen, 0.3) : shade(c, 0.8), c, c, mix(c, hi, 0.9)]
      : [shade(c, 0.32), sheen !== undefined ? mix(shade(c, 0.62), sheen, 0.35) : shade(c, 0.62), c, mix(c, hi, 0.3), mix(c, hi, 0.8)]).map(n => new THREE.Color(n));
    const sky = new THREE.Color(sheen ?? P.ao[2]);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const nx = (x + 0.5) / N * 2 - 1, ny = 1 - (y + 0.5) / N * 2, r = nx * nx + ny * ny;
      const i = (y * N + x) * 4;
      if (r > 1) { img.data[i + 3] = 0; continue; }
      const n = new THREE.Vector3(nx, ny, Math.sqrt(1 - r));
      const d = n.dot(L);
      let col = gloss
        ? (d > 0.975 ? bands[4] : d > 0.1 ? bands[2] : d > -0.35 ? bands[1] : bands[0])
        : (d > 0.985 ? bands[4] : d > 0.82 ? bands[3] : d > 0.3 ? bands[2] : d > -0.2 ? bands[1] : bands[0]);
      if (!gloss && ny > 0.6 && d <= 0.82) col = col.clone().lerp(sky, 0.18);   // 上を向いた面には空が映る
      if (n.z < (gloss ? 0.15 : 0.22)) col = sheen !== undefined ? bands[0].clone().lerp(new THREE.Color(sheen), 0.35) : bands[0];   // 縁（照り返しの色がにじむ）
      // 描いた色は sRGB のまま入れる
      const s = col.clone().convertLinearToSRGB();
      img.data[i] = s.r * 255; img.data[i + 1] = s.g * 255; img.data[i + 2] = s.b * 255; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  });
  t.minFilter = t.magFilter = THREE.NearestFilter;
  matcapCache.set(key, t);
  return t;
}

// グリップの表面（滑り止めの点々・木目）
function surface(style: SlotStyle) {
  const c = style.c;
  return canvas(64, 64, g => {
    g.fillStyle = css(c); g.fillRect(0, 0, 64, 64);
    if (style.tex === 'stipple') {
      for (let i = 0; i < 420; i++) { g.fillStyle = rgba(i % 2 ? shade(c, 0.5) : mix(c, P.shiro[2], 0.25), 0.55); g.fillRect(Math.random() * 64, Math.random() * 64, 1.5, 1.5); }
    } else if (style.tex === 'wood') {
      for (let i = 0; i < 18; i++) { g.strokeStyle = rgba(shade(c, 0.55), 0.35); g.lineWidth = 1 + Math.random() * 2; g.beginPath(); const y = Math.random() * 64; g.moveTo(0, y); g.bezierCurveTo(20, y + 6, 40, y - 6, 64, y + Math.random() * 4); g.stroke(); }
    }
  });
}
// 後ろから前への色の移り変わり（図面の mm で、銃の後ろ 0 から銃口 len まで1回だけ）
function fadeMap(cols: number[], len = 270) {
  const t = canvas(256, 4, g => {
    const gr = g.createLinearGradient(0, 0, 256, 0);
    cols.forEach((c, i) => gr.addColorStop(i / (cols.length - 1), css(c)));
    g.fillStyle = gr; g.fillRect(0, 0, 256, 4);
  });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.repeat.set(1 / len, 1 / len);
  return t;
}

export function slotMaterial(style: SlotStyle): THREE.Material {
  if (style.glow) return new THREE.MeshBasicMaterial({ color: style.c });
  if (style.metal || style.gloss) {
    const gloss = !!style.gloss && !style.metal;
    // 色の移り変わり：白いつやに、色の帯を重ねる
    if (style.fade) return new THREE.MeshMatcapMaterial({ matcap: matcap(P.shiro[2], style.sheen, gloss), map: fadeMap(style.fade, style.fadeLen), flatShading: true });
    return new THREE.MeshMatcapMaterial({ matcap: matcap(style.c, style.sheen, gloss), flatShading: true });
  }
  const o: any = { color: new THREE.Color(style.c) };
  if (style.tex) {
    const t = surface(style); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / 24, 1 / 24);   // 図面の mm で 24mm ごとに繰り返す
    o.map = t; o.color = new THREE.Color(0xffffff);
  }
  return toon(o);
}

// 塗りの場所ごとの材質を作る
export function skinMaterials(id: string) {
  const s = SKINS[id] || SKINS[DEFAULT_SKIN];
  const m: Record<string, THREE.Material> = {};
  for (const k of ['slide', 'barrel', 'frame', 'grip', 'detail'] as const) m[k] = slotMaterial(s[k]);
  m.mag = slotMaterial(s.mag || { c: P.sumi[2] });
  m.slideDark = toon({ color: new THREE.Color(shade(s.slide.c, 0.45)) });
  m.bore = new THREE.MeshBasicMaterial({ color: P.sumi[0] });
  return m;
}
