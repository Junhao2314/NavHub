import React, { useMemo, useEffect, useState, useCallback, useRef } from 'react';
import type { LinkItem, Category, SyncConflict, NavHubSyncData, AIConfig, SiteSettings, SearchConfig, SyncLoginResponse, SyncRole, VerifySyncPasswordResult } from '../types';

import { useDialog } from '../components/ui/DialogProvider';

import {
  useDataStore,
  useTheme,
  useSearch,
  useModals,
  useContextMenu,
  useBatchEdit,
  useSorting,
  useConfig,
  useSidebar,
  useSyncEngine,
  buildSyncData
} from '../hooks';

import {
  COMMON_CATEGORY_ID,
  PRIVATE_CATEGORY_ID,
  PRIVATE_VAULT_KEY,
  PRIVACY_AUTO_UNLOCK_KEY,
  PRIVACY_GROUP_ENABLED_KEY,
  PRIVACY_PASSWORD_ENABLED_KEY,
  PRIVACY_SESSION_UNLOCKED_KEY,
  PRIVACY_USE_SEPARATE_PASSWORD_KEY,
  SYNC_API_ENDPOINT,
  SYNC_META_KEY,
  SYNC_STATS_DEBOUNCE_MS,
  getDeviceId
} from '../utils/constants';
import { getErrorMessage } from '../utils/error';
import { decryptPrivateVault, encryptPrivateVault, parsePlainPrivateVault } from '../utils/privateVault';
import { decryptSensitiveConfigWithFallback, encryptSensitiveConfig } from '../utils/sensitiveConfig';
import { mergeFromCloud, buildSyncCache } from '../utils/faviconCache';
import { getCommonRecommendedLinks } from '../utils/recommendation';
import { requireAdminAccess } from '../utils/adminAccess';
import {
  safeLocalStorageGetItem,
  safeLocalStorageRemoveItem,
  safeLocalStorageSetItem,
  safeSessionStorageRemoveItem,
  safeSessionStorageSetItem
} from '../utils/storage';
import { clearSyncAdminSession, getPrivacyPassword, getSyncPassword, setSyncAdminSession } from '../utils/secrets';

import {
  buildSyncBusinessSignature,
  buildSyncFullSignature,
  type SyncPayload
} from './useAppController/syncSignatures';
import {
  decideSyncErrorToast,
  SYNC_ERROR_TOAST_COOLDOWN_MS,
  USER_INITIATED_SYNC_WINDOW_MS,
  type SyncErrorToastRecord
} from './useAppController/syncErrorToast';
import { useAppearance } from './useAppController/useAppearance';
import { usePrivacyVault } from './useAppController/usePrivacyVault';

export interface UseAppControllerOptions {
  onReady?: () => void;
}

