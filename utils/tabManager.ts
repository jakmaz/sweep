import { browser } from 'wxt/browser';
import { getTabHistory, saveTabHistory } from './storage';
import type { TabAccessInfo } from '../shared/types';

let historyCache: Record<number, TabAccessInfo> | null = null;

async function getHistory(): Promise<Record<number, TabAccessInfo>> {
  if (!historyCache) {
    historyCache = await getTabHistory();
  }
  return historyCache;
}

export async function initTabTracking() {
  // Setup listeners for tab activity
  browser.tabs.onActivated.addListener(async (activeInfo) => {
    await recordTabAccess(activeInfo.tabId);
  });

  browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.active) {
      await recordTabAccess(tabId);
    }
  });

  browser.tabs.onRemoved.addListener(async (tabId) => {
    const history = await getHistory();
    if (history[tabId]) {
      delete history[tabId];
      await saveTabHistory(history);
    }
  });
}

export async function recordTabAccess(tabId: number) {
  const history = await getHistory();
  
  if (!history[tabId]) {
    history[tabId] = {
      tabId,
      lastAccessed: Date.now(),
      accessCount: 1
    };
  } else {
    history[tabId].lastAccessed = Date.now();
    history[tabId].accessCount += 1;
  }
  
  await saveTabHistory(history);
}

export async function getTabAccessInfo(tabId: number): Promise<TabAccessInfo | undefined> {
  const history = await getHistory();
  return history[tabId];
}
