import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Category } from '../../types';
import ContextMenu from './ContextMenu';

describe('ContextMenu', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  const categories: Category[] = [
    { id: 'cat-1', name: '分类 1', icon: 'Folder' },
    { id: 'cat-2', name: '分类 2', icon: 'Folder' },
  ];

  const render = async (options: {
    isOpen: boolean;
    isRecommended?: boolean;
    onClose?: () => void;
    onCopyLink?: () => void;
    onEditLink?: () => void;
    onDuplicateLink?: () => void;
    onMoveLink?: (categoryId: string) => void;
    onDeleteLink?: () => void;
    onTogglePin?: () => void;
    onToggleRecommended?: () => void;
  }) => {
    if (!root) root = createRoot(container);
    await act(async () => {
      root?.render(
        <ContextMenu
          isOpen={options.isOpen}
          position={{ x: 10, y: 20 }}
          categories={categories}
          isRecommended={options.isRecommended ?? false}
          onClose={options.onClose ?? vi.fn()}
          onCopyLink={options.onCopyLink ?? vi.fn()}
          onEditLink={options.onEditLink ?? vi.fn()}
          onDuplicateLink={options.onDuplicateLink ?? vi.fn()}
          onMoveLink={options.onMoveLink ?? vi.fn()}
          onDeleteLink={options.onDeleteLink ?? vi.fn()}
          onTogglePin={options.onTogglePin ?? vi.fn()}
          onToggleRecommended={options.onToggleRecommended ?? vi.fn()}
        />,
      );
    });
  };

  beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
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
    vi.restoreAllMocks();
  });

  it('renders null when closed', async () => {
    await render({ isOpen: false });
    expect(container.innerHTML).toBe('');
  });

  it('closes on outside click and Escape', async () => {
    const onClose = vi.fn();
    await render({ isOpen: true, onClose });

    expect(document.body.style.overflow).toBe('hidden');

    await act(async () => {
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('invokes menu action then closes', async () => {
    const onClose = vi.fn();
    const onCopyLink = vi.fn();

    await render({ isOpen: true, onClose, onCopyLink });

    const copyButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('复制链接'),
    ) as HTMLButtonElement | undefined;
    expect(copyButton).toBeTruthy();

    await act(async () => {
      copyButton!.click();
    });

    expect(onCopyLink).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('invokes move action from submenu then closes', async () => {
    const onClose = vi.fn();
    const onMoveLink = vi.fn();

    await render({ isOpen: true, onClose, onMoveLink });

    const categoryButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('分类 2'),
    ) as HTMLButtonElement | undefined;
    expect(categoryButton).toBeTruthy();

    await act(async () => {
      categoryButton!.click();
    });

    expect(onMoveLink).toHaveBeenCalledWith('cat-2');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
