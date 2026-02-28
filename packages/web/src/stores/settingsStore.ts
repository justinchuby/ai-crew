import { create } from 'zustand';

interface SettingsState {
  soundEnabled: boolean;
  toggleSound: () => void;
  setSoundEnabled: (enabled: boolean) => void;
}

const STORAGE_KEY = 'ai-crew-sound-enabled';

function loadSoundPreference(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export const useSettingsStore = create<SettingsState>((set) => ({
  soundEnabled: loadSoundPreference(),

  toggleSound: () =>
    set((s) => {
      const next = !s.soundEnabled;
      try { localStorage.setItem(STORAGE_KEY, String(next)); } catch {}
      return { soundEnabled: next };
    }),

  setSoundEnabled: (enabled) => {
    try { localStorage.setItem(STORAGE_KEY, String(enabled)); } catch {}
    set({ soundEnabled: enabled });
  },
}));
