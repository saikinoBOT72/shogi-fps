// 銃の塗装（スキン）：部品を「塗りの場所（スロット）」に分けて、場所ごとに色と質感を決める
//
//   slide  : スライド（上の動く部分）      barrel : 銃身
//   frame  : フレーム・用心鉄              grip   : グリップの板
//   detail : 照準・ハンマー・引き金など小物  mag    : 弾倉
//   （slideDark はスライドの色から自動で作る溝の色、bore は銃口の穴）
// 色は必ずパレット（P）から選ぶ。metal: true で金属のつや（段々の映り込み）になる
import * as THREE from 'three';
import { P, css, rgba } from '../palette';
import { toon } from '../materials';

export type SlotStyle = { c: number; metal?: boolean; tex?: 'stipple' | 'wood' | 'checker' | 'web' };
export type Skin = { name: string; slide: SlotStyle; barrel: SlotStyle; frame: SlotStyle; grip: SlotStyle; detail: SlotStyle; mag?: SlotStyle };

export const SKINS: Record<string, Skin> = {
  kurogane: {
    name: '黒鉄',
    slide: { c: P.sumi[1], metal: true }, barrel: { c: P.sumi[1], metal: true }, frame: { c: P.sumi[1] },
    grip: { c: P.sumi[0], tex: 'stipple' }, detail: { c: P.sumi[2] },
  },
  gin: {
    name: '銀',
    slide: { c: P.nezumi[2], metal: true }, barrel: { c: P.nezumi[2], metal: true }, frame: { c: P.nezumi[1], metal: true },
    grip: { c: P.sumi[0], tex: 'stipple' }, detail: { c: P.sumi[1] },
  },
  kin: {
    name: '金',
    slide: { c: P.kin[1], metal: true }, barrel: { c: P.kin[1], metal: true }, frame: { c: P.kin[1], metal: true },
    grip: { c: P.kin[0], tex: 'checker' }, detail: { c: P.kin[2], metal: true },
  },
  shuurushi: {
    name: '朱漆',
    slide: { c: P.sumi[1], metal: true }, barrel: { c: P.sumi[1], metal: true }, frame: { c: P.shu[1] },
    grip: { c: P.kiji[1], tex: 'wood' }, detail: { c: P.kin[1], metal: true },
  },
  seiji: {
    name: '青磁',
    slide: { c: P.seiji[2] }, barrel: { c: P.nezumi[2], metal: true }, frame: { c: P.seiji[1] },
    grip: { c: P.nezumi[2], tex: 'stipple' }, detail: { c: P.shiro[1] },
  },
  // 木の銃床の銃（AK・Mk2）の基本
  mokume: {
    name: '木目',
    slide: { c: P.sumi[1], metal: true }, barrel: { c: P.sumi[1], metal: true }, frame: { c: P.sumi[1] },
    grip: { c: P.kiji[1], tex: 'wood' }, detail: { c: P.sumi[0] }, mag: { c: P.sumi[1], metal: true },
  },
  // 鋼の刃・黒いゴムの握り（カランビットの基本）
  hagane: {
    name: '鋼',
    slide: { c: P.nezumi[2], metal: true }, barrel: { c: P.nezumi[2], metal: true }, frame: { c: P.nezumi[2], metal: true },
    grip: { c: P.sumi[1] }, detail: { c: P.sumi[1] },
  },
  // 青い刃（カランビット）
  ruri: {
    name: '瑠璃',
    slide: { c: P.mizu[1], metal: true, tex: 'web' }, barrel: { c: P.mizu[1], metal: true }, frame: { c: P.mizu[1], metal: true },
    grip: { c: P.sumi[1], tex: 'checker' }, detail: { c: P.nezumi[2], metal: true },
  },
  fuji: {
    name: '藤',
    slide: { c: P.fuji[1], metal: true }, barrel: { c: P.sumi[1], metal: true }, frame: { c: P.sumi[1] },
    grip: { c: P.fuji[0], tex: 'stipple' }, detail: { c: P.fuji[2] },
  },
};
export const DEFAULT_SKIN = 'kurogane';

// ---------- 質感 ----------
const canvas = (w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) => {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
};
const shade = (n: number, k: number) => new THREE.Color(n).multiplyScalar(k).getHex();
const mix = (a: number, b: number, k: number) => new THREE.Color(a).lerp(new THREE.Color(b), k).getHex();

