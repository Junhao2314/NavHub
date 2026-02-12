import { useCallback, useMemo } from 'react';
import LinkSections from '../components/layout/LinkSections';
import MainHeader from '../components/layout/MainHeader';
import Sidebar from '../components/layout/Sidebar';
import HolidayBatchModal from '../components/modals/HolidayBatchModal';
import ReminderBoardModal from '../components/modals/ReminderBoardModal';

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
    reminderBoard,
  } = controller;

  const { links, categories } = core;
  const { sidebarOpen, setSidebarOpen, selectedCategory } = sidebar;
  const { isAdmin, handleEditDisabled } = admin;
  const { setIsSettingsModalOpen, setIsSearchConfigModalOpen, setIsCatManagerOpen } = modals;
  const { startSorting: startCategorySorting } = sorting;

  const isPrivateView = selectedCategory === PRIVATE_CATEGORY_ID;

  const existingReminderTitles = useMemo(
    () => reminderBoard.items.map((item) => item.title),
    [reminderBoard.items],
  );

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
            reminderBoardItems={reminderBoard.items}
            isAdmin={isAdmin}
            onReminderBoardAdd={() => {
              reminderBoard.setEditingItem(null);
              reminderBoard.setIsModalOpen(true);
            }}
            onReminderBoardAddHolidays={() => {
              reminderBoard.setIsHolidayBatchModalOpen(true);
            }}
            onReminderBoardEdit={(item) => {
              reminderBoard.setEditingItem(item);
              reminderBoard.setIsModalOpen(true);
            }}
            onReminderBoardDelete={reminderBoard.deleteItem}
            onReminderBoardToggleHidden={reminderBoard.toggleItemHidden}
            onReminderBoardArchive={reminderBoard.archiveItem}
            onReminderBoardRestore={reminderBoard.restoreItem}
            onReminderBoardReorder={reminderBoard.reorderItems}
            onReminderBoardBatchDelete={reminderBoard.deleteItems}
            onReminderBoardBatchArchive={reminderBoard.archiveItems}
            onReminderBoardBatchUpdateTags={reminderBoard.updateItemsTags}
            onReminderBoardUpdate={reminderBoard.updateItem}
            siteSettings={config.siteSettings}
          />
        </div>
      </main>

      <AppBottomOverlays controller={controller} />

      <ReminderBoardModal
        isOpen={reminderBoard.isModalOpen}
        onClose={() => {
          reminderBoard.setIsModalOpen(false);
          reminderBoard.setEditingItem(null);
        }}
        onSave={(data) => {
          if (reminderBoard.editingItem) {
            reminderBoard.updateItem({ ...data, id: reminderBoard.editingItem.id });
          } else {
            reminderBoard.addItem(data);
          }
        }}
        initialData={reminderBoard.editingItem || undefined}
        closeOnBackdrop={appearance.closeOnBackdrop}
        isAdmin={isAdmin}
        privacyGroupEnabled={privacy.privacyGroupEnabled}
        groups={config.siteSettings.reminderBoardGroups ?? []}
        links={links}
      />

      <HolidayBatchModal
        isOpen={reminderBoard.isHolidayBatchModalOpen}
        onClose={() => reminderBoard.setIsHolidayBatchModalOpen(false)}
        onBatchAdd={reminderBoard.addItems}
        existingTitles={existingReminderTitles}
        closeOnBackdrop={appearance.closeOnBackdrop}
      />
    </div>
  );
}

export default App;
