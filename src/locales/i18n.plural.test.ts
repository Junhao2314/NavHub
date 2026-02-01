import * as fc from 'fast-check';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FALLBACK_LANGUAGE } from '../config/i18n';
import enUS from './en-US.json';
import zhCN from './zh-CN.json';

/**
 * **Validates: Requirements 2.5**
 *
 * Property 3: Plural Form Handling
 * For any translation key that supports plural forms and any count value,
 * the system should return the correct plural form based on the count
 * (e.g., 0, 1, many).
 *
 * English uses plural forms with `_one` suffix for count=1 and `_other` suffix
 * for all other counts (0, 2, 3, etc.)
 * Chinese doesn't have grammatical plurals - uses the same form for all counts.
 */

describe('Plural Form Handling Property Tests', () => {
  /**
   * **Validates: Requirements 2.5**
   */

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
  });

  afterAll(() => {
    // Cleanup if needed
  });

  /**
   * Existing plural keys in en-US.json:
   * - modals.category.selectedCount_one: "{{count}} category selected"
   * - modals.category.selectedCount_other: "{{count}} categories selected"
   * - modals.syncConflict.links_one: "{{count}} link"
   * - modals.syncConflict.links_other: "{{count}} links"
   * - modals.syncConflict.categories_one: "{{count}} category"
   * - modals.syncConflict.categories_other: "{{count}} categories"
   * - modals.import.filteredInvalidUrls_one: "Filtered {{count}} link..."
   * - modals.import.filteredInvalidUrls_other: "Filtered {{count}} links..."
   * - settings.ai.bulkGenerateConfirmMessage_one: "Found {{count}} link..."
   * - settings.ai.bulkGenerateConfirmMessage_other: "Found {{count}} links..."
   * - modals.category.batchDeleteConfirmMessage_one: "...delete {{count}} selected category..."
   * - modals.category.batchDeleteConfirmMessage_other: "...delete {{count}} selected categories..."
   */

  /**
   * Property-based test: For count=1, English should use `_one` form (singular).
   *
   * **Validates: Requirements 2.5**
   */
  it('should use singular form (_one) for count=1 in English', () => {
    fc.assert(
      fc.property(fc.constant(1), (count: number) => {
        testI18n.changeLanguage('en-US');

        // Test modals.category.selectedCount
        const selectedCountResult = testI18n.t('modals.category.selectedCount', { count });
        expect(selectedCountResult).toBe('1 category selected');
        expect(selectedCountResult).not.toContain('categories');

        // Test modals.syncConflict.links
        const linksResult = testI18n.t('modals.syncConflict.links', { count });
        expect(linksResult).toBe('1 link');
        expect(linksResult).not.toContain('links');

        // Test modals.syncConflict.categories
        const categoriesResult = testI18n.t('modals.syncConflict.categories', { count });
        expect(categoriesResult).toBe('1 category');
        expect(categoriesResult).not.toContain('categories');

        return true;
      }),
      { numRuns: 30 },
    );
  });

  /**
   * Property-based test: For count!=1 (0, 2, 3, etc.), English should use `_other` form (plural).
   *
   * **Validates: Requirements 2.5**
   */
  it('should use plural form (_other) for count!=1 in English', () => {
    // Generate counts that are NOT 1 (0, 2, 3, 4, ...)
    const nonOneCountArbitrary = fc.integer({ min: 0, max: 10000 }).filter((n) => n !== 1);

    fc.assert(
      fc.property(nonOneCountArbitrary, (count: number) => {
        testI18n.changeLanguage('en-US');

        // Test modals.category.selectedCount
        const selectedCountResult = testI18n.t('modals.category.selectedCount', { count });
        expect(selectedCountResult).toBe(`${count} categories selected`);

        // Test modals.syncConflict.links
        const linksResult = testI18n.t('modals.syncConflict.links', { count });
        expect(linksResult).toBe(`${count} links`);

        // Test modals.syncConflict.categories
        const categoriesResult = testI18n.t('modals.syncConflict.categories', { count });
        expect(categoriesResult).toBe(`${count} categories`);

        return true;
      }),
      { numRuns: 30 },
    );
  });

  /**
   * Property-based test: Chinese should use the same form regardless of count.
   * Chinese doesn't have grammatical plurals.
   *
   * **Validates: Requirements 2.5**
   */
  it('should use the same form for all counts in Chinese (no grammatical plurals)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10000 }), (count: number) => {
        testI18n.changeLanguage('zh-CN');

        // Test modals.category.selectedCount - Chinese uses single form
        const selectedCountResult = testI18n.t('modals.category.selectedCount', { count });
        expect(selectedCountResult).toBe(`已选择 ${count} 个分类`);

        // Test modals.syncConflict.links - Chinese uses single form
        const linksResult = testI18n.t('modals.syncConflict.links', { count });
        expect(linksResult).toBe(`${count} 个链接`);

        // Test modals.syncConflict.categories - Chinese uses single form
        const categoriesResult = testI18n.t('modals.syncConflict.categories', { count });
        expect(categoriesResult).toBe(`${count} 个分类`);

        return true;
      }),
      { numRuns: 30 },
    );
  });

  /**
   * Property-based test: Test various count values with all plural keys.
   * Verifies that the correct plural form is selected based on count.
   *
   * **Validates: Requirements 2.5**
   */
  it('should correctly handle plural forms for all plural keys with various counts', () => {
    // Define all plural keys and their expected patterns
    const pluralKeys = [
      {
        key: 'modals.category.selectedCount',
        singularPattern: (count: number) => `${count} category selected`,
        pluralPattern: (count: number) => `${count} categories selected`,
        zhPattern: (count: number) => `已选择 ${count} 个分类`,
      },
      {
        key: 'modals.syncConflict.links',
        singularPattern: (count: number) => `${count} link`,
        pluralPattern: (count: number) => `${count} links`,
        zhPattern: (count: number) => `${count} 个链接`,
      },
      {
        key: 'modals.syncConflict.categories',
        singularPattern: (count: number) => `${count} category`,
        pluralPattern: (count: number) => `${count} categories`,
        zhPattern: (count: number) => `${count} 个分类`,
      },
    ];

    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10000 }),
        fc.constantFrom(...pluralKeys),
        (count, keyConfig) => {
          // Test English plural forms
          testI18n.changeLanguage('en-US');
          const enResult = testI18n.t(keyConfig.key, { count });

          if (count === 1) {
            expect(enResult).toBe(keyConfig.singularPattern(count));
          } else {
            expect(enResult).toBe(keyConfig.pluralPattern(count));
          }

          // Test Chinese (no plural forms)
          testI18n.changeLanguage('zh-CN');
          const zhResult = testI18n.t(keyConfig.key, { count });
          expect(zhResult).toBe(keyConfig.zhPattern(count));

          return true;
        },
      ),
      { numRuns: 30 },
    );
  });

  /**
   * Property-based test: Edge case - count=0 should use plural form in English.
   *
   * **Validates: Requirements 2.5**
   */
  it('should use plural form (_other) for count=0 in English', () => {
    fc.assert(
      fc.property(fc.constant(0), (count: number) => {
        testI18n.changeLanguage('en-US');

        // Test modals.category.selectedCount
        const selectedCountResult = testI18n.t('modals.category.selectedCount', { count });
        expect(selectedCountResult).toBe('0 categories selected');

        // Test modals.syncConflict.links
        const linksResult = testI18n.t('modals.syncConflict.links', { count });
        expect(linksResult).toBe('0 links');

        // Test modals.syncConflict.categories
        const categoriesResult = testI18n.t('modals.syncConflict.categories', { count });
        expect(categoriesResult).toBe('0 categories');

        return true;
      }),
      { numRuns: 30 },
    );
  });

  /**
   * Property-based test: Large count values should use plural form in English.
   *
   * **Validates: Requirements 2.5**
   */
  it('should use plural form for large count values in English', () => {
    fc.assert(
      fc.property(fc.integer({ min: 100, max: 1000000 }), (count: number) => {
        testI18n.changeLanguage('en-US');

        // Test modals.syncConflict.links
        const linksResult = testI18n.t('modals.syncConflict.links', { count });
        expect(linksResult).toBe(`${count} links`);

        // Test modals.syncConflict.categories
        const categoriesResult = testI18n.t('modals.syncConflict.categories', { count });
        expect(categoriesResult).toBe(`${count} categories`);

        return true;
      }),
      { numRuns: 30 },
    );
  });

  /**
   * Property-based test: Test filteredInvalidUrls plural key.
   *
   * **Validates: Requirements 2.5**
   */
  it('should correctly handle plural forms for filteredInvalidUrls', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10000 }), (count: number) => {
        testI18n.changeLanguage('en-US');
        const enResult = testI18n.t('modals.import.filteredInvalidUrls', { count });

        if (count === 1) {
          expect(enResult).toBe(`Filtered ${count} link with non-http/https or invalid URL.`);
        } else {
          expect(enResult).toBe(`Filtered ${count} links with non-http/https or invalid URLs.`);
        }

        // Chinese uses single form
        testI18n.changeLanguage('zh-CN');
        const zhResult = testI18n.t('modals.import.filteredInvalidUrls', { count });
        expect(zhResult).toBe(`已过滤 ${count} 条非 http/https 或无效 URL 的链接。`);

        return true;
      }),
      { numRuns: 30 },
    );
  });

  /**
   * Property-based test: Test bulkGenerateConfirmMessage plural key.
   *
   * **Validates: Requirements 2.5**
   */
  it('should correctly handle plural forms for bulkGenerateConfirmMessage', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10000 }), (count: number) => {
        testI18n.changeLanguage('en-US');
        const enResult = testI18n.t('settings.ai.bulkGenerateConfirmMessage', { count });

        if (count === 1) {
          expect(enResult).toContain(`Found ${count} link without description`);
          expect(enResult).not.toContain('links');
        } else {
          expect(enResult).toContain(`Found ${count} links without descriptions`);
        }

        // Chinese uses single form
        testI18n.changeLanguage('zh-CN');
        const zhResult = testI18n.t('settings.ai.bulkGenerateConfirmMessage', { count });
        expect(zhResult).toContain(`发现 ${count} 个链接缺少描述`);

        return true;
      }),
      { numRuns: 30 },
    );
  });

  /**
   * Property-based test: Test batchDeleteConfirmMessage plural key.
   *
   * **Validates: Requirements 2.5**
   */
  it('should correctly handle plural forms for batchDeleteConfirmMessage', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10000 }),
        fc.string({ minLength: 1, maxLength: 20 }),
        (count, fallback) => {
          testI18n.changeLanguage('en-US');
          const enResult = testI18n.t('modals.category.batchDeleteConfirmMessage', {
            count,
            fallback,
          });

          if (count === 1) {
            expect(enResult).toContain(`delete ${count} selected category`);
            expect(enResult).not.toContain('categories');
          } else {
            expect(enResult).toContain(`delete ${count} selected categories`);
          }

          // Chinese uses single form
          testI18n.changeLanguage('zh-CN');
          const zhResult = testI18n.t('modals.category.batchDeleteConfirmMessage', {
            count,
            fallback,
          });
          expect(zhResult).toContain(`删除选中的 ${count} 个分类`);

          return true;
        },
      ),
      { numRuns: 30 },
    );
  });

  /**
   * Deterministic test: Verify specific count values produce correct plural forms.
   */
  it('should correctly handle specific count values for plural forms', () => {
    const testCases = [
      // count=0 (plural in English)
      {
        key: 'modals.syncConflict.links',
        count: 0,
        expectedEn: '0 links',
        expectedZh: '0 个链接',
      },
      // count=1 (singular in English)
      {
        key: 'modals.syncConflict.links',
        count: 1,
        expectedEn: '1 link',
        expectedZh: '1 个链接',
      },
      // count=2 (plural in English)
      {
        key: 'modals.syncConflict.links',
        count: 2,
        expectedEn: '2 links',
        expectedZh: '2 个链接',
      },
      // count=10 (plural in English)
      {
        key: 'modals.syncConflict.categories',
        count: 10,
        expectedEn: '10 categories',
        expectedZh: '10 个分类',
      },
      // count=100 (plural in English)
      {
        key: 'modals.category.selectedCount',
        count: 100,
        expectedEn: '100 categories selected',
        expectedZh: '已选择 100 个分类',
      },
      // count=1 for selectedCount (singular in English)
      {
        key: 'modals.category.selectedCount',
        count: 1,
        expectedEn: '1 category selected',
        expectedZh: '已选择 1 个分类',
      },
    ];

    for (const { key, count, expectedEn, expectedZh } of testCases) {
      testI18n.changeLanguage('en-US');
      expect(testI18n.t(key, { count })).toBe(expectedEn);

      testI18n.changeLanguage('zh-CN');
      expect(testI18n.t(key, { count })).toBe(expectedZh);
    }
  });

  /**
   * Deterministic test: Verify that English plural rules follow standard pattern.
   * count=1 -> singular (_one), count!=1 -> plural (_other)
   */
  it('should follow standard English plural rules (1=singular, other=plural)', () => {
    testI18n.changeLanguage('en-US');

    // Singular cases (count=1)
    expect(testI18n.t('modals.syncConflict.links', { count: 1 })).toBe('1 link');
    expect(testI18n.t('modals.syncConflict.categories', { count: 1 })).toBe('1 category');
    expect(testI18n.t('modals.category.selectedCount', { count: 1 })).toBe('1 category selected');

    // Plural cases (count!=1)
    expect(testI18n.t('modals.syncConflict.links', { count: 0 })).toBe('0 links');
    expect(testI18n.t('modals.syncConflict.links', { count: 2 })).toBe('2 links');
    expect(testI18n.t('modals.syncConflict.links', { count: 5 })).toBe('5 links');
    expect(testI18n.t('modals.syncConflict.links', { count: 100 })).toBe('100 links');

    expect(testI18n.t('modals.syncConflict.categories', { count: 0 })).toBe('0 categories');
    expect(testI18n.t('modals.syncConflict.categories', { count: 3 })).toBe('3 categories');

    expect(testI18n.t('modals.category.selectedCount', { count: 0 })).toBe('0 categories selected');
    expect(testI18n.t('modals.category.selectedCount', { count: 50 })).toBe(
      '50 categories selected',
    );
  });

  /**
   * Deterministic test: Verify Chinese has no plural distinction.
   */
  it('should have no plural distinction in Chinese', () => {
    testI18n.changeLanguage('zh-CN');

    // All counts should produce the same pattern (just with different numbers)
    const counts = [0, 1, 2, 5, 10, 100, 1000];

    for (const count of counts) {
      const linksResult = testI18n.t('modals.syncConflict.links', { count });
      expect(linksResult).toBe(`${count} 个链接`);

      const categoriesResult = testI18n.t('modals.syncConflict.categories', { count });
      expect(categoriesResult).toBe(`${count} 个分类`);

      const selectedCountResult = testI18n.t('modals.category.selectedCount', { count });
      expect(selectedCountResult).toBe(`已选择 ${count} 个分类`);
    }
  });
});
