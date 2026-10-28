import { $ } from './dom';

const COINS = 9;

/** Chanko coins fly from where they were won into the balance. */
export function flyCoins(from: Element): void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const start = from.getBoundingClientRect();
  const end = $('#chanko-balance').getBoundingClientRect();
  if (start.width === 0 || end.width === 0) return;
  const layer = $('#coin-layer');
  for (let i = 0; i < COINS; i++) {
    const coin = document.createElement('i');
    coin.className = 'coin';
    layer.append(coin);
    const x0 = start.left + start.width / 2 + (Math.random() - 0.5) * start.width * 0.5;
    const y0 = start.top + start.height / 2 + (Math.random() - 0.5) * start.height * 0.4;
    const x1 = end.left + end.width / 2;
    const y1 = end.top + end.height / 2;
    // Arc sideways on the way, so the coins don't travel in a single file.
    const bend = (Math.random() - 0.5) * 160;
    const animation = coin.animate([
      { transform: `translate(${x0}px, ${y0}px) scale(.4)`, opacity: 0 },
      { transform: `translate(${x0 + bend * 0.3}px, ${y0 - 40}px) scale(1)`, opacity: 1, offset: 0.2 },
      { transform: `translate(${(x0 + x1) / 2 + bend}px, ${Math.min(y0, y1) - 30}px) scale(.9)`, opacity: 1, offset: 0.6 },
      { transform: `translate(${x1}px, ${y1}px) scale(.5)`, opacity: 0.2 },
    ], { duration: 900 + i * 45, delay: i * 55, easing: 'cubic-bezier(.45,.05,.55,.95)', fill: 'backwards' });
    animation.onfinish = () => coin.remove();
  }
  window.setTimeout(() => $('.chanko-stat').classList.add('is-glowing'), 900);
  window.setTimeout(() => $('.chanko-stat').classList.remove('is-glowing'), 1700);
}

export function renderBalance(balance: number, change = 0): void {
  $('#chanko-balance').textContent = balance.toLocaleString('en-US');
  if (change === 0) return;
  const delta = $('#chanko-delta');
  delta.textContent = change > 0 ? `+${change}` : `−${-change}`;
  delta.classList.toggle('is-loss', change < 0);
  delta.classList.remove('is-bumping');
  void delta.offsetWidth;
  delta.classList.add('is-bumping');
}
