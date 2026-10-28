import { describe, expect, it, vi } from 'vitest';
import { adoptLegacy, readJson, readVersioned, writeJson, writeVersioned } from './storage';

describe('storage', () => {
  it('round-trips JSON', () => {
    writeJson('test', { a: 1 });
    expect(readJson('test')).toEqual({ a: 1 });
  });

  it('treats corrupt or missing data as absent', () => {
    localStorage.setItem('broken', '{nope');
    expect(readJson('broken')).toBeUndefined();
    expect(readJson('missing')).toBeUndefined();
  });

  it('survives a storage that throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    expect(() => writeJson('test', 1)).not.toThrow();
  });
});

describe('versioned storage', () => {
  it('round-trips a value inside a { v, data } envelope', () => {
    writeVersioned('test', 1, { a: 1 });
    expect(readJson('test')).toEqual({ v: 1, data: { a: 1 } });
    expect(readVersioned('test', 1)).toEqual({ a: 1 });
  });

  it('reads unversioned JSON as version 0 through the migration', () => {
    writeJson('legacy', { balance: 42 });
    const migrate = vi.fn((old: unknown, from: number) => ({ from, old }));
    expect(readVersioned('legacy', 2, migrate)).toEqual({ from: 0, old: { balance: 42 } });
    expect(readVersioned('legacy', 1, adoptLegacy)).toEqual({ balance: 42 });
    writeJson('flag', true);
    expect(readVersioned('flag', 1, adoptLegacy)).toBe(true);
  });

  it('migrates older envelopes and drops them without a migration', () => {
    writeVersioned('old', 1, { n: 1 });
    expect(readVersioned('old', 2, (old, from) => (from === 1 ? { n: (old as { n: number }).n + 1 } : undefined))).toEqual({ n: 2 });
    expect(readVersioned('old', 2)).toBeUndefined();
    expect(readVersioned('old', 2, adoptLegacy)).toBeUndefined();
  });

  it('falls back on corrupt data and on a migration that throws', () => {
    localStorage.setItem('broken', '{nope');
    expect(readVersioned('broken', 1, adoptLegacy)).toBeUndefined();
    expect(readVersioned('missing', 1, adoptLegacy)).toBeUndefined();
    writeJson('legacy', null);
    expect(readVersioned('legacy', 1, (old) => (old as { a: number }).a)).toBeUndefined();
  });

  it('ignores data written by a newer version', () => {
    writeVersioned('future', 3, { shape: 'unknown' });
    const migrate = vi.fn(adoptLegacy);
    expect(readVersioned('future', 1, migrate)).toBeUndefined();
    expect(migrate).not.toHaveBeenCalled();
  });
});
