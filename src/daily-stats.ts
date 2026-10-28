import { adoptLegacy, isCount, isRecord, readVersioned, writeVersioned } from './storage';
import type { AppInfo } from './types';
import { formatBytes } from './types';

const VERSION = 1;
const SAVE_EVERY_MS = 10_000;
/** Longer gaps (sleep, a closed tab) are not counted as time at the top. */
const MAX_TICK_SECONDS = 5;

export interface AppDay {
  name: string;
  eaten: number;
  dieted: number;
  peak: number;
  wins: number;
  losses: number;
  topSeconds: number;
}

export interface DayStats {
  date: string;
  apps: Record<string, AppDay>;
  bouts: number;
  pushedOut: number;
  missions?: number;
  predictionsWon?: number;
  predictions?: number;
}

export type TrophyKind = 'heavyweight' | 'glutton' | 'dieter' | 'champion' | 'yokozuna';

export interface Trophy {
  kind: TrophyKind;
  id: string;
  name: string;
  title: string;
  detail: string;
}

function today(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function empty(date: string): DayStats {
  return { date, apps: {}, bouts: 0, pushedOut: 0 };
}

function load(date: string): DayStats {
  const stored = readVersioned(`sumo:day:${date}`, VERSION, adoptLegacy);
  const valid = isRecord(stored) && stored.date === date && isRecord(stored.apps) && isCount(stored.bouts) && isCount(stored.pushedOut);
  return valid ? stored as unknown as DayStats : empty(date);
}

/** What happened in the arena today: meals, diets, bouts and time at the top. Persisted per day. */
export class DailyStats {
  private stats = load(today());
  private previous?: Map<string, number>;
  private lastTick?: number;
  private savedAt = 0;

  get day(): DayStats {
    return this.stats;
  }

  app(id: string): AppDay | undefined {
    return this.stats.apps[id];
  }

  observe(apps: AppInfo[], now = Date.now()): void {
    this.rollover();
    const elapsed = this.lastTick === undefined ? 0 : (now - this.lastTick) / 1000;
    this.lastTick = now;
    const previous = this.previous;
    this.previous = new Map(apps.map((app) => [app.id, app.memory]));

    apps.forEach((app, index) => {
      const day = this.entry(app.id, app.name);
      day.peak = Math.max(day.peak, app.memory);
      const before = previous?.get(app.id);
      if (before !== undefined) {
        const change = app.memory - before;
        if (change > 0) day.eaten += change;
        else day.dieted -= change;
      }
      if (index === 0 && elapsed <= MAX_TICK_SECONDS) day.topSeconds += elapsed;
    });
    if (now - this.savedAt > SAVE_EVERY_MS) this.save(now);
  }

  recordBout(winner: AppInfo, loser: AppInfo): void {
    this.rollover();
    this.stats.bouts += 1;
    this.entry(winner.id, winner.name).wins += 1;
    this.entry(loser.id, loser.name).losses += 1;
    this.save();
  }

  recordMission(): void {
    this.rollover();
    this.stats.missions = (this.stats.missions ?? 0) + 1;
    this.save();
  }

  recordPrediction(won: boolean): void {
    this.rollover();
    this.stats.predictions = (this.stats.predictions ?? 0) + 1;
    if (won) this.stats.predictionsWon = (this.stats.predictionsWon ?? 0) + 1;
    this.save();
  }

  recordPushOut(): void {
    this.rollover();
    this.stats.pushedOut += 1;
    this.save();
  }

  trophies(): Trophy[] {
    const entries = Object.entries(this.stats.apps);
    const best = (score: (day: AppDay) => number) => entries.reduce<[string, AppDay] | undefined>(
      (leader, entry) => score(entry[1]) > (leader ? score(leader[1]) : 0) ? entry : leader,
      undefined,
    );
    const trophy = (kind: TrophyKind, title: string, score: (day: AppDay) => number, detail: (day: AppDay) => string): Trophy[] => {
      const leader = best(score);
      return leader ? [{ kind, id: leader[0], name: leader[1].name, title, detail: detail(leader[1]) }] : [];
    };
    return [
      ...trophy('heavyweight', 'Heavyweight', (day) => day.peak, (day) => `peaked at ${formatBytes(day.peak)}`),
      ...trophy('glutton', 'Biggest eater', (day) => day.eaten, (day) => `${formatBytes(day.eaten)} devoured`),
      ...trophy('dieter', 'Best dieter', (day) => day.dieted, (day) => `${formatBytes(day.dieted)} burned off`),
      ...trophy('champion', 'Bout champion', (day) => day.wins, (day) => `${day.wins} ${day.wins === 1 ? 'win' : 'wins'}`),
      ...trophy('yokozuna', 'Longest-reigning champion', (day) => day.topSeconds, (day) => `${Math.max(1, Math.round(day.topSeconds / 60))} min on top`),
    ];
  }

  totalEaten(): number {
    return Object.values(this.stats.apps).reduce((sum, day) => sum + day.eaten, 0);
  }

  private entry(id: string, name: string): AppDay {
    const day = this.stats.apps[id] ??= { name, eaten: 0, dieted: 0, peak: 0, wins: 0, losses: 0, topSeconds: 0 };
    day.name = name;
    return day;
  }

  private rollover(): void {
    const date = today();
    if (date === this.stats.date) return;
    this.save();
    this.stats = empty(date);
  }

  private save(now = Date.now()): void {
    this.savedAt = now;
    writeVersioned(`sumo:day:${this.stats.date}`, VERSION, this.stats);
  }
}
