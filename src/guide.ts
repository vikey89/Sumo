import { GLOSSARY } from './glossary';
import { escapeHtml } from './ui/dom';

export const SHORTCUTS: [string, string][] = [
  ['B', 'New bout'],
  ['H', 'Arena only: hides the panels'],
  ['L', 'Ranking and missions'],
  ['R', 'Today\'s recap'],
  ['C', 'Who turned the fans on? (CPU)'],
  ['T', 'The basho: tournament standings'],
  ['S', 'Sound'],
  ['F', 'Full screen'],
  ['?', 'This guide'],
  ['Esc', 'Deselect'],
];

/** One floating tooltip for every element marked `data-term`, on hover, focus and tap. */
export function installTermTooltips(): void {
  const tip = document.createElement('div');
  tip.className = 'term-tip';
  tip.setAttribute('role', 'tooltip');
  tip.hidden = true;
  document.body.append(tip);
  let anchor: HTMLElement | undefined;

  const show = (element: HTMLElement) => {
    const entry = GLOSSARY[element.dataset.term ?? ''];
    if (!entry) return;
    anchor = element;
    tip.innerHTML = `<strong>${entry.kanji ? `<span>${entry.kanji}</span>` : ''}${escapeHtml(entry.term)}</strong>`
      + `<p>${escapeHtml(entry.meaning)}</p>${entry.inGame ? `<p class="term-game">${escapeHtml(entry.inGame)}</p>` : ''}`;
    tip.hidden = false;
    const rect = element.getBoundingClientRect();
    const width = tip.offsetWidth;
    const left = Math.min(Math.max(8, rect.left + rect.width / 2 - width / 2), window.innerWidth - width - 8);
    const above = rect.top - tip.offsetHeight - 8;
    tip.style.left = `${left}px`;
    tip.style.top = `${above > 8 ? above : rect.bottom + 8}px`;
  };
  const hide = () => {
    anchor = undefined;
    tip.hidden = true;
  };
  const termOf = (event: Event) => (event.target as Element | null)?.closest?.<HTMLElement>('[data-term]') ?? undefined;

  document.addEventListener('pointerover', (event) => {
    const element = termOf(event);
    if (element && element !== anchor) show(element);
    else if (!element && anchor) hide();
  });
  document.addEventListener('focusin', (event) => {
    const element = termOf(event);
    if (element) show(element);
  });
  document.addEventListener('focusout', hide);
  document.addEventListener('scroll', hide, true);
}

/** The "?" guide: rules and glossary. */
export class Guide {
  private readonly guide: HTMLDialogElement;

  /** `onTour` replays the first-run tour of the interface. */
  constructor(onTour: () => void) {
    this.guide = document.createElement('dialog');
    this.guide.className = 'dialog guide';
    this.guide.setAttribute('aria-labelledby', 'guide-title');
    this.guide.innerHTML = `
      <form method="dialog">
        <button value="close" class="panel-close" aria-label="Close guide">×</button>
        <span class="dialog-kanji" aria-hidden="true">案内</span>
        <h2 id="guide-title">How it works</h2>
        <ul class="guide-rules">
          <li><b>Wrestlers = apps.</b> The more memory they use, the bigger they get; the ranking orders them by weight. System processes are a single fighter: the referee.</li>
          <li><b>Predictions.</b> Before each bout, tap the wrestler you think will win and stake your chanko. Three right in a row earn a bonus.</li>
          <li><b>Missions.</b> Free up memory to complete them and earn chanko.</li>
          <li><b>Out of the ring.</b> Drag an app past the edge to quit it, always after a confirmation. The padlock marks protected apps.</li>
        </ul>
        <h3>Shortcuts</h3>
        <dl class="shortcuts">
          ${SHORTCUTS.map(([key, action]) => `<div><dt><kbd>${key}</kbd></dt><dd>${action}</dd></div>`).join('')}
        </dl>
        <h3>Glossary</h3>
        <dl class="glossary">
          ${Object.values(GLOSSARY).map((entry) => `
            <div>
              <dt>${entry.kanji ? `<span>${entry.kanji}</span>` : ''}${escapeHtml(entry.term)}</dt>
              <dd>${escapeHtml(entry.meaning)}${entry.inGame ? ` <em>${escapeHtml(entry.inGame)}</em>` : ''}</dd>
            </div>`).join('')}
        </dl>
        <div class="dialog-actions">
          <button type="button" class="secondary" id="guide-tour">Replay the tour</button>
          <button value="close" class="primary">Got it</button>
        </div>
      </form>`;
    document.body.append(this.guide);
    this.guide.querySelector('#guide-tour')!.addEventListener('click', () => {
      this.guide.close();
      onTour();
    });
  }

  openGuide(): void {
    if (!this.guide.open) this.guide.showModal();
  }
}
