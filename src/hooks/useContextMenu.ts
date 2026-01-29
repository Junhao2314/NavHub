import React, { useCallback, useState } from 'react';
import { useDialog } from '../components/ui/DialogProvider';
import { Category, LinkItem } from '../types';

interface ContextMenuState {
  isOpen: boolean;
  position: { x: number; y: number };
  link: LinkItem | null;
}

interface UseContextMenuProps {
  links: LinkItem[];
  categories: Category[];
  updateData: (links: LinkItem[], categories: Category[]) => void;
  onEditLink: (link: LinkItem) => void;
  isBatchEditMode: boolean;
}

export function useContextMenu({
  links,
  categories,
  updateData,
  onEditLink,
  isBatchEditMode,
}: UseContextMenuProps) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    isOpen: false,
    position: { x: 0, y: 0 },
    link: null,
  });
  const { confirm, notify } = useDialog();

  const handleContextMenu = useCallback(
    (event: React.MouseEvent, link: LinkItem) => {
      event.preventDefault();
      event.stopPropagation();

      // Disable context menu in batch edit mode
      if (isBatchEditMode) return;

      setContextMenu({
        isOpen: true,
        position: { x: event.clientX, y: event.clientY },
        link: link,
      });
    },
    [isBatchEditMode],
  );

  const closeContextMenu = useCallback(() => {
    setContextMenu({
      isOpen: false,
      position: { x: 0, y: 0 },
      link: null,
    });
  }, []);

  const copyLinkToClipboard = useCallback(() => {
    if (!contextMenu.link) return;

    navigator.clipboard
      .writeText(contextMenu.link.url)
      .then(() => {
        notify('链接已复制到剪贴板', 'success');
      })
      .catch((err) => {
        console.error('复制链接失败:', err);
        notify('复制链接失败', 'error');
      });

    closeContextMenu();
  }, [contextMenu.link, closeContextMenu, notify]);

  const editLinkFromContextMenu = useCallback(() => {
    if (!contextMenu.link) return;
    onEditLink(contextMenu.link);
    closeContextMenu();
  }, [contextMenu.link, onEditLink, closeContextMenu]);

  const deleteLinkFromContextMenu = useCallback(async () => {
    if (!contextMenu.link) return;

    const shouldDelete = await confirm({
      title: '删除链接',
      message: `确定要删除"${contextMenu.link.title}"吗？`,
      confirmText: '删除',
      cancelText: '取消',
      variant: 'danger',
    });

    if (shouldDelete) {
      const newLinks = links.filter((link) => link.id !== contextMenu.link!.id);
      updateData(newLinks, categories);
    }

    closeContextMenu();
  }, [contextMenu.link, links, categories, updateData, closeContextMenu, confirm]);

  const togglePinFromContextMenu = useCallback(() => {
    if (!contextMenu.link) return;

    const linkToToggle = links.find((l) => l.id === contextMenu.link!.id);
    if (!linkToToggle) return;

    const updated = links.map((l) => {
      if (l.id === contextMenu.link!.id) {
        const isPinned = !l.pinned;
        return {
          ...l,
          pinned: isPinned,
          pinnedOrder: isPinned ? links.filter((link) => link.pinned).length : undefined,
        };
      }
      return l;
    });

    updateData(updated, categories);
    closeContextMenu();
  }, [contextMenu.link, links, categories, updateData, closeContextMenu]);

  const toggleRecommendedFromContextMenu = useCallback(() => {
    if (!contextMenu.link) return;

    const linkToToggle = links.find((l) => l.id === contextMenu.link!.id);
    if (!linkToToggle) return;

    const nextRecommended = !linkToToggle.recommended;
    const maxRecommendedOrder = links
      .filter((link) => link.recommended && link.id !== linkToToggle.id)
      .reduce((max, link) => Math.max(max, link.recommendedOrder ?? -1), -1);
    const nextRecommendedOrder = nextRecommended ? maxRecommendedOrder + 1 : undefined;

    const updated = links.map((l) => {
      if (l.id === linkToToggle.id) {
        return {
          ...l,
          recommended: nextRecommended,
          recommendedOrder: nextRecommendedOrder,
        };
      }
      return l;
    });

    updateData(updated, categories);
    closeContextMenu();
  }, [contextMenu.link, links, categories, updateData, closeContextMenu]);

  const duplicateLinkFromContextMenu = useCallback(() => {
    if (!contextMenu.link) return;
    const newLink: LinkItem = {
      ...contextMenu.link,
      id: Date.now().toString(),
      createdAt: Date.now(),
      title: `${contextMenu.link.title} (副本)`,
      pinned: false, // Default to unpinned for duplicate? Or copy state? Let's unpin to be safe/clean.
    };
    const updatedLinks = [...links, newLink];
    updateData(updatedLinks, categories);
    closeContextMenu();
  }, [contextMenu.link, links, categories, updateData, closeContextMenu]);

  const moveLinkFromContextMenu = useCallback(
    (targetCategoryId: string) => {
      if (!contextMenu.link) return;
      const updatedLinks = links.map((l) =>
        l.id === contextMenu.link!.id ? { ...l, categoryId: targetCategoryId } : l,
      );
      updateData(updatedLinks, categories);
      closeContextMenu();
    },
    [contextMenu.link, links, categories, updateData, closeContextMenu],
  );

  return {
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
  };
}
