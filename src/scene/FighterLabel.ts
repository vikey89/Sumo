// The HTML name tag floating over a fighter: rank, name, memory, odds, placed in screen space.
import { Matrix, Scalar, Vector3, Viewport } from './babylon';
import type { Rank } from '../ranks';

/** Ranks below this show a compact label until hovered or selected. */
const FULL_LABELS = 6;

export class FighterLabel {
  readonly element: HTMLButtonElement;
  private readonly point = new Vector3();
  private readonly projected = new Vector3();
  private visible?: boolean;
  private depth?: string;
  private dimmed?: boolean;
  private fighting = false;
  private lift = 0;
  private size?: { width: number; height: number };
  private compact = false;
  private hovered = false;
  /** The pointer is on the label itself, not the body: it should spell the name out too. */
  private pointerOn = false;
  private selected = false;
  private odds?: string;

  constructor(layer: HTMLElement, onClick: () => void) {
    this.element = document.createElement('button');
    this.element.className = 'fighter-label';
    this.element.type = 'button';
    this.element.innerHTML = '<span class="label-rank" hidden></span><span class="label-name"></span><span class="label-memory"></span>'
      + '<svg class="label-lock" viewBox="0 0 24 24" aria-hidden="true" hidden><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
    this.element.addEventListener('click', onClick);
    this.element.addEventListener('pointerenter', () => { this.pointerOn = true; });
    this.element.addEventListener('pointerleave', () => { this.pointerOn = false; });
    layer.append(this.element);
  }

  setRank(rank: Rank): void {
    const badge = this.element.querySelector<HTMLElement>('.label-rank')!;
    badge.hidden = rank.tier === 'maegashira';
    badge.textContent = rank.kanji;
    badge.dataset.term = rank.tier;
    this.element.dataset.tier = rank.tier;
    this.size = undefined;
  }

  setText(name: string, memory: string, locked: boolean): void {
    this.element.querySelector<SVGElement>('.label-lock')!.toggleAttribute('hidden', !locked);
    this.element.classList.toggle('is-locked', locked);
    this.element.title = locked ? 'Protected: it cannot be pushed out' : '';
    const nameElement = this.element.querySelector('.label-name')!;
    const memoryElement = this.element.querySelector('.label-memory')!;
    if (nameElement.textContent === name && memoryElement.textContent === memory) return;
    nameElement.textContent = name;
    memoryElement.textContent = memory;
    this.element.setAttribute('aria-label', `Seleziona ${name}`);
    this.size = undefined;
  }

  setSelected(selected: boolean): void {
    this.selected = selected;
    this.element.classList.toggle('is-selected', selected);
  }

  setHovered(hovered: boolean): void {
    this.hovered = hovered;
    this.element.classList.toggle('is-hovered', hovered);
  }

  setOdds(text?: string): void {
    if (text === this.odds) return;
    this.odds = text;
    let odds = this.element.querySelector<HTMLElement>('.label-odds');
    if (text && !odds) {
      odds = document.createElement('span');
      odds.className = 'label-odds';
      this.element.append(odds);
    }
    if (odds) {
      odds.hidden = !text;
      odds.textContent = text ?? '';
    }
    this.element.classList.toggle('has-odds', Boolean(text));
    this.size = undefined;
  }

  /** Project the anchor `height` above `base`; returns false when it is behind the camera. */
  project(base: Vector3, height: number, viewport: Viewport, transform: Matrix): boolean {
    this.point.copyFrom(base);
    this.point.y += height;
    Vector3.ProjectToRef(this.point, Matrix.IdentityReadOnly, transform, viewport, this.projected);
    const visible = this.projected.z > 0 && this.projected.z < 1;
    if (visible !== this.visible) {
      this.visible = visible;
      this.element.style.visibility = visible ? 'visible' : 'hidden';
    }
    return visible;
  }

  get screen(): Vector3 {
    return this.projected;
  }

  get box(): { width: number; height: number } {
    this.size ??= { width: this.element.offsetWidth, height: this.element.offsetHeight };
    return this.size;
  }

  markFighting(fighting: boolean, rank: number, referee?: boolean): void {
    if (fighting !== this.fighting) {
      this.fighting = fighting;
      this.element.classList.toggle('is-fighting', fighting);
    }
    // Lower ranks keep a small weight pill so the important names stay readable.
    const compact = rank >= FULL_LABELS && !referee && !fighting && !this.hovered && !this.pointerOn && !this.selected;
    if (compact !== this.compact) {
      this.compact = compact;
      this.element.classList.toggle('is-compact', compact);
      this.size = undefined;
    }
  }

  /** Place the label `lift` pixels above its anchor; dimmed labels yield to their neighbours. */
  place(lift: number, dimmed: boolean, deltaSeconds: number): void {
    this.lift = Scalar.Lerp(this.lift, lift, 1 - Math.exp(-deltaSeconds * 12));
    const { x, y, z } = this.projected;
    this.element.style.transform = `translate(-50%, -100%) translate(${x.toFixed(1)}px, ${(y - this.lift).toFixed(1)}px)`;
    this.element.style.setProperty('--lift', `${this.lift.toFixed(1)}px`);
    const depth = `${Math.round((1 - z) * 100)}`;
    if (depth !== this.depth) {
      this.depth = depth;
      this.element.style.zIndex = depth;
    }
    if (dimmed !== this.dimmed) {
      this.dimmed = dimmed;
      this.element.classList.toggle('is-dimmed', dimmed);
    }
  }
}
