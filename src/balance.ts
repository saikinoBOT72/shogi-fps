// 駒の強さ表（開発者メニュー）：core.ts の今の数値から表を作り、ゲームの上に重ねて見せる
import { PIECES, RULES, SKILLS, WEAPONS } from './core';
import tpl from './dev/balance.html?raw';

// 表の並び：元の駒 → その成駒 の順、特殊駒は最後
function balanceData() {
  const ks = Object.keys(PIECES), order: string[] = [];
  for (const k of ks) if (!PIECES[k].promo && !PIECES[k].special) { order.push(k); order.push(...ks.filter(x => PIECES[x].promo === k)); }
  order.push(...ks.filter(k => PIECES[k].special));
  const P = {}, S = {};
  for (const k of order) {
    const p = PIECES[k];
    P[k] = { name: p.name, hp: p.hp, size: p.size, speed: p.speed, jump: p.jump, strafe: p.strafe || 1, weapon: p.weapon, skills: p.skills, promo: p.promo || null, special: !!p.special };
    for (const s of p.skills) { const x = SKILLS[s]; S[s] = { name: x.name, cd: x.cooldown, charges: x.charges || 1, dur: x.duration || 0, help: x.help }; }
  }
  return { order, P, W: WEAPONS, S, RULES };
}

export function openBalance() {
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;inset:0;z-index:10000;background:#000;display:flex;flex-direction:column';
  const close = document.createElement('button');
  close.textContent = '閉じる';
  close.style.cssText = 'position:absolute;top:8px;right:12px;z-index:1;padding:6px 14px;font:700 14px sans-serif;border:0;border-radius:6px;background:#333;color:#fff;cursor:pointer';
  const f = document.createElement('iframe');
  f.style.cssText = 'flex:1;border:0;width:100%;background:#fff';
  f.srcdoc = tpl.replace('/*DATA*/null', JSON.stringify(balanceData()).replace(/</g, '\u003c'));
  const stop = (e: Event) => e.stopPropagation();
  box.addEventListener('click', stop); box.addEventListener('mousedown', stop); box.addEventListener('keydown', stop);
  close.onclick = () => box.remove();
  box.append(f, close);
  document.body.append(box);
}
