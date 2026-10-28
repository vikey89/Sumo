import type { CpuHistory } from './generated/CpuHistory';
import { escapeHtml } from './ui/dom';

export type { CpuHistory } from './generated/CpuHistory';
export type { CpuSample } from './generated/CpuSample';

export interface Spike {
  start: number;
  end: number;
  peak: number;
  culprit?: { id: string; name: string; share: number };
}

const WINDOW_SECONDS = 600;
/** Share of all cores that counts as the fans' business. */
export const SPIKE_CPU = 30;
const MIN_SPIKE_SECONDS = 3;
/** Dips shorter than this don't split a spike in two. */
const MERGE_GAP_SECONDS = 4;
const REFRESH_MS = 2000;
const CHART_HEIGHT = 160;
const PAD = { top: 22, right: 8, bottom: 22, left: 34 };

/** Stretches of high load, oldest first, each with the app that did most of the work. */
export function findSpikes({ cores, samples }: CpuHistory): Spike[] {
  const runs: [number, number][] = [];
  samples.forEach((sample, index) => {
    if (sample.cpu < SPIKE_CPU) return;
    const last = runs.at(-1);
    if (last && sample.t - samples[last[1]].t <= MERGE_GAP_SECONDS) last[1] = index;
    else runs.push([index, index]);
  });
  return runs
    .filter(([from, to]) => samples[to].t - samples[from].t + 1 >= MIN_SPIKE_SECONDS)
    .map(([from, to]) => {
      const slice = samples.slice(from, to + 1);
      const work = new Map<string, { name: string; cpu: number }>();
      for (const sample of slice) {
        for (const [id, name, cpu] of sample.top) {
          const entry = work.get(id) ?? { name, cpu: 0 };
          entry.cpu += cpu;
          work.set(id, entry);
        }
      }
      const total = slice.reduce((sum, sample) => sum + sample.cpu * cores, 0);
      const [id, best] = [...work].sort((a, b) => b[1].cpu - a[1].cpu)[0] ?? [];
      return {
        start: slice[0].t,
        end: slice.at(-1)!.t,
        peak: Math.max(...slice.map((sample) => sample.cpu)),
        culprit: id && best ? { id, name: best.name, share: total > 0 ? Math.min(1, best.cpu / total) : 0 } : undefined,
      };
    });
}

