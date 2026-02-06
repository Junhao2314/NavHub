import { useEffect } from 'react';
import i18n from '../../config/i18n';
import type { Category, LinkItem } from '../../types';
import type { NotifyFn } from '../../types/ui';
import { PRIVATE_CATEGORY_ID } from '../../utils/constants';

export const useBookmarkletAddLink = ({
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
}: {
  selectedCategory: string;
  categories: Category[];
  isPrivateUnlocked: boolean;
  notify: NotifyFn;
  openAddLinkModal: () => void;
  setPrefillLink: (link: Partial<LinkItem> | undefined) => void;
  setEditingLink: (link: LinkItem | undefined) => void;
  openPrivateAddModal: () => void;
  setPrefillPrivateLink: (link: Partial<LinkItem> | null) => void;
  setEditingPrivateLink: (link: LinkItem | null) => void;
}) => {
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const addUrl = urlParams.get('add_url');
    if (!addUrl) return;

    const addTitle = urlParams.get('add_title') || '';
    window.history.replaceState({}, '', window.location.pathname);

    if (selectedCategory === PRIVATE_CATEGORY_ID) {
      if (!isPrivateUnlocked) {
        notify(i18n.t('privacy.unlockFirst'), 'warning');
        return;
      }
      openPrivateAddModal();
      setPrefillPrivateLink({
        title: addTitle,
        url: addUrl,
        categoryId: PRIVATE_CATEGORY_ID,
      });
      setEditingPrivateLink(null);
      return;
    }

    const fallbackCategoryId =
      selectedCategory !== 'all'
        ? selectedCategory
        : categories.find((c) => c.id === 'common')?.id || categories[0]?.id || 'common';
    openAddLinkModal();
    setPrefillLink({
      title: addTitle,
      url: addUrl,
      categoryId: fallbackCategoryId,
    });
    setEditingLink(undefined);
  }, [
    categories,
    isPrivateUnlocked,
    notify,
    openAddLinkModal,
    openPrivateAddModal,
    selectedCategory,
    setEditingLink,
    setEditingPrivateLink,
    setPrefillLink,
    setPrefillPrivateLink,
  ]);
};
