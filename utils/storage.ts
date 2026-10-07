import { browser } from 'wxt/browser';
import { type Settings, type TabAccessInfo, type SweepEvent } from '../shared/types';
import { normalizeSettings, normalizeDomain } from './settings';

const MAX_EVENTS = 50;

export async function getSettings(): Promise<Settings> {
  const result = await browser.storage.local.get('settings');
  return normalizeSettings(result.settings);
}

export async function saveSettings(settings: Settings): Promise<void> {
  if (settings.whitelistDomains.some(domain => !normalizeDomain(domain))) {
    throw new Error('Enter a valid domain or website URL on each line.');
  }
  await browser.storage.local.set({ settings: normalizeSettings(settings) });
}

export async function getTabHistory(): Promise<Record<number, TabAccessInfo>> {
  const result = await (browser.storage.session ?? browser.storage.local).get('tabHistoryV2');
  const stored = result.tabHistoryV2;
  if (!stored || typeof stored !== 'object') return {};
  return Object.fromEntries(Object.entries(stored).filter((entry): entry is [string, TabAccessInfo] => {
    const info: unknown = entry[1];
    return !!info && typeof info === 'object'
      && ['tabId', 'lastAccessed', 'accessCount', 'frequencyCount', 'frequencyUpdatedAt'].every(key => {
        const value: unknown = Reflect.get(info, key);
        return typeof value === 'number' && Number.isFinite(value) && value >= 0;
      });
  }));
}

export async function saveTabHistory(history: Record<number, TabAccessInfo>): Promise<void> {
  await (browser.storage.session ?? browser.storage.local).set({ tabHistoryV2: history });
}

export async function getSweepEvents(): Promise<SweepEvent[]> {
  const result = await browser.storage.local.get('sweepEvents');
  if (!Array.isArray(result.sweepEvents)) return [];
  return result.sweepEvents.filter(isStoredEvent).map(event => ({
    ...event,
    loadedTabs: event.loadedTabs ?? event.totalTabs,
    remainingLoadedTabs: event.remainingLoadedTabs ?? Math.max(0, event.totalTabs - event.discardedTabs.length),
    failedTabs: event.failedTabs ?? [],
  }));
}

type StoredEvent = Omit<SweepEvent, 'loadedTabs' | 'remainingLoadedTabs' | 'failedTabs'>
  & Partial<Pick<SweepEvent, 'loadedTabs' | 'remainingLoadedTabs' | 'failedTabs'>>;

function isStoredEvent(value: unknown): value is StoredEvent {
  if (!value || typeof value !== 'object') return false;
  return typeof Reflect.get(value, 'timestamp') === 'number'
    && typeof Reflect.get(value, 'message') === 'string'
    && ['totalTabs', 'eligibleTabs', 'skippedCount'].every(key => typeof Reflect.get(value, key) === 'number')
    && Array.isArray(Reflect.get(value, 'discardedTabs'));
}

export async function addSweepEvent(event: SweepEvent): Promise<void> {
  const events = await getSweepEvents();
  events.unshift(event);
  const trimmed = events.slice(0, MAX_EVENTS);
  await browser.storage.local.set({ sweepEvents: trimmed });
}
