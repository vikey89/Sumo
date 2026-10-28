import { adoptLegacy, isCount, isRecord, readVersioned, writeVersioned } from './storage';

const KEY = 'sumo:wallet';
const VERSION = 1;
const STARTING_BALANCE = 100;
const BAILOUT_BELOW = 5;
const BAILOUT = 50;

interface WalletState {
  balance: number;
  streak: number;
  bestStreak: number;
  betsWon: number;
  betsLost: number;
}

const FIELDS: (keyof WalletState)[] = ['balance', 'streak', 'bestStreak', 'betsWon', 'betsLost'];

/** Keeps only the fields that are sane counts, so a corrupt value falls back to its default instead of a NaN balance. */
function load(): Partial<WalletState> {
  const stored = readVersioned(KEY, VERSION, adoptLegacy);
  if (!isRecord(stored)) return {};
  return Object.fromEntries(Object.entries(stored).filter(([key, value]) => FIELDS.includes(key as keyof WalletState) && isCount(value)));
}

/** The player's chanko points, kept across sessions. */
export class Wallet {
  private readonly state: WalletState = {
    balance: STARTING_BALANCE,
    streak: 0,
    bestStreak: 0,
    betsWon: 0,
    betsLost: 0,
    ...load(),
  };
  private readonly listeners = new Set<(balance: number, change: number) => void>();

  get balance(): number {
    return this.state.balance;
  }

  get streak(): number {
    return this.state.streak;
  }

  onChange(listener: (balance: number, change: number) => void): void {
    this.listeners.add(listener);
  }

  /** Take a stake; false when the player cannot afford it. */
  spend(amount: number): boolean {
    if (amount <= 0 || amount > this.state.balance) return false;
    this.change(-amount);
    return true;
  }

  earn(amount: number): void {
    if (amount > 0) this.change(amount);
  }

  recordPrediction(won: boolean): void {
    if (won) {
      this.state.betsWon += 1;
      this.state.streak += 1;
      this.state.bestStreak = Math.max(this.state.bestStreak, this.state.streak);
    } else {
      this.state.betsLost += 1;
      this.state.streak = 0;
    }
    this.save();
  }

  /** A broke player gets a free bowl, so the game never dead-ends. Returns the amount given. */
  bailout(): number {
    if (this.state.balance >= BAILOUT_BELOW) return 0;
    this.change(BAILOUT);
    return BAILOUT;
  }

  private change(amount: number): void {
    this.state.balance = Math.max(0, Math.round(this.state.balance + amount));
    this.save();
    this.listeners.forEach((listener) => listener(this.state.balance, amount));
  }

  private save(): void {
    writeVersioned(KEY, VERSION, this.state);
  }
}
