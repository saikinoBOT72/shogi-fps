// 共通の道具・駒/武器/スキルのデータ・設定
import * as THREE from 'three';

export const V3 = THREE.Vector3;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const rand = (a: number, b: number) => a + Math.random() * (b - a);
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
export const $ = (id: string): any => document.getElementById(id);
// 色（three.js が 16進の sRGB を自動で線形に変換する）
export const C = hex => new THREE.Color(hex);
// three.js r155 以降は光が物理的に正しい計算になった。以前と同じ明るさにするため光の強さに π を掛ける
export const LIGHT = Math.PI;

// ================= 駒データ（ここに駒を足していく） =================
// value: 駒の価値（将棋の点数）。駒同士は互角ではなく、価値が高いほど強くする（HPなどの目安）
//   歩1 香3 桂4 銀5 金6 角8 飛10 … 安い駒で高い駒を倒すと嬉しい、というバランス
// hp: 体力 / size: 大きさ（見た目・当たり判定・目線の高さ。差は控えめに） / speed, jump: 機動力
// strafe: 横移動の速さの倍率（香は前にしか進めない駒なので横が遅い）
export const PIECES = {
  // skills: [スキル1, スキル2]（キーは設定で変えられる。初期は E と Q）
  P: { name: '歩', value: 1, hp: 90,  size: 0.8,  speed: 7.2, jump: 7.5, weapon: 'glock',    skills: ['step', 'cloak'] },
  L: { name: '香', value: 3, hp: 95,  size: 0.85, speed: 6.8, jump: 7,   weapon: 'sniper',   skills: ['xray', 'boxes'], strafe: 0.7 },
  N: { name: '桂', value: 4, hp: 100, size: 0.85, speed: 7,   jump: 9,   weapon: 'bow',      skills: ['homing', 'volley'] },
  S: { name: '銀', value: 5, hp: 110, size: 0.85, speed: 7,   jump: 7.5, weapon: 'burst',    skills: ['emp', 'missile'] },
  G: { name: '金', value: 6, hp: 120, size: 0.9,  speed: 6.5, jump: 7,   weapon: 'shotgun',  skills: ['physical', 'guard'] },
  B: { name: '角', value: 8, hp: 125, size: 0.95, speed: 6.3, jump: 7,   weapon: 'launcher', skills: ['smoke', 'bigshot'] },
  R: { name: '飛', value: 10, hp: 130, size: 0.95, speed: 6.5, jump: 7,  weapon: 'smg',      skills: ['grapple', 'flash'] },
  // 王は取られたら負けの駒。価値は ∞（99 以上は ∞ と表示）
  K: { name: '王', value: 99, hp: 150, size: 1.0, speed: 6.2, jump: 7,   weapon: 'ar',       skills: ['pearl', 'turret'] },
  // 特殊駒（special）：今は開発者メニューの「特殊駒」をオンにしたときだけ、一騎打ちの自分・相手の駒に出る。将棋モード・ランダムには出ない
  SA: { name: '侍', value: 99, hp: 120, size: 0.9, speed: 7.2, jump: 7.5, weapon: 'katana', skills: ['blink', 'tornado'], special: true },   // 影分身（'clone'）・葉隠れ（'hagakure'）は外した（仕組みは残してある）
  // 成駒（promo：元の駒）：将棋モードで成った駒が一騎打ちでなる姿。字は盤と同じ赤い字（red）。ランダムには出ない
  //   性格：と＝成り上がりの足軽 / 成香＝重い狙撃手 / 成桂＝身軽な射手 / 成銀＝万能の兵 / 馬＝重装の砲兵 / 龍＝機動の切り込み役 / 帝＝威厳の王
  'P+': { name: 'と', value: 6, hp: 110, size: 0.8,  speed: 7.0, jump: 7.5, weapon: 'pistol', skills: ['dual', 'roll'], promo: 'P', red: true },
  'L+': { name: '杏', value: 6, hp: 100, size: 0.85, speed: 6.4, jump: 7,   weapon: 'awm',    skills: ['pierce', 'hearing'], strafe: 0.6, promo: 'L', red: true },
  'N+': { name: '圭', value: 6, hp: 100, size: 0.85, speed: 7.4, jump: 10,  weapon: 'xbow',   skills: ['poison', 'multishot'], promo: 'N', red: true },
  'S+': { name: '全', value: 6, hp: 115, size: 0.85, speed: 7,   jump: 7.5, weapon: 'famas',  skills: ['medkit', 'dome'], promo: 'S', red: true },
  'B+': { name: '馬', value: 10, hp: 140, size: 0.95, speed: 6.0, jump: 7,  weapon: 'mgl',    skills: ['mine', 'smoke2'], promo: 'B', red: true },
  'R+': { name: '龍', value: 12, hp: 125, size: 0.95, speed: 7.0, jump: 7.5, weapon: 'vector', skills: ['grapple2', 'flare'], promo: 'R', red: true },
  'K+': { name: '帝', value: 99, hp: 160, size: 1.0, speed: 6.4, jump: 7,   weapon: 'm4',     skills: ['airstrike', 'pearl'], promo: 'K', red: true },
};
// 解放した特殊駒（持ち物と一緒にアカウントへ保存。loadout.ts が入れる。今は手に入れる方法なし）
export const UNLOCKED = new Set<string>();
// 開発者メニューの「特殊駒」：オンにすると、特殊駒（侍）が自分の駒・相手（CPU）の駒の欄に出る
export const specialOn = () => !!(settings as any).dev?.special;
// 解放した特殊駒か、ふつうの駒なら使える
export const pieceUsable = (k: string) => !!PIECES[k] && (!PIECES[k].special || UNLOCKED.has(k) || specialOn());
// ふつうの駒（ランダム・相手の駒・将棋モード用）
export const NORMAL_PIECES = () => Object.keys(PIECES).filter(k => !PIECES[k].special && !PIECES[k].promo);
// 将棋の駒 → 一騎打ちの駒の種類（成っていれば成駒）
export const duelType = (type: string, promoted?: boolean) => (promoted && PIECES[type + '+'] ? type + '+' : type);
// 全体のルール：しばらく被弾しないとHPが回復する
// speed: 走る速さの倍率（駒の speed に掛ける）、walk: 歩く速さ（走りに対する割合）
export const RULES = { regenDelay: 5, regenRate: 12, speed: 0.8, walk: 0.6 };
export const WEAPONS = {
  // dmg: ダメージ / head: 頭の倍率 / rate: 連射間隔 / spread: 基本ブレ / bloom*: 連射でブレが広がる量
  // move/air: 移動中・空中のブレ / ads: 右クリック時のブレ倍率 / recoil: 反動 / falloff: [減衰開始, 最大減衰距離, 最小倍率]
  // model: 見た目 / pellets: 1回に出る弾の数
  // 歩：Glock（軽く速く撃てる） / と：デザートイーグル（1発が重く連射は遅い）
  glock: {
    name: 'Glock 17', model: 'glock', dmg: 18, head: 1.6, rate: 0.15, spread: 0.013, bloomShot: 0.01, bloomMax: 0.04, bloomRecover: 0.13,
    move: 0.03, air: 0.09, ads: 0.35, mag: 17, reload: 1.5, auto: false, recoil: 0.016, falloff: [16, 38, 0.65], pref: 12,
  },
  pistol: {
    name: 'デザートイーグル', model: 'pistol', dmg: 34, head: 1.7, rate: 0.5, spread: 0.012, bloomShot: 0.018, bloomMax: 0.05, bloomRecover: 0.12,
    move: 0.03, air: 0.09, ads: 0.35, mag: 7, reload: 1.5, auto: false, recoil: 0.034, falloff: [20, 45, 0.7], pref: 12,
  },
  // ---------- 成駒の武器（元の武器と強さは同じくらい、性格が違う） ----------
  awm: {
    name: 'AWM', model: 'awm', dmg: 95, head: 1.8, rate: 1.5, adsSpeed: 9, spread: 0.09, hip: 0.05, bloomShot: 0, bloomMax: 0, bloomRecover: 0.1,
    move: 0.07, air: 0.16, ads: 0.015, zoom: 26, scopeSize: 0.9, scopeSway: 1.1, crossInf: 0, reticle: 'cross', mag: 5, reload: 2.8, auto: false, recoil: 0.09, falloff: [999, 1000, 1], pref: 30,
  },
  xbow: {
    name: 'クロスボウ', model: 'xbow', kind: 'xbow', dmg: 54, dmgMin: 54, head: 1.6, speedMin: 82, speedMax: 82, gravity: 7, drag: 0.01, rate: 0.25, spread: 0.004, bloomShot: 0, bloomMax: 0, bloomRecover: 0.1,
    move: 0.02, air: 0.05, ads: 0.5, mag: 1, reload: 0.85, auto: false, recoil: 0.03, falloff: [999, 1000, 1], pref: 18,
  },
  // 3点バースト。1回押すと3発、次のバーストまで間が空く。跳ね上がりが強く扱いにくい
  famas: {
    name: 'FAMAS', model: 'famas', dmg: 15, head: 1.5, rate: 0.38, burst: 3, burstGap: 0.065, spread: 0.017, bloomShot: 0.013, bloomMax: 0.05, bloomRecover: 0.11,
    move: 0.035, air: 0.09, ads: 0.45, mag: 24, reload: 2.1, auto: false, recoil: 0.03, falloff: [18, 38, 0.65], pref: 14,
  },
  mgl: {
    name: 'MGL', model: 'mgl', kind: 'grenade', dmg: 50, knock: 16, lift: 18, self: 0.1, radius: 4.6, speed: 36, gravity: 9, fuse: 3, rate: 0.75, spread: 0.012,
    bloomShot: 0, bloomMax: 0, bloomRecover: 0.1, move: 0.012, air: 0.025, ads: 0.6, mag: 6, reload: 3.2, auto: false, recoil: 0.045, falloff: [999, 1000, 1], pref: 13,
  },
  vector: {
    name: 'KRISS Vector', model: 'vector', dmg: 8.5, head: 1.4, rate: 0.05, spread: 0.026, bloomShot: 0.005, bloomMax: 0.06, bloomRecover: 0.16,
    move: 0.03, air: 0.1, ads: 0.5, mag: 30, reload: 1.8, auto: true, recoil: 0.006, falloff: [6, 18, 0.45], pref: 8,
  },
  m4: {
    name: 'M4A1', model: 'm4', dmg: 13, head: 1.5, rate: 0.09, spread: 0.012, bloomShot: 0.004, bloomMax: 0.028, bloomRecover: 0.15,
    move: 0.026, air: 0.08, ads: 0.42, mag: 30, reload: 2.0, auto: true, recoil: 0.008, falloff: [22, 45, 0.72], pref: 15,
  },
  // 3発バースト（銀）。1発が重く、撃つほど上に跳ねる癖の強い銃。burstGap: バースト内の間隔
  burst: {
    name: 'ベレッタ 93R', model: 'burst', dmg: 26, head: 1.6, rate: 0.42, burst: 3, burstGap: 0.07, spread: 0.016, bloomShot: 0.02, bloomMax: 0.06, bloomRecover: 0.1,
    move: 0.035, air: 0.09, ads: 0.4, scopeSize: 0.4, scopeSway: 1, reticle: 'dot', mag: 15, reload: 1.6, auto: false, recoil: 0.034, falloff: [15, 35, 0.6], pref: 11,
  },
  // ナイフ（全員が持つ）：目の前を切りつける。ダメージは弱め、背中からは back 倍
  // range: 届く距離(m) / cone: 当たる向きの広さ(内積) / moveMul: 持っている間の移動の速さの倍率
  knife: {
    name: 'カランビット', model: 'karambit', kind: 'melee', dmg: 30, back: 1.5, range: 2.3, cone: 0.8, moveMul: 1.1, head: 1,
    rate: 0.5, spread: 0, bloomShot: 0, bloomMax: 0, bloomRecover: 1, move: 0, air: 0, ads: 1, mag: 1, reload: 0.1, auto: true, recoil: 0, falloff: [999, 1000, 1], pref: 2,
  },
  // 刀（侍）：連打で1段目（袈裟斬り＋飛ぶ斬撃）をくり返し、長押しで4段目まで続ける（段ごとの動きと威力は sword.ts の STAGES）
  //   wave*: 1段目で飛ぶ斬撃（中距離用） / range・cone: 刀が届く距離・向きの広さ
  katana: {
    name: '刀', model: 'katana', kind: 'sword', dmg: 30, head: 1, range: 2.9, cone: 0.72, moveMul: 1.05,
    waveDmg: 16, waveSpeed: 45, waveRange: 50, waveR: 0.5,
    rate: 0.3, spread: 0, bloomShot: 0, bloomMax: 0, bloomRecover: 1, move: 0, air: 0, ads: 1, mag: 1, reload: 0.1, auto: true, recoil: 0, falloff: [999, 1000, 1], pref: 3,
  },
  // 連射で押し切る。近〜中距離
  smg: {
    name: 'MP5K', model: 'mp5', dmg: 10, head: 1.4, rate: 0.075, spread: 0.028, bloomShot: 0.006, bloomMax: 0.063, bloomRecover: 0.15,
    move: 0.035, air: 0.11, ads: 0.5, mag: 30, reload: 1.7, auto: true, recoil: 0.008, falloff: [10, 28, 0.55], pref: 9,
  },
  // 弓：長押しで引き絞り、離して撃つ。引くほど速く・強く・まっすぐ。矢は重力で落ちる
  // dmgMin〜dmg: 引き具合で変わるダメージ / drawTime: 引き切るまでの秒 / speedMin〜speedMax: 矢の速さ / drawSpread: 引きが浅いときのブレ
  bow: {
    // drag: 空気抵抗（遠くほど失速して落ちる）。引きの効き方はマイクラと同じ曲線（少し引くだけでも威力が出る）
    name: '和弓', model: 'bow', kind: 'bow', dmgMin: 12, dmg: 58, head: 1.6, drawTime: 0.75, speedMin: 20, speedMax: 76, gravity: 10, drag: 0.02,
    rate: 0.15, spread: 0.002, drawSpread: 0.03, bloomShot: 0, bloomMax: 0, bloomRecover: 0.1,
    move: 0.012, air: 0.03, ads: 0.6, mag: 1, reload: 0.45, auto: false, recoil: 0.012, falloff: [999, 1000, 1], pref: 16,
  },
  // 覗き込むとスコープ（zoom: 覗いたときの視野）。覗かないとほぼ当たらない（hip：覗いていないときだけ足すブレ）
  // scopeSize：覗き切ったときのスコープの外枠の大きさ（画面の縦の半分に対する割合）/ scopeSway：覗いているときの揺れの倍率 / crossInf：1 なら十字も赤い点と同じく遠くを指す（0 は枠と一緒に揺れる）
  // reticle：照準の模様（cross 十字＋赤い点 / ring 赤い点＋輪 / dot 赤い点だけ）
  sniper: {
    name: 'マークスマン Mk2', model: 'mk2', dmg: 68, head: 1.8, rate: 1.3, adsSpeed: 10, spread: 0.08, hip: 0.04, bloomShot: 0, bloomMax: 0, bloomRecover: 0.1,
    move: 0.06, air: 0.15, ads: 0.02, zoom: 22, scopeSize: 0.9, scopeSway: 1, crossInf: 0, reticle: 'cross', mag: 5, reload: 2.4, auto: false, recoil: 0.07, falloff: [999, 1000, 1], pref: 26,
  },
  // 万能の連射銃（王向け）
  ar: {
    name: 'AK-47', model: 'ak', dmg: 15, head: 1.5, rate: 0.1, spread: 0.015, bloomShot: 0.005, bloomMax: 0.035, bloomRecover: 0.14,
    move: 0.028, air: 0.08, ads: 0.45, scopeSize: 0.5, scopeSway: 1, reticle: 'ring', mag: 30, reload: 2.0, auto: true, recoil: 0.012, falloff: [20, 40, 0.7], pref: 14,
  },
  // 放物線で飛び、跳ねて爆発。radius: 爆風の範囲 / fuse: 爆発までの秒 / speed: 撃ち出す速さ
  launcher: {
    // knock: 横に吹き飛ばす強さ / lift: 上に飛ばす強さ / self: 自分へのダメージ倍率
    name: 'M79', model: 'm79', kind: 'grenade', dmg: 65, knock: 20, lift: 22, self: 0.1, radius: 5.5, speed: 38, gravity: 9, fuse: 3, rate: 0.9, spread: 0.01,
    bloomShot: 0, bloomMax: 0, bloomRecover: 0.1, move: 0.01, air: 0.02, ads: 0.6, mag: 4, reload: 2.6, auto: false, recoil: 0.05, falloff: [999, 1000, 1], pref: 13,
  },
  // 近いほど強い。8粒 × 8 ダメージ
  shotgun: {
    name: 'M870', model: 'm870', dmg: 9, pellets: 8, head: 1.3, rate: 0.7, spread: 0.055, bloomShot: 0.01, bloomMax: 0.02, bloomRecover: 0.1,
    move: 0.01, air: 0.025, ads: 0.7, mag: 6, reload: 2.2, auto: false, recoil: 0.06, falloff: [7, 20, 0.25], pref: 6,
  },
};
export const SKILLS = {
  // cooldown：待ち時間（秒）。全体をもとの 3 倍にした
  // type: dash（前に飛び出す）/ guard（盾を構える）
  // 突撃：前方へ一気に踏み込む。突撃中は被ダメージ半減、ぶつかると体当たりダメージ
  charge: { name: '突撃', type: 'dash', key: 'KeyE', cooldown: 18, duration: 0.32, speed: 26, damageTaken: 0.5, ram: 18,
    help: '前方へダッシュ・被ダメ半減・体当たり' },
  // 身体強化：6秒間、足が速くなり高く跳べ、受けるダメージも減る（speedMul: 速さの倍率 / jumpMul: ジャンプの倍率）
  physical: { name: '身体強化', type: 'buff', key: 'KeyE', cooldown: 24, duration: 6, speedMul: 1.5, jumpMul: 1.45, damageTaken: 0.8,
    help: '6秒間、足が速く高く跳べ、被ダメ0.8倍' },
  // すり足：左右（A/D の向き）へ素早くステップ。2回まで続けて使える
  step: { name: 'すり足', type: 'step', key: 'KeyE', cooldown: 9, charges: 2, duration: 0.16, speed: 22, damageTaken: 1,
    help: 'A/Dの方向へ素早くステップ（2回まで）' },
  // 追尾：次に放つ1本が相手を追いかける（物陰の裏にも回り込む）
  // speed: 追尾の矢の速さ（速いと曲がり切れないので抑える）
  homing: { name: '追尾', type: 'homing', key: 'KeyE', cooldown: 30, duration: 6, turn: 7, speed: 30, damageTaken: 1,
    help: '次の1本が相手を追いかける' },
  // 桂跳び：斜め前へ大ジャンプ。着地の衝撃で周りを吹き飛ばす（up: 上へ / fwd: 前へ / radius, dmg: 衝撃）
  leap: { name: '桂跳び', type: 'leap', key: 'KeyE', cooldown: 24, duration: 2.5, up: 12, fwd: 11, radius: 3.5, dmg: 25, damageTaken: 1,
    help: '斜め前へ大ジャンプ・着地で周りを吹き飛ばす' },
  // 煙幕：その場に煙を張って視界を遮る
  smoke: { name: '煙幕', type: 'smoke', cooldown: 36, duration: 0, radius: 5, life: 8, damageTaken: 1,
    help: 'その場に球の煙幕を張って視界を遮る' },
  // 透明化：しばらく姿が消える（足音は聞こえる）。自分が攻撃すると解除
  cloak: { name: '透明化', type: 'cloak', cooldown: 42, duration: 5, damageTaken: 1, help: '5秒間 透明になる（攻撃すると解除）' },
  // 透視：しばらく壁越しに相手が見える
  xray: { name: '透視', type: 'xray', cooldown: 42, duration: 6, damageTaken: 1, help: '6秒間 壁越しに相手が見える' },
  // C4：足元近くにポイと置く（物や駒に貼りつく）。もう一度押すと爆発。近いと即死級。置いて3秒で相手から見えなくなる
  // throw: 投げる速さ / hideAfter: 相手から見えなくなるまでの秒
  c4: { name: 'C4', type: 'c4', cooldown: 36, duration: 0, dmg: 180, radius: 4.5, knock: 12, lift: 7, self: 0.4, throw: 5, hideAfter: 3, damageTaken: 1,
    help: '近くにポイと置く・もう一度押すと爆発（近いと即死級）' },
  // EMP：グレネードのように投げ、当たった所で大きな球の EMP が一瞬広がる。巻き込んだ相手は disable 秒スキルが使えず（使っている最中のスキルも切れる）、足も slow 倍に遅くなる
  //   相手のタレット歩も止まる。speed: 投げる速さ / radius: 球の半径
  emp: { name: 'EMP', type: 'emp', cooldown: 30, duration: 0, speed: 22, radius: 7, disable: 5, slow: 0.6, damageTaken: 1,
    help: '投げて当たった所に EMP が広がる・巻き込んだ相手は5秒スキル封じ＆鈍足' },
  // ミサイル（CoD のプレデターミサイル風）：空の上から降ってくるミサイルを操作して当てる（その間 自分は無防備）
  // もう一度押すと自分に戻り、ミサイルはまっすぐ落ちる。height: 出てくる高さ / speed: 速さ
  missile: { name: 'ミサイル', type: 'missile', cooldown: 48, duration: 0, dmg: 75, radius: 4, knock: 10, lift: 6, self: 0.4, speed: 24, height: 60, life: 8, damageTaken: 1,
    help: '空から降るミサイルを操作して当てる（自分は無防備）・もう一度押すと戻る' },
  // 連射：次に放つと、同じ引きの強さで続けて合計 count 本（gap 秒おき）
  volley: { name: '連射', type: 'volley', cooldown: 36, duration: 10, count: 3, gap: 0.09, damageTaken: 1, help: '次に放つと、続けて合計3本の矢が飛ぶ' },
  // 木箱：目の前に物理で動く木箱を3つ置く（撃つと崩れる遮蔽。dist: 置く距離）
  boxes: { name: '木箱', type: 'boxes', cooldown: 36, duration: 0, count: 3, dist: 2.4, damageTaken: 1, help: '目の前に木箱を3つ置く（撃つと崩れる遮蔽）' },
  // 鉤縄：狙った壁や高台に縄を掛けて一気に引き寄せられる（range: 届く距離 / speed: 引かれる速さ）
  grapple: { name: '鉤縄', type: 'grapple', cooldown: 24, duration: 1.4, range: 35, speed: 26, damageTaken: 1,
    help: '狙った壁や高台へ縄を掛けて一気に引き寄せられる' },
  // 閃光弾：投げて少しして炸裂。見ていた相手（自分も）の目がくらむ（blind: くらむ最大秒数 / radius: 届く距離）
  flash: { name: '閃光弾', type: 'flash', cooldown: 36, duration: 0, fuse: 1.1, speed: 20, radius: 26, blind: 3, damageTaken: 1,
    help: '投げて約1秒後に炸裂。見ていた相手の目がくらむ（自分も注意）' },
  // エンダーパール：投げて落ちた所へ瞬間移動（selfDmg: 自分へのダメージ）
  pearl: { name: 'エンダーパール', type: 'pearl', cooldown: 24, duration: 0, speed: 24, selfDmg: 5, damageTaken: 1,
    help: '投げて落ちた所へ瞬間移動（自分に少しダメージ）' },
  // 衝撃波：自分のまわりに衝撃波。近いほど大ダメージで大きく吹き飛ぶ（knock: 横 / lift: 上）
  shock: { name: '衝撃波', type: 'shock', cooldown: 36, duration: 0, radius: 10, dmg: 45, knock: 32, lift: 15, damageTaken: 1,
    help: 'まわり10mに衝撃波。近いほど大ダメージで大きく吹き飛ぶ' },
  // タレット歩：目の前に動かない砲台を置く。相手が見えたら撃つ（hp: 耐久 / dmg: 1発 / rate: 撃つ間隔 / spread: ブレ / range: 届く距離）
  turret: { name: 'タレット歩', type: 'turret', cooldown: 30, duration: 0, hp: 30, dmg: 8, rate: 1.05, spread: 0.03, range: 40, damageTaken: 1,
    help: '目の前に動かないタレット歩を置く・相手が見えたら撃つ（HP30）' },
  // 瞬（侍）：押している間に溜め、離すと見ている向き（上下も）へ一気に飛ぶ。溜めた分だけ遠くへ（minDist〜maxDist m、chargeMax 秒で最大）
  //   speed：飛ぶ速さ / gap：前に相手がいたら、その手前（体の間のすき間 m）で止まる
  blink: { name: '瞬', type: 'blink', cooldown: 6, duration: 0, chargeMax: 3, minDist: 3.6, maxDist: 30, speed: 70, gap: 0.7, damageTaken: 1,
    help: '長押しで溜め、離すと見ている向きへ一瞬で飛ぶ（溜めるほど遠く・3秒で最大30m）' },
  // 葉隠れ（侍）：30 秒の間、動かず攻撃もしていなければ（0.25 秒止まると）姿が全く見えなくなる。動く・攻撃するとすぐ見える
  hagakure: { name: '葉隠れ', type: 'hagakure', cooldown: 45, duration: 30, still: 0.25, damageTaken: 1,
    help: '30秒間、動かず攻撃しなければ姿が全く見えなくなる' },
  // 影分身（侍）：まわり 6 方向に、自分と同じ動きをする分身を出す（撃たれると消える）。CPU は分身を本物と思い込むことがある
  clone: { name: '影分身', type: 'clone', cooldown: 45, duration: 8, count: 6, radius: 2.4, damageTaken: 1,
    help: 'まわり6方向に、自分と同じ動きをする分身を8秒出す（撃たれると消える）' },
  // 大玉：次のグレネードが大きくなり、敵も自分も大きく吹き飛ばす（knock: 吹き飛ばす強さ）
  bigshot: { name: '大玉', type: 'bigshot', cooldown: 36, duration: 10, radius: 5.5, knock: 38, lift: 22, damageTaken: 1,
    help: '次のグレネードが巨大に・敵も自分も吹き飛ばす' },
  // 王の意地：短時間でHPを回復し、その間は被ダメージ軽減
  rally: { name: '王の意地', type: 'heal', key: 'KeyE', cooldown: 42, duration: 2, amount: 60, damageTaken: 0.7,
    help: '2秒でHPを60回復・その間の被ダメ0.7倍' },
  // 守りの構え：将棋盤を盾にして、前からのダメージを減らす。構え中は遅く、撃つと解除
  guard: { name: '守りの構え', type: 'guard', key: 'KeyE', cooldown: 27, duration: 5, damageTaken: 0.1, slow: 0.55,
    help: '盾を構えて前からの被ダメ1/10・撃つと解除' },
  // ---------- 成駒のスキル ----------
  dual: { name: '早撃ち', type: 'dual', cooldown: 28, duration: 4, rateMul: 0.7, spreadAdd: 0.012, damageTaken: 1, help: '4秒間 2丁持ち。左右交互に撃てて連射が少し速くなる・弾も2丁分（覗き込めない）' },
  roll: { name: '前転', type: 'roll', cooldown: 10, duration: 0.42, speed: 11, damageTaken: 0.5, help: '押した方向へ前転（被ダメ半分）。転がり終わるとリロードも済む' },
  pierce: { name: '貫通', type: 'pierce', cooldown: 24, duration: 12, walls: 2, wallMul: 0.7, damageTaken: 1, help: '次の1発が壁を2枚まで抜ける。1枚ごとにダメージ3割減（頭も同じ）' },
  // stepRange：足音が見える距離（足音が聞こえる距離のおよそ8割）・shotRange：銃声が見える距離
  hearing: { name: '聴覚強化', type: 'hearing', cooldown: 30, duration: 20, stepRange: 24, shotRange: 120, damageTaken: 1,
    help: '20秒間、相手の足音・銃声がした向きを照準のまわりに出す（足音は白・銃声は金）' },
  poison: { name: '毒矢', type: 'poison', cooldown: 24, duration: 12, dot: 10, time: 5, slow: 0.6, damageTaken: 1, help: '次の矢に毒。当たると5秒で50じわじわ減り足が遅くなる（毒では体力1までしか減らない）' },
  multishot: { name: '拡散', type: 'multishot', cooldown: 30, duration: 8, count: 3, angle: 0.12, damageTaken: 1, help: '8秒間、矢を3本ずつ扇形に放つ' },
  medkit: { name: '救急キット', type: 'medkit', cooldown: 30, duration: 1.5, amount: 50, damageTaken: 1, help: '1.5秒かけて体力を50回復。その間は走れない。撃つ・跳ぶ・スキルを使うと中断（中断したら使わなかったことになる）' },
  dome: { name: 'ドーム', type: 'dome', cooldown: 36, duration: 6, radius: 3.6, damageTaken: 1, help: 'まわりに6秒、弾を通さないドームを張る（中から外へも撃てない）' },
  mine: { name: '地雷', type: 'mine', cooldown: 14, duration: 15, dmg: 100, radius: 4, arm: 1, delay: 0.5, trigger: 2.2, see: 3, max: 12, damageTaken: 1,
    help: '次の弾が着弾した所に地雷が残る。1秒で起動し、相手が近づくとピッと鳴って0.5秒後に爆発（真ん中で100）。12個まで・試合中ずっと残る' },
  smoke2: { name: '煙幕', type: 'smoke', cooldown: 30, duration: 0, radius: 5, life: 8, damageTaken: 1, help: 'その場に球の煙幕を張る' },
  grapple2: { name: '鉤縄', type: 'grapple', charges: 2, chain: true, cooldown: 20, duration: 1.4, range: 35, speed: 26, damageTaken: 1,
    help: '2回まで。引き寄せられている途中でもう一度使うと、縄を掛け替えて勢いのまま向きを変える' },
  flare: { name: 'フレア弾', type: 'flare', cooldown: 30, duration: 0, speed: 11, radius: 26, burn: 3, bright: 0.5, blind: 1.2, damageTaken: 1, help: 'フレアガンで光の弾を撃つ。光りながらまっすぐ3秒進んで消える。撃って0.5秒後からまぶしくなり、光を見ると目がくらむ（自分も）' },
  // 発煙筒を投げ、落ちた所のまわり（area m）に time 秒、count 発の砲弾がばらばらに降る。自分が巻き込まれたときは self 倍
  airstrike: { name: '空爆要請', type: 'airstrike', cooldown: 50, duration: 0, speed: 32, delay: 2, time: 6, count: 30, area: 8, dmg: 32, radius: 3.8, knock: 6, lift: 5, self: 0.25, damageTaken: 1,
    help: 'キーを押している間は投げる線が出て、離すと発煙筒を投げる。2秒後、落ちた所のまわり8mに6秒間砲弾が降り続ける（自分が巻き込まれても少ししか減らない）' },
  tornado: { name: '竜巻', type: 'tornado', cooldown: 30, duration: 1.1, radius: 8, pull: 16, lift: 3, damageTaken: 1, help: 'まわり8mの相手を1秒ほど自分の方へ引き寄せる' },
};
export const skillType = e => SKILLS[e.def.skill].type;
export const DIFFS = {
  // react: 見つけてから撃つまで / err: 狙いのブレ / track: 照準の追従の速さ / gap: 撃つ間隔の追加ランダム / lead: 矢の偏差撃ちの正確さ / pred: 動く相手への照準の遅れを先読みで埋める割合 / dps: 1発が重い武器の撃つペースの上限（1秒あたりのダメージの目安）
  easy:   { name: 'かんたん',   react: 0.7,  err: 0.13,  track: 3.5, gap: [0.35, 0.7], lead: 0.3, dps: 18 },
  normal: { name: 'ふつう',     react: 0.45, err: 0.09,  track: 5.5, gap: [0.22, 0.5], lead: 0.65, dps: 28 },
  hard:   { name: 'むずかしい', react: 0.18, err: 0.035, track: 14,  gap: [0.04, 0.18], lead: 1, dps: 55, pred: 1 },
  // 鬼畜：数値に加えて、頭を狙う（aimH）・よける・隙を突く・耳と勘がいい（oni）
  oni:    { name: '鬼畜',       react: 0.1,  err: 0.018, track: 22,  gap: [0.02, 0.1], lead: 1, dps: 80, pred: 1, aimH: 0.86, oni: true },
};
// H: アリーナ全体の半分の広さ / BH: 中央の将棋盤の半分の広さ / GROUND: 外周の地面の高さ（盤の上は 0）
export const H = 66, BH = 22, GROUND = -1.5, G = 22, TIME_LIMIT = 120;

