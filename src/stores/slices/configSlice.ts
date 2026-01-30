import type { StateCreator } from 'zustand';
import type { AIConfig, SiteSettings } from '../../types';
import { SITE_SETTINGS_KEY } from '../../utils/constants';
import { safeLocalStorageSetItem } from '../../utils/storage';
import { persistAIConfigToStorage } from '../helpers/storageHelpers';
import { applySiteMeta } from '../helpers/themeHelpers';
import type { AppStore } from '../useAppStore';

export interface ConfigSlice {
  aiConfig: AIConfig;
  siteSettings: SiteSettings;
  saveAIConfig: (config: AIConfig, newSiteSettings?: SiteSettings) => void;
  restoreAIConfig: (config: AIConfig) => void;
  restoreSiteSettings: (settings: SiteSettings) => void;
  updateSiteSettings: (updates: Partial<SiteSettings>) => void;
  handleViewModeChange: (cardStyle: 'detailed' | 'simple') => void;
}

export const createConfigSlice: StateCreator<AppStore, [], [], ConfigSlice> = (set, get) => ({
  aiConfig: {
    provider: 'gemini',
    apiKey: '',
    baseUrl: '',
    model: 'gemini-2.5-flash',
  },
  siteSettings: {
    title: 'NavHub - AI 智能导航仪',
    navTitle: 'NavHub',
    favicon: '',
    cardStyle: 'detailed',
    accentColor: '99 102 241',
    grayScale: 'slate',
    closeOnBackdrop: false,
    backgroundImage: '',
    backgroundImageEnabled: false,
    backgroundMotion: true,
  },
  saveAIConfig: (config, newSiteSettings) => {
    set({ aiConfig: config });
    persistAIConfigToStorage(config);
    if (newSiteSettings) {
      set({ siteSettings: newSiteSettings });
      safeLocalStorageSetItem(SITE_SETTINGS_KEY, JSON.stringify(newSiteSettings));
      applySiteMeta(newSiteSettings);
    }
  },
  restoreAIConfig: (config) => {
    set({ aiConfig: config });
    persistAIConfigToStorage(config);
  },
  restoreSiteSettings: (settings) => {
    set({ siteSettings: settings });
    safeLocalStorageSetItem(SITE_SETTINGS_KEY, JSON.stringify(settings));
    applySiteMeta(settings);
  },
  updateSiteSettings: (updates) => {
    set((state) => {
      const nextSettings = { ...state.siteSettings, ...updates };
      safeLocalStorageSetItem(SITE_SETTINGS_KEY, JSON.stringify(nextSettings));
      applySiteMeta(nextSettings);
      return { siteSettings: nextSettings };
    });
  },
  handleViewModeChange: (cardStyle) => {
    get().updateSiteSettings({ cardStyle });
  },
});
