// 効果音（すべて Web Audio で合成）
import { V3, rand, settings } from './core';

// ================= サウンド（すべて合成） =================
export const SFX = (() => {
  let ctx = null, master, noiseBuf;
  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const comp = ctx.createDynamicsCompressor();
    master = ctx.createGain(); master.gain.value = settings.vol;
    master.connect(comp).connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  function out(pos) {
    if (!pos) return master;
    const p = ctx.createPanner();
    p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = 4; p.rolloffFactor = 1.1;
    if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; }
    else p.setPosition(pos.x, pos.y, pos.z);
    p.connect(master);
    return p;
  }
  function noise(dest, { dur, type = 'lowpass', f0, f1 = f0, q = 1, gain, delay = 0 }) {
    const t = ctx.currentTime + delay;
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f).connect(g).connect(dest);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }
  function tone(dest, { type = 'sine', f0, f1 = f0, dur, gain, delay = 0 }) {
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(dest); o.start(t); o.stop(t + dur + 0.02);
  }
  const sounds = {
    shot(pos, model) {
      const d = out(pos), r = rand(0.92, 1.08);
      if (model === 'sniper') {
        noise(d, { dur: 0.3, f0: 6000 * r, f1: 400, gain: 0.8 });
        tone(d, { f0: 140 * r, f1: 35, dur: 0.3, gain: 1 });
        noise(d, { dur: 1.4, f0: 600, f1: 80, gain: 0.18, delay: 0.05 });
        noise(d, { dur: 0.06, type: 'bandpass', f0: 1100, q: 3, gain: 0.3, delay: 0.55 });
        noise(d, { dur: 0.06, type: 'bandpass', f0: 900, q: 3, gain: 0.3, delay: 0.75 });
        return;
      }
      if (model === 'revolver') {
        noise(d, { dur: 0.25, f0: 4200 * r, f1: 350, gain: 0.7 });
        tone(d, { f0: 120 * r, f1: 38, dur: 0.2, gain: 0.9 });
        noise(d, { dur: 0.6, f0: 800, f1: 150, gain: 0.1, delay: 0.03 });
        return;
      }
      if (model === 'shotgun') {
        noise(d, { dur: 0.35, f0: 3000 * r, f1: 250, gain: 0.8 });
        tone(d, { f0: 110 * r, f1: 30, dur: 0.25, gain: 1 });
        noise(d, { dur: 0.04, type: 'highpass', f0: 2500, gain: 0.4 });
        noise(d, { dur: 0.8, f0: 700, f1: 120, gain: 0.12, delay: 0.04 });
        // ポンプの音
        noise(d, { dur: 0.05, type: 'bandpass', f0: 1600, q: 2, gain: 0.3, delay: 0.3 });
        noise(d, { dur: 0.05, type: 'bandpass', f0: 1300, q: 2, gain: 0.3, delay: 0.45 });
        return;
      }
      noise(d, { dur: 0.2, f0: 5000 * r, f1: 500, gain: 0.55 });
      tone(d, { f0: 160 * r, f1: 42, dur: 0.16, gain: 0.8 });
      noise(d, { dur: 0.025, type: 'highpass', f0: 3500, gain: 0.35 });
      noise(d, { dur: 0.5, f0: 900, f1: 200, gain: 0.08, delay: 0.03 }); // 残響
    },
    hit() {
      tone(master, { type: 'triangle', f0: 950, f1: 620, dur: 0.09, gain: 0.35 });
      noise(master, { dur: 0.04, type: 'bandpass', f0: 2600, q: 2, gain: 0.35 });
    },
    head() {
      sounds.hit();
      tone(master, { f0: 1760, dur: 0.3, gain: 0.22, delay: 0.01 });
      tone(master, { f0: 2640, dur: 0.22, gain: 0.1, delay: 0.01 });
    },
    kill() {
      tone(master, { f0: 60, f1: 32, dur: 0.6, gain: 0.7 });
      noise(master, { dur: 0.6, f0: 1200, f1: 80, gain: 0.45 });
      tone(master, { type: 'triangle', f0: 880, dur: 0.35, gain: 0.2, delay: 0.05 });
      tone(master, { type: 'triangle', f0: 1318, dur: 0.5, gain: 0.18, delay: 0.14 });
    },
    hurt() {
      tone(master, { type: 'sawtooth', f0: 170, f1: 80, dur: 0.16, gain: 0.08 });
      noise(master, { dur: 0.12, f0: 700, f1: 200, gain: 0.35 });
    },
    whiz(pos) { noise(out(pos), { dur: 0.14, type: 'bandpass', f0: 5000, f1: 1400, q: 5, gain: 0.7 }); },
    ricochet(pos) { tone(out(pos), { type: 'triangle', f0: rand(1800, 2600), f1: 900, dur: 0.12, gain: 0.08 }); },
    thud(pos) { noise(out(pos), { dur: 0.06, type: 'bandpass', f0: 1400, q: 1.5, gain: 0.25 }); },
    reloadStart() {
      noise(master, { dur: 0.03, type: 'highpass', f0: 3000, gain: 0.3 });
      tone(master, { type: 'square', f0: 420, dur: 0.03, gain: 0.04, delay: 0.1 });
    },
    reloadEnd() {
      noise(master, { dur: 0.035, type: 'highpass', f0: 2200, gain: 0.35 });
      noise(master, { dur: 0.04, type: 'highpass', f0: 1800, gain: 0.35, delay: 0.09 });
    },
    empty() { tone(master, { type: 'square', f0: 1300, dur: 0.02, gain: 0.06 }); },
    step(pos, v = 1) {
      const d = out(pos);
      tone(d, { f0: rand(200, 240), f1: 120, dur: 0.06, gain: 0.16 * v });
      noise(d, { dur: 0.03, type: 'bandpass', f0: 1500, q: 1, gain: 0.07 * v });
    },
    land(pos) {
      const d = out(pos);
      tone(d, { f0: 130, f1: 50, dur: 0.14, gain: 0.35 });
      noise(d, { dur: 0.1, f0: 900, f1: 150, gain: 0.2 });
    },
    dash(pos) { noise(out(pos), { dur: 0.32, type: 'bandpass', f0: 300, f1: 2400, q: 1.5, gain: 0.55 }); },
    ram() {
      tone(master, { f0: 110, f1: 40, dur: 0.25, gain: 0.8 });
      noise(master, { dur: 0.2, f0: 2000, f1: 200, gain: 0.5 });
      sounds.hit();
    },
    knock(pos, v = 0.5, pitch = 1) {
      const d = out(pos);
      tone(d, { type: 'triangle', f0: rand(520, 680) * pitch, f1: 300 * pitch, dur: 0.07, gain: 0.32 * v });
      noise(d, { dur: 0.03, type: 'bandpass', f0: 1800 * pitch, q: 1.5, gain: 0.22 * v });
    },
    guardUp(pos) {
      const d = out(pos);
      tone(d, { type: 'triangle', f0: 300, f1: 180, dur: 0.12, gain: 0.4 });
      noise(d, { dur: 0.08, type: 'bandpass', f0: 900, q: 1.5, gain: 0.35 });
    },
    guard(pos) {
      const d = out(pos);
      tone(d, { type: 'triangle', f0: 420, f1: 260, dur: 0.1, gain: 0.35 });
      noise(d, { dur: 0.05, type: 'bandpass', f0: 1200, q: 2, gain: 0.3 });
    },
    launcher(pos) {
      const d = out(pos);
      tone(d, { f0: 90, f1: 45, dur: 0.2, gain: 0.9 });
      noise(d, { dur: 0.15, type: 'bandpass', f0: 500, q: 1, gain: 0.5 });
    },
    clunk(pos) { const d = out(pos); tone(d, { type: 'triangle', f0: rand(300, 380), f1: 180, dur: 0.07, gain: 0.3 }); },
    boom(pos) {
      const d = out(pos);
      tone(d, { f0: 70, f1: 25, dur: 0.9, gain: 1 });
      noise(d, { dur: 1.2, f0: 2500, f1: 60, gain: 0.9 });
      noise(d, { dur: 0.08, type: 'highpass', f0: 1500, gain: 0.5 });
    },
    leap(pos) { noise(out(pos), { dur: 0.4, type: 'bandpass', f0: 250, f1: 1600, q: 1.2, gain: 0.5 }); },
    heal() { tone(master, { f0: 660, dur: 0.25, gain: 0.15 }); tone(master, { f0: 990, dur: 0.35, gain: 0.12, delay: 0.1 }); tone(master, { f0: 1320, dur: 0.5, gain: 0.1, delay: 0.2 }); },
    smoke(pos) { noise(out(pos), { dur: 1.5, type: 'highpass', f0: 1500, f1: 600, gain: 0.35 }); },
    pierce() { tone(master, { type: 'sawtooth', f0: 200, f1: 900, dur: 0.4, gain: 0.06 }); tone(master, { f0: 400, f1: 1800, dur: 0.4, gain: 0.1 }); },
    bowReady() { tone(master, { type: 'triangle', f0: 1400, dur: 0.05, gain: 0.12 }); noise(master, { dur: 0.03, type: 'highpass', f0: 3000, gain: 0.15 }); },
    ding() { tone(master, { f0: 2093, dur: 0.35, gain: 0.16 }); tone(master, { f0: 3136, dur: 0.25, gain: 0.07 }); },
    bowDraw() { noise(master, { dur: 0.5, type: 'bandpass', f0: 300, f1: 700, q: 6, gain: 0.12 }); },
    bow(pos) {
      const d = out(pos);
      tone(d, { type: 'triangle', f0: 190, f1: 80, dur: 0.18, gain: 0.5 });
      noise(d, { dur: 0.12, type: 'bandpass', f0: 1800, f1: 600, q: 1.2, gain: 0.3 });
    },
    arrowHit(pos) {
      const d = out(pos);
      tone(d, { f0: 230, f1: 110, dur: 0.09, gain: 0.45 });
      noise(d, { dur: 0.05, type: 'bandpass', f0: 1400, q: 1.5, gain: 0.3 });
    },
    homing(pos) { const d = out(pos); tone(d, { f0: 500, f1: 1400, dur: 0.3, gain: 0.18 }); tone(d, { f0: 750, f1: 2100, dur: 0.3, gain: 0.08 }); },
    beep(hi) { tone(master, { f0: hi ? 988 : 659, dur: hi ? 0.45 : 0.16, gain: 0.22 }); },
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
    init, listener,
    play(name, ...a) { if (!ctx) return; try { sounds[name](...a); } catch (e) {} },
    setVol(v) { if (master) master.gain.value = v; },
  };
})();
