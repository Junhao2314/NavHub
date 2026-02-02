/**
 * useSyncEngine - NavHub KV 同步引擎
 *
 * 功能:
 *   - 页面加载时检测云端数据并处理冲突
 *   - 数据变更时 debounce 自动同步到 KV
 *   - 手动触发备份
 *   - 同步状态管理
 *
 * 设计要点（避免“多端 + 高频变更”带来的坑）:
 *   - 乐观锁：客户端携带 expectedVersion（上一次已知的云端 version），服务端检测版本是否一致。
 *   - 串行化推送：同一页面内的多次 push 通过 Promise chain 串行执行，避免并发 push 交错导致冲突。
 *   - debounce：把频繁的小改动合并成一次 push（尤其是点击统计等高频字段）。
 *   - 元数据写回：push 成功只更新本地 meta（version/updatedAt），不回写业务数据，避免触发循环同步。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ensureNavHubSyncDataSchemaVersion,
  NAVHUB_SYNC_DATA_SCHEMA_VERSION,
  normalizeNavHubSyncData,
} from '../../shared/syncApi/navHubSyncData';
import {
  AIConfig,
  Category,
  CustomFaviconCache,
  LinkItem,
  NavHubSyncData,
  PrivacyConfig,
  SearchConfig,
  SiteSettings,
  SyncAuthResponse,
  SyncAuthState,
  SyncConflict,
  SyncCreateBackupResponse,
  SyncDeleteBackupResponse,
  SyncErrorKind,
  SyncGetResponse,
  SyncMetadata,
  SyncPostResponse,
  SyncRestoreBackupResponse,
  SyncRole,
  SyncStatus,
  ThemeMode,
} from '../types';
import {
  getDeviceId,
  getDeviceInfo,
  SYNC_API_ENDPOINT,
  SYNC_DEBOUNCE_MS,
  SYNC_META_KEY,
} from '../utils/constants';
import { getErrorMessage } from '../utils/error';
import {
  safeLocalStorageGetItem,
  safeLocalStorageRemoveItem,
  safeLocalStorageSetItem,
} from '../utils/storage';
import { getSyncAuthHeaders } from '../utils/syncAuthHeaders';
import { useI18n } from './useI18n';

// fetch(..., { keepalive: true }) 的请求体大小在不同浏览器/平台有上限（常见约 64KB）。
// 这里做一个保守阈值：超出则自动降级为普通请求（尽量保证请求不被浏览器直接拒绝）。
const KEEPALIVE_BODY_LIMIT_BYTES = 64 * 1024;
const keepaliveBodyEncoder = new TextEncoder();

const isKeepaliveBodyWithinLimit = (body: string): boolean => {
  return keepaliveBodyEncoder.encode(body).length <= KEEPALIVE_BODY_LIMIT_BYTES;
};

const readWindowSearchParam = (key: string): string => {
  if (typeof window === 'undefined') return '';
  try {
    return new URLSearchParams(window.location.search).get(key) || '';
  } catch {
    return '';
  }
};

const resolveSyncDebugFlags = (): { enabled: boolean; dump: boolean } => {
  // 开发环境默认启用 debug
  const isDev = import.meta.env.DEV;

  // URL 参数控制（生产环境唯一开关）
  const debugParam = readWindowSearchParam('debug');
  const debugSyncParam = readWindowSearchParam('debugSync');

  // 显式禁用
  if (debugSyncParam === '0') return { enabled: false, dump: false };

  // 启用条件：开发环境 或 URL 参数指定
  const enabled = isDev || debugSyncParam === '1' || debugParam === 'sync';

  // Dump 模式：仅通过 URL 参数控制
  const dump = enabled && readWindowSearchParam('debugSyncDump') === '1';

  return { enabled, dump };
};

const summarizeSyncDataForDebug = (
  data: NavHubSyncData,
): {
  schemaVersion: NavHubSyncData['schemaVersion'];
  meta: NavHubSyncData['meta'];
  counts: { links: number; categories: number };
  has: {
    privateVault: boolean;
    encryptedSensitiveConfig: boolean;
    privacyConfig: boolean;
    customFaviconCache: boolean;
  };
} => {
  return {
    schemaVersion: data.schemaVersion,
    meta: data.meta,
    counts: {
      links: Array.isArray(data.links) ? data.links.length : 0,
      categories: Array.isArray(data.categories) ? data.categories.length : 0,
    },
    has: {
      privateVault: !!data.privateVault,
      encryptedSensitiveConfig: !!data.encryptedSensitiveConfig,
      privacyConfig: !!data.privacyConfig,
      customFaviconCache: !!data.customFaviconCache,
    },
  };
};

const getResponseHeader = (response: unknown, name: string): string | undefined => {
  const headers = (response as { headers?: unknown })?.headers as { get?: unknown } | undefined;
  if (!headers) return undefined;
  const getter = headers.get;
  if (typeof getter !== 'function') return undefined;
  const value = getter.call(headers, name) as unknown;
  return typeof value === 'string' && value ? value : undefined;
};

const redactSyncDataForDebug = (data: NavHubSyncData): NavHubSyncData => {
  const aiConfig =
    data.aiConfig && typeof data.aiConfig === 'object'
      ? { ...data.aiConfig, apiKey: '[REDACTED]' }
      : data.aiConfig;
  return {
    ...data,
    aiConfig,
    privateVault: data.privateVault ? '[REDACTED]' : data.privateVault,
    encryptedSensitiveConfig: data.encryptedSensitiveConfig
      ? '[REDACTED]'
      : data.encryptedSensitiveConfig,
  };
};

const getSyncNetworkErrorMessage = (error: unknown, t: (key: string) => string): string => {
  const message = getErrorMessage(error, t('errors.networkError')).trim();
  if (!message) return t('errors.networkError');

  const normalized = message.toLowerCase();
  const looksLikeNetworkError =
    error instanceof TypeError ||
    message === 'Failed to fetch' ||
    normalized.includes('networkerror') ||
    normalized.includes('load failed') ||
    (normalized.includes('fetch') && normalized.includes('failed')) ||
    normalized.includes('the network connection was lost') ||
    normalized.includes('the internet connection appears to be offline');

  if (looksLikeNetworkError) {
    return t('errors.networkErrorRetry');
  }

  return message;
};

type SyncEngineCallbackName = 'onConflict' | 'onSyncComplete' | 'onError';

const callSyncEngineCallback = <Args extends unknown[]>(
  name: SyncEngineCallbackName,
  callback: ((...args: Args) => void) | undefined,
  ...args: Args
): void => {
  if (!callback) return;
  try {
    callback(...args);
  } catch (error) {
    console.error(`[useSyncEngine] ${name} callback threw`, error);
  }
};

// 同步引擎配置
interface UseSyncEngineOptions {
  onConflict?: (conflict: SyncConflict) => void;
  onSyncComplete?: (data: NavHubSyncData) => void;
  onError?: (error: string) => void;
}

export type PushToCloudOptions = {
  /**
   * 跳过写入“云端同步记录”(history snapshot)。
   *
   * 业务场景：点击统计等高频字段变更（纯统计同步）仍需要同步到云端用于多端一致，
   * 但不希望刷屏“最近 20 次同步记录”（也避免额外的 KV 写放大）。
   */
  skipHistory?: boolean;
  /**
   * 页面关闭/切后台时的兜底同步：用 keepalive 提升请求在卸载阶段送达的概率。
   * 注意：keepalive 请求体大小在不同浏览器有上限（通常 ~64KB）。
   */
  keepalive?: boolean;
};

