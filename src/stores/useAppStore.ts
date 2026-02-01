import i18n from 'i18next';
import { create } from 'zustand';
import { DEFAULT_AI_CONFIG, DEFAULT_SITE_SETTINGS } from '../config/defaults';
import {
  DEFAULT_LANGUAGE,
  detectUserLanguage,
  LANGUAGE_STORAGE_KEY,
  loadLanguageResources,
  SUPPORTED_LANGUAGES,
  type SupportedLanguageCode,
} from '../config/i18n';
import type {
  AIConfig,
  Category,
  ExternalSearchSource,
  LinkItem,
  SearchMode,
  SiteSettings,
  ThemeMode,
} from '../types';
import { hideAppLoader, showAppLoader } from '../utils/appLoader';

export type SetStateAction<T> = T | ((prev: T) => T);

const resolveNext = <T>(prev: T, next: SetStateAction<T>): T =>
  typeof next === 'function' ? (next as (p: T) => T)(prev) : next;

const getLoaderTextForLocale = (locale: string): string => {
  return locale.toLowerCase().startsWith('zh') ? '加载中...' : 'Loading...';
};

// Language switching can involve async resource loading and async i18n APIs.
// Keep it deterministic: if users switch rapidly, only the latest selection should win.
let languageChangeSeq = 0;

export interface AppStoreData {
  // Hydration flags (internal)
  __hydratedTheme: boolean;
  __hydratedConfig: boolean;
  __hydratedSearch: boolean;

  // Language
  currentLanguage: SupportedLanguageCode;

  // Theme
  themeMode: ThemeMode;
  isDarkMode: boolean;

  // Config
  aiConfig: AIConfig;
  siteSettings: SiteSettings;

  // Search
  searchQuery: string;
  searchMode: SearchMode;
  externalSearchSources: ExternalSearchSource[];
  selectedSearchSource: ExternalSearchSource | null;
  showSearchSourcePopup: boolean;
  hoveredSearchSource: ExternalSearchSource | null;
  isIconHovered: boolean;
  isPopupHovered: boolean;
  isMobileSearchOpen: boolean;

  // Sidebar
  sidebarOpen: boolean;
  isSidebarCollapsed: boolean;
  selectedCategory: string;

  // Modals
  isModalOpen: boolean;
  isCatManagerOpen: boolean;
  isImportModalOpen: boolean;
  isSettingsModalOpen: boolean;
  isSearchConfigModalOpen: boolean;
  editingLink: LinkItem | undefined;
  prefillLink: Partial<LinkItem> | undefined;
}

export interface AppStoreActions {
  // Hydration flags (internal)
  __setHydratedTheme: (hydrated: boolean) => void;
  __setHydratedConfig: (hydrated: boolean) => void;
  __setHydratedSearch: (hydrated: boolean) => void;

  // Language
  setLanguage: (locale: SupportedLanguageCode) => Promise<void>;
  initLanguage: () => Promise<void>;

  // Theme
  setThemeMode: (next: SetStateAction<ThemeMode>) => void;
  __setIsDarkMode: (dark: boolean) => void;

  // Config
  setAIConfig: (next: SetStateAction<AIConfig>) => void;
  setSiteSettings: (next: SetStateAction<SiteSettings>) => void;

  // Search
  setSearchQuery: (next: SetStateAction<string>) => void;
  setSearchMode: (next: SetStateAction<SearchMode>) => void;
  setExternalSearchSources: (next: SetStateAction<ExternalSearchSource[]>) => void;
  setSelectedSearchSource: (next: SetStateAction<ExternalSearchSource | null>) => void;
  setShowSearchSourcePopup: (next: SetStateAction<boolean>) => void;
  setHoveredSearchSource: (next: SetStateAction<ExternalSearchSource | null>) => void;
  setIsIconHovered: (next: SetStateAction<boolean>) => void;
  setIsPopupHovered: (next: SetStateAction<boolean>) => void;
  setIsMobileSearchOpen: (next: SetStateAction<boolean>) => void;

  // Sidebar
  setSidebarOpen: (next: SetStateAction<boolean>) => void;
  setIsSidebarCollapsed: (next: SetStateAction<boolean>) => void;
  setSelectedCategory: (next: SetStateAction<string>) => void;

