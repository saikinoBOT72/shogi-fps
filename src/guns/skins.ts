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
// fadeAxis：'v' なら色の流れを下→上（図面の v）にする（カランビットの刃のように縦に長い部品用）
// tex：グリップの表面（滑り止めの点々・木目）。fadeFrom：色の流れが始まる位置（図面の mm。刃のように図面のマイナス側にある部品用）
export type SlotStyle = { c: number; metal?: boolean; gloss?: boolean; sheen?: number; fade?: number[]; fadeLen?: number; fadeFrom?: number; fadeAxis?: 'v'; glow?: boolean; tex?: 'stipple' | 'wood' };
// rarity：N ノーマル / R レア / SR スーパーレア / LR レジェンドレア（無いものは初期スキン）
// SR 以上の付け足し（形の輪郭はほぼ変えない小さな部品。どれがあるかは銃ごとに作る）：addons に名前を並べる
//   accent：付け足しの部品（根付・飾り板・輪・鎖・房・鈴）の色 / gem：宝石・ラインストーンの色 / line：光る線の色
//   extra：飾り専用の色を名前つきで足す（しめ縄の藁色・紙垂の白など。飾りの slot にその名前を書く）
// LR の演出：fx.flash 銃口の光の色 / fx.tracer 弾の線の色 / fx.aura 眺めたときに舞う光の色
export type Skin = {
  name: string; gun?: string; rarity?: 'N' | 'R' | 'SR' | 'LR'; slide: SlotStyle; barrel: SlotStyle; frame: SlotStyle; grip: SlotStyle; detail: SlotStyle; mag?: SlotStyle;
  addons?: string[]; accent?: SlotStyle; gem?: SlotStyle; line?: number; extra?: Record<string, SlotStyle>; fx?: { flash?: number; tracer?: number; aura?: number };
};
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
  nezumi: {     // AWM：銃床と先台は灰色のざらざらの樹脂、金属とスコープは墨（黒と灰色）
    name: '鼠',
    slide: { c: P.sumi[1], metal: true }, barrel: { c: P.sumi[1], metal: true }, frame: { c: P.sumi[1] },
    grip: { c: P.nezumi[0], tex: 'stipple' }, detail: { c: P.sumi[0] }, mag: { c: P.sumi[1], metal: true },
  },
  hagane: {     // カランビット
    name: '鋼',
    slide: { c: P.nezumi[2], metal: true }, barrel: { c: P.nezumi[2], metal: true }, frame: { c: P.nezumi[2], metal: true },
    grip: { c: P.sumi[1] }, detail: { c: P.sumi[1] },
  },
  tamahagane: { // 刀：slide 刃の背〜鎬 / barrel 鎬〜刃先（刃文のあたり、白く明るい）/ frame 鍔 / grip 柄糸 / detail 鮫皮 / accent 柄頭・縁・はばき
    name: '玉鋼',
    slide: { c: P.nezumi[2], metal: true, sheen: P.mizu[2] }, barrel: { c: P.shiro[1], metal: true, sheen: P.shiro[2] }, frame: { c: P.sumi[1], metal: true },
    grip: { c: P.sumi[0] }, detail: { c: P.shiro[0] }, accent: { c: P.kin[1], metal: true },
  },
  shinobi: {    // 忍の手裏剣・苦無：slide 黒い地鉄 / barrel 研いだ刃先（明るい鋼）/ frame 座金・苦無の輪 / grip 苦無の柄巻き / detail 房 / accent 朱の輪
    name: '黒鉄',
    slide: { c: P.sumi[1], metal: true, sheen: P.nezumi[2] }, barrel: { c: P.shiro[1], metal: true, sheen: P.shiro[2] }, frame: { c: P.sumi[2], metal: true },
    grip: { c: P.sumi[0] }, detail: { c: P.shu[1] }, accent: { c: P.shu[1] },
  },

};
export const DEFAULT_SKIN = 'kurogane';

// ===== 保管庫：前に作ったスキン（ガチャの仕組みに作り直す前のもの。見本・ゲームには出さない。形の参考に残す） =====
export const ARCHIVE: Record<string, Skin> = {
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
    // 飾り（燃える紅い蓮）：銃口の蓮・銃身の光る線・スライドの蓮の紋と棘・グリップの火の玉・用心鉄の結晶・黒い鎖
    name: '紅蓮', gun: 'pistol', rarity: 'LR', addons: ['gr_lotus', 'gr_lines', 'gr_crest', 'gr_thorns', 'gr_core', 'gr_shards', 'gr_chain'],
    line: 0xff1a2e, accent: { c: 0xb0101c, gloss: true, sheen: 0xff6070 }, fx: { flash: 0xff2a30, tracer: 0xff2030, aura: 0xff4a20 },
    slide: { c: 0x8a0010, metal: true, sheen: 0xff3040, fade: [0x0a0a0c, 0x3a0008, 0xd0101e] }, barrel: { c: 0xb0101c, metal: true, sheen: 0xff6070 },
    frame: { c: 0x0b0b0d, metal: true, sheen: 0xff2030 }, grip: { c: 0x09090a, gloss: true, sheen: 0xff2030 }, detail: { c: 0xff1a2e, glow: true },
  },
  ougon: {     // 金ぴか：全部が磨いた金。照り返しは白に近い光、小物は淡い金に光る
    // 飾り（王者の金）：スライドの王冠・グリップの宝石・ダイヤの列・銃身の金の縁取り・月桂樹・銃口の宝石の輪・金の房
    name: '黄金', gun: 'pistol', rarity: 'LR', addons: ['og_crown', 'og_jewels', 'og_studs', 'og_trim', 'og_laurel', 'og_muzzle', 'og_tassel'],
    line: 0xfff4c8, gem: { c: 0xf4fbff, gloss: true, sheen: 0x9fe8ff }, accent: { c: 0xf2c230, metal: true, sheen: 0xffffff }, fx: { flash: 0xffe08a, tracer: 0xffd040, aura: 0xffe27a },
    slide: { c: 0xe0a91a, metal: true, sheen: 0xfff4c0 }, barrel: { c: 0xf2c230, metal: true, sheen: 0xffffff }, frame: { c: 0xc8900e, metal: true, sheen: 0xfff0a0 },
    grip: { c: 0xb07a08, gloss: true, sheen: 0xffe27a }, detail: { c: 0xfff0b0, glow: true },
  },
};

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
  ARCHIVE['guren_' + gun] = guren(gun, len, ff);
// カランビット：刃（frame）は紅い金属、そのほかは黒
ARCHIVE.guren_karambit = { ...guren('karambit', 190, false), frame: { c: GUREN.crimson, metal: true, sheen: 0xff6070 }, slide: { c: GUREN.black, metal: true, sheen: GUREN.sheen } };
// 和弓：黒漆の弓に、赤く光る籐巻き、紅い握り
ARCHIVE.guren_yumi = { ...guren('yumi', 270, false), frame: { c: GUREN.black, gloss: true, sheen: GUREN.sheen }, grip: { c: 0x8a0010, gloss: true, sheen: 0xff3040 } };

// ===== AK-47 =====
// 付け足しの全部（LR はこれ全部）
const AK_ALL = ['brake', 'line', 'charm', 'plate', 'rings', 'studs', 'gems', 'chain', 'tassel', 'bell'];
// N・R は色と質感だけ。SR は付け足しが1つ。LR は付け足し全部と演出（銃口の光・弾の線・眺めたときに舞う光）
Object.assign(ARCHIVE, {
  ak_kurojushi: {   // 黒い樹脂の銃床と握り、灰色の金属
    name: '黒樹脂', gun: 'ak', rarity: 'N',
    slide: { c: P.nezumi[0], metal: true }, barrel: { c: P.sumi[1], metal: true }, frame: { c: P.nezumi[0], metal: true },
    grip: { c: P.sumi[1], tex: 'stipple' }, detail: { c: P.sumi[0] }, mag: { c: P.sumi[1] },
  },
  ak_shirakaba: {   // 明るい白樺の木に、黒い金属
    name: '白樺', gun: 'ak', rarity: 'N',
    slide: { c: P.sumi[1], metal: true }, barrel: { c: P.sumi[1], metal: true }, frame: { c: P.sumi[1], metal: true },
    grip: { c: P.kiji[2], tex: 'wood' }, detail: { c: P.sumi[0] }, mag: { c: P.sumi[2], metal: true },
  },
  ak_kurumi: {   // 濃い胡桃の木に、青く焼いた鋼
    name: '胡桃', gun: 'ak', rarity: 'R',
    slide: { c: P.ao[0], metal: true, sheen: P.mizu[2] }, barrel: { c: P.ao[0], metal: true, sheen: P.mizu[2] }, frame: { c: P.ao[0], metal: true, sheen: P.mizu[2] },
    grip: { c: P.kiji[0], tex: 'wood' }, detail: { c: P.kin[1], metal: true }, mag: { c: P.ao[0], metal: true, sheen: P.mizu[2] },
  },
  ak_fuji: {   // 藤色の漆の銃床と握りに、銀の金属
    name: '藤', gun: 'ak', rarity: 'R',
    slide: { c: P.nezumi[2], metal: true, sheen: P.fuji[2] }, barrel: { c: P.nezumi[2], metal: true }, frame: { c: P.nezumi[2], metal: true, sheen: P.fuji[2] },
    grip: { c: P.fuji[1], gloss: true, sheen: P.fuji[2] }, detail: { c: P.fuji[0] }, mag: { c: P.fuji[0], gloss: true },
  },
  ak_raikou: {   // 雷光：黒い金属に黄色い稲妻の照り返し。機関部の脇に光る線
    name: '雷光', gun: 'ak', rarity: 'SR', addons: ['line', 'rings'], line: 0xffe23a, accent: { c: 0xffe23a, metal: true, sheen: 0xffffff },
    slide: { c: 0x121418, metal: true, sheen: 0xffe23a }, barrel: { c: 0x121418, metal: true, sheen: 0xfff2a0 }, frame: { c: 0x121418, metal: true, sheen: 0xffe23a },
    grip: { c: 0x1a2340, gloss: true, sheen: 0x8fb4ff }, detail: { c: 0xffe23a, glow: true }, mag: { c: 0x121418, metal: true, sheen: 0xffe23a },
  },
  ak_hyoujin: {   // 氷刃：凍ったような白銀と水色の照り返し。銃口に銀のマズルブレーキ
    name: '氷刃', gun: 'ak', rarity: 'SR', addons: ['brake', 'gems'], gem: { c: 0xbff4ff, gloss: true, sheen: 0xffffff },
    slide: { c: 0xd8e8f2, metal: true, sheen: 0x7fe3ff }, barrel: { c: 0xb8cedc, metal: true, sheen: 0xe8fbff }, frame: { c: 0xc6dbe8, metal: true, sheen: 0x7fe3ff },
    grip: { c: 0xf2f7fb, gloss: true, sheen: 0x9fe8ff }, detail: { c: 0x5ac8f0, metal: true, sheen: 0xffffff }, mag: { c: 0xb8cedc, metal: true, sheen: 0x7fe3ff },
  },
  // 紅蓮（燃える紅い蓮）：銃口を囲む蓮の花びら・ハンドガードの光る線と蓮の紋・ストックの紅い棘と結晶・機関部の火の玉・黒い鎖
  //   赤い銃口の光と弾の線、眺めると火の粉が舞う
  guren_ak: { ...guren('ak', 884, true), addons: ['line', 'gr_lotus', 'gr_hg', 'gr_thorns', 'gr_shards', 'gr_core', 'gr_chain'], line: GUREN.glow, gem: { c: 0xffa028, glow: true },
    accent: { c: GUREN.crimson, gloss: true, sheen: 0xff6070 }, fx: { flash: 0xff2a30, tracer: 0xff2030, aura: 0xff4a20 } },
  // 黄金（全部盛り）：全部が磨いた金、黒檀の銃床と握り。金の根付と飾り板、白金の線。金の銃口の光と弾の線、眺めると金の粉が舞う
  ak_ougon: {
    name: '黄金', gun: 'ak', rarity: 'LR', addons: AK_ALL, line: 0xfff4c8, gem: { c: 0xf4fbff, gloss: true, sheen: 0x9fe8ff },
    slide: { c: 0xe0a91a, metal: true, sheen: 0xfff4c0 }, barrel: { c: 0xf2c230, metal: true, sheen: 0xffffff }, frame: { c: 0xd49a12, metal: true, sheen: 0xfff0a0 },
    grip: { c: 0x1c120c, gloss: true, sheen: 0xffd660 }, detail: { c: 0xfff0b0, glow: true }, mag: { c: 0xc8900e, metal: true, sheen: 0xfff0a0 },
    accent: { c: 0xf2c230, metal: true, sheen: 0xffffff }, fx: { flash: 0xffe08a, tracer: 0xffd040, aura: 0xffe27a },
  },
});

