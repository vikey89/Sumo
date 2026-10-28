/** localStorage can be missing or throw (private windows, blocked site data): never let it break the arena. */
export function readJson<T>(key: string): T | undefined {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? undefined : JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Persistence is a convenience; the session keeps working in memory.
  }
}

interface Envelope {
  v: number;
  data: unknown;
}

function isEnvelope(value: unknown): value is Envelope {
  return typeof value === 'object' && value !== null && Number.isInteger((value as Envelope).v) && 'data' in value;
}

/**
 * Reads a `{ v, data }` envelope written by writeVersioned. Bare JSON from before versioning counts as version 0.
 * Older versions go through `migrate` (dropped without one); newer, unknown versions are dropped, so callers fall back to defaults.
 */
export function readVersioned<T>(key: string, version: number, migrate?: (old: unknown, fromVersion: number) => T | undefined): T | undefined {
  const stored = readJson<unknown>(key);
  if (stored === undefined) return undefined;
  const { v, data } = isEnvelope(stored) ? stored : { v: 0, data: stored };
  if (v === version) return data as T;
  if (v > version || !migrate) return undefined;
  try {
    return migrate(data, v);
  } catch {
    return undefined;
  }
}

/** Migration for stores whose shape has not changed since versioning began: legacy JSON is taken as is, to be validated by the caller. */
export function adoptLegacy(old: unknown, fromVersion: number): unknown {
  return fromVersion === 0 ? old : undefined;
}

export function writeVersioned(key: string, version: number, value: unknown): void {
  writeJson(key, { v: version, data: value } satisfies Envelope);
}

/** Shape guards for validating what comes back from storage. */
export const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
export const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
