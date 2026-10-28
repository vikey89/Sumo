import { adoptLegacy, isRecord, readVersioned, writeVersioned } from './storage';
import type { AppInfo, AppSnapshot } from './types';
import { formatBytes } from './types';

const KEY = 'sumo:missions';
const VERSION = 1;
const ACTIVE = 3;
const REFILL_MS = 20_000;
const MINUTE = 60_000;
const MB = 1024 ** 2;
/** Longer gaps between snapshots (sleep, a closed tab) don't count towards "hold" missions. */
const MAX_TICK_MS = 5000;

export type MissionKind = 'free-ram' | 'diet' | 'cool' | 'push-out' | 'streak';

export interface Mission {
  id: string;
  kind: MissionKind;
  title: string;
  detail: string;
  reward: number;
  deadline: number;
  /** Starting value the progress is measured from (memory, or held time). */
  baseline: number;
  target: number;
  appId?: string;
  progress: number;
  /** Running average of the raw reading, so momentary swings don't jerk the bar around. */
  smoothed?: number;
  done: boolean;
}

export interface MissionEvent {
  kind: 'completed' | 'expired';
  mission: Mission;
}

interface Stored {
  missions: Mission[];
  nextRefill: number;
}

const ORDER: MissionKind[] = ['free-ram', 'diet', 'cool', 'push-out', 'streak'];

function roundTo(value: number, step: number): number {
  return Math.max(step, Math.round(value / step) * step);
}

/** Stored missions, keeping only the ones that still look like missions. */
function load(): Partial<Stored> {
  const stored = readVersioned(KEY, VERSION, adoptLegacy);
  if (!isRecord(stored)) return {};
  const missions = Array.isArray(stored.missions) ? stored.missions as unknown[] : [];
  return {
    missions: missions.filter((mission): mission is Mission => isRecord(mission) && ORDER.includes(mission.kind as MissionKind)
      && Number.isFinite(mission.deadline) && Number.isFinite(mission.target) && Number.isFinite(mission.progress)),
    nextRefill: Number.isFinite(stored.nextRefill) ? stored.nextRefill as number : undefined,
  };
}

/** Small goals that pay chanko for keeping the Mac light. */
export class MissionBoard {
  private missions: Mission[];
  private nextRefill: number;
  private lastTick?: number;

  constructor(private readonly nameOf: (app: AppInfo) => string) {
    const stored = load();
    const now = Date.now();
    this.missions = (stored.missions ?? []).filter((mission) => !mission.done && mission.deadline > now);
    this.nextRefill = stored.nextRefill ?? 0;
  }

  get active(): readonly Mission[] {
    return this.missions;
  }

  /** Advance every mission with a new snapshot; returns what was completed or ran out. */
  observe(snapshot: AppSnapshot, now = Date.now()): MissionEvent[] {
    const elapsed = this.lastTick === undefined ? 0 : Math.min(now - this.lastTick, MAX_TICK_MS);
    this.lastTick = now;
    const events: MissionEvent[] = [];

    for (const mission of this.missions) {
      if (mission.done) continue;
      switch (mission.kind) {
        case 'free-ram':
          this.advance(mission, (mission.baseline - snapshot.used_memory) / mission.target);
          break;
        case 'diet': {
          const app = snapshot.processes.find((process) => process.id === mission.appId);
          if (app) this.advance(mission, (mission.baseline - app.memory) / mission.target);
          else mission.progress = 1;
          break;
        }
        case 'cool': {
          const below = snapshot.used_memory / snapshot.total_memory * 100 < mission.target;
          mission.baseline = below ? mission.baseline + elapsed : 0;
          mission.progress = mission.baseline / (5 * MINUTE);
          break;
        }
        case 'push-out':
        case 'streak':
          break;
      }
      mission.progress = Math.min(1, Math.max(0, mission.progress));
      if (mission.progress >= 1) events.push(this.complete(mission, now));
      else if (now > mission.deadline) events.push({ kind: 'expired', mission });
    }

    const expired = new Set(events.filter((event) => event.kind === 'expired').map((event) => event.mission.id));
    if (expired.size > 0) {
      this.missions = this.missions.filter((mission) => !expired.has(mission.id));
      this.nextRefill = Math.min(this.nextRefill || now, now);
    }
    if (now >= this.nextRefill) this.refill(snapshot, now);
    this.save();
    return events;
  }