// ===== マークスマン Mk2 =====
Object.assign(ARCHIVE, {
  mk2_kariudo: {   // 狩人：オリーブに塗った銃床、黒い金属
    name: '狩人', gun: 'mk2', rarity: 'N',
    slide: { c: P.sumi[1], metal: true }, barrel: { c: P.sumi[1], metal: true }, frame: { c: P.sumi[1], metal: true },
    grip: { c: P.moegi[0] }, detail: { c: P.sumi[0] },
  },
  mk2_haigashi: {   // 灰樫：灰色がかった木、灰色の金属
    name: '灰樫', gun: 'mk2', rarity: 'N',
    slide: { c: P.sumi[2], metal: true }, barrel: { c: P.nezumi[0], metal: true }, frame: { c: P.nezumi[0], metal: true },
    grip: { c: P.nezumi[2], tex: 'wood' }, detail: { c: P.sumi[1] },
  },
  mk2_shinchuu: {   // 真鍮：真鍮の機関部に青く焼いた銃身、胡桃の木（昔のレバーアクションの定番）
    name: '真鍮', gun: 'mk2', rarity: 'R',
    slide: { c: P.sumi[1], metal: true }, barrel: { c: P.ao[0], metal: true, sheen: P.mizu[2] }, frame: { c: P.kin[1], metal: true, sheen: P.kin[2] },
    grip: { c: P.kiji[0], tex: 'wood' }, detail: { c: P.kin[2], metal: true },
  },
  mk2_wakatake: {   // 若竹：緑の漆の銃床に、若葉色の照り返しの銀
    name: '若竹', gun: 'mk2', rarity: 'R',
    slide: { c: P.nezumi[2], metal: true, sheen: P.moegi[2] }, barrel: { c: P.nezumi[2], metal: true, sheen: P.moegi[2] }, frame: { c: P.nezumi[2], metal: true, sheen: P.moegi[2] },
    grip: { c: P.midori[0], gloss: true, sheen: P.moegi[2] }, detail: { c: P.midori[1] },
  },
  mk2_souten: {   // 蒼天：空色に焼いた金属と白い艶の銃床。スコープの白い輪と、青く光るレンズ
    name: '蒼天', gun: 'mk2', rarity: 'SR', addons: ['scopeRings', 'lens'], line: 0x6fd0ff, accent: { c: 0xf2f7fb, gloss: true, sheen: 0xbfe8ff },
    slide: { c: 0x2d7fe0, metal: true, sheen: 0xbfe8ff }, barrel: { c: 0x2d7fe0, metal: true, sheen: 0xe0f6ff }, frame: { c: 0x2468c0, metal: true, sheen: 0xbfe8ff },
    grip: { c: 0xf2f7fb, gloss: true, sheen: 0x9fd8ff }, detail: { c: 0x1a3a70, metal: true },
  },
  mk2_kohaku: {   // 琥珀：透けるような琥珀色の艶の銃床と、琥珀の照り返しの黒い金属。銃身の金の輪と、ストックの琥珀の粒
    name: '琥珀', gun: 'mk2', rarity: 'SR', addons: ['bands', 'studs'], accent: { c: 0xe0a91a, metal: true, sheen: 0xfff0b0 }, gem: { c: 0xffa630, gloss: true, sheen: 0xffe0a0 },
    slide: { c: 0x16110c, metal: true, sheen: 0xffb040 }, barrel: { c: 0x16110c, metal: true, sheen: 0xffc060 }, frame: { c: 0x1c140c, metal: true, sheen: 0xffb040 },
    grip: { c: 0xd97a10, gloss: true, sheen: 0xffd070 }, detail: { c: 0xe0a91a, metal: true },
  },
  // 紅蓮（燃える紅い蓮）：銃口の蓮・先台の光る線と蓮の紋・ストックの棘と結晶・機関部の火の玉・黒い鎖・紅く光るレンズ
  guren_mk2: { ...guren('mk2', 1033, true), addons: ['gr_lotus', 'gr_lines', 'gr_thorns', 'gr_shards', 'gr_core', 'gr_chain', 'lens'], line: GUREN.glow,
    accent: { c: GUREN.crimson, gloss: true, sheen: 0xff6070 }, fx: { flash: 0xff2a30, tracer: 0xff2030, aura: 0xff4a20 } },
  // 月下（月夜の狩人）：藍の金属と銀の銃身、夜空色の銃床。三日月・星・月の兎・羽根・スコープの月の円盤・光るレンズ
  //   青白い銃口の光と弾の線、眺めると星の粉が舞う
  mk2_gekka: {
    name: '月下', gun: 'mk2', rarity: 'LR', addons: ['tk_moon', 'tk_stars', 'tk_rabbit', 'tk_feather', 'tk_disc', 'tk_lens'],
    line: 0xdfeaff, accent: { c: 0xf4f6ff, gloss: true, sheen: 0xbcd4ff }, gem: { c: 0xbfe0ff, gloss: true, sheen: 0xffffff },
    slide: { c: 0x1b2350, metal: true, sheen: 0xbcd4ff }, barrel: { c: 0xd9e2ee, metal: true, sheen: 0xffffff }, frame: { c: 0x1b2350, metal: true, sheen: 0xbcd4ff },
    grip: { c: 0x121833, gloss: true, sheen: 0x9fb8ff }, detail: { c: 0xcfe2ff, glow: true },
    fx: { flash: 0xbfe0ff, tracer: 0x9fd0ff, aura: 0xdfeaff },
  },
});

