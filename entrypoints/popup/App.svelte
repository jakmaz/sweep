<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from 'wxt/browser';
  import { request } from '../../shared/messages';
  import { normalizeDomain, matchesDomain } from '../../utils/settings';
  import type { Settings, ScoredTab, SweepEvent } from '../../shared/types';

  let settings = $state<Settings | null>(null);
  let whitelistText = $state('');
  let scoredTabs = $state<ScoredTab[]>([]);
  let sweepEvents = $state<SweepEvent[]>([]);
  let activeTab = $state<'settings' | 'tabs'>('tabs');
  let hideUnloaded = $state(true);
  let searchQuery = $state('');
  let lastSweepMessage = $state('');
  let errorMessage = $state('');
  let loading = $state(true);
  let refreshing = $state(false);
  let busy = $state(false);
  let nextSweepAt = $state<number | null>(null);
  let currentTime = $state(Date.now());
  let refreshInFlight: Promise<void> | null = null;

  const loadedCount = $derived(scoredTabs.filter(tab => !tab.isDiscarded).length);
  const unloadedCount = $derived(scoredTabs.length - loadedCount);
  const candidates = $derived(scoredTabs.filter(tab => tab.isEligible));
  const paused = $derived(settings !== null && settings.pausedUntil > currentTime);
  const filteredTabs = $derived(scoredTabs.filter(tab => {
    const query = searchQuery.trim().toLowerCase();
    return (!hideUnloaded || !tab.isDiscarded)
      && (!query || tab.title.toLowerCase().includes(query) || domainFromUrl(tab.url).toLowerCase().includes(query));
  }));

  function showError(error: unknown) {
    errorMessage = error instanceof Error ? error.message : 'Could not complete this action. Try again.';
  }

  function refreshData(): Promise<void> {
    if (refreshInFlight) return refreshInFlight;
    refreshing = true;
    refreshInFlight = request({ type: 'GET_STATE' }).then(state => {
      settings = state.settings;
      whitelistText = state.settings.whitelistDomains.join('\n');
      scoredTabs = state.tabs;
      sweepEvents = state.events;
      nextSweepAt = state.nextSweepAt;
      currentTime = Date.now();
      if (!lastSweepMessage) lastSweepMessage = state.events[0]?.message ?? '';
    }).finally(() => {
      loading = false;
      refreshing = false;
      refreshInFlight = null;
    });
    return refreshInFlight;
  }

  onMount(() => {
    const savedTab = localStorage.getItem('sweep_activeTab');
    if (savedTab === 'settings') activeTab = 'settings';
    void refreshData().catch(showError);
    let timeout: ReturnType<typeof setTimeout>;
    const scheduleRefresh = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        if (!busy && document.activeElement?.tagName !== 'TEXTAREA') void refreshData().catch(showError);
      }, 150);
    };
    const onStorageChanged = (changes: Record<string, unknown>, area: string) => {
      if (area === 'local' && (changes.settings || changes.sweepEvents)) scheduleRefresh();
    };
    browser.tabs.onActivated.addListener(scheduleRefresh);
    browser.tabs.onCreated.addListener(scheduleRefresh);
    browser.tabs.onRemoved.addListener(scheduleRefresh);
    browser.tabs.onUpdated.addListener(scheduleRefresh);
    browser.storage.onChanged.addListener(onStorageChanged);
    const clock = setInterval(() => { currentTime = Date.now(); }, 30_000);
    return () => {
      clearTimeout(timeout);
      clearInterval(clock);
      browser.tabs.onActivated.removeListener(scheduleRefresh);
      browser.tabs.onCreated.removeListener(scheduleRefresh);
      browser.tabs.onRemoved.removeListener(scheduleRefresh);
      browser.tabs.onUpdated.removeListener(scheduleRefresh);
      browser.storage.onChanged.removeListener(onStorageChanged);
    };
  });

  async function perform(action: () => Promise<void>) {
    if (busy) return;
    busy = true;
    errorMessage = '';
    try {
      if (refreshInFlight) await refreshInFlight;
      await action();
      await refreshData();
    } catch (error) {
      showError(error);
    } finally {
      busy = false;
    }
  }

  async function updateSettings() {
    if (!settings) return;
    const next = $state.snapshot(settings);
    next.whitelistDomains = whitelistText.split('\n').map(domain => domain.trim()).filter(Boolean);
    await perform(async () => { settings = await request({ type: 'SAVE_SETTINGS', settings: next }); });
  }

  async function forceSweep() {
    await perform(async () => {
      const result = await request({ type: 'FORCE_SWEEP' });
      lastSweepMessage = result.message;
    });
  }

  async function discardTab(tabId: number) {
    await perform(async () => {
      const result = await request({ type: 'MANUAL_DISCARD', tabId });
      if (!result.unloaded) throw new Error(result.message);
      lastSweepMessage = result.message;
    });
  }

  async function toggleSite(tab: ScoredTab) {
    if (!settings) return;
    const domain = normalizeDomain(tab.url);
    if (!domain) { errorMessage = 'This page has no website domain to protect.'; return; }
    const next = $state.snapshot(settings);
    const matching = next.whitelistDomains.filter(site => matchesDomain(domain, site));
    next.whitelistDomains = matching.length
      ? next.whitelistDomains.filter(site => !matching.includes(site))
      : [...next.whitelistDomains, domain];
    await perform(async () => {
      settings = await request({ type: 'SAVE_SETTINGS', settings: next });
      lastSweepMessage = matching.length ? `${domain} can be swept again.` : `${domain} will stay loaded.`;
    });
  }

  async function togglePause() {
    if (!settings) return;
    const next = $state.snapshot(settings);
    next.pausedUntil = paused ? 0 : Date.now() + 60 * 60_000;
    await perform(async () => {
      settings = await request({ type: 'SAVE_SETTINGS', settings: next });
      lastSweepMessage = next.pausedUntil ? 'Sweeping paused for one hour.' : 'Automatic sweeping resumed.';
    });
  }

  async function jumpToTab(tabId: number) {
    await perform(async () => {
      const tab = await browser.tabs.get(tabId);
      if (tab.windowId !== undefined) await browser.windows.update(tab.windowId, { focused: true });
      await browser.tabs.update(tabId, { active: true });
      window.close();
    });
  }

  function selectPanel(panel: 'tabs' | 'settings') {
    activeTab = panel;
    localStorage.setItem('sweep_activeTab', panel);
  }

  function domainFromUrl(url: string): string {
    try { return new URL(url).hostname || url; } catch { return url || 'Browser page'; }
  }

  function formatAge(timestamp: number): string {
    const diff = Math.max(0, currentTime - timestamp);
    if (diff < 60_000) return 'just now';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return `${Math.floor(diff / 86_400_000)}d ago`;
  }

  function formatNextSweep(timestamp: number): string {
    return `Next sweep in ${Math.max(1, Math.ceil((timestamp - currentTime) / 60_000))}m`;
  }

  function isSiteKept(tab: ScoredTab): boolean {
    const domain = normalizeDomain(tab.url);
    return !!domain && !!settings?.whitelistDomains.some(site => matchesDomain(domain, site));
  }
