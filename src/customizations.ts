import { adoptLegacy, isRecord, readVersioned, writeVersioned } from './storage';
import type { AppInfo } from './types';

const KEY = 'sumo:customizations';
const VERSION = 1;
export const NICKNAME_MAX = 24;
export const MAWASHI_COLORS = ['#d95f43', '#397f7b', '#d5a943', '#76618e', '#426789', '#a64e5c', '#52804e', '#1f1d1a'];

export interface Customization {
  nickname?: string;
  color?: string;
}

/** Stored entries, dropping any that are not objects. */
function load(): Record<string, Customization> {
  const stored = readVersioned(KEY, VERSION, adoptLegacy);
  if (!isRecord(stored)) return {};
  return Object.fromEntries(Object.entries(stored).filter(([, entry]) => isRecord(entry))) as Record<string, Customization>;
}

/** Per-app nicknames and mawashi colours chosen by the user, kept across sessions. */
export class Customizations {
  private readonly entries: Record<string, Customization> = load();

  get(id: string): Customization {
    return this.entries[id] ?? {};
  }

  set(id: string, patch: Customization): Customization {
    const next = { ...this.get(id), ...patch };
    if (!next.nickname?.trim()) delete next.nickname;
    else next.nickname = next.nickname.trim().slice(0, NICKNAME_MAX);
    if (!next.color) delete next.color;
    if (Object.keys(next).length === 0) delete this.entries[id];
    else this.entries[id] = next;
    writeVersioned(KEY, VERSION, this.entries);
    return next;
  }

  displayName(app: Pick<AppInfo, 'id' | 'name'>): string {
    return this.get(app.id).nickname ?? app.name;
  }
}
