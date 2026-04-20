# Sweep — Browser Tab Garbage Collector

Focus on what matters. Sweep the rest.

Sweep is a browser extension for Firefox and Zen that intelligently manages open tabs by discarding inactive ones to reduce memory usage. Unlike simple time-based tab managers, Sweep uses a unified scoring algorithm that balances **recency** (how recently you accessed a tab) and **frequency** (how often you switch to it) to decide which tabs to keep active.

## Features

- Unified scoring algorithm combining recency + frequency weights
- Automatic periodic sweeping via browser alarms
- Domain whitelist (tabs on whitelisted domains are never discarded)
- Protection rules: pinned tabs, audible tabs, and the active tab are always safe
- Manual sweep trigger via popup button
- Minimal, clean settings UI built with Svelte 5
- Dark mode support

> **Note for Zen Browser Users:** Due to current API limitations in how Zen isolates its custom workspaces from standard Firefox WebExtensions, Sweep's tab management is currently bounded to your **active** workspace. It cannot read, score, or unload tabs hidden inside inactive workspaces.

## Requirements

- **Node.js** ≥ 18 (or **Bun** ≥ 1.0)
- **Firefox** ≥ 109 or **Zen Browser**
- **macOS** (build tested on macOS; Linux should work similarly)

## Setup

```bash
# Install dependencies
bun install
```

## Build (Development)

```bash
# Build the extension
bun run build

# Create a clean zip for submission
bun run zip
```

The built extension will be at `.output/firefox-mv3/`.  
The submission zip will be at `.output/sweep.zip`.

## AMO Reviewer Build Instructions

To build an exact copy of this extension from the submitted source code:

1. **Requirements:**
   - Operating System: macOS or Linux (tested on macOS)
   - Built environment dependencies: Node.js ≥ 18.0.0 and npm ≥ 9.0.0 (or Bun ≥ 1.0)

2. **Build Steps:**
   Run the following commands in the root directory:
   ```bash
   # 1. Install dependencies
   npm install

   # 2. Build the extension bundle
   npm run build
   ```

3. **Output:**
   The compiled unpacked extension will be available in the `.output/firefox-mv3/` directory.

4. **Source Code Zip:**
   To securely package the raw source code for AMO submission without built caches, run:
   ```bash
   npm run zip:source
   ```

## Development

```bash
# Start dev server with hot reload
bun run dev
```

This opens a new Firefox profile with the extension pre-installed and hot module replacement enabled.

## Architecture

Sweep treats tabs like a memory management problem:

- **Active tabs** = "hot memory" (high score)
- **Inactive tabs** = "cold memory" (low score, candidates for discard)

The sweep algorithm:

1. Get all normal tabs
2. Filter out protected tabs (active, pinned, audible, whitelisted domain)
3. Filter out tabs younger than `minInactivityMinutes`
4. Score remaining tabs: `score = recencyWeight × recencyNorm + frequencyWeight × frequencyNorm`
5. Sort ascending by score (lowest = discard first)
6. Discard lowest-scoring tabs until tab count ≤ `maxActiveTabs`

## Settings

| Setting | Description | Default |
|---------|-------------|---------|
| `enabled` | Toggle Sweep on/off | `true` |
| `maxActiveTabs` | Hard cap on kept tabs | `10` |
| `minInactivityMinutes` | Minimum tab age before eligible | `10` |
| `recencyWeight` | How much recency matters (0–10) | `6` |
| `frequencyWeight` | How much frequency matters (0–10) | `4` |
| `whitelistDomains` | Domains that are never discarded | `[]` |
| `sweepIntervalMinutes` | Time between automatic sweeps | `5` |
