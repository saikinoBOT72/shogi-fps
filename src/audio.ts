// 効果音（すべて Web Audio で合成）
import { V3, rand, settings } from './core';

// ================= サウンド（すべて合成） =================
// 部品：N 雑音（フィルター付き）/ T 音程が動く音 / P 音程一定の減衰音 / tick 金属の「カチャ」/ scrape 金属の擦れ / seat はまる音 / wood 木の「コン」
// 残響（reverb）は銃声などに少し足す。音ごとの作りはチャットの試聴で選んだもの
export const SFX = (() => {
  let ctx = null, master, noiseBuf, verb;
  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const comp = ctx.createDynamicsCompressor();
    master = ctx.createGain(); master.gain.value = settings.vol;
    master.connect(comp).connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // 残響：だんだん小さくなる雑音を響きの形にする
    const len = Math.floor(ctx.sampleRate * 1.4), ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const x = ir.getChannelData(c); for (let i = 0; i < len; i++) x[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.4); }
    verb = ctx.createConvolver(); verb.buffer = ir;
    const vg = ctx.createGain(); vg.gain.value = 0.4; verb.connect(vg).connect(master);
    // 立体音響（HRTF）は最初の1回の準備が重いので、無音で先に済ませておく
    const warm = ctx.createGain(); warm.gain.value = 0; warm.connect(master);
    const p = ctx.createPanner(); p.panningModel = 'HRTF'; p.connect(warm);
    const o = ctx.createOscillator(); o.connect(p); o.start(); o.stop(ctx.currentTime + 0.05);
  }
  // 出口：pos があれば立体音響。wet は残響の量、far は遠くの音（その周波数より高い音を削る）、to は出し先
  function out(pos?, wet = 0, far = 0, to = master) {
    const g = ctx.createGain();
    let head: any = g;
    if (far) { const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = far; g.connect(lp); head = lp; }
    if (pos) {
      const p = ctx.createPanner();
      p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = 4; p.rolloffFactor = 1.1;
      if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; }
      else p.setPosition(pos.x, pos.y, pos.z);
      head.connect(p).connect(to);
    } else head.connect(to);
    if (wet) { const s = ctx.createGain(); s.gain.value = wet; head.connect(s).connect(verb); }
    return g;
  }

  // ================= 環境音（マップごとに、かすかに流し続ける） =================
  // 続く音（川・竹・夜風）は雑音をずっと流し、ときどきの音（小鳥・カラス・鐘・虫）は間をあけて鳴らす
  let amb = null;
  function ambience(id) {
    if (!ctx || (amb && amb.id === id) || (!amb && !id)) return;
    if (amb) {   // 前のマップの音は少しずつ消す
      const a = amb; a.alive = false;
      a.bus.gain.setTargetAtTime(0, ctx.currentTime, 0.4);
      setTimeout(() => { a.srcs.forEach(s => { try { s.stop(); } catch (e) {} }); a.bus.disconnect(); }, 2500);
      amb = null;
    }
    if (!id) return;
    const bus = ctx.createGain(); bus.gain.value = 0; bus.connect(master);
    bus.gain.setTargetAtTime(1, ctx.currentTime, 1.2);
    const a = amb = { id, bus, srcs: [], alive: true };
    // 続く音
    const loop = (type, f, q, g, sweep?, gain?) => {
      const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
      const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
      const gg = gain || ctx.createGain(); if (!gain) gg.gain.value = g;
      s.connect(fl).connect(gg).connect(bus); s.start(); a.srcs.push(s);
      if (sweep) { const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = sweep[0]; lg.gain.value = sweep[1]; lfo.connect(lg).connect(fl.frequency); lfo.start(); a.srcs.push(lfo); }
    };
    // ときどきの音（min〜max 秒ごと）
    const every = (min, max, fn) => { const go = () => { if (!a.alive) return; fn(); setTimeout(go, rand(min, max) * 1000); }; setTimeout(go, rand(min * 0.3, max * 0.6) * 1000); };
    if (id === 'temple') {
      loop('bandpass', 1800, 0.4, 0.005);        // 竹のざわめき
      loop('bandpass', 450, 1, 0.006, [0.13, 140]);         // 夜風（ゆっくり強弱）
      every(12, 25, () => { const d = out(null, 0.7, 1600, bus); const n = 1 + Math.floor(Math.random() * 3); for (let i = 0; i < n; i++) { const at = i * 0.6; N(d, { at, dur: 0.35, type: 'bandpass', f0: 850, f1: 700, q: 5, g: 0.03, atk: 0.03 }); T(d, { at, type: 'sawtooth', f0: 500, f1: 420, dur: 0.33, g: 0.01, atk: 0.03 }); } });   // カラス
      every(30, 60, () => gong(out(null, 0.9, 900, bus), 0, 98, 0.04));   // 遠くの鐘
      every(3.5, 3.6, () => { const d = out(null, 0.3, 5000, bus); for (let i = 0; i < 27; i++) P(d, i * 0.13 + rand(0, 0.03), 3600, 0.05, 0.003, 'triangle'); });   // 虫の声
    } else if (id === 'desert') {
      loop('bandpass', 520, 0.9, 0.005, [0.09, 160]);       // 乾いた風（かすか・ゆっくり強弱）
      every(25, 50, () => { const d = out(null, 0.8, 2600, bus); T(d, { f0: 2400, f1: 1500, dur: 0.9, g: 0.008, atk: 0.1 }); });   // 遠くの鷹
      // 砂嵐：低くかすかな風のうなり（強さは setStorm で変える。ふだんは 0。うるさくしない）
      const sg = ctx.createGain(); sg.gain.value = 0; (a as any).storm = sg;
      loop('bandpass', 320, 0.7, 0, [0.25, 80], sg);
    } else if (id === 'onsen') {
      loop('lowpass', 320, 0.7, 0.004);                     // 湯の流れる音（かすか）
      every(18, 32, () => { const d = out(null, 0.6, 1800, bus); wood(d, 0, 520, 0.05, 0.12); wood(d, 0.09, 470, 0.02, 0.1); });   // 遠くの鹿威し（こん）
      every(35, 70, () => { const d = out(null, 0.4, 900, bus); N(d, { dur: 0.35, f0: 260, f1: 90, g: 0.05, atk: 0.02 }); });   // 屋根の雪が落ちる（どさっ）
    } else {
      loop('lowpass', 700, 0.8, 0.013);                   // 川のせせらぎ
      every(8, 18, () => { const d = out(null, 0.5, 5000, bus), f = rand(2800, 3800); for (let j = 0; j < 3; j++) T(d, { at: j * 0.1, f0: f, f1: f * 1.25, dur: 0.06, g: 0.012 }); });   // 小鳥
    }
  }
  function N(dest, { dur, type = 'lowpass', f0, f1 = f0, q = 0.8, g, at = 0, atk = 0.002 }: any) {
    const t = ctx.currentTime + at;
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const gg = ctx.createGain();
    gg.gain.setValueAtTime(0.0001, t); gg.gain.exponentialRampToValueAtTime(g, t + atk); gg.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(f).connect(gg).connect(dest);
    s.start(t, Math.random() * 0.6); s.stop(t + dur + 0.05);
  }
  function T(dest, { type = 'sine', f0, f1 = f0, dur, g, at = 0, atk = 0.003 }: any) {
    const t = ctx.currentTime + at;
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const gg = ctx.createGain();
    gg.gain.setValueAtTime(0.0001, t); gg.gain.exponentialRampToValueAtTime(g, t + atk); gg.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(gg).connect(dest); o.start(t); o.stop(t + dur + 0.05);
  }
  function P(dest, at, f, dur, g, type = 'sine') {
    const t = ctx.currentTime + at, o = ctx.createOscillator(); o.type = type; o.frequency.value = f;
    const gg = ctx.createGain(); gg.gain.setValueAtTime(0.0001, t); gg.gain.exponentialRampToValueAtTime(g, t + 0.001); gg.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    o.connect(gg).connect(dest); o.start(t); o.stop(t + dur + 0.02);
  }
  const click = (d, at, f, g = 0.5, dur = 0.035) => N(d, { at, dur, type: 'bandpass', f0: f, q: 4, g });
  const tick = (d, at, f, g = 0.4, len = 0.045) => {
    N(d, { at, dur: 0.012, type: 'highpass', f0: f * 1.5, g: g * 0.9 });
    [1, 1.63, 2.51, 3.3].forEach((k, i) => P(d, at, f * k * (1 + Math.random() * 0.02), len * (1 - i * 0.18), g * 0.22 / (1 + i * 0.6)));
  };
  // 拍子木（カンッ）と太鼓（ドン）
  const hyoshigi = (d, at, g = 0.6) => { N(d, { at, dur: 0.015, type: 'highpass', f0: 2500, g: g * 0.6 }); [1, 2.2, 3.6].forEach((k, i) => P(d, at, 1350 * k, 0.12 / (1 + i), g * 0.35 / (1 + i))); };
  const taiko = (d, at, g = 0.9, f = 70) => { T(d, { at, f0: f * 1.6, f1: f, dur: 0.6, g }); N(d, { at, dur: 0.08, f0: 1000, g: g * 0.25 }); };
  // 銅鑼・鐘（ずれた倍音が長く響く）
  const gong = (d, at, f, g) => [[1, 1, 4], [1.52, 0.5, 3], [2.3, 0.3, 2.2], [3.1, 0.15, 1.5]].forEach(([k, a, dur]) => { P(d, at, f * k, dur, g * a); P(d, at, f * k * 1.006, dur, g * a * 0.6); });
  const swish = (d, at, dur, f0, f1, g) => N(d, { at, dur, type: 'bandpass', f0, f1, q: 1.4, g, atk: dur * 0.45 });
  const beep = (d, at, f, g = 0.1, dur = 0.06) => T(d, { at, type: 'square', f0: f, dur, g });
  const scrape = (d, at, dur, f, g = 0.18) => N(d, { at, dur, type: 'bandpass', f0: f, f1: f * 1.25, q: 1.3, g, atk: dur * 0.35 });
  const seat = (d, at, f, g = 0.5) => { N(d, { at, dur: 0.07, f0: 450, g: g * 0.8 }); tick(d, at + 0.004, f, g); };
  const wood = (d, at, f, g = 0.4, len = 0.08) => {
    N(d, { at, dur: 0.02, type: 'bandpass', f0: f * 3, q: 1, g: g * 0.5 });
    [1, 2.7, 4.1].forEach((k, i) => P(d, at, f * k, len / (1 + i * 0.8), g / (1 + i * 1.5), 'triangle'));
  };
  const coin = (d, at, g) => { const f = rand(2600, 4200); [1, 2.4, 4.3].forEach((k, i) => P(d, at, f * (i ? k * 0.72 : 1), 0.06 / (1 + i * 0.7), g / (1 + i * 1.3))); N(d, { at, dur: 0.008, type: 'highpass', f0: 4000, g: g * 0.6 }); };
  const metal = (d, at, f, dur, g) => [1, 1.58, 2.37, 3.41].forEach((k, i) => T(d, { at, f0: f * k, dur: dur / (1 + i * 0.5), g: g / (1 + i) }));
  // 1発の銃声：crack 高い破裂 / body 胴鳴り / sub 低い衝撃
  function gun(d, p, at = 0) {
    N(d, { at, dur: p.cd || 0.03, type: 'highpass', f0: p.cf || 3000, g: p.cg || 0.5 });
    N(d, { at, dur: p.bd, f0: p.b0, f1: p.b1, g: p.bg });
    T(d, { at, f0: p.s0, f1: p.s1, dur: p.sd, g: p.sg });
  }

  // リロードの手順（秒は目安。実際のリロード時間に合わせて伸び縮みする）
  const RELOAD = {
    magP: { len: 1.0, play(d, k) { tick(d, 0, 2300, 0.35); scrape(d, 0.03 * k, 0.14, 1300); scrape(d, 0.48 * k, 0.12, 1100); seat(d, 0.6 * k, 1900, 0.5); scrape(d, 0.88 * k, 0.05, 2400, 0.2); tick(d, 0.93 * k, 1600, 0.5); tick(d, 0.97 * k, 2700, 0.45); } },
    magR: { len: 1.26, play(d, k) { tick(d, 0, 1700, 0.4); scrape(d, 0.03 * k, 0.2, 800, 0.22); scrape(d, 0.55 * k, 0.16, 750, 0.22); seat(d, 0.72 * k, 1400, 0.65); scrape(d, 1.02 * k, 0.1, 1300, 0.22); tick(d, 1.1 * k, 1250, 0.45); tick(d, 1.24 * k, 1900, 0.6); N(d, { at: 1.24 * k, dur: 0.05, f0: 600, g: 0.3 }); } },
    lever: { len: 1.4, play(d, k) { for (let i = 0; i < 3; i++) { scrape(d, i * 0.34 * k, 0.09, 1600, 0.13); tick(d, (i * 0.34 + 0.09) * k, 3400, 0.3, 0.06); } tick(d, 1.12 * k, 1500, 0.45); scrape(d, 1.14 * k, 0.1, 1100, 0.2); scrape(d, 1.3 * k, 0.08, 1300, 0.2); tick(d, 1.38 * k, 2100, 0.55); } },
    shell: { len: 1.58, play(d, k) {
      for (let i = 0; i < 3; i++) { N(d, { at: i * 0.4 * k, dur: 0.08, type: 'bandpass', f0: 800, f1: 1300, q: 3, g: 0.25, atk: 0.03 }); T(d, { at: (i * 0.4 + 0.09) * k, f0: 320, f1: 176, dur: 0.09, g: 0.45 }); N(d, { at: (i * 0.4 + 0.09) * k, dur: 0.05, type: 'bandpass', f0: 1920, q: 2, g: 0.22 }); }
      N(d, { at: 1.35 * k, dur: 0.09, type: 'bandpass', f0: 800, q: 2, g: 0.5 }); N(d, { at: 1.5 * k, dur: 0.08, type: 'bandpass', f0: 1300, q: 2, g: 0.55 });
    } },
    break: { len: 1.3, play(d, k) { click(d, 0, 1300, 0.55); metal(d, 0.05 * k, 520, 0.25, 0.08); T(d, { at: 0.35 * k, f0: 420, f1: 300, dur: 0.12, g: 0.15 }); T(d, { at: 0.7 * k, f0: 130, f1: 72, dur: 0.09, g: 0.7 }); N(d, { at: 0.7 * k, dur: 0.05, type: 'bandpass', f0: 780, q: 2, g: 0.35 }); metal(d, 1.0 * k, 380, 0.3, 0.12); click(d, 1.0 * k, 1800, 0.6); } },
  };
  const RELOAD_OF = { pistol: 'magP', burst: 'magP', mp5: 'magR', ak: 'magR', mk2: 'lever', m870: 'shell', m79: 'break' };

  const sounds = {
    // 撃つ（model：武器の見た目の名前）
    shot(pos, model) {
      const r = rand(0.95, 1.05);
      if (model === 'mk2') {
        const d = out(pos, 0.6);
        gun(d, { cf: 4500 * r, cg: 0.8, cd: 0.02, bd: 0.45, b0: 9000, b1: 350, bg: 0.95, s0: 105 * r, s1: 32, sd: 0.35, sg: 1 });
        click(d, 0.5, 1500, 0.5); click(d, 0.56, 1100, 0.35); click(d, 0.7, 2300, 0.55);   // レバーを引いて戻す
        return;
      }
      if (model === 'm870') {
        const d = out(pos, 0.5);
        gun(d, { cf: 2200 * r, cg: 0.6, bd: 0.55, b0: 3200, b1: 180, bg: 1, s0: 85 * r, s1: 28, sd: 0.4, sg: 1 });
        N(d, { at: 0.48, dur: 0.09, type: 'bandpass', f0: 800, q: 2, g: 0.5 }); N(d, { at: 0.64, dur: 0.08, type: 'bandpass', f0: 1300, q: 2, g: 0.55 });   // ポンプ
        return;
      }
      if (model === 'mp5') { gun(out(pos, 0.25), { cf: 3500 * r, cg: 0.35, bd: 0.12, b0: 6000, b1: 800, bg: 0.55, s0: 200 * r, s1: 80, sd: 0.07, sg: 0.5 }); return; }
      if (model === 'ak') { gun(out(pos, 0.35), { cf: 2800 * r, cg: 0.55, bd: 0.2, b0: 4800, b1: 350, bg: 0.85, s0: 140 * r, s1: 45, sd: 0.16, sg: 0.9 }); return; }
      if (model === 'burst') { gun(out(pos, 0.3), { cf: 3800 * r, cg: 0.4, bd: 0.13, b0: 6500, b1: 700, bg: 0.6, s0: 190 * r, s1: 70, sd: 0.08, sg: 0.55 }); return; }
      // デザートイーグル（前からの音のまま）
      const d = out(pos);
      N(d, { dur: 0.2, f0: 5000 * r, f1: 500, g: 0.55 });
      T(d, { f0: 160 * r, f1: 42, dur: 0.16, g: 0.8 });
      N(d, { dur: 0.025, type: 'highpass', f0: 3500, g: 0.35 });
      N(d, { dur: 0.5, f0: 900, f1: 200, g: 0.08, at: 0.03 });
    },
    // M79 を撃つ（ポンッ）
    m79(pos) {
      const d = out(pos, 0.3);
      T(d, { f0: 75, f1: 38, dur: 0.28, g: 1 }); N(d, { dur: 0.22, f0: 700, f1: 90, g: 0.8 });
      N(d, { dur: 0.12, type: 'bandpass', f0: 320, q: 3, g: 0.5 }); click(d, 0.02, 2000, 0.2);
    },
    // ナイフを振る
    knife(pos) { N(out(pos, 0.05), { dur: 0.22, type: 'bandpass', f0: 500, f1: 3200, q: 2.2, g: 0.6, atk: 0.06 }); },
    // 弓：放つ・矢をつがえて引き絞る・引き切った
    bow(pos) {
      const d = out(pos, 0.05);
      T(d, { type: 'triangle', f0: 230, f1: 140, dur: 0.2, g: 0.6 });
      N(d, { dur: 0.15, type: 'bandpass', f0: 1800, f1: 700, q: 1.2, g: 0.35 });
    },
    bowDraw() {
      const d = out(null, 0.05);
      scrape(d, 0, 0.25, 2500, 0.12); click(d, 0.24, 1600, 0.3, 0.02);
      N(d, { at: 0.1, dur: 0.75, type: 'bandpass', f0: 220, f1: 420, q: 9, g: 0.35, atk: 0.3 });
      for (let i = 0; i < 4; i++) click(d, 0.25 + i * 0.16, 500 + i * 60, 0.12, 0.05);
    },
    bowReady() { const d = out(null, 0.05); click(d, 0, 900, 0.35, 0.05); T(d, { f0: 1175, dur: 0.18, g: 0.08, at: 0.01 }); },
    // リロード（model の種類に合わせ、time 秒に合わせて伸び縮み）
    reload(model, time) {
      const R = RELOAD[RELOAD_OF[model]];
      if (!R) return;
      R.play(out(null, 0.12), Math.max(0.6, Math.min(1.6, (time || R.len) * 0.9 / R.len)));
    },
    empty() { const d = out(null, 0.05); click(d, 0, 3200, 0.5, 0.015); metal(d, 0.002, 1900, 0.08, 0.04); },
    swap() { const d = out(); N(d, { dur: 0.1, type: 'bandpass', f0: 1200, f1: 3000, q: 2, g: 0.3, atk: 0.04 }); click(d, 0.12, 2800, 0.45); },
    inspect() { const d = out(null, 0.05); scrape(d, 0, 0.3, 300, 0.15); click(d, 0.5, 2000, 0.2); scrape(d, 0.7, 0.25, 700, 0.12); },
    // 当たり
    hit() { const d = out(); N(d, { dur: 0.018, type: 'bandpass', f0: 3800, q: 2, g: 0.5 }); P(d, 0, 3800, 0.03, 0.08); },
    head() { const d = out(null, 0.05); N(d, { dur: 0.018, type: 'bandpass', f0: 3800, q: 2, g: 0.5 }); P(d, 0.005, 2640, 0.16, 0.12); P(d, 0.005, 3960, 0.1, 0.05); },
    kill() {
      const d = out(null, 0.3);
      T(d, { f0: 70, f1: 35, dur: 0.5, g: 0.8 }); N(d, { dur: 0.4, f0: 3000, f1: 200, g: 0.5 });
      for (let i = 0; i < 5; i++) click(d, 0.02 + i * 0.035, 900 + Math.random() * 1500, 0.35, 0.04);
      T(d, { f0: 587, dur: 0.6, g: 0.1, at: 0.15 }); T(d, { f0: 880, dur: 0.8, g: 0.08, at: 0.15 });
    },
    hurt() { const d = out(); N(d, { dur: 0.14, f0: 380, f1: 150, g: 0.75 }); N(d, { dur: 0.04, type: 'bandpass', f0: 1200, q: 1, g: 0.2 }); },
    whiz(pos) { const d = out(pos); N(d, { dur: 0.2, type: 'bandpass', f0: 3200, f1: 900, q: 6, g: 0.6, atk: 0.06 }); click(d, 0.06, 5000, 0.2, 0.01); },
    ricochet(pos) {
      const d = out(pos, 0.2);
      N(d, { dur: 0.03, type: 'highpass', f0: 3000, g: 0.4 });
      T(d, { type: 'triangle', f0: 3400, f1: 1300, dur: 0.35, g: 0.12, at: 0.01 }); T(d, { f0: 2900, f1: 1100, dur: 0.3, g: 0.06, at: 0.01 });
    },
    thud(pos) { const d = out(pos, 0.05); N(d, { dur: 0.08, f0: 2500, f1: 500, g: 0.4 }); for (let i = 0; i < 4; i++) click(d, 0.03 + i * 0.025, 2000 + Math.random() * 2500, 0.08, 0.02); },
    arrowHit(pos) {
      const d = out(pos, 0.05);
      T(d, { f0: 200, f1: 110, dur: 0.09, g: 0.6 }); N(d, { dur: 0.05, type: 'bandpass', f0: 1200, q: 2, g: 0.3 });
      T(d, { type: 'triangle', f0: 340, f1: 320, dur: 0.3, g: 0.08, at: 0.02 }); T(d, { type: 'triangle', f0: 360, f1: 300, dur: 0.25, g: 0.05, at: 0.05 });
    },
    guard(pos) {
      const d = out(pos, 0.1);
      wood(d, 0, 240, 0.6, 0.14); N(d, { dur: 0.06, type: 'bandpass', f0: 2200, q: 1, g: 0.3 });
      for (let i = 0; i < 3; i++) N(d, { at: 0.02 + i * 0.03, dur: 0.02, type: 'highpass', f0: 3000 + i * 800, g: 0.08 });
    },
    // 足音（surf：床の種類）。自分の音は低く小さく
    step(pos, v = 1, surf = 'grass') {
      const d = out(pos), k = rand(0.94, 1.06);
      if (surf === 'stone') { N(d, { dur: 0.05, f0: 450 * k, f1: 250, g: 0.2 * v, atk: 0.004 }); N(d, { dur: 0.02, type: 'bandpass', f0: 1300 * k, q: 1.5, g: 0.04 * v }); }
      else if (surf === 'wood') { wood(d, 0, 105 * k, 0.14 * v, 0.1); N(d, { dur: 0.05, f0: 350, g: 0.12 * v, atk: 0.005 }); }
      else if (surf === 'gravel') { N(d, { dur: 0.09, f0: 600 * k, f1: 300, g: 0.14 * v, atk: 0.01 }); for (let i = 0; i < 8; i++) N(d, { at: Math.random() * 0.08, dur: 0.014, type: 'bandpass', f0: rand(1200, 2600), q: 2.5, g: 0.035 * v * rand(0.4, 1) }); }
      else if (surf === 'sand') { N(d, { dur: 0.11, f0: 380 * k, f1: 180, g: 0.13 * v, atk: 0.015 }); for (let i = 0; i < 4; i++) N(d, { at: Math.random() * 0.07, dur: 0.02, type: 'bandpass', f0: rand(900, 1800), q: 1.5, g: 0.02 * v * rand(0.4, 1) }); }   // 砂：さくっ
      else if (surf === 'water') N(d, { dur: 0.18, f0: 500 * k, f1: 280, g: 0.13 * v, atk: 0.05 });
      else { N(d, { dur: 0.08, f0: 380 * k, f1: 180, g: 0.2 * v, atk: 0.008 }); N(d, { dur: 0.06, type: 'bandpass', f0: 1100, q: 0.8, g: 0.025 * v, atk: 0.01 }); }
    },
    jump() { const d = out(); N(d, { dur: 0.06, f0: 300, g: 0.16 }); N(d, { dur: 0.15, type: 'bandpass', f0: 350, f1: 700, q: 1, g: 0.04, atk: 0.04 }); },
    climb() { N(out(), { dur: 0.05, f0: 320, g: 0.12, atk: 0.006 }); },
    // 物理の小物がぶつかる（kind：小物の種類、v：強さ 0〜1）
    prop(kind, pos, v = 0.5) {
      const d = out(pos, 0.05), g = v;
      if (kind === 'barrel') { wood(d, 0, 140, 0.55 * g, 0.16); P(d, 0.01, 95, 0.25, 0.15 * g); N(d, { at: 0.05, dur: 0.25, type: 'bandpass', f0: 500, f1: 900, q: 2, g: 0.12 * g, atk: 0.05 }); }
      else if (kind === 'bale') { N(d, { dur: 0.12, f0: 350, f1: 120, g: 0.6 * g }); for (let i = 0; i < 6; i++) N(d, { at: Math.random() * 0.08, dur: 0.014, type: 'bandpass', f0: rand(2000, 4000), q: 2.5, g: 0.04 * g }); }
      else if (kind === 'log') { wood(d, 0, 130, 0.55 * g, 0.15); wood(d, 0.2, 125, 0.25 * g, 0.12); }
      else if (kind === 'oke') { wood(d, 0, 480, 0.4 * g, 0.07); P(d, 0.005, 620, 0.18, 0.08 * g, 'triangle'); }
      else if (kind === 'cart') { N(d, { dur: 0.6, type: 'bandpass', f0: 600, f1: 900, q: 12, g: 0.25 * g, atk: 0.2 }); wood(d, 0.1, 200, 0.2 * g, 0.1); wood(d, 0.45, 190, 0.2 * g, 0.1); }
      else if (kind === 'saisen') {
        // 箱の中で小銭がこもって鳴る
        wood(d, 0, 150, 0.5 * g, 0.16);
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200; lp.connect(d);
        let t = 0.02;
        for (let i = 0; i < 14 * g; i++) { t += rand(0.01, 0.035); coin(lp, t, 0.09 * g * (1 - i / 18)); }
      }
      else if (kind.startsWith('snow')) N(d, { dur: 0.14, f0: 420, f1: 150, g: 0.5 * g, atk: 0.01 });   // 雪玉：ぼふっ
      else if (kind === 'toro') { N(d, { dur: 0.08, f0: 380, f1: 200, g: 0.6 * g }); P(d, 0.005, 180, 0.12, 0.1 * g); }   // 石灯籠：ごとっ
      else if (kind === 'kasa') N(d, { dur: 0.1, type: 'bandpass', f0: 900, q: 1.2, g: 0.15 * g, atk: 0.01 });   // 番傘：ばさっ
      else if (kind === 'drum') { N(d, { dur: 0.1, f0: 300, f1: 150, g: 0.6 * g }); P(d, 0.005, 150, 0.14, 0.1 * g); }   // 積み石：ごとん
      else if (kind === 'stoneSled') { N(d, { dur: 0.25, type: 'bandpass', f0: 500, f1: 300, q: 1, g: 0.35 * g, atk: 0.03 }); wood(d, 0, 180, 0.3 * g, 0.1); }   // そり：ずずっ
      else if (kind === 'sandbag') N(d, { dur: 0.12, f0: 260, f1: 110, g: 0.6 * g, atk: 0.01 });   // 砂袋：どさっ
      else if (kind === 'jar') { P(d, 0, 520, 0.08, 0.1 * g, 'triangle'); N(d, { dur: 0.05, type: 'bandpass', f0: 1400, q: 2, g: 0.15 * g }); }
      else if (kind === 'milk') { wood(d, 0, 330, 0.3 * g, 0.08); for (let i = 0; i < 3; i++) P(d, 0.01 + i * 0.03, rand(2400, 3200), 0.12, 0.03 * g, 'triangle'); }   // 瓶がかちゃっ
      else wood(d, 0, 310, 0.45 * g, 0.1);   // 木箱
    },
    // 鐘楼の鐘（撃つと遠くまで響く）
    bell(pos) {
      const d = out(pos, 0.5);
      [[1, 0.5, 6], [2.08, 0.3, 4], [2.94, 0.22, 3], [4.1, 0.12, 2], [5.4, 0.08, 1.4]].forEach(([k, g, dur]) => { P(d, 0, 108 * k, dur, g, 'sine'); P(d, 0, 108 * k * 1.004, dur, g * 0.7, 'sine'); });
      N(d, { dur: 0.06, f0: 800, g: 0.4 });
    },
    // 爆発・大玉の爆発
    boom(pos) {
      const d = out(pos, 0.25);
      T(d, { f0: 90, f1: 35, dur: 0.5, g: 1 }); N(d, { dur: 0.6, f0: 4000, f1: 150, g: 0.9 }); N(d, { dur: 0.04, type: 'highpass', f0: 2000, g: 0.5 });
    },
    bigboom(pos) {
      const d = out(pos, 0.8);
      T(d, { f0: 50, f1: 22, dur: 1.6, g: 1 }); N(d, { dur: 2, f0: 2500, f1: 40, g: 1 }); N(d, { dur: 0.06, type: 'highpass', f0: 1200, g: 0.7 });
      N(d, { at: 0.15, dur: 1.4, f0: 300, f1: 60, g: 0.5, atk: 0.2 });
      for (let i = 0; i < 22; i++) N(d, { at: 0.3 + Math.random() * 1.3, dur: 0.014, type: 'bandpass', f0: rand(1200, 3500), q: 2.5, g: 0.1 * rand(0.4, 1) });
    },
    // ---- スキル ----
    skStep(pos) { const d = out(pos); swish(d, 0, 0.18, 400, 1200, 0.25); N(d, { at: 0.02, dur: 0.12, f0: 400, f1: 200, g: 0.2, atk: 0.02 }); },
    skXray() { const d = out(null, 0.3); T(d, { f0: 110, f1: 220, dur: 0.6, g: 0.3, atk: 0.2 }); T(d, { f0: 165, f1: 330, dur: 0.6, g: 0.12, atk: 0.2 }); [0.15, 0.45].forEach(at => T(d, { at, f0: 70, f1: 50, dur: 0.12, g: 0.4 })); },
    skBoxes(pos) { const d = out(pos, 0.05); N(d, { dur: 0.15, f0: 1200, f1: 300, g: 0.3, atk: 0.02 }); wood(d, 0.1, 280, 0.5, 0.12); },
    skHoming(pos) { const d = out(pos, 0.3); T(d, { f0: 600, f1: 1800, dur: 0.35, g: 0.1 }); P(d, 0.3, 1800, 0.4, 0.07); P(d, 0.3, 2700, 0.3, 0.04); },
    skVolley(pos) { const d = out(pos, 0.1); for (let i = 0; i < 5; i++) tick(d, i * 0.05, 900 + i * 120, 0.3, 0.05); T(d, { at: 0.25, f0: 300, f1: 600, dur: 0.25, g: 0.08 }); },
    skBig(pos) { const d = out(pos, 0.3); T(d, { f0: 80, f1: 160, dur: 0.4, g: 0.3 }); tick(d, 0.35, 900, 0.5, 0.1); },
    skC4(pos) { const d = out(pos, 0.05); swish(d, 0, 0.2, 500, 1500, 0.18); },
    skC4Stick(pos) { const d = out(pos); N(d, { dur: 0.05, f0: 800, g: 0.4 }); tick(d, 0, 1100, 0.3); beep(d, 0.15, 2400, 0.05, 0.04); },
    skC4b(pos) { const d = out(pos, 0.3); tick(d, 0, 1800, 0.4); beep(d, 0.05, 3000, 0.07, 0.03); },
    skMissile(pos) {
      const d = out(pos, 0.3);
      N(d, { dur: 0.2, type: 'highpass', f0: 1500, g: 0.3 });
      N(d, { at: 0.05, dur: 1.6, type: 'bandpass', f0: 700, f1: 300, q: 0.7, g: 0.4, atk: 0.2 }); T(d, { at: 0.05, f0: 90, f1: 60, dur: 1.5, g: 0.2, atk: 0.2 });
    },
    skDash(pos) { const d = out(pos); swish(d, 0, 0.35, 250, 900, 0.35); for (let i = 0; i < 3; i++) N(d, { at: 0.05 + i * 0.1, dur: 0.06, f0: 450, g: 0.25 }); },
    skGrapple(pos) {
      const d = out(pos, 0.1);
      swish(d, 0, 0.15, 800, 2400, 0.2); tick(d, 0.16, 2200, 0.5, 0.08);
      N(d, { at: 0.2, dur: 0.6, type: 'bandpass', f0: 900, f1: 1600, q: 3, g: 0.15, atk: 0.1 });
      for (let i = 0; i < 10; i++) N(d, { at: 0.22 + i * 0.05, dur: 0.02, type: 'bandpass', f0: 1800, q: 4, g: 0.05 });
    },
    // ----- ガチャの演出 -----
    gBoom(big = 1) { const d = out(null, 0.15); T(d, { f0: 75, f1: 32, dur: 0.35 + big * 0.15, g: 0.3 * big }); N(d, { dur: 0.3 + big * 0.1, f0: 1400, f1: 120, g: 0.12 * big }); },   // 爆発（控えめ）
    gCrack() { const d = out(null, 0.3); N(d, { dur: 0.05, type: 'highpass', f0: 1800, g: 0.5 }); wood(d, 0, 160, 0.7, 0.2); N(d, { at: 0.03, dur: 0.9, f0: 200, f1: 50, g: 0.35, atk: 0.05 }); },   // 盤が割れる：ばきっ・ごごご
    gShatter() { const d = out(null, 0.1); wood(d, 0, 420, 0.45, 0.08); for (let i = 0; i < 5; i++) wood(d, 0.02 + i * 0.03, rand(600, 1200), 0.15, 0.04); },   // 駒が割れる
    gThud() { const d = out(null, 0.1); N(d, { dur: 0.12, f0: 260, f1: 90, g: 0.55 }); wood(d, 0, 180, 0.35, 0.1); },   // どん
    gCoins() { const d = out(null, 0.2); for (let i = 0; i < 18; i++) coin(d, i * 0.06 + rand(0, 0.05), 0.05); },   // 小判がちゃりちゃり
    fwLaunch() { const d = out(null, 0.2); T(d, { f0: 900, f1: 2400, dur: 0.6, g: 0.03, atk: 0.1 }); N(d, { dur: 0.6, type: 'bandpass', f0: 2000, q: 2, g: 0.04, atk: 0.1 }); },   // 花火のひゅー
    fwPop() { const d = out(null, 0.6); N(d, { dur: 0.25, f0: 500, f1: 80, g: 0.45 }); for (let i = 0; i < 10; i++) N(d, { at: 0.08 + i * 0.05 + rand(0, 0.04), dur: 0.02, type: 'highpass', f0: 3000, g: 0.05 }); },   // どーん・ぱちぱち
    // 素焼きの壺が割れる：高いぱりんと、砂がさらさら
    jarBreak(pos) { const d = out(pos, 0.1); N(d, { dur: 0.06, type: 'highpass', f0: 2500, g: 0.5 }); for (let i = 0; i < 7; i++) P(d, 0.01 + i * 0.025 + Math.random() * 0.02, rand(1800, 3600), 0.08, 0.06, 'triangle'); N(d, { at: 0.05, dur: 0.5, type: 'bandpass', f0: 3000, f1: 1500, q: 1, g: 0.08, atk: 0.05 }); },
    skFlashPin(pos) { tick(out(pos), 0, 2600, 0.3); },
    // EMP：低い「ドン」と、高く鳴って下がる電気の「ジジッ」
    skEmp(pos) { const d = out(pos, 0.3); T(d, { f0: 90, f1: 40, dur: 0.35, g: 0.5 }); N(d, { dur: 0.45, type: 'bandpass', f0: 4200, f1: 600, q: 4, g: 0.35 }); for (let i = 0; i < 6; i++) tick(d, 0.04 + i * 0.05, 3000 + i * 400, 0.15, 0.02); },
    // EMP を受けた（自分）：短い電気のノイズ
    skEmpHit() { const d = out(); N(d, { dur: 0.25, type: 'bandpass', f0: 2500, f1: 900, q: 3, g: 0.25 }); for (let i = 0; i < 4; i++) tick(d, i * 0.04, 3600, 0.12, 0.015); },
    // 閃光：破裂と耳鳴り
    skFlash(pos) { const d = out(pos, 0.4); N(d, { dur: 0.05, type: 'highpass', f0: 2000, g: 0.8 }); N(d, { dur: 0.3, f0: 5000, f1: 500, g: 0.7 }); P(d, 0.02, 3600, 2.2, 0.06, 'sine'); },
    skPearl(pos) { const d = out(pos, 0.3); T(d, { f0: 900, f1: 150, dur: 0.3, g: 0.2 }); P(d, 0.3, 1200, 0.3, 0.08); },
    skShock(pos) { const d = out(pos, 0.5); T(d, { f0: 60, f1: 30, dur: 0.6, g: 1 }); N(d, { dur: 0.8, type: 'bandpass', f0: 200, f1: 1500, q: 0.8, g: 0.5, atk: 0.05 }); N(d, { dur: 0.04, f0: 1500, g: 0.5 }); },
    ram(pos) { const d = out(pos, 0.1); wood(d, 0, 200, 0.7, 0.15); N(d, { dur: 0.1, f0: 900, g: 0.5 }); },
    guardUp(pos) { const d = out(pos, 0.1); swish(d, 0, 0.12, 400, 900, 0.15); wood(d, 0.1, 200, 0.5, 0.14); N(d, { at: 0.1, dur: 0.05, f0: 700, g: 0.3 }); },
    smoke(pos) { const d = out(pos, 0.2); N(d, { dur: 0.4, f0: 1200, f1: 200, g: 0.6, atk: 0.02 }); N(d, { dur: 1.2, type: 'bandpass', f0: 600, q: 0.6, g: 0.15, atk: 0.2 }); },
    skCloak() {
      const d = out(null, 0.2);
      for (let i = 0; i < 6; i++) N(d, { at: i * 0.05, dur: 0.12, type: 'bandpass', f0: 3000 - i * 400, q: 4, g: 0.12 * (1 - i / 7) });
      T(d, { at: 0.05, f0: 300, f1: 120, dur: 0.4, g: 0.1 });
    },
    // ---- 画面・将棋 ----
    count() { hyoshigi(out(null, 0.3), 0, 0.5); },
    btn() { N(out(), { dur: 0.03, type: 'bandpass', f0: 2500, q: 1.5, g: 0.2 }); },
    sel() { N(out(), { dur: 0.05, type: 'bandpass', f0: 1800, f1: 2600, q: 2, g: 0.15, atk: 0.02 }); },
    place() { const d = out(null, 0.15); N(d, { dur: 0.01, type: 'highpass', f0: 3000, g: 0.6 }); wood(d, 0, 820, 0.5, 0.06); wood(d, 0.001, 240, 0.25, 0.05); },
    promo() { const d = out(null, 0.3); wood(d, 0, 820, 0.4, 0.05); wood(d, 0.12, 900, 0.4, 0.05); P(d, 0.2, 1175, 0.6, 0.08); P(d, 0.2, 1760, 0.5, 0.04); },
    check() { const d = out(null, 0.3); hyoshigi(d, 0, 0.6); hyoshigi(d, 0.15, 0.6); },
    nifu() {
      const d = out(null, 0.3);
      T(d, { f0: 90, f1: 35, dur: 0.5, g: 0.9 }); N(d, { dur: 0.6, f0: 4000, f1: 150, g: 0.8 });
      for (let i = 0; i < 8; i++) wood(d, 0.1 + Math.random() * 0.6, rand(500, 900), 0.15, 0.05);
    },
    battle() { const d = out(null, 0.4); N(d, { dur: 0.35, type: 'bandpass', f0: 2500, f1: 6000, q: 3, g: 0.2, atk: 0.2 }); tick(d, 0.33, 3200, 0.4, 0.4); taiko(d, 0.4, 1); },
    fight() { const d = out(null, 0.5); gong(d, 0, 140, 0.15); N(d, { dur: 0.05, f0: 500, g: 0.2 }); },
    win() { const d = out(null, 0.5); hyoshigi(d, 0, 0.4); taiko(d, 0.15, 0.7); gong(d, 0.15, 196, 0.07); },
    lose() { const d = out(null, 0.7, 1500); gong(d, 0, 98, 0.12); },
    // ---- ここから下はまだ前の音（これから試聴して決める） ----
    land(pos) {
      const d = out(pos);
      T(d, { f0: 130, f1: 50, dur: 0.14, g: 0.35 });
      N(d, { dur: 0.1, f0: 900, f1: 150, g: 0.2 });
    },
    dash(pos) { N(out(pos), { dur: 0.32, type: 'bandpass', f0: 300, f1: 2400, q: 1.5, g: 0.55 }); },
    knock(pos, v = 0.5, pitch = 1) {
      const d = out(pos);
      T(d, { type: 'triangle', f0: rand(520, 680) * pitch, f1: 300 * pitch, dur: 0.07, g: 0.32 * v });
      N(d, { dur: 0.03, type: 'bandpass', f0: 1800 * pitch, q: 1.5, g: 0.22 * v });
    },
    launcher(pos) {
      const d = out(pos);
      T(d, { f0: 90, f1: 45, dur: 0.2, g: 0.9 });
      N(d, { dur: 0.15, type: 'bandpass', f0: 500, q: 1, g: 0.5 });
    },
    clunk(pos) { T(out(pos), { type: 'triangle', f0: rand(300, 380), f1: 180, dur: 0.07, g: 0.3 }); },
    leap(pos) { N(out(pos), { dur: 0.4, type: 'bandpass', f0: 250, f1: 1600, q: 1.2, g: 0.5 }); },
    heal() { const d = out(); T(d, { f0: 660, dur: 0.25, g: 0.15 }); T(d, { f0: 990, dur: 0.35, g: 0.12, at: 0.1 }); T(d, { f0: 1320, dur: 0.5, g: 0.1, at: 0.2 }); },
    pierce() { const d = out(); T(d, { type: 'sawtooth', f0: 200, f1: 900, dur: 0.4, g: 0.06 }); T(d, { f0: 400, f1: 1800, dur: 0.4, g: 0.1 }); },
    ding() { const d = out(); T(d, { f0: 2093, dur: 0.35, g: 0.16 }); T(d, { f0: 3136, dur: 0.25, g: 0.07 }); },
    homing(pos) { const d = out(pos); T(d, { f0: 500, f1: 1400, dur: 0.3, g: 0.18 }); T(d, { f0: 750, f1: 2100, dur: 0.3, g: 0.08 }); },
    beep(hi) { T(out(), { f0: hi ? 988 : 659, dur: hi ? 0.45 : 0.16, g: 0.22 }); },
  };
  function listener(c) {
    if (!ctx) return;
    const L = ctx.listener, p = c.position;
    const f = new V3(0, 0, -1).applyQuaternion(c.quaternion), u = new V3(0, 1, 0).applyQuaternion(c.quaternion);
    if (L.positionX) {
      L.positionX.value = p.x; L.positionY.value = p.y; L.positionZ.value = p.z;
      L.forwardX.value = f.x; L.forwardY.value = f.y; L.forwardZ.value = f.z;
      L.upX.value = u.x; L.upY.value = u.y; L.upZ.value = u.z;
    } else { L.setPosition(p.x, p.y, p.z); L.setOrientation(f.x, f.y, f.z, u.x, u.y, u.z); }
  }
  return {
    init, listener, ambience,
    // 砂嵐の音の強さ（0〜1）
    setStorm(k) { const g = amb && (amb as any).storm; if (g) g.gain.setTargetAtTime(0.01 * k, ctx.currentTime, 0.5); },
    play(name, ...a) { if (!ctx) return; try { sounds[name](...a); } catch (e) { if (import.meta.env.DEV) console.warn('音が鳴らせない:', name, e); } },
    setVol(v) { if (master) master.gain.value = v; },
  };
})();
