import type { StateCreator } from 'zustand';
import type { ExternalSearchSource, SearchConfig, SearchMode } from '../../types';
import { SEARCH_CONFIG_KEY } from '../../utils/constants';
import { safeLocalStorageSetItem } from '../../utils/storage';
import { normalizeHttpUrl } from '../../utils/url';
import { buildDefaultSearchSources, resolveSelectedSource } from '../helpers/searchHelpers';
import type { AppStore } from '../useAppStore';

export interface SearchSlice {
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
}

export const createSearchSlice: StateCreator<AppStore, [], [], SearchSlice> = (set, get) => {
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
    searchQuery: '',
    setSearchQuery: (value) => set({ searchQuery: value }),
    searchMode: 'external',
    externalSearchSources: [],
    selectedSearchSource: null,
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
  };
};
