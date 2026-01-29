import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  safeLocalStorageGetItem,
  safeLocalStorageRemoveItem,
  safeLocalStorageSetItem,
} from './storage';

describe('storage utils', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('safeLocalStorageSetItem writes value when available', () => {
    expect(safeLocalStorageSetItem('k', 'v')).toBe(true);
    expect(localStorage.getItem('k')).toBe('v');
  });

  it('safeLocalStorageSetItem returns false when setItem throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });

    expect(safeLocalStorageSetItem('k', 'v')).toBe(false);
  });

  it('safeLocalStorageGetItem returns null when getItem throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('disabled');
    });

    expect(safeLocalStorageGetItem('k')).toBeNull();
  });

  it('safeLocalStorageRemoveItem returns false when storage is missing', () => {
    vi.stubGlobal('localStorage', undefined as unknown as Storage);
    expect(safeLocalStorageRemoveItem('k')).toBe(false);
  });
});
