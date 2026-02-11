import { useCallback } from 'react';
import LinkSections from '../components/layout/LinkSections';
import MainHeader from '../components/layout/MainHeader';
import Sidebar from '../components/layout/Sidebar';
import CountdownModal from '../components/modals/CountdownModal';

import { GITHUB_REPO_URL, PRIVATE_CATEGORY_ID } from '../utils/constants';
import { AppBackground } from './AppBackground';
import { AppBottomOverlays, AppTopOverlays } from './AppOverlays';
import { useAppController } from './useAppController';

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
    sorting,
    batchEdit,
    displayed,
    actions,
    meta,
    appearance,
    admin,
    countdown,
  } = controller;

  const { links, categories } = core;
  const { sidebarOpen, setSidebarOpen, selectedCategory } = sidebar;
  const { isAdmin, handleEditDisabled } = admin;
  const { setIsSettingsModalOpen, setIsSearchConfigModalOpen, setIsCatManagerOpen } = modals;
  const { startSorting: startCategorySorting } = sorting;

  const isPrivateView = selectedCategory === PRIVATE_CATEGORY_ID;

  const handleOpenSettings = useCallback(
    () => setIsSettingsModalOpen(true),
    [setIsSettingsModalOpen],
  );

  const handleOpenSearchConfig = useCallback(() => {
    if (!isAdmin) return handleEditDisabled();
    setIsSearchConfigModalOpen(true);
  }, [handleEditDisabled, isAdmin, setIsSearchConfigModalOpen]);

  const handleStartCategorySorting = useCallback(() => {
    if (!isPrivateView) {
      startCategorySorting(selectedCategory);
    }
  }, [isPrivateView, selectedCategory, startCategorySorting]);

  const handleOpenCategoryManager = useCallback(() => {
    if (!isAdmin) return handleEditDisabled();
    setIsCatManagerOpen(true);
  }, [handleEditDisabled, isAdmin, setIsCatManagerOpen]);

  // === Render ===
  return (
    <div className={`flex h-screen overflow-hidden ${appearance.toneClasses.text}`}>
      <AppTopOverlays controller={controller} />

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
        <AppBackground
          useCustomBackground={appearance.useCustomBackground}
          backgroundImage={appearance.backgroundImage}
          backgroundMotion={appearance.backgroundMotion}
        />

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
            countdowns={countdown.countdowns}
            isAdmin={isAdmin}
            onCountdownAdd={() => {
              countdown.setEditingCountdown(null);
              countdown.setIsCountdownModalOpen(true);
            }}
            onCountdownEdit={(item) => {
              countdown.setEditingCountdown(item);
              countdown.setIsCountdownModalOpen(true);
            }}
            onCountdownDelete={countdown.deleteCountdown}
            onCountdownToggleHidden={countdown.toggleCountdownHidden}
          />
        </div>
      </main>

      <AppBottomOverlays controller={controller} />

      <CountdownModal
        isOpen={countdown.isCountdownModalOpen}
        onClose={() => {
          countdown.setIsCountdownModalOpen(false);
          countdown.setEditingCountdown(null);
        }}
        onSave={(data) => {
          if (countdown.editingCountdown) {
            countdown.updateCountdown({ ...data, id: countdown.editingCountdown.id });
          } else {
            countdown.addCountdown(data);
          }
        }}
        initialData={countdown.editingCountdown || undefined}
        closeOnBackdrop={appearance.closeOnBackdrop}
      />
    </div>
  );
}

export default App;
