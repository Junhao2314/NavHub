/**
 * useSyncBackup - 备份操作
 */

import { useCallback } from 'react';
import {
  ensureNavHubSyncDataSchemaVersion,
  normalizeNavHubSyncData,
} from '../../../shared/syncApi/navHubSyncData';
import { NavHubSyncData, SyncStatus } from '../../types';
import { getDeviceId, getDeviceInfo, SYNC_API_ENDPOINT } from '../../utils/constants';
import { getErrorMessage } from '../../utils/error';
import { getSyncAuthHeaders } from '../../utils/syncAuthHeaders';
import {
  validateCreateBackupResponse,
  validateDeleteBackupResponse,
  validateRestoreBackupResponse,
} from '../../utils/typeGuards';
import { useI18n } from '../useI18n';
import {
  callSyncEngineCallback,
  fetchWithRetry,
  getLocalSyncMeta,
  getSyncNetworkErrorMessage,
  sanitizeAiConfigForCloud,
  saveLocalSyncMeta,
} from './syncUtils';

export interface UseSyncBackupOptions {
  setSyncStatus: (status: SyncStatus) => void;
  setLastSyncTime: (time: number | null) => void;
  emitSyncError: (message: string, kind?: 'unknown' | 'network' | 'server' | 'storage') => void;
  onError?: (error: string) => void;
}

export interface UseSyncBackupReturn {
  createBackup: (data: Omit<NavHubSyncData, 'meta'>) => Promise<boolean>;
  restoreBackup: (backupKey: string) => Promise<NavHubSyncData | null>;
  deleteBackup: (backupKey: string) => Promise<boolean>;
}

export function useSyncBackup(options: UseSyncBackupOptions): UseSyncBackupReturn {
  const { setSyncStatus, setLastSyncTime, emitSyncError, onError } = options;
  const { t } = useI18n();

  // 创建备份
  const createBackup = useCallback(
    async (data: Omit<NavHubSyncData, 'meta'>): Promise<boolean> => {
      setSyncStatus('syncing');

      const deviceId = getDeviceId();
      const deviceInfo = getDeviceInfo();
      const sanitizedPayload = {
        ...data,
        schemaVersion: ensureNavHubSyncDataSchemaVersion(
          (data as { schemaVersion?: unknown }).schemaVersion,
        ),
        aiConfig: sanitizeAiConfigForCloud(data.aiConfig),
      };
      const syncData: NavHubSyncData = {
        ...sanitizedPayload,
        meta: {
          updatedAt: Date.now(),
          deviceId,
          version: getLocalSyncMeta()?.version || 0,
          browser: deviceInfo?.browser,
          os: deviceInfo?.os,
        },
      };

      try {
        const response = await fetchWithRetry(`${SYNC_API_ENDPOINT}?action=backup`, {
          method: 'POST',
          headers: getSyncAuthHeaders(),
          body: JSON.stringify({ data: syncData }),
        });

        const rawResult: unknown = await response.json();
        const validation = validateCreateBackupResponse(rawResult);
        if (!validation.valid) {
          emitSyncError(validation.reason, 'server');
          return false;
        }
        const result = validation.data;

        if (result.success === false) {
          emitSyncError(result.error || t('errors.backupFailed'), 'server');
          return false;
        }

        setSyncStatus('synced');
        return true;
      } catch (error: unknown) {
        emitSyncError(getSyncNetworkErrorMessage(error, t), 'network');
        return false;
      }
    },
    [emitSyncError, setSyncStatus, t],
  );

  // 从备份恢复
  const restoreBackup = useCallback(
    async (backupKey: string): Promise<NavHubSyncData | null> => {
      setSyncStatus('syncing');

      try {
        const response = await fetchWithRetry(`${SYNC_API_ENDPOINT}?action=restore`, {
          method: 'POST',
          headers: getSyncAuthHeaders(),
          body: JSON.stringify({ backupKey, deviceId: getDeviceId() }),
        });
        const rawResult: unknown = await response.json();
        const validation = validateRestoreBackupResponse(rawResult);
        if (!validation.valid) {
          emitSyncError(validation.reason, 'server');
          return null;
        }
        const result = validation.data;

        if (result.success === false) {
          emitSyncError(result.error || t('errors.restoreFailed'), 'server');
          return null;
        }

        if (!result.data) {
          emitSyncError(t('errors.restoreFailed'), 'server');
          return null;
        }

        const normalized = normalizeNavHubSyncData(result.data);
        if (!normalized) {
          emitSyncError(t('errors.restoreDataFormatError'), 'server');
          return null;
        }

        saveLocalSyncMeta(normalized.meta);
        setLastSyncTime(normalized.meta.updatedAt);
        setSyncStatus('synced');

        return normalized;
      } catch (error: unknown) {
        emitSyncError(getSyncNetworkErrorMessage(error, t), 'network');
        return null;
      }
    },
    [emitSyncError, setSyncStatus, setLastSyncTime, t],
  );

  // 删除备份
  const deleteBackup = useCallback(
    async (backupKey: string): Promise<boolean> => {
      try {
        const response = await fetchWithRetry(`${SYNC_API_ENDPOINT}?action=backup`, {
          method: 'DELETE',
          headers: getSyncAuthHeaders(),
          body: JSON.stringify({ backupKey }),
        });
        const rawResult: unknown = await response.json();
        const validation = validateDeleteBackupResponse(rawResult);
        if (!validation.valid) {
          callSyncEngineCallback('onError', onError, validation.reason);
          return false;
        }
        const result = validation.data;

        if (result.success === false) {
          callSyncEngineCallback('onError', onError, result.error || t('errors.deleteFailed'));
          return false;
        }

        return true;
      } catch (error: unknown) {
        callSyncEngineCallback(
          'onError',
          onError,
          getErrorMessage(error, t('errors.networkError')),
        );
        return false;
      }
    },
    [onError, t],
  );

  return {
    createBackup,
    restoreBackup,
    deleteBackup,
  };
}
