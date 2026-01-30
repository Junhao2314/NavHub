/**
 * useBatchEdit - 批量编辑模式
 *
 * 功能:
 *   - 进入/退出批量编辑模式
 *   - 多选链接（支持全选/反选）
 *   - 批量删除、移动分类、置顶
 *
 * 使用场景:
 *   - 整理大量链接时，避免逐个操作
 *   - 快速将多个链接移动到新分类
 *   - 批量清理不需要的链接
 */

import { useCallback, useState } from 'react';
import { useDialog } from '../components/ui/DialogProvider';
import { Category, LinkItem } from '../types';

interface UseBatchEditProps {
  links: LinkItem[];
  categories: Category[];
  /** 当前显示的链接列表（已过滤/排序） */
  displayedLinks: LinkItem[];
  updateData: (links: LinkItem[], categories: Category[]) => void;
}

export function useBatchEdit({ links, categories, displayedLinks, updateData }: UseBatchEditProps) {
  const [isBatchEditMode, setIsBatchEditMode] = useState(false);
  const [selectedLinks, setSelectedLinks] = useState<Set<string>>(new Set());
  const { notify, confirm } = useDialog();

  /** 切换批量编辑模式，退出时清空选择 */
  const toggleBatchEditMode = useCallback(() => {
    setIsBatchEditMode((prev) => !prev);
    setSelectedLinks(new Set());
  }, []);

  /** 切换单个链接的选中状态 */
  const toggleLinkSelection = useCallback((linkId: string) => {
    setSelectedLinks((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(linkId)) {
        newSet.delete(linkId);
      } else {
        newSet.add(linkId);
      }
      return newSet;
    });
  }, []);

  /** 批量删除选中的链接（需二次确认） */
  const handleBatchDelete = useCallback(async () => {
    if (selectedLinks.size === 0) {
      notify('请先选择要删除的链接', 'warning');
      return;
    }

    const shouldDelete = await confirm({
      title: '删除链接',
      message: `确定要删除选中的 ${selectedLinks.size} 个链接吗？`,
      confirmText: '删除',
      cancelText: '取消',
      variant: 'danger',
    });

    if (!shouldDelete) return;

    const newLinks = links.filter((link) => !selectedLinks.has(link.id));
    updateData(newLinks, categories);
    setSelectedLinks(new Set());
    setIsBatchEditMode(false);
  }, [selectedLinks, links, categories, updateData, notify, confirm]);

  /** 批量移动选中的链接到目标分类 */
  const handleBatchMove = useCallback(
    (targetCategoryId: string) => {
      if (selectedLinks.size === 0) {
        notify('请先选择要移动的链接', 'warning');
        return;
      }

      const newLinks = links.map((link) =>
        selectedLinks.has(link.id) ? { ...link, categoryId: targetCategoryId } : link,
      );
      updateData(newLinks, categories);
      setSelectedLinks(new Set());
      setIsBatchEditMode(false);
    },
    [selectedLinks, links, categories, updateData, notify],
  );

  /**
   * 批量置顶选中的链接
   *
   * 按当前显示顺序分配 pinnedOrder，保持选中链接的相对顺序。
   * 已置顶的链接会被跳过。
   */
  const handleBatchPin = useCallback(() => {
    if (selectedLinks.size === 0) {
      notify('请先选择要置顶的链接', 'warning');
      return;
    }

    const maxPinnedOrder = links.reduce((max, link) => {
      if (!link.pinned || link.pinnedOrder === undefined) return max;
      return Math.max(max, link.pinnedOrder);
    }, -1);

    const selectedOrder = displayedLinks
      .filter((link) => selectedLinks.has(link.id) && !link.pinned)
      .map((link) => link.id);

    let nextOrder = maxPinnedOrder + 1;
    const orderMap = new Map<string, number>();
    selectedOrder.forEach((id) => {
      orderMap.set(id, nextOrder);
      nextOrder += 1;
    });

    if (orderMap.size === 0) {
      notify('所选链接已置顶', 'info');
      return;
    }

    const newLinks = links.map((link) => {
      const order = orderMap.get(link.id);
      if (order === undefined) return link;
      return { ...link, pinned: true, pinnedOrder: order };
    });

    updateData(newLinks, categories);
    setSelectedLinks(new Set());
  }, [selectedLinks, links, categories, updateData, displayedLinks, notify]);

  /**
   * 全选/取消全选
   *
   * 如果当前显示的链接已全部选中，则取消全选；否则全选。
   */
  const handleSelectAll = useCallback(() => {
    const currentLinkIds = displayedLinks.map((link) => link.id);

    if (
      selectedLinks.size === currentLinkIds.length &&
      currentLinkIds.every((id) => selectedLinks.has(id))
    ) {
      setSelectedLinks(new Set());
    } else {
      setSelectedLinks(new Set(currentLinkIds));
    }
  }, [displayedLinks, selectedLinks]);

  return {
    isBatchEditMode,
    selectedLinks,
    toggleBatchEditMode,
    toggleLinkSelection,
    handleBatchDelete,
    handleBatchMove,
    handleBatchPin,
    handleSelectAll,
  };
}
