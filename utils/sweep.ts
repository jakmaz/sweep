import { browser, type Tabs } from 'wxt/browser';
import { getSettings, addSweepEvent, getSweepEvents } from './storage';
import { getHistoryForTabs } from './tab-manager';
import { calculateScores, lastAccessedAt } from './scorer';
import { matchesDomain } from './settings';
import type { Settings, SweepEvent, ScoredTab, DiscardResult } from '../shared/types';

let mutationQueue: Promise<unknown> = Promise.resolve();
let sweepInFlight: Promise<SweepEvent> | null = null;

function serializeMutation<T>(action: () => Promise<T>): Promise<T> {
  const operation = mutationQueue.then(action);
  mutationQueue = operation.catch(() => undefined);
  return operation;
}

export function isProtected(tab: Tabs.Tab, settings: Settings): { protected: boolean; reason: string } {
  if (tab.active) return { protected: true, reason: 'Active tab' };
  if (tab.pinned) return { protected: true, reason: 'Pinned tab' };
  if (tab.audible) return { protected: true, reason: 'Playing audio' };
  if (tab.discarded) return { protected: true, reason: 'Already unloaded' };
  if (tab.url) {
    try {
      const hostname = new URL(tab.url).hostname;
      if (settings.whitelistDomains.some(domain => matchesDomain(hostname, domain))) {
        return { protected: true, reason: 'Site kept loaded' };
      }
    } catch {
      return { protected: true, reason: 'Unsupported page' };
    }
  }
  return { protected: false, reason: '' };
}

export async function getScoredTabs(): Promise<ScoredTab[]> {
  const settings = await getSettings();
  const tabs = await browser.tabs.query({ windowType: 'normal' });
  const now = Date.now();
  const history = await getHistoryForTabs(tabs, now);
  const scoredTabs = tabs.flatMap(tab => {
    if (tab.id === undefined) return [];
    const info = history[tab.id];
    const protection = isProtected(tab, settings);
    const lastAccessed = lastAccessedAt(tab, info, now);
    const recent = now - lastAccessed < settings.minInactivityMinutes * 60_000;
    return [{
      tabId: tab.id,
      title: tab.title || tab.url || 'Untitled',
      url: tab.url || '',
      ...calculateScores(tab, info, settings, now),
      rank: 0,
      accessCount: info?.accessCount ?? 0,
      lastAccessed,
      isProtected: protection.protected,
      protectionReason: protection.reason,
      eligibilityReason: protection.reason || (recent ? 'Recently accessed' : ''),
      isEligible: !protection.protected && !recent,
      isDiscarded: tab.discarded ?? false,
    }];
  });
  scoredTabs.sort((a, b) =>
    Number(b.isEligible) - Number(a.isEligible)
    || Number(a.isDiscarded) - Number(b.isDiscarded)
    || a.score - b.score
    || a.lastAccessed - b.lastAccessed
    || a.tabId - b.tabId,
  );
  let rank = 0;
  for (const tab of scoredTabs) if (tab.isEligible) tab.rank = ++rank;
  return scoredTabs;
}

function pauseMessage(settings: Settings, now: number): string | undefined {
  if (!settings.enabled) return 'Automatic sweeping is off.';
  if (settings.pausedUntil > now) {
    return `Sweeping is paused until ${new Date(settings.pausedUntil).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`;
  }
}

function loadedCount(tabs: Tabs.Tab[]): number {
  return tabs.filter(tab => !tab.discarded).length;
}

/** Shared requests join one sweep; all tab mutations run in order. */
export function executeSweep(): Promise<SweepEvent> {
  if (sweepInFlight) return sweepInFlight;
  sweepInFlight = serializeMutation(runSweep).finally(() => { sweepInFlight = null; });
  return sweepInFlight;
}

