import { afterAll, beforeAll, beforeEach, describe, expect, mock, setSystemTime, test } from 'bun:test';
import { defaultSettings } from '../shared/types';

const now = 1_800_000_000_000;
const day = 86_400_000;
const event = () => {
  const listeners = [];
  return { listeners, addListener: listener => listeners.push(listener), emit: (...args) => listeners.forEach(listener => listener(...args)) };
};
const local = {};
const session = {};
const alarms = new Map();
let tabs = [];
const storageArea = data => ({
  get: async key => structuredClone({ [key]: data[key] }),
  set: async values => Object.assign(data, structuredClone(values)),
  remove: async key => { delete data[key]; },
});
const defaultDiscard = async id => { const tab = tabs.find(tab => tab.id === id); if (!tab.active) tab.discarded = true; };
const browser = {
  tabs: {
    query: mock(async () => structuredClone(tabs)),
    get: mock(async id => { const tab = tabs.find(tab => tab.id === id); if (!tab) throw new Error('Tab closed'); return structuredClone(tab); }),
    discard: mock(defaultDiscard),
    onActivated: event(), onCreated: event(), onRemoved: event(), onUpdated: event(),
  },
  storage: { local: storageArea(local), session: storageArea(session), onChanged: event() },
  alarms: {
    get: async name => alarms.get(name),
    create: mock(async (name, options) => { alarms.set(name, { name, scheduledTime: options.when ?? Date.now() + options.periodInMinutes * 60_000, periodInMinutes: options.periodInMinutes }); }),
    clear: mock(async name => alarms.delete(name)),
    onAlarm: event(),
  },
  runtime: { onStartup: event(), onInstalled: event(), sendMessage: mock(async () => ({ ok: true, data: {} })) },
};
mock.module('wxt/browser', () => ({ browser }));
const { initTabTracking, getHistoryForTabs, recordTabAccess } = await import('../utils/tab-manager');
const { getScoredTabs, executeSweep, manualDiscard, isProtected } = await import('../utils/sweep');
const { initScheduler, syncScheduler, SWEEP_ALARM } = await import('../utils/scheduler');
const { getTabHistory, getSettings, saveSettings, getSweepEvents } = await import('../utils/storage');
const { request, isSweepMessage } = await import('../shared/messages');
const settle = async () => { await new Promise(resolve => setTimeout(resolve, 0)); };
const makeTab = (id, extra = {}) => ({ id, windowId: 1, active: id === 1, pinned: false, audible: false, discarded: false, lastAccessed: now - day, title: `Tab ${id}`, url: `https://tab${id}.example.org`, ...extra });
let listenersRegisteredImmediately;

beforeAll(async () => {
  initTabTracking();
  initScheduler();
  listenersRegisteredImmediately = browser.alarms.onAlarm.listeners.length === 1 && browser.tabs.onActivated.listeners.length === 1;
  await settle();
});
beforeEach(async () => {
  setSystemTime(now);
  for (const key of Object.keys(local)) delete local[key];
  for (const key of Object.keys(session)) delete session[key];
  local.settings = { ...defaultSettings, maxActiveTabs: 1 };
  tabs = [makeTab(1), makeTab(2)];
  alarms.clear();
  browser.tabs.query.mockImplementation(async () => structuredClone(tabs));
  browser.tabs.get.mockImplementation(async id => { const tab = tabs.find(tab => tab.id === id); if (!tab) throw new Error('Tab closed'); return structuredClone(tab); });
  browser.tabs.discard.mockImplementation(defaultDiscard);
  browser.runtime.sendMessage.mockImplementation(async () => ({ ok: true, data: {} }));
  browser.runtime.onStartup.emit();
  await settle();
  for (const fn of [browser.tabs.query, browser.tabs.get, browser.tabs.discard, browser.alarms.create, browser.alarms.clear]) fn.mockClear();
});
afterAll(() => setSystemTime());

