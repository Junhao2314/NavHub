import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetAppStore } from '../stores/useAppStore';
import { THEME_KEY } from '../utils/constants';
import { useTheme } from './useTheme';

type MatchMediaListener = (event: { matches: boolean }) => void;

const setupMatchMedia = (initialMatches: boolean) => {
  let matches = initialMatches;
  const listeners = new Set<MatchMediaListener>();

  const mql = {
    matches,
    media: '(prefers-color-scheme: dark)',
    onchange: null,
    addEventListener: vi.fn((event: string, cb: MatchMediaListener) => {
      if (event === 'change') listeners.add(cb);
    }),
    removeEventListener: vi.fn((event: string, cb: MatchMediaListener) => {
      if (event === 'change') listeners.delete(cb);
    }),
    addListener: vi.fn((cb: MatchMediaListener) => listeners.add(cb)),
    removeListener: vi.fn((cb: MatchMediaListener) => listeners.delete(cb)),
    dispatch: (nextMatches: boolean) => {
      matches = nextMatches;
      (mql as any).matches = matches;
      listeners.forEach((cb) => {
        cb({ matches });
      });
    },
  } as any;

  vi.stubGlobal('matchMedia', vi.fn(() => mql) as any);

  return { mql };
};

describe('useTheme', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  const renderTheme = async () => {
    let api: ReturnType<typeof useTheme> | null = null;

    function Harness() {
      const value = useTheme();
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
        if (!api) throw new Error('useTheme not initialized');
        return api;
      },
    };
  };

  beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    resetAppStore();
    localStorage.clear();
    document.documentElement.classList.remove('dark');
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
    document.documentElement.classList.remove('dark');
  });

  it('initializes from localStorage and applies dark mode', async () => {
    setupMatchMedia(false);
    localStorage.setItem(THEME_KEY, 'dark');

    const { get } = await renderTheme();

    expect(get().themeMode).toBe('dark');
    expect(get().darkMode).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('defaults to system mode for invalid stored values', async () => {
    setupMatchMedia(true);
    localStorage.setItem(THEME_KEY, 'nope');

    const { get } = await renderTheme();

    expect(get().themeMode).toBe('system');
    expect(get().darkMode).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('toggleTheme cycles modes and persists to localStorage', async () => {
    setupMatchMedia(false);

    const { get } = await renderTheme();

    expect(get().themeMode).toBe('system');
    expect(get().darkMode).toBe(false);

    act(() => {
      get().toggleTheme();
    });
    expect(get().themeMode).toBe('light');
    expect(localStorage.getItem(THEME_KEY)).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);

    act(() => {
      get().toggleTheme();
    });
    expect(get().themeMode).toBe('dark');
    expect(localStorage.getItem(THEME_KEY)).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    act(() => {
      get().toggleTheme();
    });
    expect(get().themeMode).toBe('system');
    expect(localStorage.getItem(THEME_KEY)).toBe('system');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('applyFromSync ignores invalid values', async () => {
    setupMatchMedia(false);

    const { get } = await renderTheme();

    act(() => {
      get().applyFromSync('invalid' as any);
    });

    expect(get().themeMode).toBe('system');
    expect(localStorage.getItem(THEME_KEY)).toBeNull();
  });

  it('responds to system theme changes when in system mode', async () => {
    const { mql } = setupMatchMedia(false);

    const { get } = await renderTheme();

    expect(get().themeMode).toBe('system');
    expect(get().darkMode).toBe(false);

    act(() => {
      mql.dispatch(true);
    });

    expect(get().darkMode).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    act(() => {
      get().setThemeAndApply('light');
    });

    act(() => {
      mql.dispatch(false);
    });

    expect(get().themeMode).toBe('light');
    expect(get().darkMode).toBe(false);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('does not throw when localStorage.setItem throws', async () => {
    setupMatchMedia(false);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });

    const { get } = await renderTheme();

    expect(() => {
      act(() => {
        get().setThemeAndApply('dark');
      });
    }).not.toThrow();

    expect(get().themeMode).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem(THEME_KEY)).toBeNull();
  });
});
