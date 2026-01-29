import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Category, LinkItem } from '../types';
import { useContextMenu } from './useContextMenu';

const dialog = vi.hoisted(() => ({
  notify: vi.fn(),
  confirm: vi.fn(),
}));

vi.mock('../components/ui/DialogProvider', () => ({
  useDialog: () => dialog,
}));

describe('useContextMenu', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  const categories: Category[] = [{ id: 'dev', name: 'Dev', icon: 'Code' }];
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
  ];

  const renderMenu = async (isBatchEditMode: boolean) => {
    const updateData = vi.fn();
    const onEditLink = vi.fn();
    let api: ReturnType<typeof useContextMenu> | null = null;

    function Harness() {
      const value = useContextMenu({ links, categories, updateData, onEditLink, isBatchEditMode });
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
        if (!api) throw new Error('useContextMenu not initialized');
        return api;
      },
      updateData,
      onEditLink,
    };
  };

  const openFor = (api: ReturnType<typeof useContextMenu>, link: LinkItem) => {
    const event = {
      clientX: 10,
      clientY: 20,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as any;

    act(() => {
      api.handleContextMenu(event, link);
    });

    return event;
  };

  beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    dialog.confirm.mockReset();
    dialog.notify.mockReset();
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

  it('disables context menu in batch edit mode', async () => {
    const { get } = await renderMenu(true);
    const event = openFor(get(), links[0]!);

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
    expect(get().contextMenu.isOpen).toBe(false);
  });

  it('opens and closes context menu with correct position', async () => {
    const { get } = await renderMenu(false);
    openFor(get(), links[0]!);

    expect(get().contextMenu.isOpen).toBe(true);
    expect(get().contextMenu.position).toEqual({ x: 10, y: 20 });
    expect(get().contextMenu.link?.id).toBe('1');

    act(() => {
      get().closeContextMenu();
    });
    expect(get().contextMenu.isOpen).toBe(false);
    expect(get().contextMenu.link).toBeNull();
  });

  it('copies link to clipboard and closes menu', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    const { get } = await renderMenu(false);
    openFor(get(), links[0]!);

    act(() => {
      get().copyLinkToClipboard();
    });

    expect(writeText).toHaveBeenCalledWith('https://a.com');
    expect(get().contextMenu.isOpen).toBe(false);
  });

  it('deleteLinkFromContextMenu respects confirm and always closes', async () => {
    const { get, updateData } = await renderMenu(false);
    openFor(get(), links[0]!);

    dialog.confirm.mockResolvedValue(false);
    await act(async () => {
      await get().deleteLinkFromContextMenu();
    });
    expect(updateData).not.toHaveBeenCalled();
    expect(get().contextMenu.isOpen).toBe(false);

    openFor(get(), links[0]!);
    dialog.confirm.mockResolvedValue(true);
    await act(async () => {
      await get().deleteLinkFromContextMenu();
    });

    expect(updateData).toHaveBeenCalledTimes(1);
    const [newLinks] = updateData.mock.calls[0] ?? [];
    expect(newLinks.some((l: LinkItem) => l.id === '1')).toBe(false);
    expect(get().contextMenu.isOpen).toBe(false);
  });

  it('togglePinFromContextMenu toggles pinned state and assigns order', async () => {
    const { get, updateData } = await renderMenu(false);
    openFor(get(), links[0]!);

    act(() => {
      get().togglePinFromContextMenu();
    });

    expect(updateData).toHaveBeenCalledTimes(1);
    const [newLinks] = updateData.mock.calls[0] ?? [];
    const updated = newLinks.find((l: LinkItem) => l.id === '1');
    expect(updated?.pinned).toBe(true);
    expect(updated?.pinnedOrder).toBe(1);
    expect(get().contextMenu.isOpen).toBe(false);
  });

  it('duplicateLinkFromContextMenu appends a copy and closes menu', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(123);

    const { get, updateData } = await renderMenu(false);
    openFor(get(), links[0]!);

    act(() => {
      get().duplicateLinkFromContextMenu();
    });

    expect(updateData).toHaveBeenCalledTimes(1);
    const [newLinks] = updateData.mock.calls[0] ?? [];
    const added = newLinks.find((l: LinkItem) => l.id === '123');
    expect(added?.title).toBe('A (副本)');
    expect(added?.pinned).toBe(false);
    expect(added?.createdAt).toBe(123);
    expect(get().contextMenu.isOpen).toBe(false);
  });
});
