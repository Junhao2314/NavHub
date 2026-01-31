import * as fc from 'fast-check';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FALLBACK_LANGUAGE } from '../config/i18n';
import enUS from './en-US.json';
import zhCN from './zh-CN.json';

/**
 * **Validates: Requirements 2.4**
 *
 * Property 2: Interpolation Variable Replacement
 * For any translation text containing interpolation variables (like `{{name}}`, `{{count}}`)
 * and any variable values, the translation function should correctly replace variable
 * placeholders with actual values.
 */

describe('Interpolation Variable Replacement Property Tests', () => {
  /**
   * **Validates: Requirements 2.4**
   */

  let testI18n: typeof i18n;

  beforeAll(async () => {
    // Create a separate i18n instance for testing
    testI18n = i18n.createInstance();

    await testI18n.use(initReactI18next).init({
      lng: 'zh-CN',
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
   * Existing interpolation keys in the translation files for testing:
   * - header.searchInSource: "在 {{source}} 搜索" / "Search in {{source}}"
   * - modals.category.selectedCount: "已选择 {{count}} 个分类" / "{{count}} categories selected"
   * - modals.import.confirmImport: "确认导入 ({{count}})" / "Confirm import ({{count}})"
   * - modals.syncConflict.links: "{{count}} 个链接" / "{{count}} links"
   * - modals.syncConflict.categories: "{{count}} 个分类" / "{{count}} categories"
   */

  /**
   * Property-based test: For any string value provided for the {{source}} variable,
   * the translation should correctly replace the placeholder with the actual value.
   *
   * **Validates: Requirements 2.4**
   */
  it('should correctly replace {{source}} variable with any string value', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 50 }), (sourceValue: string) => {
        // Test with zh-CN
        testI18n.changeLanguage('zh-CN');
        const zhResult = testI18n.t('header.searchInSource', { source: sourceValue });
        expect(zhResult).toBe(`在 ${sourceValue} 搜索`);
        expect(zhResult).not.toContain('{{source}}');

        // Test with en-US
        testI18n.changeLanguage('en-US');
        const enResult = testI18n.t('header.searchInSource', { source: sourceValue });
        expect(enResult).toBe(`Search in ${sourceValue}`);
        expect(enResult).not.toContain('{{source}}');

        return true;
      }),
      { numRuns: 30 },
    );
  });

  /**
   * Property-based test: For any numeric value provided for the {{count}} variable,
   * the translation should correctly replace the placeholder with the actual value.
   * Note: English uses plural forms (_one for count=1, _other for other counts).
   *
   * **Validates: Requirements 2.4**
   */
  it('should correctly replace {{count}} variable with any numeric value', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10000 }), (countValue: number) => {
        // Test modals.category.selectedCount
        testI18n.changeLanguage('zh-CN');
        const zhCategoryResult = testI18n.t('modals.category.selectedCount', { count: countValue });
        expect(zhCategoryResult).toBe(`已选择 ${countValue} 个分类`);
        expect(zhCategoryResult).not.toContain('{{count}}');

        testI18n.changeLanguage('en-US');
        const enCategoryResult = testI18n.t('modals.category.selectedCount', { count: countValue });
        // English uses plural forms: _one for count=1, _other for other counts
        const expectedEnCategory =
          countValue === 1
            ? `${countValue} category selected`
            : `${countValue} categories selected`;
        expect(enCategoryResult).toBe(expectedEnCategory);
        expect(enCategoryResult).not.toContain('{{count}}');

        // Test modals.import.confirmImport (no plural forms for this key)
        testI18n.changeLanguage('zh-CN');
        const zhImportResult = testI18n.t('modals.import.confirmImport', { count: countValue });
        expect(zhImportResult).toBe(`确认导入 (${countValue})`);
        expect(zhImportResult).not.toContain('{{count}}');

        testI18n.changeLanguage('en-US');
        const enImportResult = testI18n.t('modals.import.confirmImport', { count: countValue });
        expect(enImportResult).toBe(`Confirm import (${countValue})`);
        expect(enImportResult).not.toContain('{{count}}');

        return true;
      }),
      { numRuns: 30 },
    );
  });

  /**
   * Property-based test: For any numeric value provided for {{count}} in syncConflict keys,
   * the translation should correctly replace the placeholder.
   * Note: English uses plural forms (_one for count=1, _other for other counts).
   *
   * **Validates: Requirements 2.4**
   */
  it('should correctly replace {{count}} in syncConflict translations', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10000 }), (countValue: number) => {
        // Test modals.syncConflict.links
        testI18n.changeLanguage('zh-CN');
        const zhLinksResult = testI18n.t('modals.syncConflict.links', { count: countValue });
        expect(zhLinksResult).toBe(`${countValue} 个链接`);
        expect(zhLinksResult).not.toContain('{{count}}');

        testI18n.changeLanguage('en-US');
        const enLinksResult = testI18n.t('modals.syncConflict.links', { count: countValue });
        // English uses plural forms: _one for count=1, _other for other counts
        const expectedEnLinks = countValue === 1 ? `${countValue} link` : `${countValue} links`;
        expect(enLinksResult).toBe(expectedEnLinks);
        expect(enLinksResult).not.toContain('{{count}}');

        // Test modals.syncConflict.categories
        testI18n.changeLanguage('zh-CN');
        const zhCategoriesResult = testI18n.t('modals.syncConflict.categories', {
          count: countValue,
        });
        expect(zhCategoriesResult).toBe(`${countValue} 个分类`);
        expect(zhCategoriesResult).not.toContain('{{count}}');

        testI18n.changeLanguage('en-US');
        const enCategoriesResult = testI18n.t('modals.syncConflict.categories', {
          count: countValue,
        });
        // English uses plural forms: _one for count=1, _other for other counts
        const expectedEnCategories =
          countValue === 1 ? `${countValue} category` : `${countValue} categories`;
        expect(enCategoriesResult).toBe(expectedEnCategories);
        expect(enCategoriesResult).not.toContain('{{count}}');

        return true;
      }),
      { numRuns: 30 },
    );
  });

  /**
   * Property-based test: For any combination of variable name and value,
   * a dynamically created translation should correctly replace the placeholder.
   *
   * **Validates: Requirements 2.4**
   */
  it('should correctly replace dynamically generated interpolation variables', async () => {
    // Create a test instance with dynamic translations
    const dynamicI18n = i18n.createInstance();

    await dynamicI18n.use(initReactI18next).init({
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
            __test_dynamic__: {
              singleVar: '值是 {{value}}',
              multiVar: '名字: {{name}}, 年龄: {{age}}',
            },
          },
        },
        'en-US': {
          translation: {
            __test_dynamic__: {
              singleVar: 'Value is {{value}}',
              multiVar: 'Name: {{name}}, Age: {{age}}',
            },
          },
        },
      },
      returnEmptyString: false,
      returnNull: false,
    });

    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 30 }),
        fc.integer({ min: 0, max: 150 }),
        (nameValue: string, ageValue: number) => {
          // Test single variable replacement
          dynamicI18n.changeLanguage('en-US');
          const singleResult = dynamicI18n.t('__test_dynamic__.singleVar', { value: nameValue });
          expect(singleResult).toBe(`Value is ${nameValue}`);
          expect(singleResult).not.toContain('{{value}}');

          // Test multiple variable replacement
          const multiResult = dynamicI18n.t('__test_dynamic__.multiVar', {
            name: nameValue,
            age: ageValue,
          });
          expect(multiResult).toBe(`Name: ${nameValue}, Age: ${ageValue}`);
          expect(multiResult).not.toContain('{{name}}');
          expect(multiResult).not.toContain('{{age}}');

          // Test with zh-CN
          dynamicI18n.changeLanguage('zh-CN');
          const zhSingleResult = dynamicI18n.t('__test_dynamic__.singleVar', { value: nameValue });
          expect(zhSingleResult).toBe(`值是 ${nameValue}`);

          const zhMultiResult = dynamicI18n.t('__test_dynamic__.multiVar', {
            name: nameValue,
            age: ageValue,
          });
          expect(zhMultiResult).toBe(`名字: ${nameValue}, 年龄: ${ageValue}`);

          return true;
        },
      ),
      { numRuns: 30 },
    );
  });

  /**
   * Property-based test: Interpolation should work with special characters in values.
   *
   * **Validates: Requirements 2.4**
   */
  it('should correctly handle special characters in interpolation values', () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-zA-Z0-9\s!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]{1,30}$/),
        (specialValue: string) => {
          testI18n.changeLanguage('en-US');
          const result = testI18n.t('header.searchInSource', { source: specialValue });

          // The value should be inserted as-is (escapeValue is false)
          expect(result).toBe(`Search in ${specialValue}`);
          expect(result).not.toContain('{{source}}');

          return true;
        },
      ),
      { numRuns: 30 },
    );
  });

  /**
   * Property-based test: Interpolation should work with numeric strings.
   *
   * **Validates: Requirements 2.4**
   */
  it('should correctly handle numeric strings as interpolation values', () => {
    fc.assert(
      fc.property(fc.integer({ min: -10000, max: 10000 }), (numValue: number) => {
        const stringValue = String(numValue);

        testI18n.changeLanguage('en-US');
        const result = testI18n.t('header.searchInSource', { source: stringValue });
        expect(result).toBe(`Search in ${stringValue}`);
        expect(result).not.toContain('{{source}}');

        testI18n.changeLanguage('zh-CN');
        const zhResult = testI18n.t('header.searchInSource', { source: stringValue });
        expect(zhResult).toBe(`在 ${stringValue} 搜索`);
        expect(zhResult).not.toContain('{{source}}');

        return true;
      }),
      { numRuns: 30 },
    );
  });

  /**
   * Property-based test: Missing interpolation variables should leave placeholder or be handled gracefully.
   *
   * **Validates: Requirements 2.4**
   */
  it('should handle missing interpolation variables gracefully', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        testI18n.changeLanguage('en-US');

        // When no variables are provided, the placeholder should remain or be handled
        const result = testI18n.t('header.searchInSource');

        // i18next leaves the placeholder when variable is not provided
        expect(result).toContain('{{source}}');

        return true;
      }),
      { numRuns: 30 },
    );
  });

  /**
   * Property-based test: Empty string values should be correctly interpolated.
   *
   * **Validates: Requirements 2.4**
   */
  it('should correctly handle empty string interpolation values', () => {
    fc.assert(
      fc.property(fc.constant(''), (emptyValue: string) => {
        testI18n.changeLanguage('en-US');
        const result = testI18n.t('header.searchInSource', { source: emptyValue });
        expect(result).toBe('Search in ');
        expect(result).not.toContain('{{source}}');

        testI18n.changeLanguage('zh-CN');
        const zhResult = testI18n.t('header.searchInSource', { source: emptyValue });
        expect(zhResult).toBe('在  搜索');
        expect(zhResult).not.toContain('{{source}}');

        return true;
      }),
      { numRuns: 30 },
    );
  });

  /**
   * Deterministic test: Verify specific interpolation keys work correctly.
   * Note: English uses plural forms for count-based translations.
   */
  it('should correctly interpolate known keys with specific values', () => {
    const testCases = [
      {
        key: 'header.searchInSource',
        vars: { source: 'Google' },
        expectedZh: '在 Google 搜索',
        expectedEn: 'Search in Google',
      },
      {
        key: 'modals.category.selectedCount',
        vars: { count: 5 },
        expectedZh: '已选择 5 个分类',
        expectedEn: '5 categories selected', // plural form (_other)
      },
      {
        key: 'modals.category.selectedCount',
        vars: { count: 1 },
        expectedZh: '已选择 1 个分类',
        expectedEn: '1 category selected', // singular form (_one)
      },
      {
        key: 'modals.import.confirmImport',
        vars: { count: 10 },
        expectedZh: '确认导入 (10)',
        expectedEn: 'Confirm import (10)',
      },
      {
        key: 'modals.syncConflict.links',
        vars: { count: 42 },
        expectedZh: '42 个链接',
        expectedEn: '42 links', // plural form (_other)
      },
      {
        key: 'modals.syncConflict.links',
        vars: { count: 1 },
        expectedZh: '1 个链接',
        expectedEn: '1 link', // singular form (_one)
      },
    ];

    for (const { key, vars, expectedZh, expectedEn } of testCases) {
      testI18n.changeLanguage('zh-CN');
      expect(testI18n.t(key, vars)).toBe(expectedZh);

      testI18n.changeLanguage('en-US');
      expect(testI18n.t(key, vars)).toBe(expectedEn);
    }
  });

  /**
   * Deterministic test: Verify edge cases for count values.
   * Note: English uses plural forms (_one for count=1, _other for other counts).
   */
  it('should correctly handle edge case count values', () => {
    const edgeCases = [
      { count: 0, expectedEn: '0 links' }, // _other
      { count: 1, expectedEn: '1 link' }, // _one
      { count: 100, expectedEn: '100 links' }, // _other
      { count: 1000, expectedEn: '1000 links' }, // _other
      { count: 9999, expectedEn: '9999 links' }, // _other
    ];

    for (const { count, expectedEn } of edgeCases) {
      testI18n.changeLanguage('en-US');
      const result = testI18n.t('modals.syncConflict.links', { count });
      expect(result).toBe(expectedEn);
      expect(result).not.toContain('{{count}}');
    }
  });
});
