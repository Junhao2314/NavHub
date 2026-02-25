import type { MutableRefObject } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PullResult } from '../../../hooks/sync/useSyncApi';
import type {
  AIConfig,
  Category,
  CountdownItem,
  ExternalSearchSource,
  LinkItem,
  NavHubSyncData,
  SearchMode,
  SiteSettings,
  SyncConflict,
  SyncRole,
  ThemeMode,
} from '../../../types';
import { getDeviceId, SYNC_STATS_DEBOUNCE_MS } from '../../../utils/constants';
import { getSyncPassword } from '../../../utils/secrets';
import {
  buildSyncBusinessSignature,
  buildSyncFullSignature,
  type SyncPayload,
} from '../syncSignatures';
import { buildLocalSyncPayload, type SyncPrivacyConfig } from './buildLocalSyncPayload';
import {
  type EncryptedSensitiveConfigCache,
  encryptApiKeyForSync,
} from './encryptedSensitiveConfig';

export const useKvSyncStrategy = (args: {
  isLoaded: boolean;
  links: LinkItem[];
  categories: Category[];
  countdowns: CountdownItem[];
  searchMode: SearchMode;
  externalSearchSources: ExternalSearchSource[];
  aiConfig: AIConfig;
  siteSettings: SiteSettings;
  privateVaultCipher: string | null;
  privacyGroupEnabled: boolean;
  privacyPasswordEnabled: boolean;
  privacyAutoUnlockEnabled: boolean;
  useSeparatePrivacyPassword: boolean;
  themeMode: ThemeMode;
  isAdmin: boolean;
  currentConflict: SyncConflict | null;

  pullFromCloud: () => Promise<PullResult>;
  schedulePush: (data: SyncPayload) => void;
  pushToCloud: (
    data: SyncPayload,
    force?: boolean,
    syncKind?: 'auto' | 'manual',
    options?: { skipHistory?: boolean; keepalive?: boolean },
  ) => Promise<boolean>;
  flushPendingSync: (options?: { keepalive?: boolean }) => Promise<boolean>;

  refreshSyncAuth: () => Promise<{ role: SyncRole; protected: boolean }>;
  getLocalSyncMeta: () => unknown;
  applyCloudData: (data: NavHubSyncData, role: SyncRole) => void;
  handleSyncConflict: (conflict: SyncConflict) => void;

  isSyncPasswordRefreshingRef: MutableRefObject<boolean>;
  pendingSensitiveConfigSyncRef: MutableRefObject<boolean>;
  syncPasswordRefreshTick: number;
}) => {
  const {
    isLoaded,
    links,
    categories,
    countdowns,
    searchMode,
    externalSearchSources,
    aiConfig,
    siteSettings,
    privateVaultCipher,
    privacyGroupEnabled,
    privacyPasswordEnabled,
    privacyAutoUnlockEnabled,
    useSeparatePrivacyPassword,
    themeMode,
    isAdmin,
    currentConflict,
    pullFromCloud,
    schedulePush,
    pushToCloud,
    flushPendingSync,
    refreshSyncAuth,
    getLocalSyncMeta,
    applyCloudData,
    handleSyncConflict,
    isSyncPasswordRefreshingRef,
    pendingSensitiveConfigSyncRef,
    syncPasswordRefreshTick,
  } = args;

  const hasInitialSyncRun = useRef(false);
  const [isInitialSyncComplete, setIsInitialSyncComplete] = useState(false);

  const prevBusinessSignatureRef = useRef<string | null>(null);
  const prevFullSignatureRef = useRef<string | null>(null);
  const encryptedSensitiveConfigCacheRef = useRef<EncryptedSensitiveConfigCache | null>(null);
  const statsSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingStatsSyncDataRef = useRef<SyncPayload | null>(null);
  const isAdminRef = useRef(isAdmin);
  const hasConflictRef = useRef(!!currentConflict);
  const syncPasswordRefreshTickRef = useRef(syncPasswordRefreshTick);

  isAdminRef.current = isAdmin;
  hasConflictRef.current = !!currentConflict;

  const cancelPendingStatsSync = useCallback(() => {
    if (statsSyncTimerRef.current) {
      clearTimeout(statsSyncTimerRef.current);
      statsSyncTimerRef.current = null;
    }
    pendingStatsSyncDataRef.current = null;
  }, []);

  const flushPendingStatsSync = useCallback(
    async (options?: { keepalive?: boolean }): Promise<boolean> => {
      // 点击统计的批量同步仅在“管理员 + 非冲突”时允许写入云端：
      // - 用户模式：只读，不应写入云端
      // - 冲突状态：用户尚未决策，任何后台写入都可能加剧混乱
      if (!isAdminRef.current || hasConflictRef.current) return false;
      if (isSyncPasswordRefreshingRef.current) return false;

      const pending = pendingStatsSyncDataRef.current;
      if (!pending) return false;
      pendingStatsSyncDataRef.current = null;

      if (statsSyncTimerRef.current) {
        clearTimeout(statsSyncTimerRef.current);
        statsSyncTimerRef.current = null;
      }

      // Prepare encrypted sensitive config for sync (Requirements 2.1, 2.6)
      const syncPassword = getSyncPassword().trim();
      const apiKey = pending.aiConfig?.apiKey?.trim() || '';
      const encryptResult = await encryptApiKeyForSync({
        syncPassword,
        apiKey,
        cacheRef: encryptedSensitiveConfigCacheRef,
      });

      return pushToCloud(
        encryptResult.encrypted
          ? { ...pending, encryptedSensitiveConfig: encryptResult.encrypted }
          : pending,
        false,
        'auto',
        // 纯统计同步：仅同步点击统计等高频字段，不写入同步记录（避免"最近 20 次同步记录"被刷屏）。
        { skipHistory: true, keepalive: options?.keepalive === true },
      );
    },
    [isSyncPasswordRefreshingRef, pushToCloud],
  );

  useEffect(() => {
    const handlePageHide = () => {
      // 页面隐藏/关闭时的兜底：尽量把最后一次 pending push 送达。
      // useSyncEngine/flushPendingSync 内部会按 keepalive 体积上限做降级。
      void flushPendingSync({ keepalive: true });
      void flushPendingStatsSync({ keepalive: true });
    };

    window.addEventListener('pagehide', handlePageHide);
    return () => window.removeEventListener('pagehide', handlePageHide);
  }, [flushPendingStatsSync, flushPendingSync]);

  useEffect(() => {
    // 退出管理员模式 / 进入冲突状态时，避免后台仍在批量同步点击统计
    if (!isAdmin || currentConflict) {
      cancelPendingStatsSync();
    }
  }, [isAdmin, currentConflict, cancelPendingStatsSync]);

  useEffect(() => {
    return () => {
      cancelPendingStatsSync();
    };
  }, [cancelPendingStatsSync]);

  // === KV Sync: Initial Load ===
  useEffect(() => {
    // 只在本地数据加载完成后执行一次
    if (!isLoaded || hasInitialSyncRun.current) return;
    hasInitialSyncRun.current = true;

    const checkCloudData = async () => {
      try {
        // 先刷新一次权限状态（syncRole/isAdmin 可能尚未更新）。
        // 后续的拉取/冲突判断需要以"当前请求的真实权限"作为依据。
        const auth = await refreshSyncAuth();
        const localMeta = getLocalSyncMeta();
        const localVersion =
          typeof localMeta === 'object' && localMeta && 'version' in localMeta
            ? ((localMeta as { version?: number }).version ?? 0)
            : 0;
        const localUpdatedAt =
          typeof localMeta === 'object' && localMeta && 'updatedAt' in localMeta
            ? typeof (localMeta as { updatedAt?: unknown }).updatedAt === 'number'
              ? (localMeta as { updatedAt: number }).updatedAt
              : 0
            : 0;
        const localDeviceId =
          typeof localMeta === 'object' && localMeta && 'deviceId' in localMeta
            ? (localMeta as { deviceId?: string }).deviceId || getDeviceId()
            : getDeviceId();
        const cloudData = await pullFromCloud();

        if (cloudData.data && cloudData.data.links && cloudData.data.categories) {
          if (auth.role !== 'admin') {
            // 用户模式（只读）：不参与冲突解决，直接以云端为准（仅应用"可公开字段"）。
            applyCloudData(cloudData.data, auth.role);
            return;
          }

          // 新设备首次同步：本地版本为 0 表示从未同步过，直接应用云端数据。
          // 这种情况下本地通常只有默认示例数据，不需要让用户选择。
          if (localVersion === 0) {
            applyCloudData(cloudData.data, auth.role);
            const { meta: _meta, ...cloudPayload } = cloudData.data;
            prevBusinessSignatureRef.current = buildSyncBusinessSignature(cloudPayload);
            prevFullSignatureRef.current = buildSyncFullSignature(cloudPayload);
            return;
          }

          // 版本不一致时提示用户选择（仅当本地已有同步记录时）
          if (cloudData.data.meta.version !== localVersion) {
            // 管理员模式（可写）：本地与云端 version 不一致时，无法自动决定保留哪份。
            // 这里构造一个"本地快照 vs 云端快照"的冲突对象，交给 UI 让用户选择：保留本地（强制覆盖）/保留云端（丢弃本地）。
            // Prepare encrypted sensitive config for sync (Requirements 2.1, 2.6)
            const syncPassword = getSyncPassword().trim();
            const encryptResult = await encryptApiKeyForSync({
              syncPassword,
              apiKey: aiConfig?.apiKey || '',
              cacheRef: encryptedSensitiveConfigCacheRef,
            });

            const privacyConfig: SyncPrivacyConfig = {
              groupEnabled: privacyGroupEnabled,
              passwordEnabled: privacyPasswordEnabled,
              autoUnlockEnabled: privacyAutoUnlockEnabled,
              useSeparatePassword: useSeparatePrivacyPassword,
            };

            // 使用 auth.role 而不是 isAdmin，因为 isAdmin 可能还未更新
            const isAdminRole = auth.role === 'admin';
            const localData = buildLocalSyncPayload({
              links,
              categories,
              countdowns,
              searchMode,
              externalSearchSources,
              aiConfig,
              siteSettings,
              privateVaultCipher,
              isAdmin: isAdminRole,
              privacyConfig,
              themeMode,
              encryptedSensitiveConfig: encryptResult.encrypted,
            });
            handleSyncConflict({
              localData: {
                ...localData,
                meta: { updatedAt: localUpdatedAt, deviceId: localDeviceId, version: localVersion },
              },
              remoteData: cloudData.data,
            });
          } else {
            // 版本一致时：初始化签名以避免"不必要的自动同步"。
            // 典型场景：用户刚打开页面，本地已是最新版本；如果不初始化签名，后续 effect 可能把当前状态当成"变更"而触发 push。
            const syncPassword = getSyncPassword().trim();
            const encryptResult = await encryptApiKeyForSync({
              syncPassword,
              apiKey: aiConfig?.apiKey || '',
              cacheRef: encryptedSensitiveConfigCacheRef,
            });

            const privacyConfig: SyncPrivacyConfig = {
              groupEnabled: privacyGroupEnabled,
              passwordEnabled: privacyPasswordEnabled,
              autoUnlockEnabled: privacyAutoUnlockEnabled,
              useSeparatePassword: useSeparatePrivacyPassword,
            };

            const localData = buildLocalSyncPayload({
              links,
              categories,
              countdowns,
              searchMode,
              externalSearchSources,
              aiConfig,
              siteSettings,
              privateVaultCipher,
              isAdmin: true,
              privacyConfig,
              themeMode,
              encryptedSensitiveConfig: encryptResult.encrypted,
            });
            prevBusinessSignatureRef.current = buildSyncBusinessSignature(localData);
            prevFullSignatureRef.current = buildSyncFullSignature(localData);
          }
        }
      } finally {
        // 无论初始同步成功还是失败，都标记为完成以隐藏加载动画
        setIsInitialSyncComplete(true);
      }
    };

    void checkCloudData();
  }, [
    aiConfig,
    applyCloudData,
    categories,
    countdowns,
    externalSearchSources,
    getLocalSyncMeta,
    handleSyncConflict,
    isLoaded,
    links,
    privacyAutoUnlockEnabled,
    privacyGroupEnabled,
    privacyPasswordEnabled,
    privateVaultCipher,
    pullFromCloud,
    refreshSyncAuth,
    searchMode,
    siteSettings,
    themeMode,
    useSeparatePrivacyPassword,
  ]);

  useEffect(() => {
    // 跳过初始加载阶段
    if (!isLoaded || !hasInitialSyncRun.current || currentConflict) return;
    if (isSyncPasswordRefreshingRef.current) return;
    if (!isAdmin) return;

    const performSync = async () => {
      const privacyConfig: SyncPrivacyConfig = {
        groupEnabled: privacyGroupEnabled,
        passwordEnabled: privacyPasswordEnabled,
        autoUnlockEnabled: privacyAutoUnlockEnabled,
        useSeparatePassword: useSeparatePrivacyPassword,
      };

      const syncDataBase = buildLocalSyncPayload({
        links,
        categories,
        countdowns,
        searchMode,
        externalSearchSources,
        aiConfig,
        siteSettings,
        privateVaultCipher,
        isAdmin: true,
        privacyConfig,
        themeMode,
      });
      const businessSignature = buildSyncBusinessSignature(syncDataBase);
      const fullSignature = buildSyncFullSignature(syncDataBase);

      // 两类变更判定：
      // - businessSignature：业务数据（链接/分类/设置等），不包含点击统计等高频字段。
      // - fullSignature：包含点击统计等高频字段，用于判定“只有统计变更”的场景。
      const businessChanged = businessSignature !== prevBusinessSignatureRef.current;
      const fullChanged = fullSignature !== prevFullSignatureRef.current;

      if (!businessChanged && !fullChanged) return;

      // 业务数据变更：走 useSyncEngine 的 debounce（SYNC_DEBOUNCE_MS）自动同步。
      // 注意：自动同步默认不写入“同步记录”(history snapshot)，避免刷屏 & KV 写放大（见 useSyncEngine.schedulePush）。
      if (businessChanged) {
        prevBusinessSignatureRef.current = businessSignature;
        prevFullSignatureRef.current = fullSignature;
        cancelPendingStatsSync();
      } else if (fullChanged) {
        // 只有点击统计等“高频字段”变化：走更长的批量上报（SYNC_STATS_DEBOUNCE_MS）。
        // 这一分支不会触发 schedulePush，避免“每次点击都触发一次同步”。
        prevFullSignatureRef.current = fullSignature;
        pendingStatsSyncDataRef.current = syncDataBase;

        if (statsSyncTimerRef.current) {
          clearTimeout(statsSyncTimerRef.current);
        }

        statsSyncTimerRef.current = setTimeout(async () => {
          statsSyncTimerRef.current = null;
          await flushPendingStatsSync();
        }, SYNC_STATS_DEBOUNCE_MS);

        return;
      }

      // Prepare encrypted sensitive config for sync (Requirements 2.1, 2.6)
      const syncPassword = getSyncPassword().trim();
      const apiKey = aiConfig?.apiKey?.trim() || '';
      const encryptResult = await encryptApiKeyForSync({
        syncPassword,
        apiKey,
        cacheRef: encryptedSensitiveConfigCacheRef,
      });

      schedulePush(
        encryptResult.encrypted
          ? { ...syncDataBase, encryptedSensitiveConfig: encryptResult.encrypted }
          : syncDataBase,
      );
    };

    void performSync();
  }, [
    aiConfig,
    cancelPendingStatsSync,
    categories,
    countdowns,
    currentConflict,
    externalSearchSources,
    flushPendingStatsSync,
    isAdmin,
    isLoaded,
    isSyncPasswordRefreshingRef,
    links,
    privacyAutoUnlockEnabled,
    privacyGroupEnabled,
    privacyPasswordEnabled,
    privateVaultCipher,
    schedulePush,
    searchMode,
    siteSettings,
    themeMode,
    useSeparatePrivacyPassword,
  ]);

  useEffect(() => {
    syncPasswordRefreshTickRef.current = syncPasswordRefreshTick;
    if (!pendingSensitiveConfigSyncRef.current) return;
    if (!isLoaded || !hasInitialSyncRun.current || currentConflict) return;
    if (isSyncPasswordRefreshingRef.current) return;
    if (!isAdmin) return;

    // 当 sync password 变化时，encryptedSensitiveConfig 需要用新密码重新加密再同步：
    // - 避免云端保存的密文仍使用旧密码，导致其他设备无法解密 API Key。
    // - 这里不直接 pushToCloud（manual），而是走 schedulePush，让它并入自动同步队列并保持串行化。
    const syncPassword = getSyncPassword().trim();
    const apiKey = aiConfig?.apiKey?.trim() || '';

    if (!syncPassword || !apiKey) {
      pendingSensitiveConfigSyncRef.current = false;
      return;
    }

    const syncEncryptedConfig = async () => {
      const encryptResult = await encryptApiKeyForSync({
        syncPassword,
        apiKey,
        cacheRef: encryptedSensitiveConfigCacheRef,
      });

      pendingSensitiveConfigSyncRef.current = false;
      if (!encryptResult.encrypted) return;

      const privacyConfig: SyncPrivacyConfig = {
        groupEnabled: privacyGroupEnabled,
        passwordEnabled: privacyPasswordEnabled,
        autoUnlockEnabled: privacyAutoUnlockEnabled,
        useSeparatePassword: useSeparatePrivacyPassword,
      };

      const syncDataBase = buildLocalSyncPayload({
        links,
        categories,
        countdowns,
        searchMode,
        externalSearchSources,
        aiConfig,
        siteSettings,
        privateVaultCipher,
        isAdmin: true,
        privacyConfig,
        themeMode,
      });

      schedulePush({ ...syncDataBase, encryptedSensitiveConfig: encryptResult.encrypted });
    };

    void syncEncryptedConfig();
  }, [
    aiConfig,
    categories,
    countdowns,
    currentConflict,
    externalSearchSources,
    isAdmin,
    isLoaded,
    isSyncPasswordRefreshingRef,
    links,
    pendingSensitiveConfigSyncRef,
    privacyAutoUnlockEnabled,
    privacyGroupEnabled,
    privacyPasswordEnabled,
    privateVaultCipher,
    schedulePush,
    searchMode,
    siteSettings,
    syncPasswordRefreshTick,
    themeMode,
    useSeparatePrivacyPassword,
  ]);

  return {
    isInitialSyncComplete,
    prevBusinessSignatureRef,
    prevFullSignatureRef,
    encryptedSensitiveConfigCacheRef,
    cancelPendingStatsSync,
  };
};
