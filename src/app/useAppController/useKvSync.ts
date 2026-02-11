import { useCallback, useEffect, useRef, useState } from 'react';
import i18n from '../../config/i18n';
import { buildSyncData, useSyncEngine } from '../../hooks';
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
  VerifySyncPasswordResult,
} from '../../types';
import type { ConfirmFn, NotifyFn } from '../../types/ui';
import { requireAdminAccess } from '../../utils/adminAccess';
import { getDeviceId, SYNC_API_ENDPOINT, SYNC_META_KEY } from '../../utils/constants';
import { getErrorMessage } from '../../utils/error';
import { clearSyncAdminSession, getSyncPassword, setSyncAdminSession } from '../../utils/secrets';
import { safeLocalStorageGetItem } from '../../utils/storage';
import { validateLoginResponse } from '../../utils/typeGuards';

import { applyCloudDataToLocalState } from './kvSync/applyCloudData';
import { buildLocalSyncPayload, type SyncPrivacyConfig } from './kvSync/buildLocalSyncPayload';
import { encryptApiKeyForSync } from './kvSync/encryptedSensitiveConfig';
import { useKvSyncStrategy } from './kvSync/useKvSyncStrategy';
import {
  decideSyncErrorToast,
  SYNC_ERROR_TOAST_COOLDOWN_MS,
  type SyncErrorToastRecord,
  USER_INITIATED_SYNC_WINDOW_MS,
} from './syncErrorToast';
import { buildSyncBusinessSignature, buildSyncFullSignature } from './syncSignatures';

export interface UseKvSyncOptions {
  isLoaded: boolean;
  links: LinkItem[];
  categories: Category[];
  countdowns: CountdownItem[];
  updateData: (links: LinkItem[], categories: Category[]) => void;
  restoreCountdowns: (items: CountdownItem[]) => void;

  // Sidebar selection is used when applying privacyConfig from cloud
  selectedCategory: string;
  setSelectedCategory: (categoryId: string) => void;

  // Search config
  searchMode: SearchMode;
  externalSearchSources: ExternalSearchSource[];
  restoreSearchConfig: (config: {
    mode: SearchMode;
    externalSources: ExternalSearchSource[];
  }) => void;

  // Config
  aiConfig: AIConfig;
  saveAIConfig: (config: AIConfig, newSiteSettings?: SiteSettings) => void;
  restoreAIConfig: (config: AIConfig) => void;
  siteSettings: SiteSettings;
  restoreSiteSettings: (settings: SiteSettings) => void;

  // Theme
  themeMode: ThemeMode;
  applyFromSync: (mode: ThemeMode) => void;

  // Privacy vault
  privateVaultCipher: string | null;
  setPrivateVaultCipher: (cipher: string | null) => void;
  setPrivateLinks: (links: LinkItem[]) => void;
  isPrivateUnlocked: boolean;
  setIsPrivateUnlocked: (unlocked: boolean) => void;
  privateVaultPassword: string | null;
  setPrivateVaultPassword: (password: string | null) => void;
  useSeparatePrivacyPassword: boolean;
  setUseSeparatePrivacyPassword: (useSeparate: boolean) => void;
  privacyGroupEnabled: boolean;
  setPrivacyGroupEnabled: (enabled: boolean) => void;
  privacyPasswordEnabled: boolean;
  setPrivacyPasswordEnabled: (enabled: boolean) => void;
  privacyAutoUnlockEnabled: boolean;
  setPrivacyAutoUnlockEnabled: (enabled: boolean) => void;
  setIsPrivateModalOpen: (open: boolean) => void;
  setEditingPrivateLink: (link: LinkItem | null) => void;
  setPrefillPrivateLink: (link: Partial<LinkItem> | null) => void;

  // UI
  notify: NotifyFn;
  confirm: ConfirmFn;
}

