/**
 * useSearch - 搜索功能管理
 *
 * 功能:
 *   - 支持两种搜索模式：外部搜索引擎（external）和本地链接过滤（local）
 *   - 管理多个外部搜索源（必应、Google、百度等）
 *   - 搜索源选择和切换
 *   - 移动端搜索适配
 *
 * 设计要点:
 *   - 搜索配置持久化到 localStorage
 *   - 搜索源支持自定义添加/编辑/删除
 *   - 搜索源弹窗使用延迟隐藏，提升交互体验
 */

import { useCallback, useEffect, useRef } from 'react';
import { buildDefaultSearchSources } from '../config/defaults';
import { detectUserLanguage } from '../config/i18n';
import { useAppStore } from '../stores/useAppStore';
import { ExternalSearchSource, SearchConfig, SearchMode } from '../types';
import { SEARCH_CONFIG_KEY } from '../utils/constants';
import {
  safeLocalStorageGetItem,
  safeLocalStorageRemoveItem,
  safeLocalStorageSetItem,
} from '../utils/storage';
import { normalizeHttpUrl } from '../utils/url';

/**
 * 解析当前选中的搜索源
 *
 * 优先级：selectedId > selectedSource > 第一个启用的源 > 第一个源
 * 确保始终有一个有效的选中项。
 */
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

