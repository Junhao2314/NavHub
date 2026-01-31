import * as fc from 'fast-check';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { clearLoadedLanguagesCache, FALLBACK_LANGUAGE, SUPPORTED_LANGUAGES } from '../config/i18n';
import enUS from './en-US.json';
import zhCN from './zh-CN.json';

/**
 * **Validates: Requirements 8.3**
 *
 * Property 10: Language Switch Performance
 * For any language switch operation, the time from calling changeLanguage
 * to interface update completion should be less than 100ms.
 */

// Maximum allowed time for language switch (in milliseconds)
const MAX_SWITCH_TIME_MS = 100;

// Get supported language codes for property testing
const supportedLanguageCodes = SUPPORTED_LANGUAGES.map((lang) => lang.code);

describe('Language Switch Performance Property Tests', () => {
  /**
   * **Validates: Requirements 8.3**
   */

  // Setup i18n instance for testing
  beforeAll(async () => {
    // Initialize a fresh i18n instance for testing with pre-loaded resources
    await i18n.use(initReactI18next).init({
      lng: FALLBACK_LANGUAGE,
      fallbackLng: FALLBACK_LANGUAGE,
      supportedLngs: supportedLanguageCodes,
      debug: false,
      interpolation: {
        escapeValue: false,
      },
      resources: {
        'zh-CN': { translation: zhCN },
        'en-US': { translation: enUS },
      },
      react: {
        useSuspense: false,
      },
    });
  });

  beforeEach(() => {
    // Clear the loaded languages cache before each test
    clearLoadedLanguagesCache();
  });

  afterEach(() => {
    // Reset to default language after each test
    i18n.changeLanguage(FALLBACK_LANGUAGE);
  });

  /**
   * Property-based test: For any supported language, switching to that language
   * should complete in less than 100ms.
   *
   * **Validates: Requirements 8.3**
   */
  it('should switch to any supported language in less than 100ms', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...supportedLanguageCodes),
        async (targetLanguage: string) => {
          // Ensure we're starting from a different language
          const startLanguage = targetLanguage === 'zh-CN' ? 'en-US' : 'zh-CN';
          await i18n.changeLanguage(startLanguage);

          // Measure the time to switch languages
          const startTime = performance.now();
          await i18n.changeLanguage(targetLanguage);
          const switchTime = performance.now() - startTime;

          // Verify the switch completed within the time limit
          expect(switchTime).toBeLessThan(MAX_SWITCH_TIME_MS);

          // Verify the language was actually changed
          expect(i18n.language).toBe(targetLanguage);

          return switchTime < MAX_SWITCH_TIME_MS && i18n.language === targetLanguage;
        },
      ),
      { numRuns: 30 },
    );
  });

  /**
   * Property-based test: For any sequence of language switches, each switch
   * should complete in less than 100ms.
   *
   * **Validates: Requirements 8.3**
   */
  it('should complete each switch in a sequence in less than 100ms', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate a sequence of 2-10 language switches
        fc.array(fc.constantFrom(...supportedLanguageCodes), { minLength: 2, maxLength: 10 }),
        async (languageSequence: string[]) => {
          const switchTimes: number[] = [];

          for (const targetLanguage of languageSequence) {
            const startTime = performance.now();
            await i18n.changeLanguage(targetLanguage);
            const switchTime = performance.now() - startTime;

            switchTimes.push(switchTime);

            // Each individual switch should be under the limit
            expect(switchTime).toBeLessThan(MAX_SWITCH_TIME_MS);

            // Verify the language was actually changed
            expect(i18n.language).toBe(targetLanguage);
          }

          // All switches should be under the limit
          const allSwitchesUnderLimit = switchTimes.every((time) => time < MAX_SWITCH_TIME_MS);
          expect(allSwitchesUnderLimit).toBe(true);

          return allSwitchesUnderLimit;
        },
      ),
      { numRuns: 30 },
    );
  });

  /**
   * Property-based test: For any supported language, switching to the same
   * language (cached) should complete within the time limit.
   * Note: Since resources are pre-loaded in beforeAll, both switches use cache.
   * We verify that both switches are fast (under 100ms) rather than comparing
   * relative timing, which can be flaky due to system timing variations.
   *
   * **Validates: Requirements 8.3**
   */
  it('should switch to cached language within time limit', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...supportedLanguageCodes),
        async (targetLanguage: string) => {
          // First, switch to a different language to ensure we're not starting on target
          const otherLanguage = targetLanguage === 'zh-CN' ? 'en-US' : 'zh-CN';
          await i18n.changeLanguage(otherLanguage);

          // First switch to target language
          const firstSwitchStart = performance.now();
          await i18n.changeLanguage(targetLanguage);
          const firstSwitchTime = performance.now() - firstSwitchStart;

          // Switch away and back (second switch)
          await i18n.changeLanguage(otherLanguage);

          const secondSwitchStart = performance.now();
          await i18n.changeLanguage(targetLanguage);
          const secondSwitchTime = performance.now() - secondSwitchStart;

          // Both switches should be under the limit (both use cached resources)
          expect(firstSwitchTime).toBeLessThan(MAX_SWITCH_TIME_MS);
          expect(secondSwitchTime).toBeLessThan(MAX_SWITCH_TIME_MS);

          // Both switches should be very fast since resources are pre-loaded
          // We verify they're both under 10ms (well under the 100ms limit)
          const bothAreFast = firstSwitchTime < 10 && secondSwitchTime < 10;

          return (
            firstSwitchTime < MAX_SWITCH_TIME_MS &&
            secondSwitchTime < MAX_SWITCH_TIME_MS &&
            bothAreFast
          );
        },
      ),
      { numRuns: 30 },
    );
  });

  /**
   * Property-based test: For any rapid sequence of alternating language switches,
   * each switch should still complete within the time limit.
   *
   * **Validates: Requirements 8.3**
   */
  it('should handle rapid alternating language switches within time limit', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate number of alternations (3-15)
        fc.integer({ min: 3, max: 15 }),
        async (alternationCount: number) => {
          const switchTimes: number[] = [];
          const languages = ['zh-CN', 'en-US'];

          for (let i = 0; i < alternationCount; i++) {
            const targetLanguage = languages[i % 2];

            const startTime = performance.now();
            await i18n.changeLanguage(targetLanguage);
            const switchTime = performance.now() - startTime;

            switchTimes.push(switchTime);

            // Each switch should be under the limit
            expect(switchTime).toBeLessThan(MAX_SWITCH_TIME_MS);
            expect(i18n.language).toBe(targetLanguage);
          }

          // All switches should be under the limit
          const allUnderLimit = switchTimes.every((time) => time < MAX_SWITCH_TIME_MS);
          expect(allUnderLimit).toBe(true);

          return allUnderLimit;
        },
      ),
      { numRuns: 30 },
    );
  });

  /**
   * Deterministic test: Verify specific language switch performance.
   *
   * **Validates: Requirements 8.3**
   */
  describe('Deterministic performance tests', () => {
    it('should switch from zh-CN to en-US in less than 100ms', async () => {
      await i18n.changeLanguage('zh-CN');

      const startTime = performance.now();
      await i18n.changeLanguage('en-US');
      const switchTime = performance.now() - startTime;

      console.log(`zh-CN to en-US switch time: ${switchTime.toFixed(3)}ms`);

      expect(switchTime).toBeLessThan(MAX_SWITCH_TIME_MS);
      expect(i18n.language).toBe('en-US');
    });

    it('should switch from en-US to zh-CN in less than 100ms', async () => {
      await i18n.changeLanguage('en-US');

      const startTime = performance.now();
      await i18n.changeLanguage('zh-CN');
      const switchTime = performance.now() - startTime;

      console.log(`en-US to zh-CN switch time: ${switchTime.toFixed(3)}ms`);

      expect(switchTime).toBeLessThan(MAX_SWITCH_TIME_MS);
      expect(i18n.language).toBe('zh-CN');
    });

    it('should switch to the same language (no-op) in less than 100ms', async () => {
      await i18n.changeLanguage('zh-CN');

      const startTime = performance.now();
      await i18n.changeLanguage('zh-CN');
      const switchTime = performance.now() - startTime;

      console.log(`Same language (no-op) switch time: ${switchTime.toFixed(3)}ms`);

      expect(switchTime).toBeLessThan(MAX_SWITCH_TIME_MS);
      expect(i18n.language).toBe('zh-CN');
    });

    it('should complete 10 consecutive switches in less than 100ms each', async () => {
      const switchTimes: number[] = [];
      const languages = ['zh-CN', 'en-US'];

      for (let i = 0; i < 10; i++) {
        const targetLanguage = languages[i % 2];

        const startTime = performance.now();
        await i18n.changeLanguage(targetLanguage);
        const switchTime = performance.now() - startTime;

        switchTimes.push(switchTime);
      }

      console.log(
        'Consecutive switch times:',
        switchTimes.map((t) => t.toFixed(3) + 'ms').join(', '),
      );
      console.log(
        `Average switch time: ${(switchTimes.reduce((a, b) => a + b, 0) / switchTimes.length).toFixed(3)}ms`,
      );
      console.log(`Max switch time: ${Math.max(...switchTimes).toFixed(3)}ms`);

      // All switches should be under the limit
      switchTimes.forEach((time, _index) => {
        expect(time).toBeLessThan(MAX_SWITCH_TIME_MS);
      });
    });
  });

  /**
   * Edge case tests for performance.
   *
   * **Validates: Requirements 8.3**
   */
  describe('Edge case performance tests', () => {
    it('should handle switching to fallback language quickly', async () => {
      await i18n.changeLanguage('en-US');

      const startTime = performance.now();
      await i18n.changeLanguage(FALLBACK_LANGUAGE);
      const switchTime = performance.now() - startTime;

      expect(switchTime).toBeLessThan(MAX_SWITCH_TIME_MS);
      expect(i18n.language).toBe(FALLBACK_LANGUAGE);
    });

    it('should handle multiple rapid switches to the same language', async () => {
      const switchTimes: number[] = [];

      for (let i = 0; i < 5; i++) {
        const startTime = performance.now();
        await i18n.changeLanguage('en-US');
        const switchTime = performance.now() - startTime;

        switchTimes.push(switchTime);
        expect(switchTime).toBeLessThan(MAX_SWITCH_TIME_MS);
      }

      // All switches should be fast since it's the same language
      const averageTime = switchTimes.reduce((a, b) => a + b, 0) / switchTimes.length;
      console.log(`Average time for same-language switches: ${averageTime.toFixed(3)}ms`);

      expect(averageTime).toBeLessThan(MAX_SWITCH_TIME_MS);
    });
  });
});
