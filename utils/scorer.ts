import type { Settings, TabAccessInfo } from '../shared/types';
import type { Tabs } from 'wxt/browser';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Recent visits lose half their frequency influence every 24 hours. */
export function decayedFrequency(info: TabAccessInfo | undefined, now: number): number {
  if (!info) return 0;
  return info.frequencyCount * 2 ** (-Math.max(0, now - info.frequencyUpdatedAt) / DAY_MS);
}

export function lastAccessedAt(tab: Tabs.Tab, info: TabAccessInfo | undefined, now: number): number {
  const timestamps = [tab.lastAccessed, info?.lastAccessed].filter(
    (value): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0,
  );
  return Math.min(now, timestamps.length ? Math.max(...timestamps) : now);
}

/** One score calculation supplies both sweep ordering and the popup breakdown. */
export function calculateScores(tab: Tabs.Tab, info: TabAccessInfo | undefined, settings: Settings, now: number) {
  const ageMs = Math.max(0, now - lastAccessedAt(tab, info, now));
  const recencyScore = settings.recencyWeight / 10 * Math.max(0, 1 - ageMs / DAY_MS);
  const frequencyScore = settings.frequencyWeight / 10 * Math.min(1, decayedFrequency(info, now) / 50);
  return { score: recencyScore + frequencyScore, recencyScore, frequencyScore };
}
