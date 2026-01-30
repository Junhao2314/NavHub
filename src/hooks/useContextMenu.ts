/**
 * useContextMenu - Context Menu Management Hook
 * useContextMenu - 右键菜单管理 Hook
 *
 * Features / 功能:
 *   - Show/hide context menu for link cards / 链接卡片的右键菜单显示/隐藏
 *   - Menu actions: copy link, edit, delete, pin, recommend, duplicate, move category
 *     菜单操作：复制链接、编辑、删除、置顶、推荐、复制、移动分类
 *
 * Design considerations / 设计要点:
 *   - Context menu disabled in batch edit mode / 批量编辑模式下禁用右键菜单
 *   - Delete action requires confirmation / 删除操作需二次确认
 *   - Menu position follows mouse click position / 菜单位置跟随鼠标点击位置
 */

import React, { useCallback, useState } from 'react';
import { useDialog } from '../components/ui/DialogProvider';
import { Category, LinkItem } from '../types';

/**
 * Context menu state
 * 右键菜单状态
 */
interface ContextMenuState {
  /** Whether menu is open / 菜单是否打开 */
  isOpen: boolean;
  /** Menu position (x, y coordinates) / 菜单位置（x, y 坐标） */
  position: { x: number; y: number };
  /** The link associated with the menu / 关联的链接 */
  link: LinkItem | null;
}

interface UseContextMenuProps {
  links: LinkItem[];
  categories: Category[];
  updateData: (links: LinkItem[], categories: Category[]) => void;
  onEditLink: (link: LinkItem) => void;
  /**
   * Disable context menu in batch edit mode
   * 批量编辑模式下禁用右键菜单
   */
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

  /**
   * Open context menu at mouse position
   * 在鼠标位置打开右键菜单
   */
  const handleContextMenu = useCallback(
    (event: React.MouseEvent, link: LinkItem) => {
      event.preventDefault();
      event.stopPropagation();

      // Disable context menu in batch edit mode
      // 批量编辑模式下禁用右键菜单
      if (isBatchEditMode) return;

      setContextMenu({
        isOpen: true,
        position: { x: event.clientX, y: event.clientY },
        link: link,
      });
    },
    [isBatchEditMode],
  );

  /**
   * Close context menu
   * 关闭右键菜单
   */
  const closeContextMenu = useCallback(() => {
    setContextMenu({
      isOpen: false,
      position: { x: 0, y: 0 },
      link: null,
    });
  }, []);

  /**
   * Copy link URL to clipboard
   * 复制链接到剪贴板
   */
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

  /**
   * Edit link from context menu
   * 从右键菜单编辑链接
   */
  const editLinkFromContextMenu = useCallback(() => {
    if (!contextMenu.link) return;
    onEditLink(contextMenu.link);
    closeContextMenu();
  }, [contextMenu.link, onEditLink, closeContextMenu]);

  /**
   * Delete link (requires confirmation)
   * 删除链接（需确认）
   */
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

  /**
   * Toggle pin status
   * 切换置顶状态
   */
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

  /**
   * Toggle recommended status (add/remove from common recommendations)
   * 切换推荐状态（添加/移除常用推荐）
   */
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

  /**
   * Duplicate link (create a copy)
   * 复制链接（创建副本）
   */
  const duplicateLinkFromContextMenu = useCallback(() => {
    if (!contextMenu.link) return;
    const newLink: LinkItem = {
      ...contextMenu.link,
      id: Date.now().toString(),
      createdAt: Date.now(),
      title: `${contextMenu.link.title} (副本)`,
      // Default to unpinned for duplicate to be safe/clean
      // 副本默认不置顶，保持整洁
      pinned: false,
    };
    const updatedLinks = [...links, newLink];
    updateData(updatedLinks, categories);
    closeContextMenu();
  }, [contextMenu.link, links, categories, updateData, closeContextMenu]);

  /**
   * Move link to specified category
   * 移动链接到指定分类
   */
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
