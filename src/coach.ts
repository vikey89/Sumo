import { readJson, writeJson } from './storage';

const ONBOARDED_KEY = 'sumo:onboarded';
const GAP = 12;

export interface CoachStep {
  /** Element to spotlight; when missing or hidden, the bubble sits in the middle. */
  target?: string;
  title: string;
  body: string;
}

/**
 * A guided tour that points at the real interface instead of describing it in a dialog,
 * plus one-off hints (`point`) for moments like the first prediction.
 */
export class Coach {
  private readonly root: HTMLElement;
  private readonly spot: HTMLElement;
  private readonly bubble: HTMLElement;
  private steps: CoachStep[] = [];
  private index = 0;
  private onDone?: () => void;
  /** A one-off hint is showing: no buttons, it leaves when the moment passes. */
  private hinting = false;

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'coach';
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="coach-spot"></div>
      <section class="coach-bubble card" role="dialog" aria-modal="false" aria-labelledby="coach-title">
        <span class="coach-step" id="coach-step"></span>
        <h2 id="coach-title"></h2>
        <p id="coach-body"></p>
        <div class="coach-actions">
          <button type="button" class="coach-skip" id="coach-skip">Skip</button>
          <button type="button" class="coach-next" id="coach-next"></button>
        </div>
      </section>`;
    document.body.append(this.root);
    this.spot = this.root.querySelector('.coach-spot')!;
    this.bubble = this.root.querySelector('.coach-bubble')!;
    this.root.querySelector('#coach-next')!.addEventListener('click', () => this.next());
    this.root.querySelector('#coach-skip')!.addEventListener('click', () => this.finish());
    window.addEventListener('resize', () => this.place());
    window.addEventListener('keydown', (event) => {
      if (this.root.hidden || this.hinting) return;
      if (event.key === 'Escape') this.finish();
      else if (event.key === 'Enter' || event.key === 'ArrowRight') this.next();
      else return;
      event.preventDefault();
      event.stopImmediatePropagation();
    }, true);
  }

  get active(): boolean {
    return !this.root.hidden && !this.hinting;
  }

  get onboarded(): boolean {
    return readJson<boolean>(ONBOARDED_KEY) === true;
  }

  start(steps: CoachStep[], onDone?: () => void): void {
    this.steps = steps;
    this.onDone = onDone;
    this.hinting = false;
    this.root.classList.remove('is-hint');
    this.root.hidden = false;
    this.show(0);
    this.root.querySelector<HTMLElement>('#coach-next')!.focus();
  }

  /** A single hint over one element, dismissed with `dismiss()`. */
  point(target: string, title: string, body: string): void {
    if (this.active) return;
    this.hinting = true;
    this.steps = [{ target, title, body }];
    this.root.classList.add('is-hint');
    this.root.hidden = false;
    this.show(0);
  }

  dismiss(): void {
    if (!this.hinting) return;
    this.hinting = false;
    this.root.hidden = true;
  }

  private show(index: number): void {
    this.index = index;
    const step = this.steps[index];
    const last = index === this.steps.length - 1;
    this.root.querySelector('#coach-step')!.textContent = this.steps.length > 1 ? `${index + 1} of ${this.steps.length}` : '';
    this.root.querySelector('#coach-title')!.textContent = step.title;
    this.root.querySelector('#coach-body')!.textContent = step.body;
    this.root.querySelector('#coach-next')!.textContent = last ? 'Start' : 'Next';
    this.place();
  }

  private next(): void {
    if (this.index < this.steps.length - 1) this.show(this.index + 1);
    else this.finish();
  }

  private finish(): void {
    if (this.root.hidden) return;
    this.root.hidden = true;
    writeJson(ONBOARDED_KEY, true);
    const done = this.onDone;
    this.onDone = undefined;
    done?.();
  }

  /** Spotlight the target and put the bubble beside it, on whichever side has room. */
  private place(): void {
    if (this.root.hidden) return;
    const step = this.steps[this.index];
    const element = step.target ? document.querySelector<HTMLElement>(step.target) : null;
    const box = element?.getBoundingClientRect();
    const rect = box && box.width > 0 && box.height > 0 ? box : undefined;
    this.root.classList.toggle('is-centered', !rect);
    const bubble = this.bubble.getBoundingClientRect();
    if (!rect) {
      this.bubble.style.left = `${(window.innerWidth - bubble.width) / 2}px`;
      this.bubble.style.top = `${(window.innerHeight - bubble.height) / 2}px`;
      return;
    }
    const pad = 6;
    Object.assign(this.spot.style, {
      left: `${rect.left - pad}px`,
      top: `${rect.top - pad}px`,
      width: `${rect.width + pad * 2}px`,
      height: `${rect.height + pad * 2}px`,
    });
    const clampX = (x: number) => Math.min(Math.max(GAP, x), window.innerWidth - bubble.width - GAP);
    const clampY = (y: number) => Math.min(Math.max(GAP, y), window.innerHeight - bubble.height - GAP);
    let left: number;
    let top: number;
    if (window.innerWidth - rect.right > bubble.width + GAP * 2) {
      left = rect.right + GAP + pad;
      top = clampY(rect.top);
    } else if (rect.left > bubble.width + GAP * 2) {
      left = rect.left - bubble.width - GAP - pad;
      top = clampY(rect.top);
    } else if (window.innerHeight - rect.bottom > bubble.height + GAP * 2) {
      left = clampX(rect.left + rect.width / 2 - bubble.width / 2);
      top = rect.bottom + GAP + pad;
    } else {
      left = clampX(rect.left + rect.width / 2 - bubble.width / 2);
      top = clampY(rect.top - bubble.height - GAP - pad);
    }
    this.bubble.style.left = `${left}px`;
    this.bubble.style.top = `${top}px`;
  }
}