// ---------- 設定 ----------
export const settings = { sens: 1, diff: 'normal', vol: 0.7, quality: 'mid', autoRes: true, showFps: false, myPiece: 'P', foePiece: 'P', map: 'valley', dark: 'scary' };
try { Object.assign(settings, JSON.parse(localStorage.getItem('shogifps') || '{}')); } catch (e) {}
// キー割り当て（e.code）。マウスの撃つ・覗き込みは固定
export const KEY_ACTIONS: [string, string][] = [
  ['forward', '前'], ['back', '後ろ'], ['left', '左'], ['right', '右'], ['run', '走る（押している間）'], ['jump', 'ジャンプ（壁に向かって長押しで登る）'],
  ['reload', 'リロード'], ['skill', 'スキル1'], ['skill2', 'スキル2'], ['weapon1', '武器1（ナイフ）'], ['weapon2', '武器2（メイン）'], ['inspect', '武器を眺める'], ['fullscreen', 'フルスクリーン'],
];
export const DEFAULT_KEYS = { forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', run: 'ShiftLeft', jump: 'Space', reload: 'KeyR', skill: 'KeyE', skill2: 'KeyQ', weapon1: 'Digit1', weapon2: 'Digit2', inspect: 'KeyV', fullscreen: 'KeyF' };
(settings as any).keys = Object.assign({}, DEFAULT_KEYS, (settings as any).keys || {});
// 開発者メニュー：hiddenMaps 未公開マップを選べる / aimKey オートエイムのキー（'' はなし）
(settings as any).dev = Object.assign({ hiddenMaps: false, aimKey: '', special: false }, (settings as any).dev || {});
export const DEV_PASSWORD = '5173';
// e.code を読みやすい名前に
export const keyName = (code: string) => ({ Mouse1: 'ホイールボタン', Mouse3: 'マウス戻る', Mouse4: 'マウス進む', Space: 'Space', ShiftLeft: '左Shift', ShiftRight: '右Shift', ControlLeft: '左Ctrl', ControlRight: '右Ctrl', AltLeft: '左Alt', AltRight: '右Alt', Tab: 'Tab', CapsLock: 'CapsLock', Backquote: '`' } as any)[code]
  || code.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Numpad/, 'テンキー').replace(/^Arrow/, '矢印');
export const saveSettings = () => { try { localStorage.setItem('shogifps', JSON.stringify(settings)); } catch (e) {} };
// 画質（pr: 描画解像度の倍率 / shadow: 影の解像度, 0 で影なし / aa: アンチエイリアス）
export const QUALITIES = {
  low:  { name: '低', pr: 0.7,  shadow: 0,    aa: false },
  mid:  { name: '中', pr: 1,    shadow: 1024, aa: false, shadowEvery: 3 },
  high: { name: '高', pr: Math.min(devicePixelRatio, 2), shadow: 2048, aa: true, soft: true },
};
export const Q = QUALITIES[settings.quality] || QUALITIES.mid;
export const QUALITY_AT_LOAD = settings.quality;
