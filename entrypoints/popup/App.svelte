<script lang="ts">
  import { onMount } from 'svelte';
  import { getSettings, saveSettings } from '../../utils/storage';
  import type { Settings } from '../../shared/types';
  import { browser } from 'wxt/browser';

  let settings = $state<Settings | null>(null);
  let whitelistText = $state('');

  onMount(async () => {
    settings = await getSettings();
    whitelistText = settings.whitelistDomains.join('\n');
  });

  async function updateSettings() {
    if (!settings) return;
    
    settings.whitelistDomains = whitelistText
      .split('\n')
      .map(d => d.trim())
      .filter(d => d.length > 0);
      
    await saveSettings(settings);
  }

  function forceSweep() {
    browser.runtime.sendMessage('FORCE_SWEEP');
  }
</script>

<main class="container">
  <h1>Sweep</h1>
  
  {#if settings}
    <div class="card">
      <label class="checkbox-label">
        <input 
          type="checkbox" 
          bind:checked={settings.enabled} 
          onchange={updateSettings} 
        />
        Enable Sweep
      </label>
    </div>

    <div class="card">
      <h3>Strategy Settings</h3>
      
      <label>
        Max Active Tabs: {settings.maxActiveTabs}
        <input 
          type="range" 
          min="1" 
          max="100" 
          bind:value={settings.maxActiveTabs} 
          onchange={updateSettings}
        />
      </label>

      <label>
        Min Inactivity (minutes): {settings.minInactivityMinutes}
        <input 
          type="range" 
          min="1" 
          max="120" 
          bind:value={settings.minInactivityMinutes} 
          onchange={updateSettings}
        />
      </label>
    </div>

    <div class="card">
      <h3>Algorithm Weights</h3>
      
      <label>
        Recency Weight: {settings.recencyWeight}
        <input 
          type="range" 
          min="0" 
          max="10" 
          bind:value={settings.recencyWeight} 
          onchange={updateSettings}
        />
      </label>

      <label>
        Frequency Weight: {settings.frequencyWeight}
        <input 
          type="range" 
          min="0" 
          max="10" 
          bind:value={settings.frequencyWeight} 
          onchange={updateSettings}
        />
      </label>
    </div>

    <div class="card">
      <h3>Whitelist Domains</h3>
      <label>
        One domain per line (e.g. github.com)
        <textarea 
          bind:value={whitelistText} 
          onchange={updateSettings}
          rows="3"
        ></textarea>
      </label>
    </div>

    <button onclick={forceSweep}>
      Sweep Now
    </button>
  {:else}
    <p>Loading...</p>
  {/if}
</main>
