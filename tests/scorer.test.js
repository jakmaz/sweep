import { describe, expect, test } from 'bun:test';
import { calculateScores, decayedFrequency, lastAccessedAt } from '../utils/scorer';
import { matchesDomain, normalizeDomain, normalizeSettings } from '../utils/settings';
import { defaultSettings } from '../shared/types';

const now = 1_800_000_000_000;
const day = 86_400_000;
const info = { tabId: 1, lastAccessed: now, accessCount: 50, frequencyCount: 50, frequencyUpdatedAt: now };

describe('recency and frequency scoring', () => {
  test('both weights influence ordering', () => {
    const recent = { lastAccessed: now };
    const older = { lastAccessed: now - day / 2 };
    const frequent = { ...info, lastAccessed: older.lastAccessed };
    expect(calculateScores(recent, undefined, defaultSettings, now).score).toBe(0.6);
    expect(calculateScores(older, frequent, defaultSettings, now).score).toBeCloseTo(0.7);
    expect(calculateScores(older, frequent, { ...defaultSettings, frequencyWeight: 0 }, now).score).toBeCloseTo(0.3);
  });
  test('frequency influence halves each day', () => {
    expect(decayedFrequency(info, now + day)).toBe(25);
    expect(decayedFrequency(info, now + 2 * day)).toBe(12.5);
    expect(calculateScores({}, info, defaultSettings, now + 2 * day).frequencyScore).toBeCloseTo(0.1);
  });
  test('native access time is used for unobserved tabs', () => {
    expect(lastAccessedAt({ lastAccessed: now - day }, undefined, now)).toBe(now - day);
    expect(calculateScores({ lastAccessed: now - day }, undefined, defaultSettings, now).score).toBe(0);
  });
  test('uses the newest valid timestamp without future scores', () => {
    expect(lastAccessedAt({ lastAccessed: now - day }, info, now)).toBe(now);
    expect(lastAccessedAt({ lastAccessed: now + day }, undefined, now)).toBe(now);
    expect(lastAccessedAt({ lastAccessed: NaN }, undefined, now)).toBe(now);
  });
  test('zero weights remain deterministic without invalid scores', () => {
    expect(calculateScores({}, undefined, { ...defaultSettings, recencyWeight: 0, frequencyWeight: 0 }, now).score).toBe(0);
  });
});

describe('settings and domain protection', () => {
  test('normalizes URLs, case, and trailing dots', () => {
    expect(normalizeDomain(' HTTPS://GitHub.COM/path ')).toBe('github.com');
    expect(normalizeDomain('github.com.')).toBe('github.com');
    expect(normalizeDomain('*.github.com')).toBeUndefined();
    expect(normalizeDomain('not a domain')).toBeUndefined();
    expect(normalizeDomain('https://user:password@example.org')).toBeUndefined();
    expect(normalizeDomain('about:blank')).toBeUndefined();
  });
  test('matches exact domains and true subdomains only', () => {
    expect(matchesDomain('github.com', 'github.com')).toBe(true);
    expect(matchesDomain('api.github.com', 'github.com')).toBe(true);
    expect(matchesDomain('notgithub.com', 'github.com')).toBe(false);
    expect(matchesDomain('github.com.example.org', 'github.com')).toBe(false);
  });
  test('migrates old settings while bounding invalid numbers', () => {
    const settings = normalizeSettings({ maxActiveTabs: -5, sweepIntervalMinutes: NaN, whitelistDomains: ['GitHub.com', 'https://github.com', 'bad domain'], enabled: false });
    expect(settings.maxActiveTabs).toBe(1);
    expect(settings.sweepIntervalMinutes).toBe(5);
    expect(settings.whitelistDomains).toEqual(['github.com']);
    expect(settings.pausedUntil).toBe(0);
    expect(settings.enabled).toBe(false);
    expect(settings.recencyWeight).toBe(6);
    expect(settings.frequencyWeight).toBe(4);
  });
});
