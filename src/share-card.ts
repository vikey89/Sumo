import type { DayStats, Trophy } from './daily-stats';
import { formatBytes } from './types';

export interface RecapInput {
  date: Date;
  stats: DayStats;
  totalEaten: number;
  trophies: Trophy[];
}

const WIDTH = 1080;
const HEIGHT = 1350;
const SANS = '"DM Sans", -apple-system, sans-serif';
const DISPLAY = 'Manrope, -apple-system, sans-serif';
const SERIF = '"Shippori Mincho B1", "Hiragino Mincho ProN", serif';

function longDate(date: Date): string {
  return date.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export function recapText({ date, stats, totalEaten, trophies }: RecapInput): string {
  const lines = [
    `相撲 SUMO — my Mac, ${longDate(date)}`,
    '',
    `Memory devoured: ${formatBytes(totalEaten)} · Bouts: ${stats.bouts} · Pushed out: ${stats.pushedOut}`,
    '',
    ...trophies.map((trophy) => `${trophy.title}: ${trophy.name} (${trophy.detail})`),
  ];
  return lines.join('\n');
}

function fit(context: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (context.measureText(text).width <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && context.measureText(`${cut}…`).width > maxWidth) cut = cut.slice(0, -1);
  return `${cut}…`;
}

/** A portrait card of the day, ready to post. */
export async function drawShareCard(input: RecapInput): Promise<HTMLCanvasElement> {
  await document.fonts?.ready;
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext('2d')!;

  const background = context.createRadialGradient(WIDTH / 2, HEIGHT * 0.42, 80, WIDTH / 2, HEIGHT * 0.42, HEIGHT * 0.8);
  background.addColorStop(0, '#2b2219');
  background.addColorStop(1, '#0e0d0b');
  context.fillStyle = background;
  context.fillRect(0, 0, WIDTH, HEIGHT);

  // The dohyō: a sand disc and its straw ring.
  context.save();
  context.translate(WIDTH / 2, 530);
  context.scale(1, 0.3);
  context.fillStyle = '#b4774f';
  context.beginPath();
  context.arc(0, 0, 420, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = '#d0aa75';
  context.beginPath();
  context.arc(0, 0, 390, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = '#d2b46d';
  context.lineWidth = 10;
  context.beginPath();
  context.arc(0, 0, 360, 0, Math.PI * 2);
  context.stroke();
  context.restore();

  context.fillStyle = '#d8573c';
  context.beginPath();
  context.arc(WIDTH / 2, 190, 78, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = '#fff5e8';
  context.font = `800 54px ${SERIF}`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText('相', WIDTH / 2, 160);
  context.fillText('撲', WIDTH / 2, 218);

  context.fillStyle = '#f4f0e7';
  context.font = `800 64px ${DISPLAY}`;
  context.fillText('MY MAC TODAY', WIDTH / 2, 320);
  context.fillStyle = '#e4bf77';
  context.font = `500 30px ${SANS}`;
  context.fillText(longDate(input.date), WIDTH / 2, 372);

  const totals: [string, string][] = [
    [formatBytes(input.totalEaten), 'devoured'],
    [input.stats.bouts.toString(), 'bouts'],
    [input.stats.pushedOut.toString(), 'pushed out'],
  ];
  totals.forEach(([value, label], index) => {
    const x = WIDTH / 2 + (index - 1) * 300;
    context.fillStyle = '#1b1814';
    context.font = `800 58px ${DISPLAY}`;
    context.fillText(value, x, 510);
    context.fillStyle = '#4a3a2a';
    context.font = `600 24px ${SANS}`;
    context.fillText(label.toUpperCase(), x, 562);
  });

  const top = 730;
  const rowHeight = 104;
  input.trophies.slice(0, 5).forEach((trophy, index) => {
    const y = top + index * rowHeight;
    context.fillStyle = index % 2 === 0 ? '#ffffff0d' : '#ffffff06';
    context.beginPath();
    context.roundRect(90, y - 44, WIDTH - 180, 92, 22);
    context.fill();
    context.textAlign = 'left';
    context.fillStyle = '#e4bf77';
    context.font = `600 24px ${SANS}`;
    context.fillText(trophy.title.toUpperCase(), 130, y - 12);
    context.fillStyle = '#f4f0e7';
    context.font = `700 36px ${DISPLAY}`;
    context.fillText(fit(context, trophy.name, 520), 130, y + 22);
    context.textAlign = 'right';
    context.fillStyle = '#a9a79d';
    context.font = `500 26px ${SANS}`;
    context.fillText(trophy.detail, WIDTH - 130, y + 6);
  });
  if (input.trophies.length === 0) {
    context.textAlign = 'center';
    context.fillStyle = '#a9a79d';
    context.font = `500 30px ${SANS}`;
    context.fillText('The tournament has just begun.', WIDTH / 2, top + 40);
  }

  context.textAlign = 'center';
  context.fillStyle = '#6f6d66';
  context.font = `600 24px ${SANS}`;
  context.fillText('SUMO · your Mac\'s processes in the arena', WIDTH / 2, HEIGHT - 70);
  return canvas;
}
