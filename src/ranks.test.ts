import { describe, expect, it } from 'vitest';
import { rankFor } from './ranks';

describe('rankFor', () => {
  it('gives one yokozuna and pairs of sanyaku', () => {
    expect([0, 1, 2, 3, 5, 6].map((index) => rankFor(index).title)).toEqual(['Yokozuna', 'Ōzeki', 'Ōzeki', 'Sekiwake', 'Komusubi', 'Komusubi']);
  });

  it('numbers the maegashira after the sanyaku', () => {
    expect(rankFor(7)).toMatchObject({ tier: 'maegashira', title: 'Maegashira 1' });
    expect(rankFor(10).title).toBe('Maegashira 4');
  });
});
