import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetAppStore } from '../stores/useAppStore';
import type { AIConfig, SiteSettings } from '../types';
import { AI_API_KEY_SESSION_KEY, AI_CONFIG_KEY, SITE_SETTINGS_KEY } from '../utils/constants';
import { useConfig } from './useConfig';

describe('useConfig', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  const renderConfig = async () => {
    let api: ReturnType<typeof useConfig> | null = null;

    function Harness() {
      const value = useConfig();
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
        if (!api) throw new Error('useConfig not initialized');
        return api;
      },
    };
  };

  const clearFavicons = () => {
    document.querySelectorAll('link[rel="icon"]').forEach((node) => {
      node.remove();
    });
  };

  beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    resetAppStore();
    localStorage.clear();
    sessionStorage.clear();
    clearFavicons();
    document.title = '';
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
    clearFavicons();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('loads defaults and updates document title', async () => {
    const { get } = await renderConfig();

    expect(get().aiConfig.provider).toBe('gemini');
    expect(get().aiConfig.model).toBe('gemini-2.5-flash');
    expect(get().siteSettings.title).toBe('NavHub - AI Smart Navigator');
    expect(document.title).toBe('NavHub - AI Smart Navigator');
    expect(get().navTitleText).toBe('NavHub');
    expect(get().navTitleShort).toBe('Na');
  });

  it('restores saved config from localStorage', async () => {
    const savedAIConfig: AIConfig = {
      provider: 'openai',
      apiKey: 'k',
      baseUrl: 'https://api',
      model: 'gpt',
    };
    const savedSiteSettings: SiteSettings = {
      title: 'My Title',
      navTitle: 'MyNav',
      favicon: 'https://example.com/favicon.ico',
      cardStyle: 'simple',
      accentColor: '1 2 3',
      grayScale: 'zinc',
      closeOnBackdrop: true,
      backgroundImage: '',
      backgroundImageEnabled: false,
      backgroundMotion: false,
    };

    localStorage.setItem(AI_CONFIG_KEY, JSON.stringify(savedAIConfig));
    localStorage.setItem(SITE_SETTINGS_KEY, JSON.stringify(savedSiteSettings));

    const { get } = await renderConfig();

    expect(get().aiConfig).toEqual(savedAIConfig);
    expect(sessionStorage.getItem(AI_API_KEY_SESSION_KEY)).toBe('k');
    expect(JSON.parse(localStorage.getItem(AI_CONFIG_KEY) ?? '{}').apiKey).toBe('');
    expect(get().siteSettings).toEqual(savedSiteSettings);
    expect(get().navTitleText).toBe('MyNav');
    expect(get().navTitleShort).toBe('My');
    expect(document.title).toBe('My Title');

    const icon = document.querySelector('link[rel="icon"]') as HTMLLinkElement | null;
    expect(icon?.href).toBe('https://example.com/favicon.ico');
  });

  it('saveAIConfig persists AI config and optional site settings', async () => {
    const { get } = await renderConfig();

    const nextAIConfig: AIConfig = {
      provider: 'openai',
      apiKey: 'k2',
      baseUrl: 'https://api2',
      model: 'gpt-2',
    };
    const nextSiteSettings: SiteSettings = {
      ...get().siteSettings,
      title: 'Next Title',
      navTitle: 'NT',
      favicon: 'https://example.com/next.ico',
    };

    act(() => {
      get().saveAIConfig(nextAIConfig, nextSiteSettings);
    });

    expect(get().aiConfig).toEqual(nextAIConfig);
    expect(get().siteSettings.title).toBe('Next Title');
    expect(document.title).toBe('Next Title');

    expect(JSON.parse(localStorage.getItem(AI_CONFIG_KEY) ?? '{}')).toEqual({
      ...nextAIConfig,
      apiKey: '',
    });
    expect(sessionStorage.getItem(AI_API_KEY_SESSION_KEY)).toBe(nextAIConfig.apiKey);
    expect(JSON.parse(localStorage.getItem(SITE_SETTINGS_KEY) ?? '{}').title).toBe('Next Title');

    const icon = document.querySelector('link[rel="icon"]') as HTMLLinkElement | null;
    expect(icon?.href).toBe('https://example.com/next.ico');
  });

  it('saveAIConfig keeps apiKey in localStorage when sessionStorage is blocked', async () => {
    const realSessionStorage = sessionStorage;
    vi.stubGlobal('sessionStorage', {
      setItem: () => {
        throw new Error('blocked');
      },
      getItem: () => null,
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      get length() {
        return 0;
      },
    } as unknown as Storage);

    const { get } = await renderConfig();

    const nextAIConfig: AIConfig = {
      provider: 'openai',
      apiKey: 'k2',
      baseUrl: 'https://api2',
      model: 'gpt-2',
    };

    act(() => {
      get().saveAIConfig(nextAIConfig);
    });

    expect(get().aiConfig).toEqual(nextAIConfig);
    expect(realSessionStorage.getItem(AI_API_KEY_SESSION_KEY)).toBeNull();
    expect(JSON.parse(localStorage.getItem(AI_CONFIG_KEY) ?? '{}').apiKey).toBe('k2');
  });

  it('updateSiteSettings merges updates and replaces favicon links', async () => {
    const { get } = await renderConfig();

    const existing = document.createElement('link');
    existing.rel = 'icon';
    existing.href = 'https://example.com/old.ico';
    document.head.appendChild(existing);

    act(() => {
      get().updateSiteSettings({ favicon: 'https://example.com/new.ico', cardStyle: 'simple' });
    });

    const icons = Array.from(document.querySelectorAll('link[rel="icon"]')) as HTMLLinkElement[];
    expect(icons).toHaveLength(1);
    expect(icons[0]?.href).toBe('https://example.com/new.ico');
    expect(get().siteSettings.cardStyle).toBe('simple');

    act(() => {
      get().handleViewModeChange('detailed');
    });
    expect(get().siteSettings.cardStyle).toBe('detailed');
  });
});
