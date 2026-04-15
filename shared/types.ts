export interface Settings {
  enabled: boolean;
  maxActiveTabs: number;
  minInactivityMinutes: number;
  recencyWeight: number;
  frequencyWeight: number;
  whitelistDomains: string[];
  sweepIntervalMinutes: number;
}

export const defaultSettings: Settings = {
  enabled: true,
  maxActiveTabs: 10,
  minInactivityMinutes: 10,
  recencyWeight: 6,
  frequencyWeight: 4,
  whitelistDomains: [],
  sweepIntervalMinutes: 5,
};

export interface TabAccessInfo {
  tabId: number;
  lastAccessed: number; // timestamp
  accessCount: number;
}

export interface ScoredTab {
  tabId: number;
  title: string;
  url: string;
  score: number;
  rank: number;
  recencyScore: number;
  frequencyScore: number;
  accessCount: number;
  lastAccessed: number;
  isProtected: boolean;
  protectionReason: string;
  isEligible: boolean;
  isDiscarded: boolean;
}

export interface SweepEvent {
  timestamp: number;
  discardedTabs: Array<{ tabId: number; title: string; score: number }>;
  skippedCount: number;
  totalTabs: number;
  eligibleTabs: number;
  message: string;
}
