/**
 * useSidebar - 侧边栏状态管理
 *
 * 功能:
 *   - 控制侧边栏的展开/收起（移动端抽屉模式）
 *   - 控制侧边栏的折叠/展开（桌面端宽度切换）
 *   - 管理当前选中的分类
 *
 * 响应式设计:
 *   - 移动端：侧边栏作为抽屉，通过 sidebarOpen 控制显示
 *   - 桌面端：侧边栏常驻，通过 isSidebarCollapsed 控制宽度
 */

import { useCallback, useState } from 'react';
import { Category } from '../types';

export function useSidebar() {
  /** 移动端侧边栏是否打开 */
  const [sidebarOpen, setSidebarOpen] = useState(false);
  /** 桌面端侧边栏是否折叠（仅显示图标） */
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  /** 当前选中的分类 ID，'all' 表示全部 */
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  /** 侧边栏宽度 class（响应式） */
  const sidebarWidthClass = isSidebarCollapsed ? 'w-64 lg:w-20' : 'w-64 lg:w-56';

  /** 打开移动端侧边栏 */
  const openSidebar = useCallback(() => {
    setSidebarOpen(true);
  }, []);

  /** 关闭移动端侧边栏 */
  const closeSidebar = useCallback(() => {
    setSidebarOpen(false);
  }, []);

  /** 切换桌面端侧边栏折叠状态 */
  const toggleSidebarCollapsed = useCallback(() => {
    setIsSidebarCollapsed((prev) => !prev);
  }, []);

  /** 选择分类并关闭移动端侧边栏 */
  const selectCategory = useCallback((categoryId: string) => {
    setSelectedCategory(categoryId);
    setSidebarOpen(false);
  }, []);

  /** 点击分类项的处理函数 */
  const handleCategoryClick = useCallback((cat: Category) => {
    setSelectedCategory(cat.id);
    setSidebarOpen(false);
  }, []);

  /** 选择"全部"分类 */
  const selectAll = useCallback(() => {
    setSelectedCategory('all');
    setSidebarOpen(false);
  }, []);

  return {
    sidebarOpen,
    setSidebarOpen,
    isSidebarCollapsed,
    sidebarWidthClass,
    selectedCategory,
    setSelectedCategory,
    openSidebar,
    closeSidebar,
    toggleSidebarCollapsed,
    selectCategory,
    handleCategoryClick,
    selectAll,
  };
}