// 同步引擎返回值
interface UseSyncEngineReturn {
  // 状态
  syncStatus: SyncStatus;
  lastSyncTime: number | null;
  lastError: string | null;
  lastErrorKind: SyncErrorKind | null;

  // 操作
  pullFromCloud: () => Promise<NavHubSyncData | null>;
  pushToCloud: (
    data: Omit<NavHubSyncData, 'meta'>,
    force?: boolean,
    syncKind?: 'auto' | 'manual',
    options?: PushToCloudOptions,
  ) => Promise<boolean>;
  schedulePush: (data: Omit<NavHubSyncData, 'meta'>) => void;
  createBackup: (data: Omit<NavHubSyncData, 'meta'>) => Promise<boolean>;
  restoreBackup: (backupKey: string) => Promise<NavHubSyncData | null>;
  deleteBackup: (backupKey: string) => Promise<boolean>;

  // 冲突解决
  resolveConflict: (choice: 'local' | 'remote') => void;
  currentConflict: SyncConflict | null;

  // 工具
  cancelPendingSync: () => void;
  flushPendingSync: (options?: { keepalive?: boolean }) => Promise<boolean>;

  // 权限
  checkAuth: () => Promise<SyncAuthState>;
}

// 获取当前本地的 sync meta
const getLocalSyncMeta = (): SyncMetadata | null => {
  const stored = safeLocalStorageGetItem(SYNC_META_KEY);
  if (!stored) return null;
  try {
    return JSON.parse(stored) as SyncMetadata;
  } catch {
    return null;
  }
};

