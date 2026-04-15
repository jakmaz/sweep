import { browser } from 'wxt/browser';
import { type Settings, defaultSettings, type TabAccessInfo, type SweepEvent } from '../shared/types';

const MAX_EVENTS = 50;

export async function getSettings(): Promise<Settings> {
  const result = await browser.storage.local.get('settings');
  return { ...defaultSettings, ...(result.settings || {}) };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await browser.storage.local.set({ settings });
}

export async function getTabHistory(): Promise<Record<number, TabAccessInfo>> {
  const result = await browser.storage.local.get('tabHistory');
  return result.tabHistory || {};
}

export async function saveTabHistory(history: Record<number, TabAccessInfo>): Promise<void> {
  await browser.storage.local.set({ tabHistory: history });
}

export async function getSweepEvents(): Promise<SweepEvent[]> {
  const result = await browser.storage.local.get('sweepEvents');
  return result.sweepEvents || [];
}

export async function addSweepEvent(event: SweepEvent): Promise<void> {
  const events = await getSweepEvents();
  events.unshift(event);
  const trimmed = events.slice(0, MAX_EVENTS);
  await browser.storage.local.set({ sweepEvents: trimmed });
}
