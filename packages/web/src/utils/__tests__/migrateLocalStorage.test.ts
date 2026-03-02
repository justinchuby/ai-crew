import { describe, it, expect, vi, beforeEach } from 'vitest';
import { migrateLocalStorage } from '../migrateLocalStorage';

// ── localStorage mock (jsdom doesn't support it for opaque origins) ──

let store: Record<string, string> = {};

const localStorageMock = {
  getItem: vi.fn((key: string) => store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
  removeItem: vi.fn((key: string) => { delete store[key]; }),
  clear: vi.fn(() => { store = {}; }),
  get length() { return Object.keys(store).length; },
  key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
};

describe('migrateLocalStorage', () => {
  beforeEach(() => {
    store = {};
    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
      writable: true,
      configurable: true,
    });
    vi.clearAllMocks();
  });

  it('copies old key to new key when new key does not exist', () => {
    localStorage.setItem('ai-crew-token', 'my-secret');
    migrateLocalStorage();
    expect(localStorage.getItem('flightdeck-token')).toBe('my-secret');
  });

  it('does not overwrite new key if it already exists', () => {
    localStorage.setItem('ai-crew-token', 'old-value');
    localStorage.setItem('flightdeck-token', 'new-value');
    migrateLocalStorage();
    expect(localStorage.getItem('flightdeck-token')).toBe('new-value');
  });

  it('preserves old keys after migration', () => {
    localStorage.setItem('ai-crew-sound-enabled', 'true');
    migrateLocalStorage();
    expect(localStorage.getItem('ai-crew-sound-enabled')).toBe('true');
    expect(localStorage.getItem('flightdeck-sound-enabled')).toBe('true');
  });

  it('migrates all known keys', () => {
    localStorage.setItem('ai-crew-token', 't');
    localStorage.setItem('ai-crew-sound-enabled', 'true');
    localStorage.setItem('ai-crew-sidebar-tabs', '["team","comms"]');
    migrateLocalStorage();
    expect(localStorage.getItem('flightdeck-token')).toBe('t');
    expect(localStorage.getItem('flightdeck-sound-enabled')).toBe('true');
    expect(localStorage.getItem('flightdeck-sidebar-tabs')).toBe('["team","comms"]');
  });

  it('does nothing when no old keys exist', () => {
    migrateLocalStorage();
    expect(localStorage.getItem('flightdeck-token')).toBeNull();
    expect(localStorage.getItem('flightdeck-sound-enabled')).toBeNull();
    expect(localStorage.getItem('flightdeck-sidebar-tabs')).toBeNull();
  });
});
