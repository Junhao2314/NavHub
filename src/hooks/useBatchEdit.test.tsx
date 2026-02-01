import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Category, LinkItem } from '../types';
import { useBatchEdit } from './useBatchEdit';

const dialog = vi.hoisted(() => ({
  notify: vi.fn(),
  confirm: vi.fn(),
}));

vi.mock('../components/ui/DialogProvider', () => ({
  useDialog: () => dialog,
}));

describe('useBatchEdit', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  const categories: Category[] = [
    { id: 'dev', name: 'Dev', icon: 'Code' },
    { id: 'design', name: 'Design', icon: 'Palette' },
  ];

  const links: LinkItem[] = [
    { id: '1', title: 'A', url: 'https://a.com', categoryId: 'dev', createdAt: 1 },
    {
      id: '2',
      title: 'B',
      url: 'https://b.com',
      categoryId: 'dev',
      createdAt: 2,
      pinned: true,
      pinnedOrder: 0,
    },
    { id: '3', title: 'C', url: 'https://c.com', categoryId: 'dev', createdAt: 3 },
  ];

  const displayedLinks: LinkItem[] = [links[0]!, links[2]!];

  const renderBatchEdit = async (updateData = vi.fn()) => {
    let api: ReturnType<typeof useBatchEdit> | null = null;

    function Harness() {
      const value = useBatchEdit({ links, categories, displayedLinks, updateData });
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
        if (!api) throw new Error('useBatchEdit not initialized');
        return api;
      },
      updateData,
    };
  };

  beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    dialog.notify.mockReset();
    dialog.confirm.mockReset();
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

  it('toggles selection and select-all behavior', async () => {
    const { get } = await renderBatchEdit();

    expect(get().selectedLinks.size).toBe(0);

    act(() => {
      get().toggleLinkSelection('1');
    });
    expect(get().selectedLinks.has('1')).toBe(true);

    act(() => {
      get().toggleLinkSelection('1');
    });
    expect(get().selectedLinks.has('1')).toBe(false);

    act(() => {
      get().handleSelectAll();
    });
    expect(get().selectedLinks.size).toBe(displayedLinks.length);
    expect(displayedLinks.every((link) => get().selectedLinks.has(link.id))).toBe(true);

    act(() => {
      get().handleSelectAll();
    });
    expect(get().selectedLinks.size).toBe(0);
  });

  it('handleBatchMove warns with no selection and moves selected links', async () => {
    const { get, updateData } = await renderBatchEdit();

    act(() => {
      get().handleBatchMove('design');
    });
    expect(dialog.notify).toHaveBeenCalledWith('请先选择要移动的链接', 'warning');
    expect(updateData).not.toHaveBeenCalled();

    act(() => {
      get().toggleBatchEditMode();
      get().toggleLinkSelection('1');
    });

    act(() => {
      get().handleBatchMove('design');
    });

    expect(updateData).toHaveBeenCalledTimes(1);
    const [newLinks] = updateData.mock.calls[0] ?? [];
    expect(newLinks.find((l: LinkItem) => l.id === '1')?.categoryId).toBe('design');
    expect(get().selectedLinks.size).toBe(0);
    expect(get().isBatchEditMode).toBe(false);
  });

  it('handleBatchDelete respects confirm result', async () => {
    const { get, updateData } = await renderBatchEdit();

    dialog.confirm.mockResolvedValue(false);

    act(() => {
      get().toggleBatchEditMode();
      get().toggleLinkSelection('1');
    });

    await act(async () => {
      await get().handleBatchDelete();
    });

    expect(updateData).not.toHaveBeenCalled();
    expect(get().selectedLinks.has('1')).toBe(true);
    expect(get().isBatchEditMode).toBe(true);

    dialog.confirm.mockResolvedValue(true);

    await act(async () => {
      await get().handleBatchDelete();
    });

    expect(updateData).toHaveBeenCalledTimes(1);
    const [newLinks] = updateData.mock.calls[0] ?? [];
    expect(newLinks.some((l: LinkItem) => l.id === '1')).toBe(false);
    expect(get().selectedLinks.size).toBe(0);
    expect(get().isBatchEditMode).toBe(false);
  });

  it('handleBatchPin assigns pinnedOrder after existing pinned links', async () => {
    const updateData = vi.fn();
    const { get } = await renderBatchEdit(updateData);

    act(() => {
      get().toggleLinkSelection('1');
      get().toggleLinkSelection('3');
    });

    act(() => {
      get().handleBatchPin();
    });

    expect(updateData).toHaveBeenCalledTimes(1);
    const [newLinks] = updateData.mock.calls[0] ?? [];

    const link1 = newLinks.find((l: LinkItem) => l.id === '1');
    const link3 = newLinks.find((l: LinkItem) => l.id === '3');

    expect(link1?.pinned).toBe(true);
    expect(link3?.pinned).toBe(true);
    expect(link1?.pinnedOrder).toBe(1);
    expect(link3?.pinnedOrder).toBe(2);
    expect(get().selectedLinks.size).toBe(0);
  });
});
