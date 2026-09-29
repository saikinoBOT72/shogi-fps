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
import { Loadout, Owned, PULL_COST, RATES, canSpend, equipItem, itemName, modelOf, paintGun, pointsText, pull, seedHex } from './loadout';
import { SFX } from './audio';
import { VM } from './effects';
import { paintActors } from './game';
import { overlay } from './screens';
import { gs } from './state';
import { showInventory } from './inventory';

const RAR_COL = { N: P.shiro[2], R: P.ao[2], SR: P.fuji[2], LR: P.kin[2] };
const RAR_CH = { N: '歩', R: '銀', SR: '金', LR: '王' };   // 裏返ると出てくる駒の字
const RANK = { N: 0, R: 1, SR: 2, LR: 3 };
const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rarOf = (it: Owned) => DESIGNS[it.base].rarity;
const wait = (s: number) => new Promise<void>(r => setTimeout(r, s * 1000));
const rand = (a: number, b: number) => a + Math.random() * (b - a);

let back: () => void = () => {};
let results: Owned[] = [], lastN: 1 | 10 = 1, pick = 0;
let phase: 'top' | 'drop' | 'reveal' | 'result' = 'top';
let runId = 0;   // 画面を離れたり、スキップしたら古い流れを止める
let advance: (() => void) | null = null;   // クリックで次へ

