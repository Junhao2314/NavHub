/**
 * useSorting - Drag and Drop Sorting Hook
 * useSorting - 拖拽排序 Hook
 *
 * Features / 功能:
 *   - Drag and drop sorting for category links / 分类内链接的拖拽排序
 *   - Drag and drop sorting for pinned links / 置顶链接的拖拽排序
 *   - Sorting mode state management / 排序模式状态管理
 *
 * Implementation / 实现:
 *   - Uses @dnd-kit for drag and drop functionality
 *     使用 @dnd-kit 实现拖拽功能
 *   - Supports both pointer and keyboard sensors
 *     支持鼠标和键盘两种交互方式
 */

import { DragEndEvent, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useCallback, useState } from 'react';
import { Category, LinkItem } from '../types';

interface UseSortingProps {
  links: LinkItem[];
  categories: Category[];
  selectedCategory: string;
  updateData: (links: LinkItem[], categories: Category[]) => void;
  reorderLinks: (activeId: string, overId: string, categoryId: string) => void;
  reorderPinnedLinks: (activeId: string, overId: string) => void;
}

export function useSorting({
  links,
  categories,
  selectedCategory,
  updateData,
  reorderLinks,
  reorderPinnedLinks,
}: UseSortingProps) {
  /**
   * Current sorting mode (category ID or null)
   * 当前排序模式（分类 ID 或 null）
   */
  const [isSortingMode, setIsSortingMode] = useState<string | null>(null);
  /**
   * Whether sorting pinned links
   * 是否正在排序置顶链接
   */
  const [isSortingPinned, setIsSortingPinned] = useState(false);

  // DnD-kit sensors configuration / DnD-kit 传感器配置
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Prevent accidental drags / 防止意外拖拽
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  /**
   * Start sorting for a category
   * 开始对某个分类进行排序
   */
  const startSorting = useCallback((categoryId: string) => {
    setIsSortingMode(categoryId);
  }, []);

  /**
   * Save sorting changes
   * 保存排序更改
   */
  const saveSorting = useCallback(() => {
    updateData(links, categories);
    setIsSortingMode(null);
  }, [links, categories, updateData]);

  /**
   * Cancel sorting
   * 取消排序
   */
  const cancelSorting = useCallback(() => {
    setIsSortingMode(null);
  }, []);

  /**
   * Start pinned links sorting
   * 开始置顶链接排序
   */
  const startPinnedSorting = useCallback(() => {
    setIsSortingPinned(true);
  }, []);

  /**
   * Save pinned links sorting
   * 保存置顶链接排序
   */
  const savePinnedSorting = useCallback(() => {
    updateData(links, categories);
    setIsSortingPinned(false);
  }, [links, categories, updateData]);

  /**
   * Cancel pinned links sorting
   * 取消置顶链接排序
   */
  const cancelPinnedSorting = useCallback(() => {
    setIsSortingPinned(false);
  }, []);

  /**
   * Handle drag end for category links
   * 处理分类链接的拖拽结束事件
   */
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (over && active.id !== over.id) {
        reorderLinks(active.id as string, over.id as string, selectedCategory);
      }
    },
    [reorderLinks, selectedCategory],
  );

  /**
   * Handle drag end for pinned links
   * 处理置顶链接的拖拽结束事件
   */
  const handlePinnedDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (over && active.id !== over.id) {
        reorderPinnedLinks(active.id as string, over.id as string);
      }
    },
    [reorderPinnedLinks],
  );

  /**
   * Check if sorting is possible for current category
   * 检查当前分类是否可以排序
   */
  const isSortingCategory = selectedCategory !== 'all' && isSortingMode === selectedCategory;

  return {
    sensors,
    isSortingMode,
    isSortingPinned,
    isSortingCategory,
    startSorting,
    saveSorting,
    cancelSorting,
    startPinnedSorting,
    savePinnedSorting,
    cancelPinnedSorting,
    handleDragEnd,
    handlePinnedDragEnd,
  };
}
