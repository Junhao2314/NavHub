import type { StateCreator } from 'zustand';
import type { ThemeMode } from '../../types';
import { THEME_KEY } from '../../utils/constants';
import { safeLocalStorageSetItem } from '../../utils/storage';
import { applyDarkClass, computeDarkMode } from '../helpers/themeHelpers';
import type { AppStore } from '../useAppStore';

export interface ThemeSlice {
  themeMode: ThemeMode;
  darkMode: boolean;
  setThemeAndApply: (mode: ThemeMode) => void;
  applyFromSync: (mode: ThemeMode) => void;
}

export const createThemeSlice: StateCreator<AppStore, [], [], ThemeSlice> = (set, get) => ({
  themeMode: 'system',
  darkMode: false,
  setThemeAndApply: (mode) => {
    const shouldUseDark = computeDarkMode(mode);
    set({ themeMode: mode, darkMode: shouldUseDark });
    safeLocalStorageSetItem(THEME_KEY, mode);
    applyDarkClass(shouldUseDark);
  },
  applyFromSync: (mode) => {
    if (mode !== 'light' && mode !== 'dark' && mode !== 'system') return;
    get().setThemeAndApply(mode);
  },
});
