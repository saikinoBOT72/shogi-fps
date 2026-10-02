// 銃のアニメーション：部品ごとの動きをキー（時刻と値）で書いて、元の位置に足し合わせる
//
//   clip = { dur: 秒, tracks: [[部品名, 'px'|'py'|'pz'|'rx'|'ry'|'rz'|'vis', [[時刻, 値], ...], 補間?], ...], events: [[時刻, 名前]] }
//   hold: true の動きは、最後の形のまま止まる（弾切れでスライドが下がったまま、など）
import * as THREE from 'three';

export type Key = [number, number];
export type Ease = 'smooth' | 'lin' | 'out' | 'in' | 'step';
export type Track = [string, 'px' | 'py' | 'pz' | 'rx' | 'ry' | 'rz' | 'vis', Key[], Ease?];
export type Clip = { dur: number; tracks: Track[]; events?: [number, string][]; hold?: boolean };

const EASE = {
  lin: (k: number) => k,
  smooth: (k: number) => k * k * (3 - 2 * k),
  out: (k: number) => 1 - (1 - k) * (1 - k),
  in: (k: number) => k * k,
  step: (k: number) => (k < 1 ? 0 : 1),
};
function sample(keys: Key[], t: number, ease: Ease) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1] = keys[i];
    if (t <= t1) {
      const [t0, v0] = keys[i - 1];
      return v0 + (v1 - v0) * EASE[ease]((t - t0) / (t1 - t0 || 1));
    }
  }
  return keys[keys.length - 1][1];
}

type Playing = { name: string; clip: Clip; t: number; speed: number };

export class GunAnimator {
  private base = new Map<THREE.Object3D, { p: THREE.Vector3; r: THREE.Euler; v: boolean }>();
  private active: Playing[] = [];
  on: (ev: string) => void = () => {};
  constructor(public parts: Record<string, THREE.Object3D>, public clips: Record<string, Clip>) {}

  // dur を渡すと、その長さに合わせて速さを変える（リロード時間に合わせるなど）
  play(name: string, dur?: number) {
    const clip = this.clips[name];
    if (!clip) return;
    this.stop(name);
    this.active.push({ name, clip, t: 0, speed: dur ? clip.dur / dur : 1 });
  }
  stop(name: string) { this.active = this.active.filter(a => a.name !== name); }
  has(name: string) { return this.active.some(a => a.name === name); }
  clear() { this.active = []; }
  // 元の位置を覚え直す（構えの向き・大きさを変える前に呼ぶ）
  //   銃全体（root）の見える・見えないは持ち替え（VM.setWeapon）が決めるので、ここでは戻さない
  //   （戻すと、画面の大きさが変わったとき＝全画面の切り替えで、前に持った武器が全部見えてしまう）
  rebase() { for (const [o, b] of this.base) { o.position.copy(b.p); o.rotation.copy(b.r); if (o !== this.parts.root) o.visible = b.v; } this.base.clear(); }

  update(dt: number) {
    // 元の位置を覚える（組み立てたあと最初に動かすとき）
    if (!this.base.size) for (const o of Object.values(this.parts)) this.base.set(o, { p: o.position.clone(), r: o.rotation.clone(), v: o.visible });
    for (const [o, b] of this.base) { o.position.copy(b.p); o.rotation.copy(b.r); if (o !== this.parts.root) o.visible = b.v; }
    for (let i = this.active.length - 1; i >= 0; i--) {
      const a = this.active[i], prev = a.t;
      a.t = Math.min(a.clip.dur, a.t + dt * a.speed);
      for (const [t, ev] of a.clip.events || []) if (t > prev && t <= a.t) this.on(ev);
      if (this.active[i] !== a) continue;   // 出来事の中で止められた
      for (const [part, prop, keys, ease] of a.clip.tracks) {
        const o = this.parts[part];
        if (!o) continue;
        const v = sample(keys, a.t, prop === 'vis' ? 'step' : ease || 'smooth');
        if (prop === 'vis') { if (v < 0.5) o.visible = false; else if (keys.some(k => k[1] < 0.5)) o.visible = true; continue; }
        const axis = prop[1] as 'x' | 'y' | 'z';
        if (prop[0] === 'p') o.position[axis] += v; else o.rotation[axis] += v;
      }
      if (a.t >= a.clip.dur && !a.clip.hold) this.active.splice(i, 1);
    }
  }
}
