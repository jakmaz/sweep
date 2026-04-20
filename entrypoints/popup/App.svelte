<script lang="ts">
  import { onMount } from 'svelte';
  import { getSettings, saveSettings } from '../../utils/storage';
  import type { Settings, ScoredTab, SweepEvent } from '../../shared/types';
  import { browser } from 'wxt/browser';

  let settings = $state<Settings | null>(null);
  let whitelistText = $state('');
  let scoredTabs = $state<ScoredTab[]>([]);
  let sweepEvents = $state<SweepEvent[]>([]);
  let activeTab = $state<'settings' | 'tabs'>('settings');
  let showHowItWorks = $state(false);
  let hideUnloaded = $state(true);
  let searchQuery = $state('');
  let lastSweepMessage = $state('');
  let discarding = $state<number | null>(null);

  onMount(async () => {
    settings = await getSettings();
    whitelistText = settings.whitelistDomains.join('\n');
    await refreshData();
  });

  async function refreshData() {
    scoredTabs = await browser.runtime.sendMessage('GET_SCORED_TABS');
    sweepEvents = await browser.runtime.sendMessage('GET_EVENTS');
    if (sweepEvents.length > 0) {
      lastSweepMessage = sweepEvents[0].message;
    }
  }

  async function updateSettings() {
    if (!settings) return;
    settings.whitelistDomains = whitelistText
      .split('\n')
      .map(d => d.trim())
      .filter(d => d.length > 0);
    await saveSettings(settings);
  }

  async function forceSweep() {
    const result = await browser.runtime.sendMessage('FORCE_SWEEP') as SweepEvent;
    lastSweepMessage = result.message;
    await refreshData();
  }

  async function discardTab(tabId: number) {
    discarding = tabId;
    await browser.runtime.sendMessage({ type: 'MANUAL_DISCARD', tabId });
    discarding = null;
    await refreshData();
  }

  async function jumpToTab(tabId: number) {
    try {
      const tab = await browser.tabs.get(tabId);
      if (tab.windowId) {
        await browser.windows.update(tab.windowId, { focused: true });
      }
      await browser.tabs.update(tabId, { active: true });
      window.close();
    } catch (e) {
      console.error('Failed to jump to tab', e);
    }
  }

  function formatTime(timestamp: number): string {
    const diff = Date.now() - timestamp;
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return new Date(timestamp).toLocaleDateString();
  }

  function formatAge(timestamp: number): string {
    const diff = Date.now() - timestamp;
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  }

  function domainFromUrl(url: string): string {
    try { return new URL(url).hostname; } catch { return url; }
  }

  function scoreColor(score: number): string {
    if (score >= 0.8) return 'var(--score-high)';
    if (score >= 0.4) return 'var(--score-mid)';
    return 'var(--score-low)';
  }

  let filteredTabs = $derived.by(() => {
    let tabs = scoredTabs;
    if (hideUnloaded) {
      tabs = tabs.filter(t => !t.isDiscarded);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      tabs = tabs.filter(t => domainFromUrl(t.url).toLowerCase().includes(q) || t.title.toLowerCase().includes(q));
    }
    return tabs;
  });
</script>

