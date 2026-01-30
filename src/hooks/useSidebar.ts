/**
 * useSidebar - Sidebar State Management Hook
 * useSidebar - 侧边栏状态管理 Hook
 *
 * Features / 功能:
 *   - Control sidebar open/close (mobile drawer mode)
 *     控制侧边栏的展开/收起（移动端抽屉模式）
 *   - Control sidebar collapse/expand (desktop width toggle)
 *     控制侧边栏的折叠/展开（桌面端宽度切换）
 *   - Manage currently selected category
 *     管理当前选中的分类
 *
 * Responsive design / 响应式设计:
 *   - Mobile: Sidebar as drawer, controlled by sidebarOpen
 *     移动端：侧边栏作为抽屉，通过 sidebarOpen 控制显示
 *   - Desktop: Sidebar always visible, width controlled by isSidebarCollapsed
 *     桌面端：侧边栏常驻，通过 isSidebarCollapsed 控制宽度
 */

import { useAppStore } from '../stores/useAppStore';

export function useSidebar() {
  /**
   * Whether mobile sidebar is open
   * 移动端侧边栏是否打开
   */
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen);

  /**
   * Whether desktop sidebar is collapsed (icon-only mode)
   * 桌面端侧边栏是否折叠（仅显示图标）
   */
  const isSidebarCollapsed = useAppStore((s) => s.isSidebarCollapsed);

  /**
   * Currently selected category ID, 'all' means all categories
   * 当前选中的分类 ID，'all' 表示全部
   */
  const selectedCategory = useAppStore((s) => s.selectedCategory);
  const setSelectedCategory = useAppStore((s) => s.setSelectedCategory);

  /**
   * Sidebar width class (responsive)
   * 侧边栏宽度 class（响应式）
   */
  const sidebarWidthClass = isSidebarCollapsed ? 'w-64 lg:w-20' : 'w-64 lg:w-56';

  const openSidebar = useAppStore((s) => s.openSidebar);
  const closeSidebar = useAppStore((s) => s.closeSidebar);
  const toggleSidebarCollapsed = useAppStore((s) => s.toggleSidebarCollapsed);
  const selectCategory = useAppStore((s) => s.selectCategory);
  const handleCategoryClick = useAppStore((s) => s.handleCategoryClick);
  const selectAll = useAppStore((s) => s.selectAll);

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
