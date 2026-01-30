import { lazy, Suspense, useCallback } from 'react';
import ContextMenu from '../components/layout/ContextMenu';
import LinkSections from '../components/layout/LinkSections';
import MainHeader from '../components/layout/MainHeader';
import Sidebar from '../components/layout/Sidebar';
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
    core,
    theme,
    sidebar,
    config,
    search,
    modals,
    privacy,
    sync,
    sorting,
    batchEdit,
    displayed,
    contextMenu,
    actions,
    meta,
    appearance,
    admin,
  } = controller;

  const { links, categories, updateData, deleteLink } = core;
  const { sidebarOpen, setSidebarOpen, selectedCategory, setSelectedCategory } = sidebar;
  const { isAdmin, handleEditDisabled } = admin;

  const isPrivateView = selectedCategory === PRIVATE_CATEGORY_ID;

  const handleOpenSettings = useCallback(
    () => modals.setIsSettingsModalOpen(true),
    [modals.setIsSettingsModalOpen],
  );

  const handleOpenSearchConfig = useCallback(() => {
    if (!isAdmin) return handleEditDisabled();
    modals.setIsSearchConfigModalOpen(true);
  }, [handleEditDisabled, isAdmin, modals.setIsSearchConfigModalOpen]);

  const handleStartCategorySorting = useCallback(() => {
    if (!isPrivateView) {
      sorting.startSorting(selectedCategory);
    }
  }, [isPrivateView, sorting.startSorting, selectedCategory]);

  const handleOpenCategoryManager = useCallback(() => {
    if (!isAdmin) return handleEditDisabled();
    modals.setIsCatManagerOpen(true);
  }, [handleEditDisabled, isAdmin, modals.setIsCatManagerOpen]);

  // === Render ===
  return (
    <div className={`flex h-screen overflow-hidden ${appearance.toneClasses.text}`}>
      {/* Modals - Wrapped in Suspense for lazy loading */}
      <Suspense fallback={null}>
        {modals.isCatManagerOpen && (
          <CategoryManagerModal
            isOpen={modals.isCatManagerOpen}
            onClose={() => modals.setIsCatManagerOpen(false)}
            categories={categories}
            onUpdateCategories={actions.handleUpdateCategories}
            onDeleteCategory={actions.handleDeleteCategory}
            closeOnBackdrop={appearance.closeOnBackdrop}
            isAdmin={isAdmin}
          />
        )}

        {modals.isImportModalOpen && (
          <ImportModal
            isOpen={modals.isImportModalOpen}
            onClose={() => modals.setIsImportModalOpen(false)}
            existingLinks={links}
            categories={categories}
            onImport={actions.handleImportConfirm}
            onImportSearchConfig={search.restoreSearchConfig}
            onImportAIConfig={config.restoreAIConfig}
            closeOnBackdrop={appearance.closeOnBackdrop}
          />
        )}

        {modals.isSettingsModalOpen && (
          <SettingsModal
            isOpen={modals.isSettingsModalOpen}
            onClose={() => modals.setIsSettingsModalOpen(false)}
            config={config.aiConfig}
            siteSettings={config.siteSettings}
            onSave={sync.handleSaveSettings}
            links={links}
            categories={categories}
            onUpdateLinks={(newLinks) => updateData(newLinks, categories)}
            onDeleteLink={deleteLink}
            onNavigateToCategory={(categoryId) => {
              setSelectedCategory(categoryId);
              modals.setIsSettingsModalOpen(false);
            }}
            onOpenImport={() => modals.setIsImportModalOpen(true)}
            onRestoreBackup={sync.handleRestoreBackup}
            onDeleteBackup={sync.handleDeleteBackup}
            onSyncPasswordChange={sync.handleSyncPasswordChange}
            onVerifySyncPassword={sync.handleVerifySyncPassword}
            syncRole={sync.syncRole}
            isSyncProtected={sync.isSyncProtected}
            useSeparatePrivacyPassword={privacy.useSeparatePrivacyPassword}
            onMigratePrivacyMode={privacy.handleMigratePrivacyMode}
            privacyGroupEnabled={privacy.privacyGroupEnabled}
            onTogglePrivacyGroup={privacy.handleTogglePrivacyGroup}
            privacyPasswordEnabled={privacy.privacyPasswordEnabled}
            isTogglingPrivacyPassword={privacy.isTogglingPrivacyPassword}
            onTogglePrivacyPassword={privacy.handleTogglePrivacyPassword}
            privacyAutoUnlockEnabled={privacy.privacyAutoUnlockEnabled}
            onTogglePrivacyAutoUnlock={privacy.handleTogglePrivacyAutoUnlock}
            closeOnBackdrop={appearance.closeOnBackdrop}
          />
        )}

        {modals.isSearchConfigModalOpen && (
          <SearchConfigModal
            isOpen={modals.isSearchConfigModalOpen}
            onClose={() => modals.setIsSearchConfigModalOpen(false)}
            sources={search.externalSearchSources}
            onSave={(sources) => search.saveSearchConfig(sources, search.searchMode)}
            closeOnBackdrop={appearance.closeOnBackdrop}
          />
        )}

        {/* Sync Conflict Modal */}
        {sync.syncConflictOpen && (
          <SyncConflictModal
            isOpen={sync.syncConflictOpen}
            conflict={sync.currentConflict}
            onResolve={sync.handleResolveConflict}
            onClose={() => sync.setSyncConflictOpen(false)}
            closeOnBackdrop={appearance.closeOnBackdrop}
          />
        )}
      </Suspense>

      {/* Sync Status Indicator - Fixed bottom right */}
      <div className="fixed bottom-4 right-4 z-30">
        <SyncStatusIndicator
          status={sync.syncStatus}
          lastSyncTime={sync.lastSyncTime}
          errorMessage={sync.syncErrorMessage}
          errorKind={sync.syncErrorKind}
          onManualSync={isAdmin ? sync.handleManualSync : sync.handleManualPull}
          onManualPull={sync.handleManualPull}
          onOpenConflict={() => sync.setSyncConflictOpen(true)}
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
        categories={categories}
        linkCounts={meta.linkCounts}
        privacyGroupEnabled={privacy.privacyGroupEnabled}
        isPrivateUnlocked={privacy.isPrivateUnlocked}
        privateCount={privacy.privateCount}
        repoUrl={GITHUB_REPO_URL}
        isAdmin={isAdmin}
        onOpenCategoryManager={handleOpenCategoryManager}
      />

      {/* Main Content */}
      <main
        className={`flex-1 flex flex-col h-full overflow-hidden relative ${appearance.toneClasses.bg}`}
      >
        <div className="absolute inset-0 pointer-events-none">
          {appearance.useCustomBackground && (
            <div
              className="absolute inset-0 bg-center bg-cover"
              style={{ backgroundImage: `url("${appearance.backgroundImage}")` }}
            />
          )}

          {/* Light Mode Background */}
          <div
            className={`absolute inset-0 dark:hidden ${appearance.useCustomBackground ? 'bg-transparent' : 'bg-[#f8fafc]'}`}
          >
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:24px_24px]"></div>
            <div
              className={`absolute left-[4%] top-[6%] w-[520px] h-[520px] rounded-full bg-accent/10 blur-[110px] mix-blend-multiply ${appearance.backgroundMotion ? 'animate-glow-drift' : ''}`}
            ></div>
            <div
              className={`absolute right-[6%] top-[16%] w-[440px] h-[440px] rounded-full bg-accent/5 blur-[100px] mix-blend-multiply ${appearance.backgroundMotion ? 'animate-glow-drift-alt' : ''}`}
            ></div>
            <div
              className={`absolute left-[28%] bottom-[6%] w-[560px] h-[560px] rounded-full bg-accent/10 blur-[120px] mix-blend-multiply opacity-70 ${appearance.backgroundMotion ? 'animate-glow-drift-slow' : ''}`}
            ></div>
            {!appearance.useCustomBackground && (
              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-slate-50/80"></div>
            )}
          </div>

          {/* Dark Mode Atmosphere */}
          <div
            className={`absolute inset-0 hidden dark:block ${appearance.useCustomBackground ? 'bg-transparent' : 'bg-[#05070f]'}`}
          ></div>
          <div
            className={`absolute inset-0 hidden dark:block ${appearance.backgroundMotion ? 'animate-aurora-shift' : ''}`}
            style={{
              backgroundImage:
                'radial-gradient(680px 420px at 14% 22%, rgb(var(--accent-color) / 0.15), transparent 62%), radial-gradient(560px 360px at 82% 18%, rgba(56,189,248,0.18), transparent 60%), radial-gradient(520px 320px at 54% 58%, rgb(var(--accent-color) / 0.08), transparent 70%), radial-gradient(820px 520px at 50% 88%, rgb(var(--accent-color) / 0.10), transparent 70%)',
              backgroundSize: appearance.backgroundMotion ? '140% 140%' : undefined,
              backgroundPosition: appearance.backgroundMotion ? '30% 20%' : undefined,
            }}
          ></div>
          {!appearance.useCustomBackground && (
            <div
              className="absolute inset-0 hidden dark:block opacity-40"
              style={{
                backgroundImage:
                  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160' viewBox='0 0 160 160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)' opacity='0.4'/%3E%3C/svg%3E\")",
                backgroundSize: '160px 160px',
                mixBlendMode: 'soft-light',
              }}
            ></div>
          )}
          <div
            className="absolute inset-0 hidden dark:block opacity-70"
            style={{
              backgroundImage:
                'radial-gradient(120% 60% at 50% 0%, rgba(255,255,255,0.06), transparent 55%)',
            }}
          ></div>
        </div>

        <div className="relative z-10 flex flex-col h-full">
          <MainHeader
            canEdit={isAdmin}
            canSortPinned={sorting.canSortPinned}
            canSortCategory={sorting.canSortCategory}
            isSortingPinned={sorting.isSortingPinned}
            isSortingCategory={sorting.isSortingCategory}
            onSetTheme={theme.setThemeAndApply}
            onViewModeChange={config.handleViewModeChange}
            onSearchModeChange={search.handleSearchModeChange}
            onOpenSearchConfig={handleOpenSearchConfig}
            onExternalSearch={search.handleExternalSearch}
            onSearchSourceSelect={search.handleSearchSourceSelect}
            onToggleMobileSearch={search.toggleMobileSearch}
            onStartPinnedSorting={sorting.startPinnedSorting}
            onStartCategorySorting={handleStartCategorySorting}
            onSavePinnedSorting={sorting.savePinnedSorting}
            onCancelPinnedSorting={sorting.cancelPinnedSorting}
            onSaveCategorySorting={sorting.saveSorting}
            onCancelCategorySorting={sorting.cancelSorting}
            onAddLink={actions.handleAddLinkRequest}
            onOpenSettings={handleOpenSettings}
            onEditDisabled={handleEditDisabled}
          />

          <LinkSections
            linksCount={links.length}
            pinnedLinks={displayed.pinnedLinks}
            displayedLinks={displayed.activeDisplayedLinks}
            categories={categories}
            isSortingPinned={sorting.isSortingPinned}
            isSortingMode={sorting.isSortingMode}
            isBatchEditMode={batchEdit.effectiveIsBatchEditMode}
            selectedLinksCount={batchEdit.effectiveSelectedLinksCount}
            sensors={sorting.sensors}
            onPinnedDragEnd={sorting.handlePinnedDragEnd}
            onDragEnd={sorting.handleDragEnd}
            onToggleBatchEditMode={batchEdit.effectiveToggleBatchEditMode}
            onBatchDelete={batchEdit.effectiveBatchDelete}
            onBatchPin={batchEdit.effectiveBatchPin}
            onSelectAll={batchEdit.effectiveSelectAll}
            onBatchMove={batchEdit.effectiveBatchMove}
            onAddLink={actions.handleAddLinkRequest}
            onLinkOpen={actions.handleLinkOpen}
            selectedLinks={batchEdit.effectiveSelectedLinks}
            onLinkSelect={batchEdit.handleLinkSelect}
            onLinkContextMenu={actions.handleLinkContextMenu}
            onLinkEdit={actions.handleLinkEdit}
            isPrivateUnlocked={privacy.isPrivateUnlocked}
            onPrivateUnlock={privacy.handleUnlockPrivateVault}
            privateUnlockHint={privacy.privateUnlockHint}
            privateUnlockSubHint={privacy.privateUnlockSubHint}
          />
        </div>
      </main>

      {/* Link Modal */}
      <Suspense fallback={null}>
        {modals.isModalOpen && (
          <LinkModal
            isOpen={modals.isModalOpen}
            onClose={modals.closeLinkModal}
            onSave={modals.editingLink ? actions.handleEditLink : actions.handleAddLink}
            onDelete={modals.editingLink ? actions.handleDeleteLink : undefined}
            categories={categories}
            initialData={modals.editingLink ?? modals.prefillLink}
            aiConfig={config.aiConfig}
            defaultCategoryId={
              selectedCategory !== 'all' && selectedCategory !== PRIVATE_CATEGORY_ID
                ? selectedCategory
                : undefined
            }
            closeOnBackdrop={appearance.closeOnBackdrop}
            existingTags={meta.existingTags}
          />
        )}
        {privacy.isPrivateModalOpen && (
          <LinkModal
            isOpen={privacy.isPrivateModalOpen}
            onClose={privacy.closePrivateModal}
            onSave={
              privacy.editingPrivateLink
                ? privacy.handlePrivateEditLink
                : privacy.handlePrivateAddLink
            }
            onDelete={privacy.editingPrivateLink ? privacy.handlePrivateDeleteLink : undefined}
            categories={privacy.privateCategories}
            initialData={privacy.editingPrivateLink ?? privacy.prefillPrivateLink ?? undefined}
            aiConfig={config.aiConfig}
            defaultCategoryId={PRIVATE_CATEGORY_ID}
            closeOnBackdrop={appearance.closeOnBackdrop}
            existingTags={privacy.existingPrivateTags}
          />
        )}
      </Suspense>

      {/* Context Menu */}
      {contextMenu.state.isOpen && (
        <ContextMenu
          isOpen={contextMenu.state.isOpen}
          position={contextMenu.state.position}
          categories={categories}
          isRecommended={Boolean(contextMenu.state.link?.recommended)}
          onClose={contextMenu.closeContextMenu}
          onCopyLink={contextMenu.copyLinkToClipboard}
          onEditLink={contextMenu.editLinkFromContextMenu}
          onDuplicateLink={contextMenu.duplicateLinkFromContextMenu}
          onMoveLink={contextMenu.moveLinkFromContextMenu}
          onDeleteLink={contextMenu.deleteLinkFromContextMenu}
          onTogglePin={contextMenu.togglePinFromContextMenu}
          onToggleRecommended={contextMenu.toggleRecommendedFromContextMenu}
        />
      )}
    </div>
  );
}

export default App;
