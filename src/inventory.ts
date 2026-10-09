// 持ち物画面：武器を選ぶ → 持っているスキンの札が並ぶ → 選ぶと真ん中で銃が回って見える → 装備する
//   札の色の帯・銃の後ろの光はレア度の色（N 鼠・R 青・SR 紫・LR 金）。LR は銃のまわりに舞う光も見せる
import * as THREE from 'three';
import { P } from './palette';
import { $, LIGHT, WEAPONS } from './core';
import { GUN_BUILDERS, handMat } from './render';
import { DESIGNS, RARITY, SKINS, gachaColors } from './guns/skins';
import { GUN_OF_MODEL, Loadout, Owned, equipItem, itemName, itemsOf, paintGun, pointsText, saveLoadout, seedHex, weaponName } from './loadout';
import { VM } from './effects';
import { paintActors } from './game';
import { overlay } from './screens';
import { Account } from './account';
import { MARKET, listItem } from './market';
import { notify } from './quests';

// 並べる順（持ち替えの順と同じ：ハンドガン系 → 連射 → 重い銃 → 弓・ナイフ）
const MODELS = ['pistol', 'glock', 'burst', 'mp5', 'vector', 'ak', 'm4', 'famas', 'm870', 'mk2', 'awm', 'm79', 'mgl', 'bow', 'xbow', 'karambit'];
const wName = weaponName;
const RANK = { N: 0, R: 1, SR: 2, LR: 3 };
const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const baseSkinOf = (m: string) => VM.models[m].baseSkin || VM.models[m].skin;
// 札に見せる色：ガチャの色（2〜3色）。初期スキンはその本体とグリップの色
//   （和弓の初期は塗装ではなく、竹と革の元の材質）
const baseSk = (m: string) => SKINS[baseSkinOf(m)];
const baseName = (m: string) => baseSk(m)?.name || '竹と籐';
const colorsOf = (it: Owned | null, m: string) => it ? gachaColors(it.seed, DESIGNS[it.base].colors.length) : baseSk(m) ? [baseSk(m).slide.c, baseSk(m).grip.c] : [P.kiji[1], P.sumi[1]];
const swatch = (cols: number[]) => `<span class="inv-sw">${cols.map(c => `<i style="background:${hex(c)}"></i>`).join('')}</span>`;

let cur = 'pistol', sel: number = 0, sort: 'rank' | 'new' = 'rank', favOnly = false, selling = false, sellMsg = '', back: () => void = () => {};

export function showInventory(onBack: () => void) {
  back = onBack; selling = false; sellMsg = '';
  sel = Loadout.equip[cur] ?? 0;
  render();
}

function list() {
  let xs = itemsOf(cur);
  if (favOnly) xs = xs.filter(x => x.fav);
  return xs.sort((a, b) => sort === 'new' ? b.at - a.at : RANK[DESIGNS[b.base].rarity] - RANK[DESIGNS[a.base].rarity] || b.at - a.at);
}

