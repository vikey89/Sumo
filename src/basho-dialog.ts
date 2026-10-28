import { BASHO_DAYS, KACHI_KOSHI } from './basho';
import type { Basho } from './basho';
import { escapeHtml } from './ui/dom';

/** The tournament board: standings with their hoshitori, and past champions. */
export class BashoDialog {
  private readonly dialog: HTMLDialogElement;

  constructor(
    private readonly basho: Basho,
    private readonly nameOf: (id: string, name: string) => string,
    private readonly onPick: (id: string) => void,
  ) {
    this.dialog = document.createElement('dialog');
    this.dialog.className = 'dialog basho';
    this.dialog.setAttribute('aria-labelledby', 'basho-title');
    this.dialog.innerHTML = `
      <form method="dialog">
        <button value="close" class="panel-close" aria-label="Close">×</button>
        <span class="dialog-kanji" aria-hidden="true">場所</span>
        <h2 id="basho-title"></h2>
        <p id="basho-copy"></p>
        <ol class="basho-standings" id="basho-standings"></ol>
        <h3 class="basho-heading">Past champions</h3>
        <ol class="basho-champions" id="basho-champions"></ol>
      </form>`;
    document.body.append(this.dialog);
    this.dialog.querySelector('#basho-standings')!.addEventListener('click', (event) => {
      const id = (event.target as HTMLElement).closest<HTMLElement>('[data-id]')?.dataset.id;
      if (!id) return;
      this.dialog.close();
      this.onPick(id);
    });
  }

  open(): void {
    this.render();
    if (!this.dialog.open) this.dialog.showModal();
  }

  private render(): void {
    const { basho } = this;
    const today = basho.day;
    this.dialog.querySelector('#basho-title')!.textContent = basho.name;
    this.dialog.querySelector('#basho-copy')!.innerHTML = `Day ${today} of ${BASHO_DAYS}. Each app's first bout of the day is its official one: `
      + `${KACHI_KOSHI} wins is a winning record (<b data-term="kachikoshi">kachi-koshi</b>), and the most wins takes the <b data-term="yusho">yūshō</b>.`;

    const standings = basho.standings();
    const list = this.dialog.querySelector('#basho-standings')!;
    list.innerHTML = standings.length === 0
      ? '<li class="basho-empty">No official bouts yet. Leave the arena open: the first bout of each day counts.</li>'
      : standings.map((standing, index) => {
        const stars = standing.days.map((day, dayIndex) => {
          const state = day === true ? 'win' : day === false ? 'loss' : dayIndex < today - 1 ? 'missed' : 'ahead';
          const label = day === true ? 'won' : day === false ? 'lost' : 'no bout';
          return `<i class="is-${state}" title="Day ${dayIndex + 1}: ${label}"></i>`;
        }).join('');
        const badge = standing.wins >= KACHI_KOSHI
          ? '<em class="is-good" data-term="kachikoshi">kachi-koshi</em>'
          : standing.losses >= KACHI_KOSHI ? '<em data-term="makekoshi">make-koshi</em>' : '';
        return `<li><button type="button" data-id="${escapeHtml(standing.id)}"${index === 0 ? ' class="is-leader"' : ''}>
          <span class="basho-place">${index + 1}</span>
          <strong>${escapeHtml(this.nameOf(standing.id, standing.name))}</strong>
          <span class="basho-record">${standing.wins}–${standing.losses}</span>
          <span class="hoshitori" role="img" aria-label="${standing.wins} wins, ${standing.losses} losses">${stars}</span>
          ${badge}
        </button></li>`;
      }).join('');

    const champions = basho.champions;
    this.dialog.querySelector('#basho-champions')!.innerHTML = champions.length === 0
      ? `<li class="basho-empty">The first champion will be crowned after day ${BASHO_DAYS}.</li>`
      : champions.map((champion) => `<li><span>${escapeHtml(champion.basho)}</span>`
        + `<strong>${escapeHtml(this.nameOf(champion.id, champion.name))}</strong><b>${champion.wins}–${champion.losses}</b></li>`).join('');
  }
}
