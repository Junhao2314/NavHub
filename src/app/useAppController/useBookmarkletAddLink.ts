import { useEffect } from 'react';
import type { Category, LinkItem } from '../../types';
import type { NotifyFn } from '../../types/ui';
import { PRIVATE_CATEGORY_ID } from '../../utils/constants';

export const useBookmarkletAddLink = (args: {
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

    if (args.selectedCategory === PRIVATE_CATEGORY_ID) {
      if (!args.isPrivateUnlocked) {
        args.notify('请先解锁隐私分组', 'warning');
        return;
      }
      args.openPrivateAddModal();
      args.setPrefillPrivateLink({
        title: addTitle,
        url: addUrl,
        categoryId: PRIVATE_CATEGORY_ID,
      });
      args.setEditingPrivateLink(null);
      return;
    }

    const fallbackCategoryId =
      args.selectedCategory !== 'all'
        ? args.selectedCategory
        : args.categories.find((c) => c.id === 'common')?.id || args.categories[0]?.id || 'common';
    args.openAddLinkModal();
    args.setPrefillLink({
      title: addTitle,
      url: addUrl,
      categoryId: fallbackCategoryId,
    });
    args.setEditingLink(undefined);
  }, [
    args.categories,
    args.isPrivateUnlocked,
    args.notify,
    args.openAddLinkModal,
    args.openPrivateAddModal,
    args.selectedCategory,
    args.setEditingLink,
    args.setEditingPrivateLink,
    args.setPrefillLink,
    args.setPrefillPrivateLink,
  ]);
};
