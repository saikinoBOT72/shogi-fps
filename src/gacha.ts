// ガチャ画面（物理演算つきの演出）
//   1 引いた瞬間：将棋の初形に並んだ盤が、続けざまに大爆発。駒が吹き飛び、同時に空から駒が降ってくる（結果の駒もまぎれている）
//   2 結果の駒が決まった所（1連は真ん中、10連は円に並ぶ）へ弧を描いて飛んできて、くるくる回って表向きに着地。
//     着地の瞬間にまわりの駒を吹き飛ばす。表の字（歩・銀・金・王）と光の柱
//   3 銃の登場（レア度の低い順に1つずつ）：駒が宙に持ち上がって割れ、木のかけらが飛び散り、色のない銃が上から落ちて盤で跳ね、宙に浮いて回る
//     銃が浮くと後ろが暗くなる。後ろから前へ色が塗られ、その色の絵の具が飛び散る
//   4 LR：盤が真っ二つに割れ、下から光の柱と共に銃がせり上がる。塗り終わると金の小判と金の駒が降って積もり、
//     打ち上げ花火、カメラが銃のまわりを回り込む（画面が暗くなり、舞う光と銃口の光で連射）
// クリックで次へ・スキップはどこでも使える。音は仮（あとで試聴ウィジェットで選ぶ）
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { P } from './palette';
import { $, BH, LIGHT } from './core';
import { GUN_BUILDERS, boardTex, darkWoodTex, handMat, makePiece, pieceWoodMat, toon } from './render';
import { DESIGNS, RARITY, SKINS, gachaColors } from './guns/skins';
import { Loadout, Owned, PULL_COST, RATES, canSpend, equipItem, itemName, modelOf, paintGun, pointsText, pull, seedHex, weaponName } from './loadout';
import { SFX } from './audio';
import { VM } from './effects';
import { paintActors } from './game';
import { overlay } from './screens';
import { gs } from './state';
import { showInventory } from './inventory';
import { questEvent, questsActive } from './quests';
import { RAR_COL, RAR_CH, RANK, hex, esc, rarOf, wait, rand, flow } from './gacha/common';
import { Scene } from './gacha/scene';

let back: () => void = () => {};
let results: Owned[] = [], lastN: 1 | 10 = 1, pick = 0;

export function showGacha(onBack: () => void) {
  back = onBack; flow.phase = 'top'; flow.runId++;
  frame(`
    <div class="ga-panel">
      <div class="ga-rates">${RATES.slice().reverse().map(([r, p]) => `<span class="r-${r}"><b>${r}</b>${p}%</span>`).join('')}</div>
      <div class="ga-btns">
        <button class="btn white ga-pull" id="gaOne"${canSpend(PULL_COST[1]) ? '' : ' disabled'}><b>1連</b><small>${PULL_COST[1]} ポイント</small></button>
        <button class="btn ga-pull ten" id="gaTen"${canSpend(PULL_COST[10]) ? '' : ' disabled'}><b>10連</b><small>${PULL_COST[10]} ポイント</small></button>
      </div>
      <p class="note">形はデザインから、色は毎回まったくのランダム。強さには関わりません</p>
      ${questsActive() ? '' : '<p class="note ga-login">ポイントは、ログインするとログインボーナスとクエストでもらえます</p>'}
    </div>`);
  on('gaOne', () => start(1));
  on('gaTen', () => start(10));
  Scene.idle();
}

// 画面の枠：全面の 3D と、上の見出し
function frame(inner: string, cls = '') {
  overlay(`<div class="ga ${cls}" id="ga">
    <div class="ga-dark"></div>
    <div class="ga-view" id="gaView"></div>
    <header class="ga-head"><h2 class="h">ガチャ</h2><div class="pts"><small>ポイント</small><b>${pointsText()}</b></div>
      <button class="btn sub" id="gaInv">持ち物</button><button class="btn sub" id="gaBack">戻る</button></header>
    ${inner}
  </div>`, true);
  Scene.mount($('gaView'));
  on('gaBack', () => { flow.runId++; Scene.hide(); back(); });
  on('gaInv', () => { flow.runId++; Scene.hide(); showInventory(() => showGacha(back)); });
  $('ga').onclick = e => { e.stopPropagation(); if (flow.advance) { const f = flow.advance; flow.advance = null; f(); } };
}
const on = (id: string, fn: () => void) => { const el = $(id); if (el) el.onclick = e => { e.stopPropagation(); fn(); }; };

