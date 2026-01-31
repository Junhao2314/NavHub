import * as fc from 'fast-check';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_LANGUAGE,
  LANGUAGE_STORAGE_KEY,
  SUPPORTED_LANGUAGES,
  type SupportedLanguageCode,
} from '../config/i18n';
import { resetAppStore, useAppStore } from './useAppStore';

/**
 * **Validates: Requirements 3.2, 5.4**
 *
 * Property 4: 语言切换同步
 * For any supported language, when calling setLanguage to switch language,
 * the i18next instance's current language should stay in sync with the
 * Zustand store's currentLanguage, and all components using useTranslation
 * should display translations in the new language.
 */

// Create a mock i18next instance that tracks language state
let mockI18nLanguage: string = DEFAULT_LANGUAGE;

vi.mock('i18next', () => ({
  default: {
    get language() {
      return mockI18nLanguage;
    },
    changeLanguage: vi.fn((lng: string) => {
      mockI18nLanguage = lng;
      return Promise.resolve();
    }),
  },
}));

// Import the mocked i18next after mocking
import i18n from 'i18next';

describe('Language Switch Synchronization (Property 4)', () => {
  // Store original localStorage
  let originalLocalStorage: Storage;

  beforeEach(() => {
    // Save original localStorage
    originalLocalStorage = global.localStorage;

    // Create a mock localStorage
    const store: Record<string, string> = {};
    const mockLocalStorage = {
      getItem: vi.fn((key: string) => store[key] ?? null),
      setItem: vi.fn((key: string, value: string) => {
        store[key] = value;
      }),
      removeItem: vi.fn((key: string) => {
        delete store[key];
      }),
      clear: vi.fn(() => {
        for (const key of Object.keys(store)) {
          delete store[key];
        }
      }),
      key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
      get length() {
        return Object.keys(store).length;
      },
    };

    // Replace global localStorage
    Object.defineProperty(global, 'localStorage', {
      value: mockLocalStorage,
      writable: true,
    });

    // Reset the store before each test
    resetAppStore();

    // Reset mock i18n language to default
    mockI18nLanguage = DEFAULT_LANGUAGE;
  });

  afterEach(() => {
    // Restore original localStorage
    Object.defineProperty(global, 'localStorage', {
      value: originalLocalStorage,
      writable: true,
    });

    // Clear all mocks
    vi.clearAllMocks();
  });

  /**
   * Helper to get all supported language codes
   */
  const supportedLanguageCodes = SUPPORTED_LANGUAGES.map(
    (lang) => lang.code,
  ) as SupportedLanguageCode[];

  /**
   * Property-based test: For any supported language, after calling setLanguage,
   * the Zustand store's currentLanguage should equal the locale
   */
  it('should update Zustand store currentLanguage to match the set locale', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...supportedLanguageCodes),
        async (locale: SupportedLanguageCode) => {
          // Reset store to initial state
          resetAppStore();

          // Call setLanguage with the locale
          await act(async () => {
            await useAppStore.getState().setLanguage(locale);
          });

          // Verify the store's currentLanguage equals the locale
          const storeLanguage = useAppStore.getState().currentLanguage;
          expect(storeLanguage).toBe(locale);

          return storeLanguage === locale;
        },
      ),
      { numRuns: 30 },
    );
  });

  /**
   * Property-based test: For any supported language, after calling setLanguage,
   * the i18next instance's language should equal the locale
   */
  it('should update i18next instance language to match the set locale', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...supportedLanguageCodes),
        async (locale: SupportedLanguageCode) => {
          // Reset store to initial state
          resetAppStore();
          i18n.changeLanguage(DEFAULT_LANGUAGE);

          // Call setLanguage with the locale
          await act(async () => {
            await useAppStore.getState().setLanguage(locale);
          });

          // Verify the i18next instance's language equals the locale
          const i18nLanguage = i18n.language;
          expect(i18nLanguage).toBe(locale);

          return i18nLanguage === locale;
        },
      ),
      { numRuns: 30 },
    );
  });

  /**
   * Property-based test: For any supported language, the Zustand store and
   * i18next instance should stay in sync after setLanguage
   */
  it('should keep Zustand store and i18next in sync after setLanguage', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...supportedLanguageCodes),
        async (locale: SupportedLanguageCode) => {
          // Reset store to initial state
          resetAppStore();
          i18n.changeLanguage(DEFAULT_LANGUAGE);

          // Call setLanguage with the locale
          await act(async () => {
            await useAppStore.getState().setLanguage(locale);
          });

          // Verify both are in sync
          const storeLanguage = useAppStore.getState().currentLanguage;
          const i18nLanguage = i18n.language;

          expect(storeLanguage).toBe(i18nLanguage);
          expect(storeLanguage).toBe(locale);
          expect(i18nLanguage).toBe(locale);

          return storeLanguage === i18nLanguage && storeLanguage === locale;
        },
      ),
      { numRuns: 30 },
    );
  });

  /**
   * Property-based test: Multiple language switches should always keep
   * store and i18next in sync
   */
  it('should maintain sync after multiple language switches', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.constantFrom(...supportedLanguageCodes), { minLength: 1, maxLength: 10 }),
        async (locales: SupportedLanguageCode[]) => {
          // Reset store to initial state
          resetAppStore();
          i18n.changeLanguage(DEFAULT_LANGUAGE);

          // Switch languages multiple times
          for (const locale of locales) {
            await act(async () => {
              await useAppStore.getState().setLanguage(locale);
            });

            // Verify sync after each switch
            const storeLanguage = useAppStore.getState().currentLanguage;
            const i18nLanguage = i18n.language;

            expect(storeLanguage).toBe(i18nLanguage);
            expect(storeLanguage).toBe(locale);
          }

          // Final verification
          const lastLocale = locales[locales.length - 1];
          const finalStoreLanguage = useAppStore.getState().currentLanguage;
          const finalI18nLanguage = i18n.language;

          expect(finalStoreLanguage).toBe(lastLocale);
          expect(finalI18nLanguage).toBe(lastLocale);

          return finalStoreLanguage === finalI18nLanguage && finalStoreLanguage === lastLocale;
        },
      ),
      { numRuns: 30 },
    );
  });

  /**
   * Property-based test: Switching to the same language multiple times
   * should be idempotent and maintain sync
   */
  it('should be idempotent when switching to the same language', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...supportedLanguageCodes),
        fc.integer({ min: 1, max: 5 }),
        async (locale: SupportedLanguageCode, times: number) => {
          // Reset store to initial state
          resetAppStore();
          i18n.changeLanguage(DEFAULT_LANGUAGE);

          // Switch to the same language multiple times
          for (let i = 0; i < times; i++) {
            await act(async () => {
              await useAppStore.getState().setLanguage(locale);
            });
          }

          // Verify sync
          const storeLanguage = useAppStore.getState().currentLanguage;
          const i18nLanguage = i18n.language;

          expect(storeLanguage).toBe(locale);
          expect(i18nLanguage).toBe(locale);
          expect(storeLanguage).toBe(i18nLanguage);

          return storeLanguage === i18nLanguage && storeLanguage === locale;
        },
      ),
      { numRuns: 30 },
    );
  });

  /**
   * Deterministic test: Verify each supported language can be set and
   * keeps store and i18next in sync
   */
  it('should sync store and i18next for each supported language', async () => {
    for (const lang of SUPPORTED_LANGUAGES) {
      // Reset store
      resetAppStore();
      i18n.changeLanguage(DEFAULT_LANGUAGE);

      // Set language
      await act(async () => {
        await useAppStore.getState().setLanguage(lang.code);
      });

      // Verify sync
      expect(useAppStore.getState().currentLanguage).toBe(lang.code);
      expect(i18n.language).toBe(lang.code);
    }
  });

  /**
   * Deterministic test: Verify localStorage is also updated in sync
   */
  it('should keep localStorage in sync with store and i18next', async () => {
    for (const lang of SUPPORTED_LANGUAGES) {
      // Reset store
      resetAppStore();
      i18n.changeLanguage(DEFAULT_LANGUAGE);

      // Set language
      await act(async () => {
        await useAppStore.getState().setLanguage(lang.code);
      });

      // Verify all three are in sync
      const storeLanguage = useAppStore.getState().currentLanguage;
      const i18nLanguage = i18n.language;
      const storedLanguage = localStorage.getItem(LANGUAGE_STORAGE_KEY);

      expect(storeLanguage).toBe(lang.code);
      expect(i18nLanguage).toBe(lang.code);
      expect(storedLanguage).toBe(lang.code);
    }
  });

  /**
   * Property-based test: After initLanguage, store and i18next should be in sync
   */
  it('should sync store and i18next after initLanguage', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...supportedLanguageCodes),
        async (locale: SupportedLanguageCode) => {
          // Reset store
          resetAppStore();

          // Set a language first to persist it
          await act(async () => {
            await useAppStore.getState().setLanguage(locale);
          });

          // Reset store (simulating app restart)
          resetAppStore();
          i18n.changeLanguage(DEFAULT_LANGUAGE);

          // Initialize language (should restore from localStorage)
          await act(async () => {
            await useAppStore.getState().initLanguage();
          });

          // Verify sync after initialization
          const storeLanguage = useAppStore.getState().currentLanguage;
          const i18nLanguage = i18n.language;

          expect(storeLanguage).toBe(locale);
          expect(i18nLanguage).toBe(locale);
          expect(storeLanguage).toBe(i18nLanguage);

          return storeLanguage === i18nLanguage && storeLanguage === locale;
        },
      ),
      { numRuns: 30 },
    );
  });
});