// 保存 sync meta 到本地
const saveLocalSyncMeta = (meta: SyncMetadata): void => {
  safeLocalStorageSetItem(SYNC_META_KEY, JSON.stringify(meta));
};

const sanitizeAiConfigForCloud = (config?: AIConfig): AIConfig | undefined => {
  if (!config) return undefined;
  return { ...config, apiKey: '' };
};

export function useSyncEngine(options: UseSyncEngineOptions = {}): UseSyncEngineReturn {
  const { onConflict, onSyncComplete, onError } = options;
  const { t } = useI18n();

  // 状态
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(null);
  const [currentConflict, setCurrentConflict] = useState<SyncConflict | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastErrorKind, setLastErrorKind] = useState<SyncErrorKind | null>(null);

  // Refs for debounce
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  const pendingData = useRef<Omit<NavHubSyncData, 'meta'> | null>(null);
  const pushChainRef = useRef<Promise<void>>(Promise.resolve());

  const emitSyncError = useCallback(
    (message: string, kind: SyncErrorKind = 'unknown'): void => {
      setSyncStatus('error');
      setLastError(message);
      setLastErrorKind(kind);
      callSyncEngineCallback('onError', onError, message);
    },
    [onError],
  );

  // 从云端拉取数据
  const pullFromCloud = useCallback(async (): Promise<NavHubSyncData | null> => {
    setSyncStatus('syncing');

    const debug = resolveSyncDebugFlags();
    try {
      const url = `${SYNC_API_ENDPOINT}?t=${Date.now()}`;
      const headers = getSyncAuthHeaders();
      const hasPasswordHeader = 'X-Sync-Password' in (headers as Record<string, unknown>);

      if (debug.enabled) {
        console.info('[sync] pull:start', { url, hasPasswordHeader });
      }

      const response = await fetch(url, {
        headers,
        cache: 'no-store',
      });
      const result = (await response.json()) as SyncGetResponse;

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
        });
      }

      if (result.success === false) {
        emitSyncError(result.error || t('errors.pullFailed'), 'server');
        return null;
      }

      if (!result.data) {
        // 云端无数据
        if (debug.enabled) {
          console.info('[sync] pull:empty', {
            message: (result as { message?: unknown })?.message,
          });
        }

        // Debug helper: if we are in an admin session, try listing backups to detect "history exists but main-data is missing".
        if (debug.enabled && hasPasswordHeader) {
          try {
            const backupsResponse = await fetch(
              `${SYNC_API_ENDPOINT}?action=backups&t=${Date.now()}`,
              {
                headers,
                cache: 'no-store',
              },
            );
            const backupsJson = (await backupsResponse.json()) as unknown;
            const backupsCount = Array.isArray((backupsJson as { backups?: unknown })?.backups)
              ? (backupsJson as { backups: unknown[] }).backups.length
              : null;
            console.info('[sync] pull:backups', {
              status: backupsResponse.status,
              ok: backupsResponse.ok,
              backupsCount,
              result: backupsJson,
            });
          } catch (error: unknown) {
            console.warn(
              '[sync] pull:backups:error',
              getErrorMessage(error, 'list backups failed'),
            );
          }
        }

        setSyncStatus('idle');
        return null;
      }

      const normalized = normalizeNavHubSyncData(result.data);
      if (!normalized) {
        emitSyncError(t('errors.invalidDataFormat'), 'server');
        return null;
      }

      if (debug.enabled) {
        console.info('[sync] pull:data', summarizeSyncDataForDebug(normalized));
        if (debug.dump) {
          console.debug('[sync] pull:dump', redactSyncDataForDebug(normalized));
        }
      }

      setSyncStatus('synced');
      setLastSyncTime(normalized.meta.updatedAt);

      // 保存云端的 meta 到本地
      saveLocalSyncMeta(normalized.meta);

      return normalized;
    } catch (error: unknown) {
      if (debug.enabled) {
        console.warn('[sync] pull:error', getErrorMessage(error, 'pull failed'));
      }
      emitSyncError(getSyncNetworkErrorMessage(error, t), 'network');
      return null;
    }
  }, [emitSyncError, t]);

  const checkAuth = useCallback(async (): Promise<SyncAuthState> => {
    const debug = resolveSyncDebugFlags();
    try {
      const url = `${SYNC_API_ENDPOINT}?action=auth&t=${Date.now()}`;
      const headers = getSyncAuthHeaders();
      const hasPasswordHeader = 'X-Sync-Password' in (headers as Record<string, unknown>);

      if (debug.enabled) {
        console.info('[sync] auth:start', { url, hasPasswordHeader });
      }

      const response = await fetch(url, {
        headers,
        cache: 'no-store',
      });
      const result = (await response.json()) as SyncAuthResponse;

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

  // 实际执行推送（不做并发控制）
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
        // Safari 私密模式等场景下 localStorage 可能“存在但不可写”。
        // 同步逻辑依赖本地保存的 meta/version，因此这里提前探测可写性，避免出现“看起来同步成功但 version 丢失”。
        const storageProbeKey = '__navhub_storage_probe__';
        if (!safeLocalStorageSetItem(storageProbeKey, '1')) {
          emitSyncError(t('errors.storageUnavailable'), 'storage');
          return false;
        }
        safeLocalStorageRemoveItem(storageProbeKey);

        const localMeta = getLocalSyncMeta();
        const deviceId = getDeviceId();
        const deviceInfo = getDeviceInfo();

        // Never send plaintext apiKey to the cloud; use encryptedSensitiveConfig instead.
        const sanitizedPayload = {
          ...data,
          schemaVersion: ensureNavHubSyncDataSchemaVersion(
            (data as { schemaVersion?: unknown }).schemaVersion,
          ),
          aiConfig: sanitizeAiConfigForCloud(data.aiConfig),
        };

        // 构建完整的同步数据
        const now = Date.now();
        const syncData: NavHubSyncData = {
          ...sanitizedPayload,
          meta: {
            updatedAt: now,
            deviceId,
            // 客户端这里携带的是“已知的云端版本号”。
            // 服务端会在写入时把 version 自增，并把最新 version 返回给客户端保存。
            // 配合 expectedVersion（见下）实现乐观锁：并发写入时能够检测冲突并提示用户选择保留本地/云端。
            version: localMeta?.version ?? 0,
            browser: deviceInfo?.browser,
            os: deviceInfo?.os,
            syncKind,
          },
        };

        // 默认策略：auto 同步不写入“同步记录”(history snapshot)，避免高频同步刷屏 & KV 写放大。
        // manual 同步则默认写入（除非显式 options.skipHistory=true）。
        const shouldSkipHistory = options?.skipHistory ?? syncKind !== 'manual';
        const expectedVersion = force ? undefined : (localMeta?.version ?? 0);

        const requestBody = JSON.stringify({
          data: syncData,
          // force=true => 不携带 expectedVersion，等价于“放弃乐观锁，允许 last-write-wins”。
          // 主要用于冲突解决选择“保留本地版本”时的强制覆盖。
          expectedVersion,
          syncKind,
          ...(shouldSkipHistory ? { skipHistory: true } : {}),
        });

        const keepaliveRequested = options?.keepalive === true;
        const keepalive = keepaliveRequested && isKeepaliveBodyWithinLimit(requestBody);
        // keepaliveRequested=true 但 body 超限时，会自动降级为 keepalive=false。
        // 这是一个权衡：宁可让请求在卸载阶段不一定送达，也要避免请求被浏览器直接抛弃（或抛异常）。

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

        const response = await fetch(SYNC_API_ENDPOINT, {
          method: 'POST',
          headers,
          keepalive,
          body: requestBody,
        });

        const result = (await response.json()) as SyncPostResponse;

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
            // 服务端检测到 expectedVersion 与云端 version 不一致（或条件写失败），返回 409 + 最新云端数据。
            // 这里将“本地待推送数据”与“云端最新数据”打包，交给上层 UI 决策如何合并/覆盖。
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

        // 注意：这里不会调用 onSyncComplete 将 result.data 回写到业务状态。
        // push 成功返回的数据会包含服务端生成的 meta（updatedAt/version），若回写会触发上层的 auto-sync effect，
        // 导致“push → 回写 → 再 push”的循环同步。
        // 业务数据的覆盖/合并应由 pull/restore/冲突解决流程处理；这里仅把 meta 持久化用于后续 expectedVersion。
        setSyncStatus('synced');
        return true;
      } catch (error: unknown) {
        if (debug.enabled) {
          console.warn('[sync] push:error', getErrorMessage(error, 'push failed'));
        }
        emitSyncError(getSyncNetworkErrorMessage(error, t), 'network');
        return false;
      }
    },
    [onConflict, emitSyncError, t],
  );

  // 推送数据到云端（串行化，避免并发推送导致 expectedVersion 冲突/交错）
  const pushToCloud = useCallback(
    async (
      data: Omit<NavHubSyncData, 'meta'>,
      force: boolean = false,
      syncKind: 'auto' | 'manual' = 'auto',
      options?: PushToCloudOptions,
    ): Promise<boolean> => {
      // Promise chain：把每次 push 追加到上一次 push 的尾部，确保同一页面内 push 严格串行。
      // - 使用 then(run, run) 确保“上一笔失败”也不会阻断后续 push。
      // - pushChainRef 始终指向一个会 settle 的 Promise<void>，方便后续继续衔接。
      const run = () => doPushToCloud(data, force, syncKind, options);
      const resultPromise = pushChainRef.current.then(run, run);
      pushChainRef.current = resultPromise.then(
        () => undefined,
        () => undefined,
      );
      return resultPromise;
    },
    [doPushToCloud],
  );

  // 带 debounce 的推送调度
  const schedulePush = useCallback(
    (data: Omit<NavHubSyncData, 'meta'>) => {
      // 只保留“最后一次变更”的快照：在 debounce 窗口内发生多次变更时，最终只 push 一次最新数据。
      pendingData.current = data;
      setSyncStatus('pending');

      // 清除之前的定时器
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }

      // 设置新的定时器
      debounceTimer.current = setTimeout(async () => {
        if (pendingData.current) {
          // 自动同步默认不写入“云端同步记录”(history snapshot)，以减少 KV 写放大。
          await pushToCloud(pendingData.current, false, 'auto', { skipHistory: true });
          pendingData.current = null;
        }
      }, SYNC_DEBOUNCE_MS);
    },
    [pushToCloud],
  );

  // 取消待处理的同步
  const cancelPendingSync = useCallback(() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    }
    pendingData.current = null;
    setSyncStatus('idle');
  }, []);

  const flushPendingSync = useCallback(
    async (options?: { keepalive?: boolean }): Promise<boolean> => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
        debounceTimer.current = null;
      }

      const pending = pendingData.current;
      if (!pending) return false;

      pendingData.current = null;
      // 用于“页面关闭/切后台”场景的兜底同步：调用方可以传 keepalive=true 提升送达概率（受 body 大小限制）。
      return pushToCloud(pending, false, 'auto', {
        skipHistory: true,
        keepalive: options?.keepalive === true,
      });
    },
    [pushToCloud],
  );

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
        const response = await fetch(`${SYNC_API_ENDPOINT}?action=backup`, {
          method: 'POST',
          headers: getSyncAuthHeaders(),
          body: JSON.stringify({ data: syncData }),
        });

        const result = (await response.json()) as SyncCreateBackupResponse;

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
    [emitSyncError, t],
  );

  // 从备份恢复（服务端会创建回滚点）
  const restoreBackup = useCallback(
    async (backupKey: string): Promise<NavHubSyncData | null> => {
      setSyncStatus('syncing');

      try {
        const response = await fetch(`${SYNC_API_ENDPOINT}?action=restore`, {
          method: 'POST',
          headers: getSyncAuthHeaders(),
          body: JSON.stringify({ backupKey, deviceId: getDeviceId() }),
        });
        const result = (await response.json()) as SyncRestoreBackupResponse;

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
    [emitSyncError, t],
  );

  // 删除备份
  const deleteBackup = useCallback(
    async (backupKey: string): Promise<boolean> => {
      try {
        const response = await fetch(`${SYNC_API_ENDPOINT}?action=backup`, {
          method: 'DELETE',
          headers: getSyncAuthHeaders(),
          body: JSON.stringify({ backupKey }),
        });
        const result = (await response.json()) as SyncDeleteBackupResponse;

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

  // 解决冲突
  const resolveConflict = useCallback(
    (choice: 'local' | 'remote') => {
      if (!currentConflict) return;

      if (choice === 'local') {
        // 使用本地版本，强制推送
        pushToCloud(currentConflict.localData, true, 'manual');
      } else {
        // 使用云端版本
        // 云端数据应被视为“权威版本”：保存其 meta/version，避免下一次 push 继续用旧 version 触发冲突。
        saveLocalSyncMeta(currentConflict.remoteData.meta);
        setLastSyncTime(currentConflict.remoteData.meta.updatedAt);
        callSyncEngineCallback('onSyncComplete', onSyncComplete, currentConflict.remoteData);
        setSyncStatus('synced');
      }

      setCurrentConflict(null);
    },
    [currentConflict, pushToCloud, onSyncComplete],
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
    syncStatus,
    lastSyncTime,
    lastError,
    lastErrorKind,
    pullFromCloud,
    pushToCloud,
    schedulePush,
    createBackup,
    restoreBackup,
    deleteBackup,
    resolveConflict,
    currentConflict,
    cancelPendingSync,
    flushPendingSync,
    checkAuth,
  };
}

// 辅助函数：构建同步数据对象
export function buildSyncData(
  links: LinkItem[],
  categories: Category[],
  searchConfig?: SearchConfig,
  aiConfig?: AIConfig,
  siteSettings?: SiteSettings,
  privateVault?: string,
  // 新增参数
  privacyConfig?: PrivacyConfig,
  themeMode?: ThemeMode,
  encryptedSensitiveConfig?: string,
  customFaviconCache?: CustomFaviconCache,
): Omit<NavHubSyncData, 'meta'> {
  return {
    schemaVersion: NAVHUB_SYNC_DATA_SCHEMA_VERSION,
    links,
    categories,
    searchConfig,
    aiConfig,
    siteSettings,
    privateVault,
    privacyConfig,
    themeMode,
    encryptedSensitiveConfig,
    customFaviconCache,
  };
}
