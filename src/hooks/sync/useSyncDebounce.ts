/**
 * useSyncDebounce - 同步调度与防抖
 */

import { useCallback, useEffect, useRef } from 'react';
import { NavHubSyncData, SyncStatus } from '../../types';
import { SYNC_DEBOUNCE_MS } from '../../utils/constants';
import { PushToCloudOptions } from './types';

export interface UseSyncDebounceOptions {
  setSyncStatus: (status: SyncStatus) => void;
  pushToCloud: (
    data: Omit<NavHubSyncData, 'meta'>,
    force?: boolean,
    syncKind?: 'auto' | 'manual',
    options?: PushToCloudOptions,
  ) => Promise<boolean>;
}

export interface UseSyncDebounceReturn {
  schedulePush: (data: Omit<NavHubSyncData, 'meta'>) => void;
  cancelPendingSync: () => void;
  flushPendingSync: (options?: { keepalive?: boolean }) => Promise<boolean>;
  pushChainRef: React.MutableRefObject<Promise<void>>;
}

export function useSyncDebounce(options: UseSyncDebounceOptions): UseSyncDebounceReturn {
  const { setSyncStatus, pushToCloud } = options;

  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  const pendingData = useRef<Omit<NavHubSyncData, 'meta'> | null>(null);
  const pushChainRef = useRef<Promise<void>>(Promise.resolve());

  // 带 debounce 的推送调度
  const schedulePush = useCallback(
    (data: Omit<NavHubSyncData, 'meta'>) => {
      pendingData.current = data;
      setSyncStatus('pending');

      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }

      debounceTimer.current = setTimeout(async () => {
        if (pendingData.current) {
          await pushToCloud(pendingData.current, false, 'auto', { skipHistory: true });
          pendingData.current = null;
        }
      }, SYNC_DEBOUNCE_MS);
    },
    [pushToCloud, setSyncStatus],
  );

  // 取消待处理的同步
  const cancelPendingSync = useCallback(() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    }
    pendingData.current = null;
    setSyncStatus('idle');
  }, [setSyncStatus]);

  // 立即刷新待处理的同步
  const flushPendingSync = useCallback(
    async (options?: { keepalive?: boolean }): Promise<boolean> => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
        debounceTimer.current = null;
      }

      const pending = pendingData.current;
      if (!pending) return false;

      pendingData.current = null;
      return pushToCloud(pending, false, 'auto', {
        skipHistory: true,
        keepalive: options?.keepalive === true,
      });
    },
    [pushToCloud],
  );

  // 清理定时器
  useEffect(() => {
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, []);

  return {
    schedulePush,
    cancelPendingSync,
    flushPendingSync,
    pushChainRef,
  };
}