async function runSweep(): Promise<SweepEvent> {
  const settings = await getSettings();
  const now = Date.now();
  const scoredTabs = await getScoredTabs();
  const candidates = scoredTabs.filter(tab => tab.isEligible);
  const event: SweepEvent = {
    timestamp: now,
    discardedTabs: [],
    skippedCount: scoredTabs.filter(tab => !tab.isDiscarded && !tab.isEligible).length,
    totalTabs: scoredTabs.length,
    eligibleTabs: candidates.length,
    loadedTabs: scoredTabs.filter(tab => !tab.isDiscarded).length,
    remainingLoadedTabs: 0,
    failedTabs: [],
    message: '',
  };
  let stoppedMessage = pauseMessage(settings, now);
  if (!stoppedMessage) {
    for (const candidate of candidates) {
      const currentSettings = await getSettings();
      stoppedMessage = pauseMessage(currentSettings, Date.now());
      if (stoppedMessage) break;
      const currentTabs = await browser.tabs.query({ windowType: 'normal' });
      if (loadedCount(currentTabs) <= currentSettings.maxActiveTabs) break;
      try {
        const tab = await browser.tabs.get(candidate.tabId);
        const history = await getHistoryForTabs([tab], Date.now());
        const age = Date.now() - lastAccessedAt(tab, history[candidate.tabId], Date.now());
        if (isProtected(tab, currentSettings).protected || age < currentSettings.minInactivityMinutes * 60_000) continue;
        // Check again after the async history read in case the tab became protected.
        const latest = await browser.tabs.get(candidate.tabId);
        const latestNow = Date.now();
        if (isProtected(latest, currentSettings).protected
          || latestNow - lastAccessedAt(latest, history[candidate.tabId], latestNow) < currentSettings.minInactivityMinutes * 60_000) continue;
        await browser.tabs.discard(candidate.tabId);
        const result = await browser.tabs.get(candidate.tabId);
        if (result.discarded) {
          event.discardedTabs.push({ tabId: candidate.tabId, title: candidate.title, score: candidate.score });
        } else {
          event.failedTabs.push({ tabId: candidate.tabId, message: 'The browser kept this tab loaded.' });
        }
      } catch (error) {
        event.failedTabs.push({ tabId: candidate.tabId, message: error instanceof Error ? error.message : 'Could not unload this tab.' });
      }
    }
  }
  const remainingTabs = await browser.tabs.query({ windowType: 'normal' });
  event.remainingLoadedTabs = loadedCount(remainingTabs);
  const latestSettings = await getSettings();
  const excess = Math.max(0, event.remainingLoadedTabs - latestSettings.maxActiveTabs);
  event.message = stoppedMessage || (event.discardedTabs.length
    ? `Unloaded ${event.discardedTabs.length} ${event.discardedTabs.length === 1 ? 'tab' : 'tabs'}. ${event.remainingLoadedTabs} loaded.`
    : `No tabs unloaded. ${event.remainingLoadedTabs} loaded.`);
  if (!stoppedMessage && excess) event.message += ` ${excess} above target; remaining tabs are protected, recent, or could not unload.`;
  await addSweepEvent(event);
  return event;
}

export function manualDiscard(tabId: number): Promise<DiscardResult> {
  return serializeMutation(async () => {
    const settings = await getSettings();
    const tab = await browser.tabs.get(tabId);
    if (tab.discarded) return { unloaded: false, message: 'This tab is already unloaded.' };
    const protection = isProtected(tab, settings);
    if (protection.protected) return { unloaded: false, message: `Kept loaded: ${protection.reason.toLowerCase()}.` };
    await browser.tabs.discard(tabId);
    const result = await browser.tabs.get(tabId);
    return result.discarded
      ? { unloaded: true, message: `Unloaded ${tab.title || 'tab'}.` }
      : { unloaded: false, message: 'The browser kept this tab loaded. It may be active or have unsaved work.' };
  });
}

export async function getEvents(): Promise<SweepEvent[]> {
  return getSweepEvents();
}
