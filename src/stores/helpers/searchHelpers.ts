import type { ExternalSearchSource, SearchConfig, SearchMode } from '../../types';
import { SEARCH_CONFIG_KEY } from '../../utils/constants';
import { safeLocalStorageGetItem, safeLocalStorageRemoveItem } from '../../utils/storage';

export const buildDefaultSearchSources = (): ExternalSearchSource[] => {
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

export const resolveSelectedSource = (
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

export const loadSearchConfigFromStorage = (): {
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
