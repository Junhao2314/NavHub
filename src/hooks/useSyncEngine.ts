/**
 * useSyncEngine - NavHub KV 同步引擎
 *
 * 功能:
 *   - 页面加载时检测云端数据并处理冲突
 *   - 数据变更时 debounce 自动同步到 KV
 *   - 手动触发备份
 *   - 同步状态管理
 *
 * 设计要点（避免"多端 + 高频变更"带来的坑）:
 *   - 乐观锁：客户端携带 expectedVersion，服务端检测版本是否一致
 *   - 串行化推送：同一页面内的多次 push 通过 Promise chain 串行执行
 *   - debounce：把频繁的小改动合并成一次 push
 *   - 元数据写回：push 成功只更新本地 meta，不回写业务数据
 */

import { useCallback, useState } from 'react';
import { NAVHUB_SYNC_DATA_SCHEMA_VERSION } from '../../shared/syncApi/navHubSyncData';
import {
  AIConfig,
  Category,
  CustomFaviconCache,
  LinkItem,
  NavHubSyncData,
  PrivacyConfig,
  SearchConfig,
  SiteSettings,
  SyncAuthState,
  SyncConflict,
  SyncErrorKind,
  SyncStatus,
  ThemeMode,
} from '../types';
import {
  callSyncEngineCallback,
  PullResult,
  PushToCloudOptions,
  saveLocalSyncMeta,
  UseSyncEngineOptions,
  useSyncStatus,
  useSyncApi,
  useSyncBackup,
  useSyncDebounce,
} from './sync';

// 同步引擎返回值
interface UseSyncEngineReturn {
  // 状态
  syncStatus: SyncStatus;
  lastSyncTime: number | null;
  lastError: string | null;
  lastErrorKind: SyncErrorKind | null;

  // 操作
  pullFromCloud: () => Promise<PullResult>;
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
  resolveConflict: (choice: 'local' | 'remote') => Promise<boolean>;
  currentConflict: SyncConflict | null;

  // 工具
  cancelPendingSync: () => void;
  flushPendingSync: (options?: { keepalive?: boolean }) => Promise<boolean>;

  // 权限
  checkAuth: () => Promise<SyncAuthState>;
}

export type { PushToCloudOptions };

export function useSyncEngine(options: UseSyncEngineOptions = {}): UseSyncEngineReturn {
  const { onConflict, onSyncComplete, onError } = options;

  // 冲突状态
  const [currentConflict, setCurrentConflict] = useState<SyncConflict | null>(null);

  // 状态管理
  const {
    syncStatus,
    lastSyncTime,
    lastError,
    lastErrorKind,
    setSyncStatus,
    setLastSyncTime,
    emitSyncError,
  } = useSyncStatus({ onError });

  // Debounce 调度 - 需要先声明 pushChainRef
  const { pushChainRef, schedulePush, cancelPendingSync, flushPendingSync } = useSyncDebounce({
    setSyncStatus,
    pushToCloud: (data, force, syncKind, opts) =>
      apiHooks.pushToCloud(data, force, syncKind, opts),
  });

  // 核心 API
  const apiHooks = useSyncApi({
    setSyncStatus,
    setLastSyncTime,
    emitSyncError,
    setCurrentConflict,
    onConflict,
    pushChainRef,
  });

  // 备份操作
  const { createBackup, restoreBackup, deleteBackup } = useSyncBackup({
    setSyncStatus,
    setLastSyncTime,
    emitSyncError,
    onError,
  });

  // 解决冲突
  const resolveConflict = useCallback(
    async (choice: 'local' | 'remote'): Promise<boolean> => {
      if (!currentConflict) return false;

      if (choice === 'local') {
        // 选择本地版本：需要 await 推送结果，失败时保留冲突状态让用户可以重试
        const success = await apiHooks.pushToCloud(currentConflict.localData, true, 'manual');
        if (!success) {
          // 推送失败，保留冲突状态
          return false;
        }
      } else {
        saveLocalSyncMeta(currentConflict.remoteData.meta);
        setLastSyncTime(currentConflict.remoteData.meta.updatedAt);
        callSyncEngineCallback('onSyncComplete', onSyncComplete, currentConflict.remoteData);
        setSyncStatus('synced');
      }

      setCurrentConflict(null);
      return true;
    },
    [currentConflict, apiHooks, onSyncComplete, setSyncStatus, setLastSyncTime],
  );

  return {
    syncStatus,
    lastSyncTime,
    lastError,
    lastErrorKind,
    pullFromCloud: apiHooks.pullFromCloud,
    pushToCloud: apiHooks.pushToCloud,
    schedulePush,
    createBackup,
    restoreBackup,
    deleteBackup,
    resolveConflict,
    currentConflict,
    cancelPendingSync,
    flushPendingSync,
    checkAuth: apiHooks.checkAuth,
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
