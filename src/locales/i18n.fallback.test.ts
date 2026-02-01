import * as fc from 'fast-check';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_LANGUAGE, FALLBACK_LANGUAGE } from '../config/i18n';
import enUS from './en-US.json';
import zhCN from './zh-CN.json';

/**
 * **Validates: Requirements 1.5, 7.5**
 *
 * Property 1: Translation Key Fallback
 * For any translation key that doesn't exist in the current language translation file,
 * the system should fall back to the default language (Chinese) translation.
 * If the default language also doesn't have it, return the key name itself.
 */

type TranslationObject = Record<string, unknown>;

/**
 * Recursively extracts all keys from a nested object.
 * Returns keys in dot notation (e.g., "common.save", "settings.tabs.site")
 */
function getAllKeys(obj: TranslationObject, prefix = ''): string[] {
  const keys: string[] = [];

  for (const key of Object.keys(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    const value = obj[key];

    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      keys.push(...getAllKeys(value as TranslationObject, fullKey));
    } else {
      keys.push(fullKey);
    }
  }

  return keys;
}

/**
 * Gets a value from a nested object using dot notation key
 */
function getNestedValue(obj: TranslationObject, key: string): unknown {
  const parts = key.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || typeof current !== 'object') {
      return undefined;
    }
    current = (current as TranslationObject)[part];
  }

  return current;
}

/**
 * Generates a random translation key that is guaranteed not to exist
 * in any translation file.
 * Uses alphanumeric characters only to avoid i18next special character handling.
 */
const nonExistentKeyArbitrary = fc
  .stringMatching(/^[a-zA-Z][a-zA-Z0-9_]{0,30}$/)
  .filter((key) => {
    // Filter out keys that might accidentally match existing keys
    const allZhKeys = getAllKeys(zhCN as TranslationObject);
    const allEnKeys = getAllKeys(enUS as TranslationObject);
    const allKeys = new Set([...allZhKeys, ...allEnKeys]);
    return !allKeys.has(key) && key.length > 0;
  })
  .map((key) => {
    // Ensure the key has a unique prefix to avoid collisions
    return `__nonexistent_test_key__.${key}`;
  });

/**
 * Generates a random key path with multiple segments
 */
const randomKeyPathArbitrary = fc
  .array(fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_]*$/), { minLength: 1, maxLength: 4 })
  .map((parts) => `__test__.${parts.join('.')}`);

