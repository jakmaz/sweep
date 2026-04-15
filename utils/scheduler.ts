import { browser } from 'wxt/browser';
import { executeSweep } from './sweep';
import { getSettings } from './storage';

export async function initScheduler() {
  const settings = await getSettings();
  
  // Set up repeating alarm
  browser.alarms.create('sweep-alarm', {
    periodInMinutes: settings.sweepIntervalMinutes || 5
  });

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'sweep-alarm') {
      executeSweep();
    }
  });
}
