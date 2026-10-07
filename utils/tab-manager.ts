import { browser, type Tabs } from 'wxt/browser';
import { getTabHistory, saveTabHistory } from './storage';
import { decayedFrequency, lastAccessedAt } from './scorer';
import type { TabAccessInfo } from '../shared/types';

let historyQueue: Promise<unknown> = Promise.resolve();
const activeTabs = new Map<number, number>();

function updateHistory<T>(update: (history: Record<number, TabAccessInfo>) => Promise<T>): Promise<T> {
  const operation = historyQueue.then(async () => update(await getTabHistory()));
  historyQueue = operation.catch(() => undefined);
  return operation;
}

function seedTab(tab: Tabs.Tab, history: Record<number, TabAccessInfo>, now: number) {
  if (tab.id === undefined) return;
  if (history[tab.id]) return false;
  history[tab.id] = {
    tabId: tab.id,
    lastAccessed: lastAccessedAt(tab, undefined, now),
    accessCount: 0,
    frequencyCount: 0,
    frequencyUpdatedAt: now,
  };
  return true;
}

export function getHistoryForTabs(tabs: Tabs.Tab[], now: number): Promise<Record<number, TabAccessInfo>> {
  return updateHistory(async history => {
    let changed = false;
    for (const tab of tabs) if (seedTab(tab, history, now)) changed = true;
    if (changed) await saveTabHistory(history);
    return history;
  });
}

export function recordTabAccess(tabId: number, windowId: number): Promise<void> {
  const previousTabId = activeTabs.get(windowId);
  activeTabs.set(windowId, tabId);
  return updateHistory(async history => {
    const now = Date.now();
    if (previousTabId !== undefined && history[previousTabId]) history[previousTabId].lastAccessed = now;
    const info = history[tabId];
    history[tabId] = {
      tabId,
      lastAccessed: now,
      accessCount: (info?.accessCount ?? 0) + 1,
      frequencyCount: decayedFrequency(info, now) + 1,
      frequencyUpdatedAt: now,
    };
    await saveTabHistory(history);
  });
}

function reportTrackingError(error: unknown) {
  console.error('Sweep could not update tab activity:', error);
}

/** Register synchronously so activity can wake the MV3 background page. */
export function initTabTracking(): void {
  browser.tabs.onActivated.addListener(info => {
    void recordTabAccess(info.tabId, info.windowId).catch(reportTrackingError);
  });
  browser.tabs.onCreated.addListener(tab => {
    void getHistoryForTabs([tab], Date.now()).catch(reportTrackingError);
  });
  browser.tabs.onRemoved.addListener(tabId => {
    void updateHistory(async history => {
      delete history[tabId];
      for (const [windowId, activeTabId] of activeTabs) {
        if (activeTabId === tabId) activeTabs.delete(windowId);
      }
      await saveTabHistory(history);
    }).catch(reportTrackingError);
  });
  browser.runtime.onStartup.addListener(() => {
    activeTabs.clear();
    // Firefox versions without session storage still clear session-scoped IDs.
    void updateHistory(async () => saveTabHistory({})).catch(reportTrackingError);
  });
  browser.runtime.onInstalled.addListener(() => {
    void browser.storage.local.remove('tabHistory').catch(reportTrackingError);
  });
  void browser.tabs.query({ windowType: 'normal' }).then(async tabs => {
    for (const tab of tabs) {
      if (tab.active && tab.id !== undefined && tab.windowId !== undefined && !activeTabs.has(tab.windowId)) activeTabs.set(tab.windowId, tab.id);
    }
    await getHistoryForTabs(tabs, Date.now());
  }).catch(reportTrackingError);
}
