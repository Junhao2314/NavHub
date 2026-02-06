/**
 * useSyncApi - 核心同步 API 操作
 */

import { useCallback } from 'react';
import {
  ensureNavHubSyncDataSchemaVersion,
  normalizeNavHubSyncData,
} from '../../../shared/syncApi/navHubSyncData';
import {
  NavHubSyncData,
  SyncAuthResponse,
  SyncAuthState,
  SyncConflict,
  SyncEmptyReason,
  SyncGetResponse,
  SyncPostResponse,
  SyncRole,
  SyncStatus,
} from '../../types';
import { getDeviceId, getDeviceInfo, SYNC_API_ENDPOINT } from '../../utils/constants';
import { safeLocalStorageRemoveItem, safeLocalStorageSetItem } from '../../utils/storage';
import { getSyncAuthHeaders } from '../../utils/syncAuthHeaders';
import { useI18n } from '../useI18n';
import {
  callSyncEngineCallback,
  fetchWithRetry,
  getLocalSyncMeta,
  getResponseHeader,
  getSyncNetworkErrorMessage,
  isKeepaliveBodyWithinLimit,
  redactBackupsResponseForDebug,
  redactSyncDataForDebug,
  resolveSyncDebugFlags,
  sanitizeAiConfigForCloud,
  saveLocalSyncMeta,
  summarizeSyncDataForDebug,
  validateSyncAuthResponse,
  validateSyncGetResponse,
  validateSyncPostResponse,
} from './syncUtils';
import { PushToCloudOptions } from './types';

export interface UseSyncApiOptions {
  setSyncStatus: (status: SyncStatus) => void;
  setLastSyncTime: (time: number | null) => void;
  emitSyncError: (message: string, kind?: 'unknown' | 'network' | 'server' | 'storage') => void;
  setCurrentConflict: (conflict: SyncConflict | null) => void;
  onConflict?: (conflict: SyncConflict) => void;
  pushChainRef: React.MutableRefObject<Promise<void>>;
}

export interface PullResult {
  data: NavHubSyncData | null;
  emptyReason?: SyncEmptyReason;
  fallback?: boolean;
}

export interface UseSyncApiReturn {
  pullFromCloud: () => Promise<PullResult>;
  pushToCloud: (
    data: Omit<NavHubSyncData, 'meta'>,
    force?: boolean,
    syncKind?: 'auto' | 'manual',
    options?: PushToCloudOptions,
  ) => Promise<boolean>;
  checkAuth: () => Promise<SyncAuthState>;
}