</script>

<main class="container" aria-busy={loading}>
  <header class="header">
    <div class="logo-container"><img src="/icon.svg" class="logo" alt="" /><h1>Sweep</h1></div>
    {#if settings}
      <label class="toggle-label">
        <span class="toggle-caption">{settings.enabled ? 'On' : 'Off'}</span>
        <input type="checkbox" aria-label="Enable automatic sweeping" bind:checked={settings.enabled} onchange={updateSettings} disabled={busy} />
        <span class="toggle-track"><span class="toggle-thumb"></span></span>
      </label>
    {/if}
  </header>

  <nav class="tabs" aria-label="Popup sections">
    <button class="tab-btn" class:active={activeTab === 'tabs'} aria-current={activeTab === 'tabs' ? 'page' : undefined} onclick={() => selectPanel('tabs')}>Tabs</button>
    <button class="tab-btn" class:active={activeTab === 'settings'} aria-current={activeTab === 'settings' ? 'page' : undefined} onclick={() => selectPanel('settings')}>Settings</button>
  </nav>

  {#if errorMessage}
    <div class="error-state" role="alert">
      <p>{errorMessage}</p>
      <button class="secondary compact" disabled={busy || refreshing} onclick={() => { errorMessage = ''; void refreshData().catch(showError); }}>Retry</button>
    </div>
  {/if}

  {#if loading}
    <div class="loading" role="status">Loading tabs…</div>
  {:else if settings}
    <section class="status-card" aria-label="Tab status">
      <div class="status-line"><strong>{loadedCount} loaded</strong><span>{unloadedCount} unloaded</span><span>Target {settings.maxActiveTabs}</span></div>
      <p class="schedule-status">{!settings.enabled ? 'Automatic sweeping is off' : paused ? `Paused until ${new Date(settings.pausedUntil).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : nextSweepAt ? formatNextSweep(nextSweepAt) : 'Waiting for the next sweep'}</p>
      <p class="candidate-status">{candidates.length} {candidates.length === 1 ? 'candidate' : 'candidates'}{#if candidates[0]} · Next: <span>{candidates[0].title}</span>{/if}</p>
    </section>

    {#if activeTab === 'settings'}
      <div class="tab-panel scrollable-area">
        <fieldset disabled={busy}>
          <div class="card">
            <label class="param-row" for="loaded-target"><span class="param-name">Target loaded tabs</span><span class="param-value">{settings.maxActiveTabs}</span></label>
            <input id="loaded-target" type="range" min="1" max="100" bind:value={settings.maxActiveTabs} onchange={updateSettings} />
            <p class="setting-help">Protected and recently accessed tabs may keep you above this target.</p>
          </div>
          <div class="card">
            <label class="param-row" for="inactivity"><span class="param-name">Minimum inactivity</span><span class="param-value">{settings.minInactivityMinutes}m</span></label>
            <input id="inactivity" type="range" min="1" max="120" bind:value={settings.minInactivityMinutes} onchange={updateSettings} />
          </div>
          <div class="card">
            <label class="param-row" for="interval"><span class="param-name">Sweep every</span><span class="param-value">{settings.sweepIntervalMinutes}m</span></label>
            <input id="interval" type="range" min="1" max="60" bind:value={settings.sweepIntervalMinutes} onchange={updateSettings} />
          </div>
          <details class="card advanced-settings">
            <summary>Advanced settings</summary>
            <label class="param-row" for="recency"><span class="param-name">Recency weight</span><span class="param-value">{settings.recencyWeight}</span></label>
            <input id="recency" type="range" min="0" max="10" bind:value={settings.recencyWeight} onchange={updateSettings} />
            <label class="param-row" for="frequency"><span class="param-name">Frequency weight</span><span class="param-value">{settings.frequencyWeight}</span></label>
            <input id="frequency" type="range" min="0" max="10" bind:value={settings.frequencyWeight} onchange={updateSettings} />
            <p class="setting-help">Recency and frequency determine priority. Visit influence halves every 24 hours; reloads do not count as visits.</p>
            <label class="whitelist-label" for="kept-sites">Sites to keep loaded</label>
            <textarea id="kept-sites" bind:value={whitelistText} onchange={updateSettings} rows="3" placeholder="github.com&#10;notion.so"></textarea>
            <p class="setting-help">One domain or URL per line. Subdomains are included.</p>
          </details>
        </fieldset>
        <details class="card how-it-works">
          <summary>How Sweep works</summary>
          <p>Sweep unloads eligible tabs with the lowest recency + frequency scores first. Tabs stay open and reload when you return.</p>
          <p>Active, pinned, audible, and protected sites stay loaded. Recently accessed tabs wait until the inactivity threshold.</p>
          <p>Zen may expose only the current workspace, so Sweep cannot guarantee a browser-wide target there.</p>
        </details>
      </div>
    {:else}
      <div class="tab-panel">
        <div class="filter-row">
          <input type="search" class="search-input" aria-label="Search tabs" placeholder="Search tabs…" bind:value={searchQuery} />
          <button class="filter-btn" class:active={hideUnloaded} aria-pressed={hideUnloaded} onclick={() => hideUnloaded = !hideUnloaded}>Hide unloaded</button>
        </div>
        <div class="scrollable-area">
          {#if scoredTabs.length === 0}<p class="empty-state">Your browser returned no tabs. Try Refresh.</p>
          {:else if filteredTabs.length === 0}<p class="empty-state">No tabs match these filters.</p>
          {:else}
            <div class="tab-list">
              {#each filteredTabs as tab (tab.tabId)}
                <div class="tab-row" class:discarded={tab.isDiscarded}>
                  <button class="tab-link" onclick={() => jumpToTab(tab.tabId)} disabled={busy} title={`Open ${tab.title}`}>
                    <span class="tab-title">{tab.title}</span>
                    <span class="tab-domain">{domainFromUrl(tab.url)}</span>
                    <span class="tab-meta">{formatAge(tab.lastAccessed)}{#if tab.isDiscarded} · Unloaded{:else if tab.eligibilityReason} · {tab.eligibilityReason}{:else} · {tab.rank === 1 ? 'Next to unload' : `Candidate ${tab.rank}`}{/if}</span>
                  </button>
                  <div class="tab-controls">
                    {#if !tab.isDiscarded}<span class="score-value" title={`Recency ${tab.recencyScore.toFixed(2)} + frequency ${tab.frequencyScore.toFixed(2)} · ${tab.accessCount} visits`}>{tab.score.toFixed(2)}</span>{/if}
                    {#if !tab.isDiscarded && !tab.isProtected}<button class="inline-discard" disabled={busy} onclick={() => discardTab(tab.tabId)} aria-label={`Unload ${tab.title}`}>Unload</button>{/if}
                    {#if normalizeDomain(tab.url)}<button class="site-action" class:kept={isSiteKept(tab)} disabled={busy} onclick={() => toggleSite(tab)} aria-label={`${isSiteKept(tab) ? 'Allow unloading' : 'Keep loaded'}: ${domainFromUrl(tab.url)}`}>{isSiteKept(tab) ? 'Allow sweep' : 'Keep site loaded'}</button>{/if}
                  </div>
                </div>
              {/each}
            </div>
          {/if}
          {#if sweepEvents.length}
            <details class="history-list">
              <summary>Sweep history</summary>
              {#each sweepEvents.slice(0, 10) as event}
                <div class="history-entry"><div class="history-header"><span class="history-time">{formatAge(event.timestamp)}</span><span class="history-count">{event.discardedTabs.length} unloaded</span></div><p class="history-message">{event.message}</p></div>
              {/each}
            </details>
          {/if}
          <p class="scope-note">Zen may limit this list to the current workspace.</p>
        </div>
      </div>
    {/if}

    <footer class="popup-footer">
      {#if lastSweepMessage}<p class="sweep-status" role="status">{lastSweepMessage}</p>{/if}
      <div class="actions">
        <button onclick={forceSweep} disabled={busy || !settings.enabled || paused}>{busy ? 'Working…' : 'Sweep now'}</button>
        <button class="secondary" onclick={togglePause} disabled={busy || !settings.enabled}>{paused ? 'Resume' : 'Pause 1h'}</button>
        <button class="secondary" onclick={() => { errorMessage = ''; void refreshData().catch(showError); }} disabled={busy || refreshing} aria-label="Refresh tabs">{refreshing ? '…' : 'Refresh'}</button>
      </div>
    </footer>
  {:else if !errorMessage}
    <p class="empty-state">Sweep could not load your settings. Close the popup and try again.</p>
  {/if}
</main>
