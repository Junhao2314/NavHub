import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetAppStore } from '../stores/useAppStore';
import type { LinkItem } from '../types';
import { useModals } from './useModals';

describe('useModals', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  const renderModals = async () => {
    let api: ReturnType<typeof useModals> | null = null;

    function Harness() {
      const value = useModals();
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
        if (!api) throw new Error('useModals not initialized');
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

  it('opens add link modal and clears editing/prefill state', async () => {
    const { get } = await renderModals();

    const existingLink = {
      id: '1',
      title: 't',
      url: 'https://e.com',
      categoryId: 'c',
      createdAt: 1,
    } satisfies LinkItem;

    act(() => {
      get().openEditLinkModal(existingLink);
      get().setPrefillLink({ title: 'prefill' });
    });

    expect(get().isModalOpen).toBe(true);
    expect(get().editingLink).toEqual(existingLink);
    expect(get().prefillLink).toEqual({ title: 'prefill' });

    act(() => {
      get().openAddLinkModal();
    });

    expect(get().isModalOpen).toBe(true);
    expect(get().editingLink).toBeUndefined();
    expect(get().prefillLink).toBeUndefined();
  });

  it('closes link modal and resets state', async () => {
    const { get } = await renderModals();

    act(() => {
      get().setIsModalOpen(true);
      get().setEditingLink({
        id: '1',
        title: 't',
        url: 'https://e.com',
        categoryId: 'c',
        createdAt: 1,
      });
      get().setPrefillLink({ title: 'prefill' });
    });

    act(() => {
      get().closeLinkModal();
    });

    expect(get().isModalOpen).toBe(false);
    expect(get().editingLink).toBeUndefined();
    expect(get().prefillLink).toBeUndefined();
  });

  it('toggles auxiliary modals via open/close helpers', async () => {
    const { get } = await renderModals();

    act(() => {
      get().openCatManager();
      get().openImportModal();
      get().openSettingsModal();
      get().openSearchConfigModal();
    });

    expect(get().isCatManagerOpen).toBe(true);
    expect(get().isImportModalOpen).toBe(true);
    expect(get().isSettingsModalOpen).toBe(true);
    expect(get().isSearchConfigModalOpen).toBe(true);

    act(() => {
      get().closeCatManager();
      get().closeImportModal();
      get().closeSettingsModal();
      get().closeSearchConfigModal();
    });

    expect(get().isCatManagerOpen).toBe(false);
    expect(get().isImportModalOpen).toBe(false);
    expect(get().isSettingsModalOpen).toBe(false);
    expect(get().isSearchConfigModalOpen).toBe(false);
  });
});
