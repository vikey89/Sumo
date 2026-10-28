export interface GlossaryEntry {
  term: string;
  kanji?: string;
  /** What it means in real sumo. */
  meaning: string;
  /** What it stands for in the arena. */
  inGame?: string;
}

/** Every Japanese word the arena uses; elements with `data-term="<key>"` get a tooltip from here. */
export const GLOSSARY: Record<string, GlossaryEntry> = {
  gyoji: { term: 'Gyōji', kanji: '行司', meaning: 'The referee, dressed in silk robes, who runs the bouts.', inGame: 'macOS: every system process in a single fighter. It never fights and is protected.' },
  banzuke: { term: 'Banzuke', kanji: '番付', meaning: 'The official ranking of the wrestlers.', inGame: 'Your apps, ordered by memory used.' },
  yokozuna: { term: 'Yokozuna', kanji: '横綱', meaning: 'Grand champion: the highest rank in sumo.', inGame: 'The app using the most memory.' },
  ozeki: { term: 'Ōzeki', kanji: '大関', meaning: 'Champion: the second rank.', inGame: 'The 2nd and 3rd apps by memory.' },
  sekiwake: { term: 'Sekiwake', kanji: '関脇', meaning: 'Junior champion: the third rank.', inGame: 'The 4th and 5th apps by memory.' },
  komusubi: { term: 'Komusubi', kanji: '小結', meaning: 'Contender: the fourth rank.', inGame: 'The 6th and 7th apps by memory.' },
  maegashira: { term: 'Maegashira', kanji: '前頭', meaning: 'The top-division wrestlers below the titled ranks.', inGame: 'Every other app in the arena.' },
  dohyo: { term: 'Dohyō', kanji: '土俵', meaning: 'The clay ring where bouts are fought.', inGame: 'The arena.' },
  tawara: { term: 'Tawara', kanji: '俵', meaning: 'The straw bales marking the edge of the ring: step past them and you lose.', inGame: 'Drag an app past the edge to quit it.' },
  mawashi: { term: 'Mawashi', kanji: '廻し', meaning: 'The wrestler\'s belt.', inGame: 'The colour you can pick for each app.' },
  chanko: { term: 'Chanko', kanji: 'ちゃんこ', meaning: 'The stew wrestlers eat to put on weight.', inGame: 'The points you win with predictions and missions.' },
  shiko: { term: 'Shiko', kanji: '四股', meaning: 'The ritual stomp with one leg raised high.', inGame: 'An app does it when it frees memory.' },
  tachiai: { term: 'Tachiai', kanji: '立ち合い', meaning: 'The charge that starts a bout.', inGame: 'After the charge, predictions are closed.' },
  hakkeyoi: { term: 'Hakkeyoi', kanji: 'はっけよい', meaning: 'The referee\'s cry: "Come on, fight!"' },
  kimarite: { term: 'Kimarite', kanji: '決まり手', meaning: 'The technique that wins a bout.' },
  basho: { term: 'Basho', kanji: '場所', meaning: 'An official tournament, 15 days long.', inGame: '15 days in a row: each app\'s first bout of the day counts in its record.' },
  kachikoshi: { term: 'Kachi-koshi', kanji: '勝ち越し', meaning: 'A winning record: 8 wins or more out of 15.', inGame: 'An app with 8 official wins this basho.' },
  makekoshi: { term: 'Make-koshi', kanji: '負け越し', meaning: 'A losing record: 8 losses or more out of 15.' },
  yusho: { term: 'Yūshō', kanji: '優勝', meaning: 'The tournament championship, won by the best record.', inGame: 'The app with the most official wins after 15 days.' },
  hoshitori: { term: 'Hoshitori', kanji: '星取', meaning: 'The scorecard of a basho: a white circle for each win, a black one for each loss.' },
  heya: { term: 'Heya', kanji: '部屋', meaning: 'The stable where wrestlers live and train.' },
};