function clock(seconds: number): string {
  return new Date(seconds * 1000).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function duration(seconds: number): string {
  return seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${seconds % 60 ? `${seconds % 60} s` : ''}`.trim();
}

const SVG = 'http://www.w3.org/2000/svg';

/** "Who turned the fans on?": the last ten minutes of CPU, with the culprit of every spike. */
export class FanWatch {
  private readonly dialog: HTMLDialogElement;
  private readonly chart: HTMLElement;
  private readonly tip: HTMLElement;
  private history?: CpuHistory;
  private timer?: number;
  private hoverX?: number;

  constructor(
    private readonly load: () => Promise<CpuHistory | undefined>,
    private readonly nameOf: (id: string, name: string) => string,
    private readonly onPick: (id: string) => void,
  ) {
    this.dialog = document.createElement('dialog');
    this.dialog.className = 'dialog fans';
    this.dialog.setAttribute('aria-labelledby', 'fans-title');
    this.dialog.innerHTML = `
      <form method="dialog">
        <button value="close" class="panel-close" aria-label="Close">×</button>
        <span class="dialog-kanji" aria-hidden="true">熱</span>
        <h2 id="fans-title">Who turned the fans on?</h2>
        <p id="fans-summary">Reading the last ten minutes…</p>
        <div class="fans-chart" id="fans-chart"><div class="fans-tip" hidden></div></div>
        <h3 class="fans-heading">Spikes</h3>
        <ol class="fans-spikes" id="fans-spikes"></ol>
      </form>`;
    document.body.append(this.dialog);
    this.chart = this.dialog.querySelector('#fans-chart')!;
    this.tip = this.dialog.querySelector('.fans-tip')!;

    this.chart.addEventListener('pointermove', (event) => {
      this.hoverX = event.clientX - this.chart.getBoundingClientRect().left;
      this.hover();
    });
    this.chart.addEventListener('pointerleave', () => {
      this.hoverX = undefined;
      this.hover();
    });
    this.dialog.querySelector('#fans-spikes')!.addEventListener('click', (event) => {
      const id = (event.target as HTMLElement).closest<HTMLElement>('[data-id]')?.dataset.id;
      if (!id) return;
      this.dialog.close();
      this.onPick(id);
    });
    this.dialog.addEventListener('close', () => window.clearInterval(this.timer));
  }

  open(): void {
    if (this.dialog.open) return;
    this.dialog.showModal();
    void this.refresh();
    this.timer = window.setInterval(() => void this.refresh(), REFRESH_MS);
  }

  private async refresh(): Promise<void> {
    const history = await this.load();
    if (!this.dialog.open) return;
    if (!history) {
      this.dialog.querySelector('#fans-summary')!.textContent = 'The local engine is not responding.';
      return;
    }
    this.history = history;
    this.render();
  }

  private render(): void {
    const history = this.history!;
    const { samples, cores } = history;
    const spikes = findSpikes(history);
    const now = samples.at(-1)?.t ?? Date.now() / 1000;
    const since = samples[0]?.t ?? now;
    const covered = Math.max(1, Math.round(now - since));

    const summary = this.dialog.querySelector('#fans-summary')!;
    const latest = samples.at(-1);
    const current = latest ? ` Right now: ${Math.round(latest.cpu)}%.` : '';
    if (spikes.length === 0) {
      summary.textContent = `All calm: no spikes ${covered < WINDOW_SECONDS - 5 ? `since the engine started ${duration(covered)} ago` : 'in the last 10 minutes'}.${current}`;
    } else {
      const counts = new Map<string, number>();
      for (const spike of spikes) if (spike.culprit) counts.set(spike.culprit.name, (counts.get(spike.culprit.name) ?? 0) + 1);
      const main = [...counts].sort((a, b) => b[1] - a[1])[0];
      const lead = [...spikes].reverse().find((spike) => spike.culprit?.name === main?.[0])?.culprit;
      summary.textContent = `${lead ? `Mostly ${this.nameOf(lead.id, lead.name)}` : 'Spikes'}: ${spikes.length} ${spikes.length === 1 ? 'spike' : 'spikes'} in the last ${covered < WINDOW_SECONDS - 5 ? duration(covered) : '10 minutes'}, across all ${cores} cores.${current}`;
    }

    this.drawChart(spikes, now);
    const list = this.dialog.querySelector('#fans-spikes')!;
    list.innerHTML = spikes.length === 0
      ? '<li class="fans-empty">Nothing above 30% of the CPU for more than a couple of seconds.</li>'
      : [...spikes].reverse().map((spike) => {
        const name = spike.culprit ? escapeHtml(this.nameOf(spike.culprit.id, spike.culprit.name)) : 'Many apps at once';
        const share = spike.culprit ? ` · ${Math.round(spike.culprit.share * 100)}% of the load` : '';
        return `<li><button type="button"${spike.culprit ? ` data-id="${escapeHtml(spike.culprit.id)}"` : ' disabled'}>
          <time>${clock(spike.start)}</time><strong>${name}</strong>
          <span>${duration(spike.end - spike.start + 1)} · peak ${Math.round(spike.peak)}%${share}</span>
        </button></li>`;
      }).join('');
  }

  private drawChart(spikes: Spike[], now: number): void {
    const { samples } = this.history!;
    const width = Math.max(280, this.chart.clientWidth);
    const plotWidth = width - PAD.left - PAD.right;
    const plotHeight = CHART_HEIGHT - PAD.top - PAD.bottom;
    const x = (t: number) => PAD.left + (1 - (now - t) / WINDOW_SECONDS) * plotWidth;
    const y = (cpu: number) => PAD.top + (1 - cpu / 100) * plotHeight;

    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', `0 0 ${width} ${CHART_HEIGHT}`);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', `CPU use over the last 10 minutes, ${spikes.length} spikes.`);
    const parts: string[] = [];

    for (const level of [0, 50, 100]) {
      parts.push(`<line class="grid" x1="${PAD.left}" x2="${width - PAD.right}" y1="${y(level)}" y2="${y(level)}"/>`);
      parts.push(`<text class="axis" x="${PAD.left - 8}" y="${y(level) + 4}" text-anchor="end">${level}%</text>`);
    }
    for (const [minutes, label] of [[10, '10 min ago'], [5, '5 min'], [0, 'now']] as const) {
      const anchor = minutes === 10 ? 'start' : minutes === 0 ? 'end' : 'middle';
      parts.push(`<text class="axis" x="${x(now - minutes * 60)}" y="${CHART_HEIGHT - 6}" text-anchor="${anchor}">${label}</text>`);
    }
    // Newest first, so when labels would collide the most recent culprit keeps its name.
    let labelLeft = Infinity;
    for (const spike of [...spikes].reverse()) {
      const left = x(spike.start - 0.5);
      const right = x(spike.end + 0.5);
      parts.push(`<rect class="spike" x="${left}" y="${PAD.top}" width="${Math.max(3, right - left)}" height="${plotHeight}" rx="2"/>`);
      if (!spike.culprit) continue;
      const name = this.nameOf(spike.culprit.id, spike.culprit.name);
      const half = Math.min(name.length, 22) * 3.1;
      const center = Math.min(Math.max((left + right) / 2, PAD.left + half), width - PAD.right - half);
      if (center + half + 8 > labelLeft) continue;
      labelLeft = center - half;
      const label = name.length > 22 ? `${name.slice(0, 21)}…` : name;
      parts.push(`<text class="spike-label" x="${center}" y="${PAD.top - 8}" text-anchor="middle">${escapeHtml(label)}</text>`);
    }
    parts.push(`<line class="threshold" x1="${PAD.left}" x2="${width - PAD.right}" y1="${y(SPIKE_CPU)}" y2="${y(SPIKE_CPU)}"/>`);

    if (samples.length > 1) {
      const points = samples.map((sample) => `${x(sample.t).toFixed(1)},${y(sample.cpu).toFixed(1)}`);
      const first = x(samples[0].t).toFixed(1);
      const last = x(samples.at(-1)!.t).toFixed(1);
      parts.push(`<defs><linearGradient id="fans-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#e4bf77" stop-opacity=".34"/><stop offset="1" stop-color="#e4bf77" stop-opacity="0"/></linearGradient></defs>`);
      parts.push(`<path class="area" d="M${first},${y(0)} L${points.join(' L')} L${last},${y(0)} Z"/>`);
      parts.push(`<polyline class="line" points="${points.join(' ')}"/>`);
    }
    parts.push('<line class="cursor" y1="0" y2="0" hidden/><circle class="cursor-dot" r="4" hidden/>');
    svg.innerHTML = parts.join('');
    this.chart.querySelector('svg')?.remove();
    this.chart.prepend(svg);
    this.hover();
  }

  /** Crosshair and tooltip for the second under the pointer. */
  private hover(): void {
    const svg = this.chart.querySelector('svg');
    const history = this.history;
    const cursor = svg?.querySelector<SVGLineElement>('.cursor');
    const dot = svg?.querySelector<SVGCircleElement>('.cursor-dot');
    if (!svg || !history || !cursor || !dot || this.hoverX === undefined || history.samples.length === 0) {
      cursor?.setAttribute('hidden', '');
      dot?.setAttribute('hidden', '');
      this.tip.hidden = true;
      return;
    }
    const { samples, cores } = history;
    const width = svg.viewBox.baseVal.width;
    const scale = width / this.chart.clientWidth;
    const plotWidth = width - PAD.left - PAD.right;
    const now = samples.at(-1)!.t;
    const t = now - (1 - (this.hoverX * scale - PAD.left) / plotWidth) * WINDOW_SECONDS;
    const sample = samples.reduce((best, candidate) => Math.abs(candidate.t - t) < Math.abs(best.t - t) ? candidate : best);
    const px = PAD.left + (1 - (now - sample.t) / WINDOW_SECONDS) * plotWidth;
    const py = PAD.top + (1 - sample.cpu / 100) * (CHART_HEIGHT - PAD.top - PAD.bottom);

    for (const [name, value] of [['x1', px], ['x2', px], ['y1', PAD.top], ['y2', CHART_HEIGHT - PAD.bottom]] as const) {
      cursor.setAttribute(name, String(value));
    }
    dot.setAttribute('cx', String(px));
    dot.setAttribute('cy', String(py));
    cursor.removeAttribute('hidden');
    dot.removeAttribute('hidden');

    const apps = sample.top.map(([id, name, cpu]) =>
      `<li><span>${escapeHtml(this.nameOf(id, name))}</span><b>${Math.round(cpu / cores)}%</b></li>`).join('');
    this.tip.innerHTML = `<strong>${new Date(sample.t * 1000).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })} · ${Math.round(sample.cpu)}% CPU</strong>${apps ? `<ul>${apps}</ul>` : '<p>Nothing busy</p>'}`;
    this.tip.hidden = false;
    // Beside the crosshair, on whichever side has room, inside the plot.
    const left = px / scale;
    const tipWidth = this.tip.offsetWidth;
    const right = left + 12 + tipWidth <= this.chart.clientWidth;
    this.tip.style.left = `${right ? left + 12 : Math.max(0, left - 12 - tipWidth)}px`;
    this.tip.style.top = `${PAD.top / scale}px`;
  }
}
