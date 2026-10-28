import type { AppInfo } from './types';
import { formatBytes } from './types';

export type CommentaryKind = 'enter' | 'leave' | 'meal' | 'diet' | 'champion' | 'bout' | 'win' | 'out' | 'resist' | 'mission' | 'basho';

export interface CommentaryEvent {
  kind: CommentaryKind;
  id: string;
  text: string;
}

const BIG_CHANGE = 150 * 1024 ** 2;
const COOLDOWN_MS = 12_000;

/** `detail` is an amount of memory, or the opponent and winning technique in a bout. */
const LINES: Record<CommentaryKind, ((name: string, detail: string) => string)[]> = {
  enter: [
    (name) => `${name} steps into the ring`,
    (name) => `${name} throws the salt and enters the arena`,
    (name) => `A new challenger: ${name}`,
  ],
  leave: [
    (name) => `${name} leaves the ring`,
    (name) => `${name} walks out of the arena`,
    (name) => `${name} steps out of the circle`,
  ],
  meal: [
    (name, amount) => `${name} devours ${amount} of memory`,
    (name, amount) => `${name} is hungry: +${amount}`,
    (name, amount) => `Snack time for ${name}: +${amount}`,
  ],
  diet: [
    (name, amount) => `${name} does the ritual stomp and sheds ${amount}`,
    (name, amount) => `${name} goes on a diet: −${amount}`,
    (name, amount) => `${name} burns off ${amount}`,
  ],
  champion: [
    (name) => `${name} is the new Grand champion!`,
    (name) => `Change at the top: ${name} takes the title`,
  ],
  bout: [
    (name, rival) => `Bout! ${name} versus ${rival}: who wins?`,
    (name, rival) => `${name} challenges ${rival}: make your prediction`,
    (name, rival) => `Centre ring: ${name} versus ${rival}`,
  ],
  win: [
    (name, how) => `${name} wins by ${how}!`,
    (name, how) => `Victory for ${name}: ${how}`,
  ],
  out: [
    (name) => `Out of the ring! ${name} leaves the Mac`,
    (name) => `${name} was pushed out and quit`,
  ],
  resist: [
    (name) => `${name} holds on and comes back`,
    (name) => `${name} won't budge: no luck`,
  ],
  basho: [
    (text) => text,
  ],
  mission: [
    (name, reward) => `Mission complete: ${name} (+${reward} chanko)`,
  ],
};

export function narrate(kind: CommentaryKind, name: string, detail = ''): string {
  const options = LINES[kind];
  return options[Math.floor(Math.random() * options.length)](name, detail);
}

/** Turns consecutive arena line-ups into play-by-play commentary. */
export class Commentator {
  private previous?: Map<string, AppInfo>;
  private championId?: string;
  private readonly quietUntil = new Map<string, number>();

  constructor(private readonly nameOf: (app: AppInfo) => string = (app) => app.name) {}

  /** Skip the automatic line for an app the user just narrated themselves, e.g. pushed out. */
  hush(id: string): void {
    this.quietUntil.set(id, performance.now() + COOLDOWN_MS);
  }

  /** Forget the line-up so a change of arena size is not narrated as mass arrivals. */
  reset(): void {
    this.previous = undefined;
  }

  observe(lineup: AppInfo[]): CommentaryEvent[] {
    const current = new Map(lineup.map((app) => [app.id, app]));
    const previous = this.previous;
    this.previous = current;
    const champion = lineup[0];
    const previousChampion = this.championId;
    this.championId = champion?.id;
    if (!previous) return [];

    const now = performance.now();
    const events: CommentaryEvent[] = [];
    const push = (kind: CommentaryKind, app: AppInfo, amount?: number) => {
      if ((this.quietUntil.get(app.id) ?? 0) > now) return;
      this.quietUntil.set(app.id, now + COOLDOWN_MS);
      events.push({ kind, id: app.id, text: narrate(kind, this.nameOf(app), amount === undefined ? '' : formatBytes(amount)) });
    };

    if (champion && previousChampion && champion.id !== previousChampion) push('champion', champion);
    for (const app of lineup) {
      const before = previous.get(app.id);
      if (!before) {
        push('enter', app);
        continue;
      }
      const change = app.memory - before.memory;
      if (change >= BIG_CHANGE) push('meal', app, change);
      else if (change <= -BIG_CHANGE) push('diet', app, -change);
    }
    for (const [id, app] of previous) {
      if (!current.has(id)) push('leave', app);
    }
    return events;
  }
}
