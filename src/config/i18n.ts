import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';

/**
 * i18n Configuration
 * Configures i18next instance with language detection, fallback, and interpolation settings.
 * Requirements: 2.2, 3.4, 8.1, 8.2, 8.5
 */

// Supported languages configuration
export const SUPPORTED_LANGUAGES = [
  {
    code: 'zh-CN',
    name: 'Chinese (Simplified)',
    nativeName: '简体中文',
    flag: '🇨🇳',
  },
  {
    code: 'en-US',
    name: 'English (US)',
    nativeName: 'English',
    flag: '🇺🇸',
  },
] as const;

export type SupportedLanguageCode = (typeof SUPPORTED_LANGUAGES)[number]['code'];

// Default and fallback language
export const DEFAULT_LANGUAGE: SupportedLanguageCode = 'zh-CN';
export const FALLBACK_LANGUAGE: SupportedLanguageCode = 'zh-CN';

// localStorage key for persisting language preference
export const LANGUAGE_STORAGE_KEY = 'navhub-language';

/**
 * Track loaded languages for caching
 * Requirements: 8.2 - Cache loaded translation resources
 */
const loadedLanguages = new Set<string>();

/**
 * Load language resources dynamically (lazy loading)
 * Requirements: 8.1, 8.2, 8.5
 *
 * @param lng - Language code to load (e.g., 'zh-CN', 'en-US')
 * @returns Promise that resolves when resources are loaded
 */
export async function loadLanguageResources(lng: string): Promise<void> {
  // Check cache first - avoid re-loading already loaded resources
  if (loadedLanguages.has(lng)) {
    return;
  }

  // Check if i18n.addResourceBundle is available (may not be in test environments)
  if (typeof i18n.addResourceBundle !== 'function') {
    // In test environments or when i18n is not fully initialized,
    // just mark the language as loaded to prevent repeated attempts
    loadedLanguages.add(lng);
    return;
  }

  try {
    // Dynamic import based on language code
    // This enables code splitting and on-demand loading
    let resources: { default: Record<string, unknown> };

    switch (lng) {
      case 'zh-CN':
        resources = await import('../locales/zh-CN.json');
        break;
      case 'en-US':
        resources = await import('../locales/en-US.json');
        break;
      default:
        // For unsupported languages, try to load anyway or fall back
        console.warn(`Unsupported language: ${lng}, falling back to ${DEFAULT_LANGUAGE}`);
        if (!loadedLanguages.has(DEFAULT_LANGUAGE)) {
          await loadLanguageResources(DEFAULT_LANGUAGE);
        }
        return;
    }

    // Add resource bundle to i18next
    i18n.addResourceBundle(lng, 'translation', resources.default, true, true);

    // Mark language as loaded in cache
    loadedLanguages.add(lng);
  } catch (error) {
    console.error(`Failed to load language resources for ${lng}:`, error);

    // Fall back to default language if loading fails
    if (lng !== DEFAULT_LANGUAGE && !loadedLanguages.has(DEFAULT_LANGUAGE)) {
      await loadLanguageResources(DEFAULT_LANGUAGE);
    }
  }
}

/**
 * Check if a language has been loaded (cached)
 * Requirements: 8.2
 *
 * @param lng - Language code to check
 * @returns true if the language resources are already loaded
 */
export function isLanguageLoaded(lng: string): boolean {
  return loadedLanguages.has(lng);
}

/**
 * Get the set of loaded languages (for testing purposes)
 * @returns Set of loaded language codes
 */
export function getLoadedLanguages(): Set<string> {
  return new Set(loadedLanguages);
}

/**
 * Clear the loaded languages cache (for testing purposes)
 */
export function clearLoadedLanguagesCache(): void {
  loadedLanguages.clear();
}

// i18n configuration interface
export interface I18nConfig {
  defaultLanguage: string;
  supportedLanguages: string[];
  fallbackLanguage: string;
  debug: boolean;
  interpolation: {
    escapeValue: boolean;
  };
}

