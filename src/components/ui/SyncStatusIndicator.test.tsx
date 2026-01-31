import i18n from 'i18next';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { initReactI18next } from 'react-i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SYNC_STATUS_AUTO_HIDE_DELAY_MS, SYNC_STATUS_EXIT_ANIMATION_MS } from '../../config/ui';
import type { SyncStatus } from '../../types';
import SyncStatusIndicator from './SyncStatusIndicator';

// Initialize i18n for tests
i18n.use(initReactI18next).init({
  lng: 'zh-CN',
  fallbackLng: 'zh-CN',
  resources: {
    'zh-CN': {
      translation: {
        sync: {
          synced: '已同步',
          lastSync: '上次: {{time}}',
          syncedWithCloud: '与云端同步',
          syncedClickRefresh: '已同步，点击刷新',
          syncedLastClickRefresh: '已同步 (上次: {{time}})，点击刷新',
          syncing: '同步中',
          syncingWithCloud: '与云端同步中…',
          syncingPleaseWait: '同步中，请稍候…',
          pending: '待同步',
          pendingAutoSync: '约 {{seconds}}s 后自动同步（点击立即同步）',
          pendingDetected: '检测到本地变更，约 {{seconds}}s 后自动同步（点击立即同步）',
          storageUnavailable: '存储不可用',
          networkError: '网络错误',
          syncFailed: '同步失败',
          unknownError: '发生未知错误',
          errorClickRetry: '{{label}}（点击重试）',
          errorWithMessageClickRetry: '{{label}}：{{message}}（点击重试）',
          conflict: '有冲突',
          conflictDescription: '本地与云端数据不一致（点击处理）',
          conflictDetected: '检测到同步冲突，点击处理',
          disconnected: '待连接',
          disconnectedClickRefresh: '待连接，点击刷新',
        },
      },
    },
  },
  interpolation: {
    escapeValue: false,
  },
});

describe('SyncStatusIndicator', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  const render = async (
    status: SyncStatus,
    options?: { onManualSync?: () => void; onManualPull?: () => void; onOpenConflict?: () => void },
  ) => {
    if (!root) root = createRoot(container);
    await act(async () => {
      root?.render(
        <SyncStatusIndicator
          status={status}
          lastSyncTime={null}
          onManualSync={options?.onManualSync}
          onManualPull={options?.onManualPull}
          onOpenConflict={options?.onOpenConflict}
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

  it('routes click: pending -> onManualSync', async () => {
    vi.useFakeTimers();

    const onManualSync = vi.fn();
    const onManualPull = vi.fn();

    await render('idle', { onManualSync, onManualPull });
    await render('pending', { onManualSync, onManualPull });

    const button = container.querySelector('button') as HTMLButtonElement | null;
    expect(button).toBeTruthy();

    await act(async () => {
      button!.click();
    });

    expect(onManualSync).toHaveBeenCalledTimes(1);
    expect(onManualPull).toHaveBeenCalledTimes(0);
  });

  it('routes click: conflict -> onOpenConflict', async () => {
    vi.useFakeTimers();

    const onManualPull = vi.fn();
    const onOpenConflict = vi.fn();

    await render('idle', { onManualPull, onOpenConflict });
    await render('conflict', { onManualPull, onOpenConflict });

    const button = container.querySelector('button') as HTMLButtonElement | null;
    expect(button).toBeTruthy();

    await act(async () => {
      button!.click();
    });

    expect(onOpenConflict).toHaveBeenCalledTimes(1);
    expect(onManualPull).toHaveBeenCalledTimes(0);
  });

  it('disables button while syncing', async () => {
    await render('idle');
    await render('syncing');

    const button = container.querySelector('button') as HTMLButtonElement | null;
    expect(button).toBeTruthy();
    expect(button?.disabled).toBe(true);
  });
});
