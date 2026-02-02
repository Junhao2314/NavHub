import type { AIConfig, ExternalSearchSource, SiteSettings } from '../types';
import { APP_LANGUAGE } from './i18n';

export const DEFAULT_AI_CONFIG: AIConfig = {
  provider: 'gemini',
  apiKey: '',
  baseUrl: '',
  model: 'gemini-2.5-flash',
};

const isZhLocale = (locale: string): boolean => locale.toLowerCase().startsWith('zh');

export const buildDefaultSiteSettings = (locale: string = APP_LANGUAGE): SiteSettings => ({
  title: isZhLocale(locale) ? 'NavHub - AI 智能导航仪' : 'NavHub - AI Smart Navigator',
  navTitle: 'NavHub',
  favicon: '',
  cardStyle: 'detailed',
  accentColor: '99 102 241',
  grayScale: 'slate',
  closeOnBackdrop: false,
  backgroundImage: '',
  backgroundImageEnabled: false,
  backgroundMotion: true,
});

export const DEFAULT_SITE_SETTINGS: SiteSettings = buildDefaultSiteSettings();

export const buildDefaultSearchSources = (
  locale: string = APP_LANGUAGE,
): ExternalSearchSource[] => {
  const now = Date.now();
  const isZh = isZhLocale(locale);
  return [
    {
      id: 'bing',
      name: isZh ? '必应' : 'Bing',
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
      name: isZh ? '百度' : 'Baidu',
      url: 'https://www.baidu.com/s?wd={query}',
      icon: 'Globe',
      enabled: true,
      createdAt: now,
    },
    {
      id: 'sogou',
      name: isZh ? '搜狗' : 'Sogou',
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
      name: isZh ? 'B站' : 'Bilibili',
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
      name: isZh ? '维基' : 'Wikipedia',
      url: isZh
        ? 'https://zh.wikipedia.org/wiki/Special:Search?search={query}'
        : 'https://en.wikipedia.org/wiki/Special:Search?search={query}',
      icon: 'BookOpen',
      enabled: true,
      createdAt: now,
    },
  ];
};
