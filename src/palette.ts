// 固定パレット：ゲームの色はすべてここから選ぶ（直接 16進を書かない）
// 12の色相 × 明暗3段（[0]暗い / [1]基本 / [2]明るい）＋ 無彩色 ＋ 木地。
// OKLCH（人の目で見た明るさ・鮮やかさが揃う色空間）で、明るさと鮮やかさを揃えて作った。
export const P = {
  shu:    [0x7a3528, 0xd06551, 0xfab8aa],   // 朱
  aka:    [0x8f0f14, 0xc8161d, 0xe8585c],   // 赤（朱肉の赤。UI の判子・決定）
  daidai: [0x743c01, 0xc6701e, 0xf3be97],   // 橙
  kin:    [0x684600, 0xb37f00, 0xe5c68e],   // 金
  ki:     [0x584e00, 0x9b8b00, 0xd5cd90],   // 黄
  moegi:  [0x3d5710, 0x70982f, 0xbbd59d],   // 萌黄
  midori: [0x195c2e, 0x3ca059, 0xa6daaf],   // 緑
  seiji:  [0x005e54, 0x00a394, 0x8cdcd1],   // 青磁
  mizu:   [0x005872, 0x009bc3, 0x8ed7ef],   // 水
  ao:     [0x1d4f82, 0x428cdb, 0xa5cffe],   // 青
  ai:     [0x3e4783, 0x7180dd, 0xbbc7ff],   // 藍
  fuji:   [0x5c3c77, 0xa16fca, 0xd9bdf3],   // 紫
  momo:   [0x753353, 0xc76292, 0xf4b6d0],   // 桃
  sumi:   [0x1a1512, 0x322c28, 0x4d4641],   // 墨
  nezumi: [0x66635d, 0x898680, 0xaeaaa4],   // 鼠
  shiro:  [0xd4d0c8, 0xebe7df, 0xfbf8f2],   // 生成り
  kiji:   [0x724b2c, 0xbb864b, 0xe4bd81],   // 木地
} as const;
export type PalKey = keyof typeof P;
export const PAL_NAMES: Record<PalKey, string> = {
  shu: '朱', aka: '赤', daidai: '橙', kin: '金', ki: '黄', moegi: '萌黄', midori: '緑', seiji: '青磁', mizu: '水',
  ao: '青', ai: '藍', fuji: '紫', momo: '桃', sumi: '墨', nezumi: '鼠', shiro: '生成り', kiji: '木地',
};

// canvas 用の '#rrggbb'
export const css = (n: number) => '#' + n.toString(16).padStart(6, '0');
// canvas 用の 'rgba(r,g,b,a)'
export const rgba = (n: number, a: number) => `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;

// 画面（CSS）からも同じ色を var(--shu-1) のように使えるようにする
export function applyCssPalette() {
  const root = document.documentElement.style;
  for (const [k, v] of Object.entries(P)) v.forEach((n, i) => root.setProperty(`--${k}-${i}`, css(n)));
}
