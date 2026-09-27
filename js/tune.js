// 調整パネル：駒・武器・スキル・CPUの数値をスライダーで変えて試す（変えた値は保存される）
'use strict';

// 調整できる項目：[表示名, 最小, 最大, 刻み]
const TUNE_FIELDS = {
  hp: ['HP', 30, 250, 5], size: ['大きさ', 0.6, 1.2, 0.02], speed: ['速さ', 3, 50, 0.25], jump: ['ジャンプ力', 4, 12, 0.25],
  dmg: ['ダメージ（1発）', 2, 100, 1], pellets: ['弾の数', 1, 16, 1], head: ['頭の倍率', 1, 3, 0.1], rate: ['連射間隔（秒）', 0.05, 1.5, 0.01],
  spread: ['基本のブレ', 0, 0.12, 0.001], bloomShot: ['連射で広がるブレ', 0, 0.05, 0.001], bloomMax: ['ブレの上限', 0, 0.15, 0.005],
  move: ['移動中のブレ', 0, 0.08, 0.001], air: ['空中のブレ', 0, 0.12, 0.002], ads: ['覗き込み時のブレ倍率', 0.1, 1, 0.05],
  recoil: ['反動', 0, 0.1, 0.002], mag: ['装弾数', 1, 40, 1], reload: ['リロード（秒）', 0.3, 4, 0.1], pref: ['CPUが保つ距離', 3, 30, 1],
  cooldown: ['待ち時間（秒）', 1, 20, 0.5], duration: ['効果時間（秒）', 0.1, 5, 0.02], damageTaken: ['受けるダメージの倍率', 0, 1, 0.05],
  ram: ['体当たりダメージ', 0, 80, 1], slow: ['効果中の移動の倍率', 0.2, 1, 0.05],
  react: ['見つけてから撃つまで（秒）', 0.05, 1.5, 0.05], err: ['狙いのブレ', 0, 0.3, 0.005], track: ['照準の追従の速さ', 1, 20, 0.5],
  lead: ['矢の偏差撃ちの正確さ', 0, 1, 0.05], strafe: ['横移動の速さの倍率', 0.2, 1, 0.05], charges: ['連続で使える回数', 1, 5, 1],
  dmgMin: ['最小ダメージ（引きが浅い）', 1, 100, 1], drawTime: ['引き切るまで（秒）', 0.2, 2.5, 0.05], speedMin: ['矢の速さ（最小）', 5, 120, 1],
  speedMax: ['矢の速さ（最大）', 10, 150, 1], gravity: ['矢の落ち方', 0, 40, 1], drawSpread: ['引きが浅いときのブレ', 0, 0.1, 0.002],
  turn: ['追尾の曲がりやすさ', 0.5, 10, 0.25], regenDelay: ['回復が始まるまで（秒）', 1, 15, 0.5], regenRate: ['1秒の回復量', 0, 60, 1],
};
const TUNE_ROOTS = { PIECES, WEAPONS, SKILLS, DIFFS, RULES: { base: RULES } };
const TUNE_DEFAULTS = JSON.parse(JSON.stringify(TUNE_ROOTS));
const TUNE_KEY = 'shogifps-tune';

// 保存済みの値を起動時に反映
let tuneSaved = {};
try { tuneSaved = JSON.parse(localStorage.getItem(TUNE_KEY) || '{}'); } catch (e) {}
for (const [root, objs] of Object.entries(tuneSaved)) {
  for (const [k, vals] of Object.entries(objs)) {
    const o = TUNE_ROOTS[root] && TUNE_ROOTS[root][k];
    if (o) for (const [f, v] of Object.entries(vals)) if (typeof o[f] === 'number') o[f] = v;
  }
}