async function start(n: 1 | 10) {
  const got = pull(n);
  if (!got) return;
  questEvent('gacha', n);
  results = got; lastN = n;
  // レア度の低い順に見せる（高い物ほど後で）。結果の画面は、いちばん良い物を見せて始める
  const order = results.map((_, i) => i).sort((a, b) => RANK[rarOf(results[a])] - RANK[rarOf(results[b])]);
  pick = order[order.length - 1];
  const my = ++flow.runId;
  flow.phase = 'drop';
  frame(`<button class="btn sub ga-skip" id="gaSkip">スキップ</button>`);
  on('gaSkip', () => { flow.runId++; showResults(); });
  await Scene.drop(results, order, my);
  if (my !== flow.runId) return;
  for (let k = 0; k < order.length; k++) {
    if (my !== flow.runId) return;
    await reveal(order[k], k, my);
  }
  if (my === flow.runId) showResults();
}

// 1つずつ見せる：駒が割れて銃が出る → 白黒の銃に色が塗られる → 名前が出る → クリックで次へ
async function reveal(i: number, k: number, my: number) {
  const it = results[i], r = rarOf(it), d = DESIGNS[it.base];
  flow.phase = 'reveal';
  frame(`<div class="ga-cap r-${r}" id="gaCap"></div>
    <div class="ga-count">${results.length > 1 ? `${k + 1} / ${results.length}` : ''}</div>
    <button class="btn sub ga-skip" id="gaSkip">${results.length > 1 ? 'スキップ' : '結果へ'}</button>`, r === 'LR' ? 'lr' : '');
  on('gaSkip', () => { flow.runId++; showResults(); });
  await Scene.paint(it, my);
  if (my !== flow.runId) return;
  const cols = gachaColors(it.seed, d.colors.length);
  $('gaCap').innerHTML = `<div class="ga-rar"><b>${r}</b><span>${RARITY[r]}</span></div>
    <div class="ga-name">${esc(itemName(it))}</div>
    <div class="ga-sub">${esc(d.name)}　<span class="inv-sw">${cols.map(c => `<i style="background:${hex(c)}"></i>`).join('')}</span></div>
    <p class="note">クリックで${k + 1 < results.length ? '次へ' : '結果へ'}</p>`;
  $('gaCap').classList.add('show');
  await new Promise<void>(res => { flow.advance = res; });
}

// 結果：引いたものを札で並べる。選んだ銃が回り、装備できる
function showResults() {
  flow.phase = 'result'; flow.advance = null;
  const it = pick >= 0 ? results[pick] : null, m = it && modelOf(it), eq = it && Loadout.equip[m] === it.id;
  const card = (x: Owned, i: number) => {
    const r = rarOf(x), cols = gachaColors(x.seed, DESIGNS[x.base].colors.length);
    return `<button class="inv-card r-${r}${i === pick ? ' sel' : ''}${Loadout.equip[modelOf(x)] === x.id ? ' eq' : ''}" data-i="${i}">
      <span class="inv-sw">${cols.map(c => `<i style="background:${hex(c)}"></i>`).join('')}</span><em>${r}</em>
      <b>${esc(itemName(x))}</b><small>${esc(DESIGNS[x.base].name)}・${wName(modelOf(x))}</small>
      ${Loadout.equip[modelOf(x)] === x.id ? '<span class="inv-eq">装備中</span>' : ''}
    </button>`;
  };
  const r = it ? rarOf(it) : 'N';
  frame(`<div class="ga-result r-${r}">
      ${it ? `<div class="ga-cap show"><div class="ga-rar"><b>${r}</b><span>${RARITY[r]}</span></div>
        <div class="ga-name">${esc(itemName(it))}</div><div class="ga-sub">${esc(DESIGNS[it.base].name)}・${wName(m)}・番号 ${seedHex(it.seed)}</div>
        <div class="inv-acts"><button class="btn" id="gaEquip"${eq ? ' disabled' : ''}>${eq ? '装備中' : '装備する'}</button></div></div>`
        : `<div class="ga-cap show"><p class="note">札を選ぶと、その銃を近くで見て装備できます</p></div>`}
      <div class="ga-list"><div class="inv-grid ${results.length > 1 ? 'ten' : ''}">${results.map(card).join('')}</div>
        <div class="ga-btns">
          <button class="btn ga-pull" id="gaAgain"${canSpend(PULL_COST[lastN]) ? '' : ' disabled'}><b>もう一回 ${lastN}連</b><small>${PULL_COST[lastN]} ポイント</small></button>
          <button class="btn sub" id="gaTop">ガチャの最初へ</button>
        </div></div>
    </div>`, 'result');
  document.querySelectorAll<HTMLElement>('.ga-list .inv-card').forEach(b => b.onclick = e => { e.stopPropagation(); pick = +b.dataset.i; showResults(); });
  on('gaEquip', () => { equipItem(m, it.id); VM.applyLoadout(); paintActors(); showResults(); });
  on('gaAgain', () => start(lastN));
  on('gaTop', () => showGacha(back));
  if (it) Scene.showcase(it);
}
const wName = weaponName;
