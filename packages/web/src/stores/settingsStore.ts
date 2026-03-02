import { create } from 'zustand';

export type ThemeMode = 'dark' | 'light' | 'system';

interface SettingsState {
  soundEnabled: boolean;
  themeMode: ThemeMode;
  /** The resolved theme actually applied (dark or light) */
  resolvedTheme: 'dark' | 'light';
  toggleSound: () => void;
  setSoundEnabled: (enabled: boolean) => void;
  setThemeMode: (mode: ThemeMode) => void;
  /** Call once on app start to listen for system preference changes */
  initThemeListener: () => void;
}

const SOUND_KEY = 'flightdeck-sound-enabled';
const THEME_KEY = 'theme';

function loadSoundPreference(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) === 'true';
  } catch {
    return false;
  }
}

function loadThemeMode(): ThemeMode {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
  } catch {}
  return 'dark';
}

function resolveTheme(mode: ThemeMode): 'dark' | 'light' {
  if (mode === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return mode;
}

function applyTheme(resolved: 'dark' | 'light') {
  document.documentElement.classList.toggle('dark', resolved === 'dark');
  document.documentElement.classList.toggle('light', resolved === 'light');
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  soundEnabled: loadSoundPreference(),
  themeMode: loadThemeMode(),
  resolvedTheme: resolveTheme(loadThemeMode()),

  toggleSound: () =>
    set((s) => {
      const next = !s.soundEnabled;
      try { localStorage.setItem(SOUND_KEY, String(next)); } catch {}
      return { soundEnabled: next };
    }),

  setSoundEnabled: (enabled) => {
    try { localStorage.setItem(SOUND_KEY, String(enabled)); } catch {}
    set({ soundEnabled: enabled });
  },

  setThemeMode: (mode) => {
    try { localStorage.setItem(THEME_KEY, mode); } catch {}
    const resolved = resolveTheme(mode);
    applyTheme(resolved);
    set({ themeMode: mode, resolvedTheme: resolved });
  },

  initThemeListener: () => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', () => {
      const { themeMode } = get();
      if (themeMode === 'system') {
        const resolved = resolveTheme('system');
        applyTheme(resolved);
        set({ resolvedTheme: resolved });
      }
    });
    // Apply initial theme
    applyTheme(get().resolvedTheme);
  },
}));
