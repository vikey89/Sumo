import type { Wallet } from './wallet';

const STAKES = [10, 25, 50];
/** Bookmaker's margin: fair odds would be 1 / chance. */
const MARGIN = 0.92;
const STREAK_FOR_BONUS = 3;
const STREAK_BONUS = 1.5;
/** Roughly how long the bout director keeps the betting window open, for the countdown bar. */
const WINDOW_SECONDS = 7;
const RESULT_MS = 4500;

export interface BoutOffer {
  eastId: string;
  eastName: string;
  westId: string;
  westName: string;
  /** Probability that east wins, from the fighters' power. */
  eastChance: number;
}

export interface BetOutcome {
  picked: boolean;
  won: boolean;
  stake: number;
  payout: number;
}

type Side = 'east' | 'west';

interface OpenBout {
  offer: BoutOffer;
  odds: Record<Side, number>;
  pick?: Side;
  stake: number;
  locked: boolean;
}

function odds(chance: number): number {
  return Math.min(8, Math.max(1.1, Math.round(MARGIN / chance * 10) / 10));
}

function multiplier(value: number): string {
  return `×${value.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`;
}

/** The prediction card: pick a side and a stake before the tachiai, get paid after the bout. */
export class BettingDesk {
  private bout?: OpenBout;
  private stake = STAKES[1];
  private hideTimer?: number;

