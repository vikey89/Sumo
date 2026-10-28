import type { CoachStep } from '../coach';

export const TOUR: CoachStep[] = [
  {
    title: 'Welcome to the arena',
    body: 'Every wrestler is an app on your Mac: the more memory it uses, the bigger it gets. When it takes memory it eats; when it frees some it does the ritual stomp.',
  },
  {
    target: '#side-panel',
    title: 'Ranking and missions',
    body: 'The heaviest apps climb the ranks: the top one is the Grand champion. The Missions tab has goals for freeing memory and earning points.',
  },
  {
    target: '.chanko-stat',
    title: 'Your chanko',
    body: 'These are the game\'s points: you win them by predicting bout winners and completing missions. You start with 100.',
  },
  {
    target: '#toolbar',
    title: 'The controls',
    body: 'Sound, an instant bout, today\'s recap, arena-only mode and the guide. Hover a button to see its keyboard shortcut.',
  },
  {
    title: 'Out of the ring',
    body: 'To quit an app, drag its wrestler past the edge: we always ask first. The padlock marks protected apps, like the macOS referee. Now, the first bout!',
  },
];