export function useSyncApi(options: UseSyncApiOptions): UseSyncApiReturn {
  const {
    setSyncStatus,
    setLastSyncTime,
    emitSyncError,
    setCurrentConflict,
    onConflict,
    pushChainRef,
  } = options;
  const { t } = useI18n();

  // 从云端拉取数据
  const pullFromCloud = useCallback(async (): Promise<PullResult> => {
    setSyncStatus('syncing');

    const debug = resolveSyncDebugFlags();
    try {
      const url = `${SYNC_API_ENDPOINT}?t=${Date.now()}`;
      const headers = getSyncAuthHeaders();
      const hasPasswordHeader = 'X-Sync-Password' in (headers as Record<string, unknown>);

      if (debug.enabled) {
        console.info('[sync] pull:start', { url, hasPasswordHeader });
      }

      const response = await fetchWithRetry(
        url,
        {
          headers,
          cache: 'no-store',
        },
        {
          onRetry: (attempt, error, delayMs) => {
            if (debug.enabled) {
              console.info('[sync] pull:retry', { attempt, error, delayMs });
            }
          },
        },
      );
      const rawResult = await response.json();
      const validation = validateSyncGetResponse(rawResult);
      if (!validation.valid) {
        emitSyncError(`${t('errors.invalidDataFormat')}: ${validation.reason}`, 'server');
        return { data: null };
      }
      const result = rawResult as SyncGetResponse;

      if (debug.enabled) {
        console.info('[sync] pull:response', {
          status: response.status,
          ok: response.ok,
          cfRay: getResponseHeader(response, 'cf-ray'),
          success: result?.success,
          role: (result as { role?: unknown })?.role,
          hasData:
            'data' in (result as Record<string, unknown>) && !!(result as { data?: unknown })?.data,
          message: (result as { message?: unknown })?.message,
          emptyReason: (result as { emptyReason?: unknown })?.emptyReason,
          fallback: (result as { fallback?: unknown })?.fallback,
        });
      }

      if (result.success === false) {
        emitSyncError(result.error || t('errors.pullFailed'), 'server');
        return { data: null };
      }

      if (!result.data) {
        if (debug.enabled) {
          console.info('[sync] pull:empty', {
            message: (result as { message?: unknown })?.message,
            emptyReason: (result as { emptyReason?: unknown })?.emptyReason,
          });
        }

        // Debug: list backups if admin
        if (debug.enabled && hasPasswordHeader) {
          try {
            const backupsResponse = await fetch(
              `${SYNC_API_ENDPOINT}?action=backups&t=${Date.now()}`,
              { headers, cache: 'no-store' },
            );
            const backupsJson = (await backupsResponse.json()) as unknown;
            console.info('[sync] pull:backups', {
              status: backupsResponse.status,
              ok: backupsResponse.ok,
              ...redactBackupsResponseForDebug(backupsJson),
            });
          } catch {
            // ignore
          }
        }

        setSyncStatus('idle');
        const emptyReason = (result as { emptyReason?: SyncEmptyReason }).emptyReason;
        return { data: null, emptyReason };
      }

      const normalized = normalizeNavHubSyncData(result.data);
      if (!normalized) {
        emitSyncError(t('errors.invalidDataFormat'), 'server');
        return { data: null };
      }

      if (debug.enabled) {
        console.info('[sync] pull:data', summarizeSyncDataForDebug(normalized));
        if (debug.dump) {
          console.debug('[sync] pull:dump', redactSyncDataForDebug(normalized));
        }
      }

      setSyncStatus('synced');
      setLastSyncTime(normalized.meta.updatedAt);
      saveLocalSyncMeta(normalized.meta);

      const fallback = (result as { fallback?: boolean }).fallback;
      return { data: normalized, fallback };
    } catch (error: unknown) {
      if (debug.enabled) {
        console.warn('[sync] pull:error', error);
      }
      emitSyncError(getSyncNetworkErrorMessage(error, t), 'network');
      return { data: null };
    }
  }, [emitSyncError, setSyncStatus, setLastSyncTime, t]);

  // 检查认证状态
  const checkAuth = useCallback(async (): Promise<SyncAuthState> => {
    const debug = resolveSyncDebugFlags();
    try {
      const url = `${SYNC_API_ENDPOINT}?action=auth&t=${Date.now()}`;
      const headers = getSyncAuthHeaders();
      const hasPasswordHeader = 'X-Sync-Password' in (headers as Record<string, unknown>);

      if (debug.enabled) {
        console.info('[sync] auth:start', { url, hasPasswordHeader });
      }

      const response = await fetchWithRetry(
        url,
        { headers, cache: 'no-store' },
        {
          onRetry: (attempt, error, delayMs) => {
            if (debug.enabled) {
              console.info('[sync] auth:retry', { attempt, error, delayMs });
            }
          },
        },
      );
      const rawResult = await response.json();
      const validation = validateSyncAuthResponse(rawResult);
      if (!validation.valid) {
        if (debug.enabled) {
          console.warn('[sync] auth:validation failed', validation.reason);
        }
        return { protected: true, role: 'user', canWrite: false };
      }
      const result = rawResult as SyncAuthResponse;

      if (debug.enabled) {
        console.info('[sync] auth:response', {
          status: response.status,
          ok: response.ok,
          cfRay: getResponseHeader(response, 'cf-ray'),
          ...result,
        });
      }

      if (!result?.success) {
        return { protected: true, role: 'user', canWrite: false };
      }

      const role: SyncRole = result.role === 'admin' ? 'admin' : 'user';
      return {
        protected: !!result.protected,
        role,
        canWrite: !!result.canWrite,
      };
    } catch {
      return { protected: true, role: 'user', canWrite: false };
    }
  }, []);

  // 实际执行推送
  const doPushToCloud = useCallback(
    async (
      data: Omit<NavHubSyncData, 'meta'>,
      force: boolean = false,
      syncKind: 'auto' | 'manual' = 'auto',
      options?: PushToCloudOptions,
    ): Promise<boolean> => {
      setSyncStatus('syncing');

      const debug = resolveSyncDebugFlags();
      try {
        // 检查 localStorage 可写性
        const storageProbeKey = '__navhub_storage_probe__';
        if (!safeLocalStorageSetItem(storageProbeKey, '1')) {
          emitSyncError(t('errors.storageUnavailable'), 'storage');
          return false;
        }
        safeLocalStorageRemoveItem(storageProbeKey);

        const localMeta = getLocalSyncMeta();
        const deviceId = getDeviceId();
        const deviceInfo = getDeviceInfo();

        const sanitizedPayload = {
          ...data,
          schemaVersion: ensureNavHubSyncDataSchemaVersion(
            (data as { schemaVersion?: unknown }).schemaVersion,
          ),
          aiConfig: sanitizeAiConfigForCloud(data.aiConfig),
        };

        const now = Date.now();
        const syncData: NavHubSyncData = {
          ...sanitizedPayload,
          meta: {
            updatedAt: now,
            deviceId,
            version: localMeta?.version ?? 0,
            browser: deviceInfo?.browser,
            os: deviceInfo?.os,
            syncKind,
          },
        };

        const shouldSkipHistory = options?.skipHistory ?? syncKind !== 'manual';
        const expectedVersion = force ? undefined : (localMeta?.version ?? 0);

        const requestBody = JSON.stringify({
          data: syncData,
          expectedVersion,
          syncKind,
          ...(shouldSkipHistory ? { skipHistory: true } : {}),
        });

        const keepaliveRequested = options?.keepalive === true;
        const keepalive = keepaliveRequested && isKeepaliveBodyWithinLimit(requestBody);

        const headers = getSyncAuthHeaders();
        const hasPasswordHeader = 'X-Sync-Password' in (headers as Record<string, unknown>);

        if (debug.enabled) {
          console.info('[sync] push:start', {
            syncKind,
            force,
            expectedVersion,
            shouldSkipHistory,
            keepaliveRequested,
            keepalive,
            hasPasswordHeader,
          });
          if (debug.dump) {
            console.debug('[sync] push:dump', redactSyncDataForDebug(syncData));
          }
        }

        const response = await fetchWithRetry(
          SYNC_API_ENDPOINT,
          {
            method: 'POST',
            headers,
            keepalive,
            body: requestBody,
          },
          {
            onRetry: (attempt, error, delayMs) => {
              if (debug.enabled) {
                console.info('[sync] push:retry', { attempt, error, delayMs });
              }
            },
          },
        );

        const rawResult = await response.json();
        const validation = validateSyncPostResponse(rawResult);
        if (!validation.valid) {
          emitSyncError(`${t('errors.serverDataFormatError')}: ${validation.reason}`, 'server');
          return false;
        }
        const result = rawResult as SyncPostResponse;

        if (debug.enabled) {
          console.info('[sync] push:response', {
            status: response.status,
            ok: response.ok,
            cfRay: getResponseHeader(response, 'cf-ray'),
            success: result?.success,
            conflict: (result as { conflict?: unknown })?.conflict,
            historyKey: (result as { historyKey?: unknown })?.historyKey,
            error: (result as { error?: unknown })?.error,
            data: result?.data ? summarizeSyncDataForDebug(result.data) : null,
          });
        }

        if (result.success !== true) {
          // 处理冲突
          if (result.conflict && result.data) {
            const remoteData = normalizeNavHubSyncData(result.data);
            if (!remoteData) {
              emitSyncError(t('errors.serverDataFormatError'), 'server');
              return false;
            }
            setSyncStatus('conflict');
            const conflict: SyncConflict = {
              localData: syncData,
              remoteData,
            };
            setCurrentConflict(conflict);
            callSyncEngineCallback('onConflict', onConflict, conflict);
            return false;
          }

          emitSyncError(result.error || t('errors.pushFailed'), 'server');
          return false;
        }

        // 成功，更新本地 meta
        if (result.data?.meta) {
          saveLocalSyncMeta(result.data.meta);
          setLastSyncTime(result.data.meta.updatedAt);
        }

        setSyncStatus('synced');
        return true;
      } catch (error: unknown) {
        if (debug.enabled) {
          console.warn('[sync] push:error', error);
        }
        emitSyncError(getSyncNetworkErrorMessage(error, t), 'network');
        return false;
      }
    },
    [onConflict, emitSyncError, setSyncStatus, setLastSyncTime, setCurrentConflict, t],
  );

  // 推送数据到云端（串行化）
  const pushToCloud = useCallback(
    async (
      data: Omit<NavHubSyncData, 'meta'>,
      force: boolean = false,
      syncKind: 'auto' | 'manual' = 'auto',
      options?: PushToCloudOptions,
    ): Promise<boolean> => {
      const run = () => doPushToCloud(data, force, syncKind, options);
      const resultPromise = pushChainRef.current.then(run, run);
      pushChainRef.current = resultPromise.then(
        () => undefined,
        () => undefined,
      );
      return resultPromise;
    },
    [doPushToCloud, pushChainRef],
  );

  return {
    pullFromCloud,
    pushToCloud,
    checkAuth,
  };
}
