import { create } from 'zustand';

import type {
  AIConfig,
  Category,
  ExternalSearchSource,
  LinkItem,
  SearchConfig,
  SearchMode,
  SiteSettings,
  ThemeMode,
} from '../types';
import {
  AI_API_KEY_SESSION_KEY,
  AI_CONFIG_KEY,
  SEARCH_CONFIG_KEY,
  SITE_SETTINGS_KEY,
  THEME_KEY,
} from '../utils/constants';
import {
  safeLocalStorageGetItem,
  safeLocalStorageRemoveItem,
  safeLocalStorageSetItem,
  safeSessionStorageGetItem,
  safeSessionStorageRemoveItem,
  safeSessionStorageSetItem,
} from '../utils/storage';
import { normalizeHttpUrl } from '../utils/url';

const DEFAULT_AI_CONFIG: AIConfig = {
  provider: 'gemini',
  apiKey: '',
  baseUrl: '',
  model: 'gemini-2.5-flash',
};

const DEFAULT_SITE_SETTINGS: SiteSettings = {
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
};

const computeDarkMode = (mode: ThemeMode): boolean => {
  try {
    if (!('matchMedia' in globalThis)) return false;
    const prefersDark = globalThis.matchMedia('(prefers-color-scheme: dark)').matches;
    return mode === 'dark' || (mode === 'system' && prefersDark);
  } catch {
    return false;
  }
};

const applyDarkClass = (darkMode: boolean): void => {
  try {
    const root = globalThis.document?.documentElement;
    if (!root?.classList) return;
    if (darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  } catch {
    // ignore
  }
};

const applySiteMeta = (siteSettings: SiteSettings): void => {
  try {
    if (siteSettings.title) {
      globalThis.document.title = siteSettings.title;
    }

    if (siteSettings.favicon) {
      const existingFavicons = globalThis.document.querySelectorAll('link[rel="icon"]');
      existingFavicons.forEach((favicon) => favicon.remove());

      const favicon = globalThis.document.createElement('link');
      favicon.rel = 'icon';
      favicon.href = siteSettings.favicon;
      globalThis.document.head.appendChild(favicon);
    }
  } catch {
    // ignore
  }
};

const persistAIConfigToStorage = (config: AIConfig): void => {
  let sessionWritten = false;

  if (config.apiKey) {
    sessionWritten = safeSessionStorageSetItem(AI_API_KEY_SESSION_KEY, config.apiKey);
    if (!sessionWritten) {
      safeSessionStorageRemoveItem(AI_API_KEY_SESSION_KEY);
    }
  } else {
    safeSessionStorageRemoveItem(AI_API_KEY_SESSION_KEY);
    sessionWritten = true;
  }

  safeLocalStorageSetItem(
    AI_CONFIG_KEY,
    JSON.stringify({ ...config, apiKey: sessionWritten ? '' : config.apiKey }),
  );
};

const loadAIConfigFromStorage = (): AIConfig => {
  const sessionApiKey = safeSessionStorageGetItem(AI_API_KEY_SESSION_KEY) || '';
  const saved = safeLocalStorageGetItem(AI_CONFIG_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved) as Partial<AIConfig>;
      const legacyApiKey = typeof parsed.apiKey === 'string' ? parsed.apiKey : '';

      if (legacyApiKey) {
        if (sessionApiKey) {
          safeLocalStorageSetItem(AI_CONFIG_KEY, JSON.stringify({ ...parsed, apiKey: '' }));
        } else {
          const written = safeSessionStorageSetItem(AI_API_KEY_SESSION_KEY, legacyApiKey);
          if (written) {
            safeLocalStorageSetItem(AI_CONFIG_KEY, JSON.stringify({ ...parsed, apiKey: '' }));
          }
        }
      }

      return {
        ...DEFAULT_AI_CONFIG,
        ...parsed,
        apiKey: sessionApiKey || legacyApiKey || '',
      } satisfies AIConfig;
    } catch (error) {
      console.warn('[useAppStore] Failed to parse AI config from localStorage; resetting.', error);
      safeLocalStorageRemoveItem(AI_CONFIG_KEY);
    }
  }
  return { ...DEFAULT_AI_CONFIG, apiKey: sessionApiKey };
};

