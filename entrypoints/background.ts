import { defineBackground } from 'wxt/sandbox';
import { browser } from 'wxt/browser';
import { initTabTracking } from '../utils/tab-manager';
import { initScheduler, syncScheduler, SWEEP_ALARM } from '../utils/scheduler';
import { executeSweep, getScoredTabs, manualDiscard, getEvents } from '../utils/sweep';
import { getSettings, saveSettings } from '../utils/storage';
import { isSweepMessage, type SweepMessage } from '../shared/messages';
import { normalizeSettings } from '../utils/settings';

async function handleMessage(message: SweepMessage) {
  switch (message.type) {
    case 'GET_STATE': {
      const [settings, tabs, events, alarm] = await Promise.all([
        getSettings(), getScoredTabs(), getEvents(), browser.alarms.get(SWEEP_ALARM),
      ]);
      return { settings, tabs, events, nextSweepAt: settings.enabled ? alarm?.scheduledTime ?? null : null };
    }
    case 'FORCE_SWEEP': return executeSweep();
    case 'MANUAL_DISCARD': return manualDiscard(message.tabId);
    case 'SAVE_SETTINGS': {
      await saveSettings(message.settings);
      await syncScheduler();
      return normalizeSettings(message.settings);
    }
  }
}

export default defineBackground(() => {
  initTabTracking();
  initScheduler();
  browser.runtime.onMessage.addListener((message: unknown) => {
    if (!isSweepMessage(message)) return undefined;
    return handleMessage(message).then(
      data => ({ ok: true, data }),
      (error: unknown) => ({ ok: false, error: error instanceof Error ? error.message : 'Sweep could not complete this action.' }),
    );
  });
});
