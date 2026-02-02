import { lazy, Suspense } from 'react';
import ContextMenu from '../components/layout/ContextMenu';
import SyncStatusIndicator from '../components/ui/SyncStatusIndicator';
import { PRIVATE_CATEGORY_ID } from '../utils/constants';
import type { AppController } from './useAppController';

const LinkModal = lazy(() => import('../components/modals/LinkModal'));
const CategoryManagerModal = lazy(() => import('../components/modals/CategoryManagerModal'));
const ImportModal = lazy(() => import('../components/modals/ImportModal'));
const SettingsModal = lazy(() => import('../components/modals/SettingsModal'));
const SearchConfigModal = lazy(() => import('../components/modals/SearchConfigModal'));
const SyncConflictModal = lazy(() => import('../components/modals/SyncConflictModal'));

export interface AppOverlaysProps {
  controller: AppController;
}

export function AppTopOverlays({ controller }: AppOverlaysProps) {
  const { core, config, search, modals, privacy, sync, actions, sidebar, appearance, admin } =
    controller;

  const { links, categories, updateData, deleteLink } = core;
  const { isAdmin } = admin;
  const { setSelectedCategory } = sidebar;

  return (
    <>
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
            onImportBackupData={actions.handleImportBackupData}
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
            onSwitchPrivacyMode={privacy.handleSwitchPrivacyMode}
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

      <div className="fixed bottom-4 right-4 z-30">
        <SyncStatusIndicator
          status={sync.syncStatus}
          lastSyncTime={sync.lastSyncTime}
          errorMessage={sync.syncErrorMessage}
          errorKind={sync.syncErrorKind}
          onManualSync={isAdmin ? sync.handleManualSync : sync.handleManualPull}
          onManualPull={sync.handleManualPull}
          onOpenConflict={() => sync.setSyncConflictOpen(true)}
          showWhenIdle={!isAdmin}
        />
      </div>
    </>
  );
}

export function AppBottomOverlays({ controller }: AppOverlaysProps) {
  const { config, modals, privacy, sidebar, actions, appearance, meta, contextMenu, core } =
    controller;

  const { categories } = core;
  const { selectedCategory } = sidebar;

  return (
    <>
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
    </>
  );
}
