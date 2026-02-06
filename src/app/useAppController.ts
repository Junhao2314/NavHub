import { useCallback, useEffect, useRef } from 'react';
import { useDialog } from '../components/ui/DialogProvider';
import {
  useBatchEdit,
  useConfig,
  useContextMenu,
  useDataStore,
  useModals,
  useSearch,
  useSidebar,
  useSorting,
  useTheme,
} from '../hooks';
import type { NavHubSyncData } from '../types';
import { PRIVATE_CATEGORY_ID } from '../utils/constants';
import { applyCloudDataToLocalState } from './useAppController/kvSync/applyCloudData';
import { useAdminAccess } from './useAppController/useAdminAccess';
import { useAppearance } from './useAppController/useAppearance';
import { useBatchEditGuards } from './useAppController/useBatchEditGuards';
import { useBookmarkletAddLink } from './useAppController/useBookmarkletAddLink';
import { useDisplayedLinks } from './useAppController/useDisplayedLinks';
import { useKvSync } from './useAppController/useKvSync';
import { useLinkActions } from './useAppController/useLinkActions';
import { useLinkMeta } from './useAppController/useLinkMeta';
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
    reorderLinks,
    reorderPinnedLinks,
    deleteCategory: deleteCategoryStore,
    importData,
    isLoaded,
  } = useDataStore();
  const { notify, confirm } = useDialog();

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
    selectAll,
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
    navTitleShort,
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
    handleSwitchPrivacyMode,
    handleTogglePrivacyGroup,
    handleTogglePrivacyPassword,
    handleTogglePrivacyAutoUnlock,
    handleSelectPrivate,
  } = usePrivacyVault({
    notify,
    confirm,
    selectedCategory,
    setSelectedCategory,
    setSidebarOpen,
  });

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
    toggleMobileSearch,
  } = useSearch();

  const restoreSearchConfigRef = useRef<typeof restoreSearchConfig | null>(null);
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
    setIsSearchConfigModalOpen,
  } = useModals();

  const isPrivateView = selectedCategory === PRIVATE_CATEGORY_ID;

  const {
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
  } = useKvSync({
    isLoaded,
    links,
    categories,
    updateData,
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
  });

  // === 初始同步完成后隐藏加载动画 ===
  // 等待本地数据加载完成 + 云端初始同步完成后，才隐藏加载遮罩
  // 这样可以避免用户看到"主数据缺失时回退到历史记录"的过渡状态
  useEffect(() => {
    if (isLoaded && isInitialSyncComplete && onReady) {
      // 稍微延迟以确保 UI 渲染完成
      const timer = setTimeout(onReady, 100);
      return () => clearTimeout(timer);
    }
  }, [isLoaded, isInitialSyncComplete, onReady]);

  const handleImportBackupData = useCallback(
    (data: Partial<NavHubSyncData>) => {
      if (!data || Object.keys(data).length === 0) return;
      applyCloudDataToLocalState({
        data: data as NavHubSyncData,
        role: 'admin',
        updateData,
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
      updateData,
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
    ],
  );

  // === Computed: Displayed Links ===
  const { pinnedLinks, commonRecommendedLinks, displayedLinks, activeDisplayedLinks } =
    useDisplayedLinks({
      links,
      categories,
      privateLinks,
      selectedCategory,
      searchQuery,
      searchMode,
      isAdmin,
      privacyGroupEnabled,
      privacyPasswordEnabled,
      isPrivateUnlocked,
    });

  // === Batch Edit ===
  const {
    isBatchEditMode,
    selectedLinks,
    toggleBatchEditMode,
    toggleLinkSelection,
    handleBatchDelete,
    handleBatchMove,
    handleBatchPin,
    handleSelectAll,
  } = useBatchEdit({
    links,
    categories,
    displayedLinks,
    updateData,
  });

  const { handleEditDisabled, requireAdmin } = useAdminAccess({ isAdmin, notify });

  const {
    effectiveIsBatchEditMode,
    effectiveSelectedLinksCount,
    effectiveSelectedLinks,
    effectiveToggleBatchEditMode,
    effectiveSelectAll,
    effectiveBatchDelete,
    effectiveBatchPin,
    effectiveBatchMove,
    handleLinkSelect,
  } = useBatchEditGuards({
    isAdmin,
    isPrivateView,
    requireAdmin,
    isBatchEditMode,
    selectedLinks,
    toggleBatchEditMode,
    handleSelectAll,
    handleBatchDelete,
    handleBatchPin,
    handleBatchMove,
    toggleLinkSelection,
  });

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
    moveLinkFromContextMenu,
  } = useContextMenu({
    links,
    categories,
    updateData,
    onEditLink: openEditLinkModal,
    isBatchEditMode: effectiveIsBatchEditMode,
  });

  const {
    handleImportConfirm,
    handleAddLink,
    handleEditLink,
    handleDeleteLink,
    handleAddLinkRequest,
    handleLinkEdit,
    handleLinkContextMenu,
    handleLinkOpen,
    handleUpdateCategories,
    handleDeleteCategory,
  } = useLinkActions({
    isAdmin,
    isPrivateView,
    links,
    editingLink,
    setEditingLink,
    setPrefillLink,
    openAddLinkModal,
    openEditLinkModal,
    openPrivateAddModal,
    openPrivateEditModal,
    setIsImportModalOpen,
    addLink,
    updateLink,
    deleteLink,
    recordAdminLinkClick,
    deleteCategory: deleteCategoryStore,
    importData,
    updateData,
    notify,
    confirm,
    requireAdmin,
    handleContextMenu,
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
    handlePinnedDragEnd,
  } = useSorting({
    links,
    categories,
    selectedCategory,
    updateData,
    reorderLinks,
    reorderPinnedLinks,
  });

  // === Computed: Sorting States ===
  const canSortPinned =
    isAdmin && selectedCategory === 'all' && !searchQuery && pinnedLinks.length > 1;
  const canSortCategory =
    isAdmin &&
    selectedCategory !== 'all' &&
    selectedCategory !== PRIVATE_CATEGORY_ID &&
    displayedLinks.length > 1;

  useEffect(() => {
    if (isAdmin) return;
    if (isSortingPinned) cancelPinnedSorting();
    if (isSortingMode) cancelSorting();
  }, [isAdmin, isSortingPinned, isSortingMode, cancelPinnedSorting, cancelSorting]);

  // === Computed: Link Counts ===
  const { linkCounts, existingTags } = useLinkMeta({
    links,
    categories,
    commonRecommendedLinksCount: commonRecommendedLinks.length,
  });

  // 当从管理员模式切换到用户模式时，如果当前选中的是隐私分组，则自动切换到 'all'
  useEffect(() => {
    if (!isAdmin && selectedCategory === PRIVATE_CATEGORY_ID) {
      setSelectedCategory('all');
    }
  }, [isAdmin, selectedCategory, setSelectedCategory]);

  // 当从管理员模式切换到用户模式时，如果当前选中的是隐藏分类，则自动切换到 'all'
  useEffect(() => {
    if (!isAdmin) {
      const selectedCat = categories.find((c) => c.id === selectedCategory);
      if (selectedCat?.hidden) {
        setSelectedCategory('all');
      }
    }
  }, [isAdmin, selectedCategory, categories, setSelectedCategory]);

  // === Bookmarklet URL Handler ===
  useBookmarkletAddLink({
    selectedCategory,
    categories,
    isPrivateUnlocked,
    notify,
    openAddLinkModal,
    setPrefillLink,
    setEditingLink,
    openPrivateAddModal,
    setPrefillPrivateLink,
    setEditingPrivateLink,
  });

  // === Appearance Setup ===
  const { toneClasses, closeOnBackdrop, backgroundImage, useCustomBackground, backgroundMotion } =
    useAppearance(siteSettings);

  return {
    core: {
      links,
      categories,
      updateData,
      deleteLink,
    },
    theme: {
      themeMode,
      darkMode,
      setThemeAndApply,
    },
    sidebar: {
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
    },
    config: {
      aiConfig,
      restoreAIConfig,
      siteSettings,
      handleViewModeChange,
      navTitleText,
      navTitleShort,
    },
    search: {
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
    },
    modals: {
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
    },
    privacy: {
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
      handleSwitchPrivacyMode,
      handleTogglePrivacyGroup,
      handleTogglePrivacyPassword,
      handleTogglePrivacyAutoUnlock,
      handleSelectPrivate,
    },
    sync: {
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
      handleSaveSettings,
    },
    sorting: {
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
      sensors,
      handlePinnedDragEnd,
      handleDragEnd,
    },
    batchEdit: {
      effectiveIsBatchEditMode,
      effectiveSelectedLinksCount,
      effectiveSelectedLinks,
      effectiveToggleBatchEditMode,
      effectiveBatchDelete,
      effectiveBatchPin,
      effectiveSelectAll,
      effectiveBatchMove,
      handleLinkSelect,
    },
    displayed: {
      pinnedLinks,
      activeDisplayedLinks,
    },
    contextMenu: {
      state: contextMenu,
      closeContextMenu,
      copyLinkToClipboard,
      editLinkFromContextMenu,
      duplicateLinkFromContextMenu,
      moveLinkFromContextMenu,
      deleteLinkFromContextMenu,
      togglePinFromContextMenu,
      toggleRecommendedFromContextMenu,
    },
    actions: {
      handleUpdateCategories,
      handleDeleteCategory,
      handleImportConfirm,
      handleImportBackupData,
      handleAddLinkRequest,
      handleEditLink,
      handleAddLink,
      handleDeleteLink,
      handleLinkOpen,
      handleLinkContextMenu,
      handleLinkEdit,
    },
    admin: {
      isAdmin,
      requireAdmin,
      handleEditDisabled,
    },
    meta: {
      existingTags,
      linkCounts,
    },
    appearance: {
      toneClasses,
      closeOnBackdrop,
      backgroundImage,
      useCustomBackground,
      backgroundMotion,
    },
  };
};

export type AppController = ReturnType<typeof useAppController>;