<main class="container">
  <div class="header">
    <div class="logo-container">
      <img src="/icon.svg" class="logo" alt="Sweep Logo" />
      <h1>Sweep</h1>
    </div>
    {#if settings}
      <label class="toggle-label">
        <input 
          type="checkbox" 
          bind:checked={settings.enabled} 
          onchange={updateSettings} 
        />
        <span class="toggle-track">
          <span class="toggle-thumb"></span>
        </span>
      </label>
    {/if}
  </div>

  <div class="tabs">
    <button 
      class="tab-btn" 
      class:active={activeTab === 'settings'}
      onclick={() => activeTab = 'settings'}
    >
      Settings
    </button>
    <button 
      class="tab-btn" 
      class:active={activeTab === 'tabs'}
      onclick={() => activeTab = 'tabs'}
    >
      Tabs ({scoredTabs.length})
    </button>
  </div>

  {#if activeTab === 'settings'}
    <div class="tab-panel">
      <div class="scrollable-area">
        <div class="accordion">
        <button class="accordion-trigger" onclick={() => showHowItWorks = !showHowItWorks}>
          <span>How it works</span>
          <span class="accordion-arrow" class:open={showHowItWorks}>▼</span>
        </button>
        
        {#if showHowItWorks}
          <div class="accordion-content how-it-works">
            <p>
              Sweep treats your tabs like a memory management problem.
              <strong>Active</strong> tabs are "hot memory", <strong>inactive</strong> tabs are "cold memory" that can be reclaimed.
            </p>
            
            <h4>Scoring Formula</h4>
            <p>
              Every tab gets a <strong>priority score</strong> (0.0 – 2.0).
              Higher score = more important, lower chance of being discarded.
            </p>
            <code>score = recency × recencyWeight + frequency × frequencyWeight</code>
            
            <h4>Protection Rules</h4>
            <ul>
              <li><strong>Active tab</strong> — the tab you're currently viewing</li>
              <li><strong>Pinned tabs</strong> — explicitly pinned by you</li>
              <li><strong>Audible tabs</strong> — currently playing audio</li>
              <li><strong>Whitelist</strong> — domains you add manually</li>
              <li><strong>Too young</strong> — tabs newer than the inactivity threshold</li>
            </ul>

            <h4>The Sweep Algorithm</h4>
            <ol>
              <li>Get all normal tabs</li>
              <li>Filter out protected tabs</li>
              <li>Score remaining tabs</li>
              <li>Sort by score (lowest first)</li>
              <li>Discard lowest scoring tabs until under max limit</li>
            </ol>
          </div>
        {/if}
      </div>

      {#if settings}
        <div class="card">
          <div class="param-row">
            <span class="param-name">Max Active Tabs</span>
            <span class="param-value">{settings.maxActiveTabs}</span>
            <button class="icon-btn" data-tooltip="Maximum number of tabs to keep loaded. Tabs above this limit get discarded first.">?</button>
          </div>
          <input 
            type="range" 
            min="1" 
            max="100" 
            bind:value={settings.maxActiveTabs} 
            onchange={updateSettings}
          />
        </div>

        <div class="card">
          <div class="param-row">
            <span class="param-name">Min Inactivity</span>
            <span class="param-value">{settings.minInactivityMinutes}m</span>
            <button class="icon-btn" data-tooltip="Tabs younger than this are never discarded, even if over the max tab limit.">?</button>
          </div>
          <input 
            type="range" 
            min="1" 
            max="120" 
            bind:value={settings.minInactivityMinutes} 
            onchange={updateSettings}
          />
        </div>

        <div class="card">
          <div class="param-row">
            <span class="param-name">Recency Weight</span>
            <span class="param-value">{settings.recencyWeight}</span>
            <button class="icon-btn" data-tooltip="How much recently accessed tabs are prioritized. Higher = more important if visited recently.">?</button>
          </div>
          <input 
            type="range" 
            min="0" 
            max="10" 
            bind:value={settings.recencyWeight} 
            onchange={updateSettings}
          />

          <div class="param-row" style="margin-top: 12px;">
            <span class="param-name">Frequency Weight</span>
            <span class="param-value">{settings.frequencyWeight}</span>
            <button class="icon-btn" data-tooltip="How much often-visited tabs are prioritized. Higher = more important if visited many times.">?</button>
          </div>
          <input 
            type="range" 
            min="0" 
            max="10" 
            bind:value={settings.frequencyWeight} 
            onchange={updateSettings}
          />
        </div>

        <div class="card">
          <div class="param-row">
            <span class="param-name">Whitelist</span>
            <button class="icon-btn" data-tooltip="Domains that are never discarded, even if they have a low score.">?</button>
          </div>
          <textarea 
            bind:value={whitelistText} 
            onchange={updateSettings}
            rows="2"
            placeholder="github.com&#10;notion.so"
          ></textarea>
        </div>

        {#if lastSweepMessage}
          <div class="sweep-status">{lastSweepMessage}</div>
        {/if}

        <div class="actions">
          <button onclick={forceSweep}>Sweep Now</button>
          <button class="secondary" onclick={refreshData}>Refresh</button>
        </div>
      {/if}
      </div>
    </div>
  {:else}
    <div class="tab-panel">
      {#if scoredTabs.length === 0}
        <div class="empty-state">No tabs to display</div>
      {:else}
        <div class="section-header" style="display: flex; justify-content: space-between;">
          <span>Scoreboard {filteredTabs.length}/{scoredTabs.length}</span>
          <span style="font-weight: normal; opacity: 0.8;">↓ Next to unload</span>
        </div>
        
        <div class="filter-row">
          <input
            type="text"
            class="search-input"
            placeholder="Search domains..."
            bind:value={searchQuery}
          />
          <button 
            class="filter-btn" 
            class:active={hideUnloaded}
            onclick={() => hideUnloaded = !hideUnloaded}
            title="Hide unloaded tabs"
          >
            Hide unloaded
          </button>
        </div>

        <div class="scrollable-area">
          <div class="tab-list">
            {#each filteredTabs as tab}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="tab-row" class:discarded={tab.isDiscarded} class:protected={tab.isProtected && tab.protectionReason !== 'Active tab'} onclick={() => jumpToTab(tab.tabId)}>
              <div class="tab-info">
                <span class="tab-title">{tab.title || domainFromUrl(tab.url)}</span>
                <span class="tab-domain">{domainFromUrl(tab.url)}</span>
                <span class="tab-meta">
                  {tab.accessCount}x · {formatAge(tab.lastAccessed)}
                  {#if tab.isProtected}<span class="badge protected">{tab.protectionReason}</span>{/if}
                  {#if tab.isDiscarded}<span class="badge discarded">Unloaded</span>{/if}
                  {#if !tab.isDiscarded && tab.protectionReason !== 'Active tab'}
                    <button 
                      class="inline-discard" 
                      onclick={(e) => { e.stopPropagation(); discardTab(tab.tabId); }}
                      disabled={discarding === tab.tabId}
                    >
                      {discarding === tab.tabId ? '...' : 'Unload'}
                    </button>
                  {/if}
                </span>
              </div>
              <div class="tab-score">
                {#if tab.isDiscarded || (tab.isProtected && tab.protectionReason !== 'Active tab')}
                  <span class="score-immune"></span>
                {:else}
                  <span 
                    class="score-value" 
                    style="color: {scoreColor(tab.score)}"
                  >
                    {tab.score.toFixed(2)}
                  </span>
                {/if}
              </div>
            </div>
          {/each}
        </div>

        {#if sweepEvents.length > 0}
          <div class="section-header">Sweep History</div>
          <div class="history-list">
            {#each sweepEvents.slice(0, 10) as event}
              <div class="history-entry">
                <div class="history-header">
                  <span class="history-time">{formatTime(event.timestamp)}</span>
                  <span class="history-count">{event.discardedTabs.length} swept</span>
                </div>
                {#if event.discardedTabs.length > 0}
                  <div class="history-tabs">
                    {#each event.discardedTabs as dt}
                      <span class="history-tab">{dt.title}</span>
                    {/each}
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
        </div>
      {/if}
    </div>
  {/if}
</main>