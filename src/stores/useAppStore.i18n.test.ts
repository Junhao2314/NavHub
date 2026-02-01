import * as fc from 'fast-check';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LANGUAGE_STORAGE_KEY,
  SUPPORTED_LANGUAGES,
  type SupportedLanguageCode,
} from '../config/i18n';
import { resetAppStore, useAppStore } from './useAppStore';

/**
 * **Validates: Requirements 3.3, 5.3**
 *
 * Property 5: 语言设置持久化往返
 * For any supported language setting, after setting the language and persisting
 * to localStorage, then re-initializing the app, the previous language setting
 * should be correctly restored.
 */

// Mock i18next to avoid side effects during testing
vi.mock('i18next', () => ({
  default: {
    changeLanguage: vi.fn().mockResolvedValue(undefined),
  },
}));

describe('Language Persistence Round-Trip (Property 5)', () => {
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
   * Property-based test: For any supported language, setting and then
   * re-initializing should restore the same language
   */
  it('should persist and restore any supported language correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...supportedLanguageCodes),
        async (locale: SupportedLanguageCode) => {
          // Reset store to initial state
          resetAppStore();

          // Step 1: Set the language
          await act(async () => {
            await useAppStore.getState().setLanguage(locale);
          });

          // Step 2: Verify the language is set in the store
          const storeLanguageAfterSet = useAppStore.getState().currentLanguage;
          expect(storeLanguageAfterSet).toBe(locale);

          // Step 3: Verify the language is persisted to localStorage
          const storedLanguage = localStorage.getItem(LANGUAGE_STORAGE_KEY);
          expect(storedLanguage).toBe(locale);

          // Step 4: Simulate app restart by resetting the store
          resetAppStore();

          // Step 5: Verify store reads persisted language on boot
          const storeLanguageAfterReset = useAppStore.getState().currentLanguage;
          expect(storeLanguageAfterReset).toBe(locale);

          // Step 6: Re-initialize the language (simulating app startup)
          await act(async () => {
            await useAppStore.getState().initLanguage();
          });

          // Step 7: Verify the language is correctly restored
          const restoredLanguage = useAppStore.getState().currentLanguage;
          expect(restoredLanguage).toBe(locale);

          return restoredLanguage === locale;
        },
      ),
      { numRuns: 30 },
    );
  });

  /**
   * Property-based test: Multiple language changes should always persist
   * the last set language
   */
  it('should persist the last set language after multiple changes', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.constantFrom(...supportedLanguageCodes), { minLength: 1, maxLength: 10 }),
        async (locales: SupportedLanguageCode[]) => {
          // Reset store to initial state
          resetAppStore();

          // Set multiple languages in sequence
          for (const locale of locales) {
            await act(async () => {
              await useAppStore.getState().setLanguage(locale);
            });
          }

          // The last language should be persisted
          const lastLocale = locales[locales.length - 1];
          const storedLanguage = localStorage.getItem(LANGUAGE_STORAGE_KEY);
          expect(storedLanguage).toBe(lastLocale);

          // Simulate app restart
          resetAppStore();

          // Re-initialize (should keep persisted language)
          await act(async () => {
            await useAppStore.getState().initLanguage();
          });

          // Verify the last language is restored
          const restoredLanguage = useAppStore.getState().currentLanguage;
          expect(restoredLanguage).toBe(lastLocale);

          return restoredLanguage === lastLocale;
        },
      ),
      { numRuns: 30 },
    );
  });

  /**
   * Property-based test: Setting the same language multiple times should
   * be idempotent
   */
  it('should be idempotent when setting the same language multiple times', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...supportedLanguageCodes),
        fc.integer({ min: 1, max: 5 }),
        async (locale: SupportedLanguageCode, times: number) => {
          // Reset store to initial state
          resetAppStore();

          // Set the same language multiple times
          for (let i = 0; i < times; i++) {
            await act(async () => {
              await useAppStore.getState().setLanguage(locale);
            });
          }

          // Verify the language is correctly set
          const storeLanguage = useAppStore.getState().currentLanguage;
          expect(storeLanguage).toBe(locale);

          // Verify localStorage has the correct value
          const storedLanguage = localStorage.getItem(LANGUAGE_STORAGE_KEY);
          expect(storedLanguage).toBe(locale);

          // Simulate app restart and re-initialize
          resetAppStore();
          await act(async () => {
            await useAppStore.getState().initLanguage();
          });

          // Verify restoration
          const restoredLanguage = useAppStore.getState().currentLanguage;
          expect(restoredLanguage).toBe(locale);

          return restoredLanguage === locale;
        },
      ),
      { numRuns: 30 },
    );
  });

  /**
   * Deterministic test: Verify each supported language can be persisted
   * and restored
   */
  it('should persist and restore each supported language', async () => {
    for (const lang of SUPPORTED_LANGUAGES) {
      // Reset store
      resetAppStore();

      // Set language
      await act(async () => {
        await useAppStore.getState().setLanguage(lang.code);
      });

      // Verify persistence
      expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe(lang.code);

      // Simulate restart
      resetAppStore();
      await act(async () => {
        await useAppStore.getState().initLanguage();
      });

      // Verify restoration
      expect(useAppStore.getState().currentLanguage).toBe(lang.code);
    }
  });

  /**
   * Deterministic test: Verify store and localStorage stay in sync
   */
  it('should keep store and localStorage in sync after setLanguage', async () => {
    for (const lang of SUPPORTED_LANGUAGES) {
      resetAppStore();

      await act(async () => {
        await useAppStore.getState().setLanguage(lang.code);
      });

      const storeValue = useAppStore.getState().currentLanguage;
      const storageValue = localStorage.getItem(LANGUAGE_STORAGE_KEY);

      expect(storeValue).toBe(storageValue);
    }
  });
});
