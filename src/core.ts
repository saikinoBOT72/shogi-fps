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
  P: { name: '歩', value: 1, hp: 90,  size: 0.8,  speed: 7.2, jump: 7.5, weapon: 'pistol',   skills: ['step', 'cloak'] },
  L: { name: '香', value: 3, hp: 95,  size: 0.85, speed: 6.8, jump: 7,   weapon: 'sniper',   skills: ['xray', 'boxes'], strafe: 0.7 },
  N: { name: '桂', value: 4, hp: 100, size: 0.85, speed: 7,   jump: 9,   weapon: 'bow',      skills: ['homing'] },
  S: { name: '銀', value: 5, hp: 110, size: 0.85, speed: 7,   jump: 7.5, weapon: 'burst',    skills: ['c4', 'missile'] },
  G: { name: '金', value: 6, hp: 120, size: 0.9,  speed: 6.2, jump: 7,   weapon: 'shotgun',  skills: ['charge', 'guard'] },
  B: { name: '角', value: 8, hp: 125, size: 0.95, speed: 6.3, jump: 7,   weapon: 'launcher', skills: ['smoke', 'bigshot'] },
  R: { name: '飛', value: 10, hp: 130, size: 0.95, speed: 6.5, jump: 7,  weapon: 'smg',      skills: ['grapple', 'flash'] },
  // 王は取られたら負けの駒。価値は ∞（99 以上は ∞ と表示）
  K: { name: '王', value: 99, hp: 150, size: 1.0, speed: 6.2, jump: 7,   weapon: 'ar',       skills: ['pearl', 'shock'] },
};
// 全体のルール：しばらく被弾しないとHPが回復する
// speed: 走る速さの倍率（駒の speed に掛ける）、walk: 歩く速さ（走りに対する割合）
export const RULES = { regenDelay: 5, regenRate: 12, speed: 0.8, walk: 0.6 };
export const WEAPONS = {
  // dmg: ダメージ / head: 頭の倍率 / rate: 連射間隔 / spread: 基本ブレ / bloom*: 連射でブレが広がる量
  // move/air: 移動中・空中のブレ / ads: 右クリック時のブレ倍率 / recoil: 反動 / falloff: [減衰開始, 最大減衰距離, 最小倍率]
  // model: 見た目 / pellets: 1回に出る弾の数
  pistol: {
    name: 'ハンドガン', model: 'pistol', dmg: 24, head: 1.6, rate: 0.24, spread: 0.006, bloomShot: 0.012, bloomMax: 0.045, bloomRecover: 0.12,
    move: 0.014, air: 0.04, ads: 0.35, mag: 12, reload: 1.3, auto: false, recoil: 0.022, falloff: [18, 40, 0.7], pref: 12,
  },
  // 3発バースト（銀）。1発が重く、撃つほど上に跳ねる癖の強い銃。burstGap: バースト内の間隔
  burst: {
    name: 'ベレッタ 93R', model: 'burst', dmg: 22, head: 1.6, rate: 0.55, burst: 3, burstGap: 0.07, spread: 0.008, bloomShot: 0.02, bloomMax: 0.06, bloomRecover: 0.1,
    move: 0.016, air: 0.04, ads: 0.4, mag: 15, reload: 1.6, auto: false, recoil: 0.034, falloff: [15, 35, 0.6], pref: 11,
  },
  // ナイフ（全員が持つ）：目の前を切りつける。ダメージは弱め、背中からは back 倍
  // range: 届く距離(m) / cone: 当たる向きの広さ(内積) / moveMul: 持っている間の移動の速さの倍率
  knife: {
    name: 'カランビット', model: 'karambit', kind: 'melee', dmg: 30, back: 1.5, range: 2.3, cone: 0.8, moveMul: 1.1, head: 1,
    rate: 0.5, spread: 0, bloomShot: 0, bloomMax: 0, bloomRecover: 1, move: 0, air: 0, ads: 1, mag: 1, reload: 0.1, auto: true, recoil: 0, falloff: [999, 1000, 1], pref: 2,
  },
  // 連射で押し切る。近〜中距離
  smg: {
    name: 'MP5K', model: 'mp5', dmg: 10, head: 1.4, rate: 0.075, spread: 0.012, bloomShot: 0.004, bloomMax: 0.045, bloomRecover: 0.15,
    move: 0.012, air: 0.035, ads: 0.5, mag: 30, reload: 1.7, auto: true, recoil: 0.008, falloff: [10, 28, 0.55], pref: 9,
  },
  // 弓：長押しで引き絞り、離して撃つ。引くほど速く・強く・まっすぐ。矢は重力で落ちる
  // dmgMin〜dmg: 引き具合で変わるダメージ / drawTime: 引き切るまでの秒 / speedMin〜speedMax: 矢の速さ / drawSpread: 引きが浅いときのブレ
  bow: {
    // drag: 空気抵抗（遠くほど失速して落ちる）。引きの効き方はマイクラと同じ曲線（少し引くだけでも威力が出る）
    name: '和弓', model: 'bow', kind: 'bow', dmgMin: 12, dmg: 58, head: 1.6, drawTime: 0.75, speedMin: 16, speedMax: 62, gravity: 15, drag: 0.6,
    rate: 0.15, spread: 0.002, drawSpread: 0.03, bloomShot: 0, bloomMax: 0, bloomRecover: 0.1,
    move: 0.012, air: 0.03, ads: 0.6, mag: 1, reload: 0.45, auto: false, recoil: 0.012, falloff: [999, 1000, 1], pref: 16,
  },
  // 1発が重い6連発。空中でもほとんどブレない（桂向け）
  revolver: {
    name: 'リボルバー', model: 'revolver', dmg: 36, head: 1.8, rate: 0.42, spread: 0.006, bloomShot: 0.02, bloomMax: 0.05, bloomRecover: 0.12,
    move: 0.012, air: 0.004, ads: 0.4, mag: 6, reload: 2.0, auto: false, recoil: 0.04, falloff: [16, 35, 0.7], pref: 12,
  },
  // 覗き込むとスコープ（zoom: 覗いたときの視野）。覗かないとほぼ当たらない
  sniper: {
    name: 'マークスマン Mk2', model: 'mk2', dmg: 68, head: 1.8, rate: 1, adsSpeed: 10, spread: 0.05, bloomShot: 0, bloomMax: 0, bloomRecover: 0.1,
    move: 0.03, air: 0.08, ads: 0.02, zoom: 22, mag: 5, reload: 2.4, auto: false, recoil: 0.07, falloff: [999, 1000, 1], pref: 26,
  },
  // 万能の連射銃（王向け）
  ar: {
    name: 'AK-47', model: 'ak', dmg: 15, head: 1.5, rate: 0.1, spread: 0.008, bloomShot: 0.005, bloomMax: 0.035, bloomRecover: 0.14,
    move: 0.012, air: 0.035, ads: 0.45, mag: 30, reload: 2.0, auto: true, recoil: 0.012, falloff: [20, 40, 0.7], pref: 14,
  },
  // 放物線で飛び、跳ねて爆発。radius: 爆風の範囲 / fuse: 爆発までの秒 / speed: 撃ち出す速さ
  launcher: {
    // knock: 横に吹き飛ばす強さ / lift: 上に飛ばす強さ / self: 自分へのダメージ倍率
    name: 'M79', model: 'm79', kind: 'grenade', dmg: 35, knock: 20, lift: 14, self: 0.1, radius: 3.5, speed: 38, gravity: 9, fuse: 3, rate: 0.9, spread: 0.01,
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
  // ミサイル（CoD のプレデターミサイル風）：空の上から降ってくるミサイルを操作して当てる（その間 自分は無防備）
  // もう一度押すと自分に戻り、ミサイルはまっすぐ落ちる。height: 出てくる高さ / speed: 速さ
  missile: { name: 'ミサイル', type: 'missile', cooldown: 48, duration: 0, dmg: 75, radius: 4, knock: 10, lift: 6, self: 0.4, speed: 24, height: 60, life: 8, damageTaken: 1,
    help: '空から降るミサイルを操作して当てる（自分は無防備）・もう一度押すと戻る' },
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
  // 大玉：次のグレネードが大きくなり、敵も自分も大きく吹き飛ばす（knock: 吹き飛ばす強さ）
  bigshot: { name: '大玉', type: 'bigshot', cooldown: 36, duration: 10, radius: 5.5, knock: 38, lift: 22, damageTaken: 1,
    help: '次のグレネードが巨大に・敵も自分も吹き飛ばす' },
  // 王の意地：短時間でHPを回復し、その間は被ダメージ軽減
  rally: { name: '王の意地', type: 'heal', key: 'KeyE', cooldown: 42, duration: 2, amount: 60, damageTaken: 0.7,
    help: '2秒でHPを60回復・その間の被ダメ0.7倍' },
  // 守りの構え：将棋盤を盾にして、前からのダメージを減らす。構え中は遅く、撃つと解除
  guard: { name: '守りの構え', type: 'guard', key: 'KeyE', cooldown: 27, duration: 2.5, damageTaken: 0.1, slow: 0.55,
    help: '盾を構えて前からの被ダメ1/10・撃つと解除' },
};
export const skillType = e => SKILLS[e.def.skill].type;
export const DIFFS = {
  // react: 見つけてから撃つまで / err: 狙いのブレ / track: 照準の追従の速さ / gap: 撃つ間隔の追加ランダム / lead: 矢の偏差撃ちの正確さ / dps: 1発が重い武器の撃つペースの上限（1秒あたりのダメージの目安）
  easy:   { name: 'かんたん',   react: 0.7,  err: 0.13,  track: 3.5, gap: [0.35, 0.7], lead: 0.3, dps: 18 },
  normal: { name: 'ふつう',     react: 0.45, err: 0.09,  track: 5.5, gap: [0.22, 0.5], lead: 0.65, dps: 28 },
  hard:   { name: 'むずかしい', react: 0.28, err: 0.06,  track: 9,   gap: [0.08, 0.3], lead: 0.9, dps: 40 },
};
// H: アリーナ全体の半分の広さ / BH: 中央の将棋盤の半分の広さ / GROUND: 外周の地面の高さ（盤の上は 0）
export const H = 66, BH = 22, GROUND = -1.5, G = 22, TIME_LIMIT = 120;

// ---------- 設定 ----------
export const settings = { sens: 1, diff: 'normal', vol: 0.7, quality: 'mid', showFps: false, myPiece: 'P', foePiece: 'P', gunSkin: 'kurogane' };
try { Object.assign(settings, JSON.parse(localStorage.getItem('shogifps') || '{}')); } catch (e) {}
// キー割り当て（e.code）。マウスの撃つ・覗き込みは固定
export const KEY_ACTIONS: [string, string][] = [
  ['forward', '前'], ['back', '後ろ'], ['left', '左'], ['right', '右'], ['run', '走る（押している間）'], ['jump', 'ジャンプ（壁に向かって長押しで登る）'],
  ['reload', 'リロード'], ['skill', 'スキル1'], ['skill2', 'スキル2'], ['weapon1', '武器1（ナイフ）'], ['weapon2', '武器2（メイン）'], ['inspect', '武器を眺める'], ['fullscreen', 'フルスクリーン'],
];
export const DEFAULT_KEYS = { forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', run: 'ShiftLeft', jump: 'Space', reload: 'KeyR', skill: 'KeyE', skill2: 'KeyQ', weapon1: 'Digit1', weapon2: 'Digit2', inspect: 'KeyV', fullscreen: 'KeyF' };
(settings as any).keys = Object.assign({}, DEFAULT_KEYS, (settings as any).keys || {});
// e.code を読みやすい名前に
export const keyName = (code: string) => ({ Mouse1: 'ホイールボタン', Mouse3: 'マウス戻る', Mouse4: 'マウス進む', Space: 'Space', ShiftLeft: '左Shift', ShiftRight: '右Shift', ControlLeft: '左Ctrl', ControlRight: '右Ctrl', AltLeft: '左Alt', AltRight: '右Alt', Tab: 'Tab', CapsLock: 'CapsLock', Backquote: '`' } as any)[code]
  || code.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Numpad/, 'テンキー').replace(/^Arrow/, '矢印');
export const saveSettings = () => { try { localStorage.setItem('shogifps', JSON.stringify(settings)); } catch (e) {} };
// 画質（pr: 描画解像度の倍率 / shadow: 影の解像度, 0 で影なし / aa: アンチエイリアス）
export const QUALITIES = {
  low:  { name: '低', pr: 0.7,  shadow: 0,    aa: false },
  mid:  { name: '中', pr: 1,    shadow: 1024, aa: false, shadowEvery: 2 },
  high: { name: '高', pr: Math.min(devicePixelRatio, 2), shadow: 2048, aa: true, soft: true },
};
export const Q = QUALITIES[settings.quality] || QUALITIES.mid;
export const QUALITY_AT_LOAD = settings.quality;