describe('tracking', () => {
  test('registers wakeup listeners synchronously', () => expect(listenersRegisteredImmediately).toBe(true));
  test('unvisited old tabs are eligible using native timestamps', async () => {
    const tab = (await getScoredTabs()).find(tab => tab.tabId === 2);
    expect(tab.isEligible).toBe(true);
    expect(tab.lastAccessed).toBe(now - day);
  });
  test('unknown timestamps are seeded once and then age', async () => {
    tabs[1].lastAccessed = undefined;
    expect((await getScoredTabs()).find(tab => tab.tabId === 2).isEligible).toBe(false);
    setSystemTime(now + 11 * 60_000);
    expect((await getScoredTabs()).find(tab => tab.tabId === 2).isEligible).toBe(true);
  });
  test('reload completion does not inflate visit count', async () => {
    await recordTabAccess(2, 1);
    browser.tabs.onUpdated.emit(2, { status: 'complete' }, { ...tabs[1], active: true });
    await settle();
    expect((await getTabHistory())[2].accessCount).toBe(1);
  });
  test('decays previous visits before adding a new visit', async () => {
    await recordTabAccess(2, 1);
    setSystemTime(now + day);
    await recordTabAccess(2, 1);
    expect((await getTabHistory())[2].frequencyCount).toBe(1.5);
  });
  test('simultaneous tracking updates do not overwrite visits', async () => {
    await Promise.all([recordTabAccess(2, 1), recordTabAccess(2, 1), recordTabAccess(2, 1)]);
    expect((await getTabHistory())[2].accessCount).toBe(3);
  });
  test('old persistent tab IDs are ignored and startup clears current IDs', async () => {
    local.tabHistory = { 2: { accessCount: 99, lastAccessed: now } };
    await getHistoryForTabs(tabs, now);
    expect((await getTabHistory())[2].accessCount).toBe(0);
    await recordTabAccess(2, 1);
    browser.runtime.onStartup.emit();
    await settle();
    expect(await getTabHistory()).toEqual({});
  });
  test('supports browsers without session storage and resets their IDs', async () => {
    const sessionArea = browser.storage.session;
    try {
      browser.storage.session = undefined;
      await recordTabAccess(2, 1);
      expect(local.tabHistoryV2[2].accessCount).toBe(1);
      browser.runtime.onStartup.emit();
      await settle();
      expect(local.tabHistoryV2).toEqual({});
    } finally { browser.storage.session = sessionArea; }
  });
  test('tab removal cleans its history', async () => {
    await getHistoryForTabs(tabs, now);
    browser.tabs.onRemoved.emit(2);
    await settle();
    expect((await getTabHistory())[2]).toBeUndefined();
  });
});

describe('sweeping', () => {
  test('reaches the target and confirms discarded state', async () => {
    const displayed = (await getScoredTabs()).find(tab => tab.tabId === 2).score;
    const result = await executeSweep();
    expect(result.discardedTabs).toEqual([{ tabId: 2, title: 'Tab 2', score: displayed }]);
    expect(result.remainingLoadedTabs).toBe(1);
    expect((await getSweepEvents())[0].message).toBe(result.message);
  });
  test('does not report a fulfilled no-op as a successful unload', async () => {
    browser.tabs.discard.mockImplementation(async () => { tabs[1].active = true; });
    const result = await executeSweep();
    expect(result.discardedTabs).toHaveLength(0);
    expect(result.failedTabs).toHaveLength(1);
    expect(result.remainingLoadedTabs).toBe(2);
    expect(result.message).toContain('above target');
  });
  test('rechecks protection before unloading', async () => {
    let gets = 0;
    browser.tabs.get.mockImplementation(async id => {
      gets++;
      if (gets === 2) tabs.find(tab => tab.id === id).audible = true;
      return structuredClone(tabs.find(tab => tab.id === id));
    });
    const result = await executeSweep();
    expect(browser.tabs.discard).not.toHaveBeenCalled();
    expect(result.remainingLoadedTabs).toBe(2);
  });
  test('tries another candidate after a browser refusal', async () => {
    tabs.push(makeTab(3));
    local.settings.maxActiveTabs = 2;
    browser.tabs.discard.mockImplementation(async id => { if (id === 3) tabs.find(tab => tab.id === id).discarded = true; });
    expect((await executeSweep()).discardedTabs.map(tab => tab.tabId)).toEqual([3]);
  });
  test('does not unload a tab accessed during the final recheck', async () => {
    let gets = 0;
    browser.tabs.get.mockImplementation(async id => {
      gets++;
      if (gets === 2) tabs.find(tab => tab.id === id).lastAccessed = now;
      return structuredClone(tabs.find(tab => tab.id === id));
    });
    expect((await executeSweep()).discardedTabs).toHaveLength(0);
    expect(browser.tabs.discard).not.toHaveBeenCalled();
  });
  test('joins simultaneous sweep requests', async () => {
    const first = executeSweep();
    const second = executeSweep();
    expect(second).toBe(first);
    await Promise.all([first, second]);
    expect(browser.tabs.discard).toHaveBeenCalledTimes(1);
    expect(await getSweepEvents()).toHaveLength(1);
  });
  test('serializes manual unloading behind a sweep', async () => {
    const [sweep, manual] = await Promise.all([executeSweep(), manualDiscard(2)]);
    expect(sweep.discardedTabs).toHaveLength(1);
    expect(manual.unloaded).toBe(false);
    expect(browser.tabs.discard).toHaveBeenCalledTimes(1);
  });
  test('manual unloading respects site, audio, and pinned protection', async () => {
    for (const protection of [{ pinned: true }, { audible: true }, { url: 'https://github.com' }]) {
      tabs[1] = makeTab(2, protection);
      local.settings.whitelistDomains = ['github.com'];
      expect((await manualDiscard(2)).unloaded).toBe(false);
    }
    expect(browser.tabs.discard).not.toHaveBeenCalled();
  });
  test('paused and disabled sweeps persist the current status', async () => {
    local.settings.pausedUntil = now + 60_000;
    expect((await executeSweep()).message).toContain('paused');
    local.settings.enabled = false;
    expect((await executeSweep()).message).toContain('off');
    expect(browser.tabs.discard).not.toHaveBeenCalled();
    expect((await getSweepEvents())[0].message).toContain('off');
  });
  test('already unloaded tabs do not count toward the target', async () => {
    tabs[1].discarded = true;
    const result = await executeSweep();
    expect(result.loadedTabs).toBe(1);
    expect(browser.tabs.discard).not.toHaveBeenCalled();
  });
  test('ranks eligible candidates ahead of protected and recent tabs', async () => {
    tabs.push(makeTab(3, { lastAccessed: now }), makeTab(4, { discarded: true }));
    const result = await getScoredTabs();
    expect(result[0].tabId).toBe(2);
    expect(result[0].rank).toBe(1);
    expect(result.find(tab => tab.tabId === 3).rank).toBe(0);
    expect(result.at(-1).isDiscarded).toBe(true);
  });
  test('tab query failures propagate instead of pretending there are no tabs', async () => {
    browser.tabs.query.mockImplementation(async () => { throw new Error('Workspace unavailable'); });
    await expect(getScoredTabs()).rejects.toThrow('Workspace unavailable');
    await expect(executeSweep()).rejects.toThrow('Workspace unavailable');
  });
  test('protection uses exact hostname boundaries', () => {
    expect(isProtected(makeTab(2, { url: 'https://notgithub.com' }), { ...defaultSettings, whitelistDomains: ['github.com'] }).protected).toBe(false);
  });
});