const loadSiteSettingsFromStorage = (): SiteSettings => {
  const saved = safeLocalStorageGetItem(SITE_SETTINGS_KEY);
  if (saved) {
    try {
      return JSON.parse(saved) as SiteSettings;
    } catch (error) {
      console.warn(
        '[useAppStore] Failed to parse site settings from localStorage; resetting.',
        error,
      );
      safeLocalStorageRemoveItem(SITE_SETTINGS_KEY);
    }
  }
  return DEFAULT_SITE_SETTINGS;
};

const buildDefaultSearchSources = (): ExternalSearchSource[] => {
  const now = Date.now();
  return [
    {
      id: 'bing',
      name: '必应',
      url: 'https://www.bing.com/search?q={query}',
      icon: 'Search',
      enabled: true,
      createdAt: now,
    },
    {
      id: 'google',
      name: 'Google',
      url: 'https://www.google.com/search?q={query}',
      icon: 'Search',
      enabled: true,
      createdAt: now,
    },
    {
      id: 'baidu',
      name: '百度',
      url: 'https://www.baidu.com/s?wd={query}',
      icon: 'Globe',
      enabled: true,
      createdAt: now,
    },
    {
      id: 'sogou',
      name: '搜狗',
      url: 'https://www.sogou.com/web?query={query}',
      icon: 'Globe',
      enabled: true,
      createdAt: now,
    },
    {
      id: 'yandex',
      name: 'Yandex',
      url: 'https://yandex.com/search/?text={query}',
      icon: 'Globe',
      enabled: true,
      createdAt: now,
    },
    {
      id: 'github',
      name: 'GitHub',
      url: 'https://github.com/search?q={query}',
      icon: 'Github',
      enabled: true,
      createdAt: now,
    },
    {
      id: 'linuxdo',
      name: 'Linux.do',
      url: 'https://linux.do/search?q={query}',
      icon: 'Terminal',
      enabled: true,
      createdAt: now,
    },
    {
      id: 'bilibili',
      name: 'B站',
      url: 'https://search.bilibili.com/all?keyword={query}',
      icon: 'Play',
      enabled: true,
      createdAt: now,
    },
    {
      id: 'youtube',
      name: 'YouTube',
      url: 'https://www.youtube.com/results?search_query={query}',
      icon: 'Video',
      enabled: true,
      createdAt: now,
    },
    {
      id: 'wikipedia',
      name: '维基',
      url: 'https://zh.wikipedia.org/wiki/Special:Search?search={query}',
      icon: 'BookOpen',
      enabled: true,
      createdAt: now,
    },
  ];
};

const resolveSelectedSource = (
  sources: ExternalSearchSource[],
  selectedId?: string | null,
  selectedSource?: ExternalSearchSource | null,
): ExternalSearchSource | null => {
  if (sources.length === 0) {
    return selectedSource ?? null;
  }
  if (selectedId) {
    const matched = sources.find((source) => source.id === selectedId);
    if (matched) return matched;
  }
  if (selectedSource) {
    const matched = sources.find((source) => source.id === selectedSource.id);
    return matched ?? selectedSource;
  }
  return sources.find((source) => source.enabled) || sources[0] || null;
};

const loadSearchConfigFromStorage = (): {
  mode: SearchMode;
  sources: ExternalSearchSource[];
  selected: ExternalSearchSource | null;
} => {
  const savedSearchConfig = safeLocalStorageGetItem(SEARCH_CONFIG_KEY);
  if (savedSearchConfig) {
    try {
      const parsed = JSON.parse(savedSearchConfig) as SearchConfig;
      if (parsed?.mode) {
        const sources = parsed.externalSources || [];
        const selected = resolveSelectedSource(
          sources,
          parsed.selectedSourceId,
          parsed.selectedSource ?? null,
        );
        return { mode: parsed.mode, sources, selected };
      }
    } catch (error) {
      console.warn(
        '[useAppStore] Failed to parse search config from localStorage; resetting.',
        error,
      );
      safeLocalStorageRemoveItem(SEARCH_CONFIG_KEY);
    }
  }

  const sources = buildDefaultSearchSources();
  return { mode: 'external', sources, selected: sources[0] || null };
};

