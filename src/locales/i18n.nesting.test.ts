import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import enUS from './en-US.json';
import zhCN from './zh-CN.json';

/**
 * **Validates: Requirements 6.3**
 *
 * Property 8: Translation Key Nesting Depth
 * For any translation key in the translation files, its nesting depth should
 * not exceed 3 levels, to maintain structure maintainability.
 *
 * Nesting depth is counted by the number of dots in the key path + 1:
 * - "common" = depth 1
 * - "common.save" = depth 2
 * - "settings.tabs.site" = depth 3
 * - "settings.tabs.site.title" = depth 4 (would violate the property)
 */

type TranslationObject = Record<string, unknown>;

const MAX_NESTING_DEPTH = 3;

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
 * Calculates the nesting depth of a key.
 * Depth is the number of dots + 1.
 * Examples:
 * - "common" -> depth 1
 * - "common.save" -> depth 2
 * - "settings.tabs.site" -> depth 3
 */
function getKeyDepth(key: string): number {
  if (!key) return 0;
  const dotCount = (key.match(/\./g) || []).length;
  return dotCount + 1;
}

describe('Translation Key Nesting Depth (Property 8)', () => {
  const zhCNKeys = getAllKeys(zhCN as TranslationObject);
  const enUSKeys = getAllKeys(enUS as TranslationObject);
  const allKeys = [...new Set([...zhCNKeys, ...enUSKeys])];

  it('should have extracted keys from both translation files', () => {
    expect(zhCNKeys.length).toBeGreaterThan(0);
    expect(enUSKeys.length).toBeGreaterThan(0);
  });

  /**
   * Property-based test: For any key in zh-CN, its nesting depth should be ≤ 3
   */
  it('every zh-CN key should have nesting depth ≤ 3', () => {
    fc.assert(
      fc.property(fc.constantFrom(...zhCNKeys), (key: string) => {
        const depth = getKeyDepth(key);
        if (depth > MAX_NESTING_DEPTH) {
          throw new Error(
            `Key "${key}" has nesting depth ${depth}, which exceeds maximum allowed depth of ${MAX_NESTING_DEPTH}`,
          );
        }
        return depth <= MAX_NESTING_DEPTH;
      }),
      { numRuns: Math.min(zhCNKeys.length, 100) },
    );
  });

  /**
   * Property-based test: For any key in en-US, its nesting depth should be ≤ 3
   */
  it('every en-US key should have nesting depth ≤ 3', () => {
    fc.assert(
      fc.property(fc.constantFrom(...enUSKeys), (key: string) => {
        const depth = getKeyDepth(key);
        if (depth > MAX_NESTING_DEPTH) {
          throw new Error(
            `Key "${key}" has nesting depth ${depth}, which exceeds maximum allowed depth of ${MAX_NESTING_DEPTH}`,
          );
        }
        return depth <= MAX_NESTING_DEPTH;
      }),
      { numRuns: Math.min(enUSKeys.length, 100) },
    );
  });

  /**
   * Property-based test: For any randomly selected key from either file,
   * its nesting depth should be ≤ 3
   */
  it('any key from either translation file should have nesting depth ≤ 3', () => {
    fc.assert(
      fc.property(fc.constantFrom(...allKeys), (key: string) => {
        const depth = getKeyDepth(key);
        if (depth > MAX_NESTING_DEPTH) {
          throw new Error(
            `Key "${key}" has nesting depth ${depth}, which exceeds maximum allowed depth of ${MAX_NESTING_DEPTH}`,
          );
        }
        return depth <= MAX_NESTING_DEPTH;
      }),
      { numRuns: Math.min(allKeys.length, 100) },
    );
  });

  /**
   * Deterministic test: Verify getKeyDepth function works correctly
   */
  describe('getKeyDepth function', () => {
    it('should return depth 1 for single-level keys', () => {
      expect(getKeyDepth('common')).toBe(1);
      expect(getKeyDepth('header')).toBe(1);
      expect(getKeyDepth('errors')).toBe(1);
    });

    it('should return depth 2 for two-level keys', () => {
      expect(getKeyDepth('common.save')).toBe(2);
      expect(getKeyDepth('header.addLink')).toBe(2);
      expect(getKeyDepth('errors.networkError')).toBe(2);
    });

    it('should return depth 3 for three-level keys', () => {
      expect(getKeyDepth('settings.tabs.site')).toBe(3);
      expect(getKeyDepth('settings.site.pageTitle')).toBe(3);
      expect(getKeyDepth('modals.link.addTitle')).toBe(3);
    });

    it('should return depth 4 for four-level keys (would violate property)', () => {
      expect(getKeyDepth('settings.tabs.site.title')).toBe(4);
      expect(getKeyDepth('a.b.c.d')).toBe(4);
    });

    it('should return 0 for empty string', () => {
      expect(getKeyDepth('')).toBe(0);
    });
  });

  /**
   * Deterministic test: All zh-CN keys should have depth ≤ 3
   */
  it('all zh-CN keys should have depth ≤ 3 (deterministic check)', () => {
    const violatingKeys = zhCNKeys.filter((key) => getKeyDepth(key) > MAX_NESTING_DEPTH);

    if (violatingKeys.length > 0) {
      console.log('zh-CN keys violating nesting depth constraint:');
      violatingKeys.forEach((key) => {
        console.log(`  - "${key}" (depth: ${getKeyDepth(key)})`);
      });
    }

    expect(violatingKeys).toEqual([]);
  });

  /**
   * Deterministic test: All en-US keys should have depth ≤ 3
   */
  it('all en-US keys should have depth ≤ 3 (deterministic check)', () => {
    const violatingKeys = enUSKeys.filter((key) => getKeyDepth(key) > MAX_NESTING_DEPTH);

    if (violatingKeys.length > 0) {
      console.log('en-US keys violating nesting depth constraint:');
      violatingKeys.forEach((key) => {
        console.log(`  - "${key}" (depth: ${getKeyDepth(key)})`);
      });
    }

    expect(violatingKeys).toEqual([]);
  });

  /**
   * Deterministic test: Verify depth distribution of keys
   */
  it('should report depth distribution of all keys', () => {
    const depthDistribution: Record<number, number> = {};

    allKeys.forEach((key) => {
      const depth = getKeyDepth(key);
      depthDistribution[depth] = (depthDistribution[depth] || 0) + 1;
    });

    console.log('Key depth distribution:');
    Object.entries(depthDistribution)
      .sort(([a], [b]) => Number(a) - Number(b))
      .forEach(([depth, count]) => {
        console.log(`  Depth ${depth}: ${count} keys`);
      });

    // All depths should be ≤ MAX_NESTING_DEPTH
    const maxDepthFound = Math.max(...Object.keys(depthDistribution).map(Number));
    expect(maxDepthFound).toBeLessThanOrEqual(MAX_NESTING_DEPTH);
  });

  /**
   * Edge case: Verify keys at exactly depth 3 are valid
   */
  it('should allow keys at exactly depth 3', () => {
    const depth3Keys = allKeys.filter((key) => getKeyDepth(key) === 3);

    // There should be some keys at depth 3 (based on the translation file structure)
    expect(depth3Keys.length).toBeGreaterThan(0);

    // All depth 3 keys should be valid
    depth3Keys.forEach((key) => {
      expect(getKeyDepth(key)).toBe(3);
      expect(getKeyDepth(key)).toBeLessThanOrEqual(MAX_NESTING_DEPTH);
    });
  });
});
