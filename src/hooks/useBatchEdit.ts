/**
 * useBatchEdit - Batch Edit Mode Hook
 * useBatchEdit - 批量编辑模式 Hook
 *
 * Features / 功能:
 *   - Enter/exit batch edit mode / 进入/退出批量编辑模式
 *   - Multi-select links (supports select all/deselect) / 多选链接（支持全选/反选）
 *   - Batch delete, move category, pin / 批量删除、移动分类、置顶
 *
 * Use cases / 使用场景:
 *   - Organize many links without individual operations / 整理大量链接时，避免逐个操作
 *   - Quickly move multiple links to a new category / 快速将多个链接移动到新分类
 *   - Batch cleanup of unwanted links / 批量清理不需要的链接
 */

import { useCallback, useState } from 'react';
import { useDialog } from '../components/ui/DialogProvider';
import i18n from '../config/i18n';
import { Category, LinkItem } from '../types';

interface UseBatchEditProps {
  links: LinkItem[];
  categories: Category[];
  /**
   * Currently displayed links (filtered/sorted)
   * 当前显示的链接列表（已过滤/排序）
   */
  displayedLinks: LinkItem[];
  updateData: (links: LinkItem[], categories: Category[]) => void;
}

export function useBatchEdit({ links, categories, displayedLinks, updateData }: UseBatchEditProps) {
  /** Whether batch edit mode is active / 是否处于批量编辑模式 */
  const [isBatchEditMode, setIsBatchEditMode] = useState(false);
  /** Set of selected link IDs / 已选中的链接 ID 集合 */
  const [selectedLinks, setSelectedLinks] = useState<Set<string>>(new Set());
  const { notify, confirm } = useDialog();

  /**
   * Toggle batch edit mode, clear selection on exit
   * 切换批量编辑模式，退出时清空选择
   */
  const toggleBatchEditMode = useCallback(() => {
    setIsBatchEditMode((prev) => !prev);
    setSelectedLinks(new Set());
  }, []);

  /**
   * Toggle selection state of a single link
   * 切换单个链接的选中状态
   */
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

  /**
   * Batch delete selected links (requires confirmation)
   * 批量删除选中的链接（需二次确认）
   */
  const handleBatchDelete = useCallback(async () => {
    if (selectedLinks.size === 0) {
      notify(i18n.t('linkSections.selectLinksToDelete'), 'warning');
      return;
    }

    const shouldDelete = await confirm({
      title: i18n.t('modals.link.batchDeleteConfirmTitle'),
      message: i18n.t('modals.link.batchDeleteConfirmMessage', { count: selectedLinks.size }),
      confirmText: i18n.t('common.delete'),
      cancelText: i18n.t('common.cancel'),
      variant: 'danger',
    });

    if (!shouldDelete) return;

    const newLinks = links.filter((link) => !selectedLinks.has(link.id));
    updateData(newLinks, categories);
    setSelectedLinks(new Set());
    setIsBatchEditMode(false);
  }, [selectedLinks, links, categories, updateData, notify, confirm]);

  /**
   * Batch move selected links to target category
   * 批量移动选中的链接到目标分类
   */
  const handleBatchMove = useCallback(
    (targetCategoryId: string) => {
      if (selectedLinks.size === 0) {
        notify(i18n.t('linkSections.selectLinksToMove'), 'warning');
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
   * Batch pin selected links
   * 批量置顶选中的链接
   *
   * Assigns pinnedOrder based on current display order to maintain relative order.
   * 按当前显示顺序分配 pinnedOrder，保持选中链接的相对顺序。
   * Already pinned links are skipped.
   * 已置顶的链接会被跳过。
   */
  const handleBatchPin = useCallback(() => {
    if (selectedLinks.size === 0) {
      notify(i18n.t('linkSections.selectLinksToPin'), 'warning');
      return;
    }

    // Find max existing pinnedOrder / 找到现有最大的 pinnedOrder
    const maxPinnedOrder = links.reduce((max, link) => {
      if (!link.pinned || link.pinnedOrder === undefined) return max;
      return Math.max(max, link.pinnedOrder);
    }, -1);

    // Get selected links that are not already pinned, in display order
    // 获取未置顶的选中链接，按显示顺序排列
    const selectedOrder = displayedLinks
      .filter((link) => selectedLinks.has(link.id) && !link.pinned)
      .map((link) => link.id);

    // Assign pinnedOrder to each / 为每个链接分配 pinnedOrder
    let nextOrder = maxPinnedOrder + 1;
    const orderMap = new Map<string, number>();
    selectedOrder.forEach((id) => {
      orderMap.set(id, nextOrder);
      nextOrder += 1;
    });

    if (orderMap.size === 0) {
      notify(i18n.t('linkSections.allSelectedLinksPinned'), 'info');
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
   * Select all / Deselect all
   * 全选/取消全选
   *
   * If all displayed links are selected, deselect all; otherwise select all.
   * 如果当前显示的链接已全部选中，则取消全选；否则全选。
   */
  const handleSelectAll = useCallback(() => {
    const currentLinkIds = displayedLinks.map((link) => link.id);

    if (
      selectedLinks.size === currentLinkIds.length &&
      currentLinkIds.every((id) => selectedLinks.has(id))
    ) {
      // All selected, deselect all / 已全选，取消全选
      setSelectedLinks(new Set());
    } else {
      // Select all displayed links / 全选当前显示的链接
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
