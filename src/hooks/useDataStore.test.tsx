import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Category, LinkItem } from '../types';
import { LOCAL_STORAGE_KEY } from '../utils/constants';
import { flushScheduledLocalStorageWrite } from '../utils/storage';
import { useDataStore } from './useDataStore';

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

    localStorage.setItem(
      LOCAL_STORAGE_KEY,
      JSON.stringify({ links: storedLinks, categories: storedCategories }),
    );

    const { get } = await renderStore();

    expect(get().isLoaded).toBe(true);
    expect(get().categories[0]?.id).toBe('common');
    expect(get().links[0]?.categoryId).toBe('common');
  });

  it('migrates stored category icons (trim + normalize) and persists', async () => {
    const storedCategories: Category[] = [
      { id: 'common', name: 'Common', icon: ' star ' },
      { id: 'weather', name: 'Weather', icon: ' cloud-rain ' },
      { id: 'emoji', name: 'Emoji', icon: ' 🔥 ' },
      { id: 'legacy', name: 'Legacy', icon: 'folder-open' },
      { id: 'broken', name: 'Broken', icon: 'unknown-icon' },
    ];
    const storedLinks: LinkItem[] = [
      { id: 'l1', title: 'T', url: 'https://t.com', categoryId: 'common', createdAt: 1 },
    ];

    localStorage.setItem(
      LOCAL_STORAGE_KEY,
      JSON.stringify({ links: storedLinks, categories: storedCategories }),
    );

    const { get } = await renderStore();

    expect(get().categories.find((c) => c.id === 'common')?.icon).toBe('Star');
    expect(get().categories.find((c) => c.id === 'weather')?.icon).toBe('CloudRain');
    expect(get().categories.find((c) => c.id === 'emoji')?.icon).toBe('🔥');
    expect(get().categories.find((c) => c.id === 'legacy')?.icon).toBe('FolderOpen');
    expect(get().categories.find((c) => c.id === 'broken')?.icon).toBe('Folder');

    flushScheduledLocalStorageWrite(LOCAL_STORAGE_KEY);
    const persisted = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) ?? '{}');
    expect(persisted.categories.find((c: Category) => c.id === 'common')?.icon).toBe('Star');
    expect(persisted.categories.find((c: Category) => c.id === 'weather')?.icon).toBe('CloudRain');
    expect(persisted.categories.find((c: Category) => c.id === 'emoji')?.icon).toBe('🔥');
    expect(persisted.categories.find((c: Category) => c.id === 'legacy')?.icon).toBe('FolderOpen');
    expect(persisted.categories.find((c: Category) => c.id === 'broken')?.icon).toBe('Folder');
    expect(dialog.notify).toHaveBeenCalledTimes(1);
    expect(dialog.notify).toHaveBeenCalledWith(expect.stringContaining('Lucide'), 'warning');
    const notice = dialog.notify.mock.calls[0]?.[0] as string;
    expect(notice).toContain('Broken');
    expect(notice).not.toContain('Legacy');
  });

  it('addLink normalizes URL and persists to localStorage', async () => {
    const storedCategories: Category[] = [
      { id: 'common', name: 'Common', icon: 'Star' },
      { id: 'dev', name: 'Dev', icon: 'Code' },
    ];
    localStorage.setItem(
      LOCAL_STORAGE_KEY,
      JSON.stringify({ links: [], categories: storedCategories }),
    );

    const { get } = await renderStore();

    act(() => {
      get().addLink({ title: 'Example', url: 'example.com', categoryId: 'dev' } as any);
    });

    const added = get().links.find((l) => l.id === 'id-1');
    expect(added?.url).toBe('https://example.com');
    expect(added?.createdAt).toBe(1000);
    expect(added?.order).toBe(0);

    flushScheduledLocalStorageWrite(LOCAL_STORAGE_KEY);
    const persisted = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) ?? '{}');
    expect(persisted.links.some((l: LinkItem) => l.id === 'id-1')).toBe(true);
  });

  it('deleteCategory warns when trying to delete the last category', async () => {
    const storedCategories: Category[] = [{ id: 'only', name: 'Only', icon: 'Star' }];
    localStorage.setItem(
      LOCAL_STORAGE_KEY,
      JSON.stringify({ links: [], categories: storedCategories }),
    );

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
    localStorage.setItem(
      LOCAL_STORAGE_KEY,
      JSON.stringify({ links: storedLinks, categories: storedCategories }),
    );

    const { get } = await renderStore();

    act(() => {
      get().deleteCategory('dev');
    });

    expect(get().categories.map((c) => c.id)).toEqual(['common']);
    expect(get().links[0]?.categoryId).toBe('common');
  });

  it('updateLink normalizes URL and persists changes', async () => {
    const storedCategories: Category[] = [{ id: 'dev', name: 'Dev', icon: 'Code' }];
    const storedLinks: LinkItem[] = [
      { id: 'l1', title: 'Old', url: 'https://old.com', categoryId: 'dev', createdAt: 1 },
    ];
    localStorage.setItem(
      LOCAL_STORAGE_KEY,
      JSON.stringify({ links: storedLinks, categories: storedCategories }),
    );

    const { get } = await renderStore();

    act(() => {
      get().updateLink({ id: 'l1', title: 'New', url: 'example.com', categoryId: 'dev' } as any);
    });

    expect(get().links.find((l) => l.id === 'l1')?.url).toBe('https://example.com');
    flushScheduledLocalStorageWrite(LOCAL_STORAGE_KEY);
    const persisted = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) ?? '{}');
    expect(persisted.links.find((l: LinkItem) => l.id === 'l1')?.url).toBe('https://example.com');
  });

  it('updateLink warns and ignores invalid URL', async () => {
    const storedCategories: Category[] = [{ id: 'dev', name: 'Dev', icon: 'Code' }];
    const storedLinks: LinkItem[] = [
      { id: 'l1', title: 'Old', url: 'https://old.com', categoryId: 'dev', createdAt: 1 },
    ];
    localStorage.setItem(
      LOCAL_STORAGE_KEY,
      JSON.stringify({ links: storedLinks, categories: storedCategories }),
    );

    const { get } = await renderStore();

    act(() => {
      get().updateLink({
        id: 'l1',
        title: 'New',
        url: 'ftp://example.com',
        categoryId: 'dev',
      } as any);
    });

    expect(dialog.notify).toHaveBeenCalledWith('链接 URL 无效（仅支持 http/https）。', 'warning');
    expect(get().links.find((l) => l.id === 'l1')?.url).toBe('https://old.com');
  });

  it('deleteLink removes link and persists to localStorage', async () => {
    const storedCategories: Category[] = [{ id: 'dev', name: 'Dev', icon: 'Code' }];
    const storedLinks: LinkItem[] = [
      { id: 'l1', title: 'One', url: 'https://one.com', categoryId: 'dev', createdAt: 1 },
      { id: 'l2', title: 'Two', url: 'https://two.com', categoryId: 'dev', createdAt: 2 },
    ];
    localStorage.setItem(
      LOCAL_STORAGE_KEY,
      JSON.stringify({ links: storedLinks, categories: storedCategories }),
    );

    const { get } = await renderStore();

    act(() => {
      get().deleteLink('l1');
    });

    expect(get().links.map((l) => l.id)).toEqual(['l2']);
    flushScheduledLocalStorageWrite(LOCAL_STORAGE_KEY);
    const persisted = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) ?? '{}');
    expect(persisted.links.map((l: LinkItem) => l.id)).toEqual(['l2']);
  });

  it('recordAdminLinkClick increments clicks and persists timestamp', async () => {
    const storedCategories: Category[] = [{ id: 'dev', name: 'Dev', icon: 'Code' }];
    const storedLinks: LinkItem[] = [
      { id: 'l1', title: 'One', url: 'https://one.com', categoryId: 'dev', createdAt: 1 },
    ];
    localStorage.setItem(
      LOCAL_STORAGE_KEY,
      JSON.stringify({ links: storedLinks, categories: storedCategories }),
    );

    const { get } = await renderStore();

    act(() => {
      get().recordAdminLinkClick('l1');
    });

    const updated = get().links.find((l) => l.id === 'l1');
    expect(updated?.adminClicks).toBe(1);
    expect(updated?.adminLastClickedAt).toBe(1000);

    flushScheduledLocalStorageWrite(LOCAL_STORAGE_KEY);
    const persisted = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) ?? '{}');
    const stored = persisted.links.find((l: LinkItem) => l.id === 'l1');
    expect(stored?.adminClicks).toBe(1);
    expect(stored?.adminLastClickedAt).toBe(1000);
  });

  it('togglePin toggles pinned state and assigns pinnedOrder', async () => {
    const storedCategories: Category[] = [{ id: 'dev', name: 'Dev', icon: 'Code' }];
    const storedLinks: LinkItem[] = [
      {
        id: 'p1',
        title: 'Pinned',
        url: 'https://pinned.com',
        categoryId: 'dev',
        createdAt: 1,
        pinned: true,
        pinnedOrder: 0,
      },
      { id: 'l1', title: 'One', url: 'https://one.com', categoryId: 'dev', createdAt: 2 },
    ];
    localStorage.setItem(
      LOCAL_STORAGE_KEY,
      JSON.stringify({ links: storedLinks, categories: storedCategories }),
    );

    const { get } = await renderStore();

    act(() => {
      get().togglePin('l1');
    });

    const pinned = get().links.find((l) => l.id === 'l1');
    expect(pinned?.pinned).toBe(true);
    expect(pinned?.pinnedOrder).toBe(1);

    act(() => {
      get().togglePin('l1');
    });

    const unpinned = get().links.find((l) => l.id === 'l1');
    expect(unpinned?.pinned).toBe(false);
    expect(unpinned?.pinnedOrder).toBeUndefined();
  });

  it('reorderLinks(common) assigns recommendedOrder and marks auto link as recommended', async () => {
    const storedCategories: Category[] = [
      { id: 'common', name: 'Common', icon: 'Star' },
      { id: 'dev', name: 'Dev', icon: 'Code' },
    ];
    const storedLinks: LinkItem[] = [
      { id: 'm', title: 'Manual', url: 'https://manual.com', categoryId: 'common', createdAt: 1 },
      {
        id: 'a',
        title: 'Auto',
        url: 'https://auto.com',
        categoryId: 'dev',
        createdAt: 2,
        adminClicks: 20,
      },
    ];
    localStorage.setItem(
      LOCAL_STORAGE_KEY,
      JSON.stringify({ links: storedLinks, categories: storedCategories }),
    );

    const { get } = await renderStore();

    act(() => {
      get().reorderLinks('a', 'm', 'common');
    });

    const auto = get().links.find((l) => l.id === 'a');
    const manual = get().links.find((l) => l.id === 'm');
    expect(auto?.recommended).toBe(true);
    expect(auto?.recommendedOrder).toBe(0);
    expect(manual?.recommendedOrder).toBe(1);
  });

  it('reorderPinnedLinks updates pinnedOrder and keeps pinned links first', async () => {
    const storedCategories: Category[] = [{ id: 'dev', name: 'Dev', icon: 'Code' }];
    const storedLinks: LinkItem[] = [
      {
        id: 'p1',
        title: 'Pinned 1',
        url: 'https://p1.com',
        categoryId: 'dev',
        createdAt: 1,
        pinned: true,
        pinnedOrder: 0,
      },
      {
        id: 'p2',
        title: 'Pinned 2',
        url: 'https://p2.com',
        categoryId: 'dev',
        createdAt: 2,
        pinned: true,
        pinnedOrder: 1,
      },
      { id: 'l1', title: 'One', url: 'https://one.com', categoryId: 'dev', createdAt: 3, order: 0 },
    ];
    localStorage.setItem(
      LOCAL_STORAGE_KEY,
      JSON.stringify({ links: storedLinks, categories: storedCategories }),
    );

    const { get } = await renderStore();

    act(() => {
      get().reorderPinnedLinks('p2', 'p1');
    });

    expect(get().links[0]?.id).toBe('p2');
    expect(get().links[0]?.pinnedOrder).toBe(0);
    expect(get().links[1]?.id).toBe('p1');
    expect(get().links[1]?.pinnedOrder).toBe(1);
  });

  it('importData merges categories by id/name and appends links', async () => {
    const storedCategories: Category[] = [
      { id: 'common', name: 'Common', icon: 'Star' },
      { id: 'dev', name: 'Dev', icon: 'Code' },
    ];
    const storedLinks: LinkItem[] = [
      { id: 'l1', title: 'One', url: 'https://one.com', categoryId: 'dev', createdAt: 1 },
    ];
    localStorage.setItem(
      LOCAL_STORAGE_KEY,
      JSON.stringify({ links: storedLinks, categories: storedCategories }),
    );

    const { get } = await renderStore();

    act(() => {
      get().importData(
        [
          {
            id: 'l2',
            title: 'Two',
            url: 'https://two.com',
            categoryId: 'dev',
            createdAt: 2,
          } as any,
        ],
        [
          { id: 'dev', name: 'Dev', icon: 'Code' },
          { id: 'x', name: 'Dev', icon: 'Code' },
          { id: 'design', name: 'Design', icon: 'Palette' },
        ] as any,
      );
    });

    expect(get().links.map((l) => l.id)).toEqual(['l1', 'l2']);
    expect(get().categories.map((c) => c.id)).toContain('design');
    expect(get().categories.filter((c) => c.name === 'Dev')).toHaveLength(1);

    flushScheduledLocalStorageWrite(LOCAL_STORAGE_KEY);
    const persisted = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) ?? '{}');
    expect(persisted.links.map((l: LinkItem) => l.id)).toEqual(['l1', 'l2']);
    expect(persisted.categories.filter((c: Category) => c.name === 'Dev')).toHaveLength(1);
  });
});