export const useKvSync = (options: UseKvSyncOptions) => {
  const {
    isLoaded,
    links,
    categories,
    countdowns,
    updateData,
    restoreCountdowns,
    selectedCategory,
    setSelectedCategory,
    searchMode,
    externalSearchSources,
    restoreSearchConfig,
    aiConfig,
    saveAIConfig,
    restoreAIConfig,
    siteSettings,
    restoreSiteSettings,
    themeMode,
    applyFromSync,
    privateVaultCipher,
    setPrivateVaultCipher,
    setPrivateLinks,
    isPrivateUnlocked,
    setIsPrivateUnlocked,
    privateVaultPassword,
    setPrivateVaultPassword,
    useSeparatePrivacyPassword,
    setUseSeparatePrivacyPassword,
    privacyGroupEnabled,
    setPrivacyGroupEnabled,
    privacyPasswordEnabled,
    setPrivacyPasswordEnabled,
    privacyAutoUnlockEnabled,
    setPrivacyAutoUnlockEnabled,
    setIsPrivateModalOpen,
    setEditingPrivateLink,
    setPrefillPrivateLink,
    notify,
    confirm,
  } = options;

  const restoreSearchConfigRef = useRef<
    ((config: { mode: SearchMode; externalSources: ExternalSearchSource[] }) => void) | null
  >(null);
  restoreSearchConfigRef.current = restoreSearchConfig;

  // === Sync State ===
  const [syncConflictOpen, setSyncConflictOpen] = useState(false);
  const [currentConflict, setCurrentConflict] = useState<SyncConflict | null>(null);
  const lastSyncPasswordRef = useRef(getSyncPassword().trim());
  const isSyncPasswordRefreshingRef = useRef(false);
  const pendingSensitiveConfigSyncRef = useRef(false);
  const suppressSyncErrorToastRef = useRef(false);
  const lastUserInitiatedSyncAtRef = useRef(0);
  const userInitiatedSyncInFlightCountRef = useRef(0);
  const lastSyncErrorToastRef = useRef<SyncErrorToastRecord | null>(null);
  const [syncRole, setSyncRole] = useState<SyncRole>('user');
  const [isSyncProtected, setIsSyncProtected] = useState(false);
  const [syncPasswordRefreshTick, setSyncPasswordRefreshTick] = useState(0);
  const isAdmin = syncRole === 'admin';

  const getLocalSyncMeta = useCallback(() => {
    const stored = safeLocalStorageGetItem(SYNC_META_KEY);
    if (!stored) return null;
    try {
      return JSON.parse(stored);
    } catch {
      return null;
    }
  }, []);

  const requireAdmin = useCallback(
    (message?: string): boolean => requireAdminAccess(isAdmin, notify, message),
    [isAdmin, notify],
  );

  const handleSyncConflict = useCallback((conflict: SyncConflict) => {
    setCurrentConflict(conflict);
    setSyncConflictOpen(true);
  }, []);

  // === Apply Cloud Data ===
  const applyCloudData = useCallback(
    (data: NavHubSyncData, role: SyncRole) => {
      applyCloudDataToLocalState({
        data,
        role,
        updateData,
        restoreCountdowns,
        restoreSearchConfigRef,
        restoreSiteSettings,
        applyFromSync,
        aiConfig,
        restoreAIConfig,
        selectedCategory,
        setSelectedCategory,
        privacyGroupEnabled,
        setPrivacyGroupEnabled,
        privacyPasswordEnabled,
        setPrivacyPasswordEnabled,
        privacyAutoUnlockEnabled,
        setPrivacyAutoUnlockEnabled,
        setUseSeparatePrivacyPassword,
        setPrivateVaultCipher,
        setPrivateLinks,
        isPrivateUnlocked,
        setIsPrivateUnlocked,
        privateVaultPassword,
        setPrivateVaultPassword,
        setIsPrivateModalOpen,
        setEditingPrivateLink,
        setPrefillPrivateLink,
        notify,
      });
    },
    [
      aiConfig,
      applyFromSync,
      isPrivateUnlocked,
      notify,
      privacyAutoUnlockEnabled,
      privacyGroupEnabled,
      privacyPasswordEnabled,
      privateVaultPassword,
      restoreAIConfig,
      restoreSiteSettings,
      selectedCategory,
      setEditingPrivateLink,
      setIsPrivateModalOpen,
      setIsPrivateUnlocked,
      setPrefillPrivateLink,
      setPrivateLinks,
      setPrivateVaultCipher,
      setPrivateVaultPassword,
      setPrivacyAutoUnlockEnabled,
      setPrivacyGroupEnabled,
      setPrivacyPasswordEnabled,
      setSelectedCategory,
      setUseSeparatePrivacyPassword,
      updateData,
      restoreCountdowns,
    ],
  );

  // 使用 ref 存储签名更新回调，在 useKvSyncStrategy 返回后赋值
  const updateSignaturesRef = useRef<((payload: Omit<NavHubSyncData, 'meta'>) => void) | null>(
    null,
  );

  const handleSyncComplete = useCallback(
    (data: NavHubSyncData) => {
      // 先更新签名，防止 applyCloudData 触发的状态变化被自动同步 effect 误判为"本地变更"
      const { meta: _meta, ...payload } = data;
      updateSignaturesRef.current?.(payload);
      applyCloudData(data, syncRole);
    },
    [applyCloudData, syncRole],
  );

  const toastSyncError = useCallback(
    (error: string) => {
      console.error('[Sync Error]', error);
      if (suppressSyncErrorToastRef.current) return;

      const now = Date.now();
      const effectiveLastUserInitiatedAt =
        userInitiatedSyncInFlightCountRef.current > 0 ? now : lastUserInitiatedSyncAtRef.current;
      // 同步错误提示策略：
      // - 用户手动触发（手动同步/拉取/冲突解决/备份恢复等）后短时间内发生的错误，应立即提示（不做冷却）。
      // - 后台自动同步（debounce/stats 批量）如果频繁失败，toast 会让用户“刷屏”；因此相同错误会按 cooldown 去重。
      const decision = decideSyncErrorToast({
        error,
        now,
        lastUserInitiatedAt: effectiveLastUserInitiatedAt,
        lastToast: lastSyncErrorToastRef.current,
        userInitiatedWindowMs: USER_INITIATED_SYNC_WINDOW_MS,
        cooldownMs: SYNC_ERROR_TOAST_COOLDOWN_MS,
      });
      lastSyncErrorToastRef.current = decision.nextToast;
      if (!decision.toastMessage) return;
      notify(decision.toastMessage, 'error');
    },
    [notify],
  );

  const {
    syncStatus,
    lastSyncTime,
    lastError: syncErrorMessage,
    lastErrorKind: syncErrorKind,
    pullFromCloud,
    pushToCloud,
    schedulePush,
    restoreBackup,
    deleteBackup,
    resolveConflict: resolveSyncConflict,
    cancelPendingSync,
    flushPendingSync,
    checkAuth,
  } = useSyncEngine({
    onConflict: handleSyncConflict,
    onSyncComplete: handleSyncComplete,
    onError: toastSyncError,
  });

  const refreshSyncAuth = useCallback(async () => {
    const auth = await checkAuth();
    setSyncRole(auth.role);
    setIsSyncProtected(auth.protected);
    if (auth.role !== 'admin') {
      clearSyncAdminSession();
    }
    return auth;
  }, [checkAuth]);

  useEffect(() => {
    refreshSyncAuth();
  }, [refreshSyncAuth]);

  const {
    isInitialSyncComplete,
    prevBusinessSignatureRef,
    prevFullSignatureRef,
    encryptedSensitiveConfigCacheRef,
    cancelPendingStatsSync,
  } = useKvSyncStrategy({
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
  });

  // 绑定签名更新回调，供 handleSyncComplete 使用
  updateSignaturesRef.current = (payload) => {
    prevBusinessSignatureRef.current = buildSyncBusinessSignature(payload);
    prevFullSignatureRef.current = buildSyncFullSignature(payload);
  };

  const handleSaveSettings = useCallback(
    async (nextConfig: AIConfig, nextSiteSettings: SiteSettings) => {
      saveAIConfig(nextConfig, nextSiteSettings);

      // 仅管理员可把“保存设置”同步到云端
      if (!isAdmin) return;

      // Prepare encrypted sensitive config for sync (Requirements 2.1, 2.6)
      const syncPassword = getSyncPassword().trim();
      const encryptResult = await encryptApiKeyForSync({
        syncPassword,
        apiKey: nextConfig?.apiKey || '',
        cacheRef: encryptedSensitiveConfigCacheRef,
      });

      if (encryptResult.error) {
        notify(i18n.t('errors.encryptionFailed'), 'warning');
      }

      const privacyConfig: SyncPrivacyConfig = {
        groupEnabled: privacyGroupEnabled,
        passwordEnabled: privacyPasswordEnabled,
        autoUnlockEnabled: privacyAutoUnlockEnabled,
        useSeparatePassword: useSeparatePrivacyPassword,
      };

      const syncData = buildLocalSyncPayload({
        links,
        categories,
        countdowns,
        searchMode,
        externalSearchSources,
        aiConfig: nextConfig,
        siteSettings: nextSiteSettings,
        privateVaultCipher,
        isAdmin: true,
        privacyConfig,
        themeMode,
        encryptedSensitiveConfig: encryptResult.encrypted,
      });

      // 避免与自动同步重复触发
      // - 先更新签名：告诉 auto-sync effect “这些变更已经被我们处理过了”。
      // - 再 cancelPending：避免队列里还留着旧快照的 pending push（会覆盖刚保存的设置）。
      prevBusinessSignatureRef.current = buildSyncBusinessSignature(syncData);
      prevFullSignatureRef.current = buildSyncFullSignature(syncData);
      cancelPendingSync();
      cancelPendingStatsSync();
      lastUserInitiatedSyncAtRef.current = Date.now();
      userInitiatedSyncInFlightCountRef.current += 1;
      void pushToCloud(syncData, false, 'manual').finally(() => {
        userInitiatedSyncInFlightCountRef.current = Math.max(
          0,
          userInitiatedSyncInFlightCountRef.current - 1,
        );
      });
    },
    [
      saveAIConfig,
      isAdmin,
      links,
      categories,
      countdowns,
      searchMode,
      externalSearchSources,
      privateVaultCipher,
      privacyGroupEnabled,
      privacyPasswordEnabled,
      privacyAutoUnlockEnabled,
      useSeparatePrivacyPassword,
      encryptedSensitiveConfigCacheRef,
      prevBusinessSignatureRef,
      prevFullSignatureRef,
      cancelPendingSync,
      cancelPendingStatsSync,
      pushToCloud,
      themeMode,
      notify,
    ],
  );

  // === Sync Conflict Resolution ===
  const handleResolveConflict = useCallback(
    async (choice: 'local' | 'remote') => {
      if (currentConflict) {
        const { meta: _meta, ...payload } =
          choice === 'remote' ? currentConflict.remoteData : currentConflict.localData;
        // 冲突解决后，本地会应用"用户选择的那份"数据。
        // 先把签名更新到这份 payload，避免随后 state 更新触发 auto-sync 误判为"又有新变更"。
        prevBusinessSignatureRef.current = buildSyncBusinessSignature(payload);
        prevFullSignatureRef.current = buildSyncFullSignature(payload);
      }

      // 冲突解决属于用户显式操作：
      // - 取消所有 pending 自动同步，避免后台写入与用户决策交错
      // - 标记为 user initiated，让失败 toast 立即提示（不做 cooldown）
      cancelPendingSync();
      cancelPendingStatsSync();
      lastUserInitiatedSyncAtRef.current = Date.now();
      userInitiatedSyncInFlightCountRef.current += 1;

      try {
        // 等待冲突解决完成，如果选择本地版本但推送失败，保留冲突状态让用户可以重试
        const success = await resolveSyncConflict(choice);
        if (success) {
          setSyncConflictOpen(false);
          setCurrentConflict(null);
        }
      } finally {
        userInitiatedSyncInFlightCountRef.current = Math.max(
          0,
          userInitiatedSyncInFlightCountRef.current - 1,
        );
      }
    },
    [
      currentConflict,
      cancelPendingSync,
      cancelPendingStatsSync,
      resolveSyncConflict,
      prevBusinessSignatureRef,
      prevFullSignatureRef,
    ],
  );

  // 手动触发同步
  const handleManualSync = useCallback(async () => {
    if (!requireAdmin()) return;

    // 手动同步：用户期望"立刻同步"，因此直接 pushToCloud(syncKind='manual')。
    // 同时会写入同步记录（除非服务端策略变化），便于用户在"最近同步记录"中看到这一笔。
    // Prepare encrypted sensitive config for sync (Requirements 2.1, 2.6)
    const syncPassword = getSyncPassword().trim();
    const encryptResult = await encryptApiKeyForSync({
      syncPassword,
      apiKey: aiConfig?.apiKey || '',
      cacheRef: encryptedSensitiveConfigCacheRef,
    });

    if (encryptResult.error) {
      notify(i18n.t('errors.encryptionFailed'), 'warning');
    }

    const privacyConfig: SyncPrivacyConfig = {
      groupEnabled: privacyGroupEnabled,
      passwordEnabled: privacyPasswordEnabled,
      autoUnlockEnabled: privacyAutoUnlockEnabled,
      useSeparatePassword: useSeparatePrivacyPassword,
    };

    const syncData = buildLocalSyncPayload({
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

    // 避免与自动同步重复触发
    prevBusinessSignatureRef.current = buildSyncBusinessSignature(syncData);
    prevFullSignatureRef.current = buildSyncFullSignature(syncData);
    cancelPendingSync();
    cancelPendingStatsSync();
    lastUserInitiatedSyncAtRef.current = Date.now();
    userInitiatedSyncInFlightCountRef.current += 1;
    try {
      await pushToCloud(syncData, false, 'manual');
    } finally {
      userInitiatedSyncInFlightCountRef.current = Math.max(
        0,
        userInitiatedSyncInFlightCountRef.current - 1,
      );
    }
  }, [
    requireAdmin,
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
    encryptedSensitiveConfigCacheRef,
    prevBusinessSignatureRef,
    prevFullSignatureRef,
    cancelPendingSync,
    cancelPendingStatsSync,
    pushToCloud,
    notify,
  ]);

  const performPull = useCallback(
    async (role: SyncRole) => {
      const localMeta = getLocalSyncMeta();
      const localVersion = localMeta?.version ?? 0;
      const localUpdatedAt = typeof localMeta?.updatedAt === 'number' ? localMeta.updatedAt : 0;
      const localDeviceId = localMeta?.deviceId || getDeviceId();

      const cloudData = await pullFromCloud();
      if (!cloudData.data || !cloudData.data.links || !cloudData.data.categories) return;

      // 用户模式：直接以云端为准，不弹冲突
      if (role !== 'admin') {
        cancelPendingSync();
        cancelPendingStatsSync();
        applyCloudData(cloudData.data, role);
        return;
      }

      // 管理员模式：版本不一致时提示用户选择
      if (cloudData.data.meta.version !== localVersion) {
        // 手动拉取时同样遵循"版本不一致就弹冲突"：
        // 管理员可能在当前设备做过未同步的修改，也可能是云端被其他设备更新过，必须人工决策。
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
        cancelPendingSync();
        cancelPendingStatsSync();
        handleSyncConflict({
          localData: {
            ...localData,
            meta: { updatedAt: localUpdatedAt, deviceId: localDeviceId, version: localVersion },
          },
          remoteData: cloudData.data,
        });
        return;
      }

      cancelPendingSync();
      cancelPendingStatsSync();
      const { meta: _meta, ...payload } = cloudData.data;
      // 拉取并应用云端后，把签名更新到云端 payload，避免随后 auto-sync 误判为"本地变更"而再推一次。
      prevBusinessSignatureRef.current = buildSyncBusinessSignature(payload);
      prevFullSignatureRef.current = buildSyncFullSignature(payload);
      applyCloudData(cloudData.data, role);
    },
    [
      getLocalSyncMeta,
      pullFromCloud,
      applyCloudData,
      links,
      categories,
      countdowns,
      searchMode,
      externalSearchSources,
      aiConfig,
      siteSettings,
      privateVaultCipher,
      encryptedSensitiveConfigCacheRef,
      prevBusinessSignatureRef,
      prevFullSignatureRef,
      handleSyncConflict,
      themeMode,
      privacyGroupEnabled,
      privacyPasswordEnabled,
      privacyAutoUnlockEnabled,
      useSeparatePrivacyPassword,
      cancelPendingSync,
      cancelPendingStatsSync,
    ],
  );

  const handleManualPull = useCallback(async () => {
    lastUserInitiatedSyncAtRef.current = Date.now();
    userInitiatedSyncInFlightCountRef.current += 1;
    try {
      await performPull(syncRole);
    } finally {
      userInitiatedSyncInFlightCountRef.current = Math.max(
        0,
        userInitiatedSyncInFlightCountRef.current - 1,
      );
    }
  }, [performPull, syncRole]);

  const handleSyncPasswordChange = useCallback(
    (nextPassword: string) => {
      const trimmed = nextPassword.trim();
      if (trimmed === lastSyncPasswordRef.current) return;
      lastSyncPasswordRef.current = trimmed;
      pendingSensitiveConfigSyncRef.current = true;

      // 任何密码变更都会退出管理员会话，需要重新点击“登录”验证
      // 同时，自动同步依赖“是否为管理员会话”来决定是否携带 X-Sync-Password，因此这里先清理会话并暂停所有 pending 写入。
      clearSyncAdminSession();
      cancelPendingSync();
      cancelPendingStatsSync();

      if (syncRole === 'admin' && isSyncProtected) {
        setSyncRole('user');
      }
    },
    [cancelPendingSync, cancelPendingStatsSync, isSyncProtected, syncRole],
  );

  const handleVerifySyncPassword = useCallback(async (): Promise<VerifySyncPasswordResult> => {
    if (!isSyncProtected) {
      // 未开启密码保护：所有访问者默认拥有管理员权限
      setSyncRole('admin');
      return { success: true, role: 'admin' };
    }

    const password = getSyncPassword().trim();
    if (!password) {
      clearSyncAdminSession();
      setSyncRole('user');
      return {
        success: false,
        role: 'user',
        error: i18n.t('settings.data.enterPasswordToLogin'),
      };
    }

    cancelPendingSync();
    cancelPendingStatsSync();
    isSyncPasswordRefreshingRef.current = true;

    try {
      // 登录接口只用于“验证密码 + 统计失败次数/锁定”，真正的数据刷新仍由 performPull 完成。
      const response = await fetch(`${SYNC_API_ENDPOINT}?action=login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Sync-Password': password,
        },
        body: JSON.stringify({ deviceId: getDeviceId() }),
      });

      const rawResult: unknown = await response.json();
      const validation = validateLoginResponse(rawResult);
      if (!validation.valid) {
        clearSyncAdminSession();
        setSyncRole('user');
        return { success: false, role: 'user', error: validation.reason };
      }
      const result = validation.data;

      if (result.success === false) {
        clearSyncAdminSession();
        setSyncRole('user');
        await refreshSyncAuth();
        return {
          success: false,
          role: 'user',
          error: result.error || i18n.t('settings.data.loginFailed'),
          lockedUntil: typeof result.lockedUntil === 'number' ? result.lockedUntil : undefined,
          retryAfterSeconds:
            typeof result.retryAfterSeconds === 'number' ? result.retryAfterSeconds : undefined,
          remainingAttempts:
            typeof result.remainingAttempts === 'number' ? result.remainingAttempts : undefined,
          maxAttempts: typeof result.maxAttempts === 'number' ? result.maxAttempts : undefined,
        };
      }

      setSyncAdminSession(true);
      const auth = await refreshSyncAuth();
      await performPull(auth.role);

      return { success: true, role: auth.role };
    } catch (error: unknown) {
      clearSyncAdminSession();
      setSyncRole('user');
      return {
        success: false,
        role: 'user',
        error: getErrorMessage(error, i18n.t('errors.networkError')),
      };
    } finally {
      isSyncPasswordRefreshingRef.current = false;
      setSyncPasswordRefreshTick((prev) => prev + 1);
    }
  }, [cancelPendingSync, cancelPendingStatsSync, isSyncProtected, refreshSyncAuth, performPull]);

  const handleRestoreBackup = useCallback(
    async (backupKey: string) => {
      if (!requireAdmin()) return false;

      const confirmed = await confirm({
        title: i18n.t('settings.data.restoreBackupTitle'),
        message: i18n.t('settings.data.restoreBackupMessage'),
        confirmText: i18n.t('settings.data.restore'),
        cancelText: i18n.t('common.cancel'),
        variant: 'danger',
      });
      if (!confirmed) return false;

      cancelPendingSync();
      cancelPendingStatsSync();

      let restoredData: NavHubSyncData | null = null;
      suppressSyncErrorToastRef.current = true;
      try {
        restoredData = await restoreBackup(backupKey);
      } finally {
        suppressSyncErrorToastRef.current = false;
      }
      if (!restoredData) {
        notify(i18n.t('settings.data.restoreBackupFailed'), 'error');
        return false;
      }

      handleSyncComplete(restoredData);
      const restoredPayload = buildSyncData(
        restoredData.links,
        restoredData.categories,
        restoredData.countdowns,
        restoredData.searchConfig,
        restoredData.aiConfig,
        restoredData.siteSettings,
        restoredData.privateVault,
        restoredData.privacyConfig,
        restoredData.themeMode,
        restoredData.encryptedSensitiveConfig,
        restoredData.customFaviconCache,
      );
      prevBusinessSignatureRef.current = buildSyncBusinessSignature(restoredPayload);
      prevFullSignatureRef.current = buildSyncFullSignature(restoredPayload);
      notify(i18n.t('settings.data.restoreBackupSuccess'), 'success');
      return true;
    },
    [
      requireAdmin,
      confirm,
      restoreBackup,
      handleSyncComplete,
      notify,
      prevBusinessSignatureRef,
      prevFullSignatureRef,
      cancelPendingSync,
      cancelPendingStatsSync,
    ],
  );

  const handleDeleteBackup = useCallback(
    async (backupKey: string) => {
      if (!requireAdmin()) return false;

      const confirmed = await confirm({
        title: i18n.t('settings.data.deleteBackupTitle'),
        message: i18n.t('settings.data.deleteBackupMessage'),
        confirmText: i18n.t('common.delete'),
        cancelText: i18n.t('common.cancel'),
        variant: 'danger',
      });
      if (!confirmed) return false;

      let success = false;
      suppressSyncErrorToastRef.current = true;
      try {
        success = await deleteBackup(backupKey);
      } finally {
        suppressSyncErrorToastRef.current = false;
      }
      if (!success) {
        notify(i18n.t('settings.data.deleteBackupFailed'), 'error');
        return false;
      }

      notify(i18n.t('settings.data.deleteBackupSuccess'), 'success');
      return true;
    },
    [requireAdmin, confirm, deleteBackup, notify],
  );

  return {
    isInitialSyncComplete,
    syncRole,
    isSyncProtected,
    isAdmin,
    syncStatus,
    lastSyncTime,
    syncErrorMessage,
    syncErrorKind,
    syncConflictOpen,
    setSyncConflictOpen,
    currentConflict,
    handleResolveConflict,
    handleManualSync,
    handleManualPull,
    handleSyncPasswordChange,
    handleVerifySyncPassword,
    handleRestoreBackup,
    handleDeleteBackup,
    handleSaveSettings,
  };
};
