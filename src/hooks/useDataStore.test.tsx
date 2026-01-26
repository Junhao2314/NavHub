import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act, useEffect } from 'react';
import { useDataStore } from './useDataStore';
import { LOCAL_STORAGE_KEY } from '../utils/constants';
import type { Category, LinkItem } from '../types';

const dialog = vi.hoisted(() => ({
  notify: vi.fn(),
  confirm: vi.fn(),
}));

vi.mock('../components/ui/DialogProvider', () => ({
  useDialog: () => dialog,
}));

describe('useDataStore', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  const renderStore = async () => {
    let api: ReturnType<typeof useDataStore> | null = null;

    function Harness() {
      const value = useDataStore();
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
        if (!api) throw new Error('useDataStore not initialized');
        return api;
      },
    };
  };

  beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    dialog.notify.mockReset();
    localStorage.clear();
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    vi.stubGlobal('crypto', { randomUUID: () => 'id-1' } as any);
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
  });

  it('loads stored data and normalizes categories and link categoryId', async () => {
    const storedCategories: Category[] = [
      { id: 'dev', name: 'Dev', icon: 'Code' },
      { id: 'common', name: 'Common', icon: 'Star' },
      { id: 'design', name: 'Design', icon: 'Palette' },
    ];
    const storedLinks: LinkItem[] = [
      { id: 'l1', title: 'T', url: 'https://t.com', categoryId: 'missing', createdAt: 1 },
    ];

    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({ links: storedLinks, categories: storedCategories }));

    const { get } = await renderStore();

    expect(get().isLoaded).toBe(true);
    expect(get().categories[0]?.id).toBe('common');
    expect(get().links[0]?.categoryId).toBe('common');
  });

  it('addLink normalizes URL and persists to localStorage', async () => {
    const storedCategories: Category[] = [
      { id: 'common', name: 'Common', icon: 'Star' },
      { id: 'dev', name: 'Dev', icon: 'Code' },
    ];
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({ links: [], categories: storedCategories }));

    const { get } = await renderStore();

    act(() => {
      get().addLink({ title: 'Example', url: 'example.com', categoryId: 'dev' } as any);
    });

    const added = get().links.find((l) => l.id === 'id-1');
    expect(added?.url).toBe('https://example.com');
    expect(added?.createdAt).toBe(1000);
    expect(added?.order).toBe(0);

    const persisted = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) ?? '{}');
    expect(persisted.links.some((l: LinkItem) => l.id === 'id-1')).toBe(true);
  });

  it('deleteCategory warns when trying to delete the last category', async () => {
    const storedCategories: Category[] = [{ id: 'only', name: 'Only', icon: 'Star' }];
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({ links: [], categories: storedCategories }));

    const { get } = await renderStore();

    act(() => {
      get().deleteCategory('only');
    });

    expect(dialog.notify).toHaveBeenCalledWith('至少保留一个分类', 'warning');
    expect(get().categories).toHaveLength(1);
  });

  it('deleteCategory removes category and reassigns links to fallback', async () => {
    const storedCategories: Category[] = [
      { id: 'common', name: 'Common', icon: 'Star' },
      { id: 'dev', name: 'Dev', icon: 'Code' },
    ];
    const storedLinks: LinkItem[] = [
      { id: 'l1', title: 'T', url: 'https://t.com', categoryId: 'dev', createdAt: 1 },
    ];
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({ links: storedLinks, categories: storedCategories }));

    const { get } = await renderStore();

    act(() => {
      get().deleteCategory('dev');
    });

    expect(get().categories.map((c) => c.id)).toEqual(['common']);
    expect(get().links[0]?.categoryId).toBe('common');
  });
});

