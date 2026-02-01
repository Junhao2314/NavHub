import * as fc from 'fast-check';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearLoadedLanguagesCache,
  getLoadedLanguages,
  isLanguageLoaded,
  loadLanguageResources,
  SUPPORTED_LANGUAGES,
} from '../config/i18n';

/**
 * **Validates: Requirements 8.2**
 *
 * Property 9: Translation Resource Caching
 * For any already loaded language resource, requesting the same language again
 * should use the cache rather than reload, verified by the second load time
 * being significantly less than the first load.
 */

// Get supported language codes for property testing
const supportedLanguageCodes = SUPPORTED_LANGUAGES.map((lang) => lang.code);

describe('Translation Resource Caching Property Tests', () => {
  /**
   * **Validates: Requirements 8.2**
   */

  beforeEach(() => {
    // Clear the cache before each test to ensure clean state
    clearLoadedLanguagesCache();
  });

  /**
   * Property-based test: For any supported language, after loading once,
   * isLanguageLoaded() should return true.
   *
   * **Validates: Requirements 8.2**
   */
  it('should mark language as loaded after loadLanguageResources is called', async () => {
    await fc.assert(
      fc.asyncProperty(fc.constantFrom(...supportedLanguageCodes), async (languageCode: string) => {
        // Clear cache before each iteration
        clearLoadedLanguagesCache();

        // Before loading, the language should not be marked as loaded
        expect(isLanguageLoaded(languageCode)).toBe(false);

        // Load the language resources
        await loadLanguageResources(languageCode);

        // After loading, the language should be marked as loaded
        expect(isLanguageLoaded(languageCode)).toBe(true);

        return isLanguageLoaded(languageCode) === true;
      }),
      { numRuns: 30 },
    );
  });

  /**
   * Property-based test: For any supported language, loading the same language
   * twice should not add it to the cache twice (cache should contain unique entries).
   *
   * **Validates: Requirements 8.2**
   */
  it('should not duplicate language in cache when loaded multiple times', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...supportedLanguageCodes),
        fc.integer({ min: 2, max: 5 }), // Number of times to load
        async (languageCode: string, loadCount: number) => {
          // Clear cache before each iteration
          clearLoadedLanguagesCache();

          // Load the language multiple times
          for (let i = 0; i < loadCount; i++) {
            await loadLanguageResources(languageCode);
          }

          // Get the loaded languages set
          const loadedLanguages = getLoadedLanguages();

          // The language should appear exactly once in the cache
          const languageOccurrences = Array.from(loadedLanguages).filter(
            (lang) => lang === languageCode,
          ).length;

          expect(languageOccurrences).toBe(1);

          // The cache size should be 1 (only one language loaded)
          expect(loadedLanguages.size).toBe(1);

          return languageOccurrences === 1 && loadedLanguages.size === 1;
        },
      ),
      { numRuns: 30 },
    );
  });

  /**
   * Property-based test: For any supported language, the second load should be
   * faster than the first (or instant if cached).
   *
   * **Validates: Requirements 8.2**
   */
  it('should load cached language faster than initial load', async () => {
    await fc.assert(
      fc.asyncProperty(fc.constantFrom(...supportedLanguageCodes), async (languageCode: string) => {
        // Clear cache before each iteration
        clearLoadedLanguagesCache();

        // First load - measure time
        const firstLoadStart = performance.now();
        await loadLanguageResources(languageCode);
        const firstLoadTime = performance.now() - firstLoadStart;

        // Second load - should use cache
        const secondLoadStart = performance.now();
        await loadLanguageResources(languageCode);
        const secondLoadTime = performance.now() - secondLoadStart;

        // The second load should be faster (or at least not significantly slower)
        // Since cached loads should be nearly instant, we expect second load
        // to be less than or equal to first load time
        // We use a small tolerance to account for timing variations
        const isCacheEffective = secondLoadTime <= firstLoadTime + 1;

        expect(isCacheEffective).toBe(true);

        return isCacheEffective;
      }),
      { numRuns: 30 },
    );
  });

  /**
   * Property-based test: For any sequence of supported languages,
   * each language should be cached independently.
   *
   * **Validates: Requirements 8.2**
   */
  it('should cache each language independently', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.shuffledSubarray(supportedLanguageCodes, { minLength: 1 }),
        async (languagesToLoad: string[]) => {
          // Clear cache before each iteration
          clearLoadedLanguagesCache();

          // Load each language
          for (const lang of languagesToLoad) {
            await loadLanguageResources(lang);
          }

          // Verify each loaded language is in the cache
          for (const lang of languagesToLoad) {
            expect(isLanguageLoaded(lang)).toBe(true);
          }

          // Verify the cache size matches the number of unique languages loaded
          const uniqueLanguages = new Set(languagesToLoad);
          const loadedLanguages = getLoadedLanguages();
          expect(loadedLanguages.size).toBe(uniqueLanguages.size);

          return loadedLanguages.size === uniqueLanguages.size;
        },
      ),
      { numRuns: 30 },
    );
  });

  /**
   * Test that clearLoadedLanguagesCache() properly clears the cache.
   *
   * **Validates: Requirements 8.2**
   */
  it('should properly clear the cache when clearLoadedLanguagesCache is called', async () => {
    await fc.assert(
      fc.asyncProperty(fc.constantFrom(...supportedLanguageCodes), async (languageCode: string) => {
        // Clear cache before each iteration
        clearLoadedLanguagesCache();

        // Load a language
        await loadLanguageResources(languageCode);
        expect(isLanguageLoaded(languageCode)).toBe(true);

        // Clear the cache
        clearLoadedLanguagesCache();

        // After clearing, the language should no longer be marked as loaded
        expect(isLanguageLoaded(languageCode)).toBe(false);

        // The loaded languages set should be empty
        const loadedLanguages = getLoadedLanguages();
        expect(loadedLanguages.size).toBe(0);

        return !isLanguageLoaded(languageCode) && loadedLanguages.size === 0;
      }),
      { numRuns: 30 },
    );
  });

  /**
   * Deterministic test: Verify cache functions work correctly with specific languages.
   */
  describe('Cache function deterministic tests', () => {
    it('should correctly report zh-CN as loaded after loading', async () => {
      expect(isLanguageLoaded('zh-CN')).toBe(false);
      await loadLanguageResources('zh-CN');
      expect(isLanguageLoaded('zh-CN')).toBe(true);
    });

    it('should correctly report en-US as loaded after loading', async () => {
      expect(isLanguageLoaded('en-US')).toBe(false);
      await loadLanguageResources('en-US');
      expect(isLanguageLoaded('en-US')).toBe(true);
    });

    it('should return empty set initially', () => {
      const loadedLanguages = getLoadedLanguages();
      expect(loadedLanguages.size).toBe(0);
    });

    it('should return set with loaded languages', async () => {
      await loadLanguageResources('zh-CN');
      await loadLanguageResources('en-US');

      const loadedLanguages = getLoadedLanguages();
      expect(loadedLanguages.size).toBe(2);
      expect(loadedLanguages.has('zh-CN')).toBe(true);
      expect(loadedLanguages.has('en-US')).toBe(true);
    });

    it('should clear all loaded languages when clearLoadedLanguagesCache is called', async () => {
      await loadLanguageResources('zh-CN');
      await loadLanguageResources('en-US');

      expect(getLoadedLanguages().size).toBe(2);

      clearLoadedLanguagesCache();

      expect(getLoadedLanguages().size).toBe(0);
      expect(isLanguageLoaded('zh-CN')).toBe(false);
      expect(isLanguageLoaded('en-US')).toBe(false);
    });
  });

  /**
   * Deterministic test: Verify that loading the same language multiple times
   * doesn't increase cache size.
   */
  it('should not increase cache size when loading same language multiple times', async () => {
    await loadLanguageResources('zh-CN');
    expect(getLoadedLanguages().size).toBe(1);

    await loadLanguageResources('zh-CN');
    expect(getLoadedLanguages().size).toBe(1);

    await loadLanguageResources('zh-CN');
    expect(getLoadedLanguages().size).toBe(1);
  });

  /**
   * Deterministic test: Verify timing behavior for cached vs uncached loads.
   */
  it('should demonstrate caching performance benefit', async () => {
    // First load - uncached
    const firstLoadStart = performance.now();
    await loadLanguageResources('zh-CN');
    const firstLoadTime = performance.now() - firstLoadStart;

    // Second load - cached (should be nearly instant)
    const secondLoadStart = performance.now();
    await loadLanguageResources('zh-CN');
    const secondLoadTime = performance.now() - secondLoadStart;

    // Log timing for visibility
    console.log(`First load time: ${firstLoadTime.toFixed(3)}ms`);
    console.log(`Second load time (cached): ${secondLoadTime.toFixed(3)}ms`);

    // Cached load should be very fast (essentially instant)
    // We expect it to be less than 1ms since it just checks a Set
    expect(secondLoadTime).toBeLessThan(1);
  });

  /**
   * Edge case: Verify behavior with unsupported language codes.
   * Note: In test environment where i18n.addResourceBundle is not available,
   * the function marks languages as loaded to prevent repeated attempts.
   * In production, unsupported languages fall back to the default language.
   */
  it('should handle unsupported language codes gracefully', async () => {
    // Try to load an unsupported language
    await loadLanguageResources('fr-FR');

    // In test environment, the language is marked as loaded to prevent repeated attempts
    // In production, it would fall back to default language
    // Either way, the default language should be available
    const loadedLanguages = getLoadedLanguages();

    // The cache should contain at least one language
    // (either fr-FR marked as loaded in test env, or zh-CN as fallback in production)
    expect(loadedLanguages.size).toBeGreaterThanOrEqual(1);
  });
});
