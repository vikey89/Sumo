import type { ArenaAudio } from '../audio';
import { $, ICONS, icon } from './dom';

/** The toolbar toggles that change the view or the sound: sound, full screen and "arena only". */
export class ViewControls {
  constructor(private readonly audio: ArenaAudio, private readonly onZen: () => void) {
    $('#sound-toggle').addEventListener('click', () => this.toggleSound());
    $('#sound-yes').addEventListener('click', () => this.answerSound(true));
    $('#sound-no').addEventListener('click', () => this.answerSound(false));
    $('#fullscreen-toggle').addEventListener('click', () => this.toggleFullscreen());
    document.addEventListener('fullscreenchange', () => this.renderFullscreen());
    $('#zen-toggle').addEventListener('click', () => this.toggleZen());
    $('#zen-note').addEventListener('click', () => this.toggleZen(false));
    this.renderSound();
    this.renderFullscreen();
  }

  get zen(): boolean {
    return document.body.classList.contains('is-zen');
  }

  toggleSound(): void {
    this.audio.setEnabled(!this.audio.enabled);
    this.renderSound();
    if (this.audio.enabled) this.audio.gong();
  }

  /** Sound is off by default; ask once, at the first bout, when it's worth hearing. */
  offerSound(): void {
    if (this.audio.decided || !$('#sound-toast').hidden) return;
    $('#sound-toast').hidden = false;
  }

  toggleFullscreen(): void {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => undefined);
  }

  /** "Arena only": only the ring and its labels, e.g. as a screensaver in full screen. */
  toggleZen(force?: boolean): void {
    const zen = document.body.classList.toggle('is-zen', force);
    $('#zen-toggle').setAttribute('aria-pressed', String(zen));
    const note = $('#zen-note');
    note.hidden = !zen;
    note.classList.remove('is-fading');
    if (zen) {
      this.onZen();
      void note.offsetWidth;
      note.classList.add('is-fading');
    }
  }

  private answerSound(enabled: boolean): void {
    this.audio.setEnabled(enabled);
    this.renderSound();
    if (enabled) this.audio.gong();
    $('#sound-toast').hidden = true;
  }

  private renderSound(): void {
    const button = $('#sound-toggle');
    const { enabled } = this.audio;
    button.innerHTML = icon(enabled ? ICONS.soundOn : ICONS.soundOff);
    button.setAttribute('aria-pressed', String(enabled));
    const label = enabled ? 'Turn off sound' : 'Turn on sound';
    button.dataset.tip = label;
    button.setAttribute('aria-label', label);
  }

  private renderFullscreen(): void {
    const full = Boolean(document.fullscreenElement);
    const button = $('#fullscreen-toggle');
    button.innerHTML = icon(full ? ICONS.collapse : ICONS.expand);
    const label = full ? 'Exit full screen' : 'Full screen';
    button.dataset.tip = label;
    button.setAttribute('aria-label', label);
  }
}
