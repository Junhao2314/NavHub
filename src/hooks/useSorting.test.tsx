import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Category, LinkItem } from '../types';
import { useSorting } from './useSorting';

describe('useSorting', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubGlobal('PointerEvent', class PointerEvent {} as any);
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

  it('tracks sorting state and invokes callbacks on save', async () => {
    const updateData = vi.fn();
    const reorderLinks = vi.fn();
    const reorderPinnedLinks = vi.fn();

    const links: LinkItem[] = [
      { id: '1', title: 't', url: 'https://e.com', categoryId: 'dev', createdAt: 1 },
    ];
    const categories: Category[] = [{ id: 'dev', name: 'Dev', icon: 'Code' }];

    let api = {} as ReturnType<typeof useSorting>;
    function Harness() {
      const value = useSorting({
        links,
        categories,
        selectedCategory: 'dev',
        updateData,
        reorderLinks,
        reorderPinnedLinks,
      });
      useEffect(() => {
        api = value;
      }, [value]);
      return null;
    }

    root = createRoot(container);
    await act(async () => {
      root?.render(<Harness />);
    });

    expect(api.isSortingMode).toBeNull();
    expect(api.isSortingPinned).toBe(false);
    expect(api.isSortingCategory).toBe(false);

    act(() => {
      api.startSorting('dev');
    });
    expect(api.isSortingMode).toBe('dev');
    expect(api.isSortingCategory).toBe(true);

    act(() => {
      api.saveSorting();
    });
    expect(updateData).toHaveBeenCalledWith(links, categories);
    expect(api.isSortingMode).toBeNull();

    act(() => {
      api.startPinnedSorting();
    });
    expect(api.isSortingPinned).toBe(true);

    act(() => {
      api.savePinnedSorting();
    });
    expect(updateData).toHaveBeenCalledWith(links, categories);
    expect(api.isSortingPinned).toBe(false);
  });

  it('calls reorder handlers for valid drag events', async () => {
    const updateData = vi.fn();
    const reorderLinks = vi.fn();
    const reorderPinnedLinks = vi.fn();

    let api = {} as ReturnType<typeof useSorting>;
    function Harness() {
      const value = useSorting({
        links: [],
        categories: [],
        selectedCategory: 'dev',
        updateData,
        reorderLinks,
        reorderPinnedLinks,
      });
      useEffect(() => {
        api = value;
      }, [value]);
      return null;
    }

    root = createRoot(container);
    await act(async () => {
      root?.render(<Harness />);
    });

    act(() => {
      api.handleDragEnd({ active: { id: 'a' }, over: { id: 'b' } } as any);
    });
    expect(reorderLinks).toHaveBeenCalledWith('a', 'b', 'dev');

    act(() => {
      api?.handlePinnedDragEnd({ active: { id: 'p1' }, over: { id: 'p2' } } as any);
    });
    expect(reorderPinnedLinks).toHaveBeenCalledWith('p1', 'p2');

    reorderLinks.mockClear();
    reorderPinnedLinks.mockClear();

    act(() => {
      api?.handleDragEnd({ active: { id: 'a' }, over: { id: 'a' } } as any);
      api?.handlePinnedDragEnd({ active: { id: 'p1' }, over: null } as any);
    });

    expect(reorderLinks).not.toHaveBeenCalled();
    expect(reorderPinnedLinks).not.toHaveBeenCalled();
  });
});
