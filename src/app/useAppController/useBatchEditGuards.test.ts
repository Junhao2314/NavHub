import { describe, expect, it } from 'vitest';
import { computeBatchEditGuards } from './useBatchEditGuards';

describe('useBatchEditGuards helpers', () => {
  it('blocks batch edit state when blocked', () => {
    const selectedLinks = new Set(['a', 'b']);
    const result = computeBatchEditGuards({
      isBlocked: true,
      isBatchEditMode: true,
      selectedLinks,
    });

    expect(result.effectiveIsBatchEditMode).toBe(false);
    expect(result.effectiveSelectedLinksCount).toBe(0);
  });

  it('passes through batch edit state when not blocked', () => {
    const selectedLinks = new Set(['a', 'b']);
    const result = computeBatchEditGuards({
      isBlocked: false,
      isBatchEditMode: true,
      selectedLinks,
    });

    expect(result.effectiveIsBatchEditMode).toBe(true);
    expect(result.effectiveSelectedLinksCount).toBe(2);
  });
});
