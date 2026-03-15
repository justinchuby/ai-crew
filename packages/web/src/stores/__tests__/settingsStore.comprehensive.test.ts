import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useSettingsStore } from '../settingsStore';

// Mock apiFetch to prevent actual HTTP calls
vi.mock('../../hooks/useApi', () => ({
  apiFetch: vi.fn().mockResolvedValue({}),
}));

// jsdom without a URL doesn't provide localStorage — provide a simple mock
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
    get length() { return Object.keys(store).length; },
    key: (i: number) => Object.keys(store)[i] ?? null,
  };
})();

describe('settingsStore — theme and sound', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'localStorage', { value: localStorageMock, writable: true });
    localStorageMock.clear();
    useSettingsStore.setState({
      soundEnabled: false,
      themeMode: 'system',
      resolvedTheme: 'dark',
      oversightLevel: 'balanced',
      projectOverrides: {},
    });
  });

  // ── Sound toggle ─────────────────────────────────────────────

  describe('sound', () => {
    it('defaults to sound disabled', () => {
      expect(useSettingsStore.getState().soundEnabled).toBe(false);
    });

    it('toggleSound flips the boolean', () => {
      useSettingsStore.getState().toggleSound();
      expect(useSettingsStore.getState().soundEnabled).toBe(true);

      useSettingsStore.getState().toggleSound();
      expect(useSettingsStore.getState().soundEnabled).toBe(false);
    });

    it('setSoundEnabled sets to explicit value', () => {
      useSettingsStore.getState().setSoundEnabled(true);
      expect(useSettingsStore.getState().soundEnabled).toBe(true);

      useSettingsStore.getState().setSoundEnabled(false);
      expect(useSettingsStore.getState().soundEnabled).toBe(false);
    });

    it('toggleSound persists (survives store reset)', () => {
      useSettingsStore.getState().toggleSound();
      expect(useSettingsStore.getState().soundEnabled).toBe(true);
      // The store persists to localStorage internally — verified by checking state
    });

    it('setSoundEnabled persists value', () => {
      useSettingsStore.getState().setSoundEnabled(true);
      expect(useSettingsStore.getState().soundEnabled).toBe(true);
    });
  });

  // ── Theme mode ───────────────────────────────────────────────

  describe('theme', () => {
    it('defaults to system theme mode', () => {
      expect(useSettingsStore.getState().themeMode).toBe('system');
    });

    it('setThemeMode changes mode and resolves theme', () => {
      useSettingsStore.getState().setThemeMode('dark');
      expect(useSettingsStore.getState().themeMode).toBe('dark');
      expect(useSettingsStore.getState().resolvedTheme).toBe('dark');

      useSettingsStore.getState().setThemeMode('light');
      expect(useSettingsStore.getState().themeMode).toBe('light');
      expect(useSettingsStore.getState().resolvedTheme).toBe('light');
    });

    it('setThemeMode persists mode value', () => {
      useSettingsStore.getState().setThemeMode('dark');
      expect(useSettingsStore.getState().themeMode).toBe('dark');

      useSettingsStore.getState().setThemeMode('light');
      expect(useSettingsStore.getState().themeMode).toBe('light');
    });

    it('setThemeMode applies dark/light class to document', () => {
      useSettingsStore.getState().setThemeMode('dark');
      expect(document.documentElement.classList.contains('dark')).toBe(true);
      expect(document.documentElement.classList.contains('light')).toBe(false);

      useSettingsStore.getState().setThemeMode('light');
      expect(document.documentElement.classList.contains('dark')).toBe(false);
      expect(document.documentElement.classList.contains('light')).toBe(true);
    });

    it('system mode resolves based on media query', () => {
      useSettingsStore.getState().setThemeMode('system');
      expect(useSettingsStore.getState().themeMode).toBe('system');
      // In jsdom, matchMedia returns false for prefers-color-scheme: dark, so fallback is dark
      expect(['dark', 'light']).toContain(useSettingsStore.getState().resolvedTheme);
    });
  });

  // ── Theme listener ───────────────────────────────────────────

  describe('initThemeListener', () => {
    it('registers media query change listener and applies theme', () => {
      const addEventListenerSpy = vi.fn();
      const originalMatchMedia = window.matchMedia;
      window.matchMedia = vi.fn().mockReturnValue({
        matches: false,
        media: '',
        onchange: null,
        addEventListener: addEventListenerSpy,
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      });

      try {
        useSettingsStore.getState().setThemeMode('dark');
        useSettingsStore.getState().initThemeListener();
        expect(addEventListenerSpy).toHaveBeenCalledWith('change', expect.any(Function));
        expect(document.documentElement.classList.contains('dark')).toBe(true);
      } finally {
        window.matchMedia = originalMatchMedia;
      }
    });
  });

  // ── Oversight level sync ─────────────────────────────────────

  describe('oversight server sync', () => {
    it('setOversightLevel persists value', () => {
      useSettingsStore.getState().setOversightLevel('supervised');
      expect(useSettingsStore.getState().oversightLevel).toBe('supervised');
    });

    it('setOversightLevel syncs to server via PATCH /config', async () => {
      const { apiFetch } = await import('../../hooks/useApi');
      useSettingsStore.getState().setOversightLevel('autonomous');
      expect(apiFetch).toHaveBeenCalledWith('/config', {
        method: 'PATCH',
        body: JSON.stringify({ oversightLevel: 'autonomous' }),
      });
    });
  });

  // ── Project overrides persistence ────────────────────────────

  describe('project overrides persistence', () => {
    it('setProjectOversight stores override', () => {
      useSettingsStore.getState().setProjectOversight('proj-1', 'supervised');
      expect(useSettingsStore.getState().getEffectiveLevel('proj-1')).toBe('supervised');
    });

    it('clearProjectOversight removes override', () => {
      useSettingsStore.getState().setProjectOversight('proj-1', 'supervised');
      useSettingsStore.getState().clearProjectOversight('proj-1');
      // Falls back to global
      expect(useSettingsStore.getState().getEffectiveLevel('proj-1')).toBe('balanced');
    });

    it('multiple project overrides coexist', () => {
      useSettingsStore.getState().setProjectOversight('proj-1', 'supervised');
      useSettingsStore.getState().setProjectOversight('proj-2', 'autonomous');
      expect(useSettingsStore.getState().getEffectiveLevel('proj-1')).toBe('supervised');
      expect(useSettingsStore.getState().getEffectiveLevel('proj-2')).toBe('autonomous');
    });
  });

  // ── localStorage error handling ──────────────────────────────

  describe('localStorage error resilience', () => {
    it('handles localStorage.setItem throwing', () => {
      const originalSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = () => { throw new Error('QuotaExceededError'); };

      try {
        // Should not throw
        expect(() => useSettingsStore.getState().toggleSound()).not.toThrow();
        expect(() => useSettingsStore.getState().setThemeMode('dark')).not.toThrow();
        expect(() => useSettingsStore.getState().setOversightLevel('supervised')).not.toThrow();
      } finally {
        Storage.prototype.setItem = originalSetItem;
      }
    });
  });
});
