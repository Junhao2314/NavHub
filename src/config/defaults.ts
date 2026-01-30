import type { AIConfig, ExternalSearchSource, SiteSettings } from '../types';

export const DEFAULT_AI_CONFIG: AIConfig = {
  provider: 'gemini',
  apiKey: '',
  baseUrl: '',
  model: 'gemini-2.5-flash',
};

export const DEFAULT_SITE_SETTINGS: SiteSettings = {
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
