import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetAppStore } from '../stores/useAppStore';
import { SEARCH_CONFIG_KEY } from '../utils/constants';
import { useSearch } from './useSearch';

describe('useSearch', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  const renderSearch = async () => {
    let api: ReturnType<typeof useSearch> | null = null;

    function Harness() {
      const value = useSearch();
      useEffect(() => {
        api = value;
      }, [value]);
      return null;
    }

    root = createRoot(container);
    await act(async () => {
      root?.render(<Harness />);
    });

    return {
      get: () => {
        if (!api) throw new Error('useSearch not initialized');
        return api;
      },
    };
  };

  beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers();
    resetAppStore();
    localStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
      root = null;
    }
    container.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('initializes with default sources when no config exists', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1700000000000);

    const { get } = await renderSearch();

    expect(get().searchMode).toBe('external');
    expect(get().externalSearchSources.length).toBeGreaterThan(0);
    expect(get().selectedSearchSource?.id).toBe('bing');
    expect(localStorage.getItem(SEARCH_CONFIG_KEY)).toBeNull();
  });

  it('handleExternalSearch opens selected source with encoded query', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1700000000000);
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    const { get } = await renderSearch();

    act(() => {
      get().setSearchQuery('hello world');
    });

    act(() => {
      get().handleExternalSearch();
    });

    expect(openSpy).toHaveBeenCalledWith(
      'https://www.bing.com/search?q=hello%20world',
      '_blank',
      'noopener,noreferrer',
    );
  });

  it('handleSearchSourceSelect saves config and closes popup', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1700000000000);
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    const { get } = await renderSearch();
    const google = get().externalSearchSources.find((s) => s.id === 'google');
    if (!google) {
      throw new Error('google source missing from defaults');
    }

    act(() => {
      get().setShowSearchSourcePopup(true);
      get().setHoveredSearchSource(google);
      get().setSearchQuery('k');
    });

    act(() => {
      get().handleSearchSourceSelect(google);
    });

    expect(openSpy).toHaveBeenCalledWith(
      'https://www.google.com/search?q=k',
      '_blank',
      'noopener,noreferrer',
    );
    expect(get().selectedSearchSource?.id).toBe('google');
    expect(get().showSearchSourcePopup).toBe(false);
    expect(get().hoveredSearchSource).toBeNull();

    const saved = JSON.parse(localStorage.getItem(SEARCH_CONFIG_KEY) ?? '{}');
    expect(saved.mode).toBe('external');
    expect(saved.selectedSourceId).toBe('google');
  });

  it('handleSearchModeChange builds defaults when switching to external with no sources', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1700000000000);

    const { get } = await renderSearch();

    act(() => {
      get().saveSearchConfig([], 'internal', null);
    });
    expect(get().searchMode).toBe('internal');
    expect(get().externalSearchSources).toEqual([]);

    act(() => {
      get().handleSearchModeChange('external');
    });

    expect(get().searchMode).toBe('external');
    expect(get().externalSearchSources.length).toBeGreaterThan(0);
    expect(get().selectedSearchSource?.id).toBe('bing');
    expect(localStorage.getItem(SEARCH_CONFIG_KEY)).not.toBeNull();
  });

  it('does not open non-http(s) search URLs', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1700000000000);
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    const { get } = await renderSearch();

    act(() => {
      get().saveSearchConfig(
        [
          {
            id: 'bad',
            name: 'Bad',
            url: 'javascript:alert(1)',
            icon: 'Search',
            enabled: true,
            createdAt: 1700000000000,
          },
        ] as any,
        'external',
        {
          id: 'bad',
          name: 'Bad',
          url: 'javascript:alert(1)',
          icon: 'Search',
          enabled: true,
          createdAt: 1700000000000,
        } as any,
      );
      get().setSearchQuery('x');
    });

    act(() => {
      get().handleExternalSearch();
    });

    expect(openSpy).not.toHaveBeenCalled();
  });

  it('hides search source popup after hover ends (delayed)', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1700000000000);

    const { get } = await renderSearch();
    const source = get().externalSearchSources[0];
    if (!source) throw new Error('missing default search source');

    act(() => {
      get().setHoveredSearchSource(source);
      get().setIsIconHovered(true);
    });
    expect(get().showSearchSourcePopup).toBe(true);

    act(() => {
      get().setIsIconHovered(false);
    });
    expect(get().showSearchSourcePopup).toBe(true);

    act(() => {
      vi.advanceTimersByTime(110);
    });

    expect(get().showSearchSourcePopup).toBe(false);
    expect(get().hoveredSearchSource).toBeNull();
  });
});
