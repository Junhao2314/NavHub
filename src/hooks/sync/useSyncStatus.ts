/**
 * useSyncStatus - 同步状态管理
 */

import { useCallback, useState } from 'react';
import { SyncErrorKind, SyncStatus } from '../../types';
import { callSyncEngineCallback } from './syncUtils';

export interface UseSyncStatusOptions {
  onError?: (error: string) => void;
}

export interface UseSyncStatusReturn {
  syncStatus: SyncStatus;
  lastSyncTime: number | null;
  lastError: string | null;
  lastErrorKind: SyncErrorKind | null;
  setSyncStatus: (status: SyncStatus) => void;
  setLastSyncTime: (time: number | null) => void;
  emitSyncError: (message: string, kind?: SyncErrorKind) => void;
  clearError: () => void;
}

export function useSyncStatus(options: UseSyncStatusOptions = {}): UseSyncStatusReturn {
  const { onError } = options;

  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastErrorKind, setLastErrorKind] = useState<SyncErrorKind | null>(null);

  const emitSyncError = useCallback(
    (message: string, kind: SyncErrorKind = 'unknown'): void => {
      setSyncStatus('error');
      setLastError(message);
      setLastErrorKind(kind);
      callSyncEngineCallback('onError', onError, message);
    },
    [onError],
  );

  const clearError = useCallback(() => {
    setLastError(null);
    setLastErrorKind(null);
  }, []);

  return {
    syncStatus,
    lastSyncTime,
    lastError,
    lastErrorKind,
    setSyncStatus,
    setLastSyncTime,
    emitSyncError,
    clearError,
  };
}
