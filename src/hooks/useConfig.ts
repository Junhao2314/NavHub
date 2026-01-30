/**
 * useConfig - AI 配置和站点设置管理
 *
 * 功能:
 *   - 管理 AI 服务配置（provider、apiKey、baseUrl、model）
 *   - 管理站点设置（标题、favicon、主题色、卡片样式等）
 *   - 配置持久化到 localStorage/sessionStorage
 *
 * 安全设计:
 *   - API Key 存储在 sessionStorage（关闭标签页后清除）
 *   - localStorage 中不保存明文 API Key
 *   - 兼容旧版本的 API Key 迁移逻辑
 */

import { useCallback, useEffect, useState } from 'react';
import { AIConfig, SiteSettings } from '../types';
import { AI_API_KEY_SESSION_KEY, AI_CONFIG_KEY, SITE_SETTINGS_KEY } from '../utils/constants';
import {
  safeLocalStorageGetItem,
  safeLocalStorageRemoveItem,
  safeLocalStorageSetItem,
  safeSessionStorageGetItem,
  safeSessionStorageRemoveItem,
  safeSessionStorageSetItem,
} from '../utils/storage';

/** AI 配置默认值 */
const DEFAULT_AI_CONFIG: AIConfig = {
  provider: 'gemini',
  apiKey: '',
  baseUrl: '',
  model: 'gemini-2.5-flash',
};

/** 站点设置默认值 */
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

/**
 * 持久化 AI 配置
 *
 * 安全策略：
 * - API Key 优先存入 sessionStorage（会话级别，关闭标签页后清除）
 * - 如果 sessionStorage 写入失败（如隐私模式），才回退到 localStorage
 * - localStorage 中的 apiKey 字段置空，避免明文泄露
 */
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

export function useConfig() {
  /**
   * AI 配置初始化
   *
   * 加载顺序：
   * 1. 从 sessionStorage 读取 API Key
   * 2. 从 localStorage 读取其他配置
   * 3. 处理旧版本的 API Key 迁移（localStorage → sessionStorage）
   */
  const [aiConfig, setAiConfig] = useState<AIConfig>(() => {
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
        console.warn('[useConfig] Failed to parse AI config from localStorage; resetting.', error);
        safeLocalStorageRemoveItem(AI_CONFIG_KEY);
      }
    }
    return { ...DEFAULT_AI_CONFIG, apiKey: sessionApiKey };
  });

  /** 站点设置初始化 */
  const [siteSettings, setSiteSettings] = useState<SiteSettings>(() => {
    const saved = safeLocalStorageGetItem(SITE_SETTINGS_KEY);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (error) {
        console.warn(
          '[useConfig] Failed to parse site settings from localStorage; resetting.',
          error,
        );
        safeLocalStorageRemoveItem(SITE_SETTINGS_KEY);
      }
    }
    return DEFAULT_SITE_SETTINGS;
  });

  /** 保存 AI 配置（可同时更新站点设置） */
  const saveAIConfig = useCallback((config: AIConfig, newSiteSettings?: SiteSettings) => {
    setAiConfig(config);
    persistAIConfigToStorage(config);

    if (newSiteSettings) {
      setSiteSettings(newSiteSettings);
      safeLocalStorageSetItem(SITE_SETTINGS_KEY, JSON.stringify(newSiteSettings));
    }
  }, []);

  /** 从云端同步恢复 AI 配置 */
  const restoreAIConfig = useCallback((config: AIConfig) => {
    setAiConfig(config);
    persistAIConfigToStorage(config);
  }, []);

  /** 从云端同步恢复站点设置 */
  const restoreSiteSettings = useCallback((settings: SiteSettings) => {
    setSiteSettings(settings);
    safeLocalStorageSetItem(SITE_SETTINGS_KEY, JSON.stringify(settings));
  }, []);

  /** 部分更新站点设置 */
  const updateSiteSettings = useCallback((updates: Partial<SiteSettings>) => {
    setSiteSettings((prev) => {
      const newSettings = { ...prev, ...updates };
      safeLocalStorageSetItem(SITE_SETTINGS_KEY, JSON.stringify(newSettings));
      return newSettings;
    });
  }, []);

  /** 切换卡片显示样式（详细/简洁） */
  const handleViewModeChange = useCallback(
    (cardStyle: 'detailed' | 'simple') => {
      updateSiteSettings({ cardStyle });
    },
    [updateSiteSettings],
  );

  /**
   * 站点设置变更时更新页面元信息
   *
   * - 更新 document.title
   * - 更新 favicon（移除旧的，添加新的）
   */
  useEffect(() => {
    if (siteSettings.title) {
      document.title = siteSettings.title;
    }

    if (siteSettings.favicon) {
      const existingFavicons = document.querySelectorAll('link[rel="icon"]');
      existingFavicons.forEach((favicon) => favicon.remove());

      const favicon = document.createElement('link');
      favicon.rel = 'icon';
      favicon.href = siteSettings.favicon;
      document.head.appendChild(favicon);
    }
  }, [siteSettings.title, siteSettings.favicon]);

  // ========== 派生值 ==========
  /** 导航栏标题（完整） */
  const navTitleText = siteSettings.navTitle || 'NavHub';
  /** 导航栏标题（缩写，用于移动端） */
  const navTitleShort = navTitleText.slice(0, 2);

  return {
    // AI Config
    aiConfig,
    saveAIConfig,
    restoreAIConfig,

    // Site Settings
    siteSettings,
    updateSiteSettings,
    restoreSiteSettings,
    handleViewModeChange,

    // Derived
    navTitleText,
    navTitleShort,
  };
}