  constructor(private readonly root: HTMLElement, private readonly wallet: Wallet) {
    root.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      const stake = target.closest<HTMLElement>('[data-stake]')?.dataset.stake;
      if (stake) this.chooseStake(stake === 'all' ? this.wallet.balance : Number(stake));
      const side = target.closest<HTMLElement>('[data-side]')?.dataset.side as Side | undefined;
      if (side) this.pick(side);
    });
    wallet.onChange(() => this.renderStakes());
  }

  /** Returns how many free chanko a broke player was given, if any. */
  offer(offer: BoutOffer): number {
    window.clearTimeout(this.hideTimer);
    const bailout = this.wallet.bailout();
    this.bout = {
      offer,
      odds: { east: odds(offer.eastChance), west: odds(1 - offer.eastChance) },
      stake: Math.min(this.stake, this.wallet.balance),
      locked: false,
    };
    this.render();
    return bailout;
  }

  get open(): boolean {
    return this.bout !== undefined && !this.bout.locked;
  }

  /** Payout multipliers by app id, for the badges over the fighters' heads. */
  oddsByFighter(): Record<string, string> | undefined {
    const bout = this.bout;
    if (!bout || bout.locked) return undefined;
    return { [bout.offer.eastId]: multiplier(bout.odds.east), [bout.offer.westId]: multiplier(bout.odds.west) };
  }

  /** A fighter was tapped in the arena; true when the tap counted as a prediction. */
  pickFighter(id: string): boolean {
    const bout = this.bout;
    if (!bout || bout.locked) return false;
    const side: Side | undefined = id === bout.offer.eastId ? 'east' : id === bout.offer.westId ? 'west' : undefined;
    if (!side) return false;
    this.pick(side);
    return true;
  }

  /** The tachiai: no more bets. */
  lock(): void {
    if (!this.bout || this.bout.locked) return;
    this.bout.locked = true;
    this.root.classList.add('is-locked');
    const { pick, stake, offer } = this.bout;
    this.status(pick ? `Charge! You staked ${stake} chanko on ${pick === 'east' ? offer.eastName : offer.westName}` : 'Charge! Predictions are closed');
  }

  settle(winnerId: string): BetOutcome | undefined {
    const bout = this.bout;
    if (!bout) return undefined;
    this.bout = undefined;
    const winner: Side = winnerId === bout.offer.eastId ? 'east' : 'west';
    const winnerName = winner === 'east' ? bout.offer.eastName : bout.offer.westName;
    const outcome: BetOutcome = { picked: bout.pick !== undefined, won: bout.pick === winner, stake: bout.pick ? bout.stake : 0, payout: 0 };

    if (!outcome.picked) {
      this.result('neutral', `${winnerName} wins`, 'Try a prediction in the next bout!');
    } else if (outcome.won) {
      const bonus = this.wallet.streak + 1 >= STREAK_FOR_BONUS;
      outcome.payout = Math.round(bout.stake * bout.odds[winner] * (bonus ? STREAK_BONUS : 1));
      this.wallet.earn(outcome.payout);
      this.wallet.recordPrediction(true);
      this.result('won', `Called it! +${outcome.payout} chanko`, bonus
        ? `${this.wallet.streak} right in a row: ${multiplier(STREAK_BONUS)} bonus`
        : `${winnerName} won at ${multiplier(bout.odds[winner])}`);
    } else {
      this.wallet.recordPrediction(false);
      this.result('lost', `Unlucky: ${winnerName} wins`, `You lost ${bout.stake} chanko`);
    }
    return outcome;
  }

  /** The bout was called off: give the stake back. */
  cancel(): void {
    const bout = this.bout;
    if (!bout) return;
    this.bout = undefined;
    if (bout.pick) this.wallet.earn(bout.stake);
    this.result('neutral', 'Bout called off', bout.pick ? 'Your stake was returned' : '');
  }

  private pick(side: Side): void {
    const bout = this.bout;
    if (!bout || bout.locked || bout.pick) return;
    if (bout.stake <= 0 || !this.wallet.spend(bout.stake)) {
      this.root.classList.remove('is-shaking');
      void this.root.offsetWidth;
      this.root.classList.add('is-shaking');
      return;
    }
    bout.pick = side;
    this.root.querySelectorAll<HTMLElement>('[data-side]').forEach((button) => {
      button.classList.toggle('is-picked', button.dataset.side === side);
    });
    this.root.classList.add('has-pick');
    const name = side === 'east' ? bout.offer.eastName : bout.offer.westName;
    const win = Math.round(bout.stake * bout.odds[side]);
    this.status(`${bout.stake} chanko on ${name}: if it wins you get ${win}`);
  }

  private chooseStake(amount: number): void {
    if (!this.bout || this.bout.locked || this.bout.pick) return;
    this.stake = amount;
    this.bout.stake = Math.min(amount, this.wallet.balance);
    this.renderStakes();
  }

  private render(): void {
    const bout = this.bout!;
    const { offer } = bout;
    const favourite: Side = offer.eastChance >= 0.5 ? 'east' : 'west';
    const side = (which: Side) => `
      <button type="button" class="bet-side" data-side="${which}">
        <span class="bet-name"></span>
        <span class="bet-odds">${multiplier(bout.odds[which])}</span>
        <small>${which === favourite ? 'favourite' : 'underdog'}</small>
      </button>`;
    this.root.className = 'bet-card card';
    this.root.innerHTML = `
      <div class="bet-head">
        <strong>Who wins?</strong>
        <span>Tap a wrestler and stake your <b data-term="chanko">chanko</b> before the <b data-term="tachiai">tachiai</b></span>
      </div>
      <div class="bet-sides">${side('east')}<span class="bet-vs">vs</span>${side('west')}</div>
      <div class="bet-stakes" role="group" aria-label="Stake">
        ${STAKES.map((stake) => `<button type="button" data-stake="${stake}">${stake}</button>`).join('')}
        <button type="button" data-stake="all">All in</button>
      </div>
      <p class="bet-status" aria-live="polite"></p>
      <div class="bet-timer" style="--window:${WINDOW_SECONDS}s"><i></i></div>`;
    this.root.querySelector('[data-side="east"] .bet-name')!.textContent = offer.eastName;
    this.root.querySelector('[data-side="west"] .bet-name')!.textContent = offer.westName;
    this.root.hidden = false;
    this.renderStakes();
  }

  private renderStakes(): void {
    const bout = this.bout;
    if (!bout) return;
    this.root.querySelectorAll<HTMLButtonElement>('[data-stake]').forEach((button) => {
      const value = button.dataset.stake === 'all' ? this.wallet.balance : Number(button.dataset.stake);
      button.disabled = bout.locked || bout.pick !== undefined || value > this.wallet.balance || value <= 0;
      button.classList.toggle('is-active', value === bout.stake);
      if (button.dataset.stake === 'all') button.textContent = `All in (${this.wallet.balance})`;
    });
  }

  private status(text: string): void {
    const element = this.root.querySelector('.bet-status');
    if (element) element.textContent = text;
  }

  private result(kind: 'won' | 'lost' | 'neutral', title: string, detail: string): void {
    this.root.className = `bet-card card is-result is-${kind}`;
    this.root.innerHTML = '<strong class="bet-result"></strong><p class="bet-status"></p>';
    this.root.querySelector('.bet-result')!.textContent = title;
    this.status(detail);
    this.root.hidden = false;
    this.hideTimer = window.setTimeout(() => { this.root.hidden = true; }, RESULT_MS);
  }
}
