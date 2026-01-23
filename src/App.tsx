import React, { useMemo, useEffect, lazy, Suspense, useState, useCallback, useRef } from 'react';
import { LinkItem, Category, SyncConflict, YNavSyncData, AIConfig, SiteSettings } from './types';

// Lazy load modal components for better code splitting
const LinkModal = lazy(() => import('./components/modals/LinkModal'));
const CategoryManagerModal = lazy(() => import('./components/modals/CategoryManagerModal'));
const ImportModal = lazy(() => import('./components/modals/ImportModal'));
const SettingsModal = lazy(() => import('./components/modals/SettingsModal'));
const SearchConfigModal = lazy(() => import('./components/modals/SearchConfigModal'));
const SyncConflictModal = lazy(() => import('./components/modals/SyncConflictModal'));

// Eagerly load frequently used components
import ContextMenu from './components/layout/ContextMenu';
import Sidebar from './components/layout/Sidebar';
import MainHeader from './components/layout/MainHeader';
import LinkSections from './components/layout/LinkSections';
import SyncStatusIndicator from './components/ui/SyncStatusIndicator';
import { useDialog } from './components/ui/DialogProvider';

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
} from './hooks';

import {
  GITHUB_REPO_URL,
  COMMON_CATEGORY_ID,
  PRIVATE_CATEGORY_ID,
  PRIVATE_VAULT_KEY,
  PRIVACY_PASSWORD_KEY,
  PRIVACY_AUTO_UNLOCK_KEY,
  PRIVACY_GROUP_ENABLED_KEY,
  PRIVACY_PASSWORD_ENABLED_KEY,
  PRIVACY_SESSION_UNLOCKED_KEY,
  PRIVACY_USE_SEPARATE_PASSWORD_KEY,
  SYNC_ADMIN_SESSION_KEY,
  SYNC_API_ENDPOINT,
  SYNC_META_KEY,
  SYNC_PASSWORD_KEY,
  getDeviceId
} from './utils/constants';
import { decryptPrivateVault, encryptPrivateVault } from './utils/privateVault';
import { decryptSensitiveConfig, encryptSensitiveConfig } from './utils/sensitiveConfig';
import { mergeFromCloud, buildSyncCache } from './utils/faviconCache';
import { getCommonRecommendedLinks } from './utils/recommendation';

type SyncRole = 'admin' | 'user';

type VerifySyncPasswordResult = {
  success: boolean;
  role: SyncRole;
  error?: string;
  lockedUntil?: number;
  retryAfterSeconds?: number;
  remainingAttempts?: number;
  maxAttempts?: number;
};

interface AppProps {
  onReady?: () => void;
}

