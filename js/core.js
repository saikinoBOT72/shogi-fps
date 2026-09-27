// 共通の道具・駒/武器/スキルのデータ・設定
'use strict';

const V3 = THREE.Vector3;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
const $ = id => document.getElementById(id);
const C = hex => new THREE.Color(hex).convertSRGBToLinear();

// ================= 駒データ（ここに駒を足していく） =================
// hp: 体力 / size: 大きさ（見た目・当たり判定・目線の高さ） / speed, jump: 機動力
const PIECES = {
  P: { name: '歩', hp: 80, size: 0.8, speed: 7, jump: 7.5, weapon: 'pistol', skill: 'charge' },
};
const WEAPONS = {
  // dmg: ダメージ / head: 頭の倍率 / rate: 連射間隔 / spread: 基本ブレ / bloom*: 連射でブレが広がる量
  // move/air: 移動中・空中のブレ / ads: 右クリック時のブレ倍率 / recoil: 反動 / falloff: [減衰開始, 最大減衰距離, 最小倍率]
  pistol: {
    name: 'ハンドガン', dmg: 22, head: 1.6, rate: 0.24, spread: 0.006, bloomShot: 0.012, bloomMax: 0.045, bloomRecover: 0.12,
    move: 0.014, air: 0.04, ads: 0.35, mag: 12, reload: 1.3, auto: false, recoil: 0.022, falloff: [18, 40, 0.7], pref: 12,
  },
};
const SKILLS = {
  // 突撃：前方へ一気に踏み込む。突撃中は被ダメージ半減、ぶつかると体当たりダメージ
  charge: { name: '突撃', key: 'KeyE', cooldown: 6, duration: 0.32, speed: 26, damageTaken: 0.5, ram: 18 },
};
const DIFFS = {
  // react: 見つけてから撃つまで / err: 狙いのブレ / track: 照準の追従の速さ / gap: 撃つ間隔の追加ランダム
  easy:   { name: 'かんたん',   react: 0.7,  err: 0.13,  track: 3.5, gap: [0.35, 0.7] },
  normal: { name: 'ふつう',     react: 0.45, err: 0.09,  track: 5.5, gap: [0.22, 0.5] },
  hard:   { name: 'むずかしい', react: 0.28, err: 0.06,  track: 9,   gap: [0.08, 0.3] },
};
const H = 22, G = 22, TIME_LIMIT = 90;

// ---------- 設定 ----------
const settings = { sens: 1, diff: 'normal', vol: 0.7, quality: 'mid', showFps: false };
try { Object.assign(settings, JSON.parse(localStorage.getItem('shogifps') || '{}')); } catch (e) {}
const saveSettings = () => { try { localStorage.setItem('shogifps', JSON.stringify(settings)); } catch (e) {} };
// 画質（pr: 描画解像度の倍率 / shadow: 影の解像度, 0 で影なし / aa: アンチエイリアス）
const QUALITIES = {
  low:  { name: '低', pr: 0.75, shadow: 0,    aa: false },
  mid:  { name: '中', pr: 1,    shadow: 1024, aa: true },
  high: { name: '高', pr: Math.min(devicePixelRatio, 2), shadow: 2048, aa: true, soft: true },
};
const Q = QUALITIES[settings.quality] || QUALITIES.mid;
const QUALITY_AT_LOAD = settings.quality;