function render() {
  const items = list(), eq = Loadout.equip[cur] ?? 0;
  const it = Loadout.items.find(x => x.id === sel) || null;
  if (!it) sel = 0;
  const rar = it ? DESIGNS[it.base].rarity : 'base';
  const card = (x: Owned | null) => {
    const id = x ? x.id : 0, r = x ? DESIGNS[x.base].rarity : 'base';
    return `<button class="inv-card r-${r}${id === sel ? ' sel' : ''}${id === eq ? ' eq' : ''}" data-id="${id}">
      ${swatch(colorsOf(x, cur))}<em>${x ? r : '初期'}</em>
      <b>${esc(x ? itemName(x) : baseName(cur))}</b>
      <small>${x ? esc(DESIGNS[x.base].name)  : '最初から持っている'}</small>
      ${id === eq ? '<span class="inv-eq">装備中</span>' : ''}${x?.fav ? '<span class="inv-star">★</span>' : ''}
    </button>`;
  };
  const guns = MODELS.map(m => {
    const e = Loadout.items.find(x => x.id === Loadout.equip[m]) || null;
    return `<button class="inv-gun${m === cur ? ' on' : ''}" data-m="${m}"><b>${wName(m)}</b><small>${itemsOf(m).length}個</small>${swatch(colorsOf(e, m))}</button>`;
  }).join('');
  const d = it && DESIGNS[it.base];
  overlay(`<div class="inv r-${rar}">
    <header class="inv-head">
      <h2 class="h">持ち物</h2>
      <div class="pts"><small>ポイント</small><b>${pointsText()}</b></div>
      <button class="btn sub" id="invBack">戻る</button>
    </header>
    <nav class="inv-guns">${guns}</nav>
    <section class="inv-stage">
      <div class="inv-view" id="invView"><span class="inv-hint">ドラッグで回す</span></div>
      <div class="inv-info">
        <div class="inv-rar"><b>${it ? rar : '初期'}</b><span>${it ? RARITY[rar] : '初期スキン'}</span></div>
        <div class="inv-name"><span>${esc(it ? itemName(it) : baseName(cur))}</span></div>
        <div class="inv-meta">${it
          ? `<span>デザイン <b>${esc(d.name)}</b></span><span>カラー ${swatch(colorsOf(it, cur))}</span><span>番号 <b>${seedHex(it.seed)}</b></span><span>${new Date(it.at).toLocaleDateString('ja-JP')} に入手</span>`
          : `<span>${wName(cur)}の最初の塗装</span>`}</div>
        <div class="inv-acts">
          <button class="btn" id="invEquip"${sel === eq ? ' disabled' : ''}>${sel === eq ? '装備中' : '装備する'}</button>
          ${it ? `<button class="btn sub" id="invFav">${it.fav ? '★ お気に入り' : '☆ お気に入り'}</button>` : ''}
          ${it && Account.user && sel !== eq && !selling ? '<button class="btn sub" id="invSell">出品する</button>' : ''}
        </div>
        ${it && selling ? `<div class="inv-sell"><span>値段</span><input id="invPrice" type="number" min="${MARKET.minPrice}" max="${MARKET.maxPrice}" step="1" value="100"><span>pt</span>
          <button class="btn small" id="invSellOk">出品する</button><button class="btn sub small" id="invSellNo">やめる</button></div>
          <p class="note">${MARKET.minPrice}〜${MARKET.maxPrice.toLocaleString()}pt・1人${MARKET.max}個まで・${MARKET.days}日で持ち物に戻る。売れるまで持ち物から外れます</p>` : ''}
        ${sellMsg ? `<p class="inv-msg">${esc(sellMsg)}</p>` : ''}
      </div>
    </section>
    <section class="inv-list">
      <div class="inv-tools">
        <div class="seg" id="invSort"><button data-v="rank" class="${sort === 'rank' ? 'on' : ''}">レア度順</button><button data-v="new" class="${sort === 'new' ? 'on' : ''}">新しい順</button></div>
        <div class="seg" id="invFavOnly"><button data-v="1" class="${favOnly ? 'on' : ''}">★ だけ</button></div>
        <span class="inv-count">${itemsOf(cur).length}個</span>
      </div>
      <div class="inv-grid">${favOnly ? '' : card(null)}${items.map(card).join('')}</div>
      ${itemsOf(cur).length ? '' : '<p class="note inv-empty">まだスキンがありません。ガチャで引くと、ここに並びます</p>'}
    </section>
  </div>`, true);
  bind();
  Stage.show(cur, it);
}

