import { browser, type Tabs } from 'wxt/browser';
import { getSettings, getTabHistory, addSweepEvent, getSweepEvents } from './storage';
import { calculateScore } from './scorer';
import type { Settings, TabAccessInfo, SweepEvent, ScoredTab } from '../shared/types';

export function isProtected(tab: Tabs.Tab, settings: Settings): { protected: boolean; reason: string } {
  if (tab.active) return { protected: true, reason: 'Active tab' };
  if (tab.pinned) return { protected: true, reason: 'Pinned tab' };
  if (tab.audible) return { protected: true, reason: 'Playing audio' };
  if (tab.discarded) return { protected: true, reason: 'Already discarded' };
  
  if (tab.url) {
    try {
      const url = new URL(tab.url);
      const isWhitelisted = settings.whitelistDomains.some(d => url.hostname.includes(d));
      if (isWhitelisted) return { protected: true, reason: 'Whitelisted domain' };
    } catch {
    }
  }
  
  return { protected: false, reason: '' };
}

export async function getScoredTabs(): Promise<ScoredTab[]> {
  const settings = await getSettings();
  const history = await getTabHistory();
  const tabs = await browser.tabs.query({ windowType: 'normal' });
  const now = Date.now();

  console.log('[Sweep] getScoredTabs - total tabs found:', tabs.length);

  const scoredTabs: ScoredTab[] = [];

  for (const tab of tabs) {
    if (!tab.id || !tab.url) {
      console.log('[Sweep] skipping tab - no id or url:', tab.id, tab.url);
      continue;
    }

    const protection = isProtected(tab, settings);
    const accessInfo = history[tab.id];
    const lastAccessed = accessInfo?.lastAccessed || now;
    const accessCount = accessInfo?.accessCount || 0;
    const ageMs = now - lastAccessed;

    const maxAgeMs = 24 * 60 * 60 * 1000;
    const recencyNorm = Math.max(0, Math.min(1, 1 - (ageMs / maxAgeMs)));
    const frequencyNorm = Math.min(1, accessCount / 50);

    const recencyScore = (settings.recencyWeight / 10) * recencyNorm;
    const frequencyScore = (settings.frequencyWeight / 10) * frequencyNorm;
    const score = recencyScore + frequencyScore;

    const isEligible = !protection.protected && !tab.discarded && ageMs >= settings.minInactivityMinutes * 60 * 1000;

    let domain = '';
    try { domain = new URL(tab.url).hostname; } catch {}

    scoredTabs.push({
      tabId: tab.id,
      title: tab.title || domain,
      url: tab.url,
      score,
      rank: 0,
      recencyScore,
      frequencyScore,
      accessCount,
      lastAccessed,
      isProtected: protection.protected,
      protectionReason: protection.reason,
      isEligible,
      isDiscarded: tab.discarded || false,
    });
  }

  // Assign ranks to non-protected, non-discarded tabs
  const sortedForRank = scoredTabs
    .filter(t => !t.isProtected && !t.isDiscarded)
    .slice()
    .sort((a, b) => a.score - b.score);

  for (let i = 0; i < sortedForRank.length; i++) {
    const target = scoredTabs.find(t => t.tabId === sortedForRank[i].tabId);
    if (target) {
      target.rank = i + 1;
    }
  }

  // Sort final list: protected first, then discarded, then by score
  scoredTabs.sort((a, b) => {
    if (a.isProtected !== b.isProtected) return a.isProtected ? -1 : 1;
    if (a.isDiscarded !== b.isDiscarded) return a.isDiscarded ? 1 : -1;
    return a.score - b.score;
  });

  console.log('[Sweep] scoredTabs result:', scoredTabs.length, scoredTabs.map(t => ({ tabId: t.tabId, score: t.score, rank: t.rank })));
  return scoredTabs;
}

export async function executeSweep(): Promise<SweepEvent> {
  const settings = await getSettings();
  const now = Date.now();
  
  const event: SweepEvent = {
    timestamp: now,
    discardedTabs: [],
    skippedCount: 0,
    totalTabs: 0,
    eligibleTabs: 0,
    message: '',
  };

  if (!settings.enabled) {
    event.message = 'Sweep is disabled';
    return event;
  }

  const history = await getTabHistory();
  const tabs = await browser.tabs.query({ windowType: 'normal' });
  event.totalTabs = tabs.length;

  const eligibleTabs: Array<{ tab: Tabs.Tab; score: number; accessInfo?: TabAccessInfo }> = [];
  let currentActiveAndEligibleCount = 0;

  for (const tab of tabs) {
    if (tab.discarded) continue;
    currentActiveAndEligibleCount++;

    if (isProtected(tab, settings).protected) {
      event.skippedCount++;
      continue;
    }

    const accessInfo = tab.id ? history[tab.id] : undefined;
    const lastAccessed = accessInfo?.lastAccessed || now;
    const ageMs = now - lastAccessed;
    
    if (ageMs < settings.minInactivityMinutes * 60 * 1000) {
      event.skippedCount++;
      continue;
    }

    event.eligibleTabs++;
    const score = calculateScore(tab, accessInfo, settings, now);
    eligibleTabs.push({ tab, score, accessInfo });
  }

  if (currentActiveAndEligibleCount <= settings.maxActiveTabs) {
    event.message = `No sweep needed. ${currentActiveAndEligibleCount} tabs (max: ${settings.maxActiveTabs})`;
    return event;
  }

  const tabsToDiscardCount = currentActiveAndEligibleCount - settings.maxActiveTabs;
  eligibleTabs.sort((a, b) => a.score - b.score);
  const toDiscard = eligibleTabs.slice(0, tabsToDiscardCount);

  for (const { tab } of toDiscard) {
    if (tab.id) {
      try {
        await browser.tabs.discard(tab.id);
        event.discardedTabs.push({
          tabId: tab.id,
          title: tab.title || 'Untitled',
          score: calculateScore(tab, history[tab.id], settings, now),
        });
      } catch (err) {
        console.error(`Failed to discard tab ${tab.id}:`, err);
      }
    }
  }

  event.message = `Discarded ${event.discardedTabs.length} tabs. ${event.skippedCount} skipped.`;

  await addSweepEvent(event);
  return event;
}

export async function manualDiscard(tabId: number): Promise<boolean> {
  try {
    await browser.tabs.discard(tabId);
    return true;
  } catch {
    return false;
  }
}

export async function getEvents(): Promise<SweepEvent[]> {
  return getSweepEvents();
}
