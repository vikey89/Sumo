import { describe, expect, it } from 'vitest';
import { findSpikes } from './fans';
import type { CpuSample } from './fans';

/** One sample per second from a list of total loads, with the given culprit doing the work. */
function samples(loads: number[], culprit = ['app:webpack', 'webpack · shop'] as const): CpuSample[] {
  return loads.map((cpu, t) => ({ t: 1000 + t, cpu, top: cpu > 5 ? [[culprit[0], culprit[1], cpu * 4]] : [] }));
}

describe('findSpikes', () => {
  it('ignores a quiet machine and blips shorter than three seconds', () => {
    expect(findSpikes({ cores: 4, samples: samples([2, 3, 90, 95, 4, 3]) })).toEqual([]);
  });

  it('finds a spike and names the app that did the work', () => {
    const [spike, ...rest] = findSpikes({ cores: 4, samples: samples([2, 40, 80, 60, 3]) });
    expect(rest).toEqual([]);
    expect(spike).toEqual({ start: 1001, end: 1003, peak: 80, culprit: { id: 'app:webpack', name: 'webpack · shop', share: 1 } });
  });

  it('merges dips shorter than the gap and splits longer ones', () => {
    const merged = findSpikes({ cores: 4, samples: samples([50, 50, 50, 5, 5, 50, 50, 50]) });
    expect(merged).toHaveLength(1);
    const split = findSpikes({ cores: 4, samples: samples([50, 50, 50, 5, 5, 5, 5, 5, 50, 50, 50]) });
    expect(split.map((spike) => [spike.start, spike.end])).toEqual([[1000, 1002], [1008, 1010]]);
  });

  it('blames the busiest app over the whole spike, with its share of the load', () => {
    const history = samples([40, 40, 40]).map((sample) => ({
      ...sample,
      top: [['app:a', 'A', 120], ['app:b', 'B', 40]] as [string, string, number][],
    }));
    const [spike] = findSpikes({ cores: 4, samples: history });
    expect(spike.culprit).toEqual({ id: 'app:a', name: 'A', share: 0.75 });
  });
});
