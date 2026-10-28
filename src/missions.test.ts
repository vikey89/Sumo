import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MissionBoard, timeLeft } from './missions';
import type { AppInfo, AppSnapshot } from './types';

const GB = 1024 ** 3;

function snapshot(used: number, processes: AppInfo[] = []): AppSnapshot {
  return { timestamp: 0, total_memory: 32 * GB, used_memory: used, process_count: processes.length, processes };
}

beforeEach(() => localStorage.clear());

describe('MissionBoard', () => {
  it('fills the board with three different missions', () => {
    const board = new MissionBoard((app) => app.name);
    board.observe(snapshot(20 * GB), 0);
    const kinds = board.active.map((mission) => mission.kind);
    expect(kinds).toHaveLength(3);
    expect(new Set(kinds).size).toBe(3);
  });

  it('completes "Let the Mac breathe" once enough RAM is freed', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const board = new MissionBoard((app) => app.name);
    board.observe(snapshot(20 * GB), 0);
    const mission = board.active.find((candidate) => candidate.kind === 'free-ram')!;
    expect(mission.target).toBeGreaterThan(0);
    const events = [];
    for (let tick = 1; tick <= 20 && events.length === 0; tick++) {
      events.push(...board.observe(snapshot(20 * GB - mission.target * 2), tick * 1000));
    }
    expect(events).toMatchObject([{ kind: 'completed', mission: { id: mission.id, done: true } }]);
  });

  it('formats the time left', () => {
    const mission = { deadline: 10 * 60_000 } as Parameters<typeof timeLeft>[0];
    expect(timeLeft(mission, 0)).toBe('10 min');
    expect(timeLeft(mission, 9.5 * 60_000)).toBe('under 1 min');
  });
});
