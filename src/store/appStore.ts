/**
 * Lightweight app-wide state (settings + currently active portfolio + theme).
 *
 * Persistent settings live in IndexedDB (`db.settings`) — this store mirrors
 * the most recently loaded values for fast synchronous access.  Use
 * `setSettings(...)` to update both atomically.
 */
import { create } from 'zustand';
import type { AppSettings } from '../types';
import { getSettingsAsync, saveSettings } from '../lib/db';

export type AppStore = {
  settings: AppSettings;
  activePortfolioId: string | null;
  ready: boolean;
  setSettings: (patch: Partial<AppSettings>) => Promise<void>;
  setActivePortfolioId: (id: string | null) => void;
  bootstrap: () => Promise<void>;
  reset: () => void;
};

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  benchmarkXirr: 7.0,
  currency: 'INR',
  isPro: false,
  onboardingCompleted: false,
};

export const useAppStore = create<AppStore>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  activePortfolioId: null,
  ready: false,

  bootstrap: async () => {
    const s = await getSettingsAsync();
    set({
      settings: s,
      activePortfolioId: s.defaultPortfolioId ?? null,
      ready: true,
    });
    // Make sure the in-DOM class is in sync with whatever the DB persisted
    // (the no-flash script in index.html already did the right thing for
    // first paint, but this covers the case where the DB was just seeded
    // and the inline script read an empty localStorage).
    applyTheme(s.theme);
  },

  setSettings: async (patch) => {
    const merged = { ...get().settings, ...patch };
    set({ settings: merged });
    if (patch.theme) {
      applyTheme(patch.theme);
      try { localStorage.setItem('fv_theme', patch.theme); } catch { /* ignore */ }
    }
    await saveSettings(patch);
  },

  setActivePortfolioId: (id) => set({ activePortfolioId: id }),

  reset: () => set({ settings: DEFAULT_SETTINGS, activePortfolioId: null, ready: false }),
}));

/**
 * Resolve the OS-level dark preference, falling back to light when
 * `matchMedia` is unavailable (very old browsers, SSR, etc).
 */
export function getSystemPrefersDark(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/**
 * Apply the given theme to the document. Pure DOM operation — safe to call
 * from anywhere. Idempotent: calling repeatedly with the same theme is a
 * no-op as far as the user can tell.
 */
export function applyTheme(theme: 'light' | 'dark' | 'system') {
  const root = document.documentElement;
  const isDark = theme === 'dark' || (theme === 'system' && getSystemPrefersDark());
  root.classList.toggle('dark', isDark);
  // Also annotate the root with the resolved theme so CSS can target it
  // independently of the boolean `.dark` class if we ever need to.
  root.dataset.theme = isDark ? 'dark' : 'light';
  root.dataset.themePref = theme;
}
