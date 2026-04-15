import { browser } from 'wxt/browser';
import { type Settings, defaultSettings, type TabAccessInfo } from '../shared/types';

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