export function showGacha(onBack: () => void) {
  back = onBack; phase = 'top'; runId++;
  frame(`
    <div class="ga-panel">
      <div class="ga-rates">${RATES.slice().reverse().map(([r, p]) => `<span class="r-${r}"><b>${r}</b>${p}%</span>`).join('')}</div>
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
  results = got; lastN = n;
  // レア度の低い順に見せる（高い物ほど後で）。結果の画面は、いちばん良い物を見せて始める
  const order = results.map((_, i) => i).sort((a, b) => RANK[rarOf(results[a])] - RANK[rarOf(results[b])]);
  pick = order[order.length - 1];
  const my = ++runId;
  phase = 'drop';
  frame(`<button class="btn sub ga-skip" id="gaSkip">スキップ</button>`);
  on('gaSkip', () => { runId++; showResults(); });
  await Scene.drop(results, order, my);
  if (my !== runId) return;
  for (let k = 0; k < order.length; k++) {
    if (my !== runId) return;
    await reveal(order[k], k, my);
  }
  if (my === runId) showResults();
}

// 1つずつ見せる：駒が割れて銃が出る → 白黒の銃に色が塗られる → 名前が出る → クリックで次へ
async function reveal(i: number, k: number, my: number) {
  const it = results[i], r = rarOf(it), d = DESIGNS[it.base];
  phase = 'reveal';
  frame(`<div class="ga-cap r-${r}" id="gaCap"></div>
    <div class="ga-count">${results.length > 1 ? `${k + 1} / ${results.length}` : ''}</div>
    <button class="btn sub ga-skip" id="gaSkip">${results.length > 1 ? 'スキップ' : '結果へ'}</button>`, r === 'LR' ? 'lr' : '');
  on('gaSkip', () => { runId++; showResults(); });
  await Scene.paint(it, my);
  if (my !== runId) return;
  const cols = gachaColors(it.seed, d.colors.length);
  $('gaCap').innerHTML = `<div class="ga-rar"><b>${r}</b><span>${RARITY[r]}</span></div>
    <div class="ga-name">${esc(itemName(it))}</div>
    <div class="ga-sub">${esc(d.name)}　<span class="inv-sw">${cols.map(c => `<i style="background:${hex(c)}"></i>`).join('')}</span></div>
    <p class="note">クリックで${k + 1 < results.length ? '次へ' : '結果へ'}</p>`;
  $('gaCap').classList.add('show');
  await new Promise<void>(res => { advance = res; });
}

// 結果：引いたものを札で並べる。選んだ銃が回り、装備できる
function showResults() {
  phase = 'result'; advance = null;
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
const wName = (m: string) => ({ pistol: 'デザートイーグル', burst: '93R', mp5: 'MP5K', ak: 'AK-47', m870: 'M870', mk2: 'Mk2', m79: 'M79', bow: '和弓', karambit: 'カランビット' }[m] || m);

// ================= 3D と物理 =================
const Scene = (() => {
  let renderer: THREE.WebGLRenderer, scene: THREE.Scene, cam: THREE.PerspectiveCamera, running = false, lastT = 0, T = 0;
  let board: THREE.Group, boardMesh: THREE.Mesh, pieces: THREE.Group, stays: THREE.Group, holder: THREE.Group, spinG: THREE.Group, veil: THREE.Mesh, flash: THREE.PointLight, hemi: THREE.HemisphereLight, sun: THREE.DirectionalLight;
  const ticks: ((dt: number) => boolean | void)[] = [];   // 毎フレーム動かすもの（true を返したら終わり）
  // 光のつぶ・銃口の光など、あとから出したもの。場面が変わるときは、動きを止めるだけでなく必ず片付ける
  //   （動きだけ止めると、消えきる前のつぶが画面に残り続けて積もっていたため）
  const fxObjs = new Set<THREE.Object3D>();
  const addFx = (...os: THREE.Object3D[]) => { for (const o of os) { scene.add(o); fxObjs.add(o); } };
  const rmFx = (...os: THREE.Object3D[]) => { for (const o of os) { scene.remove(o); fxObjs.delete(o); } };
  const clearTicks = () => { ticks.length = 0; for (const o of fxObjs) scene.remove(o); fxObjs.clear(); };
  let veilTo = 0;   // 暗幕の濃さ（目標）
  const FRONT = 1;   // 暗幕より手前に描く物の層
  const front = <T extends THREE.Object3D>(o: T) => { o.traverse(c => c.layers.set(FRONT)); return o; };
  let camMode: 'board' | 'gun' = 'board', shake = 0, radius = 0.3, spin = 0, orbit = 0, orbiting = false, slow = 1;
  const hold = new THREE.Vector3();   // 銃を見せる場所（盤の上）
  const tex = (w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')); return new THREE.CanvasTexture(c); };
  const glowTex = tex(64, 64, g => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.3, 'rgba(255,255,255,0.6)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); });
  const beamTex = tex(4, 128, g => { const r = g.createLinearGradient(0, 0, 0, 128); r.addColorStop(0, 'rgba(255,255,255,0)'); r.addColorStop(1, 'rgba(255,255,255,1)'); g.fillStyle = r; g.fillRect(0, 0, 4, 128); });
  const addMat = (c: number, map = glowTex) => new THREE.SpriteMaterial({ map, color: c, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  const goldM = toon({ color: new THREE.Color(P.kin[2]), emissive: new THREE.Color(P.kin[0]), emissiveIntensity: 0.4 });
  const shardM = toon({ color: new THREE.Color(P.kiji[2]) });
  const HB = 3.7;   // 盤の半分の幅（上の面が y = 0）

  // ---------- 物理（cannon.js）：盤・駒・かけら・小判 ----------
  let world: CANNON.World, boardBodies: CANNON.Body[] = [];
  const dyn: { body: CANNON.Body; obj: THREE.Object3D; keep?: boolean }[] = [];
  function initPhys() {
    world = new CANNON.World({ gravity: new CANNON.Vec3(0, -22, 0) });
    world.allowSleep = true; world.broadphase = new CANNON.SAPBroadphase(world);
    (world.solver as any).iterations = 8;
    world.defaultContactMaterial.friction = 0.45; world.defaultContactMaterial.restitution = 0.28;
    const floor = new CANNON.Body({ mass: 0 }); floor.addShape(new CANNON.Plane());
    floor.quaternion.setFromEuler(-Math.PI / 2, 0, 0); floor.position.set(0, -7, 0); world.addBody(floor);   // 盤の下の受け皿（見えない）
  }
  const staticBox = (hx, hy, hz, x, y, z) => { const b = new CANNON.Body({ mass: 0 }); b.addShape(new CANNON.Box(new CANNON.Vec3(hx, hy, hz))); b.position.set(x, y, z); world.addBody(b); return b; };
  function wholeBoard() {   // 盤を元に戻す（割れていたら直す）
    for (const b of boardBodies) world.removeBody(b);
    boardBodies = [staticBox(HB, 0.6, HB, 0, -0.6, 0)];
    boardMesh.visible = true; boardMesh.position.set(0, -0.6, 0);
    for (const h of halves) board.remove(h); halves.length = 0;
  }
  function addDyn(obj: THREE.Object3D, shape: CANNON.Shape, mass: number, pos: THREE.Vector3, q?: THREE.Quaternion) {
    const body = new CANNON.Body({ mass, sleepSpeedLimit: 0.15, sleepTimeLimit: 0.6, linearDamping: 0.05, angularDamping: 0.08 });
    body.addShape(shape); body.position.set(pos.x, pos.y, pos.z);
    if (q) body.quaternion.set(q.x, q.y, q.z, q.w);
    world.addBody(body); pieces.add(obj); obj.position.copy(pos); if (q) obj.quaternion.copy(q);
    const e = { body, obj }; dyn.push(e); return e;
  }
  const rmDyn = (e) => { world.removeBody(e.body); pieces.remove(e.obj); const i = dyn.indexOf(e); if (i >= 0) dyn.splice(i, 1); };
  function clearDyn() { for (const e of [...dyn]) rmDyn(e); pieces.clear(); }
  const halves: THREE.Mesh[] = [];

  function init() {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, devicePixelRatio));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0, 0);
    renderer.localClippingEnabled = true;   // 色が塗られていく境目
    scene = new THREE.Scene();
    cam = new THREE.PerspectiveCamera(35, 1, 0.01, 200);
    hemi = new THREE.HemisphereLight(new THREE.Color(P.ao[2]), new THREE.Color(P.kiji[0]), 0.8 * LIGHT); scene.add(hemi);
    sun = new THREE.DirectionalLight(new THREE.Color(P.shiro[2]), 1.6 * LIGHT); sun.position.set(0.6, 1, 0.5); scene.add(sun);
    // 将棋盤
    board = new THREE.Group(); scene.add(board);
    const side = toon({ map: darkWoodTex }), top = toon({ map: boardTex });
    boardMesh = new THREE.Mesh(new THREE.BoxGeometry(HB * 2, 1.2, HB * 2), [side, side, top, side, side, side]); board.add(boardMesh);
    pieces = new THREE.Group(); scene.add(pieces);
    stays = new THREE.Group(); scene.add(stays);         // 盤に積もった紙吹雪・絵の具のしずく
    holder = new THREE.Group(); holder.visible = false; scene.add(holder);
    spinG = new THREE.Group(); holder.add(spinG);   // holder：カメラの方へ傾ける、spinG：その中で銃を回す
    // 暗幕：画面いっぱいの黒い幕で、盤や駒をまとめて暗くする。銃（と絵の具など）はそのあと上から描く（FRONT の層）
    veil = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthWrite: false, depthTest: false }));
    veil.renderOrder = 9999; veil.visible = false; scene.add(veil);
    hemi.layers.enable(FRONT); sun.layers.enable(FRONT);
    flash = new THREE.PointLight(new THREE.Color(P.daidai[2]), 0, 14, 1); scene.add(flash);   // 爆発の光（はじめから置いておき、明るさだけ変える）
    initPhys(); wholeBoard();
  }
  function mount(host: HTMLElement) {
    if (!renderer) init();
    host.appendChild(renderer.domElement);
    gs.menu3d = true;   // 開いている間は、後ろのゲームの画面を描かない（見えないので）
    if (!running) { running = true; lastT = performance.now(); requestAnimationFrame(loop); }
  }
  // 離れるときは描画の準備（WebGL）ごと片付ける（戦いの間まで GPU のメモリを持ち続けないように）。次に開いたら作り直す
  function hide() {
    running = false; clearTicks(); clearClip(); gs.menu3d = false;
    if (!renderer) return;
    renderer.domElement.remove(); renderer.dispose(); renderer.forceContextLoss(); renderer = null;
    dyn.length = 0; halves.length = 0;
  }
  function loop(now: number) {
    if (!running || !renderer || !renderer.domElement.isConnected) { running = false; if (renderer) hide(); return; }
    requestAnimationFrame(loop);
    const rdt = Math.min(0.05, (now - lastT) / 1000); lastT = now; T += rdt;
    const dt = rdt * slow;   // スローの間はゆっくり
    const host = renderer.domElement.parentElement, w = host.clientWidth, h = host.clientHeight, pr = renderer.getPixelRatio();
    if (renderer.domElement.width !== Math.floor(w * pr) || renderer.domElement.height !== Math.floor(h * pr)) { renderer.setSize(w, h); cam.aspect = w / Math.max(1, h); cam.updateProjectionMatrix(); }
    world.step(1 / 60, dt, 4);
    if (flash.intensity > 0) flash.intensity = Math.max(0, flash.intensity - rdt * 40 * LIGHT);
    for (const e of dyn) { e.obj.position.set(e.body.position.x, e.body.position.y, e.body.position.z); e.obj.quaternion.set(e.body.quaternion.x, e.body.quaternion.y, e.body.quaternion.z, e.body.quaternion.w); }
    for (let i = ticks.length - 1; i >= 0; i--) if (ticks[i](dt) === true) ticks.splice(i, 1);
    const vf = THREE.MathUtils.degToRad(cam.fov) / 2, hf = Math.atan(Math.tan(vf) * cam.aspect);
    // 結果の画面では、右に札・下に名前が並ぶので、絵をずらして左上の空いた所に見せる
    const res = phase === 'result' && w > 900;
    if (res) cam.setViewOffset(w, h, w * 0.17, h * 0.1, w, h); else cam.clearViewOffset();
    if (camMode === 'board') {
      const a = phase === 'top' ? T * 0.12 : 0, far = res ? 1.25 : 1;
      cam.position.set(Math.sin(a) * 7.8 * far, 9.5 * far, Math.cos(a) * 7.8 * far + 0.6); cam.lookAt(0, 0, 0.6);
      hemi.intensity = 0.5 * LIGHT; sun.intensity = 1.1 * LIGHT;   // 盤と駒は明るすぎないように
    } else {
      hemi.intensity = 0.8 * LIGHT; sun.intensity = 1.6 * LIGHT;
      const dist = radius / Math.tan(Math.min(vf, hf * (res ? 0.48 : 1))) * (phase === 'result' ? 0.85 : 1.05);
      if (orbiting) orbit += rdt * 0.7;
      // 登場の間は見下ろして、後ろの盤も見せる。銃はカメラの方へ傾けて、横から見た形のまま見せる
      const el = phase === 'result' ? 0.2 : 0.72, d2 = dist * (phase === 'result' ? 1 : 1.25);
      cam.position.set(hold.x + Math.cos(orbit) * Math.cos(el) * d2, hold.y + Math.sin(el) * d2, hold.z + Math.sin(orbit) * Math.cos(el) * d2); cam.lookAt(hold);
      holder.rotation.set(0, -orbit, phase === 'result' ? 0 : el * 0.85, 'YZX');
      spin += dt; spinG.rotation.y = phase === 'result' || orbiting ? spin * 0.4 : Math.sin(spin * 0.7) * 0.35;
    }
    if (shake > 0) { shake = Math.max(0, shake - rdt); cam.position.x += (Math.random() - 0.5) * shake * 0.5; cam.position.y += (Math.random() - 0.5) * shake * 0.5; }
    // 暗幕を使うときは2回に分けて描く：1回目は銃以外（最後に幕で暗くする）、2回目は銃などだけを上から
    const vm = veil.material as THREE.MeshBasicMaterial;
    vm.opacity += ((camMode === 'gun' ? veilTo : 0) - vm.opacity) * Math.min(1, rdt * 5);
    veil.visible = vm.opacity > 0.01;
    if (veil.visible) {
      cam.updateMatrixWorld();
      veil.position.copy(cam.position).add(new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion)); veil.quaternion.copy(cam.quaternion); veil.scale.setScalar(10);
      cam.layers.set(0); renderer.render(scene, cam);
      renderer.autoClear = false; renderer.clearDepth(); cam.layers.set(FRONT); renderer.render(scene, cam); renderer.autoClear = true;
    } else {
      cam.layers.set(0); cam.layers.enable(FRONT); renderer.render(scene, cam);
    }
  }

  // ---------- 小さな演出の部品 ----------
  // 舞う光のつぶ
  function burst(pos: THREE.Vector3, color: number, n: number, speed: number, size: number) {
    for (let i = 0; i < n; i++) {
      const sp = new THREE.Sprite(addMat(color)); sp.position.copy(pos); sp.scale.setScalar(size * (0.5 + Math.random()));
      const v = new THREE.Vector3((Math.random() - 0.5) * speed, speed * (0.6 + Math.random()), (Math.random() - 0.5) * speed);
      addFx(sp); let t = 0; const life = 0.7 + Math.random() * 0.6;
      ticks.push(dt => { t += dt; v.y -= speed * 1.2 * dt; sp.position.addScaledVector(v, dt); sp.material.opacity = 1 - t / life; if (t >= life) { rmFx(sp); return true; } });
    }
  }
  // 光の柱（y0 から上へ）
  function beam(at: THREE.Vector3, col: number, rad: number, big: number, y0 = 0, len = 7) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad * 0.7, len, 20, 1, true),
      new THREE.MeshBasicMaterial({ map: beamTex, color: col, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    m.position.set(at.x, y0 + len / 2, at.z); m.scale.y = 0.01; addFx(m);
    let t = 0;
    ticks.push(dt => { t += dt; m.scale.y = Math.min(1, t / 0.25); (m.material as THREE.MeshBasicMaterial).opacity = t < 0.6 ? 1 : Math.max(0.25 + big * 0.1, 1 - (t - 0.6)); m.rotation.y += dt; return !m.parent; });
    return m;
  }
  // 盤の上の駒を跳ねさせる（近い物ほど強く）
  function hop(at: THREE.Vector3, r: number, power: number) {
    for (const e of dyn) {
      const p = e.body.position, d = Math.hypot(p.x - at.x, p.z - at.z);
      if (d > r || e.body.mass === 0) continue;
      e.body.wakeUp(); e.body.velocity.y += power * (1 - d / r) + 0.5;
      e.body.angularVelocity.set(rand(-6, 6), rand(-6, 6), rand(-6, 6));
    }
  }
  const dust = (at: THREE.Vector3, n = 14) => burst(at.clone().setY(0.1), P.kiji[1], n, 2.5, 0.25);

  // 寝かせた駒（ふつうは裏向き＝字が下）。物理の形は、寝かせた向きの箱
  const PS = 1.05;   // 駒の大きさ
  function piece(ch: string, s = PS, m = pieceWoodMat, up = false) {   // up：表向き
    const g = new THREE.Group(), p = makePiece(ch, 0.8, 0.92, 0.26, m);
    p.rotation.x = up ? -Math.PI / 2 : Math.PI / 2; g.add(p); g.scale.setScalar(s);
    return g;
  }
  const pieceShape = (s = PS) => new CANNON.Box(new CANNON.Vec3(0.4 * s, 0.13 * s, 0.46 * s));
  const yawQ = (a: number) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a);

  // 何も引いていないとき：盤の上に裏向きの駒が少し置いてあり、カメラがゆっくり回る
  function idle() {
    camMode = 'board'; board.visible = true; holder.visible = false; orbiting = false; slow = 1; veilTo = 0;
    pieces.visible = stays.visible = true;
    clearTicks(); clearClip(); clearDyn(); stays.clear(); wholeBoard(); flash.intensity = 0;
    for (let i = 0; i < 5; i++) addDyn(piece('歩'), pieceShape(), 1, new THREE.Vector3(rand(-2, 2), 0.14 + i * 0.01, rand(-2, 2)), yawQ(rand(0, 6)));
  }

  // ---------- 1〜3：初形の盤が連続で大爆発 → 駒が降る → 結果の駒が決まった所へ飛んできて着地 ----------
  const CELL = HB * 2 * (1 - 2 / (2 * BH + 2)) / 9;   // 盤の升目の幅（盤の絵と同じ）
  const INIT = ['香桂銀金玉金銀桂香', ' 飛     角 ', '歩歩歩歩歩歩歩歩歩'];   // 後手から見た上の3段（先手は点対称）
  const RAIN_CH = '歩歩歩香桂銀金角飛';
  const slots = new Map<Owned, { e: any; pos: THREE.Vector3 }>();   // 結果ごとの駒
  // 将棋の初形に並べる（先手は奥を向き、後手はこちらを向く）
  function setUp() {
    for (let row = 0; row < 3; row++) for (let col = 0; col < 9; col++) {
      const ch = INIT[row][col]; if (ch === ' ') continue;
      const s = ch === '歩' ? 0.62 : ch === '玉' ? 0.74 : 0.68;
      for (const side of [-1, 1]) {   // -1：後手（奥）、1：先手（手前）
        const x = (col - 4) * CELL * -side, z = (row - 4) * CELL * -side;
        addDyn(piece(side > 0 && ch === '玉' ? '王' : ch, s, pieceWoodMat, true), pieceShape(s), 1, new THREE.Vector3(x, 0.13 * s + 0.002, z), yawQ(side > 0 ? 0 : Math.PI)).body.sleep();
      }
    }
  }
  async function drop(items: Owned[], order: number[], my: number) {
    idle(); clearDyn(); slots.clear(); setUp();
    const n = items.length, top = Math.max(...items.map(it => RANK[rarOf(it)]));
    await wait(0.7); if (my !== runId) return;
    // 1 連続の大爆発と、同時に空から駒が降ってくる（結果の駒もまぎれている）
    const blasts = 6 + top * 2;
    const rainN = n === 10 ? 45 : 32;
    // 降らせる駒（x：結果の駒。wide：盤の外まで広く）
    const rainOne = (x: Owned | null, wide: boolean) => {
      const s = x ? PS : rand(0.6, 0.72), up = !x && Math.random() < 0.5, w = wide ? 4 : 3;
      const e = addDyn(piece(x ? RAR_CH[rarOf(x)] : RAIN_CH[(Math.random() * RAIN_CH.length) | 0], s, pieceWoodMat, up), pieceShape(s), 1,
        new THREE.Vector3(rand(-w, w), rand(9, 12), rand(-w, w)), new THREE.Quaternion().setFromEuler(new THREE.Euler(rand(0, 6), rand(0, 6), rand(0, 6))));
      e.body.velocity.set(rand(-1, 1), rand(-6, -2), rand(-1, 1)); e.body.angularVelocity.set(rand(-8, 8), rand(-8, 8), rand(-8, 8));
      if (x) slots.set(x, { e, pos: null });
    };
    let booming = true;
    await Promise.all([
      (async () => {
        // 盤のあちこちで（真ん中から始まり、四隅・辺へ。最後はまた真ん中で特大）
        const spots = [[2.3, 2.3], [-2.3, 2.3], [2.3, -2.3], [-2.3, -2.3], [0, 2.6], [0, -2.6], [2.6, 0], [-2.6, 0]].sort(() => Math.random() - 0.5);
        spots.unshift([0, 0]);
        for (let i = 0; i < blasts; i++) {
          if (my !== runId) return;
          const [sx, sz] = i === blasts - 1 ? [0, 0] : spots[i % spots.length], at = new THREE.Vector3(sx + rand(-0.6, 0.6), 0, sz + rand(-0.6, 0.6));
          explode(at, i === blasts - 1 ? 1.5 : rand(0.8, 1.2));
          await wait(i === blasts - 2 ? 0.45 : rand(0.14, 0.28));   // 最後の一発は少し間をおいて特大
        }
        booming = false;
      })(),
      (async () => {
        // 爆発の間に降る駒は、爆風で飛び散る
        await wait(0.35);
        while (booming) { if (my !== runId) return; rainOne(null, true); await wait(0.06); }
        // 爆発のあと：どっと降って盤に積もる（結果の駒もまぎれている）
        const seq: (Owned | null)[] = Array(rainN).fill(null);
        for (const i of order) seq.splice(Math.floor(rand(0, seq.length + 1)), 0, items[i]);
        for (const x of seq) { if (my !== runId) return; rainOne(x, false); await wait(0.025); }
      })(),
    ]);
    if (my !== runId) return;
    // 落ち着くまで待つ
    for (let t = 0; t < 2.5; t += 0.25) {
      await wait(0.25); if (my !== runId) return;
      if (t > 0.75 && [...slots.values()].every(s => s.e.body.velocity.length() < 0.6)) break;
    }
    // 2・3 結果の駒が決まった所へ飛んできて、表を向いて着地。着地の瞬間にまわりの駒を吹き飛ばす（10連は円に並ぶ）
    for (let k = 0; k < order.length; k++) {
      if (my !== runId) return;
      const it = items[order[k]], a = Math.PI / 2 + (k / n) * Math.PI * 2;
      const to = n === 1 ? new THREE.Vector3(0, 0, 0.3) : new THREE.Vector3(Math.cos(a) * 2.35, 0, Math.sin(a) * 2.35 + 0.1);
      await flyIn(slots.get(it), to, rarOf(it));
      await wait(n === 1 ? 0.5 : RANK[rarOf(items[order[k + 1]] ?? it)] >= 2 ? 0.35 : 0.12);
    }
    await wait(n === 1 ? 0.8 : 1);
  }
  // 大爆発：火の玉・煙・火花・衝撃波の輪・焦げ跡。まわりの駒を吹き飛ばす
  const scorchM = new THREE.MeshBasicMaterial({ color: new THREE.Color(P.sumi[0]), transparent: true, opacity: 0.3, depthWrite: false });
  function explode(at: THREE.Vector3, big: number) {
    SFX.play('gBoom', big); shake = Math.max(shake, 0.45 * big);
    flash.position.set(at.x, 1.2, at.z); flash.intensity = 9 * big * LIGHT;
    // 火の玉（ふくらんで消える）
    for (let i = 0; i < 7; i++) {
      const sp = new THREE.Sprite(addMat(i % 2 ? P.daidai[2] : P.ki[2])); addFx(sp);
      const off = new THREE.Vector3(rand(-0.5, 0.5), rand(0.2, 1), rand(-0.5, 0.5)).multiplyScalar(big);
      let t = 0; const life = rand(0.3, 0.5), sz = rand(1.6, 2.8) * big;
      ticks.push(dt => { t += dt; const k = t / life; sp.position.copy(at).add(off).addScaledVector(off, k); sp.scale.setScalar(sz * (0.3 + k)); sp.material.opacity = 1 - k; if (k >= 1) { rmFx(sp); return true; } });
    }
    // 煙（ゆっくり上がって広がる）
    for (let i = 0; i < 6; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(P.nezumi[i % 2]), transparent: true, depthWrite: false, opacity: 0 })); addFx(sp);
      sp.position.set(at.x + rand(-0.6, 0.6), rand(0.3, 1), at.z + rand(-0.6, 0.6));
      let t = 0; const life = rand(1.2, 1.8), sz = rand(1.5, 2.5) * big, rise = rand(1, 2);
      ticks.push(dt => { t += dt; const k = t / life; sp.position.y += rise * dt; sp.scale.setScalar(sz * (0.5 + k)); sp.material.opacity = 0.55 * Math.min(1, t * 6) * (1 - k); if (k >= 1) { rmFx(sp); return true; } });
    }
    burst(at.clone().setY(0.3), P.daidai[2], 14, 7 * big, 0.14);
    // 衝撃波の輪
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.05, 6, 32), new THREE.MeshBasicMaterial({ color: P.daidai[2], transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    ring.rotation.x = Math.PI / 2; ring.position.set(at.x, 0.2, at.z); addFx(ring);
    let rt = 0;
    ticks.push(dt => { rt += dt; ring.scale.setScalar(0.2 + rt * 9 * big); (ring.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - rt * 2.5); if (rt > 0.4) { rmFx(ring); return true; } });
    // 焦げ跡
    if (boardBodies.length === 1 && Math.abs(at.x) < HB && Math.abs(at.z) < HB) {
      const s = new THREE.Mesh(splatGeo, scorchM); s.position.set(at.x, 0.006 + Math.random() * 0.003, at.z); s.scale.setScalar(rand(0.35, 0.55) * big); stays.add(s);
    }
    blast(at, 3.2 * big, 14 * big);
  }
  // まわりの駒を外へ吹き飛ばす（近い物ほど強く）
  function blast(at: THREE.Vector3, r: number, power: number) {
    const d = new THREE.Vector3();
    for (const e of dyn) {
      if (e.body.mass === 0) continue;
      const p = e.body.position; d.set(p.x - at.x, 0, p.z - at.z);
      const dist = d.length(); if (dist > r) continue;
      const k = 1 - dist / r;
      if (dist < 0.01) d.set(rand(-1, 1), 0, rand(-1, 1)); d.normalize();
      e.body.wakeUp();
      e.body.velocity.set(e.body.velocity.x + d.x * power * k * rand(0.7, 1.1), e.body.velocity.y + power * k * rand(0.6, 1) + 1, e.body.velocity.z + d.z * power * k * rand(0.7, 1.1));
      e.body.angularVelocity.set(rand(-14, 14), rand(-14, 14), rand(-14, 14));
    }
  }
  // 結果の駒：今いる所から弧を描いて飛んできて、くるくる回って表向きに着地。着地の瞬間にまわりを吹き飛ばす
  async function flyIn(s: { e: any; pos: THREE.Vector3 }, land: THREE.Vector3, r: string) {
    const e = s.e, g = e.obj as THREE.Group, p = g.children[0];
    world.removeBody(e.body); dyn.splice(dyn.indexOf(e), 1);   // 物理から外して、手で動かす
    const start = g.position.clone(), q0 = g.quaternion.clone(), q1 = yawQ(0), rx0 = p.rotation.x;
    land = land.clone().setY(0.14 * PS);
    const col = RAR_COL[r], big = { N: 0, R: 1, SR: 1.4, LR: 2.2 }[r];
    const dur = 0.55 + big * 0.08, arc = 2.2 + big * 0.6 + Math.max(0, -start.y) * 0.3;
    SFX.play('sel');
    await new Promise<void>(res => {
      let t = 0;
      ticks.push(dt => {
        t += dt; const k = Math.min(1, t / dur), ez = k * k * (3 - 2 * k);
        g.position.lerpVectors(start, land, ez); g.position.y += Math.sin(Math.PI * k) * arc;
        g.quaternion.slerpQuaternions(q0, q1, ez);
        p.rotation.x = rx0 + (-Math.PI / 2 - Math.PI * 4 - rx0) * ez;   // 何回かまわって表
        if (big && Math.random() < 0.7) burst(g.position.clone(), col, 1, 0.6, 0.14 + big * 0.04);   // 光の尾
        if (k >= 1) { res(); return true; }
      });
    });
    g.position.copy(land); g.quaternion.copy(q1); p.rotation.x = -Math.PI / 2; s.pos = land.clone(); dyn.push(e);
    // 着地：表になった駒は動かない台として物理に戻し、まわりの駒を吹き飛ばす
    const sb = new CANNON.Body({ mass: 0 }); sb.addShape(pieceShape()); sb.position.set(land.x, land.y, land.z); world.addBody(sb); e.body = sb; e.keep = true;
    SFX.play('gThud'); shake = Math.max(shake, 0.3 + big * 0.15);
    blast(land, 2 + big * 0.5, 10 + big * 3); dust(land, 16 + big * 6);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.04, 6, 32), new THREE.MeshBasicMaterial({ color: col, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    ring.rotation.x = Math.PI / 2; ring.position.set(land.x, 0.1, land.z); addFx(ring);
    let rt = 0;
    ticks.push(dt => { rt += dt; ring.scale.setScalar(0.3 + rt * (5 + big * 2)); (ring.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - rt * 3); if (rt > 0.35) { rmFx(ring); return true; } });
    SFX.play(r === 'LR' ? 'battle' : r === 'SR' ? 'promo' : r === 'R' ? 'ding' : 'place');
    burst(land.clone().setY(0.3), col, 6 + big * 18, 3 + big * 1.5, 0.12 + big * 0.05);
    if (big) beam(land, col, 0.35 * PS * big, big);
    if (r === 'LR') shake = 0.8;
  }

  // ---------- 4・5：銃 ----------
  // 武器ごとに「色のない銃」と「色の付いた銃」を1組ずつ作って重ね、境目の前後で片方ずつ見せる
  const pairs: Record<string, any> = {};
  const plainM = toon({ color: new THREE.Color(P.shiro[1]).multiplyScalar(0.7) });   // 色のない銃（真っ白だと形が見えないので少し灰色）
  let touched: THREE.Material[] = [];
  function pairFor(m: string) {
    if (pairs[m]) return pairs[m];
    const mk = () => { const g = GUN_BUILDERS[m](); g.g.traverse((o: any) => { if (o.material === handMat) o.visible = false; }); return g; };
    const a = mk(), b = mk(), inner = new THREE.Group();
    a.g.traverse((o: any) => { if (o.isMesh && o.visible && o.material !== handMat) o.material = Array.isArray(o.material) ? o.material.map(() => plainM) : plainM; });   // 色のない銃
    inner.add(a.g, b.g);
    const box = new THREE.Box3().setFromObject(a.g), c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
    inner.position.copy(c).negate();
    // 塗られていく境目の光る面
    const edge = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: glowTex, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    edge.scale.set(size.x * 2.2, size.y * 1.6, 1); edge.position.set(c.x, c.y, 0); edge.visible = false; inner.add(edge);
    front(inner);
    return pairs[m] = { a, b, inner, edge, c, zMin: box.min.z, zMax: box.max.z, radius: size.length() / 2, halfY: size.y / 2, size };
  }
  const planeA = new THREE.Plane(), planeB = new THREE.Plane();
  function clip(gun: any, plane: THREE.Plane) {
    gun.g.traverse((o: any) => {
      if (!o.isMesh || o.material === handMat) return;
      for (const mt of Array.isArray(o.material) ? o.material : [o.material]) { mt.clippingPlanes = [plane]; touched.push(mt); }
    });
  }
  function clearClip() { for (const mt of touched) mt.clippingPlanes = null; touched = []; }
  // 銃を用意する（sc：見せる大きさの倍率）
  function useGun(it: Owned, sc: number) {
    const pr = pairFor(modelOf(it));
    clearClip(); spinG.clear(); spinG.add(pr.inner); holder.visible = true;
    holder.scale.setScalar(sc); holder.rotation.set(0, 0, 0); spinG.rotation.set(0, 0, 0);
    camMode = 'gun'; radius = pr.radius * sc; spin = 0;
    pr.a.g.visible = true; pr.b.g.visible = false;   // 色の付いた銃は、塗り始めるまで隠す
    paintGun(pr.b, [it.base, it.seed]);     // 引いた色
    front(pr.inner);                        // 飾りの部品が付け替わるので、毎回手前の層へ
    return pr;
  }
  // 駒が割れて、木のかけらが飛び散る
  // 駒が宙に持ち上がって震え、割れて木のかけらが飛び散る
  async function shatter(s: { e: any; pos: THREE.Vector3 }, r: string) {
    const e = s.e, g = e.obj as THREE.Group, from = g.position.clone(), q0 = g.quaternion.clone();
    world.removeBody(e.body); const i = dyn.indexOf(e); if (i >= 0) dyn.splice(i, 1);   // 手で動かす
    const col = RAR_COL[r], lift = 2.2;
    SFX.play('sel');
    await new Promise<void>(res => {
      let t = 0;
      ticks.push(dt => {
        t += dt; const k = Math.min(1, t / 0.9), up = 1 - (1 - Math.min(1, k / 0.55)) ** 3, tr = Math.max(0, (k - 0.5) / 0.5);   // 上がって、震える
        g.position.set(from.x + rand(-1, 1) * tr * 0.06, from.y + up * lift, from.z + rand(-1, 1) * tr * 0.06);
        g.quaternion.copy(q0); g.rotateX(up * 0.9);   // こちらへ字を向ける
        if (tr > 0 && Math.random() < 0.5) burst(g.position.clone(), col, 1, 1.2, 0.12);
        if (k >= 1) { res(); return true; }
      });
    });
    const at = g.position.clone();
    rmDyn(e);
    SFX.play('gShatter'); burst(at, P.kiji[1], 14, 3, 0.2); burst(at, col, 10, 4, 0.16); shake = Math.max(shake, 0.25);
    for (let j = 0; j < 18; j++) {
      const w = rand(0.08, 0.22), sh = new THREE.Mesh(new THREE.BoxGeometry(w, w * 0.4, w * 1.4), shardM);
      const d = addDyn(sh, new CANNON.Box(new CANNON.Vec3(w / 2, w * 0.2, w * 0.7)), 0.1, at.clone().add(new THREE.Vector3(rand(-0.3, 0.3), rand(-0.2, 0.2), rand(-0.3, 0.3))));
      d.body.velocity.set(rand(-5, 5), rand(1, 6), rand(-5, 5)); d.body.angularVelocity.set(rand(-15, 15), rand(-15, 15), rand(-15, 15));
    }
    return at.setY(0);
  }
  // 盤が真っ二つに割れる（LR）：左右に開いて傾き、真ん中の割れ目から光
  async function splitBoard(my: number) {
    if (boardBodies.length !== 1) return;
    SFX.play('gCrack'); shake = 1;
    boardMesh.visible = false;
    for (const b of boardBodies) world.removeBody(b); boardBodies = [];
    const side = (boardMesh.material as THREE.Material[])[0], top = (boardMesh.material as THREE.Material[])[2];
    for (const s of [-1, 1]) { const h = new THREE.Mesh(new THREE.BoxGeometry(HB, 1.2, HB * 2), [side, side, top, side, side, side]); h.position.set(s * HB / 2, -0.6, 0); board.add(h); halves.push(h); }
    // 割れ目のあたりの駒は少し跳ねる
    hop(new THREE.Vector3(0, 0, 0), 2.5, 4);
    let t = 0;
    await new Promise<void>(res => ticks.push(dt => {
      t += dt; const k = Math.min(1, t / 0.7), e = 1 - (1 - k) ** 3;
      halves.forEach((h, i) => { const s = i ? 1 : -1; h.position.x = s * (HB / 2 + e * 1.6); h.rotation.z = -s * e * 0.12; h.position.y = -0.6 - e * 0.4; });
      if (k >= 1) { res(); return true; }
    }));
    if (my !== runId) return;
    // 開いた盤の半分ずつを、動かない台として物理に入れる
    boardBodies = halves.map((h, i) => { const s = i ? 1 : -1; const b = staticBox(HB / 2, 0.6, HB, s * (HB / 2 + 1.6), -1, 0); b.quaternion.setFromEuler(0, 0, -s * 0.12); return b; });
  }

  // 銃の登場から色塗りまで
  async function paint(it: Owned, my: number) {
    clearTicks(); orbiting = false; orbit = Math.PI / 2; slow = 1; veilTo = 0;   // 盤の手前（正面）から見る
    const r = rarOf(it), s = slots.get(it), lr = r === 'LR';
    if (!lr && boardBodies.length !== 1) wholeBoard();
    board.visible = true;
    const pr = pairFor(modelOf(it)), sc = 1.25 / pr.radius;
    // 4 駒が割れる
    const at = s ? await shatter(s, r) : new THREE.Vector3(0, 0, 0);
    if (my !== runId) return;
    await wait(0.3); if (my !== runId) return;
    useGun(it, sc);
    const pos = lr ? new THREE.Vector3(0, 0, 0) : at.clone();
    hold.set(pos.x, 2.6, pos.z);
    if (lr) {
      // 5 LR：盤が割れ、下から光の柱と共に銃がせり上がる
      await splitBoard(my); if (my !== runId) return;
      beam(new THREE.Vector3(0, 0, 0), P.kin[2], 1.2, 3, -7, 18);
      burst(new THREE.Vector3(0, 0, 0), P.kin[2], 40, 5, 0.3);
      holder.position.set(0, -3, 0);
      await new Promise<void>(res => { let t = 0; ticks.push(dt => { t += dt; const k = Math.min(1, t / 1.4), e = 1 - (1 - k) ** 3; holder.position.y = -3 + (hold.y + 3) * e; if (k >= 1) { veilTo = 0.55; res(); return true; }   /* LR は花火も見えるように少し薄く */ }); });
    } else {
      // 4 銃が上から落ちて盤で1回跳ね、宙に浮いて回り始める
      const hy = pr.halfY * sc;
      holder.position.set(pos.x, 9, pos.z);
      await new Promise<void>(res => {
        let v = 0, bounced = false, t = 0;
        ticks.push(dt => {
          if (!bounced) {
            v -= 30 * dt; holder.position.y += v * dt;
            if (holder.position.y <= hy) { holder.position.y = hy; v = 7.5; bounced = true; veilTo = 0.75; SFX.play('gThud'); shake = Math.max(shake, 0.3); hop(pos, 2, 3.5); dust(pos, 16); }
            return;
          }
          t += dt; v -= 30 * dt * Math.max(0, 1 - t * 1.6); holder.position.y += v * dt;
          holder.position.y += (hold.y - holder.position.y) * Math.min(1, dt * 4 * Math.min(1, t * 2));   // 宙に浮いて止まる
          if (t > 0.9) { res(); return true; }
        });
      });
    }
    if (my !== runId) return;
    await paintSweep(it, pr, sc, my);
  }
  // 白黒の銃に、後ろから前へ色が塗られる。絵の具のしずくが飛び散って盤に落ちる
  async function paintSweep(it: Owned, pr: any, sc: number, my: number) {
    const r = rarOf(it), sk = SKINS[pr.b.skin], cols = gachaColors(it.seed, DESIGNS[it.base].colors.length);
    clip(pr.a, planeA); clip(pr.b, planeB); pr.b.g.visible = true;
    let p = pr.zMax + 0.01, fast = false;
    const setP = () => {
      pr.inner.updateMatrixWorld(true);
      planeA.set(new THREE.Vector3(0, 0, -1), p).applyMatrix4(pr.inner.matrixWorld);   // 白黒：境目より前
      planeB.set(new THREE.Vector3(0, 0, 1), -p).applyMatrix4(pr.inner.matrixWorld);   // 色：境目より後ろ
      pr.edge.position.z = p;
    };
    setP();
    ticks.push(() => { setP(); return !holder.visible; });   // 銃が回っても境目がついていく
    SFX.play('swap');
    advance = () => { fast = true; };   // クリックで塗り終わりまで飛ばす
    const dur = { N: 0.9, R: 1.1, SR: 1.3, LR: 1.7 }[r];
    pr.edge.material.color.setHex(cols[0]); pr.edge.visible = true;
    SFX.play('inspect');
    const dropM = cols.map(c => toon({ color: new THREE.Color(c) }));
    await new Promise<void>(res => {
      let k = 0;
      ticks.push(dt => {
        k = fast ? 1 : Math.min(1, k + dt / dur);
        const e = k * k * (3 - 2 * k);
        p = pr.zMax + 0.01 + (pr.zMin - pr.zMax - 0.02) * e; setP();
        // 絵の具のしずく
        for (let j = 0; j < 3; j++) {
          const src = pr.inner.localToWorld(new THREE.Vector3(pr.c.x + rand(-0.5, 0.5) * pr.size.x, pr.c.y + rand(-0.5, 0.5) * pr.size.y, p));
          paintDrop(src, dropM[(Math.random() * dropM.length) | 0]);
        }
        if (k >= 1) { pr.edge.visible = false; res(); return true; }
      });
    });
    advance = null;
    if (my !== runId) return;
    // 塗り終わり：絵の具がばしゃっと飛び散る
    for (let j = 0; j < 45; j++) paintDrop(pr.inner.localToWorld(pr.c.clone().add(new THREE.Vector3(rand(-0.4, 0.4) * pr.size.x, rand(-0.4, 0.4) * pr.size.y, rand(-0.4, 0.4) * pr.size.z))), dropM[j % dropM.length], 2.5);
    SFX.play(r === 'LR' ? 'win' : r === 'SR' ? 'promo' : r === 'R' ? 'ding' : 'sel');
    burst(hold.clone(), RAR_COL[r], 10 + (r === 'LR' ? 40 : r === 'SR' ? 20 : 6), radius * 3, radius * 0.06);
    if (r === 'LR' && sk?.fx) await lrShow(pr, sk.fx, my);
  }
  const dropGeo = new THREE.SphereGeometry(0.05, 6, 4), splatGeo = new THREE.CircleGeometry(1, 10).rotateX(-Math.PI / 2);
  function paintDrop(at: THREE.Vector3, m: THREE.Material, sp = 1) {
    const d = front(new THREE.Mesh(dropGeo, m)); d.position.copy(at); addFx(d);
    const v = new THREE.Vector3(rand(-3, 3) * sp, rand(0.5, 3) * sp, rand(-3, 3) * sp);
    ticks.push(dt => {
      v.y -= 15 * dt; d.position.addScaledVector(v, dt);
      const onBoard = boardBodies.length === 1 && Math.abs(d.position.x) < HB && Math.abs(d.position.z) < HB;
      if ((onBoard && d.position.y <= 0.01) || d.position.y < -4) { rmFx(d); return true; }   // 盤に落ちたら消える（しみは残さない）
    });
  }

  // LR：画面が暗くなり、銃のまわりに光が舞い、銃口の光と弾の線で連射。金の小判と金の駒が降って積もり、花火、カメラが回り込む
  async function lrShow(pr: any, fx: any, my: number) {
    $('ga')?.classList.add('dark');
    orbiting = true;
    aura(pr, fx.aura ?? fx.flash);
    goldRain(my);
    fireworks(my);
    for (let i = 0; i < 6; i++) {
      if (my !== runId) return;
      shot(pr, fx);
      await wait(0.16);
    }
    await wait(1.2);
  }
  function aura(pr: any, col: number) {
    const ms: any[] = []; pr.b.g.traverse((o: any) => { if (o.isMesh && o.visible && o.geometry.attributes.position) ms.push(o); });
    const v = new THREE.Vector3();
    ticks.push(dt => {
      if (!spinG.children.includes(pr.inner)) return true;
      for (let j = 0; j < 2; j++) {
        if (Math.random() > dt * 30) continue;
        const m = ms[Math.floor(Math.random() * ms.length)], pa = m.geometry.attributes.position;
        v.fromBufferAttribute(pa, Math.floor(Math.random() * pa.count)).applyMatrix4(m.matrixWorld);
        const sp = front(new THREE.Sprite(addMat(col))); sp.position.copy(v); sp.scale.setScalar(radius * (0.02 + Math.random() * 0.03)); addFx(sp);
        let t = 0; const life = 1 + Math.random(), rise = radius * 0.15;
        ticks.push(d2 => { t += d2; sp.position.y += rise * d2; sp.material.opacity = Math.sin(Math.PI * Math.min(1, t / life)); if (t >= life) { rmFx(sp); return true; } });
      }
    });
  }
  function shot(pr: any, fx: any) {
    const mz = pr.b.muzzle.getWorldPosition(new THREE.Vector3());
    const fwd = new THREE.Vector3(0, 0, -1).transformDirection(pr.inner.matrixWorld);
    const fl = front(new THREE.Sprite(addMat(fx.flash))); fl.position.copy(mz); fl.scale.setScalar(radius * 0.5); addFx(fl);
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([mz, mz.clone().addScaledVector(fwd, radius * 8)]), new THREE.LineBasicMaterial({ color: fx.tracer ?? fx.flash, transparent: true }));
    front(line); addFx(line);
    let t = 0;
    ticks.push(dt => { t += dt; fl.material.opacity = 1 - t / 0.08; (line.material as THREE.LineBasicMaterial).opacity = 1 - t / 0.14; if (t > 0.14) { rmFx(fl, line); return true; } });
    shake = Math.max(shake, 0.08);
  }
  // 金の小判と金の駒が大量に降り注ぎ、積もって山になる
  async function goldRain(my: number) {
    const coinGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.05, 12);
    SFX.play('gCoins');
    for (let i = 0; i < 90; i++) {
      if (my !== runId) return;
      const at = new THREE.Vector3(rand(-3.6, 3.6), rand(8, 11), rand(-3, 3));
      if (i % 4 === 0) {
        const e = addDyn(piece(i % 8 === 0 ? '王' : '金', 0.75, goldM), pieceShape(0.75), 1, at, yawQ(rand(0, 6)));
        e.body.angularVelocity.set(rand(-6, 6), rand(-6, 6), rand(-6, 6));
      } else {
        const e = addDyn(new THREE.Mesh(coinGeo, goldM), new CANNON.Box(new CANNON.Vec3(0.18, 0.025, 0.18)), 0.2, at, yawQ(rand(0, 6)));
        e.body.angularVelocity.set(rand(-10, 10), rand(-10, 10), rand(-10, 10));
      }
      if (i % 20 === 19) SFX.play('gCoins');
      await wait(0.03);
    }
  }
  // 打ち上げ花火：ひゅーっと上がって、はじける
  async function fireworks(my: number) {
    const palette = [P.kin[2], P.shu[2], P.fuji[2], P.ao[2], P.midori[2], P.momo[2]];
    for (let i = 0; i < 7; i++) {
      if (my !== runId) return;
      const col = palette[i % palette.length], from = new THREE.Vector3(rand(-9, 9), -3, rand(-9, -4)), top = from.clone().setY(rand(9, 13));
      const rocket = new THREE.Sprite(addMat(col)); rocket.scale.setScalar(0.35); rocket.position.copy(from); addFx(rocket);
      SFX.play('fwLaunch');
      let t = 0;
      ticks.push(dt => {
        t += dt; const k = Math.min(1, t / 0.8);
        rocket.position.lerpVectors(from, top, 1 - (1 - k) ** 2);
        if (Math.random() < 0.6) burst(rocket.position.clone(), col, 1, 0.5, 0.12);
        if (k >= 1) {
          rmFx(rocket); SFX.play('fwPop');
          for (let j = 0; j < 70; j++) {
            const sp = new THREE.Sprite(addMat(j % 5 ? col : P.shiro[2])); sp.position.copy(top); sp.scale.setScalar(rand(0.15, 0.3)); addFx(sp);
            const v = new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(rand(4, 7));
            let u = 0; const life = rand(1.1, 1.7);
            ticks.push(d2 => { u += d2; v.y -= 3 * d2; v.multiplyScalar(1 - d2 * 0.8); sp.position.addScaledVector(v, d2); sp.material.opacity = 1 - u / life; if (u >= life) { rmFx(sp); return true; } });
          }
          return true;
        }
      });
      await wait(rand(0.35, 0.7));
    }
  }

  // 結果の画面：選んだものを色つきで回して見せる（LR は光も舞う）。盤は見せない
  function showcase(it: Owned) {
    clearTicks(); orbiting = false; slow = 1; veilTo = 0;
    board.visible = false; pieces.visible = false; stays.visible = false;
    const pr = useGun(it, 1), sk = SKINS[pr.b.skin];
    holder.position.set(0, 0, 0); hold.set(0, 0, 0); orbit = Math.PI / 2;
    pr.a.g.visible = false; pr.b.g.visible = true; pr.edge.visible = false;
    if (sk?.fx?.aura !== undefined) aura(pr, sk.fx.aura);
  }
  return { mount, hide, idle, drop, paint, showcase };
})();
