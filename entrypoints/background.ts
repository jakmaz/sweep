import { defineBackground } from 'wxt/sandbox';
import { initTabTracking } from '../utils/tabManager';
import { initScheduler } from '../utils/scheduler';
import { executeSweep, getScoredTabs, manualDiscard, getEvents } from '../utils/sweep';
import { browser } from 'wxt/browser';

export default defineBackground(() => {
  console.log('Sweep background started');

  initTabTracking();
  initScheduler();

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    console.log('[Sweep] Message received:', message);

    if (message === 'FORCE_SWEEP') {
      executeSweep().then(sendResponse);
      return true;
    }

    if (message === 'GET_SCORED_TABS') {
      getScoredTabs()
        .then((tabs) => {
          console.log('[Sweep] Scored tabs returned:', tabs.length, tabs);
          sendResponse(tabs);
        })
        .catch((err) => {
          console.error('[Sweep] Error getting scored tabs:', err);
          sendResponse([]);
        });
      return true;
    }

    if (message.type === 'MANUAL_DISCARD') {
      console.log('[Sweep] Manual discard request for tab:', message.tabId);
      manualDiscard(message.tabId)
        .then((result) => {
          console.log('[Sweep] Manual discard result:', result);
          sendResponse(result);
        })
        .catch((err) => {
          console.error('[Sweep] Manual discard error:', err);
          sendResponse(false);
        });
      return true;
    }

    if (message === 'GET_EVENTS') {
      getEvents()
        .then(sendResponse)
        .catch(() => sendResponse([]));
      return true;
    }
  });
});