// Configuration object
export const i18nConfig: I18nConfig = {
  defaultLanguage: DEFAULT_LANGUAGE,
  supportedLanguages: SUPPORTED_LANGUAGES.map((lang) => lang.code),
  fallbackLanguage: FALLBACK_LANGUAGE,
  debug: import.meta.env.DEV,
  interpolation: {
    escapeValue: false, // React already escapes values
  },
};

/**
 * Detects user's preferred language from browser settings.
 * Returns the best matching supported language or the default language.
 * Requirements: 3.4
 */
export function detectUserLanguage(): SupportedLanguageCode {
  // Check localStorage first
  try {
    const storedLanguage = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (storedLanguage && i18nConfig.supportedLanguages.includes(storedLanguage)) {
      return storedLanguage as SupportedLanguageCode;
    }
  } catch {
    // localStorage may not be available (e.g., private browsing mode)
  }

  // Check browser language (guard for non-browser environments like tests/SSR)
  try {
    if (typeof navigator !== 'undefined') {
      const browserLanguages = navigator.languages || [navigator.language];

      for (const browserLang of browserLanguages) {
        // Exact match
        if (i18nConfig.supportedLanguages.includes(browserLang)) {
          return browserLang as SupportedLanguageCode;
        }

        // Partial match (e.g., 'zh' matches 'zh-CN', 'en' matches 'en-US')
        const langPrefix = browserLang.split('-')[0];
        const matchedLang = i18nConfig.supportedLanguages.find((supported) =>
          supported.startsWith(langPrefix),
        );
        if (matchedLang) {
          return matchedLang as SupportedLanguageCode;
        }
      }
    }
  } catch {
    // Ignore and fall back to default.
  }

  return DEFAULT_LANGUAGE;
}

/**
 * Initializes the i18next instance with configuration (synchronous).
 * This function should be called once at application startup.
 * Note: This only initializes i18next, resources must be loaded separately.
 * Requirements: 2.2, 3.4
 */
export function initI18n(): typeof i18n {
  i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      // Language settings
      lng: detectUserLanguage(),
      fallbackLng: i18nConfig.fallbackLanguage,
      supportedLngs: i18nConfig.supportedLanguages,

      // Debug mode (only in development)
      debug: i18nConfig.debug,

      // Interpolation settings
      interpolation: {
        escapeValue: i18nConfig.interpolation.escapeValue,
      },

      // Language detection options
      detection: {
        // Order of language detection methods
        order: ['localStorage', 'navigator', 'htmlTag'],
        // Cache user language preference in localStorage
        caches: ['localStorage'],
        // localStorage key
        lookupLocalStorage: LANGUAGE_STORAGE_KEY,
      },

      // Resources will be loaded dynamically via lazy loading
      resources: {},

      // Return key if translation is missing (for development visibility)
      returnEmptyString: false,
      returnNull: false,

      // React specific settings
      react: {
        useSuspense: false,
      },
    });

  return i18n;
}

/**
 * Initializes i18next and loads initial language resources asynchronously.
 * This ensures translations are available before the app renders.
 * Requirements: 2.2, 3.4, 8.1, 8.2, 8.5
 *
 * @returns Promise that resolves when i18n is fully initialized with resources
 */
export async function initI18nAsync(): Promise<typeof i18n> {
  // Initialize i18next instance
  initI18n();

  // Detect the user's preferred language
  const detectedLanguage = detectUserLanguage();

  // Load the detected language resources
  await loadLanguageResources(detectedLanguage);

  // Also preload the fallback language if different from detected
  if (detectedLanguage !== FALLBACK_LANGUAGE) {
    await loadLanguageResources(FALLBACK_LANGUAGE);
  }

  return i18n;
}

// Export the i18n instance for direct access
export default i18n;
