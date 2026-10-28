import type { Customizations } from '../customizations';
import type { DailyStats } from '../daily-stats';
import type { Rank } from '../ranks';
import { formatBytes } from '../types';
import type { AppInfo } from '../types';
import { $ } from './dom';

export interface CustomizationPatch {
  nickname?: string;
  color?: string;
}

interface ProcessPanelOptions {
  customizations: Customizations;
  stats: DailyStats;
  /** When each app was first seen this session. */
  firstSeen: ReadonlyMap<string, number>;
  onCustomize: (patch: CustomizationPatch) => void;
  onPushOut: () => void;
  onClose: () => void;
}

function percent(value: number): string {
  return `${value.toLocaleString('en-US', { maximumFractionDigits: value < 10 ? 1 : 0 })}%`;
}

function since(start: number): string {
  const minutes = Math.floor((Date.now() - start) / 60_000);
  if (minutes < 1) return 'under a minute';
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

function mood(cpu: number): string {
  if (cpu >= 80) return 'Full throttle';
  if (cpu >= 25) return 'Warming up';
  if (cpu >= 3) return 'Focused';
  return 'Meditating';
}

/** The card of the selected app: rank, memory, CPU, today's record, customisation, push out. */
export class ProcessPanel {
  private readonly root = $('#process-panel');
  private readonly nickname = $<HTMLInputElement>('#nickname');
  private shownId?: string;

  constructor(private readonly options: ProcessPanelOptions) {
    this.nickname.addEventListener('input', () => options.onCustomize({ nickname: this.nickname.value }));
    $('#swatches').addEventListener('click', (event) => {
      const color = (event.target as HTMLElement).closest<HTMLElement>('[data-color]')?.dataset.color;
      if (color) options.onCustomize({ color });
    });
    $('#customize-reset').addEventListener('click', () => options.onCustomize({ nickname: '', color: '' }));
    $('#push-out').addEventListener('click', options.onPushOut);
    $('#panel-close').addEventListener('click', options.onClose);
  }

  /** Shows the app, or hides the card; returns whether the selection changed. */
  show(process: AppInfo | undefined, rank: Rank, totalMemory: number): boolean {
    const changed = process?.id !== this.shownId;
    this.shownId = process?.id;
    this.root.hidden = !process;
    if (!process) return changed;
    const { customizations, stats, firstSeen } = this.options;

    const chip = $('#process-rank');
    chip.dataset.tier = rank.tier;
    chip.dataset.term = rank.tier;
    chip.tabIndex = 0;
    chip.innerHTML = `<b>${rank.kanji}</b>${rank.label} · ${rank.title}`;
    const custom = customizations.get(process.id);
    $('#process-name').textContent = custom.nickname ?? process.name;
    const processes = process.process_count > 1
      ? `${process.process_count} processes · PID ${process.pid}`
      : `1 process · PID ${process.pid}`;
    $('#process-pid').textContent = custom.nickname ? `${process.name} · ${processes}` : processes;

    const trophies = stats.trophies().filter((trophy) => trophy.id === process.id);
    $('#process-trophies').replaceChildren(...trophies.map((trophy) => {
      const element = document.createElement('span');
      element.className = 'trophy-chip';
      element.dataset.kind = trophy.kind;
      element.textContent = trophy.title;
      element.title = trophy.detail;
      return element;
    }));

    const share = totalMemory > 0 ? process.memory / totalMemory * 100 : 0;
    $('#process-memory').textContent = formatBytes(process.memory);
    $('#process-memory-meter').style.width = `${Math.min(share * 4, 100)}%`;
    $('#process-share').textContent = `${percent(share)} of RAM`;
    $('#process-cpu').textContent = percent(process.cpu);
    $('#process-cpu-meter').style.width = `${Math.min(process.cpu, 100)}%`;
    $('#process-mood').textContent = mood(process.cpu);

    const day = stats.app(process.id);
    $('#process-peak').textContent = day ? formatBytes(day.peak) : formatBytes(process.memory);
    $('#process-bouts').textContent = day && day.wins + day.losses > 0 ? `${day.wins}W · ${day.losses}L` : 'none';
    const seen = firstSeen.get(process.id);
    $('#process-since').textContent = seen ? since(seen) : '—';

    if (changed || document.activeElement !== this.nickname) this.nickname.value = custom.nickname ?? '';
    $('#swatches').querySelectorAll<HTMLElement>('[data-color]').forEach((swatch) => {
      swatch.setAttribute('aria-checked', String(swatch.dataset.color === custom.color));
    });
    $<HTMLButtonElement>('#push-out').disabled = process.locked;
    $('#push-out-hint').textContent = process.system
      ? 'Protected: it is the operating system'
      : process.locked ? 'Protected: a system or arena process' : 'Quits the app';
    return changed;
  }
}
