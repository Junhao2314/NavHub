/**
 * useI18n Hook
 * 国际化 Hook
 *
 * Encapsulates useTranslation and language switching logic.
 * 封装 useTranslation 和语言切换逻辑。
 *
 * Requirements: 2.3, 5.5
 */

import type { i18n, TFunction } from 'i18next';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { SUPPORTED_LANGUAGES, type SupportedLanguageCode } from '../config/i18n';
import { useAppStore } from '../stores/useAppStore';

/**
 * Language option interface for displaying language choices.
 * 语言选项接口，用于显示语言选择。
 */
export interface LanguageOption {
  code: string;
  name: string;
  nativeName: string;
  flag: string;
}

/**
 * Return type for the useI18n hook.
 * useI18n Hook 的返回类型。
 */
export interface UseI18nReturn {
  /** Translation function / 翻译函数 */
  t: TFunction;
  /** i18next instance / i18next 实例 */
  i18n: i18n;
  /** Current language code / 当前语言代码 */
  currentLanguage: string;
  /** Function to change language / 切换语言的函数 */
  changeLanguage: (locale: string) => Promise<void>;
  /** List of supported languages / 支持的语言列表 */
  supportedLanguages: LanguageOption[];
}

/**
 * Custom hook for internationalization.
 * 国际化自定义 Hook。
 *
 * Provides:
 * - Translation function (t)
 * - i18next instance
 * - Current language
 * - Language change function
 * - List of supported languages
 *
 * @returns {UseI18nReturn} i18n utilities and state
 *
 * @example
 * ```tsx
 * const { t, currentLanguage, changeLanguage, supportedLanguages } = useI18n();
 *
 * // Use translation
 * <h1>{t('common.title')}</h1>
 *
 * // Change language
 * await changeLanguage('en-US');
 *
 * // Display language options
 * {supportedLanguages.map(lang => (
 *   <option key={lang.code} value={lang.code}>
 *     {lang.flag} {lang.nativeName}
 *   </option>
 * ))}
 * ```
 */
export function useI18n(): UseI18nReturn {
  const { t, i18n } = useTranslation();
  const currentLanguage = useAppStore((state) => state.currentLanguage);
  const setLanguage = useAppStore((state) => state.setLanguage);

  /**
   * Changes the current language.
   * 切换当前语言。
   *
   * @param locale - The language code to switch to / 要切换到的语言代码
   * @returns Promise that resolves when language change is complete
   */
  const changeLanguage = useCallback(
    async (locale: string): Promise<void> => {
      await setLanguage(locale as SupportedLanguageCode);
    },
    [setLanguage],
  );

  // Convert SUPPORTED_LANGUAGES to LanguageOption array
  const supportedLanguages: LanguageOption[] = SUPPORTED_LANGUAGES.map((lang) => ({
    code: lang.code,
    name: lang.name,
    nativeName: lang.nativeName,
    flag: lang.flag,
  }));

  return {
    t,
    i18n,
    currentLanguage,
    changeLanguage,
    supportedLanguages,
  };
}
