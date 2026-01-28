import { useState, useEffect, useCallback } from 'react';
import { AIConfig, SiteSettings } from '../types';
import { AI_API_KEY_SESSION_KEY, AI_CONFIG_KEY, SITE_SETTINGS_KEY } from '../utils/constants';
import {
    safeLocalStorageGetItem,
    safeLocalStorageRemoveItem,
    safeLocalStorageSetItem,
    safeSessionStorageGetItem,
    safeSessionStorageRemoveItem,
    safeSessionStorageSetItem
} from '../utils/storage';

const DEFAULT_AI_CONFIG: AIConfig = {
    provider: 'gemini',
    apiKey: '',
    baseUrl: '',
    model: 'gemini-2.5-flash'
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
    backgroundMotion: true
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
        JSON.stringify({ ...config, apiKey: sessionWritten ? '' : config.apiKey })
    );
};

export function useConfig() {
    // AI Config
    const [aiConfig, setAiConfig] = useState<AIConfig>(() => {
        const sessionApiKey = safeSessionStorageGetItem(AI_API_KEY_SESSION_KEY) || '';
        const saved = safeLocalStorageGetItem(AI_CONFIG_KEY);
        if (saved) {
            try {
                const parsed = JSON.parse(saved) as Partial<AIConfig>;
                const legacyApiKey = typeof parsed.apiKey === 'string' ? parsed.apiKey : '';

                if (legacyApiKey) {
                    if (sessionApiKey) {
                        safeLocalStorageSetItem(
                            AI_CONFIG_KEY,
                            JSON.stringify({ ...parsed, apiKey: '' })
                        );
                    } else {
                        const written = safeSessionStorageSetItem(AI_API_KEY_SESSION_KEY, legacyApiKey);
                        if (written) {
                            safeLocalStorageSetItem(
                                AI_CONFIG_KEY,
                                JSON.stringify({ ...parsed, apiKey: '' })
                            );
                        }
                    }
                }

                return {
                    ...DEFAULT_AI_CONFIG,
                    ...parsed,
                    apiKey: sessionApiKey || legacyApiKey || ''
                } satisfies AIConfig;
            } catch (error) {
                console.warn('[useConfig] Failed to parse AI config from localStorage; resetting.', error);
                safeLocalStorageRemoveItem(AI_CONFIG_KEY);
            }
        }
        return { ...DEFAULT_AI_CONFIG, apiKey: sessionApiKey };
    });

    // Site Settings
    const [siteSettings, setSiteSettings] = useState<SiteSettings>(() => {
        const saved = safeLocalStorageGetItem(SITE_SETTINGS_KEY);
        if (saved) {
            try {
                return JSON.parse(saved);
            } catch (error) {
                console.warn('[useConfig] Failed to parse site settings from localStorage; resetting.', error);
                safeLocalStorageRemoveItem(SITE_SETTINGS_KEY);
            }
        }
        return DEFAULT_SITE_SETTINGS;
    });

    // Save AI config
    const saveAIConfig = useCallback((config: AIConfig, newSiteSettings?: SiteSettings) => {
        setAiConfig(config);
        persistAIConfigToStorage(config);

        if (newSiteSettings) {
            setSiteSettings(newSiteSettings);
            safeLocalStorageSetItem(SITE_SETTINGS_KEY, JSON.stringify(newSiteSettings));
        }
    }, []);

    // Restore AI config (from backup)
    const restoreAIConfig = useCallback((config: AIConfig) => {
        setAiConfig(config);
        persistAIConfigToStorage(config);
    }, []);

    // Restore site settings (from sync)
    const restoreSiteSettings = useCallback((settings: SiteSettings) => {
        setSiteSettings(settings);
        safeLocalStorageSetItem(SITE_SETTINGS_KEY, JSON.stringify(settings));
    }, []);

    // Update site settings (e.g., card style)
    const updateSiteSettings = useCallback((updates: Partial<SiteSettings>) => {
        setSiteSettings(prev => {
            const newSettings = { ...prev, ...updates };
            safeLocalStorageSetItem(SITE_SETTINGS_KEY, JSON.stringify(newSettings));
            return newSettings;
        });
    }, []);

    // Handle view mode change
    const handleViewModeChange = useCallback((cardStyle: 'detailed' | 'simple') => {
        updateSiteSettings({ cardStyle });
    }, [updateSiteSettings]);

    // Update page title and favicon when site settings change
    useEffect(() => {
        if (siteSettings.title) {
            document.title = siteSettings.title;
        }

        if (siteSettings.favicon) {
            const existingFavicons = document.querySelectorAll('link[rel="icon"]');
            existingFavicons.forEach(favicon => favicon.remove());

            const favicon = document.createElement('link');
            favicon.rel = 'icon';
            favicon.href = siteSettings.favicon;
            document.head.appendChild(favicon);
        }
    }, [siteSettings.title, siteSettings.favicon]);

    // Derived values
    const navTitleText = siteSettings.navTitle || 'NavHub';
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
        navTitleShort
    };
}
