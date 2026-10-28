import { beforeEach, describe, expect, it } from 'vitest';
import { Basho, bashoName } from './basho';
import type { AppInfo } from './types';

function app(id: string): AppInfo {
  return { id, pid: 1, pids: [1], name: id, memory: 0, cpu: 0, process_count: 1, locked: false };
}

/** A basho whose clock is driven by the test. */
function clocked(start: string) {
  const clock = { now: new Date(`${start}T12:00:00`) };
  const basho = new Basho(() => clock.now);
  const advance = (days: number) => { clock.now = new Date(clock.now.getTime() + days * 86_400_000); };
  return { basho, advance };
}

const nameOf = (info: AppInfo) => info.name;

beforeEach(() => localStorage.clear());

describe('bashoName', () => {
  it('follows the six tournaments of the year', () => {
    expect(bashoName('2026-01-10')).toBe('Hatsu Basho 2026');
    expect(bashoName('2026-05-02')).toBe('Natsu Basho 2026');
    expect(bashoName('2026-10-19')).toBe('Aki Basho 2026');
    expect(bashoName('2026-12-01')).toBe('Kyūshū Basho 2026');
  });

  it('numbers a second edition in the same window', () => {
    expect(bashoName('2026-10-19', 'Aki Basho 2026')).toBe('Aki Basho 2026 II');
    expect(bashoName('2026-10-19', 'Aki Basho 2026 II')).toBe('Aki Basho 2026 III');
    expect(bashoName('2026-10-19', 'Natsu Basho 2026')).toBe('Aki Basho 2026');
  });
});

describe('Basho', () => {
  it('counts only the first bout of the day', () => {
    const { basho } = clocked('2026-10-19');
    basho.recordBout(app('chrome'), app('claude'), nameOf);
    basho.recordBout(app('claude'), app('chrome'), nameOf);
    expect(basho.record('chrome')).toMatchObject({ wins: 1, losses: 0 });
    expect(basho.record('claude')).toMatchObject({ wins: 0, losses: 1 });
  });

  it('fills one day per bout as the days go by', () => {
    const { basho, advance } = clocked('2026-10-19');
    basho.recordBout(app('chrome'), app('claude'), nameOf);
    advance(2);
    basho.recordBout(app('claude'), app('chrome'), nameOf);
    expect(basho.day).toBe(3);
    expect(basho.record('chrome')!.days.slice(0, 4)).toEqual([true, null, false, null]);
  });

  it('announces kachi-koshi and make-koshi at the eighth result', () => {
    const { basho, advance } = clocked('2026-10-19');
    const events = [];
    for (let day = 0; day < 8; day++) {
      events.push(...basho.recordBout(app('chrome'), app('claude'), nameOf));
      advance(1);
    }
    expect(events).toEqual([
      { kind: 'kachi-koshi', id: 'chrome', name: 'chrome' },
      { kind: 'make-koshi', id: 'claude', name: 'claude' },
    ]);
  });

  it('ranks by wins, then by fewer losses', () => {
    const { basho, advance } = clocked('2026-10-19');
    basho.recordBout(app('a'), app('b'), nameOf);
    advance(1);
    basho.recordBout(app('c'), app('b'), nameOf);
    advance(1);
    basho.recordBout(app('a'), app('c'), nameOf);
    expect(basho.standings().map((standing) => standing.id)).toEqual(['a', 'c', 'b']);
  });

  it('crowns the leader after fifteen days and opens the next basho', () => {
    const { basho, advance } = clocked('2026-10-01');
    basho.recordBout(app('chrome'), app('claude'), nameOf);
    advance(15);
    const events = basho.rollover();
    expect(events).toEqual([
      { kind: 'yusho', champion: { basho: 'Aki Basho 2026', id: 'chrome', name: 'chrome', wins: 1, losses: 0 } },
      { kind: 'opening', basho: 'Aki Basho 2026 II' },
    ]);
    expect(basho.day).toBe(1);
    expect(basho.standings()).toEqual([]);
    expect(basho.champions).toHaveLength(1);
  });

  it('keeps the tournament across sessions', () => {
    const first = clocked('2026-10-19');
    first.basho.recordBout(app('chrome'), app('claude'), nameOf);
    const second = clocked('2026-10-19');
    expect(second.basho.record('chrome')).toMatchObject({ wins: 1 });
  });

  it('reads a tournament saved before versioning and drops a broken one', () => {
    const days = Array<boolean | null>(15).fill(null);
    days[0] = true;
    localStorage.setItem('sumo:basho', JSON.stringify({ start: '2026-10-19', name: 'Aki Basho 2026', records: { chrome: { name: 'chrome', days } }, champions: [] }));
    expect(clocked('2026-10-20').basho.record('chrome')).toMatchObject({ wins: 1, losses: 0 });
    localStorage.setItem('sumo:basho', JSON.stringify({ start: 42, records: [] }));
    const fresh = clocked('2026-10-20').basho;
    expect(fresh.day).toBe(1);
    expect(fresh.standings()).toEqual([]);
  });
});
