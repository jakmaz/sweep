# Privacy Policy

**Sweep** ("the Extension") is a browser extension designed to help you manage open tabs by automatically discarding inactive ones to reduce memory usage.

## Data Collection

Sweep does **not** collect, transmit, or share any personal data. All data processed by this extension stays on your device.

Specifically:

- **Tab information** — The extension reads tab titles and URLs solely to determine which tabs to keep active and which to discard. This information is never transmitted to any external server.
- **Tab history** — Access timestamps and interaction counts for tabs are stored locally in your browser's `browser.storage.local`. This data is used exclusively to calculate tab priority scores for the discarding algorithm. It is never sent anywhere.
- **Settings** — Your preferences (e.g., max active tabs, inactivity threshold, whitelist domains) are stored in `browser.storage.local` and are never transmitted externally.

## Third Parties

Sweep does not use any third-party analytics, tracking, or advertising services. There are no third-party scripts embedded in the extension.

## Permissions Used

- `tabs` — Required to read tab information and discard inactive tabs.
- `storage` — Required to persist your settings and tab access history locally.
- `alarms` — Required to run periodic sweeps automatically.

## Changes to This Policy

If this privacy policy is ever updated, the changes will be reflected in this document on the project's GitHub repository.

## Contact

For questions or concerns about this privacy policy or the extension, please open an issue on GitHub:

**https://github.com/jakmaz/sweep**
