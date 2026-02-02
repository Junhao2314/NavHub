/**
 * useI18n Hook - Simplified i18n hook
 */

import type { i18n as I18nInstance, TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';

import { APP_LANGUAGE } from '../config/i18n';

export interface UseI18nReturn {
  t: TFunction;
  i18n: I18nInstance;
  currentLanguage: string;
}

/**
 * Custom hook for internationalization.
 * Language is fixed at build time via VITE_LANGUAGE.
 */
export function useI18n(): UseI18nReturn {
  const { t, i18n } = useTranslation();

  return {
    t,
    i18n,
    currentLanguage: APP_LANGUAGE,
  };
}
