import React, { lazy, Suspense } from 'react';
import type { LinkItem } from '../types';

import ContextMenu from '../components/layout/ContextMenu';
import Sidebar from '../components/layout/Sidebar';
import MainHeader from '../components/layout/MainHeader';
import LinkSections from '../components/layout/LinkSections';
import SyncStatusIndicator from '../components/ui/SyncStatusIndicator';

import { GITHUB_REPO_URL, PRIVATE_CATEGORY_ID } from '../utils/constants';
import { useAppController } from './useAppController';

// Lazy load modal components for better code splitting
const LinkModal = lazy(() => import('../components/modals/LinkModal'));
const CategoryManagerModal = lazy(() => import('../components/modals/CategoryManagerModal'));
const ImportModal = lazy(() => import('../components/modals/ImportModal'));
const SettingsModal = lazy(() => import('../components/modals/SettingsModal'));
const SearchConfigModal = lazy(() => import('../components/modals/SearchConfigModal'));
const SyncConflictModal = lazy(() => import('../components/modals/SyncConflictModal'));

export interface AppProps {
  onReady?: () => void;
}

function App({ onReady }: AppProps) {
  const controller = useAppController({ onReady });

  const {
    // Core data
    links,
    categories,
    updateData,
    deleteLink,

    // Theme
    themeMode,
    darkMode,
    setThemeAndApply,

    // Sidebar
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

    // Config
    aiConfig,
    restoreAIConfig,
    siteSettings,
    handleViewModeChange,
    navTitleText,
    navTitleShort,

    // Search
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

    // Modals
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

    // Private vault
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

    // Sync
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

    // Sorting
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

    // Batch edit
    effectiveIsBatchEditMode,
    effectiveSelectedLinksCount,
    effectiveSelectedLinks,
    effectiveToggleBatchEditMode,
    effectiveBatchDelete,
    effectiveBatchPin,
    effectiveSelectAll,
    effectiveBatchMove,
    handleLinkSelect,

    // Displayed links
    activeDisplayedLinks,

    // Context menu
    contextMenu,
    closeContextMenu,
    copyLinkToClipboard,
    editLinkFromContextMenu,
    duplicateLinkFromContextMenu,
    moveLinkFromContextMenu,
    deleteLinkFromContextMenu,
    togglePinFromContextMenu,
    toggleRecommendedFromContextMenu,

    // Handlers used directly by view
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

    // Appearance
    toneClasses,
    closeOnBackdrop,
    backgroundImage,
    useCustomBackground,
    backgroundMotion,

    // Admin
    isAdmin,
    linkCounts,
  } = controller;

  const isPrivateView = selectedCategory === PRIVATE_CATEGORY_ID;

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
          isTogglingPrivacyPassword={isTogglingPrivacyPassword}
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
            errorMessage={syncErrorMessage}
            errorKind={syncErrorKind}
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
          if (!isAdmin) return handleEditDisabled();
          setIsCatManagerOpen(true);
        }}
        onOpenImport={() => {
          if (!isAdmin) return handleEditDisabled();
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
              if (!isAdmin) return handleEditDisabled();
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
              if (!isAdmin) return handleEditDisabled();
              startPinnedSorting();
            }}
            onStartCategorySorting={() => {
              if (!isAdmin) return handleEditDisabled();
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