export interface AppStore {
  // === Theme ===
  themeMode: ThemeMode;
  darkMode: boolean;
  setThemeAndApply: (mode: ThemeMode) => void;
  applyFromSync: (mode: ThemeMode) => void;

  // === Config ===
  aiConfig: AIConfig;
  siteSettings: SiteSettings;
  saveAIConfig: (config: AIConfig, newSiteSettings?: SiteSettings) => void;
  restoreAIConfig: (config: AIConfig) => void;
  restoreSiteSettings: (settings: SiteSettings) => void;
  updateSiteSettings: (updates: Partial<SiteSettings>) => void;
  handleViewModeChange: (cardStyle: 'detailed' | 'simple') => void;

  // === Search ===
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  searchMode: SearchMode;
  externalSearchSources: ExternalSearchSource[];
  selectedSearchSource: ExternalSearchSource | null;
  showSearchSourcePopup: boolean;
  setShowSearchSourcePopup: (value: boolean | ((prev: boolean) => boolean)) => void;
  hoveredSearchSource: ExternalSearchSource | null;
  setHoveredSearchSource: (value: ExternalSearchSource | null) => void;
  isIconHovered: boolean;
  setIsIconHovered: (value: boolean) => void;
  isPopupHovered: boolean;
  setIsPopupHovered: (value: boolean) => void;
  isMobileSearchOpen: boolean;
  setIsMobileSearchOpen: (value: boolean | ((prev: boolean) => boolean)) => void;
  handleSearchModeChange: (mode: SearchMode) => void;
  handleSearchSourceSelect: (source: ExternalSearchSource) => void;
  handleExternalSearch: () => void;
  saveSearchConfig: (
    sources: ExternalSearchSource[],
    mode: SearchMode,
    selected?: ExternalSearchSource | null,
  ) => void;
  restoreSearchConfig: (config: SearchConfig) => void;
  toggleMobileSearch: () => void;

  // === Sidebar ===
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  isSidebarCollapsed: boolean;
  toggleSidebarCollapsed: () => void;
  selectedCategory: string;
  setSelectedCategory: (categoryId: string) => void;
  openSidebar: () => void;
  handleCategoryClick: (cat: Category) => void;
  selectAll: () => void;

  // === Modals ===
  isModalOpen: boolean;
  setIsModalOpen: (open: boolean) => void;
  isCatManagerOpen: boolean;
  setIsCatManagerOpen: (open: boolean) => void;
  isImportModalOpen: boolean;
  setIsImportModalOpen: (open: boolean) => void;
  isSettingsModalOpen: boolean;
  setIsSettingsModalOpen: (open: boolean) => void;
  isSearchConfigModalOpen: boolean;
  setIsSearchConfigModalOpen: (open: boolean) => void;
  editingLink: LinkItem | undefined;
  setEditingLink: (link: LinkItem | undefined) => void;
  prefillLink: Partial<LinkItem> | undefined;
  setPrefillLink: (link: Partial<LinkItem> | undefined) => void;
  openAddLinkModal: () => void;
  openEditLinkModal: (link: LinkItem) => void;
  closeLinkModal: () => void;
}

