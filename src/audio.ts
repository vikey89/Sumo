import { readJson, writeJson } from './storage';

const KEY = 'sumo:sound';

/** A plain boolean flag: anything else (corrupt, or a shape from another version) counts as never chosen. */
function stored(): boolean | undefined {
  const value = readJson<unknown>(KEY);
  return typeof value === 'boolean' ? value : undefined;
}

/** Synthesised arena sounds: no assets, and silent until the user turns them on. */
export class ArenaAudio {
  private context?: AudioContext;
  private master?: GainNode;
  private noise?: AudioBuffer;
  private enabledValue = stored() ?? false;

  get enabled(): boolean {
    return this.enabledValue;
  }

  /** Whether the user ever chose sound on or off. */
  get decided(): boolean {
    return stored() !== undefined;
  }

  /** Call from a user gesture: browsers only start audio after one. */
  setEnabled(enabled: boolean): void {
    this.enabledValue = enabled;
    writeJson(KEY, enabled);
    if (enabled) void this.ready()?.resume();
  }

  gong(): void {
    const context = this.ready();
    if (!context) return;
    const now = context.currentTime;
    for (const [ratio, level] of [[1, 0.5], [2.76, 0.18], [5.4, 0.08], [1.5, 0.12]]) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.setValueAtTime(96 * ratio, now);
      oscillator.frequency.exponentialRampToValueAtTime(93 * ratio, now + 3);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(level, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 3.4);
      oscillator.connect(gain).connect(this.master!);
      oscillator.start(now);
      oscillator.stop(now + 3.5);
    }
  }

  thud(strength = 1): void {
    const context = this.ready();
    if (!context) return;
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(120, now);
    oscillator.frequency.exponentialRampToValueAtTime(42, now + 0.18);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.7 * strength, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
    oscillator.connect(gain).connect(this.master!);
    oscillator.start(now);
    oscillator.stop(now + 0.32);
    this.burst(now, 0.06, 900, 0.25 * strength);
  }

  claps(count = 14): void {
    const context = this.ready();
    if (!context) return;
    const now = context.currentTime;
    for (let i = 0; i < count; i++) {
      this.burst(now + Math.random() * 1.6, 0.045, 1400 + Math.random() * 1200, 0.12 + Math.random() * 0.12);
    }
  }

  roar(seconds = 2.4): void {
    const context = this.ready();
    if (!context) return;
    const now = context.currentTime;
    const source = context.createBufferSource();
    source.buffer = this.noise!;
    source.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(500, now);
    filter.frequency.linearRampToValueAtTime(900, now + seconds * 0.4);
    filter.Q.value = 0.7;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.32, now + seconds * 0.3);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + seconds);
    source.connect(filter).connect(gain).connect(this.master!);
    source.start(now);
    source.stop(now + seconds);
    this.claps();
  }

  private burst(at: number, seconds: number, frequency: number, level: number): void {
    const context = this.context!;
    const source = context.createBufferSource();
    source.buffer = this.noise!;
    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = frequency;
    const gain = context.createGain();
    gain.gain.setValueAtTime(level, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
    source.connect(filter).connect(gain).connect(this.master!);
    source.start(at, Math.random());
    source.stop(at + seconds);
  }

  private ready(): AudioContext | undefined {
    if (!this.enabledValue) return undefined;
    if (!this.context) {
      try {
        this.context = new AudioContext();
      } catch {
        return undefined;
      }
      this.master = this.context.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.context.destination);
      const length = this.context.sampleRate * 2;
      this.noise = this.context.createBuffer(1, length, this.context.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    }
    return this.context;
  }
}
