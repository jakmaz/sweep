import { defineBackground } from 'wxt/sandbox';
import { initTabTracking } from '../utils/tabManager';
import { initScheduler } from '../utils/scheduler';
import { executeSweep } from '../utils/sweep';
import { browser } from 'wxt/browser';

export default defineBackground(() => {
  console.log('Sweep background started');

  // Initialize tracking and scheduler on startup
  initTabTracking();
  initScheduler();

  // Allow forcing a sweep manually (e.g. from popup or commands in future)
  browser.runtime.onMessage.addListener((message) => {
    if (message === 'FORCE_SWEEP') {
      executeSweep();
    }
  });
});
