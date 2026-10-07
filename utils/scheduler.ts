import { browser } from 'wxt/browser';
import { executeSweep } from './sweep';
import { getSettings } from './storage';

export const SWEEP_ALARM = 'sweep-alarm';
let scheduleQueue: Promise<void> = Promise.resolve();

export function syncScheduler(): Promise<void> {
  const operation = scheduleQueue.then(async () => {
    const settings = await getSettings();
    const existing = await browser.alarms.get(SWEEP_ALARM);
    if (!settings.enabled) {
      if (existing) await browser.alarms.clear(SWEEP_ALARM);
    } else if (settings.pausedUntil > Date.now()) {
      if (existing?.scheduledTime !== settings.pausedUntil || existing?.periodInMinutes !== undefined) {
        await browser.alarms.create(SWEEP_ALARM, { when: settings.pausedUntil });
      }
    } else if (existing?.periodInMinutes !== settings.sweepIntervalMinutes) {
      await browser.alarms.create(SWEEP_ALARM, { periodInMinutes: settings.sweepIntervalMinutes });
    }
  });
  scheduleQueue = operation.catch(() => undefined);
  return operation;
}

function reportSchedulerError(error: unknown) {
  console.error('Sweep could not update its schedule:', error);
}

/** Register before reading storage, and preserve matching alarms on wakeup. */
export function initScheduler(): void {
  browser.alarms.onAlarm.addListener(alarm => {
    if (alarm.name === SWEEP_ALARM) {
      void executeSweep().finally(syncScheduler).catch(reportSchedulerError);
    }
  });
  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.settings) void syncScheduler().catch(reportSchedulerError);
  });
  browser.runtime.onStartup.addListener(() => { void syncScheduler().catch(reportSchedulerError); });
  browser.runtime.onInstalled.addListener(() => { void syncScheduler().catch(reportSchedulerError); });
  void syncScheduler().catch(reportSchedulerError);
}