describe('scheduling and messages', () => {
  test('preserves an existing repeating alarm on wakeup', async () => {
    const scheduledTime = alarms.get(SWEEP_ALARM).scheduledTime;
    await syncScheduler();
    expect(browser.alarms.create).not.toHaveBeenCalled();
    expect(alarms.get(SWEEP_ALARM).scheduledTime).toBe(scheduledTime);
  });
  test('updates the interval when settings change', async () => {
    local.settings.sweepIntervalMinutes = 12;
    browser.storage.onChanged.emit({ settings: { newValue: local.settings } }, 'local');
    await settle();
    expect(alarms.get(SWEEP_ALARM).periodInMinutes).toBe(12);
  });
  test('pause creates one resume alarm, and then restores the interval', async () => {
    local.settings.pausedUntil = now + 60_000;
    await syncScheduler();
    expect(alarms.get(SWEEP_ALARM).scheduledTime).toBe(now + 60_000);
    expect(alarms.get(SWEEP_ALARM).periodInMinutes).toBeUndefined();
    setSystemTime(now + 60_000);
    await syncScheduler();
    expect(alarms.get(SWEEP_ALARM).periodInMinutes).toBe(5);
  });
  test('disabled sweeping clears its alarm', async () => {
    local.settings.enabled = false;
    await syncScheduler();
    expect(alarms.has(SWEEP_ALARM)).toBe(false);
  });
  test('a failed resume sweep still restores the repeating alarm', async () => {
    alarms.set(SWEEP_ALARM, { name: SWEEP_ALARM, scheduledTime: now });
    browser.tabs.query.mockImplementation(async () => { throw new Error('Workspace unavailable'); });
    const logging = mock(() => {});
    const originalError = console.error;
    console.error = logging;
    try {
      browser.alarms.onAlarm.emit({ name: SWEEP_ALARM });
      await settle();
      expect(alarms.get(SWEEP_ALARM).periodInMinutes).toBe(5);
      expect(logging).toHaveBeenCalled();
    } finally { console.error = originalError; }
  });
  test('invalid domains cannot silently replace saved settings', async () => {
    await expect(saveSettings({ ...defaultSettings, whitelistDomains: ['invalid domain'] })).rejects.toThrow('valid domain');
    expect((await getSettings()).maxActiveTabs).toBe(1);
  });
  test('popup requests expose background and transport errors', async () => {
    browser.runtime.sendMessage.mockImplementation(async () => ({ ok: false, error: 'Workspace unavailable' }));
    await expect(request({ type: 'GET_STATE' })).rejects.toThrow('Workspace unavailable');
    browser.runtime.sendMessage.mockImplementation(async () => undefined);
    await expect(request({ type: 'GET_STATE' })).rejects.toThrow('unavailable');
  });
  test('rejects invalid message IDs without throwing on unrelated messages', () => {
    expect(isSweepMessage(null)).toBe(false);
    expect(isSweepMessage('GET_STATE')).toBe(false);
    expect(isSweepMessage({ type: 'MANUAL_DISCARD', tabId: NaN })).toBe(false);
    expect(isSweepMessage({ type: 'MANUAL_DISCARD', tabId: 2 })).toBe(true);
  });
});