// ===== M870 =====
Object.assign(ARCHIVE, {
  m870_tetsu: {   // 鉄：黒い樹脂の銃床と先台、黒い金属
    name: '鉄', gun: 'm870', rarity: 'N',
    slide: { c: P.sumi[1], metal: true }, barrel: { c: P.sumi[1], metal: true }, frame: { c: P.sumi[1], metal: true },
    grip: { c: P.sumi[0], tex: 'stipple' }, detail: { c: P.sumi[2] },
  },
  m870_suna: {   // 砂：砂色の銃床と先台、黒い金属
    name: '砂', gun: 'm870', rarity: 'N',
    slide: { c: P.sumi[1], metal: true }, barrel: { c: P.sumi[1], metal: true }, frame: { c: P.sumi[2], metal: true },
    grip: { c: P.kiji[2] }, detail: { c: P.sumi[1] },
  },
  m870_momiji: {   // 紅葉：赤みの強い楓の木と、青く焼いた鋼
    name: '紅葉', gun: 'm870', rarity: 'R',
    slide: { c: P.ao[0], metal: true, sheen: P.mizu[2] }, barrel: { c: P.ao[0], metal: true, sheen: P.mizu[2] }, frame: { c: P.ao[0], metal: true, sheen: P.mizu[2] },
    grip: { c: P.shu[0], tex: 'wood' }, detail: { c: P.kin[1], metal: true },
  },
  m870_tetsusabi: {   // 鉄錆：錆びた赤茶の金属と、焦げ茶の木
    name: '鉄錆', gun: 'm870', rarity: 'R',
    slide: { c: P.daidai[0], metal: true, sheen: P.daidai[2] }, barrel: { c: P.daidai[0], metal: true, sheen: P.daidai[2] }, frame: { c: P.daidai[0], metal: true, sheen: P.daidai[1] },
    grip: { c: P.kiji[0], tex: 'wood' }, detail: { c: P.sumi[1] },
  },
  m870_tekkon: {   // 鉄紺：紺の金属に青緑の照り返し、黒い銃床。機関部に青緑の予備弾と、銃身の銀の輪
    name: '鉄紺', gun: 'm870', rarity: 'SR', addons: ['shells', 'bands'], gem: { c: 0x1fb8a8, gloss: true, sheen: 0xa8fff0 }, accent: { c: 0xc6d2dc, metal: true, sheen: 0xffffff },
    slide: { c: 0x17213d, metal: true, sheen: 0x5cffe0 }, barrel: { c: 0x17213d, metal: true, sheen: 0x8ff0ff }, frame: { c: 0x1a2748, metal: true, sheen: 0x5cffe0 },
    grip: { c: 0x0e1118, gloss: true, sheen: 0x5cffe0 }, detail: { c: 0x1fb8a8, metal: true },
  },
  m870_suigyoku: {   // 翠玉：エメラルドの艶の銃床と先台、金の金属。ストックの緑の宝石と、銃身の金の輪
    name: '翠玉', gun: 'm870', rarity: 'SR', addons: ['studs', 'bands'], gem: { c: 0x10c070, gloss: true, sheen: 0xb0ffd8 }, accent: { c: 0xe0a91a, metal: true, sheen: 0xfff0b0 },
    slide: { c: 0xc8900e, metal: true, sheen: 0xfff0a0 }, barrel: { c: 0xd49a12, metal: true, sheen: 0xfff4c0 }, frame: { c: 0xc8900e, metal: true, sheen: 0xfff0a0 },
    grip: { c: 0x0a7a48, gloss: true, sheen: 0x80ffc0 }, detail: { c: 0xe0a91a, metal: true },
  },
  // 紅蓮（燃える紅い蓮）
  guren_m870: { ...guren('m870', 973, true), addons: ['gr_lotus', 'gr_lines', 'gr_thorns', 'gr_shards', 'gr_core', 'gr_chain'], line: GUREN.glow,
    accent: { c: GUREN.crimson, gloss: true, sheen: 0xff6070 }, fx: { flash: 0xff2a30, tracer: 0xff2030, aura: 0xff4a20 } },
  // 雷神：嵐の藍の金属に金の照り返し、黒漆の銃床。雷太鼓の輪と三つ巴・稲妻・しめ縄と紙垂
  //   黄色い稲光の銃口の光と弾の線、眺めると火花が舞う
  m870_raijin: {
    name: '雷神', gun: 'm870', rarity: 'LR', addons: ['rj_drums', 'rj_bolts', 'rj_rope'],
    line: 0xfff27a, accent: { c: 0xe0a91a, metal: true, sheen: 0xfff0b0 },
    extra: { drum: { c: 0xb8202a, gloss: true, sheen: 0xffb070 }, straw: { c: 0xd8c48a }, paper: { c: 0xf6f4ee, gloss: true } },
    slide: { c: 0x1a1f3d, metal: true, sheen: 0xfff27a }, barrel: { c: 0x1a1f3d, metal: true, sheen: 0xd8e4ff }, frame: { c: 0x1d2446, metal: true, sheen: 0xfff27a },
    grip: { c: 0x0c0c10, gloss: true, sheen: 0xfff27a }, detail: { c: 0xfff27a, glow: true },
    fx: { flash: 0xfff6a0, tracer: 0xfff27a, aura: 0xfff27a },
  },
});

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
// 後ろから前への色の移り変わり（図面の mm で、from から from + len まで1回だけ）
function fadeMap(cols: number[], len = 270, from = 0, axis?: 'v') {
  const V = axis === 'v';
  const t = canvas(V ? 4 : 256, V ? 256 : 4, g => {
    const gr = V ? g.createLinearGradient(0, 256, 0, 0) : g.createLinearGradient(0, 0, 256, 0);   // 縦は下（テクスチャの 0）から上へ
    cols.forEach((c, i) => gr.addColorStop(i / (cols.length - 1), css(c)));
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.repeat.set(1 / len, 1 / len); t.offset.set(V ? 0 : -from / len, V ? -from / len : 0);
  return t;
}

export function slotMaterial(style: SlotStyle): THREE.Material {
  if (style.glow) return new THREE.MeshBasicMaterial({ color: style.c });
  if (style.metal || style.gloss) {
    const gloss = !!style.gloss && !style.metal;
    // 色の移り変わり：白いつやに、色の帯を重ねる
    // 木目などの表面に艶を重ねる（木地に薄く漆をかけた感じ）
    if (style.tex) { const m = surface(style); m.wrapS = m.wrapT = THREE.RepeatWrapping; m.repeat.set(1 / 24, 1 / 24); return new THREE.MeshMatcapMaterial({ matcap: matcap(P.shiro[2], style.sheen, gloss), map: m, flatShading: true }); }
    if (style.fade) return new THREE.MeshMatcapMaterial({ matcap: matcap(P.shiro[2], style.sheen, gloss), map: fadeMap(style.fade, style.fadeLen, style.fadeFrom, style.fadeAxis), flatShading: true });
    return new THREE.MeshMatcapMaterial({ matcap: matcap(style.c, style.sheen, gloss), flatShading: true });
  }
  const o: any = { color: new THREE.Color(style.c) };
  if (style.fade) { o.map = fadeMap(style.fade, style.fadeLen, style.fadeFrom, style.fadeAxis); o.color = new THREE.Color(0xffffff); }   // つや消しの色の流れ（墨染の紙）
  if (style.tex) {
    const t = surface(style); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / 24, 1 / 24);   // 図面の mm で 24mm ごとに繰り返す
    o.map = t; o.color = new THREE.Color(0xffffff);
  }
  return toon(o);
}

// 塗りの場所ごとの材質を作る
// 同じスキンは一度作った材質を使い回す（対局のたびに作り直すと、材質とテクスチャが増え続けて重くなるため）
//   材質は同じスキンの銃どうし（一人称・駒が持つ銃・持ち物画面）で共有する
const matCache = new Map<string, Record<string, THREE.Material>>();
export function skinMaterials(id: string) {
  const hit = matCache.get(id);
  if (hit) return hit;
  const m = makeSkinMaterials(id);
  if (!id.startsWith('__')) matCache.set(id, m);   // 見本ページの試し塗り（__gacha）は毎回作る
  return m;
}
function makeSkinMaterials(id: string) {
  const s = SKINS[id] || SKINS[DEFAULT_SKIN];
  const m: Record<string, THREE.Material> = {};
  for (const k of ['slide', 'barrel', 'frame', 'grip', 'detail'] as const) m[k] = slotMaterial(s[k]);
  m.mag = slotMaterial(s.mag || { c: P.sumi[2] });
  m.slideDark = toon({ color: new THREE.Color(shade(s.slide.c, 0.45)) });
  m.bore = new THREE.MeshBasicMaterial({ color: P.sumi[0] });
  m.accent = slotMaterial(s.accent || s.detail);
  m.gem = slotMaterial(s.gem || { c: P.shiro[2], gloss: true, sheen: P.mizu[2] });
  for (const [k, st] of Object.entries(s.extra || {})) m[k] = slotMaterial(st);
  m.line = new THREE.MeshBasicMaterial({ color: s.line ?? s.detail.c });
  return m;
}

// ================= ガチャのスキン（デザイン） =================
// スキン＝形（飾り）＋部位ごとの質感＋「どの部位がどのカラーを使うか」。色そのものはガチャで決まる
//   カラーは基本2つ（c1 がメイン、c2 が差し色）、たまに3つ（c3）。カラーを使わない部位は黒・白・銀などの固定色にしてよい
//   照り返し（sheen）だけをカラーにするのもあり
//   colors は公式配色（ガチャを引く前・見本で見せる色）。白黒灰だけで表す（色は見本ページで自分で入れて試す）。レア度ごとに各武器1つずつ（AK の LR は鬼・金継ぎの2つ。ガチャは同じ武器・レア度の中から等しく選ぶ）
// 部位の書き方（DPart）：
//   v: 1・2・3 … そのカラーを使う / c … 固定色（v が無いとき）
//   metal・gloss・glow・tex … 質感（今までと同じ）
//   sheen: 'self'（自分の色を明るくした照り返し）/ 'c1'・'c2'（そのカラーを明るくした照り返し）/ 数字（固定）
//   fade: 後ろから前への色の流れ。'c1'・'c2'・数字を並べる
type CRef = 'c1' | 'c2' | 'c3' | number;
export type DPart = Omit<SlotStyle, 'c' | 'sheen' | 'fade'> & { v?: 1 | 2 | 3; c?: number; sheen?: 'self' | CRef; fade?: CRef[] };
export type Design = { name: string; gun: string; rarity: 'N' | 'R' | 'SR' | 'LR'; colors: number[]; parts: Record<string, DPart>; addons?: string[]; fx?: CRef; aura?: boolean };
const BLACK = 0x131313, INK = 0x0b0b0b, STEEL = 0xc8c8c8, PAPER = 0xf2f2f0;   // 固定色も白黒灰だけ
const light = (c: number) => mix(c, 0xffffff, 0.6);

export const DESIGNS: Record<string, Design> = {
  // N 焼き入れ：スライドと銃身は焼き入れした鋼。色は c1、光の当たる所と縁の照り返しだけ c2（見る角度で色が変わる）
  //   フレームはつや消しの黒、握りは黒い滑り止め、小物は黒で固定
  dg_n: {
    name: '焼き入れ', gun: 'pistol', rarity: 'N', colors: [0x4a4a4a, 0xe0e0e0],
    parts: {
      slide: { v: 1, metal: true, sheen: 'c2' }, barrel: { v: 1, metal: true, sheen: 'c2' },
      frame: { c: BLACK }, grip: { c: BLACK, tex: 'stipple' }, detail: { c: INK }, mag: { c: BLACK, metal: true, sheen: 'c2' },
    },
  },
  // R 漆と木：グリップの銀のメダル・底の吊り輪から下がる紐と木の玉・照準の白い点
  //   c1 スライドとフレームの漆（メイン）、c2 木の握りと玉。銃身とメダルは銀、紐と小物は黒、照準の点は白で固定
  dg_r: {
    name: '漆と木', gun: 'pistol', rarity: 'R', colors: [0xd8d8d8, 0x6a6a6a], addons: ['medal', 'lanyard', 'sightDots'],
    parts: {
      slide: { v: 1, gloss: true }, frame: { v: 1, gloss: true }, grip: { v: 2, tex: 'wood' }, bead: { v: 2, gloss: true, sheen: 'self' },
      barrel: { c: STEEL, metal: true }, medal: { c: STEEL, metal: true, sheen: 0xffffff }, cord: { c: INK }, dots: { c: 0xf4f4f4, glow: true },
      detail: { c: INK }, mag: { c: BLACK, metal: true },
    },
  },
  // SR 照準：レールに埋めた薄いドットサイト・銃口の補正器・フレームの下のレーザー照準器・弾倉の底の大きな継ぎ足し
  //   c1 本体の金属すべて（メイン。補正器・継ぎ足し・レーザーの留め具も）、c2 光る所（ドットのレンズ・レーザーの窓・継ぎ足しの線・照準・引き金）
  //   握りとサイト・レーザーの箱は黒で固定
  dg_sr: {
    name: '照準', gun: 'pistol', rarity: 'SR', colors: [0x505050, 0xffffff], addons: ['dot', 'comp', 'laser', 'extMag'],
    parts: {
      slide: { v: 1, metal: true }, frame: { v: 1, metal: true, sheen: 'self' }, barrel: { v: 1, metal: true }, comp: { v: 1, metal: true },
      grip: { c: BLACK, tex: 'stipple' }, detail: { v: 2, glow: true }, line: { v: 2, glow: true },
      dotBody: { c: INK, metal: true }, mag: { c: BLACK, metal: true },
    },
  },
  // LR 紅蓮（燃える紅い蓮）：銃口の蓮・銃身の光る線・スライドの蓮の紋と棘・グリップの火の玉・用心鉄の結晶・黒い鎖
  //   c1 本体（メイン。スライドは後ろの c1 から銃口の c2 へ流れる）、c2 光る所と紅い金属（蓮・棘・結晶・銃身・銃口の光）
  //   握りと鎖は黒で固定
  dg_lr: {
    name: '紅蓮', gun: 'pistol', rarity: 'LR', colors: [0x1c1c1c, 0xe6e6e6], fx: 'c2', aura: true,
    addons: ['gr_lotus', 'gr_lines', 'gr_crest', 'gr_thorns', 'gr_core', 'gr_shards', 'gr_chain'],
    parts: {
      slide: { v: 1, metal: true, sheen: 'c2', fade: ['c1', 'c1', 'c2'] }, frame: { v: 1, metal: true, sheen: 'c2' }, mag: { v: 1, metal: true, sheen: 'c2' },
      barrel: { v: 2, metal: true, sheen: 'self' }, accent: { v: 2, gloss: true, sheen: 'self' },
      detail: { v: 2, glow: true }, line: { v: 2, glow: true },
      grip: { c: 0x09090a, gloss: true, sheen: 'c2' }, chain: { c: INK, metal: true },
    },
  },
  // LR（2つ目）花札：スライドの両脇の「坊主」の月と山・銃身の横の短冊と幕と日・底の輪から扇に広がる5枚の札・まわりに浮く4枚の札
  //   生き物の札は使わない（月・幕・短冊・日だけ）。c1 スライドと銃身の艶（坊主の空の色。メイン）と札の空・幕の紋・短冊、c2 月・日・花・幕の裾・銃口の光
  //   札の地は生成り、縁と山は黒、フレームと握りは黒い艶で固定
  dg_lr2: {
    name: '花札', gun: 'pistol', rarity: 'LR', colors: [0x5a5a5a, 0xe0e0e0], fx: 'c2', aura: true, addons: ['hf_bozu', 'hf_tanzaku', 'hf_maku', 'hf_sun', 'hf_cards'],
    parts: {
      slide: { v: 1, gloss: true, sheen: 'self' }, barrel: { v: 1, gloss: true, sheen: 'self' },
      art1: { v: 1, gloss: true }, art2: { v: 2, gloss: true, sheen: 'self' },
      face: { c: 0xefece4 }, hill: { c: INK },
      frame: { c: INK, gloss: true }, grip: { c: INK, gloss: true }, detail: { c: INK }, mag: { c: BLACK, metal: true },
    },
  },

  // N 油焼け：木部は c1 の木目（メイン）。金属は暗い鋼で、照り返しだけ c2（油の膜のような色の照り返し）。弾倉も同じ
  ak_n: {
    name: '油焼け', gun: 'ak', rarity: 'N', colors: [0x8a8a8a, 0xd0d0d0],
    parts: {
      grip: { v: 1, tex: 'wood' },
      slide: { c: 0x2a2a2a, metal: true, sheen: 'c2' }, frame: { c: 0x2a2a2a, metal: true, sheen: 'c2' }, barrel: { c: 0x2a2a2a, metal: true, sheen: 'c2' },
      mag: { c: BLACK, metal: true, sheen: 'c2' }, detail: { c: INK },
    },
  },
  // R 銃剣：銃身の下の柄と鍔・銃口の輪・銃口より前へ伸びる刃（背にのこぎり）
  //   c1 木部の漆（メイン）、c2 銃剣の柄。金属は黒、刃と鍔は銀で固定
  ak_r: {
    name: '銃剣', gun: 'ak', rarity: 'R', colors: [0x9a9a9a, 0x3a3a3a], addons: ['bayonet'],
    parts: {
      grip: { v: 1, gloss: true, sheen: 'self' }, handle: { v: 2, gloss: true, sheen: 'self' },
      blade: { c: 0xd6d6d6, metal: true, sheen: 0xffffff }, bladeMetal: { c: 0x8a8a8a, metal: true, sheen: 0xffffff },
      slide: { c: BLACK, metal: true }, frame: { c: BLACK, metal: true }, barrel: { c: BLACK, metal: true }, mag: { c: BLACK, metal: true }, detail: { c: INK },
    },
  },
  // SR 柄巻：ハンドガードの両脇を刀の柄のように組紐でひし形に巻く（すき間から下地が見える）・前後の巻き留め・前の花結びと垂れる房
  //   c1 ハンドガードとストックの漆（メイン。ひし形のすき間の色）、c2 組紐と房。金属は黒で、照り返しは c2
  ak_sr: {
    name: '柄巻', gun: 'ak', rarity: 'SR', colors: [0xe0e0e0, 0x2a2a2a], addons: ['wrap', 'knot'],
    parts: {
      grip: { v: 1, gloss: true, sheen: 'self' }, cord: { v: 2 },
      slide: { c: BLACK, metal: true, sheen: 'c2' }, frame: { c: BLACK, metal: true, sheen: 'c2' }, barrel: { c: BLACK, metal: true, sheen: 'c2' }, mag: { c: BLACK, metal: true, sheen: 'c2' }, detail: { c: INK },
    },
  },
  // LR 鬼：照門から反る2本の角・ハンドガードの下の牙・ストックの金棒の鋲・銃身の鉄の輪・下がる鬼の面（光る目）
  //   c1 木部の漆（メイン）、c2 鋲・輪・面・光る目・銃口の光。金属は黒、角と牙は白で固定
  ak_lr: {
    name: '鬼', gun: 'ak', rarity: 'LR', colors: [0x2a2a2a, 0xd0d0d0], fx: 'c2', aura: true, addons: ['oni_horns', 'oni_fangs', 'oni_studs', 'oni_mask', 'rings'],
    parts: {
      grip: { v: 1, gloss: true, sheen: 'self' },
      accent: { v: 2, metal: true, sheen: 'self' }, stud: { v: 2, metal: true, sheen: 'self' }, mask: { v: 2, gloss: true, sheen: 'self' }, line: { v: 2, glow: true },
      horn: { c: 0xeeeeee, gloss: true },
      slide: { c: BLACK, metal: true }, frame: { c: BLACK, metal: true }, barrel: { c: BLACK, metal: true }, mag: { c: BLACK, metal: true }, detail: { c: INK },
    },
  },
  // LR（2つ目）金継ぎ：割れた銃を金で継いだ姿。ストック・グリップ・ハンドガード・弾倉を走る光る継ぎ目（左右で割れ方が違う）・継ぎ目をまたぐ鎹
  //   ストックのかかとと弾倉の底の欠けを埋めた金・割れて浮く木の破片（割れ口が光る）と銃口の金の粉
  //   c1 木部（初期の「木目」と同じ木目に薄い艶。メイン）、c2 金（継ぎ目は光り、当てと鎹は磨いた金属。照り返しも）
  //   金属と弾倉は初期と同じ墨の鋼、小物は黒で固定（初期スキンから離れすぎないように）
  ak_lr2: {
    name: '金継ぎ', gun: 'ak', rarity: 'LR', colors: [0x8a8a8a, 0xf0f0f0], fx: 'c2', aura: true, addons: ['kn_seams', 'kn_staples', 'kn_patches', 'kn_shards'],
    parts: {
      grip: { v: 1, tex: 'wood', gloss: true, sheen: 'self' }, shard: { v: 1, tex: 'wood' },
      line: { v: 2, glow: true }, accent: { v: 2, metal: true, sheen: 'self' },
      slide: { c: P.sumi[1], metal: true, sheen: 'c2' }, frame: { c: P.sumi[1], metal: true, sheen: 'c2' }, barrel: { c: P.sumi[1], metal: true, sheen: 'c2' },
      mag: { c: P.sumi[1], metal: true, sheen: 'c2' }, detail: { c: P.sumi[0] },
    },
  },

  // N スコープ：ストックと先台はつや消しの c1（メイン）、スコープは艶の c2。機関部と銃身は黒い鋼で、照り返しが c2
  mk_n: {
    name: 'スコープ', gun: 'mk2', rarity: 'N', colors: [0x8a8a8a, 0x4a4a4a],
    parts: {
      grip: { v: 1 }, slide: { v: 2, gloss: true, sheen: 'self' },
      frame: { c: BLACK, metal: true, sheen: 'c2' }, barrel: { c: BLACK, metal: true, sheen: 'c2' }, detail: { c: INK },
    },
  },
  // R 西部：機関部の左の鞍の輪と結んだ革紐・ストックに打った真鍮の鋲（ひし形と縁の列）・レバーの輪に巻いた革（真鍮の留め輪つき）
  //   3色：c1 ストックと先台の木（メイン）、c2 真鍮（鋲・鞍の輪・留め輪。機関部の照り返しも）、c3 革（紐・レバーの巻き）
  //   機関部は暗い鋼、銃身とスコープは黒で固定
  mk_r: {
    name: '西部', gun: 'mk2', rarity: 'R', colors: [0x8a8a8a, 0xd0d0d0, 0x4a4a4a], addons: ['saddleRing', 'tacks', 'leverWrap'],
    parts: {
      grip: { v: 1, tex: 'wood' }, brass: { v: 2, metal: true, sheen: 'self' }, leather: { v: 3 },
      frame: { c: 0x2a2a2a, metal: true, sheen: 'c2' }, barrel: { c: BLACK, metal: true }, slide: { c: BLACK, metal: true }, detail: { c: INK },
    },
  },
  // SR 狩猟：ストックから銃身バンドへ垂れる革の負い紐・ストックの革の弾差しと予備弾5発
  //   c1 ストックと先台の木（メイン）、c2 革（負い紐・弾差し）。金属は黒、予備弾と金具は銀で固定
  mk_sr: {
    name: '狩猟', gun: 'mk2', rarity: 'SR', colors: [0x9a9a9a, 0x5a5a5a], addons: ['sling', 'cuff'],
    parts: {
      grip: { v: 1, tex: 'wood' }, leather: { v: 2 }, round: { c: STEEL, metal: true },
      slide: { c: BLACK, metal: true }, frame: { c: BLACK, metal: true }, barrel: { c: BLACK, metal: true }, detail: { c: INK },
    },
  },
  // LR 月下（月夜の狩人）：ストックの三日月・散らばる星・銃身バンドから下がる月の兎・ストックの下の羽根・スコープの月の円盤・光るレンズ
  //   c1 機関部とスコープの金属（メイン。照り返しは c2）、c2 月と星とレンズの光・銃口の光。銃身は銀、ストックは黒、兎と羽根は白で固定
  mk_lr: {
    name: '月下', gun: 'mk2', rarity: 'LR', colors: [0x3a3a3a, 0xe8e8e8], fx: 'c2', aura: true,
    addons: ['tk_moon', 'tk_stars', 'tk_rabbit', 'tk_feather', 'tk_disc', 'tk_lens'],
    parts: {
      frame: { v: 1, metal: true, sheen: 'c2' }, slide: { v: 1, metal: true, sheen: 'c2' },
      gem: { v: 2, gloss: true, sheen: 'self' }, line: { v: 2, glow: true }, detail: { v: 2, glow: true },
      barrel: { c: STEEL, metal: true, sheen: 0xffffff }, grip: { c: INK, gloss: true, sheen: 'c2' }, accent: { c: 0xf4f4f4, gloss: true },
    },
  },
  // LR（2つ目）竹林：銃身とスコープにかぶせた竹の筒（節と節の下の白い粉）・ストックと先台を区切る竹の節の帯・笹の小枝3つ・先台から吊るした竹筒の水筒
  //   煤竹：木部と竹は後ろの c2 から銃口の c1 へ煤けていく色の流れ（艶）。節と笹は c1、白い粉は薄い灰、紐は灰、金属は黒で固定
  mk_lr2: {
    name: '竹林', gun: 'mk2', rarity: 'LR', colors: [0x4a4a4a, 0xbdbdbd], fx: 'c1', aura: true, addons: ['ck_culm', 'ck_scope', 'ck_bands', 'ck_leaves', 'ck_canteen'],
    parts: {
      grip: { v: 1, gloss: true, sheen: 'self', fade: ['c2', 'c1'], fadeLen: 1030 }, culm: { v: 1, gloss: true, sheen: 'self', fade: ['c2', 'c1'], fadeLen: 1030 },
      node: { v: 1, gloss: true, sheen: 'self' }, leaf: { v: 1, gloss: true, sheen: 'self' }, powder: { c: 0xa4a49c }, rope: { c: 0x6a6a6a },
      slide: { c: BLACK, metal: true }, frame: { c: BLACK, metal: true }, barrel: { c: BLACK, metal: true }, detail: { c: INK },
    },
  },


  // N エナメル：機関部は艶のあるエナメル塗装の c1（メイン）、ストックと先台はつや消しの c2。銃身と弾倉の筒は磨いた銀で固定
  m8_n: {
    name: 'エナメル', gun: 'm870', rarity: 'N', colors: [0xcfcfcf, 0x4a4a4a],
    parts: {
      frame: { v: 1, gloss: true, sheen: 'self' }, grip: { v: 2 },
      barrel: { c: STEEL, metal: true, sheen: 0xffffff }, detail: { c: INK },
    },
  },
  // R 警備：機関部の左の予備弾6発・弾倉の筒の下のライト
  //   c1 機関部の金属（メイン）、c2 予備弾。木部とライトは黒、予備弾の底は銀、レンズは白く光るで固定
  m8_r: {
    name: '警備', gun: 'm870', rarity: 'R', colors: [0x6a6a6a, 0xcfcfcf], addons: ['shells', 'light'],
    parts: {
      frame: { v: 1, metal: true, sheen: 'self' }, gem: { v: 2, gloss: true, sheen: 'self' },
      grip: { c: INK }, barrel: { c: BLACK, metal: true }, accent: { c: STEEL, metal: true },
      lightBody: { c: INK, metal: true }, lens: { c: 0xffffff, glow: true }, detail: { c: INK },
    },
  },
  // SR 祭：銃身バンドとストックの下から下がる提灯・ストックの両脇の扇
  //   c1 ストックと先台の漆（メイン）、c2 提灯の灯りと扇の紙。金属と提灯の枠と扇の骨は黒で固定
  m8_sr: {
    name: '祭', gun: 'm870', rarity: 'SR', colors: [0x3a3a3a, 0xf0f0f0], addons: ['lanterns', 'fan'],
    parts: {
      grip: { v: 1, gloss: true, sheen: 'self' }, lantern: { v: 2, glow: true }, fanPaper: { v: 2, gloss: true },
      fanRib: { c: INK, gloss: true }, frame: { c: BLACK, metal: true }, barrel: { c: BLACK, metal: true }, detail: { c: INK },
    },
  },
  // LR 重装：機関部・先台・ストックを覆う分厚い装甲板と六角ボルト、上の装甲、装甲の光る排気口、銃身の放熱のひれ、銃口の大きなブレーキ
  //   先台の装甲はポンプと一緒に動く。c1 装甲の塗装（メイン）、c2 排気口とブレーキの光・銃口の光
  //   下地の金属と木部は黒、ボルトは銀、ひれは暗い鋼で固定
  m8_lr: {
    name: '重装', gun: 'm870', rarity: 'LR', colors: [0x6a6a6a, 0xf0f0f0], fx: 'c2', aura: true, addons: ['hv_armor', 'hv_bolts', 'hv_vents', 'hv_fins', 'hv_brake'],
    parts: {
      armor: { v: 1, sheen: 'self' }, line: { v: 2, glow: true }, detail: { v: 2, glow: true },
      bolt: { c: STEEL, metal: true, sheen: 0xffffff }, fin: { c: 0x3a3a3a, metal: true, sheen: 'c2' },
      frame: { c: BLACK, metal: true }, barrel: { c: BLACK, metal: true }, grip: { c: INK },
    },
  },
  // LR（2つ目）種子島：銃身と弾倉をまとめる真鍮の帯・機関部の両脇の火皿の板・ストックの紋（架空）・ストックから銃口まで巻きつく火縄（先が光り、細い煙）・ストックの下の房
  //   3色：c1 木部（木目に薄い艶。メイン）、c2 真鍮（帯・火皿・紋）、c3 火縄の先の火・房・銃口の光。火縄は灰、煙は薄い灰、金属は黒で固定
  m8_lr2: {
    name: '種子島', gun: 'm870', rarity: 'LR', colors: [0x8a8a8a, 0xd0d0d0, 0xffffff], fx: 'c3', aura: true, addons: ['tg_bands', 'tg_plate', 'tg_crest', 'tg_cord', 'tg_tassel'],
    parts: {
      grip: { v: 1, tex: 'wood', gloss: true, sheen: 'self' }, accent: { v: 2, metal: true, sheen: 'self' },
      ember: { v: 3, glow: true }, tassel: { v: 3, gloss: true, sheen: 'self' }, rope: { c: 0x4a4a4a }, smoke: { c: 0xbdbdbd },
      slide: { c: BLACK, metal: true }, frame: { c: BLACK, metal: true }, barrel: { c: BLACK, metal: true }, detail: { c: INK }, mag: { c: BLACK, metal: true },
    },
  },

  // N 三色：3色の塗り分け。c1 機関部の焼き付け塗装（メイン）、c2 樹脂の握り、c3 弾倉の金属。銃身と小物は黒で固定
  mp_n: {
    name: '三色', gun: 'mp5', rarity: 'N', colors: [0x9a9a9a, 0x3a3a3a, 0x6a6a6a],
    parts: {
      frame: { v: 1 }, grip: { v: 2 }, mag: { v: 3, metal: true, sheen: 'self' },
      barrel: { c: BLACK, metal: true }, detail: { c: INK },
    },
  },
  // R テープ：前の握りと握りに巻いたテープ・後ろの吊り輪から下がる紐と玉
  //   c1 機関部の金属（メイン）、c2 テープと玉。樹脂と弾倉と紐は黒で固定
  mp_r: {
    name: 'テープ', gun: 'mp5', rarity: 'R', colors: [0x707070, 0xd0d0d0], addons: ['tape', 'lanyard'],
    parts: {
      frame: { v: 1, metal: true, sheen: 'self' }, tape: { v: 2 },
      grip: { c: INK }, mag: { c: BLACK, metal: true }, barrel: { c: BLACK, metal: true }, cord: { c: INK }, detail: { c: INK },
    },
  },
  // SR 電飾：機関部と下の両脇の光る線・銃身の覆いと光る逃がし穴・銃口の光る輪・前の握りの底の光
  //   c1 機関部と覆い（つや消し。メイン）、c2 光。樹脂と弾倉は黒で固定
  mp_sr: {
    name: '電飾', gun: 'mp5', rarity: 'SR', colors: [0x3a3a3a, 0xffffff], addons: ['led', 'shroud', 'glowGrip'],
    parts: {
      frame: { v: 1 }, barrel: { v: 1, metal: true }, line: { v: 2, glow: true }, detail: { v: 2, glow: true },
      grip: { c: INK }, mag: { c: BLACK, metal: true },
    },
  },
  // LR からくり：機関部の両脇の歯車・右の脇を通る管・上の圧力計・後ろのぜんまいの鍵・下の縁の鋲
  //   c1 機関部の金属（メイン）、c2 歯車・管・計器の縁・鍵（真鍮の役）と銃口の光。握りは黒、軸と鋲は銀、計器の文字盤は白で固定
  mp_lr: {
    name: 'からくり', gun: 'mp5', rarity: 'LR', colors: [0x4a4a4a, 0xbdbdbd], fx: 'c2', aura: true, addons: ['gears', 'pipes', 'gauge', 'key', 'rivets'],
    parts: {
      frame: { v: 1, metal: true, sheen: 'c2' }, mag: { v: 1, metal: true, sheen: 'c2' }, gear: { v: 2, metal: true, sheen: 'self' },
      bolt: { c: STEEL, metal: true, sheen: 0xffffff }, dial: { c: 0xf2f2f2, gloss: true },
      grip: { c: INK, gloss: true }, barrel: { c: BLACK, metal: true }, detail: { v: 2, metal: true, sheen: 'self' },
    },
  },

  // ===== ベレッタ 93R =====
  // N 煤：スライドは c2 の鋼で、銃口に近づくほど煤けて黒くなる（後ろから前への色の流れ）。フレームと握りはつや消しの c1（メイン）
  //   補正器と銃身は黒、小物は黒で固定
  b9_n: {
    name: '煤', gun: 'b93r', rarity: 'N', colors: [0x8a8a8a, 0xd0d0d0],
    parts: {
      grip: { v: 1 }, slide: { v: 2, metal: true, sheen: 'self', fade: ['c2', 'c2', 0x151515], fadeLen: 200 },
      frame: { c: BLACK, metal: true }, barrel: { c: BLACK, metal: true }, mag: { c: BLACK, metal: true }, detail: { c: INK },
    },
  },
  // R 銀細工：スライドの両脇の銀の渦巻き（向かい合う渦と葉）・握りの真珠貝を囲む銀の楕円の枠。撃鉄・引き金・照準も銀
  //   c1 スライドとフレームと補正器の艶（メイン）、c2 握りの真珠貝（照り返しも自分の色）。銀の飾りと小物は銀、銃身と弾倉は黒で固定
  b9_r: {
    name: '銀細工', gun: 'b93r', rarity: 'R', colors: [0x2a2a2a, 0xe8e8e8], addons: ['filigree', 'pearlFrame'],
    parts: {
      slide: { v: 1, gloss: true, sheen: 'self' }, frame: { v: 1, gloss: true, sheen: 'self' }, grip: { v: 2, gloss: true, sheen: 'self' },
      silver: { c: STEEL, metal: true, sheen: 0xffffff }, detail: { c: STEEL, metal: true, sheen: 0xffffff },
      barrel: { c: BLACK, metal: true }, mag: { c: BLACK, metal: true },
    },
  },
  // SR 蝶：スライドの上・補正器の上・前の握り・弾倉の底に蝶がとまる（上と下の羽、白い斑点）。スライドと弾倉の蝶は一緒に動く
  //   c1 銃の本体（艶。メイン）、c2 蝶の羽（照り返しも自分の色）。蝶の体は黒、斑点は白、握りと弾倉は黒で固定
  b9_sr: {
    name: '蝶', gun: 'b93r', rarity: 'SR', colors: [0xbdbdbd, 0x3a3a3a], addons: ['butterflies'],
    parts: {
      slide: { v: 1, gloss: true, sheen: 'self' }, frame: { v: 1, gloss: true, sheen: 'self' }, wing: { v: 2, gloss: true, sheen: 'self' },
      body: { c: INK, gloss: true }, spot: { c: 0xf4f4f4, gloss: true },
      grip: { c: BLACK, tex: 'stipple' }, barrel: { c: BLACK, metal: true }, mag: { c: BLACK, metal: true }, detail: { c: INK },
    },
  },
  // LR 白蛇：前の握りに下から巻き付き、フレームの下を通って補正器に巻き付き、銃口の上で鎌首をもたげる蛇（光る目・二股の舌）
  //   握りの両脇にとぐろの紋。3色：c1 銃の本体（メイン）、c2 蛇、c3 目と舌の光・銃口の光。握りと弾倉は黒で固定
  b9_lr: {
    name: '白蛇', gun: 'b93r', rarity: 'LR', colors: [0x2a2a2a, 0xf0f0f0, 0xbdbdbd], fx: 'c3', aura: true, addons: ['snake'],
    parts: {
      slide: { v: 1, metal: true, sheen: 'c2' }, frame: { v: 1, metal: true, sheen: 'c2' }, detail: { v: 1, metal: true, sheen: 'c2' },
      snake: { v: 2, gloss: true, sheen: 'self' }, eyes: { v: 3, glow: true }, mouth: { c: INK },
      grip: { c: INK, gloss: true, sheen: 'c2' }, barrel: { c: BLACK, metal: true }, mag: { c: BLACK, metal: true },
    },
  },

  // ===== M79 =====
  // N 素焼き：太い銃身を焼き物のようなつや消しの c1 に（メイン）、ストックと先台は c2 の木目。機関部は黒い鋼で固定
  m7_n: {
    name: '素焼き', gun: 'm79', rarity: 'N', colors: [0xbdbdbd, 0x6a6a6a],
    parts: {
      barrel: { v: 1 }, grip: { v: 2, tex: 'wood' },
      frame: { c: BLACK, metal: true }, detail: { c: INK },
    },
  },
  // R 花火筒：銃身に巻いた紙4枚と両端を縛った縄・紙から紙へ渡る導火線と先の火花・用心鉄から下がる十字に縛った花火玉
  //   c1 ストックと先台の漆（メイン）、c2 紙（巻き紙と花火玉）。縄は薄い灰、導火線は黒、火花は白く光る、金属は黒で固定
  m7_r: {
    name: '花火筒', gun: 'm79', rarity: 'R', colors: [0x3a3a3a, 0xe0e0e0], addons: ['paperWrap', 'fuse', 'fireball'],
    parts: {
      grip: { v: 1, gloss: true, sheen: 'self' }, paper: { v: 2, gloss: true },
      rope: { c: 0xbdbdbd }, fuseCord: { c: INK }, spark: { c: 0xffffff, glow: true },
      barrel: { c: BLACK, metal: true }, frame: { c: BLACK, metal: true }, detail: { c: INK },
    },
  },
  // SR 潜水：ストックの両脇の丸窓（縁・ガラス・鋲）・機関部の右のバルブの輪とストックへ伸びる管・銃身の上の水深計・銃身の鋲打ちの帯・ストックの下の錨
  //   c1 真鍮（丸窓の縁・バルブ・管・計器・帯・錨。メイン）、c2 ガラス。木部は暗い灰の木目、計器の文字盤は白、金属は黒で固定
  m7_sr: {
    name: '潜水', gun: 'm79', rarity: 'SR', colors: [0xbdbdbd, 0x5a5a5a], addons: ['dv_ports', 'dv_valve', 'dv_gauge', 'dv_bands', 'dv_anchor'],
    parts: {
      brass: { v: 1, metal: true, sheen: 'self' }, glass: { v: 2, gloss: true, sheen: 'self' },
      grip: { c: 0x3a3a3a, tex: 'wood' }, dial: { c: 0xf2f2f2, gloss: true },
      barrel: { c: BLACK, metal: true }, frame: { c: BLACK, metal: true }, detail: { c: INK },
    },
  },
  // LR 氷華：銃身の上と横・ストックの上と下から生える六角の氷の結晶の群れ・ストックと先台の霜の花・銃身と先台の下のつらら・機関部の光る氷の核
  //   本体（ストック・先台・機関部）は後ろの c1 から前の c2 へ凍っていくグラデーション
  //   3色：c1 本体の元の色（メイン）、c2 氷（結晶・つらら・銃身・グラデーションの先）、c3 核の光と霜の花・銃口の光
  m7_lr: {
    name: '氷華', gun: 'm79', rarity: 'LR', colors: [0xf0f0f0, 0xbdbdbd, 0xffffff], fx: 'c3', aura: true, addons: ['ic_crystals', 'ic_frost', 'ic_icicles', 'ic_core'],
    parts: {
      grip: { v: 1, gloss: true, sheen: 'c2', fade: ['c1', 'c1', 'c2'], fadeLen: 731 }, frame: { v: 1, metal: true, sheen: 'c2', fade: ['c1', 'c2'], fadeLen: 731 },
      ice: { v: 2, gloss: true, sheen: 'self' }, barrel: { v: 2, metal: true, sheen: 'self' },
      core: { v: 3, glow: true }, frost: { v: 3, glow: true }, detail: { v: 3, glow: true },
    },
  },

  // ===== カランビット =====
  // N 刃文：刃は背の c1 から刃先の c2 へ移る焼き入れの色（背から刃先へのグラデーション）。輪と握りは黒で固定
  kb_n: {
    name: '刃文', gun: 'karambit', rarity: 'N', colors: [0x3a3a3a, 0xe0e0e0],
    parts: {
      slide: { v: 1, metal: true, sheen: 'self', fade: ['c1', 'c1', 'c2'], fadeLen: 50, fadeFrom: -112 },
      frame: { c: BLACK, metal: true }, grip: { c: BLACK, tex: 'stipple' },
    },
  },
  // R 刀装：刃の根元の鍔・刃を留めるはばき・握りの両脇の花の目貫・輪から下がる紐と玉と房（日本刀の金具）
  //   c1 刃（メイン）、c2 金具（鍔・はばき・目貫・輪・玉）。握りは黒い艶、紐は黒で固定
  kb_r: {
    name: '刀装', gun: 'karambit', rarity: 'R', colors: [0xd0d0d0, 0x8a8a8a], addons: ['tsuba', 'habaki', 'menuki', 'ringCord'],
    parts: {
      slide: { v: 1, metal: true, sheen: 'self' }, fitting: { v: 2, metal: true, sheen: 'self' }, frame: { v: 2, metal: true, sheen: 'self' }, bead: { v: 2, gloss: true, sheen: 'self' },
      grip: { c: INK, gloss: true }, cord: { c: INK },
    },
  },
  // SR 光刃：刃先に沿って光る線・輪の内側の光る縁・握りの両脇の光る筋3本
  //   c1 刃と輪（暗い金属。メイン。照り返しは c2）、c2 光。握りは黒で固定
  kb_sr: {
    name: '光刃', gun: 'karambit', rarity: 'SR', colors: [0x2a2a2a, 0xffffff], addons: ['edgeGlow', 'ringGlow', 'gripSlits'],
    parts: {
      slide: { v: 1, metal: true, sheen: 'c2' }, frame: { v: 1, metal: true, sheen: 'c2' }, line: { v: 2, glow: true },
      grip: { c: INK, gloss: true },
    },
  },
  // LR 花嵐：握りの両脇を這う桜の枝と小枝・枝と輪と刃に咲く五弁の花（しべは白）・刃に舞う花びら
  //   刃は背の c1 から刃先の c2 へのグラデーション。c1 刃と輪（メイン）、c2 花と花びら・グラデーションの先・舞う光
  //   握りは黒い艶、枝は暗い灰で固定
  kb_lr: {
    name: '花嵐', gun: 'karambit', rarity: 'LR', colors: [0xe0e0e0, 0x9a9a9a], fx: 'c2', aura: true, addons: ['branch', 'blossoms', 'petals'],
    parts: {
      slide: { v: 1, metal: true, sheen: 'c2', fade: ['c1', 'c2'], fadeLen: 50, fadeFrom: -112 }, frame: { v: 1, metal: true, sheen: 'c2' },
      blossom: { v: 2, gloss: true, sheen: 'self' }, stamen: { c: 0xf4f4f4, glow: true }, twig: { c: 0x2a2a2a, gloss: true },
      grip: { c: INK, gloss: true },
    },
  },
  // LR（2つ目）忍：輪を芯にした手裏剣の3枚刃・苦無の刃・背と刃の光る筋・輪から垂れる鎖と分銅・苦無から下がる煙玉・握りの紐巻き・握りに刺さった十字手裏剣
  //   刃は根元の c1 から刃先の c2 へ染まる（毒の刃。縦の色の流れ）。c1 刃と輪と手裏剣と分銅の鋼（メイン）、c2 毒の色・光る筋・紐・煙玉の帯・舞う光
  //   握りと鎖は黒、煙玉は黒い艶で固定
  kb_lr2: {
    name: '忍', gun: 'karambit', rarity: 'LR', colors: [0x5a5a5a, 0xd0d0d0], fx: 'c2', aura: true,
    addons: ['nin_shuriken', 'nin_kunai', 'nin_lines', 'nin_chain', 'nin_smoke', 'nin_wrap', 'nin_star'],
    parts: {
      slide: { v: 1, metal: true, sheen: 'c2', fade: ['c2', 'c1', 'c1'], fadeLen: 122, fadeFrom: -176, fadeAxis: 'v' },
      frame: { v: 1, metal: true, sheen: 'c2' }, steel: { v: 1, metal: true, sheen: 'c2' },
      line: { v: 2, glow: true }, cord: { v: 2 },
      chain: { c: INK, metal: true }, ball: { c: BLACK, gloss: true }, grip: { c: INK },
    },
  },

  // ===== 和弓 =====
  // N 重籐：弓の本体は c1 の漆（メイン）、籐巻きは c2 の艶。握りは黒い革で固定
  ym_n: {
    name: '重籐', gun: 'yumi', rarity: 'N', colors: [0x3a3a3a, 0xd0d0d0],
    parts: { frame: { v: 1, gloss: true, sheen: 'self' }, detail: { v: 2, gloss: true, sheen: 'self' }, grip: { c: INK } },
  },
  // R 房：弓の両端から下がる紐と玉と房・握りの後ろの丸い紋
  //   c1 弓の漆（メイン）、c2 房と紋。籐巻きと紐と握りは黒で固定
  ym_r: {
    name: '房', gun: 'yumi', rarity: 'R', colors: [0xbdbdbd, 0x5a5a5a], addons: ['tassels', 'crest'],
    parts: {
      frame: { v: 1, gloss: true, sheen: 'self' }, tassel: { v: 2, gloss: true, sheen: 'self' },
      detail: { c: INK, gloss: true }, grip: { c: INK }, cord: { c: INK },
    },
  },
  // SR 鈴弓：上の弓から下がる3つの鈴と、握りの下の鈴の房・握りの下と上の先から長く垂れる布（神楽の弓）
  //   c1 弓の漆（メイン）、c2 垂れる布。籐巻きは白、鈴は銀、握りと紐は黒で固定
  ym_sr: {
    name: '鈴弓', gun: 'yumi', rarity: 'SR', colors: [0x2a2a2a, 0xe0e0e0], addons: ['bells', 'ribbons'],
    parts: {
      frame: { v: 1, gloss: true, sheen: 'self' }, ribbon: { v: 2, gloss: true },
      detail: { c: 0xf2f2f2, gloss: true }, bell: { c: STEEL, metal: true, sheen: 0xffffff }, grip: { c: INK }, cord: { c: INK },
    },
  },
  // LR 光輪：握りと上下の弓を囲む光の輪・両端に扇のように開く光の羽・弓の両脇に沿う光の筋・両端の光る結晶
  //   c1 弓の漆（メイン。照り返しは c2）、c2 光（輪・羽・筋・籐巻き・結晶・舞う光）。握りは黒い艶で固定
  ym_lr: {
    name: '光輪', gun: 'yumi', rarity: 'LR', colors: [0xf0f0f0, 0xbdbdbd], fx: 'c2', aura: true, addons: ['halos', 'wings', 'lines', 'tipGems'],
    parts: {
      frame: { v: 1, gloss: true, sheen: 'c2' }, detail: { v: 2, glow: true }, line: { v: 2, glow: true }, gem: { v: 2, gloss: true, sheen: 'self' },
      grip: { c: INK, gloss: true },
    },
  },

  // ===== Glock 17 =====
  // N ツートン：スライドは c1 の焼き入れの鋼、フレームと握りは c2 の樹脂（握りはざらざら）
  gl_n: {
    name: 'ツートン', gun: 'glock17', rarity: 'N', colors: [0x3a3a3a, 0x9a9a9a],
    parts: {
      slide: { v: 1, metal: true, sheen: 'self' }, frame: { v: 2 }, grip: { v: 2, tex: 'stipple' },
      barrel: { c: BLACK, metal: true }, detail: { c: INK }, mag: { c: BLACK, metal: true },
    },
  },
  // R 真珠：全体を艶のある c1 に塗り、照り返しを c2 に（見る角度で真珠のように色が変わる）。握りは c2 のざらざら、照準と引き金も c2
  //   銃身は銀で固定
  gl_r: {
    name: '真珠', gun: 'glock17', rarity: 'R', colors: [0xd8d8d8, 0x7a7a7a],
    parts: {
      slide: { v: 1, gloss: true, sheen: 'c2' }, frame: { v: 1, gloss: true, sheen: 'c2' }, grip: { v: 2, tex: 'stipple' },
      detail: { v: 2 }, barrel: { c: STEEL, metal: true, sheen: 0xffffff }, mag: { c: BLACK, metal: true },
    },
  },
  // SR（2つ目）焼け色（色の流れ）：焼いた金属のように、スライドとフレームが後ろの c1 から c2、銃口の c3 へ流れる。スライドの前の横に放熱のひれ・銃口の先に補正器（横に光る線）
  //   c1・c2・c3 の流れ（メイン）、ひれは c2、補正器・銃身・照準と引き金は c3。握りは黒で固定
  gl_sr2: {
    name: '焼け色', gun: 'glock17', rarity: 'SR', colors: [0x3a3a3a, 0x8a8a8a, 0xe0e0e0], addons: ['gl_fins', 'gl_comp'],
    parts: {
      slide: { v: 1, metal: true, sheen: 'c3', fade: ['c1', 'c1', 'c2', 'c3'], fadeLen: 200, fadeFrom: -5 },
      frame: { v: 1, gloss: true, sheen: 'c2', fade: ['c1', 'c1', 'c2', 'c3'], fadeLen: 200, fadeFrom: -15 },
      fin: { v: 2, metal: true, sheen: 'c3' }, comp: { v: 3, metal: true, sheen: 'self' }, barrel: { v: 3, metal: true, sheen: 'self' },
      detail: { v: 3, glow: true }, line: { v: 3, glow: true }, grip: { c: INK, tex: 'stipple' }, mag: { c: INK, metal: true, sheen: 'c2' },
    },
  },
  // SR 競技：スライドの上と横の肉抜き（中の c2 の銃身が見える）・グリップの下の広がった弾倉の口・長いスライドストップ
  //   c1 スライド（メイン）、c2 肉抜きの奥の銃身・弾倉の口・レバー。フレームと握りは黒で固定
  gl_sr: {
    name: '競技', gun: 'glock17', rarity: 'SR', colors: [0x5a5a5a, 0xd0d0d0], addons: ['gl_ports', 'gl_well'],
    parts: {
      slide: { v: 1, metal: true }, port: { v: 2, metal: true, sheen: 'self' }, well: { v: 2, metal: true, sheen: 'self' },
      frame: { c: BLACK }, grip: { c: BLACK, tex: 'stipple' }, barrel: { c: STEEL, metal: true }, detail: { c: INK }, mag: { c: BLACK, metal: true },
    },
  },

  // ===== KRISS Vector =====
  // N 流し塗り（色の流れ）：本体の上・前・サプレッサー・ストックが、床尾の c1 から真ん中の c2、銃口の c3 へなめらかに移る金属。下の機関部も同じ流れ
  //   握りと弾倉は黒で固定
  vc_n: {
    name: '流し塗り', gun: 'vector', rarity: 'N', colors: [0x2a2a2a, 0x8a8a8a, 0xe8e8e8],
    parts: {
      slide: { v: 1, metal: true, sheen: 'c3', fade: ['c1', 'c2', 'c3'], fadeLen: 880 },
      frame: { v: 1, metal: true, sheen: 'c3', fade: ['c1', 'c2', 'c3'], fadeLen: 880 },
      grip: { c: INK, tex: 'stipple' }, barrel: { c: BLACK, metal: true }, detail: { c: INK }, mag: { c: BLACK, metal: true },
    },
  },
  // R 電脳：サプレッサーの光る輪・下の機関部のへこみを走る光る回路・上の段の光る線・ハンドガードの斜めの光る通気口
  //   c1 本体の金属と艶（メイン。照り返しは c2）、c2 光る所（回路・輪・照準・引き金）。握りは黒い艶
  vc_r: {
    name: '電脳', gun: 'vector', rarity: 'R', colors: [0x2a2a2a, 0xffffff], addons: ['vc_rings', 'vc_trace', 'vc_vents'],
    parts: {
      slide: { v: 1, metal: true, sheen: 'c2' }, frame: { v: 1, gloss: true, sheen: 'c2' }, line: { v: 2, glow: true }, detail: { v: 2, glow: true },
      grip: { c: INK, gloss: true, sheen: 'c2' }, barrel: { c: BLACK, metal: true }, mag: { c: BLACK, metal: true, sheen: 'c2' },
    },
  },
  // SR 装備品：左の短いレールのライト（c2 の帯・白く光るレンズ）・ストックの下の負い紐の輪と留め金・縦グリップのテープ
  //   c1 下の機関部（メイン）、c2 負い紐・テープ・ライトの帯。上と金属は黒、ライトは黒い金属で固定
  vc_sr: {
    name: '装備品', gun: 'vector', rarity: 'SR', colors: [0x8a8a8a, 0x4a4a4a], addons: ['vc_light', 'vc_sling', 'vc_wrap'],
    parts: {
      frame: { v: 1 }, strap: { v: 2 }, band: { v: 2, metal: true, sheen: 'self' },
      lightBody: { c: BLACK, metal: true }, lens: { c: 0xf4f4f4, glow: true }, buckle: { c: STEEL, metal: true, sheen: 0xffffff },
      slide: { c: BLACK }, grip: { c: INK, tex: 'stipple' }, barrel: { c: BLACK, metal: true }, detail: { c: INK }, mag: { c: BLACK, metal: true },
    },
  },

  // ===== M4A1 =====
  // N 二色：機関部・ハンドガード・ストックは c1 の金属（メイン）、握りと弾倉は c2 の樹脂
  m4_n: {
    name: '二色', gun: 'm4a1', rarity: 'N', colors: [0x3a3a3a, 0xa8a8a8],
    parts: {
      frame: { v: 1, metal: true }, grip: { v: 2, tex: 'stipple' }, mag: { v: 2 },
      slide: { c: BLACK, metal: true }, detail: { c: INK },
    },
  },
  // R キャンディ：本体全部を c1 のキャンディ塗装の金属に（照り返しは c2）。握りは c2 の艶、弾倉は c1 の金属、銃身は銀
  m4_r: {
    name: 'キャンディ', gun: 'm4a1', rarity: 'R', colors: [0x6a6a6a, 0xe0e0e0],
    parts: {
      frame: { v: 1, metal: true, sheen: 'c2' }, mag: { v: 1, metal: true, sheen: 'c2' }, grip: { v: 2, gloss: true, sheen: 'self' },
      slide: { c: STEEL, metal: true }, detail: { c: INK },
    },
  },
  // SR（2つ目）焼き色（色の流れ）：床尾の c1 から真ん中の c2、銃口の c3 へ流れる焼いた金属。太い銃口制退器・ハンドガードと機関部とストックを走る光る線
  //   c1・c2・c3 の流れ（メイン）、制退器と光る線は c3、弾倉は c1。握りは黒い艶
  m4_sr2: {
    name: '焼き色', gun: 'm4a1', rarity: 'SR', colors: [0x2a2a2a, 0x8a8a8a, 0xe0e0e0], addons: ['m4_brake', 'm4_lines'],
    parts: {
      frame: { v: 1, metal: true, sheen: 'c3', fade: ['c1', 'c1', 'c2', 'c3'], fadeLen: 860 },
      slide: { v: 1, metal: true, sheen: 'c3', fade: ['c1', 'c1', 'c2', 'c3'], fadeLen: 860 },
      brake: { v: 3, metal: true, sheen: 'self' }, line: { v: 3, glow: true },
      grip: { c: INK, gloss: true, sheen: 'c2' }, mag: { v: 1, metal: true, sheen: 'c2' }, detail: { c: INK },
    },
  },
  // SR タクティカル：横と下のレールの覆い（横は溝つき）・弾倉の底の継ぎ足しと引き手・前の負い紐の輪から下がる駒の根付
  //   c1 本体（メイン）、c2 レールの覆い・継ぎ足し・根付。銃身は黒、溝と引き手は黒で固定
  m4_sr: {
    name: 'タクティカル', gun: 'm4a1', rarity: 'SR', colors: [0x5a5a5a, 0xc8c8c8], addons: ['m4_covers', 'm4_mag', 'm4_charm'],
    parts: {
      frame: { v: 1 }, cover: { v: 2, gloss: true, sheen: 'self' }, ink: { c: INK },
      slide: { c: BLACK, metal: true }, grip: { c: INK, tex: 'stipple' }, mag: { c: BLACK, metal: true }, detail: { c: INK },
    },
  },

  // ===== FAMAS =====
  // N 二色：本体は c1 の樹脂（メイン）、頬当て・二脚・銃身と握りは c2
  fa_n: {
    name: '二色', gun: 'famas', rarity: 'N', colors: [0x7a7a7a, 0x2a2a2a],
    parts: {
      frame: { v: 1 }, slide: { v: 2, metal: true }, grip: { v: 2, tex: 'stipple' },
      detail: { c: INK }, mag: { c: BLACK, metal: true },
    },
  },
  // R 漆塗り：本体は c1 の漆（メイン）、頬当て・二脚・銃身は c2 の金属、握りは c2 の漆、弾倉は c1 の漆
  fa_r: {
    name: '漆塗り', gun: 'famas', rarity: 'R', colors: [0x4a4a4a, 0xc8c8c8],
    parts: {
      frame: { v: 1, gloss: true, sheen: 'self' }, slide: { v: 2, metal: true, sheen: 'self' }, grip: { v: 2, gloss: true, sheen: 'self' },
      mag: { v: 1, gloss: true }, detail: { c: INK },
    },
  },
  // SR（2つ目）三色流し（色の流れ）：艶のある本体が、肩当ての c1 から真ん中の c2、取っ手の前と銃口の c3 へ流れる。肩当ての横の丸い三重の印・取っ手の前に結んだリボン
  //   リボンは c2。金属・握り・弾倉は黒で固定
  fa_sr2: {
    name: '三色流し', gun: 'famas', rarity: 'SR', colors: [0x3a3a3a, 0xd0d0d0, 0x8a8a8a], addons: ['fa_roundel', 'fa_ribbon'],
    parts: {
      frame: { v: 1, gloss: true, sheen: 'c2', fade: ['c1', 'c1', 'c2', 'c3', 'c3'], fadeLen: 770, fadeFrom: -8 },
      r1: { v: 1, gloss: true }, r2: { v: 2, gloss: true }, r3: { v: 3, gloss: true }, rib: { v: 2, gloss: true, sheen: 'self' },
      slide: { c: BLACK, metal: true }, grip: { c: INK, tex: 'stipple' }, detail: { c: INK }, mag: { c: BLACK, metal: true },
    },
  },
  // SR 軍楽：取っ手の上・肩当ての上・銃身の金の縁取り・肩当ての横の星・取っ手から垂れる2重の飾り紐と房
  //   c1 本体の艶（メイン。照り返しは c2）、c2 金具（縁取り・星・紐・房・引き金）。頬当てと金属は黒、握りは黒い艶
  fa_sr: {
    name: '軍楽', gun: 'famas', rarity: 'SR', colors: [0x2a2a2a, 0xe0e0e0], addons: ['fa_trim', 'fa_star', 'fa_cord'],
    parts: {
      frame: { v: 1, gloss: true, sheen: 'c2' }, accent: { v: 2, metal: true, sheen: 'self' }, cord: { v: 2 }, detail: { v: 2, metal: true, sheen: 'self' },
      slide: { c: BLACK, metal: true, sheen: 'c2' }, grip: { c: INK, gloss: true }, mag: { c: BLACK, metal: true },
    },
  },

  // ===== MGL =====
  // N 二色：シリンダーと銃身は c1 の金属（メイン）、枠・ストック・ハンドガードは c2
  mg_n: {
    name: '二色', gun: 'mgl', rarity: 'N', colors: [0x8a8a8a, 0x3a3a3a],
    parts: {
      slide: { v: 1, metal: true, sheen: 'self' }, frame: { v: 2 }, grip: { c: INK, tex: 'stipple' },
      detail: { c: INK }, mag: { c: BLACK, metal: true },
    },
  },
  // R 夕映え（色の流れ）：ストックの c1 から、シリンダーの c2、銃口の c3 へ流れる金属。枠も銃身も同じ流れ
  //   弾の底は c2 の金属、握りは黒で固定
  mg_r: {
    name: '夕映え', gun: 'mgl', rarity: 'R', colors: [0x2a2a2a, 0x8a8a8a, 0xe8e8e8],
    parts: {
      frame: { v: 1, metal: true, sheen: 'c3', fade: ['c1', 'c2', 'c3'], fadeLen: 780 },
      slide: { v: 1, metal: true, sheen: 'c3', fade: ['c1', 'c2', 'c3'], fadeLen: 780 },
      mag: { v: 2, metal: true, sheen: 'self' }, grip: { c: INK, tex: 'stipple' }, detail: { c: INK },
    },
  },
  // SR（2つ目）六連星：シリンダーの膨らみの谷を走る光る線と薬室の口の光る輪・後ろの枠の横の六つの星・シリンダーを巡る2本の光の輪と星
  //   c1 シリンダーと銃身の金属（メイン。照り返しは c2）、c2 光る所と弾の底。枠は黒い金属、握りは黒い艶
  mg_sr2: {
    name: '六連星', gun: 'mgl', rarity: 'SR', colors: [0x3a3a3a, 0xe8e8e8], addons: ['mg_flutes', 'mg_stars', 'mg_orbit'],
    parts: {
      slide: { v: 1, metal: true, sheen: 'c2' }, line: { v: 2, glow: true }, star: { v: 2, glow: true }, detail: { v: 2, glow: true }, mag: { v: 2, metal: true, sheen: 'self' },
      frame: { c: BLACK, metal: true, sheen: 'c2' }, grip: { c: INK, gloss: true, sheen: 'c2' },
    },
  },
  // SR 弾帯：ストックの右に帯で留めた予備の2発・前の輪から下がる荷札・銃身に巻いたテープ
  //   c1 枠とストック（メイン）、c2 帯・テープ・荷札・弾の頭。弾の胴は銀、金属は黒で固定
  mg_sr: {
    name: '弾帯', gun: 'mgl', rarity: 'SR', colors: [0x6a6a6a, 0xd0d0d0], addons: ['mg_belt', 'mg_tag', 'mg_tape'],
    parts: {
      frame: { v: 1 }, strap: { v: 2 }, tag: { v: 2 }, nose: { v: 2, gloss: true, sheen: 'self' }, case: { c: STEEL, metal: true }, ink: { c: INK },
      slide: { c: BLACK, metal: true, sheen: 'c2' }, grip: { c: INK, tex: 'stipple' }, detail: { c: INK }, mag: { c: BLACK, metal: true },
    },
  },

  // ===== クロスボウ =====
  // N 三色流し（色の流れ）：本体と矢の台が後ろの c1 から c2、前の台と足掛けの c3 へ流れる金属。弓は c3 の艶、矢羽は c2
  //   銃床は c1 の暗い色（矢の色から作る）、握りは黒で固定
  xb_n: {
    name: '三色流し', gun: 'crossbow', rarity: 'N', colors: [0x2a2a2a, 0x9a9a9a, 0xe8e8e8],
    parts: {
      frame: { v: 1, metal: true, sheen: 'c3', fade: ['c1', 'c1', 'c2', 'c3'], fadeLen: 1020, fadeFrom: -10 },
      barrel: { v: 3, gloss: true, sheen: 'self' }, slide: { v: 1 }, mag: { v: 2 },
      grip: { c: INK, tex: 'stipple' }, detail: { c: INK },
    },
  },
  // R 艶弓：本体は c1 の艶（照り返しは c2）、弓は c2 の磨いた金属、矢と矢羽も c2。握りは黒のざらざら
  xb_r: {
    name: '艶弓', gun: 'crossbow', rarity: 'R', colors: [0x3a3a3a, 0xd0d0d0],
    parts: {
      frame: { v: 1, gloss: true, sheen: 'c2' }, barrel: { v: 2, metal: true, sheen: 'self' }, slide: { v: 2, metal: true }, mag: { v: 2 },
      grip: { c: INK, tex: 'stipple' }, detail: { c: INK },
    },
  },
  // SR（2つ目）羽飾り：弓に巻いた紐（3か所）・弓の先から下がる2枚の羽と軸
  //   c1 本体（メイン）、c2 巻いた紐と羽。弓は黒い艶、金属は黒で固定
  xb_sr2: {
    name: '羽飾り', gun: 'crossbow', rarity: 'SR', colors: [0x6a6a6a, 0xd0d0d0], addons: ['xb_wraps', 'xb_feathers'],
    parts: {
      frame: { v: 1 }, wrap: { v: 2 }, feather: { v: 2, gloss: true, sheen: 'self' }, mag: { v: 2 }, ink: { c: INK },
      barrel: { c: INK, gloss: true }, slide: { c: BLACK }, grip: { c: INK, tex: 'stipple' }, detail: { c: INK },
    },
  },
  // SR 天弓：弓から後ろ外へ広がる羽の翼・矢の台と銃床と前の台の光る線・前の台の横の宝石。弦と照準と矢羽も光る
  //   c1 本体の艶と弓の金属（メイン。照り返しは c2）、c2 翼・光る所・宝石。矢は黒、握りは黒い艶
  xb_sr: {
    name: '天弓', gun: 'crossbow', rarity: 'SR', colors: [0x2a2a2a, 0xf0f0f0], addons: ['xb_wings', 'xb_lines', 'xb_gem'],
    parts: {
      frame: { v: 1, gloss: true, sheen: 'c2' }, barrel: { v: 1, metal: true, sheen: 'c2' }, wing: { v: 2, gloss: true, sheen: 'self' },
      line: { v: 2, glow: true }, gem: { v: 2, gloss: true, sheen: 'self' }, detail: { v: 2, glow: true }, mag: { v: 2, glow: true },
      slide: { c: BLACK, metal: true }, grip: { c: INK, gloss: true },
    },
  },

  // ===== AWM =====
  // N 艶塗り：銃床と先台を車の塗装のような c1 の艶に（メイン）。金属とスコープは黒で、照り返しが c2
  aw_n: {
    name: '艶塗り', gun: 'awm', rarity: 'N', colors: [0x6a6a6a, 0xf0f0f0],
    parts: {
      grip: { v: 1, gloss: true, sheen: 'c2' },
      slide: { c: BLACK, metal: true, sheen: 'c2' }, frame: { c: BLACK, metal: true, sheen: 'c2' }, barrel: { c: BLACK, metal: true, sheen: 'c2' },
      scope: { c: INK, metal: true, sheen: 'c2' }, mag: { c: BLACK, metal: true }, detail: { c: INK },
    },
  },
  // R 競技札：シャーシの両脇の番号札「07」・頬当てにかぶせた当て布と留め帯・銃身の上の風見の小旗
  //   c1 銃床と先台のざらざらの樹脂（メイン）、c2 当て布と小旗。札は白、数字と帯は黒、金属は黒で固定
  aw_r: {
    name: '競技札', gun: 'awm', rarity: 'R', colors: [0x5a5a5a, 0xd0d0d0], addons: ['aw_bib', 'aw_pad', 'aw_flag'],
    parts: {
      grip: { v: 1, tex: 'stipple' }, cloth: { v: 2 }, bib: { c: 0xf4f4f4 }, ink: { c: INK },
      slide: { c: BLACK, metal: true }, frame: { c: BLACK, metal: true }, barrel: { c: BLACK, metal: true },
      scope: { c: INK, metal: true }, mag: { c: BLACK, metal: true }, detail: { c: INK },
    },
  },
  // SR 撃墜記録：銃床に刻んだ数え線（5本ずつ4組）・先台の下から吊るした3つの空薬莢・用心鉄の前から下がるドッグタグと鎖
  //   c1 銃床と先台のざらざらの樹脂（メイン）、c2 真鍮（数え線と薬莢。金属の照り返しも）。札は銀、鎖と紐は黒、金属は黒で固定
  aw_sr: {
    name: '撃墜記録', gun: 'awm', rarity: 'SR', colors: [0x4a4a4a, 0xd0d0d0], addons: ['aw_tally', 'aw_shells', 'aw_tags'],
    parts: {
      grip: { v: 1, tex: 'stipple' }, brass: { v: 2, metal: true, sheen: 'self' }, tag: { c: STEEL, metal: true, sheen: 0xffffff }, ink: { c: INK },
      slide: { c: BLACK, metal: true, sheen: 'c2' }, frame: { c: BLACK, metal: true, sheen: 'c2' }, barrel: { c: BLACK, metal: true, sheen: 'c2' },
      scope: { c: INK, metal: true, sheen: 'c2' }, mag: { c: BLACK, metal: true }, detail: { c: INK },
    },
  },
  // LR 墨染：白い紙（固定）の銃が、後ろから銃口へ c1 の墨に染まり、銃口で c2 へにじむ。筆の払い（上 c2・下 c1）・落款 c2・墨のしずく c2・飛んだ墨の点 c1
  //   紙はつや消しの白で固定。金属・スコープも同じ流れで染まる（銃身は c1 から c2 へ）。弾倉は紙、小物は黒
  aw_lr: {
    name: '墨染', gun: 'awm', rarity: 'LR', colors: [0x2a2a2a, 0x8a8a8a], fx: 'c2', aura: true, addons: ['aw_brush', 'aw_seal', 'aw_drops', 'aw_splat'],
    parts: {
      grip: { v: 1, fade: [PAPER, PAPER, 'c1', 'c1', 'c2'], fadeLen: 1236 },
      slide: { v: 1, metal: true, sheen: 'c2', fade: [PAPER, PAPER, 'c1', 'c1', 'c2'], fadeLen: 1236 },
      frame: { v: 1, metal: true, sheen: 'c2', fade: [PAPER, PAPER, 'c1', 'c1', 'c2'], fadeLen: 1236 },
      scope: { v: 1, gloss: true, sheen: 'c2', fade: [PAPER, PAPER, 'c1', 'c1', 'c1'], fadeLen: 1236 },
      barrel: { v: 1, metal: true, sheen: 'c2', fade: ['c1', 'c1', 'c2'], fadeLen: 1236 },
      mag: { c: PAPER }, paper: { c: PAPER }, detail: { c: INK },
      brushA: { v: 2, gloss: true, sheen: 'self' }, brushB: { v: 1, gloss: true, sheen: 'self' }, splat: { v: 1 },
      seal: { v: 2 }, drop: { v: 2, gloss: true, sheen: 'self' },
    },
  },
};

// デザインを、カラー cols で塗ったスキンにする
export function resolveDesign(d: Design, cols: number[]): Skin {
  const ref = (r: CRef) => (r === 'c1' ? cols[0] : r === 'c2' ? cols[1] ?? cols[0] : r === 'c3' ? cols[2] ?? cols[0] : r);
  const out: any = { name: d.name, gun: d.gun, rarity: d.rarity, addons: d.addons, extra: {} };
  for (const [k, p] of Object.entries(d.parts)) {
    const c = p.v ? cols[p.v - 1] ?? cols[0] : p.c ?? BLACK;
    const st: SlotStyle = { ...p, c, sheen: p.sheen === 'self' ? light(c) : p.sheen !== undefined ? light(ref(p.sheen)) : undefined, fade: p.fade?.map(ref) } as SlotStyle;
    delete (st as any).v;
    if (k === 'line') out.line = c;
    else if (['slide', 'barrel', 'frame', 'grip', 'detail', 'mag', 'accent', 'gem'].includes(k)) out[k] = st;
    else out.extra[k] = st;
  }
  for (const k of ['slide', 'barrel', 'frame', 'grip', 'detail'] as const) if (!out[k]) out[k] = { c: BLACK };
  if (d.fx !== undefined) { const c = ref(d.fx); out.fx = { flash: c, tracer: c, aura: d.aura ? c : undefined }; }
  return out;
}
// 見本とゲームは、公式配色で塗ったものを今まで通り SKINS から使う
for (const [id, d] of Object.entries(DESIGNS)) SKINS[id] = resolveDesign(d, d.colors);

// ================= ガチャの色 =================
// 色は番号（シード）1つから決まる。番号さえ覚えれば同じ色がいつでも作れる（保存や、オンラインで相手に見せるのも番号だけ）
function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// 色はなんでもあり：色相・鮮やかさ・明るさを全部ランダムに
export function gachaColors(seed: number, n = 2) {
  const r = rng(seed);
  return Array.from({ length: n }, () => new THREE.Color().setHSL(r(), r(), 0.08 + r() * 0.84).getHex());
}
// デザイン base を、番号 seed の色で塗ったスキン
export function gachaSkin(base: string, seed: number): Skin {
  const d = DESIGNS[base];
  if (!d) return SKINS[base];
  const sk = resolveDesign(d, gachaColors(seed, d.colors.length));
  sk.name = d.name + ' #' + (seed >>> 0).toString(16).toUpperCase().padStart(8, '0');
  return sk;
}
export const designColorCount = (base: string) => DESIGNS[base]?.colors.length || 0;
