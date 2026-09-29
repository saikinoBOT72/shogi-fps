// ガチャ画面：駒が裏向きで盤に落ちてくる → 裏返ると光の柱の色でレア度が分かる（N 白・R 青・SR 紫・LR 金）
//   → 銃が公式配色（白黒）で出てきて、後ろから前へ色が塗られていく → LR は画面が暗くなり、舞う光と銃口の光で連射
//   → 最後に引いたものを並べて、そのまま装備できる。10連は1つずつ見せる（クリックで次へ・スキップあり）
// 音は仮（盤に置く音・裏返る音はいつもの音）。あとで試聴ウィジェットで選んでもらう
import * as THREE from 'three';
import { P } from './palette';
import { $, LIGHT } from './core';
import { GUN_BUILDERS, boardTex, darkWoodTex, handMat, makePiece, pieceWoodMat, toon } from './render';
import { DESIGNS, RARITY, SKINS, gachaColors } from './guns/skins';
import { Loadout, Owned, PITY, PULL_COST, RATES, canSpend, equipItem, itemName, modelOf, paintGun, pointsText, pull, seedHex } from './loadout';
import { SFX } from './audio';
import { VM } from './effects';
import { paintActors } from './game';
import { overlay } from './screens';
import { gs } from './state';
import { showInventory } from './inventory';

const RAR_COL = { N: P.shiro[2], R: P.ao[2], SR: P.fuji[2], LR: P.kin[2] };
const RAR_CH = { N: '歩', R: '銀', SR: '金', LR: '王' };   // 裏返ると出てくる駒の字
const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rarOf = (it: Owned) => DESIGNS[it.base].rarity;
const wait = (s: number) => new Promise<void>(r => setTimeout(r, s * 1000));

let back: () => void = () => {};
let results: Owned[] = [], lastN: 1 | 10 = 1, pick = 0;
let phase: 'top' | 'drop' | 'reveal' | 'result' = 'top';
let runId = 0;   // 画面を離れたり、スキップしたら古い流れを止める
let advance: (() => void) | null = null;   // クリックで次へ