function bind() {
  const on = (id: string, fn: () => void) => { const el = $(id); if (el) el.onclick = e => { e.stopPropagation(); fn(); }; };
  on('invBack', () => { Stage.hide(); back(); });
  document.querySelectorAll<HTMLElement>('.inv-gun').forEach(b => b.onclick = e => { e.stopPropagation(); cur = b.dataset.m; sel = Loadout.equip[cur] ?? 0; selling = false; sellMsg = ''; render(); });
  document.querySelectorAll<HTMLElement>('.inv-card').forEach(b => b.onclick = e => { e.stopPropagation(); sel = +b.dataset.id; selling = false; sellMsg = ''; render(); });
  document.querySelectorAll<HTMLElement>('#invSort button').forEach(b => b.onclick = e => { e.stopPropagation(); sort = b.dataset.v as any; render(); });
  on('invFavOnly', () => { favOnly = !favOnly; render(); });
  on('invEquip', () => {
    equipItem(cur, sel || null);
    VM.applyLoadout(); paintActors();
    render();
  });
  const it = Loadout.items.find(x => x.id === sel);
  on('invFav', () => { it.fav = !it.fav; saveLoadout(); render(); });
  on('invSell', () => { selling = true; sellMsg = ''; render(); });
  on('invSellNo', () => { selling = false; render(); });
  on('invSellOk', async () => {
    const price = Math.floor(+($('invPrice') as HTMLInputElement).value);
    const name = itemName(it);
    const r = await listItem(it, price).catch(e => { console.warn(e); return 'fail' as const; });
    selling = false;
    sellMsg = r === 'ok' ? '' : r === 'max' ? `出品できるのは${MARKET.max}個までです` : r === 'price' ? `値段は ${MARKET.minPrice}〜${MARKET.maxPrice.toLocaleString()}pt にしてください` : r === 'equipped' ? '装備中のスキンは出品できません' : '出品できませんでした。通信を確かめてください';
    if (r === 'ok') { sel = Loadout.equip[cur] ?? 0; notify(`「${name}」を ${price.toLocaleString()}pt で出品しました`); }
    render();
  });
  const pin = $('invPrice') as HTMLInputElement;
  if (pin) { pin.onclick = e => e.stopPropagation(); pin.onkeydown = e => e.stopPropagation(); pin.focus(); pin.select(); }
}