function tuneGroups() {
  const groups = [], seen = new Set();
  const add = (title, root, key) => { if (!seen.has(root + key)) { seen.add(root + key); groups.push({ title, root, key }); } };
  for (const [k, p] of Object.entries(PIECES)) {
    add(`駒「${p.name}」`, 'PIECES', k);
    add(`武器：${WEAPONS[p.weapon].name}（${p.name}）`, 'WEAPONS', p.weapon);
    add(`スキル：${SKILLS[p.skill].name}（${p.name}）`, 'SKILLS', p.skill);
  }
  add(`CPU：${DIFFS[settings.diff].name}`, 'DIFFS', settings.diff);
  add('ルール（HP回復）', 'RULES', 'base');
  return groups;
}
function tuneSet(root, key, field, v) {
  TUNE_ROOTS[root][key][field] = v;
  ((tuneSaved[root] = tuneSaved[root] || {})[key] = tuneSaved[root][key] || {})[field] = v;
  try { localStorage.setItem(TUNE_KEY, JSON.stringify(tuneSaved)); } catch (e) {}
}
function tuneReset() {
  for (const root of Object.keys(TUNE_ROOTS)) {
    for (const [k, def] of Object.entries(TUNE_DEFAULTS[root])) Object.assign(TUNE_ROOTS[root][k], JSON.parse(JSON.stringify(def)));
  }
  tuneSaved = {};
  try { localStorage.removeItem(TUNE_KEY); } catch (e) {}
}
// 初期値から変えた項目だけを書き出す
function tuneExport() {
  const lines = [];
  for (const g of tuneGroups()) {
    const cur = TUNE_ROOTS[g.root][g.key], def = TUNE_DEFAULTS[g.root][g.key];
    const diffs = Object.keys(TUNE_FIELDS).filter(f => typeof cur[f] === 'number' && cur[f] !== def[f]).map(f => `${f}: ${def[f]} → ${cur[f]}`);
    if (diffs.length) lines.push(`${g.root}.${g.key}（${g.title}）\n  ` + diffs.join('\n  '));
  }
  return lines.length ? '【将棋FPS 調整値】\n' + lines.join('\n') : '（初期値から変えた項目はありません）';
}

function openTune() {
  let el = $('tune');
  if (!el) {
    el = document.createElement('div'); el.id = 'tune';
    document.body.appendChild(el);
    ['click', 'mousedown', 'input'].forEach(ev => el.addEventListener(ev, e => e.stopPropagation()));
  }
  const fmt = (v, step) => step >= 1 ? String(Math.round(v)) : v.toFixed(Math.max(0, Math.ceil(-Math.log10(step))));
  let html = `<div class="tune-head"><b>調整パネル</b><button id="tuneClose">閉じる</button></div>
    <p class="tune-note">動かすとすぐ反映（HP・大きさ・装弾数は次の対局から）。金色の項目は初期値から変えたもの。</p>`;
  for (const g of tuneGroups()) {
    const cur = TUNE_ROOTS[g.root][g.key], def = TUNE_DEFAULTS[g.root][g.key];
    html += `<h4>${g.title}</h4>`;
    for (const [f, [label, min, max, step]] of Object.entries(TUNE_FIELDS)) {
      if (typeof cur[f] !== 'number') continue;
      const id = `t_${g.root}_${g.key}_${f}`;
      html += `<label class="tune-row${cur[f] !== def[f] ? ' changed' : ''}" id="${id}_row"><span>${label}</span>
        <input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${cur[f]}"
          data-root="${g.root}" data-key="${g.key}" data-f="${f}" data-step="${step}" data-def="${def[f]}">
        <em id="${id}_v">${fmt(cur[f], step)}</em></label>`;
    }
  }
  html += `<div class="tune-btns"><button id="tuneCopy">変更点をコピー</button><button id="tuneReset">初期値に戻す</button></div>
    <textarea id="tuneOut" readonly></textarea>`;
  el.innerHTML = html;
  el.style.display = 'block';
  el.querySelectorAll('input[type=range]').forEach(inp => inp.oninput = () => {
    const v = +inp.value, d = inp.dataset;
    tuneSet(d.root, d.key, d.f, v);
    $(inp.id + '_v').textContent = fmt(v, +d.step);
    $(inp.id + '_row').classList.toggle('changed', v !== +d.def);
  });
  $('tuneClose').onclick = () => { el.style.display = 'none'; };
  $('tuneCopy').onclick = () => {
    const text = tuneExport(), out = $('tuneOut');
    out.value = text; out.style.display = 'block'; out.select();
    try { navigator.clipboard.writeText(text).then(() => { $('tuneCopy').textContent = 'コピーしました'; }).catch(() => {}); } catch (e) {}
    setTimeout(() => { if ($('tuneCopy')) $('tuneCopy').textContent = '変更点をコピー'; }, 1500);
  };
  $('tuneReset').onclick = () => { tuneReset(); openTune(); };
}