describe('Translation Key Fallback Property Tests', () => {
  /**
   * **Validates: Requirements 1.5, 7.5**
   */

  // Store original i18n state
  let originalLanguage: string;
  let testI18n: typeof i18n;

  beforeAll(async () => {
    // Create a separate i18n instance for testing
    testI18n = i18n.createInstance();

    await testI18n.use(initReactI18next).init({
      lng: 'en-US',
      fallbackLng: FALLBACK_LANGUAGE,
      supportedLngs: ['zh-CN', 'en-US'],
      debug: false,
      interpolation: {
        escapeValue: false,
      },
      resources: {
        'zh-CN': {
          translation: zhCN,
        },
        'en-US': {
          translation: enUS,
        },
      },
      returnEmptyString: false,
      returnNull: false,
      react: {
        useSuspense: false,
      },
    });

    originalLanguage = testI18n.language;
  });

  afterAll(() => {
    // Restore original language if needed
    if (testI18n && originalLanguage) {
      testI18n.changeLanguage(originalLanguage);
    }
  });

  /**
   * Property-based test: For any non-existent translation key,
   * the system should return the key name itself.
   *
   * **Validates: Requirements 1.5, 7.5**
   */
  it('should return key name for non-existent keys in all languages', () => {
    fc.assert(
      fc.property(nonExistentKeyArbitrary, (randomKey: string) => {
        // Test with en-US (non-fallback language)
        testI18n.changeLanguage('en-US');
        const resultEnUS = testI18n.t(randomKey);

        // The key should be returned as-is since it doesn't exist
        expect(resultEnUS).toBe(randomKey);

        // Test with zh-CN (fallback language)
        testI18n.changeLanguage('zh-CN');
        const resultZhCN = testI18n.t(randomKey);

        // The key should be returned as-is since it doesn't exist
        expect(resultZhCN).toBe(randomKey);

        return resultEnUS === randomKey && resultZhCN === randomKey;
      }),
      { numRuns: 30 },
    );
  });

  /**
   * Property-based test: For any random key path structure,
   * non-existent keys should return the key path itself.
   *
   * **Validates: Requirements 1.5, 7.5**
   */
  it('should return key path for non-existent nested keys', () => {
    fc.assert(
      fc.property(randomKeyPathArbitrary, (keyPath: string) => {
        testI18n.changeLanguage('en-US');
        const result = testI18n.t(keyPath);

        // Non-existent key paths should return the key path itself
        expect(result).toBe(keyPath);

        return result === keyPath;
      }),
      { numRuns: 30 },
    );
  });

  /**
   * Property-based test: When a key exists only in the fallback language (zh-CN),
   * it should be used when the current language is en-US.
   *
   * This test simulates the fallback behavior by creating a scenario where
   * a key exists in zh-CN but not in en-US.
   *
   * **Validates: Requirements 1.5, 7.5**
   */
  it('should fall back to default language when key missing in current language', async () => {
    // Create a test i18n instance with a key only in zh-CN
    const testInstance = i18n.createInstance();

    await testInstance.init({
      lng: 'en-US',
      fallbackLng: 'zh-CN',
      supportedLngs: ['zh-CN', 'en-US'],
      debug: false,
      interpolation: {
        escapeValue: false,
      },
      resources: {
        'zh-CN': {
          translation: {
            ...zhCN,
            // Add a test key only in zh-CN
            __fallback_test__: {
              onlyInChinese: '仅在中文中存在',
            },
          },
        },
        'en-US': {
          translation: enUS,
          // Note: __fallback_test__.onlyInChinese is NOT in en-US
        },
      },
      returnEmptyString: false,
      returnNull: false,
    });

    fc.assert(
      fc.property(fc.constant('__fallback_test__.onlyInChinese'), (key: string) => {
        // Set language to en-US
        testInstance.changeLanguage('en-US');

        // The key doesn't exist in en-US, so it should fall back to zh-CN
        const result = testInstance.t(key);

        // Should get the Chinese translation as fallback
        expect(result).toBe('仅在中文中存在');

        return result === '仅在中文中存在';
      }),
      { numRuns: 30 },
    );
  });

  /**
   * Property-based test: For any existing key in both languages,
   * the current language's translation should be used (no fallback needed).
   *
   * **Validates: Requirements 1.5, 7.5**
   */
  it('should use current language translation when key exists', () => {
    const zhCNKeys = getAllKeys(zhCN as TranslationObject);
    const enUSKeys = getAllKeys(enUS as TranslationObject);

    // Get keys that exist in both languages
    const commonKeys = zhCNKeys.filter((key) => enUSKeys.includes(key));

    // Ensure we have common keys to test
    expect(commonKeys.length).toBeGreaterThan(0);

    fc.assert(
      fc.property(fc.constantFrom(...commonKeys), (key: string) => {
        // Test with en-US
        testI18n.changeLanguage('en-US');
        const enResult = testI18n.t(key);
        const expectedEn = getNestedValue(enUS as TranslationObject, key);

        // Should get the English translation
        expect(enResult).toBe(expectedEn);

        // Test with zh-CN
        testI18n.changeLanguage('zh-CN');
        const zhResult = testI18n.t(key);
        const expectedZh = getNestedValue(zhCN as TranslationObject, key);

        // Should get the Chinese translation
        expect(zhResult).toBe(expectedZh);

        return enResult === expectedEn && zhResult === expectedZh;
      }),
      { numRuns: 30 },
    );
  });

  /**
   * Property-based test: Fallback chain should work correctly.
   * When key is missing in current language, check fallback language,
   * if also missing, return the key itself.
   *
   * **Validates: Requirements 1.5, 7.5**
   */
  it('should follow correct fallback chain: current -> fallback -> key', async () => {
    // Create a test instance with controlled resources
    const testInstance = i18n.createInstance();

    await testInstance.init({
      lng: 'en-US',
      fallbackLng: 'zh-CN',
      supportedLngs: ['zh-CN', 'en-US'],
      debug: false,
      interpolation: {
        escapeValue: false,
      },
      resources: {
        'zh-CN': {
          translation: {
            existsInBoth: '两种语言都有',
            onlyInFallback: '仅在回退语言中',
          },
        },
        'en-US': {
          translation: {
            existsInBoth: 'Exists in both',
            // onlyInFallback is NOT here
          },
        },
      },
      returnEmptyString: false,
      returnNull: false,
    });

    fc.assert(
      fc.property(
        fc.constantFrom(
          { key: 'existsInBoth', expectedEn: 'Exists in both', expectedZh: '两种语言都有' },
          { key: 'onlyInFallback', expectedEn: '仅在回退语言中', expectedZh: '仅在回退语言中' },
          { key: 'nonExistent', expectedEn: 'nonExistent', expectedZh: 'nonExistent' },
        ),
        ({ key, expectedEn, expectedZh }) => {
          // Test en-US
          testInstance.changeLanguage('en-US');
          const enResult = testInstance.t(key);
          expect(enResult).toBe(expectedEn);

          // Test zh-CN
          testInstance.changeLanguage('zh-CN');
          const zhResult = testInstance.t(key);
          expect(zhResult).toBe(expectedZh);

          return enResult === expectedEn && zhResult === expectedZh;
        },
      ),
      { numRuns: 30 },
    );
  });

  /**
   * Deterministic test: Verify the default/fallback language is zh-CN
   */
  it('should have zh-CN as the default fallback language', () => {
    expect(DEFAULT_LANGUAGE).toBe('zh-CN');
    expect(FALLBACK_LANGUAGE).toBe('zh-CN');
  });

  /**
   * Deterministic test: Verify fallback behavior with specific known keys
   */
  it('should correctly translate known keys in both languages', () => {
    // Test a few known keys
    const testCases = [
      { key: 'common.save', expectedZh: '保存', expectedEn: 'Save' },
      { key: 'common.cancel', expectedZh: '取消', expectedEn: 'Cancel' },
      { key: 'settings.title', expectedZh: '设置', expectedEn: 'Settings' },
    ];

    for (const { key, expectedZh, expectedEn } of testCases) {
      testI18n.changeLanguage('zh-CN');
      expect(testI18n.t(key)).toBe(expectedZh);

      testI18n.changeLanguage('en-US');
      expect(testI18n.t(key)).toBe(expectedEn);
    }
  });

  /**
   * Deterministic test: Verify non-existent keys return the key itself
   */
  it('should return key name for specific non-existent keys', () => {
    const nonExistentKeys = [
      'this.key.does.not.exist',
      'random_key_12345',
      'deeply.nested.non.existent.key.path',
    ];

    for (const key of nonExistentKeys) {
      testI18n.changeLanguage('en-US');
      expect(testI18n.t(key)).toBe(key);

      testI18n.changeLanguage('zh-CN');
      expect(testI18n.t(key)).toBe(key);
    }
  });
});
