export type RankTier = 'yokozuna' | 'ozeki' | 'sekiwake' | 'komusubi' | 'maegashira' | 'gyoji';

export interface Rank {
  tier: RankTier;
  /** Plain English name, shown first. */
  label: string;
  /** The Japanese rank, kept for flavour. */
  title: string;
  kanji: string;
}

const SANYAKU: Rank[] = [
  { tier: 'yokozuna', label: 'Grand champion', title: 'Yokozuna', kanji: '横綱' },
  { tier: 'ozeki', label: 'Champion', title: 'Ōzeki', kanji: '大関' },
  { tier: 'ozeki', label: 'Champion', title: 'Ōzeki', kanji: '大関' },
  { tier: 'sekiwake', label: 'Junior champion', title: 'Sekiwake', kanji: '関脇' },
  { tier: 'sekiwake', label: 'Junior champion', title: 'Sekiwake', kanji: '関脇' },
  { tier: 'komusubi', label: 'Contender', title: 'Komusubi', kanji: '小結' },
  { tier: 'komusubi', label: 'Contender', title: 'Komusubi', kanji: '小結' },
];

/** macOS itself: it stands on the ring but referees instead of competing. */
export const REFEREE: Rank = { tier: 'gyoji', label: 'Referee', title: 'Gyōji', kanji: '行司' };

/** Banzuke rank for a position in the memory ranking (0 = heaviest). */
export function rankFor(index: number): Rank {
  const position = index - SANYAKU.length + 1;
  return SANYAKU[index] ?? {
    tier: 'maegashira',
    label: `Wrestler #${position}`,
    title: `Maegashira ${position}`,
    kanji: '前頭',
  };
}
