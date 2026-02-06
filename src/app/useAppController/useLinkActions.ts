import type React from 'react';
import { useCallback } from 'react';
import i18n from '../../config/i18n';
import type { Category, LinkItem } from '../../types';
import type { ConfirmFn, NotifyFn } from '../../types/ui';
import { PRIVATE_CATEGORY_ID } from '../../utils/constants';

export const useLinkActions = (args: {
  isAdmin: boolean;
  isPrivateView: boolean;
  links: LinkItem[];
  editingLink: LinkItem | undefined;
  setEditingLink: (link: LinkItem | undefined) => void;
  setPrefillLink: (link: Partial<LinkItem> | undefined) => void;
  openAddLinkModal: () => void;
  openEditLinkModal: (link: LinkItem) => void;
  openPrivateAddModal: () => void;
  openPrivateEditModal: (link: LinkItem) => void;
  setIsImportModalOpen: (open: boolean) => void;
  addLink: (data: Omit<LinkItem, 'id' | 'createdAt'>) => void;
  updateLink: (data: Omit<LinkItem, 'createdAt'>) => void;
  deleteLink: (id: string) => void;
  recordAdminLinkClick: (id: string) => void;
  deleteCategory: (id: string) => void;
  importData: (links: LinkItem[], categories: Category[]) => void;
  updateData: (links: LinkItem[], categories: Category[]) => void;
  notify: NotifyFn;
  confirm: ConfirmFn;
  requireAdmin: (message?: string) => boolean;
  handleContextMenu: (event: React.MouseEvent, link: LinkItem) => void;
}) => {
  const {
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
    deleteCategory,
    importData,
    updateData,
    notify,
    confirm,
    requireAdmin,
    handleContextMenu,
  } = args;

  const handleImportConfirm = useCallback(
    (newLinks: LinkItem[], newCategories: Category[]) => {
      if (!requireAdmin()) {
        return;
      }
      importData(newLinks, newCategories);
      setIsImportModalOpen(false);
      notify(i18n.t('modals.import.importSuccess', { count: newLinks.length }), 'success');
    },
    [importData, notify, requireAdmin, setIsImportModalOpen],
  );

  const handleAddLink = useCallback(
    (data: Omit<LinkItem, 'id' | 'createdAt'>) => {
      if (!requireAdmin()) return;
      addLink(data);
      setPrefillLink(undefined);
    },
    [addLink, requireAdmin, setPrefillLink],
  );

  const handleEditLink = useCallback(
    (data: Omit<LinkItem, 'id' | 'createdAt'>) => {
      if (!requireAdmin()) return;
      if (!editingLink) return;
      updateLink({ ...data, id: editingLink.id });
      setEditingLink(undefined);
    },
    [editingLink, requireAdmin, setEditingLink, updateLink],
  );

  const handleDeleteLink = useCallback(
    async (id: string) => {
      if (!requireAdmin()) return;
      const shouldDelete = await confirm({
        title: i18n.t('modals.link.deleteConfirmTitle'),
        message: i18n.t('modals.link.deleteConfirmMessageGeneric'),
        confirmText: i18n.t('common.delete'),
        cancelText: i18n.t('common.cancel'),
        variant: 'danger',
      });

      if (shouldDelete) {
        deleteLink(id);
      }
    },
    [confirm, deleteLink, requireAdmin],
  );

  const handleAddLinkRequest = useCallback(() => {
    if (isPrivateView) {
      openPrivateAddModal();
      return;
    }
    if (!requireAdmin()) return;
    openAddLinkModal();
  }, [isPrivateView, openPrivateAddModal, openAddLinkModal, requireAdmin]);

  const handleLinkEdit = useCallback(
    (link: LinkItem) => {
      if (isPrivateView) {
        openPrivateEditModal(link);
        return;
      }
      if (!requireAdmin()) return;
      openEditLinkModal(link);
    },
    [isPrivateView, openEditLinkModal, openPrivateEditModal, requireAdmin],
  );

  const handleLinkContextMenu = useCallback(
    (event: React.MouseEvent, link: LinkItem) => {
      if (isPrivateView || !isAdmin) return;
      handleContextMenu(event, link);
    },
    [handleContextMenu, isPrivateView, isAdmin],
  );

  const handleLinkOpen = useCallback(
    (link: LinkItem) => {
      if (!isAdmin) return;
      if (link.categoryId === PRIVATE_CATEGORY_ID) return;
      recordAdminLinkClick(link.id);
    },
    [isAdmin, recordAdminLinkClick],
  );

  const handleUpdateCategories = useCallback(
    (newCats: Category[]) => {
      if (!requireAdmin()) return;
      updateData(links, newCats);
    },
    [links, requireAdmin, updateData],
  );

  const handleDeleteCategory = useCallback(
    (catId: string) => {
      if (!requireAdmin()) return;
      deleteCategory(catId);
    },
    [deleteCategory, requireAdmin],
  );

  return {
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
  };
};
