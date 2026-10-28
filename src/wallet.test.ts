import { beforeEach, describe, expect, it } from 'vitest';
import { Wallet } from './wallet';

beforeEach(() => localStorage.clear());

describe('Wallet', () => {
  it('starts with 100 chanko and refuses stakes it cannot cover', () => {
    const wallet = new Wallet();
    expect(wallet.balance).toBe(100);
    expect(wallet.spend(150)).toBe(false);
    expect(wallet.spend(0)).toBe(false);
    expect(wallet.spend(40)).toBe(true);
    expect(wallet.balance).toBe(60);
  });

  it('tracks the streak of right predictions', () => {
    const wallet = new Wallet();
    wallet.recordPrediction(true);
    wallet.recordPrediction(true);
    expect(wallet.streak).toBe(2);
    wallet.recordPrediction(false);
    expect(wallet.streak).toBe(0);
  });

  it('bails out a broke player, once', () => {
    const wallet = new Wallet();
    wallet.spend(98);
    expect(wallet.bailout()).toBe(50);
    expect(wallet.balance).toBe(52);
    expect(wallet.bailout()).toBe(0);
  });

  it('remembers the balance across sessions and notifies changes', () => {
    const wallet = new Wallet();
    const changes: [number, number][] = [];
    wallet.onChange((balance, change) => changes.push([balance, change]));
    wallet.earn(25);
    expect(changes).toEqual([[125, 25]]);
    expect(new Wallet().balance).toBe(125);
  });

  it('keeps the balance of a wallet saved before versioning', () => {
    localStorage.setItem('sumo:wallet', JSON.stringify({ balance: 340, streak: 2, bestStreak: 5, betsWon: 9, betsLost: 4 }));
    const wallet = new Wallet();
    expect(wallet.balance).toBe(340);
    expect(wallet.streak).toBe(2);
    wallet.earn(10);
    expect(JSON.parse(localStorage.getItem('sumo:wallet')!)).toEqual({ v: 1, data: { balance: 350, streak: 2, bestStreak: 5, betsWon: 9, betsLost: 4 } });
    expect(new Wallet().balance).toBe(350);
  });

  it('falls back to defaults on corrupt or future data', () => {
    localStorage.setItem('sumo:wallet', JSON.stringify({ balance: 'lots', streak: -1, betsWon: 3 }));
    expect(new Wallet().balance).toBe(100);
    localStorage.setItem('sumo:wallet', JSON.stringify({ balance: null }));
    expect(new Wallet().balance).toBe(100);
    localStorage.setItem('sumo:wallet', '{nope');
    expect(new Wallet().balance).toBe(100);
    localStorage.setItem('sumo:wallet', JSON.stringify({ v: 99, data: { balance: 500 } }));
    expect(new Wallet().balance).toBe(100);
  });
});