// 金属のつや：光の当たり方を段々（4段＋光の点）に塗った球の絵（マットキャップ）。光の計算が要らず軽い
const matcapCache = new Map<number, THREE.Texture>();
function metalMatcap(c: number) {
  if (matcapCache.has(c)) return matcapCache.get(c);
  const N = 96;
  const t = canvas(N, N, g => {
    const img = g.createImageData(N, N);
    const L = new THREE.Vector3(-0.5, 0.72, 0.48).normalize();   // 真正面を向いた面が「基本の色」の段に入るように
    // 段：暗い縁 → 影 → 基本の色 → 明るい → 光の点。上を向いた面には空が少し映る
    const bands = [shade(c, 0.32), shade(c, 0.62), c, mix(c, P.shiro[2], 0.2), mix(c, P.shiro[2], 0.7)].map(n => new THREE.Color(n));
    const sky = new THREE.Color(P.ao[2]);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const nx = (x + 0.5) / N * 2 - 1, ny = 1 - (y + 0.5) / N * 2, r = nx * nx + ny * ny;
      const i = (y * N + x) * 4;
      if (r > 1) { img.data[i + 3] = 0; continue; }
      const n = new THREE.Vector3(nx, ny, Math.sqrt(1 - r));
      const d = n.dot(L);
      let col = d > 0.985 ? bands[4] : d > 0.82 ? bands[3] : d > 0.3 ? bands[2] : d > -0.2 ? bands[1] : bands[0];
      if (ny > 0.6 && d <= 0.82) col = col.clone().lerp(sky, 0.18);   // 上を向いた面には空が映る
      if (n.z < 0.22) col = bands[0];                                   // 縁は暗く
      // 描いた色は sRGB のまま入れる
      const s = col.clone().convertLinearToSRGB();
      img.data[i] = s.r * 255; img.data[i + 1] = s.g * 255; img.data[i + 2] = s.b * 255; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  });
  t.minFilter = t.magFilter = THREE.NearestFilter;
  matcapCache.set(c, t);
  return t;
}

// グリップの表面（滑り止めの点々・木目・格子）
function surface(style: SlotStyle) {
  const c = style.c;
  if (style.tex === 'web') return canvas(256, 256, g => {
    // 蜘蛛の巣の模様：中心から放射状の線と、それをつなぐ弧（ところどころ途切れる）
    g.fillStyle = css(c); g.fillRect(0, 0, 256, 256);
    g.strokeStyle = rgba(P.shiro[2], 0.9); g.lineWidth = 2.2; g.lineCap = 'round';
    const cx = 128, cy = 128, spokes = 9;
    const ang = Array.from({ length: spokes }, (_, i) => i / spokes * Math.PI * 2 + Math.random() * 0.3);
    for (const a of ang) { g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * 190, cy + Math.sin(a) * 190); g.stroke(); }
    for (let r = 22; r < 190; r += 20 + Math.random() * 10) for (let i = 0; i < spokes; i++) {
      if (Math.random() < 0.18) continue;
      const a0 = ang[i], a1 = ang[(i + 1) % spokes] + (i === spokes - 1 ? Math.PI * 2 : 0), rr = r + Math.random() * 6;
      g.beginPath(); g.moveTo(cx + Math.cos(a0) * rr, cy + Math.sin(a0) * rr);
      g.quadraticCurveTo(cx + Math.cos((a0 + a1) / 2) * rr * 0.86, cy + Math.sin((a0 + a1) / 2) * rr * 0.86, cx + Math.cos(a1) * rr, cy + Math.sin(a1) * rr); g.stroke();
    }
  });
  return canvas(64, 64, g => {
    g.fillStyle = css(c); g.fillRect(0, 0, 64, 64);
    if (style.tex === 'stipple') {
      for (let i = 0; i < 420; i++) { g.fillStyle = rgba(i % 2 ? shade(c, 0.5) : mix(c, P.shiro[2], 0.25), 0.55); g.fillRect(Math.random() * 64, Math.random() * 64, 1.5, 1.5); }
    } else if (style.tex === 'wood') {
      for (let i = 0; i < 18; i++) { g.strokeStyle = rgba(shade(c, 0.55), 0.35); g.lineWidth = 1 + Math.random() * 2; g.beginPath(); const y = Math.random() * 64; g.moveTo(0, y); g.bezierCurveTo(20, y + 6, 40, y - 6, 64, y + Math.random() * 4); g.stroke(); }
    } else if (style.tex === 'checker') {
      g.strokeStyle = rgba(shade(c, 0.5), 0.8); g.lineWidth = 1;
      for (let i = -64; i < 128; i += 5) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 64, 64); g.stroke(); g.beginPath(); g.moveTo(i + 64, 0); g.lineTo(i, 64); g.stroke(); }
    }
  });
}

export function slotMaterial(style: SlotStyle): THREE.Material {
  if (style.metal) {
    if (!style.tex) return new THREE.MeshMatcapMaterial({ matcap: metalMatcap(style.c), flatShading: true });
    // 模様のある金属：白い金属のつやに、色と模様の絵を重ねる
    const t = surface(style); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / 70, 1 / 70); t.offset.set(0.35, 0.5);
    return new THREE.MeshMatcapMaterial({ matcap: metalMatcap(P.shiro[2]), map: t, flatShading: true });
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
