import { beforeEach, describe, expect, it } from 'vitest';
import { BettingDesk } from './betting';
import { Wallet } from './wallet';

const OFFER = { eastId: 'chrome', eastName: 'Google Chrome', westId: 'claude', westName: 'claude', eastChance: 0.8 };

function desk() {
  const wallet = new Wallet();
  return { wallet, desk: new BettingDesk(document.createElement('div'), wallet) };
}

beforeEach(() => localStorage.clear());

describe('BettingDesk', () => {
  it('pays the favourite little and the underdog a lot', () => {
    const { desk: betting } = desk();
    betting.offer(OFFER);
    expect(betting.oddsByFighter()).toEqual({ chrome: '×1.2', claude: '×4.6' });
  });

  it('caps the odds at ×8', () => {
    const { desk: betting } = desk();
    betting.offer({ ...OFFER, eastChance: 0.99 });
    expect(betting.oddsByFighter()!.claude).toBe('×8.0');
  });

  it('takes the stake on a pick and pays the odds on a win', () => {
    const { desk: betting, wallet } = desk();
    betting.offer(OFFER);
    expect(betting.pickFighter('claude')).toBe(true);
    expect(wallet.balance).toBe(75);
    betting.lock();
    expect(betting.pickFighter('chrome')).toBe(false);
    expect(betting.settle('claude')).toEqual({ picked: true, won: true, stake: 25, payout: 115 });
    expect(wallet.balance).toBe(190);
  });

  it('keeps the stake on a loss', () => {
    const { desk: betting, wallet } = desk();
    betting.offer(OFFER);
    betting.pickFighter('claude');
    expect(betting.settle('chrome')).toEqual({ picked: true, won: false, stake: 25, payout: 0 });
    expect(wallet.balance).toBe(75);
    expect(wallet.streak).toBe(0);
  });

  it('adds a bonus on the third right call in a row', () => {
    const { desk: betting, wallet } = desk();
    wallet.recordPrediction(true);
    wallet.recordPrediction(true);
    betting.offer(OFFER);
    betting.pickFighter('chrome');
    expect(betting.settle('chrome')!.payout).toBe(45);
  });

  it('returns the stake when the bout is called off', () => {
    const { desk: betting, wallet } = desk();
    betting.offer(OFFER);
    betting.pickFighter('chrome');
    betting.cancel();
    expect(wallet.balance).toBe(100);
  });

  it('ignores taps on fighters outside the bout', () => {
    const { desk: betting } = desk();
    betting.offer(OFFER);
    expect(betting.pickFighter('finder')).toBe(false);
  });
});