export function useSearch() {
  // ========== 状态定义 ==========
  const searchQuery = useAppStore((s) => s.searchQuery);
  const setSearchQuery = useAppStore((s) => s.setSearchQuery);
  const searchMode = useAppStore((s) => s.searchMode);
  const setSearchMode = useAppStore((s) => s.setSearchMode);
  const externalSearchSources = useAppStore((s) => s.externalSearchSources);
  const setExternalSearchSources = useAppStore((s) => s.setExternalSearchSources);
  const selectedSearchSource = useAppStore((s) => s.selectedSearchSource);
  const setSelectedSearchSource = useAppStore((s) => s.setSelectedSearchSource);
  const hydrated = useAppStore((s) => s.__hydratedSearch);
  const setHydrated = useAppStore((s) => s.__setHydratedSearch);

  // 搜索源弹窗相关状态
  const showSearchSourcePopup = useAppStore((s) => s.showSearchSourcePopup);
  const setShowSearchSourcePopup = useAppStore((s) => s.setShowSearchSourcePopup);
  const hoveredSearchSource = useAppStore((s) => s.hoveredSearchSource);
  const setHoveredSearchSource = useAppStore((s) => s.setHoveredSearchSource);
  const isIconHovered = useAppStore((s) => s.isIconHovered);
  const setIsIconHovered = useAppStore((s) => s.setIsIconHovered);
  const isPopupHovered = useAppStore((s) => s.isPopupHovered);
  const setIsPopupHovered = useAppStore((s) => s.setIsPopupHovered);

  // 移动端搜索状态
  const isMobileSearchOpen = useAppStore((s) => s.isMobileSearchOpen);
  const setIsMobileSearchOpen = useAppStore((s) => s.setIsMobileSearchOpen);

  // 弹窗延迟隐藏定时器
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  /** 保存搜索配置到 localStorage */
  const saveSearchConfig = useCallback(
    (sources: ExternalSearchSource[], mode: SearchMode, selected?: ExternalSearchSource | null) => {
      const candidate = selected !== undefined ? selected : selectedSearchSource;
      const resolvedSelected = resolveSelectedSource(sources, candidate?.id, candidate);
      const searchConfig: SearchConfig = {
        mode,
        externalSources: sources,
        selectedSource: resolvedSelected,
        selectedSourceId: resolvedSelected?.id,
      };
      setExternalSearchSources(sources);
      setSearchMode(mode);
      setSelectedSearchSource(resolvedSelected);
      safeLocalStorageSetItem(SEARCH_CONFIG_KEY, JSON.stringify(searchConfig));
    },
    [selectedSearchSource, setExternalSearchSources, setSearchMode, setSelectedSearchSource],
  );

  /** 切换搜索模式（外部/本地） */
  const handleSearchModeChange = useCallback(
    (mode: SearchMode) => {
      setSearchMode(mode);
      if (mode === 'external' && externalSearchSources.length === 0) {
        const defaultSources = buildDefaultSearchSources();
        saveSearchConfig(defaultSources, mode, defaultSources[0]);
      } else {
        saveSearchConfig(externalSearchSources, mode);
      }
    },
    [externalSearchSources, saveSearchConfig, setSearchMode],
  );

  /**
   * 选择搜索源并执行搜索
   *
   * 如果搜索框有内容，选择后立即打开新标签页执行搜索。
   */
  const handleSearchSourceSelect = useCallback(
    (source: ExternalSearchSource) => {
      setSelectedSearchSource(source);
      saveSearchConfig(externalSearchSources, searchMode, source);
      if (searchQuery.trim()) {
        const searchUrl = source.url.replace('{query}', encodeURIComponent(searchQuery));
        const safeUrl = normalizeHttpUrl(searchUrl);
        if (safeUrl) {
          window.open(safeUrl, '_blank', 'noopener,noreferrer');
        }
      }
      setShowSearchSourcePopup(false);
      setHoveredSearchSource(null);
    },
    [
      externalSearchSources,
      searchMode,
      searchQuery,
      saveSearchConfig,
      setHoveredSearchSource,
      setSelectedSearchSource,
      setShowSearchSourcePopup,
    ],
  );

  /**
   * 执行外部搜索
   *
   * 使用当前选中的搜索源，将 {query} 占位符替换为搜索词，
   * 在新标签页打开搜索结果。
   */
  const handleExternalSearch = useCallback(() => {
    if (searchQuery.trim() && searchMode === 'external') {
      if (externalSearchSources.length === 0) {
        const defaultSources = buildDefaultSearchSources();
        saveSearchConfig(defaultSources, 'external', defaultSources[0]);
        const searchUrl = defaultSources[0].url.replace('{query}', encodeURIComponent(searchQuery));
        const safeUrl = normalizeHttpUrl(searchUrl);
        if (safeUrl) {
          window.open(safeUrl, '_blank', 'noopener,noreferrer');
        }
        return;
      }

      let source = selectedSearchSource;
      if (!source) {
        const enabledSources = externalSearchSources.filter((s) => s.enabled);
        if (enabledSources.length > 0) {
          source = enabledSources[0];
        }
      }

      if (source) {
        const searchUrl = source.url.replace('{query}', encodeURIComponent(searchQuery));
        const safeUrl = normalizeHttpUrl(searchUrl);
        if (safeUrl) {
          window.open(safeUrl, '_blank', 'noopener,noreferrer');
        }
      }
    }
  }, [searchQuery, searchMode, externalSearchSources, selectedSearchSource, saveSearchConfig]);

  /** 从云端同步恢复搜索配置 */
  const restoreSearchConfig = useCallback(
    (config: SearchConfig) => {
      const sources = config.externalSources || [];
      const resolvedSelected = resolveSelectedSource(
        sources,
        config.selectedSourceId,
        config.selectedSource ?? null,
      );
      saveSearchConfig(sources, config.mode, resolvedSelected);
    },
    [saveSearchConfig],
  );

  /** 切换移动端搜索框显示状态 */
  const toggleMobileSearch = useCallback(() => {
    setIsMobileSearchOpen((prev) => !prev);
    if (searchMode !== 'external') {
      handleSearchModeChange('external');
    }
  }, [handleSearchModeChange, searchMode, setIsMobileSearchOpen]);

  /**
   * 初始化：从 localStorage 加载搜索配置
   *
   * 如果没有保存的配置，使用默认搜索源列表。
   */
  useEffect(() => {
    if (hydrated) return;
    const savedSearchConfig = safeLocalStorageGetItem(SEARCH_CONFIG_KEY);
    if (savedSearchConfig) {
      try {
        const parsed = JSON.parse(savedSearchConfig) as SearchConfig;
        if (parsed?.mode) {
          const locale = detectUserLanguage();
          const legacyLocale = locale.startsWith('zh') ? 'en-US' : 'zh-CN';
          const defaultsById = new Map(
            buildDefaultSearchSources(locale).map((s) => [s.id, s] as const),
          );
          const legacyById = new Map(
            buildDefaultSearchSources(legacyLocale).map((s) => [s.id, s] as const),
          );

          const sources = (parsed.externalSources || []).map((source) => {
            const current = defaultsById.get(source.id);
            const legacy = legacyById.get(source.id);
            if (!current || !legacy) return source;

            // Upgrade only if the user kept the old default label/url.
            const shouldUpgradeName = source.name === legacy.name && current.name !== legacy.name;
            const shouldUpgradeUrl = source.url === legacy.url && current.url !== legacy.url;
            if (!shouldUpgradeName && !shouldUpgradeUrl) return source;

            return {
              ...source,
              name: shouldUpgradeName ? current.name : source.name,
              url: shouldUpgradeUrl ? current.url : source.url,
            };
          });
          const resolvedSelected = resolveSelectedSource(
            sources,
            parsed.selectedSourceId,
            parsed.selectedSource ?? null,
          );
          setSearchMode(parsed.mode);
          setExternalSearchSources(sources);
          setSelectedSearchSource(resolvedSelected);
        }
      } catch (error) {
        console.warn(
          '[useSearch] Failed to parse search config from localStorage; resetting.',
          error,
        );
        safeLocalStorageRemoveItem(SEARCH_CONFIG_KEY);

        const defaultSources = buildDefaultSearchSources();
        setSearchMode('external');
        setExternalSearchSources(defaultSources);
        setSelectedSearchSource(defaultSources[0] || null);
      }
    } else {
      const defaultSources = buildDefaultSearchSources();
      setSearchMode('external');
      setExternalSearchSources(defaultSources);
      setSelectedSearchSource(defaultSources[0] || null);
    }
    setHydrated(true);
  }, [hydrated, setExternalSearchSources, setHydrated, setSearchMode, setSelectedSearchSource]);

  /**
   * 搜索源弹窗显示/隐藏逻辑
   *
   * 使用延迟隐藏（100ms）避免鼠标从图标移动到弹窗时闪烁。
   * 当鼠标在图标或弹窗上时保持显示。
   */
  useEffect(() => {
    if (isIconHovered || isPopupHovered) {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
        hideTimeoutRef.current = null;
      }
      setShowSearchSourcePopup(true);
    } else {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
      hideTimeoutRef.current = setTimeout(() => {
        setShowSearchSourcePopup(false);
        setHoveredSearchSource(null);
      }, 100);
    }

    return () => {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    };
  }, [isIconHovered, isPopupHovered, setHoveredSearchSource, setShowSearchSourcePopup]);

  return {
    searchQuery,
    setSearchQuery,
    searchMode,
    externalSearchSources,
    selectedSearchSource,
    showSearchSourcePopup,
    setShowSearchSourcePopup,
    hoveredSearchSource,
    setHoveredSearchSource,
    isIconHovered,
    setIsIconHovered,
    isPopupHovered,
    setIsPopupHovered,
    isMobileSearchOpen,
    setIsMobileSearchOpen,
    handleSearchModeChange,
    handleSearchSourceSelect,
    handleExternalSearch,
    saveSearchConfig,
    restoreSearchConfig,
    toggleMobileSearch,
  };
}