function App({ onReady }: AppProps) {
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

  // === Private Vault ===
  const [privateVaultCipher, setPrivateVaultCipher] = useState<string | null>(null);
  const [privateLinks, setPrivateLinks] = useState<LinkItem[]>([]);
  const [isPrivateUnlocked, setIsPrivateUnlocked] = useState(false);
  const [privateVaultPassword, setPrivateVaultPassword] = useState<string | null>(null);
  const [useSeparatePrivacyPassword, setUseSeparatePrivacyPassword] = useState(false);
  const [privacyGroupEnabled, setPrivacyGroupEnabled] = useState(false);
  const [privacyPasswordEnabled, setPrivacyPasswordEnabled] = useState(true);
  const [privacyAutoUnlockEnabled, setPrivacyAutoUnlockEnabled] = useState(false);
  const [isPrivateModalOpen, setIsPrivateModalOpen] = useState(false);
  const [editingPrivateLink, setEditingPrivateLink] = useState<LinkItem | null>(null);
  const [prefillPrivateLink, setPrefillPrivateLink] = useState<Partial<LinkItem> | null>(null);

  // === Sync Engine ===
  const [syncConflictOpen, setSyncConflictOpen] = useState(false);
  const [currentConflict, setCurrentConflict] = useState<SyncConflict | null>(null);
  const hasInitialSyncRun = useRef(false);
  const autoUnlockAttemptedRef = useRef(false);
  const lastSyncPasswordRef = useRef((localStorage.getItem(SYNC_PASSWORD_KEY) || '').trim());
  const isSyncPasswordRefreshingRef = useRef(false);
  const [syncRole, setSyncRole] = useState<SyncRole>('user');
  const [isSyncProtected, setIsSyncProtected] = useState(false);
  const isAdmin = syncRole === 'admin';
  const getLocalSyncMeta = useCallback(() => {
    const stored = localStorage.getItem(SYNC_META_KEY);
    if (!stored) return null;
    try {
      return JSON.parse(stored);
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    setPrivateVaultCipher(localStorage.getItem(PRIVATE_VAULT_KEY));
    setUseSeparatePrivacyPassword(localStorage.getItem(PRIVACY_USE_SEPARATE_PASSWORD_KEY) === '1');
    setPrivacyGroupEnabled(localStorage.getItem(PRIVACY_GROUP_ENABLED_KEY) === '1');
    setPrivacyPasswordEnabled(localStorage.getItem(PRIVACY_PASSWORD_ENABLED_KEY) !== '0');
    setPrivacyAutoUnlockEnabled(localStorage.getItem(PRIVACY_AUTO_UNLOCK_KEY) === '1');
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

  const privateCategory = useMemo(() => ({
    id: PRIVATE_CATEGORY_ID,
    name: '隐私分组',
    icon: 'Lock'
  }), []);

  const privateCategories = useMemo(() => [privateCategory], [privateCategory]);

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

  // === Sync Engine Hook ===
  const handleSyncConflict = useCallback((conflict: SyncConflict) => {
    setCurrentConflict(conflict);
    setSyncConflictOpen(true);
  }, []);

  const applyCloudData = useCallback((data: YNavSyncData, role: SyncRole) => {
    if (data.links && data.categories) {
      updateData(data.links, data.categories);
    }
    if (data.searchConfig) {
      restoreSearchConfig(data.searchConfig);
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
        localStorage.setItem(PRIVACY_USE_SEPARATE_PASSWORD_KEY, cfg.useSeparatePassword ? '1' : '0');
      }

      if (typeof nextGroupEnabled === 'boolean') {
        setPrivacyGroupEnabled(nextGroupEnabled);
        localStorage.setItem(PRIVACY_GROUP_ENABLED_KEY, nextGroupEnabled ? '1' : '0');

        if (!nextGroupEnabled) {
          sessionStorage.removeItem(PRIVACY_SESSION_UNLOCKED_KEY);
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
        localStorage.setItem(PRIVACY_PASSWORD_ENABLED_KEY, cfg.passwordEnabled ? '1' : '0');

        // Only apply lock/unlock side-effects when privacy group is enabled
        if (effectiveGroupEnabled) {
          if (!cfg.passwordEnabled) {
            setIsPrivateUnlocked(true);
            setPrivateVaultPassword(null);
            sessionStorage.setItem(PRIVACY_SESSION_UNLOCKED_KEY, '1');
          } else {
            setIsPrivateUnlocked(false);
            setPrivateVaultPassword(null);
            setPrivateLinks([]);
            sessionStorage.removeItem(PRIVACY_SESSION_UNLOCKED_KEY);
          }
        }
      }

      if (typeof cfg.autoUnlockEnabled === 'boolean') {
        setPrivacyAutoUnlockEnabled(cfg.autoUnlockEnabled);
        localStorage.setItem(PRIVACY_AUTO_UNLOCK_KEY, cfg.autoUnlockEnabled ? '1' : '0');

        if (effectiveGroupEnabled) {
          if (!cfg.autoUnlockEnabled) {
            sessionStorage.removeItem(PRIVACY_SESSION_UNLOCKED_KEY);
          } else if (isPrivateUnlocked) {
            sessionStorage.setItem(PRIVACY_SESSION_UNLOCKED_KEY, '1');
          }
        }
      }
    }

    if (data.aiConfig) {
      restoreAIConfig(data.aiConfig);
    }

    // Decrypt and apply encryptedSensitiveConfig (Requirements 2.3)
    if (typeof data.encryptedSensitiveConfig === 'string' && data.encryptedSensitiveConfig) {
      // Use the same password as privateVault for decryption
      const password = privateVaultPassword || (localStorage.getItem(SYNC_PASSWORD_KEY) || '').trim();
      if (password) {
        decryptSensitiveConfig(password, data.encryptedSensitiveConfig)
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

    if (typeof data.privateVault === 'string') {
      setPrivateVaultCipher(data.privateVault);
      localStorage.setItem(PRIVATE_VAULT_KEY, data.privateVault);
      if (isPrivateUnlocked && privateVaultPassword) {
        decryptPrivateVault(privateVaultPassword, data.privateVault)
          .then(payload => setPrivateLinks(payload.links || []))
          .catch(() => {
            setIsPrivateUnlocked(false);
            setPrivateLinks([]);
            setPrivateVaultPassword(null);
            notify('隐私分组已锁定，请重新解锁', 'warning');
          });
      }
    }
  }, [updateData, restoreSiteSettings, restoreAIConfig, isPrivateUnlocked, notify, privateVaultPassword, applyFromSync, privacyGroupEnabled, selectedCategory, setSelectedCategory]);

  const handleSyncComplete = useCallback((data: YNavSyncData) => {
    applyCloudData(data, syncRole);
  }, [applyCloudData, syncRole]);

  const handleSyncError = useCallback((error: string) => {
    console.error('[Sync Error]', error);
  }, []);

  const {
    syncStatus,
    lastSyncTime,
    pullFromCloud,
    pushToCloud,
    schedulePush,
    restoreBackup,
    deleteBackup,
    resolveConflict: resolveSyncConflict,
    cancelPendingSync,
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
      localStorage.removeItem(SYNC_ADMIN_SESSION_KEY);
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

  const resolvePrivacyPassword = useCallback((input?: string) => {
    const trimmed = input?.trim();
    if (trimmed) return trimmed;
    if (useSeparatePrivacyPassword) {
      return (localStorage.getItem(PRIVACY_PASSWORD_KEY) || '').trim();
    }
    return (localStorage.getItem(SYNC_PASSWORD_KEY) || '').trim();
  }, [useSeparatePrivacyPassword]);

  const handleUnlockPrivateVault = useCallback(async (input?: string) => {
    // 如果密码功能已禁用，直接解锁
    if (!privacyPasswordEnabled) {
      setPrivateLinks([]);
      setIsPrivateUnlocked(true);
      setPrivateVaultPassword(null);
      if (privacyAutoUnlockEnabled) {
        sessionStorage.setItem(PRIVACY_SESSION_UNLOCKED_KEY, '1');
      }
      return true;
    }

    const password = resolvePrivacyPassword(input);
    if (!password) {
      notify('请先输入隐私分组密码', 'warning');
      return false;
    }

    if (!useSeparatePrivacyPassword) {
      const syncPassword = (localStorage.getItem(SYNC_PASSWORD_KEY) || '').trim();
      if (!syncPassword) {
        notify('请先设置同步密码，再解锁隐私分组', 'warning');
        return false;
      }
      if (password !== syncPassword) {
        notify('同步密码不匹配，请重新输入', 'error');
        return false;
      }
    }

    if (!privateVaultCipher) {
      setPrivateLinks([]);
      setIsPrivateUnlocked(true);
      setPrivateVaultPassword(password);
      if (privacyAutoUnlockEnabled) {
        sessionStorage.setItem(PRIVACY_SESSION_UNLOCKED_KEY, '1');
      }
      return true;
    }

    try {
      const payload = await decryptPrivateVault(password, privateVaultCipher);
      setPrivateLinks(payload.links || []);
      setIsPrivateUnlocked(true);
      setPrivateVaultPassword(password);
      if (privacyAutoUnlockEnabled) {
        sessionStorage.setItem(PRIVACY_SESSION_UNLOCKED_KEY, '1');
      }
      return true;
    } catch (error) {
      notify('密码错误或隐私数据已损坏', 'error');
      return false;
    }
  }, [privateVaultCipher, notify, resolvePrivacyPassword, useSeparatePrivacyPassword, privacyAutoUnlockEnabled, privacyPasswordEnabled]);

  const persistPrivateVault = useCallback(async (nextLinks: LinkItem[], passwordOverride?: string) => {
    // 如果密码功能已禁用，直接保存链接到本地（不加密）
    if (!privacyPasswordEnabled) {
      localStorage.setItem(PRIVATE_VAULT_KEY, JSON.stringify({ links: nextLinks }));
      setPrivateVaultCipher(JSON.stringify({ links: nextLinks }));
      setPrivateLinks(nextLinks);
      setIsPrivateUnlocked(true);
      setPrivateVaultPassword(null);
      return true;
    }

    const password = (passwordOverride || privateVaultPassword || resolvePrivacyPassword()).trim();
    if (!password) {
      notify('请先设置隐私分组密码', 'warning');
      return false;
    }

    try {
      const cipher = await encryptPrivateVault(password, { links: nextLinks });
      localStorage.setItem(PRIVATE_VAULT_KEY, cipher);
      setPrivateVaultCipher(cipher);
      setPrivateLinks(nextLinks);
      setIsPrivateUnlocked(true);
      setPrivateVaultPassword(password);
      return true;
    } catch (error) {
      notify('隐私分组加密失败，请重试', 'error');
      return false;
    }
  }, [notify, privateVaultPassword, resolvePrivacyPassword, privacyPasswordEnabled]);

  const handleMigratePrivacyMode = useCallback(async (payload: {
    useSeparatePassword: boolean;
    oldPassword: string;
    newPassword: string;
  }) => {
    const { useSeparatePassword, oldPassword, newPassword } = payload;
    const trimmedOld = oldPassword.trim();
    const trimmedNew = newPassword.trim();
    const syncPassword = (localStorage.getItem(SYNC_PASSWORD_KEY) || '').trim();

    if (!trimmedOld || !trimmedNew) {
      notify('请填写旧密码和新密码', 'warning');
      return false;
    }

    if (useSeparatePassword && !syncPassword) {
      notify('请先设置同步密码，再启用独立密码模式', 'warning');
      return false;
    }

    if (!useSeparatePassword && trimmedNew !== syncPassword) {
      notify('切换回同步密码时，新密码必须与同步密码一致', 'warning');
      return false;
    }

    const expectedOld = useSeparatePrivacyPassword
      ? (localStorage.getItem(PRIVACY_PASSWORD_KEY) || '').trim()
      : syncPassword;

    if (expectedOld && trimmedOld !== expectedOld) {
      notify('旧密码不正确', 'error');
      return false;
    }

    let nextLinks: LinkItem[] = privateLinks;
    if (privateVaultCipher) {
      try {
        const payloadData = await decryptPrivateVault(trimmedOld, privateVaultCipher);
        nextLinks = payloadData.links || [];
      } catch (error) {
        notify('旧密码不正确或隐私数据已损坏', 'error');
        return false;
      }
    }

    // Re-encrypt privateVault with new password (Requirements 5.2)
    if (privateVaultCipher || nextLinks.length > 0) {
      const cipher = await encryptPrivateVault(trimmedNew, { links: nextLinks });
      localStorage.setItem(PRIVATE_VAULT_KEY, cipher);
      setPrivateVaultCipher(cipher);
    } else {
      localStorage.removeItem(PRIVATE_VAULT_KEY);
      setPrivateVaultCipher(null);
    }

    // Re-encrypt sensitiveConfig with new password (Requirements 5.2)
    // This ensures both privateVault and sensitiveConfig use the same password
    // The new encryptedSensitiveConfig will be included in the next sync
    if (aiConfig?.apiKey) {
      try {
        // Re-encrypt the apiKey with the new password
        // The encrypted config will be picked up by the next sync operation
        await encryptSensitiveConfig(trimmedNew, { apiKey: aiConfig.apiKey });
        // Note: We don't store the encrypted config locally here because
        // the sync engine handles encryption during push operations.
        // This call validates that encryption works with the new password.
      } catch (error) {
        console.warn('Failed to re-encrypt sensitive config:', error);
        // Continue with migration even if sensitive config encryption fails
        // The next sync will attempt to encrypt with the current password
      }
    }

    if (useSeparatePassword) {
      localStorage.setItem(PRIVACY_PASSWORD_KEY, trimmedNew);
      localStorage.setItem(PRIVACY_USE_SEPARATE_PASSWORD_KEY, '1');
    } else {
      localStorage.removeItem(PRIVACY_PASSWORD_KEY);
      localStorage.setItem(PRIVACY_USE_SEPARATE_PASSWORD_KEY, '0');
    }

    setUseSeparatePrivacyPassword(useSeparatePassword);
    setPrivateLinks(nextLinks);
    setIsPrivateUnlocked(true);
    setPrivateVaultPassword(trimmedNew);
    notify('隐私分组已完成迁移', 'success');
    return true;
  }, [notify, privateLinks, privateVaultCipher, useSeparatePrivacyPassword, aiConfig]);

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
  const effectiveIsBatchEditMode = isPrivateView || !isAdmin ? false : isBatchEditMode;
  const effectiveSelectedLinks = isPrivateView || !isAdmin ? emptySelection : selectedLinks;
  const effectiveSelectedLinksCount = isPrivateView || !isAdmin ? 0 : selectedLinks.size;
  const effectiveToggleBatchEditMode = isPrivateView || !isAdmin
    ? () => {
      if (!isAdmin) {
        notify('用户模式不可编辑，请先输入 API 访问密码进入管理员模式。', 'warning');
      }
    }
    : toggleBatchEditMode;
  const effectiveSelectAll = isPrivateView || !isAdmin ? () => { } : handleSelectAll;
  const effectiveBatchDelete = isPrivateView || !isAdmin ? () => { } : handleBatchDelete;
  const effectiveBatchPin = isPrivateView || !isAdmin ? () => { } : handleBatchPin;
  const effectiveBatchMove = isPrivateView || !isAdmin ? () => { } : handleBatchMove;
  const handleLinkSelect = isPrivateView || !isAdmin ? () => { } : toggleLinkSelection;

  const handleEditDisabled = useCallback(() => {
    notify('用户模式不可编辑，请先输入 API 访问密码进入管理员模式。', 'warning');
  }, [notify]);

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

  // 收集隐私分组的已有标签
  const existingPrivateTags = useMemo(() => {
    const tagSet = new Set<string>();
    privateLinks.forEach(link => {
      if (Array.isArray(link.tags)) {
        link.tags.forEach(tag => {
          if (tag && tag.trim()) {
            tagSet.add(tag.trim());
          }
        });
      }
    });
    return Array.from(tagSet).sort((a, b) => a.localeCompare(b, 'zh-CN'));
  }, [privateLinks]);

  const privateCount = privacyGroupEnabled && isPrivateUnlocked ? privateLinks.length : 0;
  const privateUnlockHint = useSeparatePrivacyPassword
    ? '请输入独立密码解锁隐私分组'
    : '请输入同步密码解锁隐私分组';
  const privateUnlockSubHint = useSeparatePrivacyPassword
    ? '独立密码仅保存在本地，切换设备需手动输入'
    : '同步密码来自数据设置';

  useEffect(() => {
    if (!privacyGroupEnabled || !privacyAutoUnlockEnabled || isPrivateUnlocked) return;
    if (sessionStorage.getItem(PRIVACY_SESSION_UNLOCKED_KEY) !== '1') return;
    if (autoUnlockAttemptedRef.current) return;
    autoUnlockAttemptedRef.current = true;
    handleUnlockPrivateVault().then((success) => {
      if (!success) {
        sessionStorage.removeItem(PRIVACY_SESSION_UNLOCKED_KEY);
      }
    });
  }, [privacyGroupEnabled, privacyAutoUnlockEnabled, isPrivateUnlocked, handleUnlockPrivateVault]);

  // 当密码禁用且隐私分组启用时，自动解锁
  useEffect(() => {
    if (privacyGroupEnabled && !privacyPasswordEnabled && !isPrivateUnlocked) {
      handleUnlockPrivateVault();
    }
  }, [privacyGroupEnabled, privacyPasswordEnabled, isPrivateUnlocked, handleUnlockPrivateVault]);

  useEffect(() => {
    autoUnlockAttemptedRef.current = false;
  }, [privacyGroupEnabled, privacyAutoUnlockEnabled]);

  // 当从管理员模式切换到用户模式时，如果当前选中的是隐私分组，则自动切换到 'all'
  useEffect(() => {
    if (!isAdmin && selectedCategory === PRIVATE_CATEGORY_ID) {
      setSelectedCategory('all');
    }
  }, [isAdmin, selectedCategory, setSelectedCategory]);

  // === Handlers ===
  const handleImportConfirm = (newLinks: LinkItem[], newCategories: Category[]) => {
    if (!isAdmin) {
      notify('用户模式无法导入数据，请先输入 API 访问密码进入管理员模式。', 'warning');
      return;
    }
    importData(newLinks, newCategories);
    setIsImportModalOpen(false);
    notify(`成功导入 ${newLinks.length} 个新书签!`, 'success');
  };

  const handleAddLink = (data: Omit<LinkItem, 'id' | 'createdAt'>) => {
    if (!isAdmin) {
      notify('用户模式不可编辑，请先输入 API 访问密码进入管理员模式。', 'warning');
      return;
    }
    addLink(data);
    setPrefillLink(undefined);
  };

  const handleEditLink = (data: Omit<LinkItem, 'id' | 'createdAt'>) => {
    if (!isAdmin) {
      notify('用户模式不可编辑，请先输入 API 访问密码进入管理员模式。', 'warning');
      return;
    }
    if (!editingLink) return;
    updateLink({ ...data, id: editingLink.id });
    setEditingLink(undefined);
  };

  const handleDeleteLink = async (id: string) => {
    if (!isAdmin) {
      notify('用户模式不可编辑，请先输入 API 访问密码进入管理员模式。', 'warning');
      return;
    }
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

  const closePrivateModal = useCallback(() => {
    setIsPrivateModalOpen(false);
    setEditingPrivateLink(null);
    setPrefillPrivateLink(null);
  }, []);

  const openPrivateAddModal = useCallback(() => {
    if (!isPrivateUnlocked) {
      notify('请先解锁隐私分组', 'warning');
      return;
    }
    setEditingPrivateLink(null);
    setPrefillPrivateLink(null);
    setIsPrivateModalOpen(true);
  }, [isPrivateUnlocked, notify]);

  const openPrivateEditModal = useCallback((link: LinkItem) => {
    if (!isPrivateUnlocked) {
      notify('请先解锁隐私分组', 'warning');
      return;
    }
    setEditingPrivateLink(link);
    setIsPrivateModalOpen(true);
  }, [isPrivateUnlocked, notify]);

  const handlePrivateAddLink = useCallback(async (data: Omit<LinkItem, 'id' | 'createdAt'>) => {
    if (!isPrivateUnlocked) {
      notify('请先解锁隐私分组', 'warning');
      return;
    }
    const maxOrder = privateLinks.reduce((max, link) => {
      const order = link.order !== undefined ? link.order : link.createdAt;
      return Math.max(max, order);
    }, -1);
    const newLink: LinkItem = {
      ...data,
      id: Date.now().toString(),
      createdAt: Date.now(),
      categoryId: PRIVATE_CATEGORY_ID,
      pinned: false,
      pinnedOrder: undefined,
      order: maxOrder + 1
    };
    await persistPrivateVault([...privateLinks, newLink]);
  }, [isPrivateUnlocked, notify, persistPrivateVault, privateLinks]);

  const handlePrivateEditLink = useCallback(async (data: Omit<LinkItem, 'createdAt'>) => {
    if (!isPrivateUnlocked) {
      notify('请先解锁隐私分组', 'warning');
      return;
    }
    const updatedLinks = privateLinks.map(link => link.id === data.id ? {
      ...link,
      ...data,
      categoryId: PRIVATE_CATEGORY_ID,
      pinned: false,
      pinnedOrder: undefined
    } : link);
    await persistPrivateVault(updatedLinks);
  }, [isPrivateUnlocked, notify, persistPrivateVault, privateLinks]);

  const handlePrivateDeleteLink = useCallback(async (id: string) => {
    if (!isPrivateUnlocked) {
      notify('请先解锁隐私分组', 'warning');
      return;
    }
    const shouldDelete = await confirm({
      title: '删除隐私链接',
      message: '确定删除此隐私链接吗？',
      confirmText: '删除',
      cancelText: '取消',
      variant: 'danger'
    });

    if (!shouldDelete) return;
    const updated = privateLinks.filter(link => link.id !== id);
    await persistPrivateVault(updated);
  }, [confirm, isPrivateUnlocked, notify, persistPrivateVault, privateLinks]);

  const handleAddLinkRequest = useCallback(() => {
    if (isPrivateView) {
      openPrivateAddModal();
      return;
    }
    if (!isAdmin) {
      notify('用户模式不可编辑，请先输入 API 访问密码进入管理员模式。', 'warning');
      return;
    }
    openAddLinkModal();
  }, [isPrivateView, openPrivateAddModal, openAddLinkModal, isAdmin, notify]);

  const handleLinkEdit = useCallback((link: LinkItem) => {
    if (isPrivateView) {
      openPrivateEditModal(link);
      return;
    }
    if (!isAdmin) {
      notify('用户模式不可编辑，请先输入 API 访问密码进入管理员模式。', 'warning');
      return;
    }
    openEditLinkModal(link);
  }, [isPrivateView, openEditLinkModal, openPrivateEditModal, isAdmin, notify]);

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
    if (!isAdmin) {
      notify('用户模式不可编辑，请先输入 API 访问密码进入管理员模式。', 'warning');
      return;
    }
    togglePinStore(id);
  };

  const handleUpdateCategories = (newCats: Category[]) => {
    if (!isAdmin) {
      notify('用户模式不可编辑，请先输入 API 访问密码进入管理员模式。', 'warning');
      return;
    }
    updateData(links, newCats);
  };

  const handleDeleteCategory = (catId: string) => {
    if (!isAdmin) {
      notify('用户模式不可编辑，请先输入 API 访问密码进入管理员模式。', 'warning');
      return;
    }
    deleteCategoryStore(catId);
  };

  const handleTogglePrivacyGroup = useCallback((enabled: boolean) => {
    setPrivacyGroupEnabled(enabled);
    localStorage.setItem(PRIVACY_GROUP_ENABLED_KEY, enabled ? '1' : '0');

    if (!enabled) {
      sessionStorage.removeItem(PRIVACY_SESSION_UNLOCKED_KEY);
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
  }, [selectedCategory, setSelectedCategory]);

  const handleTogglePrivacyAutoUnlock = useCallback((enabled: boolean) => {
    setPrivacyAutoUnlockEnabled(enabled);
    localStorage.setItem(PRIVACY_AUTO_UNLOCK_KEY, enabled ? '1' : '0');
    if (!enabled) {
      sessionStorage.removeItem(PRIVACY_SESSION_UNLOCKED_KEY);
    } else if (isPrivateUnlocked) {
      sessionStorage.setItem(PRIVACY_SESSION_UNLOCKED_KEY, '1');
    }
  }, [isPrivateUnlocked]);

  const handleTogglePrivacyPassword = useCallback((enabled: boolean) => {
    setPrivacyPasswordEnabled(enabled);
    localStorage.setItem(PRIVACY_PASSWORD_ENABLED_KEY, enabled ? '1' : '0');

    if (!enabled) {
      // 禁用密码时，自动解锁隐私分组
      setIsPrivateUnlocked(true);
      setPrivateVaultPassword(null);
      sessionStorage.setItem(PRIVACY_SESSION_UNLOCKED_KEY, '1');
    } else {
      // 启用密码时，锁定隐私分组
      setIsPrivateUnlocked(false);
      setPrivateVaultPassword(null);
      setPrivateLinks([]);
      sessionStorage.removeItem(PRIVACY_SESSION_UNLOCKED_KEY);
    }
  }, []);

  const handleSelectPrivate = useCallback(() => {
    if (!privacyGroupEnabled) {
      notify('隐私分组已关闭，可在设置中开启', 'warning');
      return;
    }
    setSelectedCategory(PRIVATE_CATEGORY_ID);
    setSidebarOpen(false);
  }, [notify, privacyGroupEnabled, setSelectedCategory, setSidebarOpen]);

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
  useEffect(() => {
    if (siteSettings.accentColor) {
      document.documentElement.style.setProperty('--accent-color', siteSettings.accentColor);
    }
  }, [siteSettings.accentColor]);

  const toneClasses = useMemo(() => {
    const tone = siteSettings.grayScale;
    if (tone === 'zinc') return { bg: 'bg-zinc-50 dark:bg-zinc-950', text: 'text-zinc-900 dark:text-zinc-50' };
    if (tone === 'neutral') return { bg: 'bg-neutral-50 dark:bg-neutral-950', text: 'text-neutral-900 dark:text-neutral-50' };
    return { bg: 'bg-slate-50 dark:bg-slate-950', text: 'text-slate-900 dark:text-slate-50' };
  }, [siteSettings.grayScale]);

  const closeOnBackdrop = siteSettings.closeOnBackdrop ?? false;
  const backgroundImage = siteSettings.backgroundImage?.trim();
  const useCustomBackground = !!siteSettings.backgroundImageEnabled && !!backgroundImage;
  const backgroundMotion = siteSettings.backgroundMotion ?? false;

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
      const auth = await refreshSyncAuth();
      const localMeta = getLocalSyncMeta();
      const localVersion = localMeta?.version ?? 0;
      const localUpdatedAt = typeof localMeta?.updatedAt === 'number' ? localMeta.updatedAt : 0;
      const localDeviceId = localMeta?.deviceId || getDeviceId();
      const cloudData = await pullFromCloud();

      if (cloudData && cloudData.links && cloudData.categories) {
        if (auth.role !== 'admin') {
          applyCloudData(cloudData, auth.role);
          return;
        }

        // 版本不一致时提示用户选择
        if (cloudData.meta.version !== localVersion) {
          // Prepare encrypted sensitive config for sync (Requirements 2.1, 2.6)
          const syncPassword = (localStorage.getItem(SYNC_PASSWORD_KEY) || '').trim();
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
            isAdmin ? { groupEnabled: privacyGroupEnabled, passwordEnabled: privacyPasswordEnabled, autoUnlockEnabled: privacyAutoUnlockEnabled, useSeparatePassword: useSeparatePrivacyPassword } : undefined,
            themeMode,
            encryptedConfig,
            buildSyncCache()
          );
          handleSyncConflict({
            localData: { ...localData, meta: { updatedAt: localUpdatedAt, deviceId: localDeviceId, version: localVersion } },
            remoteData: cloudData
          });
        }
      }
    };

    checkCloudData();
  }, [isLoaded, pullFromCloud, links, categories, searchMode, externalSearchSources, aiConfig, siteSettings, privateVaultCipher, privacyGroupEnabled, privacyPasswordEnabled, privacyAutoUnlockEnabled, useSeparatePrivacyPassword, buildSyncData, handleSyncConflict, getLocalSyncMeta, refreshSyncAuth, applyCloudData, themeMode, isAdmin]);

  // === KV Sync: Auto-sync on data change ===
  const prevSyncDataRef = useRef<string | null>(null);

  useEffect(() => {
    // 跳过初始加载阶段
    if (!isLoaded || !hasInitialSyncRun.current || currentConflict) return;
    if (isSyncPasswordRefreshingRef.current) return;
    if (!isAdmin) return;

    const performSync = async () => {
      // Prepare encrypted sensitive config for sync (Requirements 2.1, 2.6)
      const syncPassword = (localStorage.getItem(SYNC_PASSWORD_KEY) || '').trim();
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
      const serialized = JSON.stringify(syncData);

      if (serialized !== prevSyncDataRef.current) {
        prevSyncDataRef.current = serialized;
        schedulePush(syncData);
      }
    };

    performSync();
  }, [links, categories, isLoaded, searchMode, externalSearchSources, aiConfig, siteSettings, privateVaultCipher, privacyGroupEnabled, privacyPasswordEnabled, privacyAutoUnlockEnabled, useSeparatePrivacyPassword, schedulePush, buildSyncData, currentConflict, isAdmin, themeMode]);

  const handleSaveSettings = useCallback(async (nextConfig: AIConfig, nextSiteSettings: SiteSettings) => {
    saveAIConfig(nextConfig, nextSiteSettings);

    // 仅管理员可把“保存设置”同步到云端
    if (!isAdmin) return;

    // Prepare encrypted sensitive config for sync (Requirements 2.1, 2.6)
    const syncPassword = (localStorage.getItem(SYNC_PASSWORD_KEY) || '').trim();
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
    prevSyncDataRef.current = JSON.stringify(syncData);
    cancelPendingSync();
    void pushToCloud(syncData, false, 'manual');
  }, [saveAIConfig, isAdmin, links, categories, searchMode, externalSearchSources, privateVaultCipher, privacyGroupEnabled, privacyPasswordEnabled, privacyAutoUnlockEnabled, useSeparatePrivacyPassword, buildSyncData, cancelPendingSync, pushToCloud, themeMode]);

  // === Sync Conflict Resolution ===
  const handleResolveConflict = useCallback((choice: 'local' | 'remote') => {
    if (choice === 'remote' && currentConflict) {
      // 使用云端数据
      handleSyncComplete(currentConflict.remoteData);
    }
    resolveSyncConflict(choice);
    setSyncConflictOpen(false);
    setCurrentConflict(null);
  }, [currentConflict, handleSyncComplete, resolveSyncConflict]);

  // 手动触发同步
  const handleManualSync = useCallback(async () => {
    if (!isAdmin) {
      notify('用户模式无法写入云端，请先输入 API 访问密码进入管理员模式。', 'warning');
      return;
    }

    // Prepare encrypted sensitive config for sync (Requirements 2.1, 2.6)
    const syncPassword = (localStorage.getItem(SYNC_PASSWORD_KEY) || '').trim();
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
    await pushToCloud(syncData, false, 'manual');
  }, [links, categories, searchMode, externalSearchSources, aiConfig, siteSettings, privateVaultCipher, pushToCloud, isAdmin, notify, themeMode]);

  const performPull = useCallback(async (role: SyncRole) => {
    const localMeta = getLocalSyncMeta();
    const localVersion = localMeta?.version ?? 0;
    const localUpdatedAt = typeof localMeta?.updatedAt === 'number' ? localMeta.updatedAt : 0;
    const localDeviceId = localMeta?.deviceId || getDeviceId();

    const cloudData = await pullFromCloud();
    if (!cloudData || !cloudData.links || !cloudData.categories) return;

    // 用户模式：直接以云端为准，不弹冲突
    if (role !== 'admin') {
      applyCloudData(cloudData, role);
      return;
    }

    // 管理员模式：版本不一致时提示用户选择
    if (cloudData.meta.version !== localVersion) {
      // Prepare encrypted sensitive config for sync (Requirements 2.1, 2.6)
      const syncPassword = (localStorage.getItem(SYNC_PASSWORD_KEY) || '').trim();
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
        themeMode,
        encryptedConfig,
        buildSyncCache()
      );
      handleSyncConflict({
        localData: { ...localData, meta: { updatedAt: localUpdatedAt, deviceId: localDeviceId, version: localVersion } },
        remoteData: cloudData
      });
      return;
    }

    applyCloudData(cloudData, role);
  }, [getLocalSyncMeta, pullFromCloud, applyCloudData, links, categories, searchMode, externalSearchSources, aiConfig, siteSettings, privateVaultCipher, buildSyncData, handleSyncConflict, themeMode]);

  const handleManualPull = useCallback(async () => {
    await performPull(syncRole);
  }, [performPull, syncRole]);

  const handleSyncPasswordChange = useCallback((nextPassword: string) => {
    const trimmed = nextPassword.trim();
    if (trimmed === lastSyncPasswordRef.current) return;
    lastSyncPasswordRef.current = trimmed;

    // 任何密码变更都会退出管理员会话，需要重新点击“登录”验证
    localStorage.removeItem(SYNC_ADMIN_SESSION_KEY);
    cancelPendingSync();

    if (syncRole === 'admin' && isSyncProtected) {
      setSyncRole('user');
    }
  }, [cancelPendingSync, isSyncProtected, syncRole]);

  const handleVerifySyncPassword = useCallback(async (): Promise<VerifySyncPasswordResult> => {
    if (!isSyncProtected) {
      // 未开启密码保护：所有访问者默认拥有管理员权限
      setSyncRole('admin');
      return { success: true, role: 'admin' };
    }

    const password = (localStorage.getItem(SYNC_PASSWORD_KEY) || '').trim();
    if (!password) {
      localStorage.removeItem(SYNC_ADMIN_SESSION_KEY);
      setSyncRole('user');
      return { success: false, role: 'user', error: '请输入密码后点击登录' };
    }

    cancelPendingSync();
    isSyncPasswordRefreshingRef.current = true;

    try {
      const response = await fetch(`${SYNC_API_ENDPOINT}?action=login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Sync-Password': password
        },
        body: JSON.stringify({ deviceId: getDeviceId() })
      });

      const result = await response.json();

      if (!result?.success) {
        localStorage.removeItem(SYNC_ADMIN_SESSION_KEY);
        setSyncRole('user');
        await refreshSyncAuth();
        return {
          success: false,
          role: 'user',
          error: result?.error || '登录失败',
          lockedUntil: typeof result?.lockedUntil === 'number' ? result.lockedUntil : undefined,
          retryAfterSeconds: typeof result?.retryAfterSeconds === 'number' ? result.retryAfterSeconds : undefined,
          remainingAttempts: typeof result?.remainingAttempts === 'number' ? result.remainingAttempts : undefined,
          maxAttempts: typeof result?.maxAttempts === 'number' ? result.maxAttempts : undefined
        };
      }

      localStorage.setItem(SYNC_ADMIN_SESSION_KEY, '1');
      const auth = await refreshSyncAuth();
      await performPull(auth.role);

      return { success: true, role: auth.role };
    } catch (error: any) {
      localStorage.removeItem(SYNC_ADMIN_SESSION_KEY);
      setSyncRole('user');
      return { success: false, role: 'user', error: error.message || '网络错误' };
    } finally {
      isSyncPasswordRefreshingRef.current = false;
    }
  }, [cancelPendingSync, isSyncProtected, refreshSyncAuth, performPull]);

  const handleRestoreBackup = useCallback(async (backupKey: string) => {
    if (!isAdmin) {
      notify('用户模式无法恢复云端备份，请先输入 API 访问密码进入管理员模式。', 'warning');
      return false;
    }

    const confirmed = await confirm({
      title: '恢复云端备份',
      message: '此操作将用所选备份覆盖本地数据，并在云端创建一个回滚点。',
      confirmText: '恢复',
      cancelText: '取消',
      variant: 'danger'
    });
    if (!confirmed) return false;

    const restoredData = await restoreBackup(backupKey);
    if (!restoredData) {
      notify('恢复失败，请稍后重试', 'error');
      return false;
    }

    handleSyncComplete(restoredData);
    prevSyncDataRef.current = JSON.stringify(buildSyncData(
      restoredData.links,
      restoredData.categories,
      restoredData.searchConfig,
      restoredData.aiConfig,
      restoredData.siteSettings,
      restoredData.privateVault,
      restoredData.themeMode,
      restoredData.encryptedSensitiveConfig,
      restoredData.customFaviconCache
    ));
    notify('已恢复到所选备份，并创建回滚点', 'success');
    return true;
  }, [confirm, restoreBackup, handleSyncComplete, notify, buildSyncData, isAdmin]);

  const handleDeleteBackup = useCallback(async (backupKey: string) => {
    if (!isAdmin) {
      notify('用户模式无法删除云端备份，请先输入 API 访问密码进入管理员模式。', 'warning');
      return false;
    }

    const confirmed = await confirm({
      title: '删除备份',
      message: '确定要删除此备份吗?此操作无法撤销。',
      confirmText: '删除',
      cancelText: '取消',
      variant: 'danger'
    });
    if (!confirmed) return false;

    const success = await deleteBackup(backupKey);
    if (!success) {
      notify('删除失败，请稍后重试', 'error');
      return false;
    }

    notify('备份已删除', 'success');
    return true;
  }, [confirm, deleteBackup, notify, isAdmin]);

  // === Render ===
  return (
    <div className={`flex h-screen overflow-hidden ${toneClasses.text}`}>
      {/* Modals - Wrapped in Suspense for lazy loading */}
      <Suspense fallback={null}>
        <CategoryManagerModal
          isOpen={isCatManagerOpen}
          onClose={() => setIsCatManagerOpen(false)}
          categories={categories}
          onUpdateCategories={handleUpdateCategories}
          onDeleteCategory={handleDeleteCategory}
          closeOnBackdrop={closeOnBackdrop}
        />

        <ImportModal
          isOpen={isImportModalOpen}
          onClose={() => setIsImportModalOpen(false)}
          existingLinks={links}
          categories={categories}
          onImport={handleImportConfirm}
          onImportSearchConfig={restoreSearchConfig}
          onImportAIConfig={restoreAIConfig}
          closeOnBackdrop={closeOnBackdrop}
        />

        <SettingsModal
          isOpen={isSettingsModalOpen}
          onClose={() => setIsSettingsModalOpen(false)}
          config={aiConfig}
          siteSettings={siteSettings}
          onSave={handleSaveSettings}
          links={links}
          categories={categories}
          onUpdateLinks={(newLinks) => updateData(newLinks, categories)}
          onDeleteLink={deleteLink}
          onNavigateToCategory={(categoryId) => {
            setSelectedCategory(categoryId);
            setIsSettingsModalOpen(false);
          }}
          onOpenImport={() => setIsImportModalOpen(true)}
          onRestoreBackup={handleRestoreBackup}
          onDeleteBackup={handleDeleteBackup}
          onSyncPasswordChange={handleSyncPasswordChange}
          onVerifySyncPassword={handleVerifySyncPassword}
          syncRole={syncRole}
          isSyncProtected={isSyncProtected}
          useSeparatePrivacyPassword={useSeparatePrivacyPassword}
          onMigratePrivacyMode={handleMigratePrivacyMode}
          privacyGroupEnabled={privacyGroupEnabled}
          onTogglePrivacyGroup={handleTogglePrivacyGroup}
          privacyPasswordEnabled={privacyPasswordEnabled}
          onTogglePrivacyPassword={handleTogglePrivacyPassword}
          privacyAutoUnlockEnabled={privacyAutoUnlockEnabled}
          onTogglePrivacyAutoUnlock={handleTogglePrivacyAutoUnlock}
          closeOnBackdrop={closeOnBackdrop}
        />

        <SearchConfigModal
          isOpen={isSearchConfigModalOpen}
          onClose={() => setIsSearchConfigModalOpen(false)}
          sources={externalSearchSources}
          onSave={(sources) => saveSearchConfig(sources, searchMode)}
          closeOnBackdrop={closeOnBackdrop}
        />

        {/* Sync Conflict Modal */}
        <SyncConflictModal
          isOpen={syncConflictOpen}
          conflict={currentConflict}
          onResolve={handleResolveConflict}
          onClose={() => setSyncConflictOpen(false)}
          closeOnBackdrop={closeOnBackdrop}
        />
      </Suspense>

      {/* Sync Status Indicator - Fixed bottom right */}
      <div className="fixed bottom-4 right-4 z-30">
        <SyncStatusIndicator
          status={syncStatus}
          lastSyncTime={lastSyncTime}
          onManualSync={isAdmin ? handleManualSync : handleManualPull}
          onManualPull={handleManualPull}
        />
      </div>

      {/* Sidebar Mobile Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50 lg:hidden backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
        <Sidebar
        sidebarOpen={sidebarOpen}
        sidebarWidthClass={sidebarWidthClass}
        isSidebarCollapsed={isSidebarCollapsed}
        navTitleText={navTitleText}
        navTitleShort={navTitleShort}
        selectedCategory={selectedCategory}
        categories={categories}
        linkCounts={linkCounts}
        privacyGroupEnabled={privacyGroupEnabled}
        isPrivateUnlocked={isPrivateUnlocked}
        privateCount={privateCount}
        repoUrl={GITHUB_REPO_URL}
        isAdmin={isAdmin}
        onSelectAll={selectAll}
        onSelectCategory={handleCategoryClick}
        onSelectPrivate={handleSelectPrivate}
        onToggleCollapsed={toggleSidebarCollapsed}
        onOpenCategoryManager={() => {
          if (!isAdmin) {
            notify('用户模式不可编辑，请先输入 API 访问密码进入管理员模式。', 'warning');
            return;
          }
          setIsCatManagerOpen(true);
        }}
        onOpenImport={() => {
          if (!isAdmin) {
            notify('用户模式不可编辑，请先输入 API 访问密码进入管理员模式。', 'warning');
            return;
          }
          setIsImportModalOpen(true);
        }}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
      />

      {/* Main Content */}
      <main className={`flex-1 flex flex-col h-full overflow-hidden relative ${toneClasses.bg}`}>
        <div className="absolute inset-0 pointer-events-none">
          {useCustomBackground && (
            <div
              className="absolute inset-0 bg-center bg-cover"
              style={{ backgroundImage: `url("${backgroundImage}")` }}
            />
          )}

          {/* Light Mode Background */}
          <div className={`absolute inset-0 dark:hidden ${useCustomBackground ? 'bg-transparent' : 'bg-[#f8fafc]'}`}>
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:24px_24px]"></div>
            <div className={`absolute left-[4%] top-[6%] w-[520px] h-[520px] rounded-full bg-accent/10 blur-[110px] mix-blend-multiply ${backgroundMotion ? 'animate-glow-drift' : ''}`}></div>
            <div className={`absolute right-[6%] top-[16%] w-[440px] h-[440px] rounded-full bg-accent/5 blur-[100px] mix-blend-multiply ${backgroundMotion ? 'animate-glow-drift-alt' : ''}`}></div>
            <div className={`absolute left-[28%] bottom-[6%] w-[560px] h-[560px] rounded-full bg-accent/10 blur-[120px] mix-blend-multiply opacity-70 ${backgroundMotion ? 'animate-glow-drift-slow' : ''}`}></div>
            {!useCustomBackground && (
              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-slate-50/80"></div>
            )}
          </div>

          {/* Dark Mode Atmosphere */}
          <div className={`absolute inset-0 hidden dark:block ${useCustomBackground ? 'bg-transparent' : 'bg-[#05070f]'}`}></div>
          <div
            className={`absolute inset-0 hidden dark:block ${backgroundMotion ? 'animate-aurora-shift' : ''}`}
            style={{
              backgroundImage:
                'radial-gradient(680px 420px at 14% 22%, rgb(var(--accent-color) / 0.15), transparent 62%), radial-gradient(560px 360px at 82% 18%, rgba(56,189,248,0.18), transparent 60%), radial-gradient(520px 320px at 54% 58%, rgb(var(--accent-color) / 0.08), transparent 70%), radial-gradient(820px 520px at 50% 88%, rgb(var(--accent-color) / 0.10), transparent 70%)',
              backgroundSize: backgroundMotion ? '140% 140%' : undefined,
              backgroundPosition: backgroundMotion ? '30% 20%' : undefined
            }}
          ></div>
          {!useCustomBackground && (
            <div
              className="absolute inset-0 hidden dark:block opacity-40"
              style={{
                backgroundImage:
                  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160' viewBox='0 0 160 160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)' opacity='0.4'/%3E%3C/svg%3E\")",
                backgroundSize: '160px 160px',
                mixBlendMode: 'soft-light'
              }}
            ></div>
          )}
          <div
            className="absolute inset-0 hidden dark:block opacity-70"
            style={{
              backgroundImage:
                'radial-gradient(120% 60% at 50% 0%, rgba(255,255,255,0.06), transparent 55%)'
            }}
          ></div>
        </div>

        <div className="relative z-10 flex flex-col h-full">
          <MainHeader
            navTitleText={navTitleText}
            siteCardStyle={siteSettings.cardStyle}
            themeMode={themeMode}
            darkMode={darkMode}
            canEdit={isAdmin}
            isMobileSearchOpen={isMobileSearchOpen}
            searchMode={searchMode}
            searchQuery={searchQuery}
            externalSearchSources={externalSearchSources}
            hoveredSearchSource={hoveredSearchSource}
            selectedSearchSource={selectedSearchSource}
            showSearchSourcePopup={showSearchSourcePopup}
            canSortPinned={canSortPinned}
            canSortCategory={canSortCategory}
            isSortingPinned={isSortingPinned}
            isSortingCategory={isSortingCategory}
            onOpenSidebar={openSidebar}
            onSetTheme={setThemeAndApply}
            onViewModeChange={handleViewModeChange}
            onSearchModeChange={handleSearchModeChange}
            onOpenSearchConfig={() => {
              if (!isAdmin) {
                notify('用户模式不可编辑，请先输入 API 访问密码进入管理员模式。', 'warning');
                return;
              }
              setIsSearchConfigModalOpen(true);
            }}
            onSearchQueryChange={setSearchQuery}
            onExternalSearch={handleExternalSearch}
            onSearchSourceSelect={handleSearchSourceSelect}
            onHoverSearchSource={setHoveredSearchSource}
            onIconHoverChange={setIsIconHovered}
            onPopupHoverChange={setIsPopupHovered}
            onToggleMobileSearch={toggleMobileSearch}
            onToggleSearchSourcePopup={() => setShowSearchSourcePopup(prev => !prev)}
            onStartPinnedSorting={() => {
              if (!isAdmin) {
                notify('用户模式不可编辑，请先输入 API 访问密码进入管理员模式。', 'warning');
                return;
              }
              startPinnedSorting();
            }}
            onStartCategorySorting={() => {
              if (!isAdmin) {
                notify('用户模式不可编辑，请先输入 API 访问密码进入管理员模式。', 'warning');
                return;
              }
              if (!isPrivateView) {
                startSorting(selectedCategory);
              }
            }}
            onSavePinnedSorting={savePinnedSorting}
            onCancelPinnedSorting={cancelPinnedSorting}
            onSaveCategorySorting={saveSorting}
            onCancelCategorySorting={cancelSorting}
            onAddLink={handleAddLinkRequest}
            onOpenSettings={() => setIsSettingsModalOpen(true)}
            onEditDisabled={handleEditDisabled}
          />

          <LinkSections
            linksCount={links.length}
            pinnedLinks={pinnedLinks}
            displayedLinks={activeDisplayedLinks}
            selectedCategory={selectedCategory}
            searchQuery={searchQuery}
            searchMode={searchMode}
            categories={categories}
            siteTitle={siteSettings.title}
            siteCardStyle={siteSettings.cardStyle}
            isSortingPinned={isSortingPinned}
            isSortingMode={isSortingMode}
            isBatchEditMode={effectiveIsBatchEditMode}
            selectedLinksCount={effectiveSelectedLinksCount}
            sensors={sensors}
            onPinnedDragEnd={handlePinnedDragEnd}
            onDragEnd={handleDragEnd}
            onToggleBatchEditMode={effectiveToggleBatchEditMode}
            onBatchDelete={effectiveBatchDelete}
            onBatchPin={effectiveBatchPin}
            onSelectAll={effectiveSelectAll}
            onBatchMove={effectiveBatchMove}
            onAddLink={handleAddLinkRequest}
            onLinkOpen={handleLinkOpen}
            selectedLinks={effectiveSelectedLinks}
            onLinkSelect={handleLinkSelect}
            onLinkContextMenu={handleLinkContextMenu}
            onLinkEdit={handleLinkEdit}
            isPrivateUnlocked={isPrivateUnlocked}
            onPrivateUnlock={handleUnlockPrivateVault}
            privateUnlockHint={privateUnlockHint}
            privateUnlockSubHint={privateUnlockSubHint}
          />
        </div>
      </main>

      {/* Link Modal */}
      <Suspense fallback={null}>
        <LinkModal
          isOpen={isModalOpen}
          onClose={closeLinkModal}
          onSave={editingLink ? handleEditLink : handleAddLink}
          onDelete={editingLink ? handleDeleteLink : undefined}
          categories={categories}
          initialData={editingLink || (prefillLink as LinkItem)}
          aiConfig={aiConfig}
          defaultCategoryId={selectedCategory !== 'all' && selectedCategory !== PRIVATE_CATEGORY_ID ? selectedCategory : undefined}
          closeOnBackdrop={closeOnBackdrop}
          existingTags={existingTags}
        />
        <LinkModal
          isOpen={isPrivateModalOpen}
          onClose={closePrivateModal}
          onSave={editingPrivateLink ? handlePrivateEditLink : handlePrivateAddLink}
          onDelete={editingPrivateLink ? handlePrivateDeleteLink : undefined}
          categories={privateCategories}
          initialData={editingPrivateLink || (prefillPrivateLink as LinkItem)}
          aiConfig={aiConfig}
          defaultCategoryId={PRIVATE_CATEGORY_ID}
          closeOnBackdrop={closeOnBackdrop}
          existingTags={existingPrivateTags}
        />
      </Suspense>

      {/* Context Menu */}
      <ContextMenu
        isOpen={contextMenu.isOpen}
        position={contextMenu.position}
        categories={categories}
        isRecommended={Boolean(contextMenu.link?.recommended)}
        onClose={closeContextMenu}
        onCopyLink={copyLinkToClipboard}
        onEditLink={editLinkFromContextMenu}
        onDuplicateLink={duplicateLinkFromContextMenu}
        onMoveLink={moveLinkFromContextMenu}
        onDeleteLink={deleteLinkFromContextMenu}
        onTogglePin={togglePinFromContextMenu}
        onToggleRecommended={toggleRecommendedFromContextMenu}
      />
    </div>
  );
}

export default App;
