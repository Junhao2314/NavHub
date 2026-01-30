import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CustomFaviconCache } from '../types';
import { FAVICON_CACHE_KEY } from './constants';
import {
  buildSyncCache,
  getCustomIcons,
  getIcon,
  getLocalCache,
  isCustomIcon,
  mergeFromCloud,
  removeIcon,
  setIcon,
} from './faviconCache';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((index: number) => Object.keys(store)[index] || null),
  };
})();

Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
});

describe('faviconCache', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  describe('getLocalCache', () => {
    it('should return empty object when no cache exists', () => {
      const cache = getLocalCache();
      expect(cache).toEqual({});
    });

    it('should return cached data when it exists', () => {
      const mockCache = { 'github.com': 'https://github.com/favicon.ico' };
      localStorageMock.setItem(FAVICON_CACHE_KEY, JSON.stringify(mockCache));

      const cache = getLocalCache();
      expect(cache).toEqual(mockCache);
    });

    it('should return empty object for invalid JSON', () => {
      localStorageMock.setItem(FAVICON_CACHE_KEY, 'invalid json');

      const cache = getLocalCache();
      expect(cache).toEqual({});
    });

    it('should return empty object for non-object values', () => {
      localStorageMock.setItem(FAVICON_CACHE_KEY, JSON.stringify(['array']));

      const cache = getLocalCache();
      expect(cache).toEqual({});
    });
  });

  describe('setIcon', () => {
    it('should set an icon in the cache', () => {
      setIcon('github.com', 'https://github.com/favicon.ico', false);

      const cache = getLocalCache();
      expect(cache['github.com']).toBe('https://github.com/favicon.ico');
    });

    it('should mark icon as custom when isCustom is true', () => {
      setIcon('github.com', 'data:image/png;base64,...', true);

      expect(isCustomIcon('github.com')).toBe(true);
    });

    it('should not mark icon as custom when isCustom is false', () => {
      setIcon('github.com', 'https://github.com/favicon.ico', false);

      expect(isCustomIcon('github.com')).toBe(false);
    });

    it('should remove from custom list when setting non-custom icon for previously custom hostname', () => {
      // First set as custom
      setIcon('github.com', 'data:image/png;base64,...', true);
      expect(isCustomIcon('github.com')).toBe(true);

      // Then set as non-custom
      setIcon('github.com', 'https://github.com/favicon.ico', false);
      expect(isCustomIcon('github.com')).toBe(false);
    });
  });

  describe('getCustomIcons', () => {
    it('should return empty array when no custom icons exist', () => {
      const customIcons = getCustomIcons();
      expect(customIcons).toEqual([]);
    });

    it('should return only custom icons', () => {
      setIcon('github.com', 'data:image/png;base64,custom1', true);
      setIcon('google.com', 'https://google.com/favicon.ico', false);
      setIcon('twitter.com', 'data:image/png;base64,custom2', true);

      const customIcons = getCustomIcons();

      expect(customIcons.length).toBe(2);
      expect(customIcons.map((e) => e.hostname)).toContain('github.com');
      expect(customIcons.map((e) => e.hostname)).toContain('twitter.com');
      expect(customIcons.map((e) => e.hostname)).not.toContain('google.com');
    });

    it('should return entries with isCustom set to true', () => {
      setIcon('github.com', 'data:image/png;base64,custom', true);

      const customIcons = getCustomIcons();

      expect(customIcons[0].isCustom).toBe(true);
    });

    it('should keep stable updatedAt for custom icons', () => {
      const dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(1000);
      setIcon('github.com', 'data:image/png;base64,custom', true);

      dateNowSpy.mockReturnValue(2000);
      const customIcons = getCustomIcons();

      expect(customIcons[0].updatedAt).toBe(1000);
      dateNowSpy.mockRestore();
    });
  });

  describe('buildSyncCache', () => {
    it('should return empty entries when no custom icons exist', () => {
      const syncCache = buildSyncCache();

      expect(syncCache.entries).toEqual([]);
      expect(syncCache.updatedAt).toBe(0);
    });

    it('should only include custom icons in sync cache', () => {
      setIcon('github.com', 'data:image/png;base64,custom', true);
      setIcon('google.com', 'https://google.com/favicon.ico', false);

      const syncCache = buildSyncCache();

      expect(syncCache.entries.length).toBe(1);
      expect(syncCache.entries[0].hostname).toBe('github.com');
    });

    it('should keep stable sync cache when nothing changes', () => {
      const dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(1000);
      setIcon('github.com', 'data:image/png;base64,custom', true);

      const first = buildSyncCache();

      dateNowSpy.mockReturnValue(2000);
      const second = buildSyncCache();

      expect(second).toEqual(first);
      dateNowSpy.mockRestore();
    });
  });

  describe('mergeFromCloud', () => {
    it('should handle null/undefined cloud cache', () => {
      setIcon('github.com', 'https://github.com/favicon.ico', false);

      mergeFromCloud(null as unknown as CustomFaviconCache);
      mergeFromCloud(undefined as unknown as CustomFaviconCache);

      // Local cache should be unchanged
      expect(getIcon('github.com')).toBe('https://github.com/favicon.ico');
    });

    it('should merge custom icons from cloud', () => {
      const cloudCache: CustomFaviconCache = {
        entries: [
          {
            hostname: 'github.com',
            iconUrl: 'data:image/png;base64,cloud',
            isCustom: true,
            updatedAt: Date.now(),
          },
        ],
        updatedAt: Date.now(),
      };

      mergeFromCloud(cloudCache);

      expect(getIcon('github.com')).toBe('data:image/png;base64,cloud');
      expect(isCustomIcon('github.com')).toBe(true);
    });

    it('should persist cloud updatedAt into local custom meta', () => {
      const cloudCache: CustomFaviconCache = {
        entries: [
          {
            hostname: 'github.com',
            iconUrl: 'data:image/png;base64,cloud',
            isCustom: true,
            updatedAt: 1234,
          },
        ],
        updatedAt: 1234,
      };

      mergeFromCloud(cloudCache);

      const syncCache = buildSyncCache();
      expect(syncCache.updatedAt).toBe(1234);
      expect(syncCache.entries[0].updatedAt).toBe(1234);
    });

    it('should overwrite local updatedAt with cloud updatedAt when merging', () => {
      const dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(1000);
      setIcon('github.com', 'data:image/png;base64,local', true);
      dateNowSpy.mockRestore();

      const cloudCache: CustomFaviconCache = {
        entries: [
          {
            hostname: 'github.com',
            iconUrl: 'data:image/png;base64,cloud',
            isCustom: true,
            updatedAt: 2000,
          },
        ],
        updatedAt: 2000,
      };

      mergeFromCloud(cloudCache);

      const syncCache = buildSyncCache();
      expect(getIcon('github.com')).toBe('data:image/png;base64,cloud');
      expect(syncCache.updatedAt).toBe(2000);
      expect(syncCache.entries[0].updatedAt).toBe(2000);
    });

    it('should keep local custom icon when it is newer than cloud', () => {
      const dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(3000);
      setIcon('github.com', 'data:image/png;base64,local', true);
      dateNowSpy.mockRestore();

      const cloudCache: CustomFaviconCache = {
        entries: [
          {
            hostname: 'github.com',
            iconUrl: 'data:image/png;base64,cloud',
            isCustom: true,
            updatedAt: 2000,
          },
        ],
        updatedAt: 2000,
      };

      mergeFromCloud(cloudCache);

      const syncCache = buildSyncCache();
      expect(getIcon('github.com')).toBe('data:image/png;base64,local');
      expect(syncCache.updatedAt).toBe(3000);
      expect(syncCache.entries[0].updatedAt).toBe(3000);
    });

    it('should preserve local auto-fetched icons not in cloud', () => {
      setIcon('local-only.com', 'https://local-only.com/favicon.ico', false);

      const cloudCache: CustomFaviconCache = {
        entries: [
          {
            hostname: 'github.com',
            iconUrl: 'data:image/png;base64,cloud',
            isCustom: true,
            updatedAt: Date.now(),
          },
        ],
        updatedAt: Date.now(),
      };

      mergeFromCloud(cloudCache);

      // Local auto-fetched icon should be preserved
      expect(getIcon('local-only.com')).toBe('https://local-only.com/favicon.ico');
    });

    it('should prefer cloud custom icons over local auto-fetched', () => {
      setIcon('github.com', 'https://github.com/favicon.ico', false);

      const cloudCache: CustomFaviconCache = {
        entries: [
          {
            hostname: 'github.com',
            iconUrl: 'data:image/png;base64,custom',
            isCustom: true,
            updatedAt: Date.now(),
          },
        ],
        updatedAt: Date.now(),
      };

      mergeFromCloud(cloudCache);

      expect(getIcon('github.com')).toBe('data:image/png;base64,custom');
      expect(isCustomIcon('github.com')).toBe(true);
    });

    it('should skip entries with missing hostname or iconUrl', () => {
      const cloudCache: CustomFaviconCache = {
        entries: [
          {
            hostname: '',
            iconUrl: 'data:image/png;base64,test',
            isCustom: true,
            updatedAt: Date.now(),
          },
          { hostname: 'valid.com', iconUrl: '', isCustom: true, updatedAt: Date.now() },
          {
            hostname: 'github.com',
            iconUrl: 'data:image/png;base64,valid',
            isCustom: true,
            updatedAt: Date.now(),
          },
        ],
        updatedAt: Date.now(),
      };

      mergeFromCloud(cloudCache);

      expect(getIcon('github.com')).toBe('data:image/png;base64,valid');
      expect(getIcon('')).toBeUndefined();
      expect(getIcon('valid.com')).toBeUndefined();
    });
  });

  describe('removeIcon', () => {
    it('should remove icon from cache', () => {
      setIcon('github.com', 'https://github.com/favicon.ico', false);

      removeIcon('github.com');

      expect(getIcon('github.com')).toBeUndefined();
    });

    it('should remove from custom list if was custom', () => {
      setIcon('github.com', 'data:image/png;base64,custom', true);
      expect(isCustomIcon('github.com')).toBe(true);

      removeIcon('github.com');

      expect(isCustomIcon('github.com')).toBe(false);
    });
  });

  describe('getIcon', () => {
    it('should return undefined for non-existent hostname', () => {
      expect(getIcon('nonexistent.com')).toBeUndefined();
    });

    it('should return icon URL for existing hostname', () => {
      setIcon('github.com', 'https://github.com/favicon.ico', false);

      expect(getIcon('github.com')).toBe('https://github.com/favicon.ico');
    });
  });

  describe('isCustomIcon', () => {
    it('should return false for non-existent hostname', () => {
      expect(isCustomIcon('nonexistent.com')).toBe(false);
    });

    it('should return true for custom icon', () => {
      setIcon('github.com', 'data:image/png;base64,custom', true);

      expect(isCustomIcon('github.com')).toBe(true);
    });

    it('should return false for auto-fetched icon', () => {
      setIcon('github.com', 'https://github.com/favicon.ico', false);

      expect(isCustomIcon('github.com')).toBe(false);
    });
  });
});
