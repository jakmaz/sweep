import { browser } from 'wxt/browser';
import type { DiscardResult, Settings, SweepEvent, SweepState } from './types';

export type SweepMessage =
  | { type: 'GET_STATE' }
  | { type: 'FORCE_SWEEP' }
  | { type: 'MANUAL_DISCARD'; tabId: number }
  | { type: 'SAVE_SETTINGS'; settings: Settings };

interface Responses {
  GET_STATE: SweepState;
  FORCE_SWEEP: SweepEvent;
  MANUAL_DISCARD: DiscardResult;
  SAVE_SETTINGS: Settings;
}

export function isSweepMessage(value: unknown): value is SweepMessage {
  if (!value || typeof value !== 'object' || !('type' in value)) return false;
  if (value.type === 'GET_STATE' || value.type === 'FORCE_SWEEP') return true;
  if (value.type === 'MANUAL_DISCARD') return 'tabId' in value && Number.isInteger(value.tabId) && Number(value.tabId) >= 0;
  return value.type === 'SAVE_SETTINGS' && 'settings' in value && !!value.settings && typeof value.settings === 'object';
}

/** Validate the response envelope and surface background failures to the popup. */
export async function request<T extends SweepMessage>(message: T): Promise<Responses[T['type']]> {
  const response: unknown = await browser.runtime.sendMessage(message);
  if (!response || typeof response !== 'object' || !('ok' in response)) throw new Error('Sweep is unavailable. Close the popup and try again.');
  if (response.ok !== true) {
    throw new Error('error' in response && typeof response.error === 'string' ? response.error : 'Sweep could not complete this action.');
  }
  if (!('data' in response)) throw new Error('Sweep returned an incomplete response.');
  return response.data as Responses[T['type']];
}
