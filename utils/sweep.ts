import { browser, type Tabs } from 'wxt/browser';
import { getSettings, getTabHistory } from './storage';
import { calculateScore } from './scorer';
import type { Settings, TabAccessInfo } from '../shared/types';

function isProtected(tab: Tabs.Tab, settings: Settings): boolean {
  if (tab.active || tab.pinned || tab.audible || tab.discarded) return true;
  
  if (tab.url) {
    try {
      const url = new URL(tab.url);
      const isWhitelisted = settings.whitelistDomains.some(d => url.hostname.includes(d));
      if (isWhitelisted) return true;
    } catch {
      // invalid URL
    }
  }
  
  return false;
}

export async function executeSweep() {
  const settings = await getSettings();
  if (!settings.enabled) return;

  const history = await getTabHistory();
  const tabs = await browser.tabs.query({ windowType: 'normal' });
  const now = Date.now();

  const eligibleTabs: Array<{ tab: Tabs.Tab, score: number, accessInfo?: TabAccessInfo }> = [];
  let currentActiveAndEligibleCount = 0;

  for (const tab of tabs) {
    if (tab.discarded) continue;
    currentActiveAndEligibleCount++;

    if (isProtected(tab, settings)) continue;

    const accessInfo = tab.id ? history[tab.id] : undefined;
    const lastAccessed = accessInfo?.lastAccessed || now;
    const ageMs = now - lastAccessed;
    
    // Skip if it hasn't been inactive long enough
    if (ageMs < settings.minInactivityMinutes * 60 * 1000) {
      continue;
    }

    const score = calculateScore(tab, accessInfo, settings, now);
    eligibleTabs.push({ tab, score, accessInfo });
  }

  // Do we need to discard any tabs?
  if (currentActiveAndEligibleCount <= settings.maxActiveTabs) {
    return;
  }

  const tabsToDiscardCount = currentActiveAndEligibleCount - settings.maxActiveTabs;
  
  // Sort lowest score first
  eligibleTabs.sort((a, b) => a.score - b.score);

  // Discard the required amount, but not more than what's eligible
  const toDiscard = eligibleTabs.slice(0, tabsToDiscardCount);

  for (const { tab } of toDiscard) {
    if (tab.id) {
      try {
        await browser.tabs.discard(tab.id);
        console.log(`Discarded tab ${tab.id} - ${tab.title}`);
      } catch (err) {
        console.error(`Failed to discard tab ${tab.id}:`, err);
      }
    }
  }
}
