import { adoptLegacy, isRecord, readVersioned, writeVersioned } from './storage';
import type { AppInfo } from './types';

const KEY = 'sumo:basho';
const VERSION = 1;
export const BASHO_DAYS = 15;
/** Eight wins out of fifteen: a winning record. */
export const KACHI_KOSHI = 8;
const DAY_MS = 86_400_000;
const CHAMPIONS_KEPT = 12;

/** Each app's official bout of the day: true won, false lost, null not fought. */
export interface BoutRecord {
  name: string;
  days: (boolean | null)[];
}

export interface Champion {
  basho: string;
  id: string;
  name: string;
  wins: number;
  losses: number;
}

interface State {
  /** Local date (YYYY-MM-DD) of day 1. */
  start: string;
  name?: string;
  records: { [id: string]: BoutRecord };
  champions: Champion[];
}

export interface Standing {
  id: string;
  name: string;
  wins: number;
  losses: number;
  days: (boolean | null)[];
}

export type BashoEvent =
  | { kind: 'kachi-koshi' | 'make-koshi'; id: string; name: string }
  | { kind: 'yusho'; champion: Champion }
  | { kind: 'opening'; basho: string };

function localDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function parseDate(text: string): Date {
  const [year, month, day] = text.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * The six real tournaments fall in odd months; a basho is named after the one its start is
 * closest to. A second one in the same window becomes "… II", as editions do.
 */
export function bashoName(start: string, previous?: string): string {
  const date = parseDate(start);
  const names = ['Hatsu', 'Haru', 'Natsu', 'Nagoya', 'Aki', 'Kyūshū'];
  const base = `${names[Math.floor(date.getMonth() / 2)]} Basho ${date.getFullYear()}`;
  if (!previous?.startsWith(base)) return base;
  const numerals = ['II', 'III', 'IV', 'V'];
  const current = numerals.indexOf(previous.slice(base.length).trim());
  return `${base} ${numerals[Math.min(current + 1, numerals.length - 1)]}`;
}

function tally(days: (boolean | null)[]): { wins: number; losses: number } {
  return {
    wins: days.filter((day) => day === true).length,
    losses: days.filter((day) => day === false).length,
  };
}

/** The stored tournament, or undefined when its shape is not one this version can run. */
function load(): State | undefined {
  const stored = readVersioned(KEY, VERSION, adoptLegacy);
  if (!isRecord(stored) || typeof stored.start !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(stored.start)) return undefined;
  if (!isRecord(stored.records) || !Array.isArray(stored.champions)) return undefined;
  const records = Object.values(stored.records).every((record) => isRecord(record) && typeof record.name === 'string' && Array.isArray(record.days));
  return records ? stored as unknown as State : undefined;
}

/**
 * A fifteen-day tournament across sessions. Every app's first bout of each day is its
 * official one; the rest are exhibition. The most wins at the end takes the yūshō.
 */
export class Basho {
  private state: State;

  constructor(private readonly now: () => Date = () => new Date()) {
    this.state = load() ?? this.fresh();
  }

  get name(): string {
    return this.state.name ?? bashoName(this.state.start);
  }

  /** 1 to 15. */
  get day(): number {
    const elapsed = Math.round((parseDate(localDate(this.now())).getTime() - parseDate(this.state.start).getTime()) / DAY_MS);
    return Math.min(BASHO_DAYS, Math.max(1, elapsed + 1));
  }

  get champions(): readonly Champion[] {
    return this.state.champions;
  }

  /** Close the tournament once its fifteen days are over and open the next one. */
  rollover(): BashoEvent[] {
    const elapsed = Math.round((parseDate(localDate(this.now())).getTime() - parseDate(this.state.start).getTime()) / DAY_MS);
    if (elapsed < BASHO_DAYS) return [];
    const events: BashoEvent[] = [];
    const [leader] = this.standings();
    if (leader && leader.wins > 0) {
      const champion: Champion = { basho: this.name, id: leader.id, name: leader.name, wins: leader.wins, losses: leader.losses };
      events.push({ kind: 'yusho', champion });
      this.state.champions = [champion, ...this.state.champions].slice(0, CHAMPIONS_KEPT);
    }
    this.state = { ...this.fresh(this.name), champions: this.state.champions };
    events.push({ kind: 'opening', basho: this.name });
    this.save();
    return events;
  }

  /** A bout ended; it counts for each fighter that has not had its official bout today. */
  recordBout(winner: AppInfo, loser: AppInfo, nameOf: (app: AppInfo) => string): BashoEvent[] {
    const events = this.rollover();
    const index = this.day - 1;
    for (const [app, won] of [[winner, true], [loser, false]] as const) {
      const record = this.state.records[app.id] ??= { name: nameOf(app), days: Array<boolean | null>(BASHO_DAYS).fill(null) };
      record.name = nameOf(app);
      if (record.days[index] !== null) continue;
      record.days[index] = won;
      const { wins, losses } = tally(record.days);
      if (won && wins === KACHI_KOSHI) events.push({ kind: 'kachi-koshi', id: app.id, name: record.name });
      if (!won && losses === KACHI_KOSHI) events.push({ kind: 'make-koshi', id: app.id, name: record.name });
    }
    this.save();
    return events;
  }

  /** Most wins first, then fewer losses. */
  standings(): Standing[] {
    return Object.entries(this.state.records)
      .map(([id, record]) => ({ id, name: record.name, days: record.days, ...tally(record.days) }))
      .filter((standing) => standing.wins + standing.losses > 0)
      .sort((a, b) => b.wins - a.wins || a.losses - b.losses || a.name.localeCompare(b.name));
  }

  record(id: string): Standing | undefined {
    const record = this.state.records[id];
    return record ? { id, name: record.name, days: record.days, ...tally(record.days) } : undefined;
  }

  private fresh(previous?: string): State {
    const start = localDate(this.now());
    return { start, name: bashoName(start, previous), records: {}, champions: [] };
  }

  private save(): void {
    writeVersioned(KEY, VERSION, this.state);
  }
}
