# 将棋FPS

駒を取るとき、FPSの撃ち合いで決着する将棋。今は「駒 vs 駒」の撃ち合い部分を作っている。

## 遊び方

`index.html` をダブルクリックしてブラウザで開く。

開発中は `node tools/serve.js` で http://localhost:8123 からも開ける。

## ファイル構成

読み込み順＝実行順（普通の `<script>` なので、上のファイルで定義したものを下のファイルで使う）。

| ファイル | 中身 |
|---|---|
| `js/core.js` | 共通の道具、**駒・武器・スキル・CPUの強さのデータ**、設定 |
| `js/audio.js` | 効果音（Web Audio で合成） |
| `js/render.js` | レンダラー、空、光、テクスチャ、駒と銃の形 |
| `js/world.js` | 盤、背景、動かない障害物と当たり判定 |
| `js/physics.js` | 物理演算で動く小物（cannon.js） |
| `js/effects.js` | 破片・弾痕・光跡・ダメージ数字、一人称の銃、駒のキャラクター |
| `js/input.js` | キーボード・マウス・フルスクリーン |
| `js/game.js` | ゲーム状態、移動、武器、プレイヤー |
| `js/ai.js` | CPU |
| `js/hud.js` | 勝敗、HUD |
| `js/camera.js` | カメラと一人称の銃の動き |
| `js/screens.js` | タイトル・一時停止・結果画面 |
| `js/main.js` | メインループ |
