import type { AIConfig, ExternalSearchSource, SearchConfig, SearchMode } from '../../types';
import {
  AI_API_KEY_SESSION_KEY,
  AI_CONFIG_KEY,
  SEARCH_CONFIG_KEY,
  SITE_SETTINGS_KEY,
} from '../../utils/constants';
import {
  safeLocalStorageGetItem,
  safeLocalStorageRemoveItem,
  safeLocalStorageSetItem,
  safeSessionStorageGetItem,
  safeSessionStorageRemoveItem,
  safeSessionStorageSetItem,
} from '../../utils/storage';
import type { SiteSettings } from '../../types';

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

export const persistAIConfigToStorage = (config: AIConfig): void => {
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


export const loadAIConfigFromStorage = (): AIConfig => {
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

export const loadSiteSettingsFromStorage = (): SiteSettings => {
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
