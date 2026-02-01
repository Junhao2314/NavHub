import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetAppStore } from '../stores/useAppStore';
import type { Category } from '../types';
import { useSidebar } from './useSidebar';

describe('useSidebar', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  const renderSidebar = async () => {
    let api: ReturnType<typeof useSidebar> | null = null;

    function Harness() {
      const value = useSidebar();
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
        if (!api) throw new Error('useSidebar not initialized');
        return api;
      },
    };
  };

  beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    resetAppStore();
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

  it('opens/closes sidebar and selects categories', async () => {
    const { get } = await renderSidebar();

    expect(get().sidebarOpen).toBe(false);
    expect(get().selectedCategory).toBe('all');

    act(() => {
      get().openSidebar();
    });
    expect(get().sidebarOpen).toBe(true);

    act(() => {
      get().selectCategory('dev');
    });
    expect(get().selectedCategory).toBe('dev');
    expect(get().sidebarOpen).toBe(false);

    act(() => {
      get().openSidebar();
      get().selectAll();
    });
    expect(get().selectedCategory).toBe('all');
    expect(get().sidebarOpen).toBe(false);

    const cat: Category = { id: 'design', name: 'Design', icon: 'Palette' };
    act(() => {
      get().openSidebar();
      get().handleCategoryClick(cat);
    });
    expect(get().selectedCategory).toBe('design');
    expect(get().sidebarOpen).toBe(false);
  });

  it('toggles collapsed state and updates width class', async () => {
    const { get } = await renderSidebar();

    expect(get().isSidebarCollapsed).toBe(false);
    expect(get().sidebarWidthClass).toBe('w-64 lg:w-56');

    act(() => {
      get().toggleSidebarCollapsed();
    });

    expect(get().isSidebarCollapsed).toBe(true);
    expect(get().sidebarWidthClass).toBe('w-64 lg:w-20');
  });
});
