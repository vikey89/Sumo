import { Scalar, Vector3 } from './babylon';
import type { Fighter } from './Fighter';

/** Just past the straw bales: a foot here and the bout is lost. */
const OUTSIDE = 20.3;
const FIRST_BOUT_AT = 14;
const PAUSE_MIN = 25;
const PAUSE_RANGE = 20;
const APPROACH_TIMEOUT = 9;
const CANDIDATES = 10;
/** Seconds between the announcement and the tachiai, so the player can place a prediction. */
const BET_WINDOW = 7;

export interface Kimarite {
  name: string;
  /** What the technique looks like, in plain Italian. */
  label: string;
  /** Push bouts drive the loser over the edge; slap bouts drop them in the middle. */
  style: 'push' | 'slap';
}

const KIMARITE: Kimarite[] = [
  { name: 'yorikiri', label: 'belt force-out', style: 'push' },
  { name: 'oshidashi', label: 'frontal push-out', style: 'push' },
  { name: 'tsukidashi', label: 'thrust-out', style: 'push' },
  { name: 'hatakikomi', label: 'slap-down', style: 'slap' },
  { name: 'tsukiotoshi', label: 'thrust-down', style: 'slap' },
  { name: 'uwatenage', label: 'overarm throw', style: 'slap' },
];

const DURATION = { shikiri: 1.8, tachiai: 0.35, push: 2.6, slap: 0.9, fall: 1.6, bow: 1.8 };

type Phase = 'approach' | 'shikiri' | 'tachiai' | 'struggle' | 'fall' | 'bow';

export interface BoutEvents {
  /** `eastChance` is the probability that east wins: the odds for predictions. */
  onStart(east: Fighter, west: Fighter, eastChance: number): void;
  /** Both wrestlers are on their marks: time to throw salt. */
  onShikiri(east: Fighter, west: Fighter): void;
  onClash(): void;
  onResult(winner: Fighter, loser: Fighter, kimarite: Kimarite): void;
  onAbort(): void;
}

interface Bout {
  east: Fighter;
  west: Fighter;
  eastWins: boolean;
  kimarite: Kimarite;
  phase: Phase;
  startedAt: number;
  phaseStartedAt: number;
  /** Unit vector pointing from the west fighter to the east fighter. */
  axis: Vector3;
}

function facingAlong(x: number, z: number): number {
  return Math.atan2(x, z);
}

/** Stages an occasional bout between two neighbours in the ranking. */
export class BoutDirector {
  private bout?: Bout;
  private nextAt = FIRST_BOUT_AT;
  private readonly scratch = new Vector3();

  constructor(private readonly events: BoutEvents) {}

  get active(): boolean {
    return this.bout !== undefined;
  }

  involves(fighter: Fighter): boolean {
    return this.bout?.east === fighter || this.bout?.west === fighter;
  }

  /** Stop at once, e.g. when a fighter leaves the arena or is picked up. */
  abort(time: number): void {
    if (!this.bout) return;
    for (const fighter of [this.bout.east, this.bout.west]) {
      fighter.setScript(undefined);
      fighter.setStance('free');
    }
    this.bout = undefined;
    this.nextAt = time + PAUSE_MIN;
    this.events.onAbort();
  }

  /** Start a bout now instead of waiting. */
  requestBout(time: number): void {
    if (!this.bout) this.nextAt = time;
  }

  update(time: number, lineup: Fighter[]): void {
    if (!this.bout) {
      if (time >= this.nextAt) this.start(time, lineup);
      return;
    }
    const bout = this.bout;
    const elapsed = time - bout.phaseStartedAt;
    switch (bout.phase) {
      case 'approach': {
        const arrived = [bout.east, bout.west].every((fighter) => this.distanceToMark(fighter, bout) < 0.3);
        if (arrived || elapsed > APPROACH_TIMEOUT) this.enter(bout, 'shikiri', time);
        break;
      }
      case 'shikiri':
        if (elapsed > DURATION.shikiri && time - bout.startedAt > BET_WINDOW) this.enter(bout, 'tachiai', time);
        break;
      case 'tachiai':
        if (elapsed > DURATION.tachiai) this.enter(bout, 'struggle', time);
        break;
      case 'struggle': {
        const length = bout.kimarite.style === 'push' ? DURATION.push : DURATION.slap;
        this.placeStruggle(bout, Math.min(elapsed / length, 1), time);
        if (elapsed > length) this.enter(bout, 'fall', time);
        break;
      }
      case 'fall':
        if (elapsed > DURATION.fall) this.enter(bout, 'bow', time);
        break;
      case 'bow':
        if (elapsed > DURATION.bow) {
          for (const fighter of [bout.east, bout.west]) {
            fighter.setScript(undefined);
            fighter.setStance('free');
          }
          this.bout = undefined;
          this.nextAt = time + PAUSE_MIN + Math.random() * PAUSE_RANGE;
        }
        break;
    }
  }

