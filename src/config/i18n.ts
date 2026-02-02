import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import enUS from '../locales/en-US.json';
import zhCN from '../locales/zh-CN.json';

/**
 * i18n Configuration
 * Language is configured via VITE_LANGUAGE environment variable.
 * Defaults to 'zh-CN' if not specified.
 */

export type SupportedLanguageCode = 'zh-CN' | 'en-US';

// Get language from environment variable, default to zh-CN
const envLanguage = import.meta.env.VITE_LANGUAGE;
export const APP_LANGUAGE: SupportedLanguageCode = envLanguage === 'en-US' ? 'en-US' : 'zh-CN';

// Pre-loaded resources (no dynamic import needed)
const resources = {
  'zh-CN': { translation: zhCN },
  'en-US': { translation: enUS },
};

/**
 * Initialize i18next synchronously.
 * Language is determined by VITE_LANGUAGE environment variable.
 */
export function initI18n(): typeof i18n {
  i18n.use(initReactI18next).init({
    lng: APP_LANGUAGE,
    fallbackLng: 'zh-CN',
    resources,
    debug: import.meta.env.DEV,
    interpolation: {
      escapeValue: false,
    },
    react: {
      useSuspense: false,
    },
  });

  return i18n;
}

export default i18n;
