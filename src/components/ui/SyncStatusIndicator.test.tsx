import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SYNC_STATUS_AUTO_HIDE_DELAY_MS, SYNC_STATUS_EXIT_ANIMATION_MS } from '../../config/ui';
import type { SyncStatus } from '../../types';
import SyncStatusIndicator from './SyncStatusIndicator';

describe('SyncStatusIndicator', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  const render = async (
    status: SyncStatus,
    options?: { onManualSync?: () => void; onManualPull?: () => void },
  ) => {
    if (!root) root = createRoot(container);
    await act(async () => {
      root?.render(
        <SyncStatusIndicator
          status={status}
          lastSyncTime={null}
          onManualSync={options?.onManualSync}
          onManualPull={options?.onManualPull}
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
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('shows on status change and auto-hides after synced', async () => {
    vi.useFakeTimers();

    await render('idle');
    expect(container.querySelector('button')).toBe(null);

    await render('synced');
    const button = container.querySelector('button') as HTMLButtonElement | null;
    expect(button).toBeTruthy();
    expect(button?.textContent).toContain('已同步');

    await act(async () => {
      vi.advanceTimersByTime(SYNC_STATUS_AUTO_HIDE_DELAY_MS);
    });
    const exitingButton = container.querySelector('button') as HTMLButtonElement | null;
    expect(exitingButton).toBeTruthy();
    expect(exitingButton?.className).toContain('opacity-0');

    await act(async () => {
      vi.advanceTimersByTime(SYNC_STATUS_EXIT_ANIMATION_MS);
    });
    expect(container.querySelector('button')).toBe(null);
  });

  it('routes click: error -> onManualSync, others -> onManualPull', async () => {
    vi.useFakeTimers();

    const onManualSync = vi.fn();
    const onManualPull = vi.fn();

    await render('idle', { onManualSync, onManualPull });
    await render('error', { onManualSync, onManualPull });

    const errorButton = container.querySelector('button') as HTMLButtonElement | null;
    expect(errorButton).toBeTruthy();

    await act(async () => {
      errorButton!.click();
    });
    expect(onManualSync).toHaveBeenCalledTimes(1);
    expect(onManualPull).toHaveBeenCalledTimes(0);

    await render('synced', { onManualSync, onManualPull });
    const syncedButton = container.querySelector('button') as HTMLButtonElement | null;
    expect(syncedButton).toBeTruthy();

    await act(async () => {
      syncedButton!.click();
    });
    expect(onManualPull).toHaveBeenCalledTimes(1);
  });

  it('disables button while syncing', async () => {
    await render('idle');
    await render('syncing');

    const button = container.querySelector('button') as HTMLButtonElement | null;
    expect(button).toBeTruthy();
    expect(button?.disabled).toBe(true);
  });
});
