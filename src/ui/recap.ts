import type { DailyStats } from '../daily-stats';
import { drawShareCard, recapText } from '../share-card';
import { formatBytes } from '../types';
import type { AppInfo } from '../types';
import { $ } from './dom';

/** "Your Mac today": the day's totals and trophies, to copy as text or download as a card. */
export class Recap {
  private readonly dialog = $<HTMLDialogElement>('#recap-dialog');

  constructor(private readonly stats: DailyStats, private readonly displayName: (app: Pick<AppInfo, 'id' | 'name'>) => string) {
    $('#recap-open').addEventListener('click', () => this.open());
    $('#recap-copy').addEventListener('click', (event) => void this.copy(event.currentTarget as HTMLButtonElement));
    $('#recap-download').addEventListener('click', () => void this.download());
  }

  open(): void {
    this.render();
    this.dialog.showModal();
  }

  private render(): void {
    const { stats } = this;
    const day = stats.day;
    $('#recap-date').textContent = new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' });
    const totals: [string, string][] = [
      ['Memory devoured', formatBytes(stats.totalEaten())],
      ['Bouts', day.bouts.toString()],
      ['Pushed out', day.pushedOut.toString()],
      ['Missions', (day.missions ?? 0).toString()],
      ['Predictions right', `${day.predictionsWon ?? 0}/${day.predictions ?? 0}`],
    ];
    $('#recap-totals').innerHTML = totals.map(([label, value]) => `<div><strong>${value}</strong><span>${label}</span></div>`).join('');
    const trophies = stats.trophies();
    const list = $('#recap-trophies');
    list.replaceChildren(...trophies.map((trophy) => {
      const item = document.createElement('li');
      item.dataset.kind = trophy.kind;
      item.innerHTML = '<span class="recap-title"></span><strong></strong><small></small>';
      item.querySelector('.recap-title')!.textContent = trophy.title;
      item.querySelector('strong')!.textContent = this.displayName({ id: trophy.id, name: trophy.name });
      item.querySelector('small')!.textContent = trophy.detail;
      return item;
    }));
    if (trophies.length === 0) list.innerHTML = '<li class="recap-empty">No trophies yet: let the arena wrestle for a few minutes.</li>';
  }

  private input() {
    const { stats } = this;
    return {
      date: new Date(),
      stats: stats.day,
      totalEaten: stats.totalEaten(),
      trophies: stats.trophies().map((trophy) => ({ ...trophy, name: this.displayName({ id: trophy.id, name: trophy.name }) })),
    };
  }

  private async copy(button: HTMLButtonElement): Promise<void> {
    try {
      await navigator.clipboard.writeText(recapText(this.input()));
      button.textContent = 'Copied!';
    } catch {
      button.textContent = 'Copy failed';
    }
    window.setTimeout(() => { button.textContent = 'Copy text'; }, 1800);
  }

  private async download(): Promise<void> {
    const card = await drawShareCard(this.input());
    card.toBlob((blob) => {
      if (!blob) return;
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `sumo-${this.stats.day.date}.png`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    }, 'image/png');
  }
}