export const useAppStore = create<AppStore>((set, get) => {
  const storedTheme = safeLocalStorageGetItem(THEME_KEY);
  const initialThemeMode: ThemeMode =
    storedTheme === 'dark' || storedTheme === 'light' || storedTheme === 'system'
      ? storedTheme
      : 'system';
  const initialDarkMode = computeDarkMode(initialThemeMode);
  applyDarkClass(initialDarkMode);

  const initialAIConfig = loadAIConfigFromStorage();
  const initialSiteSettings = loadSiteSettingsFromStorage();
  applySiteMeta(initialSiteSettings);

  const initialSearch = loadSearchConfigFromStorage();

  let hideTimeout: ReturnType<typeof setTimeout> | null = null;
  const clearHideTimeout = () => {
    if (!hideTimeout) return;
    clearTimeout(hideTimeout);
    hideTimeout = null;
  };
  const syncSearchPopupVisibility = () => {
    const { isIconHovered, isPopupHovered } = get();
    if (isIconHovered || isPopupHovered) {
      clearHideTimeout();
      set({ showSearchSourcePopup: true });
      return;
    }
    clearHideTimeout();
    hideTimeout = setTimeout(() => {
      set({ showSearchSourcePopup: false, hoveredSearchSource: null });
    }, 100);
  };

  return {
    // === Theme ===
    themeMode: initialThemeMode,
    darkMode: initialDarkMode,
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

    // === Config ===
    aiConfig: initialAIConfig,
    siteSettings: initialSiteSettings,
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

    // === Search ===
    searchQuery: '',
    setSearchQuery: (value) => set({ searchQuery: value }),
    searchMode: initialSearch.mode,
    externalSearchSources: initialSearch.sources,
    selectedSearchSource: initialSearch.selected,
    showSearchSourcePopup: false,
    setShowSearchSourcePopup: (value) => {
      set((state) => ({
        showSearchSourcePopup:
          typeof value === 'function' ? value(state.showSearchSourcePopup) : value,
      }));
    },
    hoveredSearchSource: null,
    setHoveredSearchSource: (value) => set({ hoveredSearchSource: value }),
    isIconHovered: false,
    setIsIconHovered: (value) => {
      set({ isIconHovered: value });
      syncSearchPopupVisibility();
    },
    isPopupHovered: false,
    setIsPopupHovered: (value) => {
      set({ isPopupHovered: value });
      syncSearchPopupVisibility();
    },
    isMobileSearchOpen: false,
    setIsMobileSearchOpen: (value) => {
      set((state) => ({
        isMobileSearchOpen: typeof value === 'function' ? value(state.isMobileSearchOpen) : value,
      }));
    },
    saveSearchConfig: (sources, mode, selected) => {
      const candidate = selected !== undefined ? selected : get().selectedSearchSource;
      const resolvedSelected = resolveSelectedSource(sources, candidate?.id, candidate);
      const searchConfig: SearchConfig = {
        mode,
        externalSources: sources,
        selectedSource: resolvedSelected,
        selectedSourceId: resolvedSelected?.id,
      };
      set({
        externalSearchSources: sources,
        searchMode: mode,
        selectedSearchSource: resolvedSelected,
      });
      safeLocalStorageSetItem(SEARCH_CONFIG_KEY, JSON.stringify(searchConfig));
    },
    handleSearchModeChange: (mode) => {
      const { externalSearchSources, selectedSearchSource } = get();
      if (mode === 'external' && externalSearchSources.length === 0) {
        const defaultSources = buildDefaultSearchSources();
        get().saveSearchConfig(defaultSources, mode, defaultSources[0]);
        return;
      }
      get().saveSearchConfig(externalSearchSources, mode, selectedSearchSource);
    },
    handleSearchSourceSelect: (source) => {
      const { externalSearchSources, searchMode, searchQuery } = get();
      get().saveSearchConfig(externalSearchSources, searchMode, source);
      if (searchQuery.trim()) {
        const searchUrl = source.url.replace('{query}', encodeURIComponent(searchQuery));
        const safeUrl = normalizeHttpUrl(searchUrl);
        if (safeUrl) {
          globalThis.open?.(safeUrl, '_blank', 'noopener,noreferrer');
        }
      }
      set({ showSearchSourcePopup: false, hoveredSearchSource: null });
    },
    handleExternalSearch: () => {
      const { searchQuery, searchMode, externalSearchSources, selectedSearchSource } = get();
      if (!searchQuery.trim() || searchMode !== 'external') return;

      if (externalSearchSources.length === 0) {
        const defaultSources = buildDefaultSearchSources();
        get().saveSearchConfig(defaultSources, 'external', defaultSources[0]);
        const searchUrl = defaultSources[0]?.url.replace(
          '{query}',
          encodeURIComponent(searchQuery),
        );
        const safeUrl = normalizeHttpUrl(searchUrl ?? '');
        if (safeUrl) {
          globalThis.open?.(safeUrl, '_blank', 'noopener,noreferrer');
        }
        return;
      }

      let source = selectedSearchSource;
      if (!source) {
        const enabledSources = externalSearchSources.filter((s) => s.enabled);
        if (enabledSources.length > 0) {
          source = enabledSources[0] || null;
        }
      }

      if (source) {
        const searchUrl = source.url.replace('{query}', encodeURIComponent(searchQuery));
        const safeUrl = normalizeHttpUrl(searchUrl);
        if (safeUrl) {
          globalThis.open?.(safeUrl, '_blank', 'noopener,noreferrer');
        }
      }
    },
    restoreSearchConfig: (config) => {
      const sources = config.externalSources || [];
      const resolvedSelected = resolveSelectedSource(
        sources,
        config.selectedSourceId,
        config.selectedSource ?? null,
      );
      get().saveSearchConfig(sources, config.mode, resolvedSelected);
    },
    toggleMobileSearch: () => {
      get().setIsMobileSearchOpen((prev) => !prev);
      if (get().searchMode !== 'external') {
        get().handleSearchModeChange('external');
      }
    },

    // === Sidebar ===
    sidebarOpen: false,
    setSidebarOpen: (open) => set({ sidebarOpen: open }),
    isSidebarCollapsed: false,
    toggleSidebarCollapsed: () =>
      set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),
    selectedCategory: 'all',
    setSelectedCategory: (categoryId) => set({ selectedCategory: categoryId }),
    openSidebar: () => set({ sidebarOpen: true }),
    handleCategoryClick: (cat) => set({ selectedCategory: cat.id, sidebarOpen: false }),
    selectAll: () => set({ selectedCategory: 'all', sidebarOpen: false }),

    // === Modals ===
    isModalOpen: false,
    setIsModalOpen: (open) => set({ isModalOpen: open }),
    isCatManagerOpen: false,
    setIsCatManagerOpen: (open) => set({ isCatManagerOpen: open }),
    isImportModalOpen: false,
    setIsImportModalOpen: (open) => set({ isImportModalOpen: open }),
    isSettingsModalOpen: false,
    setIsSettingsModalOpen: (open) => set({ isSettingsModalOpen: open }),
    isSearchConfigModalOpen: false,
    setIsSearchConfigModalOpen: (open) => set({ isSearchConfigModalOpen: open }),
    editingLink: undefined,
    setEditingLink: (link) => set({ editingLink: link }),
    prefillLink: undefined,
    setPrefillLink: (link) => set({ prefillLink: link }),
    openAddLinkModal: () =>
      set({ editingLink: undefined, prefillLink: undefined, isModalOpen: true }),
    openEditLinkModal: (link) => set({ editingLink: link, isModalOpen: true }),
    closeLinkModal: () =>
      set({ isModalOpen: false, editingLink: undefined, prefillLink: undefined }),
  };
});

// Keep system theme changes in sync when user selects "system".
try {
  if ('matchMedia' in globalThis) {
    const mediaQuery = globalThis.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      const { themeMode } = useAppStore.getState();
      if (themeMode !== 'system') return;
      const shouldUseDark = computeDarkMode('system');
      useAppStore.setState({ darkMode: shouldUseDark });
      applyDarkClass(shouldUseDark);
    };

    if ('addEventListener' in mediaQuery) {
      mediaQuery.addEventListener('change', handleChange);
    } else if ('addListener' in mediaQuery) {
      (mediaQuery as any).addListener(handleChange);
    }
  }
} catch {
  // ignore
}
