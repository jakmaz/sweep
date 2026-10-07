import { defaultSettings, type Settings } from '../shared/types';

export function normalizeDomain(value: string): string | undefined {
  const input = value.trim();
  if (!input || /\s|\*/.test(input)) return undefined;
  try {
    const url = new URL(input.includes('://') ? input : `https://${input}`);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return undefined;
    const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
    return hostname && !hostname.startsWith('.') && !hostname.includes('..') ? hostname : undefined;
  } catch {
    return undefined;
  }
}

export function matchesDomain(hostname: string, domain: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  return host === domain || host.endsWith(`.${domain}`);
}

function boundedNumber(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.round(Math.max(min, Math.min(max, value)))
    : fallback;
}

export function normalizeSettings(value: unknown): Settings {
  const saved = value && typeof value === 'object' ? value : {};
  const read = (key: keyof Settings): unknown => key in saved ? Reflect.get(saved, key) : undefined;
  const domains = read('whitelistDomains');
  const enabled = read('enabled');
  return {
    enabled: typeof enabled === 'boolean' ? enabled : defaultSettings.enabled,
    maxActiveTabs: boundedNumber(read('maxActiveTabs'), defaultSettings.maxActiveTabs, 1, 100),
    minInactivityMinutes: boundedNumber(read('minInactivityMinutes'), defaultSettings.minInactivityMinutes, 1, 120),
    recencyWeight: boundedNumber(read('recencyWeight'), defaultSettings.recencyWeight, 0, 10),
    frequencyWeight: boundedNumber(read('frequencyWeight'), defaultSettings.frequencyWeight, 0, 10),
    sweepIntervalMinutes: boundedNumber(read('sweepIntervalMinutes'), defaultSettings.sweepIntervalMinutes, 1, 60),
    pausedUntil: boundedNumber(read('pausedUntil'), 0, 0, Number.MAX_SAFE_INTEGER),
    whitelistDomains: Array.isArray(domains)
      ? [...new Set(domains.flatMap((domain: unknown) => {
        const normalized = typeof domain === 'string' ? normalizeDomain(domain) : undefined;
        return normalized ? [normalized] : [];
      }))]
      : [],
  };
}