  openSidebar: () => void;
  closeSidebar: () => void;
  toggleSidebarCollapsed: () => void;
  selectCategory: (categoryId: string) => void;
  handleCategoryClick: (cat: Category) => void;
  selectAll: () => void;

  // Modals
  setIsModalOpen: (next: SetStateAction<boolean>) => void;
  setIsCatManagerOpen: (next: SetStateAction<boolean>) => void;
  setIsImportModalOpen: (next: SetStateAction<boolean>) => void;
  setIsSettingsModalOpen: (next: SetStateAction<boolean>) => void;
  setIsSearchConfigModalOpen: (next: SetStateAction<boolean>) => void;
  setEditingLink: (next: SetStateAction<LinkItem | undefined>) => void;
  setPrefillLink: (next: SetStateAction<Partial<LinkItem> | undefined>) => void;

  openAddLinkModal: () => void;
  openEditLinkModal: (link: LinkItem) => void;
  closeLinkModal: () => void;
}

export type AppStoreState = AppStoreData & AppStoreActions;

export const createInitialAppStoreData = (): AppStoreData => ({
  __hydratedTheme: false,
  __hydratedConfig: false,
  __hydratedSearch: false,

  currentLanguage: detectUserLanguage(),

  themeMode: 'system',
  isDarkMode: false,

  aiConfig: { ...DEFAULT_AI_CONFIG },
  siteSettings: { ...DEFAULT_SITE_SETTINGS },

  searchQuery: '',
  searchMode: 'external',
  externalSearchSources: [],
  selectedSearchSource: null,
  showSearchSourcePopup: false,
  hoveredSearchSource: null,
  isIconHovered: false,
  isPopupHovered: false,
  isMobileSearchOpen: false,

  sidebarOpen: false,
  isSidebarCollapsed: false,
  selectedCategory: 'all',

  isModalOpen: false,
  isCatManagerOpen: false,
  isImportModalOpen: false,
  isSettingsModalOpen: false,
  isSearchConfigModalOpen: false,
  editingLink: undefined,
  prefillLink: undefined,
});