export const useAppController = ({ onReady }: UseAppControllerOptions) => {
  // === Core Data ===
  const {
    links,
    categories,
    updateData,
    addLink,
    updateLink,
    deleteLink,
    recordAdminLinkClick,
    togglePin: togglePinStore,
    reorderLinks,
    reorderPinnedLinks,
    deleteCategory: deleteCategoryStore,
    importData,
    isLoaded
  } = useDataStore();
  const { notify, confirm } = useDialog();

  // === Sync Engine ===
  const [syncConflictOpen, setSyncConflictOpen] = useState(false);
  const [currentConflict, setCurrentConflict] = useState<SyncConflict | null>(null);
  const hasInitialSyncRun = useRef(false);
  const lastSyncPasswordRef = useRef(getSyncPassword().trim());
  const isSyncPasswordRefreshingRef = useRef(false);
  const pendingSensitiveConfigSyncRef = useRef(false);
  const suppressSyncErrorToastRef = useRef(false);
  const lastUserInitiatedSyncAtRef = useRef(0);
  const lastSyncErrorToastRef = useRef<SyncErrorToastRecord | null>(null);
  const restoreSearchConfigRef = useRef<((config: SearchConfig) => void) | null>(null);
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

  // === Theme ===
  const { themeMode, darkMode, setThemeAndApply, applyFromSync } = useTheme();

  // === Sidebar ===
  const {
    sidebarOpen,
    setSidebarOpen,
    isSidebarCollapsed,
    sidebarWidthClass,
    selectedCategory,
    setSelectedCategory,
    openSidebar,
    toggleSidebarCollapsed,
    handleCategoryClick,
    selectAll
  } = useSidebar();

  // === Config (AI, Site Settings) ===
  const {
    aiConfig,
    saveAIConfig,
    restoreAIConfig,
    restoreSiteSettings,
    siteSettings,
    handleViewModeChange,
    navTitleText,
    navTitleShort
  } = useConfig();

  // === Private Vault ===
  const {
    privateVaultCipher,
    setPrivateVaultCipher,
    privateLinks,
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
    isTogglingPrivacyPassword,
    isPrivateModalOpen,
    setIsPrivateModalOpen,
    editingPrivateLink,
    setEditingPrivateLink,
    prefillPrivateLink,
    setPrefillPrivateLink,
    privateCategories,
    existingPrivateTags,
    privateUnlockHint,
    privateUnlockSubHint,
    privateCount,
    closePrivateModal,
    openPrivateAddModal,
    openPrivateEditModal,
    handleUnlockPrivateVault,
    handlePrivateAddLink,
    handlePrivateEditLink,
    handlePrivateDeleteLink,
    handleMigratePrivacyMode,
    handleTogglePrivacyGroup,
    handleTogglePrivacyPassword,
    handleTogglePrivacyAutoUnlock,
    handleSelectPrivate
  } = usePrivacyVault({
    notify,
    confirm,
    selectedCategory,
    setSelectedCategory,
    setSidebarOpen
  });

  // === Sync Engine Hook ===
  const handleSyncConflict = useCallback((conflict: SyncConflict) => {
    setCurrentConflict(conflict);
    setSyncConflictOpen(true);
  }, []);

  const applyCloudData = useCallback((data: NavHubSyncData, role: SyncRole) => {
    if (data.links && data.categories) {
      updateData(data.links, data.categories);
    }
    if (data.searchConfig) {
      restoreSearchConfigRef.current?.(data.searchConfig);
    }
    if (data.siteSettings) {
      restoreSiteSettings(data.siteSettings);
    }

    // Apply themeMode from sync (Requirements 1.2)
    if (data.themeMode) {
      applyFromSync(data.themeMode);
    }

    // Merge customFaviconCache from cloud (Requirements 3.3)
    if (data.customFaviconCache) {
      mergeFromCloud(data.customFaviconCache);
    }

    // 用户模式：仅展示管理员最新内容，不覆盖本地敏感配置（如 AI Key、隐私分组）
    if (role !== 'admin') return;

    // Apply privacyConfig from sync (admin only)
    if (data.privacyConfig && typeof data.privacyConfig === 'object') {
      const cfg = data.privacyConfig;
      const nextGroupEnabled = typeof cfg.groupEnabled === 'boolean' ? cfg.groupEnabled : undefined;
      const effectiveGroupEnabled = nextGroupEnabled ?? privacyGroupEnabled;

      if (typeof cfg.useSeparatePassword === 'boolean') {
        setUseSeparatePrivacyPassword(cfg.useSeparatePassword);
        safeLocalStorageSetItem(PRIVACY_USE_SEPARATE_PASSWORD_KEY, cfg.useSeparatePassword ? '1' : '0');
      }

      if (typeof nextGroupEnabled === 'boolean') {
        setPrivacyGroupEnabled(nextGroupEnabled);
        safeLocalStorageSetItem(PRIVACY_GROUP_ENABLED_KEY, nextGroupEnabled ? '1' : '0');

        if (!nextGroupEnabled) {
          safeSessionStorageRemoveItem(PRIVACY_SESSION_UNLOCKED_KEY);
          if (selectedCategory === PRIVATE_CATEGORY_ID) {
            setSelectedCategory('all');
          }
          setIsPrivateUnlocked(false);
          setPrivateVaultPassword(null);
          setPrivateLinks([]);
          setIsPrivateModalOpen(false);
          setEditingPrivateLink(null);
          setPrefillPrivateLink(null);
        }
      }

      if (typeof cfg.passwordEnabled === 'boolean') {
        setPrivacyPasswordEnabled(cfg.passwordEnabled);
        safeLocalStorageSetItem(PRIVACY_PASSWORD_ENABLED_KEY, cfg.passwordEnabled ? '1' : '0');

        // Only apply lock/unlock side-effects when privacy group is enabled
        if (effectiveGroupEnabled) {
          if (cfg.passwordEnabled) {
            setIsPrivateUnlocked(false);
            setPrivateVaultPassword(null);
            setPrivateLinks([]);
            safeSessionStorageRemoveItem(PRIVACY_SESSION_UNLOCKED_KEY);
          } else {
            // Password is disabled, but the vault may still be encrypted from older deployments.
            // Unlock/migration should happen only after we confirm plaintext is available.
            setPrivateVaultPassword(null);
          }
        }
      }

      if (typeof cfg.autoUnlockEnabled === 'boolean') {
        setPrivacyAutoUnlockEnabled(cfg.autoUnlockEnabled);
        safeLocalStorageSetItem(PRIVACY_AUTO_UNLOCK_KEY, cfg.autoUnlockEnabled ? '1' : '0');

        if (effectiveGroupEnabled) {
          if (!cfg.autoUnlockEnabled) {
            safeSessionStorageRemoveItem(PRIVACY_SESSION_UNLOCKED_KEY);
          } else if (isPrivateUnlocked) {
            safeSessionStorageSetItem(PRIVACY_SESSION_UNLOCKED_KEY, '1');
          }
        }
      }
    }

    if (data.aiConfig) {
      const localApiKey = aiConfig?.apiKey || '';
      const nextApiKey = data.aiConfig.apiKey ? data.aiConfig.apiKey : localApiKey;
      restoreAIConfig({ ...data.aiConfig, apiKey: nextApiKey });
    }

    // Decrypt and apply encryptedSensitiveConfig (Requirements 2.3)
    if (typeof data.encryptedSensitiveConfig === 'string' && data.encryptedSensitiveConfig) {
      // `encryptedSensitiveConfig` is encrypted using the sync password. When “独立隐私密码” is enabled,
      // the in-memory `privateVaultPassword` may differ, so always try sync password first.
      const candidates = [
        getSyncPassword().trim(),
        (privateVaultPassword || '').trim(),
        getPrivacyPassword().trim()
      ];
      const hasAnyCandidate = candidates.some(Boolean);

      if (hasAnyCandidate) {
        decryptSensitiveConfigWithFallback(candidates, data.encryptedSensitiveConfig)
          .then(payload => {
            if (payload.apiKey) {
              // Apply the decrypted apiKey to aiConfig
              const currentAiConfig = data.aiConfig || {};
              restoreAIConfig({ ...currentAiConfig, apiKey: payload.apiKey });
            }
          })
          .catch(() => {
            // Password incorrect or data corrupted - leave apiKey empty
            // User will need to re-enter password or apiKey
            console.warn('Failed to decrypt sensitive config - password may be incorrect');
          });
      }
    }

    // 同步 privateVault：管理员模式下云端数据会包含 privateVault
    if (typeof data.privateVault === 'string') {
      setPrivateVaultCipher(data.privateVault);
      safeLocalStorageSetItem(PRIVATE_VAULT_KEY, data.privateVault);
      const nextGroupEnabled = typeof data.privacyConfig?.groupEnabled === 'boolean'
        ? data.privacyConfig.groupEnabled
        : privacyGroupEnabled;
      const nextPasswordEnabled = typeof data.privacyConfig?.passwordEnabled === 'boolean'
        ? data.privacyConfig.passwordEnabled
        : privacyPasswordEnabled;
      const plainVault = data.privateVault.trim()
        ? parsePlainPrivateVault(data.privateVault)
        : null;

      if (nextGroupEnabled && !nextPasswordEnabled) {
        setPrivateVaultPassword(null);
        if (!data.privateVault.trim()) {
          setPrivateLinks([]);
          setIsPrivateUnlocked(true);
          if (privacyAutoUnlockEnabled) {
            safeSessionStorageSetItem(PRIVACY_SESSION_UNLOCKED_KEY, '1');
          }
        } else if (plainVault) {
          setPrivateLinks(plainVault.links || []);
          setIsPrivateUnlocked(true);
          if (privacyAutoUnlockEnabled) {
            safeSessionStorageSetItem(PRIVACY_SESSION_UNLOCKED_KEY, '1');
          }
        } else {
          // 兼容：云端数据仍是加密格式，但配置已关闭密码保护（旧版本/切换过程中可能出现）
          // 此时不要标记为已解锁，避免后续保存/同步用空数据覆盖掉原有加密数据
          setPrivateLinks([]);
          setIsPrivateUnlocked(false);
          safeSessionStorageRemoveItem(PRIVACY_SESSION_UNLOCKED_KEY);
          const candidates = [
            getSyncPassword().trim(),
            getPrivacyPassword().trim()
          ].filter(Boolean);

          const tryDecrypt = (index: number) => {
            if (index >= candidates.length) return Promise.reject(new Error('No valid password'));
            return decryptPrivateVault(candidates[index], data.privateVault)
              .catch(() => tryDecrypt(index + 1));
          };

          if (candidates.length > 0) {
            tryDecrypt(0)
              .then((payload) => {
                const plaintext = JSON.stringify({ links: payload.links || [] });
                safeLocalStorageSetItem(PRIVATE_VAULT_KEY, plaintext);
                setPrivateVaultCipher(plaintext);
                setPrivateLinks(payload.links || []);
                setIsPrivateUnlocked(true);
                if (privacyAutoUnlockEnabled) {
                  safeSessionStorageSetItem(PRIVACY_SESSION_UNLOCKED_KEY, '1');
                }
              })
              .catch(() => {
                // Ignore: user may need to provide a password on this device to recover the vault
              });
          }
        }
      } else if (plainVault && isPrivateUnlocked) {
        setPrivateLinks(plainVault.links || []);
      } else if (isPrivateUnlocked && privateVaultPassword) {
        decryptPrivateVault(privateVaultPassword, data.privateVault)
          .then(payload => setPrivateLinks(payload.links || []))
          .catch(() => {
            setIsPrivateUnlocked(false);
            setPrivateLinks([]);
            setPrivateVaultPassword(null);
            notify('隐私分组已锁定，请重新解锁', 'warning');
          });
      }
    } else if (data.privateVault === null) {
      // 云端明确清空了 privateVault（区别于 undefined 表示未传递）
      setPrivateVaultCipher(null);
      safeLocalStorageRemoveItem(PRIVATE_VAULT_KEY);
      setPrivateLinks([]);
      setIsPrivateUnlocked(false);
      setPrivateVaultPassword(null);
    }
  }, [updateData, restoreSiteSettings, restoreAIConfig, aiConfig, isPrivateUnlocked, notify, privateVaultPassword, applyFromSync, privacyGroupEnabled, privacyPasswordEnabled, privacyAutoUnlockEnabled, selectedCategory, setSelectedCategory]);

  const handleSyncComplete = useCallback((data: NavHubSyncData) => {
    applyCloudData(data, syncRole);
  }, [applyCloudData, syncRole]);

  const handleSyncError = useCallback((error: string) => {
    console.error('[Sync Error]', error);
    if (suppressSyncErrorToastRef.current) return;

    const now = Date.now();
    // 同步错误提示策略：
    // - 用户手动触发（手动同步/拉取/冲突解决/备份恢复等）后短时间内发生的错误，应立即提示（不做冷却）。
    // - 后台自动同步（debounce/stats 批量）如果频繁失败，toast 会让用户“刷屏”；因此相同错误会按 cooldown 去重。
    const decision = decideSyncErrorToast({
      error,
      now,
      lastUserInitiatedAt: lastUserInitiatedSyncAtRef.current,
      lastToast: lastSyncErrorToastRef.current,
      userInitiatedWindowMs: USER_INITIATED_SYNC_WINDOW_MS,
      cooldownMs: SYNC_ERROR_TOAST_COOLDOWN_MS
    });
    lastSyncErrorToastRef.current = decision.nextToast;
    if (!decision.toastMessage) return;
    notify(decision.toastMessage, 'error');
  }, [notify]);

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
    checkAuth
  } = useSyncEngine({
    onConflict: handleSyncConflict,
    onSyncComplete: handleSyncComplete,
    onError: handleSyncError
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

  // === Search ===
  const {
    searchQuery,
    setSearchQuery,
    searchMode,
    externalSearchSources,
    selectedSearchSource,
    showSearchSourcePopup,
    setShowSearchSourcePopup,
    hoveredSearchSource,
    setHoveredSearchSource,
    setIsIconHovered,
    setIsPopupHovered,
    isMobileSearchOpen,
    handleSearchModeChange,
    handleSearchSourceSelect,
    handleExternalSearch,
    saveSearchConfig,
    restoreSearchConfig,
    toggleMobileSearch
  } = useSearch();

  restoreSearchConfigRef.current = restoreSearchConfig;

  // === Modals ===
  const {
    isModalOpen,
    editingLink,
    setEditingLink,
    prefillLink,
    setPrefillLink,
    openAddLinkModal,
    openEditLinkModal,
    closeLinkModal,
    isCatManagerOpen,
    setIsCatManagerOpen,
    isImportModalOpen,
    setIsImportModalOpen,
    isSettingsModalOpen,
    setIsSettingsModalOpen,
    isSearchConfigModalOpen,
    setIsSearchConfigModalOpen
  } = useModals();

  const isPrivateView = selectedCategory === PRIVATE_CATEGORY_ID;

  // === Computed: Displayed Links ===
  const pinnedLinks = useMemo(() => {
    const filteredPinnedLinks = links.filter(l => l.pinned);
    return filteredPinnedLinks.sort((a, b) => {
      if (a.pinnedOrder !== undefined && b.pinnedOrder !== undefined) {
        return a.pinnedOrder - b.pinnedOrder;
      }
      if (a.pinnedOrder !== undefined) return -1;
      if (b.pinnedOrder !== undefined) return 1;
      return a.createdAt - b.createdAt;
    });
  }, [links]);

  const commonRecommendedLinks = useMemo(() => getCommonRecommendedLinks(links), [links]);

  const displayedLinks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    // 站内搜索模式且有搜索词时，搜索全站资源
    const isInternalSearchWithQuery = searchMode === 'internal' && q;

    // 管理员模式 + 隐私分组启用 + 密码保护关闭 + 已解锁 → 站内搜索包含隐私分组
    const canSearchPrivate = isAdmin && privacyGroupEnabled && !privacyPasswordEnabled && isPrivateUnlocked;

    const baseLinks = selectedCategory === COMMON_CATEGORY_ID ? commonRecommendedLinks : links;

    let result = baseLinks;

    // Search Filter
    if (q) {
      // 站内搜索时搜索全站资源，符合条件时包含隐私分组
      let searchBase = isInternalSearchWithQuery ? links : baseLinks;
      if (isInternalSearchWithQuery && canSearchPrivate) {
        searchBase = [...links, ...privateLinks];
      }
      result = searchBase.filter(l =>
        l.title.toLowerCase().includes(q) ||
        l.url.toLowerCase().includes(q) ||
        (l.description && l.description.toLowerCase().includes(q)) ||
        (Array.isArray(l.tags) && l.tags.some(tag => tag.toLowerCase().includes(q)))
      );
    }

    // Category Filter (exclude common：常用推荐为"叠加集合"，不走 categoryId 过滤)
    // 站内搜索模式下不过滤分类，显示全站搜索结果
    if (
      !isInternalSearchWithQuery
      && selectedCategory !== 'all'
      && selectedCategory !== PRIVATE_CATEGORY_ID
      && selectedCategory !== COMMON_CATEGORY_ID
    ) {
      result = result.filter(l => l.categoryId === selectedCategory);
    }

    if (selectedCategory === COMMON_CATEGORY_ID && !isInternalSearchWithQuery) {
      // 常用推荐已在 getCommonRecommendedLinks 内完成排序
      return result;
    }

    // Sort by order
    return result.slice().sort((a, b) => {
      const aOrder = a.order !== undefined ? a.order : a.createdAt;
      const bOrder = b.order !== undefined ? b.order : b.createdAt;
      return aOrder - bOrder;
    });
  }, [links, selectedCategory, searchQuery, commonRecommendedLinks, searchMode, isAdmin, privacyGroupEnabled, privacyPasswordEnabled, isPrivateUnlocked, privateLinks]);

  const displayedPrivateLinks = useMemo(() => {
    let result = privateLinks;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(l =>
        l.title.toLowerCase().includes(q) ||
        l.url.toLowerCase().includes(q) ||
        (l.description && l.description.toLowerCase().includes(q)) ||
        (Array.isArray(l.tags) && l.tags.some(tag => tag.toLowerCase().includes(q)))
      );
    }

    return result.slice().sort((a, b) => {
      const aOrder = a.order !== undefined ? a.order : a.createdAt;
      const bOrder = b.order !== undefined ? b.order : b.createdAt;
      return aOrder - bOrder;
    });
  }, [privateLinks, searchQuery]);

  const activeDisplayedLinks = isPrivateView ? displayedPrivateLinks : displayedLinks;

  // === Batch Edit ===
  const {
    isBatchEditMode,
    selectedLinks,
    toggleBatchEditMode,
    toggleLinkSelection,
    handleBatchDelete,
    handleBatchMove,
    handleBatchPin,
    handleSelectAll
  } = useBatchEdit({
    links,
    categories,
    displayedLinks,
    updateData
  });

  const emptySelection = useMemo(() => new Set<string>(), []);

  const handleEditDisabled = useCallback(() => {
    requireAdminAccess(isAdmin, notify);
  }, [isAdmin, notify]);

  const requireAdmin = useCallback((message?: string): boolean => (
    requireAdminAccess(isAdmin, notify, message)
  ), [isAdmin, notify]);

  const effectiveIsBatchEditMode = isPrivateView || !isAdmin ? false : isBatchEditMode;
  const effectiveSelectedLinks = isPrivateView || !isAdmin ? emptySelection : selectedLinks;
  const effectiveSelectedLinksCount = isPrivateView || !isAdmin ? 0 : selectedLinks.size;
  const effectiveToggleBatchEditMode = isPrivateView || !isAdmin
    ? () => {
      requireAdmin();
    }
    : toggleBatchEditMode;
  const effectiveSelectAll = isPrivateView || !isAdmin ? () => { } : handleSelectAll;
  const effectiveBatchDelete = isPrivateView || !isAdmin ? () => { } : handleBatchDelete;
  const effectiveBatchPin = isPrivateView || !isAdmin ? () => { } : handleBatchPin;
  const effectiveBatchMove = isPrivateView || !isAdmin ? () => { } : handleBatchMove;
  const handleLinkSelect = isPrivateView || !isAdmin ? () => { } : toggleLinkSelection;

  // === Context Menu ===
  const {
    contextMenu,
    handleContextMenu,
    closeContextMenu,
    copyLinkToClipboard,
    editLinkFromContextMenu,
    deleteLinkFromContextMenu,
    togglePinFromContextMenu,
    toggleRecommendedFromContextMenu,
    duplicateLinkFromContextMenu,
    moveLinkFromContextMenu
  } = useContextMenu({
    links,
    categories,
    updateData,
    onEditLink: openEditLinkModal,
    isBatchEditMode
  });

  // === Sorting ===
  const {
    sensors,
    isSortingMode,
    isSortingPinned,
    isSortingCategory,
    startSorting,
    saveSorting,
    cancelSorting,
    startPinnedSorting,
    savePinnedSorting,
    cancelPinnedSorting,
    handleDragEnd,
    handlePinnedDragEnd
  } = useSorting({
    links,
    categories,
    selectedCategory,
    updateData,
    reorderLinks,
    reorderPinnedLinks
  });

  // === Computed: Sorting States ===
  const canSortPinned = isAdmin && selectedCategory === 'all' && !searchQuery && pinnedLinks.length > 1;
  const canSortCategory = isAdmin && selectedCategory !== 'all'
    && selectedCategory !== PRIVATE_CATEGORY_ID
    && displayedLinks.length > 1;

  useEffect(() => {
    if (isAdmin) return;
    if (isSortingPinned) cancelPinnedSorting();
    if (isSortingMode) cancelSorting();
  }, [isAdmin, isSortingPinned, isSortingMode, cancelPinnedSorting, cancelSorting]);

  // === Computed: Link Counts ===
  const linkCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    // Initialize all categories with 0
    categories.forEach(cat => counts[cat.id] = 0);
    counts['pinned'] = 0;

    links.forEach(link => {
      // Count by category
      if (counts[link.categoryId] !== undefined) {
        counts[link.categoryId]++;
      } else {
        // Fallback for unknown categories, though shouldn't happen
        counts[link.categoryId] = 1;
      }

      // Count pinned
      if (link.pinned) {
        counts['pinned']++;
      }
    });

    counts[COMMON_CATEGORY_ID] = commonRecommendedLinks.length;
    return counts;
  }, [links, categories, commonRecommendedLinks]);

  // 收集所有已有标签（去重）
  const existingTags = useMemo(() => {
    const tagSet = new Set<string>();
    links.forEach(link => {
      if (Array.isArray(link.tags)) {
        link.tags.forEach(tag => {
          if (tag && tag.trim()) {
            tagSet.add(tag.trim());
          }
        });
      }
    });
    return Array.from(tagSet).sort((a, b) => a.localeCompare(b, 'zh-CN'));
  }, [links]);

  // 当从管理员模式切换到用户模式时，如果当前选中的是隐私分组，则自动切换到 'all'
  useEffect(() => {
    if (!isAdmin && selectedCategory === PRIVATE_CATEGORY_ID) {
      setSelectedCategory('all');
    }
  }, [isAdmin, selectedCategory, setSelectedCategory]);

  // === Handlers ===
  const handleImportConfirm = (newLinks: LinkItem[], newCategories: Category[]) => {
    if (!requireAdmin('用户模式无法导入数据，请先输入 API 访问密码进入管理员模式。')) {
      return;
    }
    importData(newLinks, newCategories);
    setIsImportModalOpen(false);
    notify(`成功导入 ${newLinks.length} 个新书签!`, 'success');
  };

  const handleAddLink = (data: Omit<LinkItem, 'id' | 'createdAt'>) => {
    if (!requireAdmin()) return;
    addLink(data);
    setPrefillLink(undefined);
  };

  const handleEditLink = (data: Omit<LinkItem, 'id' | 'createdAt'>) => {
    if (!requireAdmin()) return;
    if (!editingLink) return;
    updateLink({ ...data, id: editingLink.id });
    setEditingLink(undefined);
  };

  const handleDeleteLink = async (id: string) => {
    if (!requireAdmin()) return;
    const shouldDelete = await confirm({
      title: '删除链接',
      message: '确定删除此链接吗？',
      confirmText: '删除',
      cancelText: '取消',
      variant: 'danger'
    });

    if (shouldDelete) {
      deleteLink(id);
    }
  };

  const handleAddLinkRequest = useCallback(() => {
    if (isPrivateView) {
      openPrivateAddModal();
      return;
    }
    if (!requireAdmin()) return;
    openAddLinkModal();
  }, [isPrivateView, openPrivateAddModal, openAddLinkModal, requireAdmin]);

  const handleLinkEdit = useCallback((link: LinkItem) => {
    if (isPrivateView) {
      openPrivateEditModal(link);
      return;
    }
    if (!requireAdmin()) return;
    openEditLinkModal(link);
  }, [isPrivateView, openEditLinkModal, openPrivateEditModal, requireAdmin]);

  const handleLinkContextMenu = useCallback((event: React.MouseEvent, link: LinkItem) => {
    if (isPrivateView || !isAdmin) return;
    handleContextMenu(event, link);
  }, [handleContextMenu, isPrivateView, isAdmin]);

  const handleLinkOpen = useCallback((link: LinkItem) => {
    if (!isAdmin) return;
    if (link.categoryId === PRIVATE_CATEGORY_ID) return;
    recordAdminLinkClick(link.id);
  }, [isAdmin, recordAdminLinkClick]);

  const togglePin = (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!requireAdmin()) return;
    togglePinStore(id);
  };

  const handleUpdateCategories = (newCats: Category[]) => {
    if (!requireAdmin()) return;
    updateData(links, newCats);
  };

  const handleDeleteCategory = (catId: string) => {
    if (!requireAdmin()) return;
    deleteCategoryStore(catId);
  };

  // === Bookmarklet URL Handler ===
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const addUrl = urlParams.get('add_url');
    if (addUrl) {
      const addTitle = urlParams.get('add_title') || '';
      window.history.replaceState({}, '', window.location.pathname);
      if (selectedCategory === PRIVATE_CATEGORY_ID) {
        if (!isPrivateUnlocked) {
          notify('请先解锁隐私分组', 'warning');
          return;
        }
        setPrefillPrivateLink({
          title: addTitle,
          url: addUrl,
          categoryId: PRIVATE_CATEGORY_ID
        });
        setEditingPrivateLink(null);
        openPrivateAddModal();
        return;
      }

      const fallbackCategoryId = selectedCategory !== 'all'
        ? selectedCategory
        : (categories.find(c => c.id === 'common')?.id || categories[0]?.id || 'common');
      setPrefillLink({
        title: addTitle,
        url: addUrl,
        categoryId: fallbackCategoryId
      });
      setEditingLink(undefined);
      openAddLinkModal();
    }
  }, [
    setPrefillLink,
    setEditingLink,
    openAddLinkModal,
    categories,
    selectedCategory,
    notify,
    isPrivateUnlocked,
    openPrivateAddModal,
    setPrefillPrivateLink,
    setEditingPrivateLink
  ]);

  // === Appearance Setup ===
  const { toneClasses, closeOnBackdrop, backgroundImage, useCustomBackground, backgroundMotion } = useAppearance(siteSettings);

  // === KV Sync: Signature refs (must be defined before Initial Load effect) ===
  // 说明：useSyncEngine 负责“怎么同步”（网络/乐观锁/串行化/云端接口）。
  // useAppController 负责“何时同步”：根据数据变化类型、角色权限、冲突状态决定走哪条同步路径。
  const prevBusinessSignatureRef = useRef<string | null>(null);
  const prevFullSignatureRef = useRef<string | null>(null);
  const encryptedSensitiveConfigCacheRef = useRef<{ password: string; apiKey: string; encrypted: string } | null>(null);
  const statsSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingStatsSyncDataRef = useRef<SyncPayload | null>(null);
  const isAdminRef = useRef(isAdmin);
  const hasConflictRef = useRef(!!currentConflict);

  isAdminRef.current = isAdmin;
  hasConflictRef.current = !!currentConflict;

  // === 数据加载完成后隐藏加载动画 ===
  useEffect(() => {
    if (isLoaded && onReady) {
      // 稍微延迟以确保UI渲染完成
      const timer = setTimeout(onReady, 100);
      return () => clearTimeout(timer);
    }
  }, [isLoaded, onReady]);

  // === KV Sync: Initial Load ===
  useEffect(() => {
    // 只在本地数据加载完成后执行一次
    if (!isLoaded || hasInitialSyncRun.current) return;
    hasInitialSyncRun.current = true;

    const checkCloudData = async () => {
      // 先刷新一次权限状态（syncRole/isAdmin 可能尚未更新）。
      // 后续的拉取/冲突判断需要以“当前请求的真实权限”作为依据。
      const auth = await refreshSyncAuth();
      const localMeta = getLocalSyncMeta();
      const localVersion = localMeta?.version ?? 0;
      const localUpdatedAt = typeof localMeta?.updatedAt === 'number' ? localMeta.updatedAt : 0;
      const localDeviceId = localMeta?.deviceId || getDeviceId();
      const cloudData = await pullFromCloud();

      if (cloudData && cloudData.links && cloudData.categories) {
        if (auth.role !== 'admin') {
          // 用户模式（只读）：不参与冲突解决，直接以云端为准（仅应用“可公开字段”）。
          applyCloudData(cloudData, auth.role);
          return;
        }

        // 版本不一致时提示用户选择
        if (cloudData.meta.version !== localVersion) {
          // 管理员模式（可写）：本地与云端 version 不一致时，无法自动决定保留哪份。
          // 这里构造一个“本地快照 vs 云端快照”的冲突对象，交给 UI 让用户选择：保留本地（强制覆盖）/保留云端（丢弃本地）。
          // Prepare encrypted sensitive config for sync (Requirements 2.1, 2.6)
          const syncPassword = getSyncPassword().trim();
          let encryptedConfig: string | undefined;
          if (syncPassword && aiConfig?.apiKey) {
            try {
              encryptedConfig = await encryptSensitiveConfig(syncPassword, { apiKey: aiConfig.apiKey });
            } catch {
              // Encryption failed, continue without encrypted config
            }
          }

          // 使用 auth.role 而不是 isAdmin，因为 isAdmin 可能还未更新
          const isAdminRole = auth.role === 'admin';
          const localData = buildSyncData(
            links,
            categories,
            { mode: searchMode, externalSources: externalSearchSources },
            aiConfig,
            siteSettings,
            privateVaultCipher || undefined,
            isAdminRole ? { groupEnabled: privacyGroupEnabled, passwordEnabled: privacyPasswordEnabled, autoUnlockEnabled: privacyAutoUnlockEnabled, useSeparatePassword: useSeparatePrivacyPassword } : undefined,
            themeMode,
            encryptedConfig,
            buildSyncCache()
          );
          handleSyncConflict({
            localData: { ...localData, meta: { updatedAt: localUpdatedAt, deviceId: localDeviceId, version: localVersion } },
            remoteData: cloudData
          });
        } else {
          // 版本一致时：初始化签名以避免“不必要的自动同步”。
          // 典型场景：用户刚打开页面，本地已是最新版本；如果不初始化签名，后续 effect 可能把当前状态当成“变更”而触发 push。
          const syncPassword = getSyncPassword().trim();
          let encryptedConfig: string | undefined;
          if (syncPassword && aiConfig?.apiKey) {
            try {
              encryptedConfig = await encryptSensitiveConfig(syncPassword, { apiKey: aiConfig.apiKey });
            } catch {
              // Encryption failed, continue without encrypted config
            }
          }

          const localData = buildSyncData(
            links,
            categories,
            { mode: searchMode, externalSources: externalSearchSources },
            aiConfig,
            siteSettings,
            privateVaultCipher || undefined,
            { groupEnabled: privacyGroupEnabled, passwordEnabled: privacyPasswordEnabled, autoUnlockEnabled: privacyAutoUnlockEnabled, useSeparatePassword: useSeparatePrivacyPassword },
            themeMode,
            encryptedConfig,
            buildSyncCache()
          );
          prevBusinessSignatureRef.current = buildSyncBusinessSignature(localData);
          prevFullSignatureRef.current = buildSyncFullSignature(localData);
        }
      }
    };

    checkCloudData();
  }, [isLoaded, pullFromCloud, links, categories, searchMode, externalSearchSources, aiConfig, siteSettings, privateVaultCipher, privacyGroupEnabled, privacyPasswordEnabled, privacyAutoUnlockEnabled, useSeparatePrivacyPassword, buildSyncData, handleSyncConflict, getLocalSyncMeta, refreshSyncAuth, applyCloudData, themeMode, isAdmin]);

  // === KV Sync: Auto-sync on data change ===
  const cancelPendingStatsSync = useCallback(() => {
    if (statsSyncTimerRef.current) {
      clearTimeout(statsSyncTimerRef.current);
      statsSyncTimerRef.current = null;
    }
    pendingStatsSyncDataRef.current = null;
  }, []);

  const flushPendingStatsSync = useCallback(async (options?: { keepalive?: boolean }): Promise<boolean> => {
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
    const apiKey = pending.aiConfig?.apiKey?.trim();
    let encryptedConfig: string | undefined;
    if (syncPassword && apiKey) {
      const cached = encryptedSensitiveConfigCacheRef.current;
      if (cached && cached.password === syncPassword && cached.apiKey === apiKey) {
        encryptedConfig = cached.encrypted;
      } else {
        try {
          encryptedConfig = await encryptSensitiveConfig(syncPassword, { apiKey });
          encryptedSensitiveConfigCacheRef.current = { password: syncPassword, apiKey, encrypted: encryptedConfig };
        } catch {
          encryptedConfig = undefined;
        }
      }
    }

    return pushToCloud(
      encryptedConfig ? { ...pending, encryptedSensitiveConfig: encryptedConfig } : pending,
      false,
      'auto',
      // 纯统计同步：仅同步点击统计等高频字段，不写入同步记录（避免“最近 20 次同步记录”被刷屏）。
      { skipHistory: true, keepalive: options?.keepalive === true }
    );
  }, [pushToCloud]);

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

  useEffect(() => {
    // 跳过初始加载阶段
    if (!isLoaded || !hasInitialSyncRun.current || currentConflict) return;
    if (isSyncPasswordRefreshingRef.current) return;
    if (!isAdmin) return;

    const performSync = async () => {
      const syncDataBase = buildSyncData(
        links,
        categories,
        { mode: searchMode, externalSources: externalSearchSources },
        aiConfig,
        siteSettings,
        privateVaultCipher || undefined,
        isAdmin ? { groupEnabled: privacyGroupEnabled, passwordEnabled: privacyPasswordEnabled, autoUnlockEnabled: privacyAutoUnlockEnabled, useSeparatePassword: useSeparatePrivacyPassword } : undefined,
        themeMode,
        undefined,
        buildSyncCache()
      );
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
      const apiKey = aiConfig?.apiKey?.trim();
      let encryptedConfig: string | undefined;
      if (syncPassword && apiKey) {
        const cached = encryptedSensitiveConfigCacheRef.current;
        if (cached && cached.password === syncPassword && cached.apiKey === apiKey) {
          encryptedConfig = cached.encrypted;
        } else {
          try {
            encryptedConfig = await encryptSensitiveConfig(syncPassword, { apiKey });
            encryptedSensitiveConfigCacheRef.current = { password: syncPassword, apiKey, encrypted: encryptedConfig };
          } catch {
            encryptedConfig = undefined;
          }
        }
      }

      schedulePush(encryptedConfig ? { ...syncDataBase, encryptedSensitiveConfig: encryptedConfig } : syncDataBase);
    };

    performSync();
  }, [links, categories, isLoaded, searchMode, externalSearchSources, aiConfig, siteSettings, privateVaultCipher, privacyGroupEnabled, privacyPasswordEnabled, privacyAutoUnlockEnabled, useSeparatePrivacyPassword, schedulePush, buildSyncData, currentConflict, isAdmin, themeMode, cancelPendingStatsSync, flushPendingStatsSync]);

  useEffect(() => {
    if (!pendingSensitiveConfigSyncRef.current) return;
    if (!isLoaded || !hasInitialSyncRun.current || currentConflict) return;
    if (isSyncPasswordRefreshingRef.current) return;
    if (!isAdmin) return;

    // 当 sync password 变化时，encryptedSensitiveConfig 需要用新密码重新加密再同步：
    // - 避免云端保存的密文仍使用旧密码，导致其他设备无法解密 API Key。
    // - 这里不直接 pushToCloud（manual），而是走 schedulePush，让它并入自动同步队列并保持串行化。
    const syncPassword = getSyncPassword().trim();
    const apiKey = aiConfig?.apiKey?.trim();

    if (!syncPassword || !apiKey) {
      pendingSensitiveConfigSyncRef.current = false;
      return;
    }

    const syncEncryptedConfig = async () => {
      let encryptedConfig: string | undefined;
      const cached = encryptedSensitiveConfigCacheRef.current;
      if (cached && cached.password === syncPassword && cached.apiKey === apiKey) {
        encryptedConfig = cached.encrypted;
      } else {
        try {
          encryptedConfig = await encryptSensitiveConfig(syncPassword, { apiKey });
          encryptedSensitiveConfigCacheRef.current = { password: syncPassword, apiKey, encrypted: encryptedConfig };
        } catch {
          encryptedConfig = undefined;
        }
      }

      pendingSensitiveConfigSyncRef.current = false;
      if (!encryptedConfig) return;

      const syncDataBase = buildSyncData(
        links,
        categories,
        { mode: searchMode, externalSources: externalSearchSources },
        aiConfig,
        siteSettings,
        privateVaultCipher || undefined,
        isAdmin ? { groupEnabled: privacyGroupEnabled, passwordEnabled: privacyPasswordEnabled, autoUnlockEnabled: privacyAutoUnlockEnabled, useSeparatePassword: useSeparatePrivacyPassword } : undefined,
        themeMode,
        undefined,
        buildSyncCache()
      );

      schedulePush({ ...syncDataBase, encryptedSensitiveConfig: encryptedConfig });
    };

    void syncEncryptedConfig();
  }, [
    aiConfig,
    buildSyncData,
    categories,
    currentConflict,
    externalSearchSources,
    isAdmin,
    isLoaded,
    links,
    privacyAutoUnlockEnabled,
    privacyGroupEnabled,
    privacyPasswordEnabled,
    privateVaultCipher,
    schedulePush,
    searchMode,
    syncPasswordRefreshTick,
    siteSettings,
    themeMode,
    useSeparatePrivacyPassword
  ]);

  const handleSaveSettings = useCallback(async (nextConfig: AIConfig, nextSiteSettings: SiteSettings) => {
    saveAIConfig(nextConfig, nextSiteSettings);

    // 仅管理员可把“保存设置”同步到云端
    if (!isAdmin) return;

    // Prepare encrypted sensitive config for sync (Requirements 2.1, 2.6)
    const syncPassword = getSyncPassword().trim();
    let encryptedConfig: string | undefined;
    if (syncPassword && nextConfig?.apiKey) {
      try {
        encryptedConfig = await encryptSensitiveConfig(syncPassword, { apiKey: nextConfig.apiKey });
      } catch {
        // Encryption failed, continue without encrypted config
      }
    }

    const syncData = buildSyncData(
      links,
      categories,
      { mode: searchMode, externalSources: externalSearchSources },
      nextConfig,
      nextSiteSettings,
      privateVaultCipher || undefined,
      isAdmin ? { groupEnabled: privacyGroupEnabled, passwordEnabled: privacyPasswordEnabled, autoUnlockEnabled: privacyAutoUnlockEnabled, useSeparatePassword: useSeparatePrivacyPassword } : undefined,
      themeMode,
      encryptedConfig,
      buildSyncCache()
    );

    // 避免与自动同步重复触发
    // - 先更新签名：告诉 auto-sync effect “这些变更已经被我们处理过了”。
    // - 再 cancelPending：避免队列里还留着旧快照的 pending push（会覆盖刚保存的设置）。
    prevBusinessSignatureRef.current = buildSyncBusinessSignature(syncData);
    prevFullSignatureRef.current = buildSyncFullSignature(syncData);
    cancelPendingSync();
    cancelPendingStatsSync();
    lastUserInitiatedSyncAtRef.current = Date.now();
    void pushToCloud(syncData, false, 'manual');
  }, [saveAIConfig, isAdmin, links, categories, searchMode, externalSearchSources, privateVaultCipher, privacyGroupEnabled, privacyPasswordEnabled, privacyAutoUnlockEnabled, useSeparatePrivacyPassword, buildSyncData, cancelPendingSync, cancelPendingStatsSync, pushToCloud, themeMode]);

  // === Sync Conflict Resolution ===
  const handleResolveConflict = useCallback((choice: 'local' | 'remote') => {
    if (currentConflict) {
      const { meta: _meta, ...payload } = choice === 'remote' ? currentConflict.remoteData : currentConflict.localData;
      // 冲突解决后，本地会应用“用户选择的那份”数据。
      // 先把签名更新到这份 payload，避免随后 state 更新触发 auto-sync 误判为“又有新变更”。
      prevBusinessSignatureRef.current = buildSyncBusinessSignature(payload);
      prevFullSignatureRef.current = buildSyncFullSignature(payload);
    }

    // 冲突解决属于用户显式操作：
    // - 取消所有 pending 自动同步，避免后台写入与用户决策交错
    // - 标记为 user initiated，让失败 toast 立即提示（不做 cooldown）
    cancelPendingSync();
    cancelPendingStatsSync();
    lastUserInitiatedSyncAtRef.current = Date.now();
    resolveSyncConflict(choice);
    setSyncConflictOpen(false);
    setCurrentConflict(null);
  }, [currentConflict, cancelPendingSync, cancelPendingStatsSync, resolveSyncConflict]);

  // 手动触发同步
  const handleManualSync = useCallback(async () => {
    if (!requireAdmin('用户模式无法写入云端，请先输入 API 访问密码进入管理员模式。')) return;

    // 手动同步：用户期望“立刻同步”，因此直接 pushToCloud(syncKind='manual')。
    // 同时会写入同步记录（除非服务端策略变化），便于用户在“最近同步记录”中看到这一笔。
    // Prepare encrypted sensitive config for sync (Requirements 2.1, 2.6)
    const syncPassword = getSyncPassword().trim();
    let encryptedConfig: string | undefined;
    if (syncPassword && aiConfig?.apiKey) {
      try {
        encryptedConfig = await encryptSensitiveConfig(syncPassword, { apiKey: aiConfig.apiKey });
      } catch {
        // Encryption failed, continue without encrypted config
      }
    }

    const syncData = buildSyncData(
      links,
      categories,
      { mode: searchMode, externalSources: externalSearchSources },
      aiConfig,
      siteSettings,
      privateVaultCipher || undefined,
      isAdmin ? { groupEnabled: privacyGroupEnabled, passwordEnabled: privacyPasswordEnabled, autoUnlockEnabled: privacyAutoUnlockEnabled, useSeparatePassword: useSeparatePrivacyPassword } : undefined,
      themeMode,
      encryptedConfig,
      buildSyncCache()
    );

    // 避免与自动同步重复触发
    prevBusinessSignatureRef.current = buildSyncBusinessSignature(syncData);
    prevFullSignatureRef.current = buildSyncFullSignature(syncData);
    cancelPendingSync();
    cancelPendingStatsSync();
    lastUserInitiatedSyncAtRef.current = Date.now();
    await pushToCloud(syncData, false, 'manual');
  }, [requireAdmin, links, categories, searchMode, externalSearchSources, aiConfig, siteSettings, privateVaultCipher, privacyGroupEnabled, privacyPasswordEnabled, privacyAutoUnlockEnabled, useSeparatePrivacyPassword, themeMode, buildSyncData, cancelPendingSync, cancelPendingStatsSync, pushToCloud]);

  const performPull = useCallback(async (role: SyncRole) => {
    const localMeta = getLocalSyncMeta();
    const localVersion = localMeta?.version ?? 0;
    const localUpdatedAt = typeof localMeta?.updatedAt === 'number' ? localMeta.updatedAt : 0;
    const localDeviceId = localMeta?.deviceId || getDeviceId();

    const cloudData = await pullFromCloud();
    if (!cloudData || !cloudData.links || !cloudData.categories) return;

    // 用户模式：直接以云端为准，不弹冲突
    if (role !== 'admin') {
      cancelPendingSync();
      cancelPendingStatsSync();
      applyCloudData(cloudData, role);
      return;
    }

    // 管理员模式：版本不一致时提示用户选择
    if (cloudData.meta.version !== localVersion) {
      // 手动拉取时同样遵循“版本不一致就弹冲突”：
      // 管理员可能在当前设备做过未同步的修改，也可能是云端被其他设备更新过，必须人工决策。
      // Prepare encrypted sensitive config for sync (Requirements 2.1, 2.6)
      const syncPassword = getSyncPassword().trim();
      let encryptedConfig: string | undefined;
      if (syncPassword && aiConfig?.apiKey) {
        try {
          encryptedConfig = await encryptSensitiveConfig(syncPassword, { apiKey: aiConfig.apiKey });
        } catch {
          // Encryption failed, continue without encrypted config
        }
      }

      const localData = buildSyncData(
        links,
        categories,
        { mode: searchMode, externalSources: externalSearchSources },
        aiConfig,
        siteSettings,
        privateVaultCipher || undefined,
        { groupEnabled: privacyGroupEnabled, passwordEnabled: privacyPasswordEnabled, autoUnlockEnabled: privacyAutoUnlockEnabled, useSeparatePassword: useSeparatePrivacyPassword },
        themeMode,
        encryptedConfig,
        buildSyncCache()
      );
      cancelPendingSync();
      cancelPendingStatsSync();
      handleSyncConflict({
        localData: { ...localData, meta: { updatedAt: localUpdatedAt, deviceId: localDeviceId, version: localVersion } },
        remoteData: cloudData
      });
      return;
    }

    cancelPendingSync();
    cancelPendingStatsSync();
    const { meta: _meta, ...payload } = cloudData;
    // 拉取并应用云端后，把签名更新到云端 payload，避免随后 auto-sync 误判为“本地变更”而再推一次。
    prevBusinessSignatureRef.current = buildSyncBusinessSignature(payload);
    prevFullSignatureRef.current = buildSyncFullSignature(payload);
    applyCloudData(cloudData, role);
  }, [getLocalSyncMeta, pullFromCloud, applyCloudData, links, categories, searchMode, externalSearchSources, aiConfig, siteSettings, privateVaultCipher, buildSyncData, handleSyncConflict, themeMode, privacyGroupEnabled, privacyPasswordEnabled, privacyAutoUnlockEnabled, useSeparatePrivacyPassword, cancelPendingSync, cancelPendingStatsSync]);

  const handleManualPull = useCallback(async () => {
    lastUserInitiatedSyncAtRef.current = Date.now();
    await performPull(syncRole);
  }, [performPull, syncRole]);

  const handleSyncPasswordChange = useCallback((nextPassword: string) => {
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
  }, [cancelPendingSync, cancelPendingStatsSync, isSyncProtected, syncRole]);

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
      return { success: false, role: 'user', error: '请输入密码后点击登录' };
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
          'X-Sync-Password': password
        },
        body: JSON.stringify({ deviceId: getDeviceId() })
      });

      const result = (await response.json()) as SyncLoginResponse;

      if (result.success === false) {
        clearSyncAdminSession();
        setSyncRole('user');
        await refreshSyncAuth();
        return {
          success: false,
          role: 'user',
          error: result.error || '登录失败',
          lockedUntil: typeof result.lockedUntil === 'number' ? result.lockedUntil : undefined,
          retryAfterSeconds: typeof result.retryAfterSeconds === 'number' ? result.retryAfterSeconds : undefined,
          remainingAttempts: typeof result.remainingAttempts === 'number' ? result.remainingAttempts : undefined,
          maxAttempts: typeof result.maxAttempts === 'number' ? result.maxAttempts : undefined
        };
      }

      setSyncAdminSession(true);
      const auth = await refreshSyncAuth();
      await performPull(auth.role);

      return { success: true, role: auth.role };
    } catch (error: unknown) {
      clearSyncAdminSession();
      setSyncRole('user');
      return { success: false, role: 'user', error: getErrorMessage(error, '网络错误') };
    } finally {
      isSyncPasswordRefreshingRef.current = false;
      setSyncPasswordRefreshTick((prev) => prev + 1);
    }
  }, [cancelPendingSync, cancelPendingStatsSync, isSyncProtected, refreshSyncAuth, performPull]);

  const handleRestoreBackup = useCallback(async (backupKey: string) => {
    if (!requireAdmin('用户模式无法恢复云端备份，请先输入 API 访问密码进入管理员模式。')) return false;

    const confirmed = await confirm({
      title: '恢复云端备份',
      message: '此操作将用所选备份覆盖本地数据，并在云端创建一个回滚点。',
      confirmText: '恢复',
      cancelText: '取消',
      variant: 'danger'
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
      notify('恢复失败，请稍后重试', 'error');
      return false;
    }

    handleSyncComplete(restoredData);
    const restoredPayload = buildSyncData(
      restoredData.links,
      restoredData.categories,
      restoredData.searchConfig,
      restoredData.aiConfig,
      restoredData.siteSettings,
      restoredData.privateVault,
      restoredData.privacyConfig,
      restoredData.themeMode,
      restoredData.encryptedSensitiveConfig,
      restoredData.customFaviconCache
    );
    prevBusinessSignatureRef.current = buildSyncBusinessSignature(restoredPayload);
    prevFullSignatureRef.current = buildSyncFullSignature(restoredPayload);
    notify('已恢复到所选备份，并创建回滚点', 'success');
    return true;
  }, [requireAdmin, confirm, restoreBackup, handleSyncComplete, notify, buildSyncData, cancelPendingSync, cancelPendingStatsSync]);

  const handleDeleteBackup = useCallback(async (backupKey: string) => {
    if (!requireAdmin('用户模式无法删除云端备份，请先输入 API 访问密码进入管理员模式。')) return false;

    const confirmed = await confirm({
      title: '删除备份',
      message: '确定要删除此备份吗?此操作无法撤销。',
      confirmText: '删除',
      cancelText: '取消',
      variant: 'danger'
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
      notify('删除失败，请稍后重试', 'error');
      return false;
    }

    notify('备份已删除', 'success');
    return true;
  }, [requireAdmin, confirm, deleteBackup, notify]);


  return {
    links,
    categories,
    updateData,
    deleteLink,
    notify,
    confirm,
    themeMode,
    darkMode,
    setThemeAndApply,
    sidebarOpen,
    setSidebarOpen,
    isSidebarCollapsed,
    sidebarWidthClass,
    selectedCategory,
    setSelectedCategory,
    openSidebar,
    toggleSidebarCollapsed,
    handleCategoryClick,
    selectAll,
    aiConfig,
    restoreAIConfig,
    siteSettings,
    handleViewModeChange,
    navTitleText,
    navTitleShort,
    searchQuery,
    setSearchQuery,
    searchMode,
    externalSearchSources,
    selectedSearchSource,
    showSearchSourcePopup,
    setShowSearchSourcePopup,
    hoveredSearchSource,
    setHoveredSearchSource,
    setIsIconHovered,
    setIsPopupHovered,
    isMobileSearchOpen,
    handleSearchModeChange,
    handleSearchSourceSelect,
    handleExternalSearch,
    saveSearchConfig,
    restoreSearchConfig,
    toggleMobileSearch,
    isModalOpen,
    editingLink,
    setEditingLink,
    prefillLink,
    setPrefillLink,
    openAddLinkModal,
    openEditLinkModal,
    closeLinkModal,
    isCatManagerOpen,
    setIsCatManagerOpen,
    isImportModalOpen,
    setIsImportModalOpen,
    isSettingsModalOpen,
    setIsSettingsModalOpen,
    isSearchConfigModalOpen,
    setIsSearchConfigModalOpen,
    privacyGroupEnabled,
    privacyPasswordEnabled,
    privacyAutoUnlockEnabled,
    isTogglingPrivacyPassword,
    useSeparatePrivacyPassword,
    isPrivateUnlocked,
    isPrivateModalOpen,
    editingPrivateLink,
    prefillPrivateLink,
    closePrivateModal,
    handleUnlockPrivateVault,
    handlePrivateEditLink,
    handlePrivateAddLink,
    handlePrivateDeleteLink,
    privateCategories,
    existingPrivateTags,
    privateUnlockHint,
    privateUnlockSubHint,
    privateCount,
    handleMigratePrivacyMode,
    handleTogglePrivacyGroup,
    handleTogglePrivacyPassword,
    handleTogglePrivacyAutoUnlock,
    handleSelectPrivate,
    syncRole,
    isSyncProtected,
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
    startPinnedSorting,
    startSorting,
    savePinnedSorting,
    cancelPinnedSorting,
    saveSorting,
    cancelSorting,
    isSortingPinned,
    isSortingCategory,
    isSortingMode,
    canSortPinned,
    canSortCategory,
    pinnedLinks,
    sensors,
    handlePinnedDragEnd,
    handleDragEnd,
    effectiveIsBatchEditMode,
    effectiveSelectedLinksCount,
    effectiveSelectedLinks,
    effectiveToggleBatchEditMode,
    effectiveBatchDelete,
    effectiveBatchPin,
    effectiveSelectAll,
    effectiveBatchMove,
    handleLinkSelect,
    activeDisplayedLinks,
    contextMenu,
    closeContextMenu,
    copyLinkToClipboard,
    editLinkFromContextMenu,
    duplicateLinkFromContextMenu,
    moveLinkFromContextMenu,
    deleteLinkFromContextMenu,
    togglePinFromContextMenu,
    toggleRecommendedFromContextMenu,
    handleUpdateCategories,
    handleDeleteCategory,
    handleImportConfirm,
    handleSaveSettings,
    handleAddLinkRequest,
    handleEditLink,
    handleAddLink,
    handleDeleteLink,
    handleLinkOpen,
    handleLinkContextMenu,
    handleLinkEdit,
    handleEditDisabled,
    existingTags,
    toneClasses,
    closeOnBackdrop,
    backgroundImage,
    useCustomBackground,
    backgroundMotion,
    isAdmin,
    linkCounts
  };
};