export function showGacha(onBack: () => void) {
  back = onBack; phase = 'top'; runId++;
  const pityLeft = Math.max(0, PITY - Loadout.pity);
  frame(`
    <div class="ga-panel">
      <div class="ga-rates">${RATES.slice().reverse().map(([r, p]) => `<span class="r-${r}"><b>${r}</b>${p}%</span>`).join('')}</div>
      <p class="ga-pity">LR が出ないまま 50 回引くと、次は LR 確定。<b>あと ${pityLeft} 回</b></p>
      <div class="ga-btns">
        <button class="btn ga-pull" id="gaOne"${canSpend(PULL_COST[1]) ? '' : ' disabled'}><b>1連</b><small>${PULL_COST[1]} ポイント</small></button>
        <button class="btn ga-pull ten" id="gaTen"${canSpend(PULL_COST[10]) ? '' : ' disabled'}><b>10連</b><small>${PULL_COST[10]} ポイント</small></button>
      </div>
      <p class="note">形はデザインから、色は毎回まったくのランダム。強さには関わりません</p>
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
  on('gaBack', () => { runId++; Scene.hide(); back(); });
  on('gaInv', () => { runId++; Scene.hide(); showInventory(() => showGacha(back)); });
  $('ga').onclick = e => { e.stopPropagation(); if (advance) { const f = advance; advance = null; f(); } };
}
const on = (id: string, fn: () => void) => { const el = $(id); if (el) el.onclick = e => { e.stopPropagation(); fn(); }; };

async function start(n: 1 | 10) {
  const got = pull(n);
  if (!got) return;
  results = got; lastN = n; pick = 0;
  const my = ++runId;
  phase = 'drop';
  frame(`<button class="btn sub ga-skip" id="gaSkip">スキップ</button>`);
  on('gaSkip', () => { runId++; showResults(); });
  await Scene.drop(results, my);
  if (my !== runId) return;
  for (let i = 0; i < results.length; i++) {
    if (my !== runId) return;
    await reveal(i, my);
  }
  if (my === runId) showResults();
}

// 1つずつ見せる：白黒で出る → 色が塗られる → 名前が出る → クリックで次へ
async function reveal(i: number, my: number) {
  const it = results[i], r = rarOf(it), d = DESIGNS[it.base];
  phase = 'reveal';
  frame(`<div class="ga-cap r-${r}" id="gaCap"></div>
    <div class="ga-count">${results.length > 1 ? `${i + 1} / ${results.length}` : ''}</div>
    <button class="btn sub ga-skip" id="gaSkip">${results.length > 1 ? 'スキップ' : '結果へ'}</button>`, r === 'LR' ? 'lr' : '');
  on('gaSkip', () => { runId++; showResults(); });
  await Scene.paint(it, my);
  if (my !== runId) return;
  const cols = gachaColors(it.seed, d.colors.length);
  $('gaCap').innerHTML = `<div class="ga-rar"><b>${r}</b><span>${RARITY[r]}</span></div>
    <div class="ga-name">${esc(itemName(it))}</div>
    <div class="ga-sub">${esc(d.name)}　<span class="inv-sw">${cols.map(c => `<i style="background:${hex(c)}"></i>`).join('')}</span></div>
    <p class="note">クリックで${i + 1 < results.length ? '次へ' : '結果へ'}</p>`;
  $('gaCap').classList.add('show');
  await new Promise<void>(res => { advance = res; });
}

// 結果：引いたものを並べる。選ぶと銃が回り、装備できる
function showResults() {
  phase = 'result'; advance = null;
  const it = results[pick], m = modelOf(it), eq = Loadout.equip[m] === it.id;
  const card = (x: Owned, i: number) => {
    const r = rarOf(x), cols = gachaColors(x.seed, DESIGNS[x.base].colors.length);
    return `<button class="inv-card r-${r}${i === pick ? ' sel' : ''}${Loadout.equip[modelOf(x)] === x.id ? ' eq' : ''}" data-i="${i}">
      <span class="inv-sw">${cols.map(c => `<i style="background:${hex(c)}"></i>`).join('')}</span><em>${r}</em>
      <b>${esc(itemName(x))}</b><small>${esc(DESIGNS[x.base].name)}・${wName(modelOf(x))}</small>
      ${Loadout.equip[modelOf(x)] === x.id ? '<span class="inv-eq">装備中</span>' : ''}
    </button>`;
  };
  const r = rarOf(it);
  frame(`<div class="ga-result r-${r}">
      <div class="ga-cap show"><div class="ga-rar"><b>${r}</b><span>${RARITY[r]}</span></div>
        <div class="ga-name">${esc(itemName(it))}</div><div class="ga-sub">${esc(DESIGNS[it.base].name)}・${wName(m)}・番号 ${seedHex(it.seed)}</div>
        <div class="inv-acts"><button class="btn" id="gaEquip"${eq ? ' disabled' : ''}>${eq ? '装備中' : '装備する'}</button></div></div>
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
  Scene.showcase(it);
}
const wName = (m: string) => ({ pistol: 'デザートイーグル', burst: '93R', mp5: 'MP5K', ak: 'AK-47', m870: 'M870', mk2: 'Mk2', m79: 'M79', bow: '和弓', karambit: 'カランビット' }[m] || m);

// ================= 3D =================
const Scene = (() => {
  let renderer: THREE.WebGLRenderer, scene: THREE.Scene, cam: THREE.PerspectiveCamera, running = false, lastT = 0, T = 0;
  let board: THREE.Group, pieces: THREE.Group, holder: THREE.Group, hemi: THREE.HemisphereLight, sun: THREE.DirectionalLight;
  const ticks: ((dt: number) => boolean | void)[] = [];   // 毎フレーム動かすもの（true を返したら終わり）
  let camMode: 'board' | 'gun' = 'board', shake = 0, radius = 0.3, spin = 0;
  const tex = (w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')); return new THREE.CanvasTexture(c); };
  const glowTex = tex(64, 64, g => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.3, 'rgba(255,255,255,0.6)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); });
  const beamTex = tex(4, 128, g => { const r = g.createLinearGradient(0, 0, 0, 128); r.addColorStop(0, 'rgba(255,255,255,0)'); r.addColorStop(1, 'rgba(255,255,255,1)'); g.fillStyle = r; g.fillRect(0, 0, 4, 128); });
  const addMat = (c: number, map = glowTex) => new THREE.SpriteMaterial({ map, color: c, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });

  function init() {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, devicePixelRatio));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0, 0);
    renderer.localClippingEnabled = true;   // 色が塗られていく境目
    scene = new THREE.Scene();
    cam = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
    hemi = new THREE.HemisphereLight(new THREE.Color(P.ao[2]), new THREE.Color(P.kiji[0]), 0.8 * LIGHT); scene.add(hemi);
    sun = new THREE.DirectionalLight(new THREE.Color(P.shiro[2]), 1.6 * LIGHT); sun.position.set(0.6, 1, 0.5); scene.add(sun);
    // 将棋盤
    board = new THREE.Group(); scene.add(board);
    const side = toon({ map: darkWoodTex }), top = toon({ map: boardTex });
    const bm = new THREE.Mesh(new THREE.BoxGeometry(7.4, 1.2, 7.4), [side, side, top, side, side, side]); bm.position.y = -0.6; board.add(bm);
    pieces = new THREE.Group(); board.add(pieces);
    holder = new THREE.Group(); holder.visible = false; scene.add(holder);
  }
  function mount(host: HTMLElement) {
    if (!renderer) init();
    host.appendChild(renderer.domElement);
    gs.menu3d = true;   // 開いている間は、後ろのゲームの画面を描かない（見えないので）
    if (!running) { running = true; lastT = performance.now(); requestAnimationFrame(loop); }
  }
  // 離れるときは描画の準備（WebGL）ごと片付ける（戦いの間まで GPU のメモリを持ち続けないように）。次に開いたら作り直す
  function hide() {
    running = false; ticks.length = 0; clearClip(); gs.menu3d = false;
    if (!renderer) return;
    renderer.domElement.remove(); renderer.dispose(); renderer.forceContextLoss(); renderer = null;
  }
  function loop(now: number) {
    if (!running || !renderer || !renderer.domElement.isConnected) { running = false; if (renderer) hide(); return; }
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now; T += dt;
    const host = renderer.domElement.parentElement, w = host.clientWidth, h = host.clientHeight, pr = renderer.getPixelRatio();
    if (renderer.domElement.width !== Math.floor(w * pr) || renderer.domElement.height !== Math.floor(h * pr)) { renderer.setSize(w, h); cam.aspect = w / Math.max(1, h); cam.updateProjectionMatrix(); }
    for (let i = ticks.length - 1; i >= 0; i--) if (ticks[i](dt) === true) ticks.splice(i, 1);
    // カメラ：盤は斜め上から、銃は真横から（全体が入る距離）
    if (camMode === 'board') {
      cam.clearViewOffset();
      const a = phase === 'top' ? T * 0.12 : 0;
      cam.position.set(Math.sin(a) * 7.8, 9.5, Math.cos(a) * 7.8 + 0.6); cam.lookAt(0, 0, 0.6);
      hemi.intensity = 0.45 * LIGHT; sun.intensity = 1.0 * LIGHT;   // 盤と駒は明るすぎないように
    } else {
      hemi.intensity = 0.8 * LIGHT; sun.intensity = 1.6 * LIGHT;
      const vf = THREE.MathUtils.degToRad(cam.fov) / 2, hf = Math.atan(Math.tan(vf) * cam.aspect);
      // 結果の画面では、右に札・下に名前が並ぶので、絵をずらして銃を左上の空いた所に見せる
      const res = phase === 'result' && w > 900;
      if (res) cam.setViewOffset(w, h, w * 0.17, h * 0.1, w, h); else cam.clearViewOffset();
      cam.position.set(radius / Math.tan(Math.min(vf, hf * (res ? 0.48 : 1))) * 0.85, radius * 0.2, 0); cam.lookAt(0, 0, 0);
      spin += dt; holder.rotation.y = phase === 'result' ? spin * 0.4 : Math.sin(spin * 0.7) * 0.35;
    }
    if (shake > 0) { shake = Math.max(0, shake - dt); cam.position.x += (Math.random() - 0.5) * shake * 0.4; cam.position.y += (Math.random() - 0.5) * shake * 0.4; }
    renderer.render(scene, cam);
  }

  // 舞う光のつぶ（裏返ったときに吹き上がる・LR の銃のまわり）
  function burst(pos: THREE.Vector3, color: number, n: number, speed: number, size: number) {
    for (let i = 0; i < n; i++) {
      const sp = new THREE.Sprite(addMat(color)); sp.position.copy(pos); sp.scale.setScalar(size * (0.5 + Math.random()));
      const v = new THREE.Vector3((Math.random() - 0.5) * speed, speed * (0.6 + Math.random()), (Math.random() - 0.5) * speed);
      scene.add(sp); let t = 0; const life = 0.7 + Math.random() * 0.6;
      ticks.push(dt => { t += dt; v.y -= speed * 1.2 * dt; sp.position.addScaledVector(v, dt); sp.material.opacity = 1 - t / life; if (t >= life) { scene.remove(sp); return true; } });
    }
  }

  // 何も引いていないとき：盤の上に裏向きの駒が少し置いてあり、カメラがゆっくり回る
  function idle() {
    camMode = 'board'; board.visible = true; holder.visible = false; ticks.length = 0; clearClip();
    pieces.clear();
    for (let i = 0; i < 5; i++) {
      const p = piece('歩', 1.1); p.position.set((Math.random() - 0.5) * 4, 0.16, (Math.random() - 0.5) * 4); p.rotation.y = Math.random() * 6; pieces.add(p);
    }
  }
  // 裏向き（字が下）に寝かせた駒
  function piece(ch: string, s: number) {
    const g = new THREE.Group(), p = makePiece(ch, 0.8, 0.92, 0.26, pieceWoodMat);
    p.rotation.x = Math.PI / 2; g.add(p); g.scale.setScalar(s);
    return g;
  }

  // 駒が落ちてきて、順に裏返る
  async function drop(items: Owned[], my: number) {
    idle(); pieces.clear();
    const n = items.length, s = n === 1 ? 1.8 : 1.05;
    const ps = items.map((it, i) => {
      const g = piece(RAR_CH[rarOf(it)], s);
      const x = n === 1 ? 0 : ((i % 5) - 2) * 1.25, z = n === 1 ? 0 : (Math.floor(i / 5) - 0.5) * 2;
      g.position.set(x, 8 + i * 0.5, z); g.rotation.y = (Math.random() - 0.5) * 0.2; pieces.add(g);
      return g;
    });
    const rest = 0.14 * s;
    await Promise.all(ps.map((g, i) => new Promise<void>(res => {
      let t = -i * 0.07, vy = 0;
      ticks.push(dt => {
        t += dt; if (t < 0) return;
        vy -= 40 * dt; g.position.y += vy * dt;
        if (g.position.y <= rest) { g.position.y = rest; SFX.play('place'); res(); return true; }
      });
    })));
    if (my !== runId) return;
    await wait(0.4);
    for (let i = 0; i < n; i++) {
      if (my !== runId) return;
      flip(ps[i], rarOf(items[i]), s);
      await wait(n === 1 ? 0.9 : 0.22);
    }
    await wait(n === 1 ? 0.8 : 1.1);
  }
  // 裏返す：持ち上がりながら回って表に。表になった瞬間に光の柱と光のつぶ
  function flip(g: THREE.Group, r: string, s: number) {
    const p = g.children[0], y0 = g.position.y, col = RAR_COL[r];
    const big = { N: 0, R: 1, SR: 1.4, LR: 2.2 }[r];
    let t = 0, done = false;
    SFX.play('sel');
    ticks.push(dt => {
      t += dt; const k = Math.min(1, t / 0.45), e = k * k * (3 - 2 * k);
      p.rotation.x = Math.PI / 2 - Math.PI * e; g.position.y = y0 + Math.sin(Math.PI * k) * 0.8 * s;
      if (k >= 1 && !done) {
        done = true;
        SFX.play(r === 'LR' ? 'battle' : r === 'SR' ? 'promo' : r === 'R' ? 'ding' : 'place');
        burst(g.position.clone(), col, 6 + big * 18, 3 + big * 1.5, 0.12 + big * 0.05);
        if (big) beam(g.position, col, 0.35 * s * big, big);
        if (r === 'LR') shake = 0.6;
        return true;
      }
    });
  }
  // 光の柱
  function beam(at: THREE.Vector3, col: number, rad: number, big: number) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad * 0.7, 7, 20, 1, true),
      new THREE.MeshBasicMaterial({ map: beamTex, color: col, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    m.position.set(at.x, 3.5, at.z); m.scale.y = 0.01; pieces.add(m);
    let t = 0;
    ticks.push(dt => { t += dt; m.scale.y = Math.min(1, t / 0.25); (m.material as THREE.MeshBasicMaterial).opacity = t < 0.6 ? 1 : Math.max(0.25 + big * 0.1, 1 - (t - 0.6)); m.rotation.y += dt; return !m.parent; });
  }

  // ---------- 銃 ----------
  // 武器ごとに「白黒の銃」と「色の付いた銃」を1組ずつ作って重ね、境目の前後で片方ずつ見せる
  const pairs: Record<string, any> = {};
  let touched: THREE.Material[] = [];
  function pairFor(m: string) {
    if (pairs[m]) return pairs[m];
    const mk = () => { const g = GUN_BUILDERS[m](); g.g.traverse((o: any) => { if (o.material === handMat) o.visible = false; }); return g; };
    const a = mk(), b = mk(), inner = new THREE.Group();
    inner.add(a.g, b.g);
    const box = new THREE.Box3().setFromObject(a.g), c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
    inner.position.copy(c).negate();
    // 塗られていく境目の光る面
    const edge = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: glowTex, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    edge.scale.set(size.x * 2.2, size.y * 1.6, 1); edge.position.set(c.x, c.y, 0); edge.visible = false; inner.add(edge);
    return pairs[m] = { a, b, inner, edge, zMin: box.min.z, zMax: box.max.z, radius: size.length() / 2 };
  }
  const planeA = new THREE.Plane(), planeB = new THREE.Plane();
  function clip(gun: any, plane: THREE.Plane) {
    gun.g.traverse((o: any) => {
      if (!o.isMesh || o.material === handMat) return;
      for (const mt of Array.isArray(o.material) ? o.material : [o.material]) { mt.clippingPlanes = [plane]; touched.push(mt); }
    });
  }
  function clearClip() { for (const mt of touched) mt.clippingPlanes = null; touched = []; }
  function useGun(it: Owned) {
    const pr = pairFor(modelOf(it));
    clearClip(); holder.clear(); holder.add(pr.inner); holder.visible = true; board.visible = false;
    camMode = 'gun'; radius = pr.radius; spin = 0;
    pr.a.g.visible = true;
    pr.a.setSkin(it.base);                  // 公式配色（白黒）
    paintGun(pr.b, [it.base, it.seed]);     // 引いた色
    return pr;
  }

  // 白黒で出てきて、後ろから前へ色が塗られる。LR は塗り終わると暗くなって、銃口の光で連射
  async function paint(it: Owned, my: number) {
    ticks.length = 0;
    const pr = useGun(it), r = rarOf(it), sk = SKINS[pr.b.skin];
    clip(pr.a, planeA); clip(pr.b, planeB);
    let p = pr.zMax + 0.01, fast = false;
    const setP = () => {
      pr.inner.updateMatrixWorld(true);
      planeA.set(new THREE.Vector3(0, 0, -1), p).applyMatrix4(pr.inner.matrixWorld);   // 白黒：境目より前
      planeB.set(new THREE.Vector3(0, 0, 1), -p).applyMatrix4(pr.inner.matrixWorld);   // 色：境目より後ろ
      pr.edge.position.z = p;
    };
    setP();
    // 出てくる
    holder.scale.setScalar(0.6);
    let t = 0;
    ticks.push(dt => { t += dt; holder.scale.setScalar(0.6 + 0.4 * Math.min(1, t / 0.3) ** 0.5); setP(); return t > 0.3 && !holder.visible; });
    SFX.play('swap');
    advance = () => { fast = true; };   // クリックで塗り終わりまで飛ばす
    await wait(0.5);
    if (my !== runId) return;
    // 塗る
    const dur = { N: 0.8, R: 1.0, SR: 1.2, LR: 1.6 }[r];
    pr.edge.material.color.setHex(gachaColors(it.seed, 1)[0]); pr.edge.visible = true;
    SFX.play('inspect');
    await new Promise<void>(res => {
      let k = 0;
      ticks.push(dt => {
        k = fast ? 1 : Math.min(1, k + dt / dur);
        const e = k * k * (3 - 2 * k);
        p = pr.zMax + 0.01 + (pr.zMin - pr.zMax - 0.02) * e; setP();
        if (k >= 1) { pr.edge.visible = false; res(); return true; }
      });
    });
    advance = null;
    if (my !== runId) return;
    SFX.play(r === 'LR' ? 'win' : r === 'SR' ? 'promo' : r === 'R' ? 'ding' : 'sel');
    burst(new THREE.Vector3(0, 0, 0), RAR_COL[r], 10 + (r === 'LR' ? 40 : r === 'SR' ? 20 : 6), radius * 3, radius * 0.06);
    if (r === 'LR' && sk?.fx) await lrShow(pr, sk.fx, my);
  }

  // LR：画面が暗くなり、銃のまわりに光が舞い、銃口の光と弾の線で連射
  async function lrShow(pr: any, fx: any, my: number) {
    $('ga')?.classList.add('dark');
    aura(pr, fx.aura ?? fx.flash);
    for (let i = 0; i < 6; i++) {
      if (my !== runId) return;
      shot(pr, fx);
      await wait(0.16);
    }
    await wait(0.3);
  }
  function aura(pr: any, col: number) {
    const ms: any[] = []; pr.b.g.traverse((o: any) => { if (o.isMesh && o.visible && o.geometry.attributes.position) ms.push(o); });
    const v = new THREE.Vector3();
    ticks.push(dt => {
      if (!holder.children.includes(pr.inner)) return true;
      for (let j = 0; j < 2; j++) {
        if (Math.random() > dt * 30) continue;
        const m = ms[Math.floor(Math.random() * ms.length)], pa = m.geometry.attributes.position;
        v.fromBufferAttribute(pa, Math.floor(Math.random() * pa.count)).applyMatrix4(m.matrixWorld);
        const sp = new THREE.Sprite(addMat(col)); sp.position.copy(v); sp.scale.setScalar(radius * (0.02 + Math.random() * 0.03)); scene.add(sp);
        let t = 0; const life = 1 + Math.random(), rise = radius * 0.15;
        ticks.push(d2 => { t += d2; sp.position.y += rise * d2; sp.material.opacity = Math.sin(Math.PI * Math.min(1, t / life)); if (t >= life) { scene.remove(sp); return true; } });
      }
    });
  }
  function shot(pr: any, fx: any) {
    const mz = pr.b.muzzle.getWorldPosition(new THREE.Vector3());
    const fwd = new THREE.Vector3(0, 0, -1).transformDirection(pr.inner.matrixWorld);
    const fl = new THREE.Sprite(addMat(fx.flash)); fl.position.copy(mz); fl.scale.setScalar(radius * 0.5); scene.add(fl);
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([mz, mz.clone().addScaledVector(fwd, radius * 8)]), new THREE.LineBasicMaterial({ color: fx.tracer ?? fx.flash, transparent: true }));
    scene.add(line);
    let t = 0;
    ticks.push(dt => { t += dt; fl.material.opacity = 1 - t / 0.08; (line.material as THREE.LineBasicMaterial).opacity = 1 - t / 0.14; if (t > 0.14) { scene.remove(fl, line); return true; } });
    shake = Math.max(shake, 0.08);
  }

  // 結果の画面：選んだものを色つきで回して見せる（LR は光も舞う）
  function showcase(it: Owned) {
    ticks.length = 0;
    const pr = useGun(it), sk = SKINS[pr.b.skin];
    pr.a.g.visible = false; pr.b.g.visible = true; pr.edge.visible = false;
    holder.scale.setScalar(1);
    if (sk?.fx?.aura !== undefined) aura(pr, sk.fx.aura);
  }
  return { mount, hide, idle, drop, paint, showcase };
})();
