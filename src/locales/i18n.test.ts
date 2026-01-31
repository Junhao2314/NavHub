import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import enUS from './en-US.json';
import zhCN from './zh-CN.json';

/**
 * **Validates: Requirements 6.5**
 *
 * Property 7: 翻译文件键一致性
 * For any translation key that exists in any language file, that key should
 * also exist in all supported language files, ensuring translation completeness.
 *
 * Note: English uses plural forms (_one, _other suffixes) while Chinese doesn't
 * have grammatical plurals. The consistency check accounts for this by:
 * - Treating English plural keys (_one, _other) as equivalent to the base key in Chinese
 * - A Chinese key "foo" is considered consistent if English has "foo_one" and "foo_other"
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
      // Recursively get keys from nested objects
      keys.push(...getAllKeys(value as TranslationObject, fullKey));
    } else {
      // Leaf node - add the full key path
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
 * Checks if a key is a plural form key (ends with _one, _other, _zero, _two, _few, _many)
 */
function isPluralKey(key: string): boolean {
  return /_(?:one|other|zero|two|few|many)$/.test(key);
}

/**
 * Gets the base key from a plural key (removes _one, _other, etc. suffix)
 */
function getBaseKey(key: string): string {
  return key.replace(/_(?:one|other|zero|two|few|many)$/, '');
}

/**
 * Normalizes keys for comparison by converting plural keys to their base form
 */
function normalizeKeyForComparison(key: string): string {
  return isPluralKey(key) ? getBaseKey(key) : key;
}

