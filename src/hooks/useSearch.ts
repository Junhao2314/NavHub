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

import { useCallback, useEffect, useRef, useState } from 'react';
import { ExternalSearchSource, SearchConfig, SearchMode } from '../types';
import { SEARCH_CONFIG_KEY } from '../utils/constants';
import {
  safeLocalStorageGetItem,
  safeLocalStorageRemoveItem,
  safeLocalStorageSetItem,
} from '../utils/storage';
import { normalizeHttpUrl } from '../utils/url';

/**
 * 构建默认搜索源列表
 *
 * 包含常用的搜索引擎和垂直搜索站点，
 * 用户可在设置中自定义添加或禁用。
 */
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
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMode, setSearchMode] = useState<SearchMode>('external');
  const [externalSearchSources, setExternalSearchSources] = useState<ExternalSearchSource[]>([]);
  const [selectedSearchSource, setSelectedSearchSource] = useState<ExternalSearchSource | null>(
    null,
  );

  // 搜索源弹窗相关状态
  const [showSearchSourcePopup, setShowSearchSourcePopup] = useState(false);
  const [hoveredSearchSource, setHoveredSearchSource] = useState<ExternalSearchSource | null>(null);
  const [isIconHovered, setIsIconHovered] = useState(false);
  const [isPopupHovered, setIsPopupHovered] = useState(false);

  // 移动端搜索状态
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);

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
    [selectedSearchSource],
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
    [externalSearchSources, saveSearchConfig],
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
    [externalSearchSources, searchMode, searchQuery, saveSearchConfig],
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
  }, [searchMode, handleSearchModeChange]);

  /**
   * 初始化：从 localStorage 加载搜索配置
   *
   * 如果没有保存的配置，使用默认搜索源列表。
   */
  useEffect(() => {
    const savedSearchConfig = safeLocalStorageGetItem(SEARCH_CONFIG_KEY);
    if (savedSearchConfig) {
      try {
        const parsed = JSON.parse(savedSearchConfig) as SearchConfig;
        if (parsed?.mode) {
          const sources = parsed.externalSources || [];
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
  }, []);

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
  }, [isIconHovered, isPopupHovered]);

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
