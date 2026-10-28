import type { ArenaAudio } from '../audio';
import type { CommentaryEvent } from '../commentary';
import { clickedId } from './dom';

const FEED_SIZE = 4;
const FEED_LIFETIME_MS = 9000;

/** The commentary lines under the ring: newest first, the selected app's lines stand out. */
export class Feed {
  private selectedId?: string;

  constructor(private readonly list: HTMLElement, private readonly audio: ArenaAudio, onPick: (id: string) => void) {
    list.addEventListener('click', (event) => {
      const id = clickedId(event);
      if (id) onPick(id);
    });
  }

  announce(events: CommentaryEvent[]): void {
    for (const event of events) {
      if (event.kind === 'champion') this.audio.gong();
      if (event.kind === 'diet') this.audio.thud(0.6);
      const item = document.createElement('li');
      item.dataset.kind = event.kind;
      item.dataset.id = event.id;
      item.classList.toggle('is-mine', event.id === this.selectedId);
      item.textContent = event.text;
      this.list.prepend(item);
      window.setTimeout(() => {
        item.classList.add('is-leaving');
        item.addEventListener('animationend', () => item.remove(), { once: true });
      }, FEED_LIFETIME_MS);
    }
    while (this.list.children.length > FEED_SIZE) this.list.lastElementChild!.remove();
  }

  highlight(selectedId: string | undefined): void {
    this.selectedId = selectedId;
    this.list.querySelectorAll<HTMLElement>('li').forEach((item) => {
      item.classList.toggle('is-mine', selectedId !== undefined && item.dataset.id === selectedId);
    });
  }
}