describe('Translation File Key Consistency (Property 7)', () => {
  const zhCNKeys = getAllKeys(zhCN as TranslationObject);
  const enUSKeys = getAllKeys(enUS as TranslationObject);

  // Create sets for efficient lookup
  const zhCNKeySet = new Set(zhCNKeys);
  const enUSKeySet = new Set(enUSKeys);

  // Create normalized key sets (base keys without plural suffixes)
  const zhCNNormalizedKeys = new Set(zhCNKeys.map(normalizeKeyForComparison));
  const enUSNormalizedKeys = new Set(enUSKeys.map(normalizeKeyForComparison));

  it('should have extracted keys from both translation files', () => {
    expect(zhCNKeys.length).toBeGreaterThan(0);
    expect(enUSKeys.length).toBeGreaterThan(0);
  });

  /**
   * Property-based test: For any key in zh-CN, it should exist in en-US
   * (either as the same key or as plural forms _one/_other)
   */
  it('every zh-CN key should exist in en-US', () => {
    fc.assert(
      fc.property(fc.constantFrom(...zhCNKeys), (key: string) => {
        // Check if the key exists directly or as plural forms in en-US
        const existsDirectly = enUSKeySet.has(key);
        const existsAsPluralOne = enUSKeySet.has(`${key}_one`);
        const existsAsPluralOther = enUSKeySet.has(`${key}_other`);

        const existsInEnUS = existsDirectly || (existsAsPluralOne && existsAsPluralOther);

        if (!existsInEnUS) {
          throw new Error(
            `Key "${key}" exists in zh-CN.json but is missing in en-US.json (checked direct key and plural forms)`,
          );
        }
        return existsInEnUS;
      }),
      { numRuns: Math.min(zhCNKeys.length, 100) },
    );
  });

  /**
   * Property-based test: For any key in en-US, its base form should exist in zh-CN
   * (plural keys _one/_other should have corresponding base key in zh-CN)
   */
  it('every en-US key should have corresponding key in zh-CN', () => {
    fc.assert(
      fc.property(fc.constantFrom(...enUSKeys), (key: string) => {
        // For plural keys, check if the base key exists in zh-CN
        // For non-plural keys, check if the key exists directly
        const baseKey = normalizeKeyForComparison(key);
        const existsInZhCN = zhCNKeySet.has(baseKey);

        if (!existsInZhCN) {
          throw new Error(
            `Key "${key}" (base: "${baseKey}") exists in en-US.json but base key is missing in zh-CN.json`,
          );
        }
        return existsInZhCN;
      }),
      { numRuns: Math.min(enUSKeys.length, 100) },
    );
  });

  /**
   * Property-based test: For any randomly selected normalized key from either file,
   * it should exist in both files (accounting for plural forms)
   */
  it('any normalized key from either file should exist in both files', () => {
    const allNormalizedKeys = [...new Set([...zhCNNormalizedKeys, ...enUSNormalizedKeys])];

    fc.assert(
      fc.property(fc.constantFrom(...allNormalizedKeys), (baseKey: string) => {
        const inZhCN = zhCNNormalizedKeys.has(baseKey);
        const inEnUS = enUSNormalizedKeys.has(baseKey);

        if (!inZhCN || !inEnUS) {
          const missingIn = !inZhCN ? 'zh-CN.json' : 'en-US.json';
          throw new Error(`Normalized key "${baseKey}" is missing in ${missingIn}`);
        }

        return inZhCN && inEnUS;
      }),
      { numRuns: Math.min(allNormalizedKeys.length, 100) },
    );
  });

  /**
   * Property-based test: For any key, the value types should be consistent
   * across both translation files (both should be strings for leaf nodes)
   * Note: For plural keys in en-US, we check against the base key in zh-CN
   */
  it('value types should be consistent across translation files', () => {
    // Use zh-CN keys as the reference (they don't have plural suffixes)
    fc.assert(
      fc.property(fc.constantFrom(...zhCNKeys), (key: string) => {
        const zhValue = getNestedValue(zhCN as TranslationObject, key);

        // Check if en-US has the key directly or as plural forms
        let enValue: unknown;
        if (enUSKeySet.has(key)) {
          enValue = getNestedValue(enUS as TranslationObject, key);
        } else if (enUSKeySet.has(`${key}_one`)) {
          // If plural forms exist, check one of them
          enValue = getNestedValue(enUS as TranslationObject, `${key}_one`);
        }

        // Both values should be strings (leaf nodes in translation files)
        const zhIsString = typeof zhValue === 'string';
        const enIsString = typeof enValue === 'string';

        if (!zhIsString || !enIsString) {
          throw new Error(
            `Key "${key}" has inconsistent types: zh-CN=${typeof zhValue}, en-US=${typeof enValue}`,
          );
        }

        return zhIsString && enIsString;
      }),
      { numRuns: Math.min(zhCNKeys.length, 100) },
    );
  });

  /**
   * Deterministic test: Both files should have consistent normalized keys
   * (accounting for plural forms in English)
   */
  it('both translation files should have consistent normalized keys', () => {
    const missingInEnUS = [...zhCNNormalizedKeys].filter((key) => !enUSNormalizedKeys.has(key));
    const missingInZhCN = [...enUSNormalizedKeys].filter((key) => !zhCNNormalizedKeys.has(key));

    if (missingInEnUS.length > 0) {
      console.log('Normalized keys missing in en-US.json:', missingInEnUS);
    }
    if (missingInZhCN.length > 0) {
      console.log('Normalized keys missing in zh-CN.json:', missingInZhCN);
    }

    expect(zhCNNormalizedKeys.size).toBe(enUSNormalizedKeys.size);
  });

  /**
   * Deterministic test: Normalized key sets should be identical
   */
  it('normalized key sets should be identical between translation files', () => {
    const missingInEnUS = [...zhCNNormalizedKeys].filter((key) => !enUSNormalizedKeys.has(key));
    const missingInZhCN = [...enUSNormalizedKeys].filter((key) => !zhCNNormalizedKeys.has(key));

    expect(missingInEnUS).toEqual([]);
    expect(missingInZhCN).toEqual([]);
  });

  /**
   * Deterministic test: English plural keys should come in pairs (_one and _other)
   */
  it('English plural keys should come in complete pairs', () => {
    const pluralKeys = enUSKeys.filter(isPluralKey);
    const baseKeys = new Set(pluralKeys.map(getBaseKey));

    for (const baseKey of baseKeys) {
      const hasOne = enUSKeySet.has(`${baseKey}_one`);
      const hasOther = enUSKeySet.has(`${baseKey}_other`);

      if (hasOne !== hasOther) {
        throw new Error(
          `Incomplete plural pair for "${baseKey}": _one=${hasOne}, _other=${hasOther}`,
        );
      }
    }
  });
});