  private start(time: number, lineup: Fighter[]): void {
    const pool = lineup.filter((fighter) => !fighter.process.system).slice(0, CANDIDATES).filter((fighter) => !fighter.isScripted);
    if (pool.length < 2) {
      this.nextAt = time + 5;
      return;
    }
    // Favour the top of the banzuke: heavyweights make the best show.
    const index = Math.floor(Math.random() ** 1.8 * (pool.length - 1));
    const [east, west] = Math.random() < 0.5 ? [pool[index], pool[index + 1]] : [pool[index + 1], pool[index]];
    const angle = Math.random() * Math.PI * 2;
    const odds = 1 / (1 + Math.exp(-(east.power - west.power) * 6));
    this.bout = {
      east,
      west,
      eastWins: Math.random() < odds,
      kimarite: KIMARITE[Math.floor(Math.random() * KIMARITE.length)],
      phase: 'approach',
      startedAt: time,
      phaseStartedAt: time,
      axis: new Vector3(Math.cos(angle), 0, Math.sin(angle)),
    };
    this.enter(this.bout, 'approach', time);
    this.events.onStart(east, west, odds);
  }

  private enter(bout: Bout, phase: Phase, time: number): void {
    bout.phase = phase;
    bout.phaseStartedAt = time;
    const { east, west, axis } = bout;
    const eastFacing = facingAlong(-axis.x, -axis.z);
    const westFacing = facingAlong(axis.x, axis.z);
    const winner = bout.eastWins ? east : west;
    const loser = bout.eastWins ? west : east;

    switch (phase) {
      case 'approach':
        east.setScript(axis.scale(east.radius + 0.5), eastFacing, 2.6);
        west.setScript(axis.scale(-(west.radius + 0.5)), westFacing, 2.6);
        break;
      case 'shikiri':
        east.setStance('crouch');
        west.setStance('crouch');
        this.events.onShikiri(east, west);
        break;
      case 'tachiai':
        east.setStance('push');
        west.setStance('push');
        east.setScript(axis.scale(east.radius * 0.5), eastFacing, 10);
        west.setScript(axis.scale(-west.radius * 0.5), westFacing, 10);
        this.events.onClash();
        break;
      case 'struggle':
        break;
      case 'fall': {
        const push = bout.kimarite.style === 'push';
        loser.setStance(push ? 'fall-back' : 'fall-forward');
        winner.setStance('celebrate');
        if (push) {
          const outward = bout.eastWins ? -1 : 1;
          const current = loser.root.position;
          const slide = this.scratch.set(current.x + axis.x * outward * 0.8, 0, current.z + axis.z * outward * 0.8);
          loser.setScript(slide, loser === east ? eastFacing : westFacing, 1.5);
        }
        this.events.onResult(winner, loser, bout.kimarite);
        break;
      }
      case 'bow':
        loser.setStance('free');
        break;
    }
  }

  /** Sway in the middle, then the winner drives the pair toward the loser's side of the ring. */
  private placeStruggle(bout: Bout, progress: number, time: number): void {
    const { east, west, axis } = bout;
    const sway = Math.sin(time * 5.5) * 0.35 * (1 - progress);
    let shift = sway;
    if (bout.kimarite.style === 'push') {
      const eastReach = east.radius * 0.5;
      const westReach = west.radius * 0.5;
      const final = bout.eastWins ? -(OUTSIDE - westReach) : OUTSIDE - eastReach;
      const drive = Scalar.SmoothStep(0, 1, Scalar.Clamp((progress - 0.3) / 0.7, 0, 1));
      shift += final * drive;
    }
    const eastFacing = facingAlong(-axis.x, -axis.z);
    const westFacing = facingAlong(axis.x, axis.z);
    east.setScript(axis.scale(shift + east.radius * 0.5), eastFacing, 14);
    west.setScript(axis.scale(shift - west.radius * 0.5), westFacing, 14);
  }

  private distanceToMark(fighter: Fighter, bout: Bout): number {
    const sign = fighter === bout.east ? 1 : -1;
    const mark = bout.axis.scale(sign * (fighter.radius + 0.5));
    return Math.hypot(fighter.root.position.x - mark.x, fighter.root.position.z - mark.z);
  }
}