  /** Progress only ever grows, following a smoothed reading. */
  private advance(mission: Mission, reading: number): void {
    mission.smoothed = mission.smoothed === undefined ? reading : mission.smoothed * 0.7 + reading * 0.3;
    mission.progress = Math.max(mission.progress, mission.smoothed);
  }

  /** An app was really closed from the arena. */
  pushedOut(app: AppInfo): MissionEvent[] {
    return this.bump('push-out', (mission) => app.memory >= mission.baseline ? 1 : mission.progress);
  }

  /** A prediction was settled. */
  predicted(won: boolean): MissionEvent[] {
    return this.bump('streak', (mission) => won ? mission.progress + 1 / mission.target : 0);
  }

  private bump(kind: MissionKind, next: (mission: Mission) => number): MissionEvent[] {
    const events: MissionEvent[] = [];
    for (const mission of this.missions) {
      if (mission.kind !== kind || mission.done) continue;
      mission.progress = Math.min(1, Math.max(0, next(mission)));
      if (mission.progress >= 0.999) events.push(this.complete(mission, Date.now()));
    }
    this.save();
    return events;
  }

  private complete(mission: Mission, now: number): MissionEvent {
    mission.done = true;
    mission.progress = 1;
    this.nextRefill = now + REFILL_MS;
    // Keep it on the board briefly so the player sees it ticked off.
    window.setTimeout(() => {
      this.missions = this.missions.filter((candidate) => candidate !== mission);
      this.save();
    }, REFILL_MS - 2000);
    return { kind: 'completed', mission };
  }

  private refill(snapshot: AppSnapshot, now: number): void {
    const taken = new Set(this.missions.map((mission) => mission.kind));
    const candidates = ORDER.filter((kind) => !taken.has(kind)).sort(() => Math.random() - 0.5);
    for (const kind of candidates) {
      if (this.missions.filter((mission) => !mission.done).length >= ACTIVE) break;
      const mission = this.create(kind, snapshot, now);
      if (mission) this.missions.push(mission);
    }
  }

  private create(kind: MissionKind, snapshot: AppSnapshot, now: number): Mission | undefined {
    const id = `${kind}-${now}-${Math.floor(Math.random() * 1e6)}`;
    const base = { id, kind, progress: 0, done: false };
    switch (kind) {
      case 'free-ram': {
        const target = roundTo(snapshot.total_memory * 0.04, 256 * MB);
        return {
          ...base,
          title: 'Let the Mac breathe',
          detail: `Free up ${formatBytes(target)} of RAM in 10 minutes`,
          reward: 40,
          deadline: now + 10 * MINUTE,
          baseline: snapshot.used_memory,
          target,
        };
      }
      case 'diet': {
        const candidates = snapshot.processes.slice(0, 6).filter((app) => !app.locked && app.memory >= 600 * MB);
        const app = candidates[Math.floor(Math.random() * candidates.length)];
        if (!app) return undefined;
        const target = roundTo(app.memory * 0.25, 64 * MB);
        return {
          ...base,
          title: `Put ${this.nameOf(app)} on a diet`,
          detail: `Make it lose ${formatBytes(target)} (or quit it) in 15 minutes`,
          reward: 50,
          deadline: now + 15 * MINUTE,
          baseline: app.memory,
          target,
          appId: app.id,
        };
      }
      case 'cool': {
        const pressure = Math.floor(snapshot.used_memory / snapshot.total_memory * 100);
        const target = Math.max(30, pressure - 3);
        return {
          ...base,
          title: 'Relaxed Mac',
          detail: `Keep RAM below ${target}% for 5 minutes straight`,
          reward: 60,
          deadline: now + 25 * MINUTE,
          baseline: 0,
          target,
        };
      }
      case 'push-out':
        return {
          ...base,
          title: 'Make room in the ring',
          detail: `Push out an app using more than ${formatBytes(300 * MB)}`,
          reward: 30,
          deadline: now + 20 * MINUTE,
          baseline: 300 * MB,
          target: 1,
        };
      case 'streak':
        return {
          ...base,
          title: 'Expert eye',
          detail: 'Get 2 predictions right in a row',
          reward: 40,
          deadline: now + 30 * MINUTE,
          baseline: 0,
          target: 2,
        };
    }
  }

  private save(): void {
    writeVersioned(KEY, VERSION, { missions: this.missions, nextRefill: this.nextRefill } satisfies Stored);
  }
}

export function timeLeft(mission: Mission, now = Date.now()): string {
  const minutes = Math.ceil((mission.deadline - now) / MINUTE);
  return minutes <= 1 ? 'under 1 min' : `${minutes} min`;
}
