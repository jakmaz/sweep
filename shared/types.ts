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
