import type { Settings, TabAccessInfo } from '../shared/types';
import type { Tabs } from 'wxt/browser';

export function calculateScore(
  tab: Tabs.Tab,
  accessInfo: TabAccessInfo | undefined,
  settings: Settings,
  now: number
): number {
  // Base stats
  const lastAccessed = accessInfo?.lastAccessed || now;
  const accessCount = accessInfo?.accessCount || 1;

  // Normalize Recency: 0 to 1 (1 = accessed just now, 0 = accessed very long ago)
  // Let's cap max age at 24 hours for normalization purposes
  const maxAgeMs = 24 * 60 * 60 * 1000;
  const ageMs = Math.max(0, now - lastAccessed);
  let recencyNorm = 1 - (ageMs / maxAgeMs);
  if (recencyNorm < 0) recencyNorm = 0;

  // Normalize Frequency: 0 to 1 (1 = accessed 50+ times, 0 = accessed 1 time)
  const maxFrequency = 50;
  let frequencyNorm = accessCount / maxFrequency;
  if (frequencyNorm > 1) frequencyNorm = 1;

  // Apply weights
  const recencyScore = (settings.recencyWeight / 10) * recencyNorm;
  const frequencyScore = (settings.frequencyWeight / 10) * frequencyNorm;

  return recencyScore + frequencyScore;
}
