# Privacy Policy

**Sweep** ("the Extension") is a browser extension designed to help you manage open tabs by automatically discarding inactive ones to reduce memory usage.

## Data Collection

Sweep does **not** collect, transmit, or share any personal data. All data processed by this extension stays on your device.

Specifically:

- **Tab information** — The extension reads tab titles and URLs solely to determine which tabs to keep active and which to discard. This information is never transmitted to any external server.
- **Tab activity** — Access timestamps and visit counts are stored in your browser's session storage. Older Firefox versions use local storage and clear these counts when the browser starts. Activity is used exclusively to calculate tab priority scores and is never sent anywhere.
- **Sweep history** — Up to 50 sweep results, including unloaded tab titles, timestamps, and scores, are stored in `browser.storage.local`. These results are shown in the popup and are never transmitted.
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