// ================= 真ん中で銃を回して見せる =================
// ゲームの画面とは別の小さな描画。画面を開いている間だけ動かす
export const Stage = (() => {
  let renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, pivot: THREE.Group, gun: any = null, running = false;
  const guns: Record<string, any> = {};
  let listening = false;
  let yaw = 0.5, dragX: number | null = null, idleT = 0, radius = 0.3, lastT = 0, auraC: number | undefined;
  const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.3, 'rgba(255,255,255,0.6)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  let motes: { sp: THREE.Sprite; t: number; life: number; rise: number }[] = [];
  function init() {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, devicePixelRatio));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(30, 1, 0.01, 50);
    scene.add(new THREE.HemisphereLight(new THREE.Color(P.ao[2]), new THREE.Color(P.kiji[0]), 0.8 * LIGHT));
    const sun = new THREE.DirectionalLight(new THREE.Color(P.shiro[2]), 1.6 * LIGHT); sun.position.set(0.6, 1, 0.5); scene.add(sun);
    pivot = new THREE.Group(); scene.add(pivot); gun = null;   // 作り直したときは、銃も新しい台に載せ直す
    motes = Array.from({ length: 50 }, () => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); sp.visible = false; scene.add(sp); return { sp, t: 0, life: 0, rise: 0 }; });
    const el = renderer.domElement;
    el.onmousedown = e => { e.stopPropagation(); dragX = e.clientX; };
    if (!listening) {
      listening = true;
      addEventListener('mousemove', e => { if (dragX === null) return; yaw += (e.clientX - dragX) * 0.01; dragX = e.clientX; idleT = 0; });
      addEventListener('mouseup', () => { dragX = null; });
    }
    el.ontouchstart = e => { dragX = e.touches[0].clientX; };
    el.ontouchmove = e => { if (dragX === null) return; yaw += (e.touches[0].clientX - dragX) * 0.01; dragX = e.touches[0].clientX; idleT = 0; e.preventDefault(); };
    el.ontouchend = () => { dragX = null; };
    el.onclick = e => e.stopPropagation();
  }
  function modelFor(m: string) {
    if (!guns[m]) {
      const g = GUN_BUILDERS[m]();
      g.g.traverse((o: any) => { if (o.material === handMat) o.visible = false; });   // 手は隠して銃だけ見せる
      guns[m] = g;
    }
    return guns[m];
  }
  // 銃の表面の点をランダムに1つ（舞う光の出どころ）
  const onGun = (out: THREE.Vector3) => {
    const ms: any[] = []; gun.g.traverse((o: any) => { if (o.isMesh && o.visible && o.geometry.attributes.position) ms.push(o); });
    const m = ms[Math.floor(Math.random() * ms.length)], pa = m.geometry.attributes.position;
    return out.fromBufferAttribute(pa, Math.floor(Math.random() * pa.count)).applyMatrix4(m.matrixWorld);
  };
  function show(m: string, it: Owned | null, hostId = 'invView') {
    if (!renderer) init();
    const host = $(hostId); if (!host) return;
    host.appendChild(renderer.domElement);
    const g = modelFor(m);
    paintGun(g, it ? [it.base, it.seed] : null);
    if (gun !== g) {
      if (gun) pivot.remove(gun.g);
      gun = g; pivot.add(gun.g);
      // 銃の真ん中が回る中心に来るように置き、全体が入る距離から見る
      gun.g.position.set(0, 0, 0); gun.g.rotation.set(0, 0, 0); gun.g.scale.setScalar(1); pivot.rotation.set(0, 0, 0);
      pivot.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(gun.g), c = box.getCenter(new THREE.Vector3());
      gun.g.position.sub(c);
      radius = box.getSize(new THREE.Vector3()).length() / 2;
    }
    auraC = SKINS[gun.skin]?.fx?.aura;
    for (const x of motes) { x.sp.visible = false; x.life = 0; }
    if (!running) { running = true; lastT = performance.now(); requestAnimationFrame(loop); }
  }
  // 離れるときは描画の準備（WebGL）ごと片付ける。次に開いたら作り直す
  function hide() {
    running = false;
    if (!renderer) return;
    renderer.domElement.remove(); renderer.dispose(); renderer.forceContextLoss(); renderer = null;
  }
  function loop(now: number) {
    if (!running || !renderer || !renderer.domElement.isConnected) { running = false; if (renderer) hide(); return; }
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
    const host = renderer.domElement.parentElement, w = host.clientWidth, h = host.clientHeight;
    if (renderer.domElement.width !== Math.floor(w * renderer.getPixelRatio()) || renderer.domElement.height !== Math.floor(h * renderer.getPixelRatio())) {
      renderer.setSize(w, h); camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix();
    }
    // 触っていないときはゆっくり回る
    idleT += dt; if (dragX === null && idleT > 1.5) yaw += dt * 0.35;
    pivot.rotation.y = yaw;
    const vf = THREE.MathUtils.degToRad(camera.fov) / 2, hf = Math.atan(Math.tan(vf) * camera.aspect);
    camera.position.set(radius / Math.tan(Math.min(vf, hf)) * 0.8, radius * 0.18, 0); camera.lookAt(0, 0, 0);
    // LR：銃のまわりに舞う光
    if (auraC !== undefined) {
      pivot.updateMatrixWorld(true);
      for (const x of motes) {
        if (x.life <= 0) { onGun(x.sp.position); x.sp.material.color.setHex(auraC); x.sp.scale.setScalar(radius * (0.02 + Math.random() * 0.03)); x.t = -Math.random() * 2; x.life = 1 + Math.random(); x.rise = radius * (0.08 + Math.random() * 0.1); }
        x.t += dt; x.sp.visible = x.t >= 0;
        if (x.t < 0) continue;
        x.sp.position.y += x.rise * dt; x.sp.material.opacity = Math.sin(Math.PI * Math.min(1, x.t / x.life));
        if (x.t >= x.life) x.life = 0;
      }
    }
    renderer.render(scene, camera);
  }
  return { show, hide };
})();