export const useAppStore = create<AppStoreState>((set, get) => ({
  ...createInitialAppStoreData(),

  __setHydratedTheme: (hydrated) => set({ __hydratedTheme: hydrated }),
  __setHydratedConfig: (hydrated) => set({ __hydratedConfig: hydrated }),
  __setHydratedSearch: (hydrated) => set({ __hydratedSearch: hydrated }),

  setLanguage: async (locale) => {
    const seq = ++languageChangeSeq;

    // Validate that the locale is supported
    const isSupported = SUPPORTED_LANGUAGES.some((lang) => lang.code === locale);
    const validLocale = isSupported ? locale : DEFAULT_LANGUAGE;

    try {
      showAppLoader({ text: getLoaderTextForLocale(validLocale) });

      // Ensure resources are loaded before switching language to avoid a short window
      // where the store says "en-US" but i18n still renders fallback keys/previous language.
      await loadLanguageResources(validLocale);

      // Aborted by a newer request.
      if (seq !== languageChangeSeq) return;

      await i18n.changeLanguage(validLocale);

      // Aborted by a newer request.
      if (seq !== languageChangeSeq) return;
    } catch (error) {
      console.error('Failed to switch language:', error);
      return;
    } finally {
      if (seq === languageChangeSeq) {
        hideAppLoader();
      }
    }

    // Persist to localStorage
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, validLocale);
    } catch {
      // localStorage may not be available (e.g., private browsing mode)
      console.warn('Failed to persist language preference to localStorage');
    }

    // Update store state after i18n is ready to keep UI consistent.
    set({ currentLanguage: validLocale });
  },

  initLanguage: async () => {
    const seq = ++languageChangeSeq;

    // Detect user's preferred language from localStorage or browser settings
    const detectedLanguage = detectUserLanguage();

    try {
      showAppLoader({ text: getLoaderTextForLocale(detectedLanguage) });

      await loadLanguageResources(detectedLanguage);

      if (seq !== languageChangeSeq) return;

      await i18n.changeLanguage(detectedLanguage);

      if (seq !== languageChangeSeq) return;
    } catch (error) {
      console.error('Failed to initialize language:', error);
      return;
    } finally {
      if (seq === languageChangeSeq) {
        hideAppLoader();
      }
    }

    // Update store state
    set({ currentLanguage: detectedLanguage });
  },

  setThemeMode: (next) => set((state) => ({ themeMode: resolveNext(state.themeMode, next) })),
  __setIsDarkMode: (dark) => set({ isDarkMode: dark }),

  setAIConfig: (next) => set((state) => ({ aiConfig: resolveNext(state.aiConfig, next) })),
  setSiteSettings: (next) =>
    set((state) => ({ siteSettings: resolveNext(state.siteSettings, next) })),

  setSearchQuery: (next) => set((state) => ({ searchQuery: resolveNext(state.searchQuery, next) })),
  setSearchMode: (next) => set((state) => ({ searchMode: resolveNext(state.searchMode, next) })),
  setExternalSearchSources: (next) =>
    set((state) => ({ externalSearchSources: resolveNext(state.externalSearchSources, next) })),
  setSelectedSearchSource: (next) =>
    set((state) => ({ selectedSearchSource: resolveNext(state.selectedSearchSource, next) })),
  setShowSearchSourcePopup: (next) =>
    set((state) => ({ showSearchSourcePopup: resolveNext(state.showSearchSourcePopup, next) })),
  setHoveredSearchSource: (next) =>
    set((state) => ({ hoveredSearchSource: resolveNext(state.hoveredSearchSource, next) })),
  setIsIconHovered: (next) =>
    set((state) => ({ isIconHovered: resolveNext(state.isIconHovered, next) })),
  setIsPopupHovered: (next) =>
    set((state) => ({ isPopupHovered: resolveNext(state.isPopupHovered, next) })),
  setIsMobileSearchOpen: (next) =>
    set((state) => ({ isMobileSearchOpen: resolveNext(state.isMobileSearchOpen, next) })),

  setSidebarOpen: (next) => set((state) => ({ sidebarOpen: resolveNext(state.sidebarOpen, next) })),
  setIsSidebarCollapsed: (next) =>
    set((state) => ({ isSidebarCollapsed: resolveNext(state.isSidebarCollapsed, next) })),
  setSelectedCategory: (next) =>
    set((state) => ({ selectedCategory: resolveNext(state.selectedCategory, next) })),

  openSidebar: () => get().setSidebarOpen(true),
  closeSidebar: () => get().setSidebarOpen(false),
  toggleSidebarCollapsed: () => get().setIsSidebarCollapsed((prev) => !prev),
  selectCategory: (categoryId) => {
    get().setSelectedCategory(categoryId);
    get().setSidebarOpen(false);
  },
  handleCategoryClick: (cat) => get().selectCategory(cat.id),
  selectAll: () => get().selectCategory('all'),

  setIsModalOpen: (next) => set((state) => ({ isModalOpen: resolveNext(state.isModalOpen, next) })),
  setIsCatManagerOpen: (next) =>
    set((state) => ({ isCatManagerOpen: resolveNext(state.isCatManagerOpen, next) })),
  setIsImportModalOpen: (next) =>
    set((state) => ({ isImportModalOpen: resolveNext(state.isImportModalOpen, next) })),
  setIsSettingsModalOpen: (next) =>
    set((state) => ({ isSettingsModalOpen: resolveNext(state.isSettingsModalOpen, next) })),
  setIsSearchConfigModalOpen: (next) =>
    set((state) => ({
      isSearchConfigModalOpen: resolveNext(state.isSearchConfigModalOpen, next),
    })),
  setEditingLink: (next) => set((state) => ({ editingLink: resolveNext(state.editingLink, next) })),
  setPrefillLink: (next) => set((state) => ({ prefillLink: resolveNext(state.prefillLink, next) })),

  openAddLinkModal: () =>
    set({
      isModalOpen: true,
      editingLink: undefined,
      prefillLink: undefined,
    }),
  openEditLinkModal: (link) =>
    set({
      isModalOpen: true,
      editingLink: link,
    }),
  closeLinkModal: () =>
    set({
      isModalOpen: false,
      editingLink: undefined,
      prefillLink: undefined,
    }),
}));

export const resetAppStore = (): void => {
  languageChangeSeq = 0;
  useAppStore.setState(createInitialAppStoreData());
};
