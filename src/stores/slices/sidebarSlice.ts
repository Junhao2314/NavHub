import type { StateCreator } from 'zustand';
import type { Category } from '../../types';
import type { AppStore } from '../useAppStore';

export interface SidebarSlice {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  isSidebarCollapsed: boolean;
  toggleSidebarCollapsed: () => void;
  selectedCategory: string;
  setSelectedCategory: (categoryId: string) => void;
  openSidebar: () => void;
  handleCategoryClick: (cat: Category) => void;
  selectAll: () => void;
}

export const createSidebarSlice: StateCreator<AppStore, [], [], SidebarSlice> = (set) => ({
  sidebarOpen: false,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  isSidebarCollapsed: false,
  toggleSidebarCollapsed: () => set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),
  selectedCategory: 'all',
  setSelectedCategory: (categoryId) => set({ selectedCategory: categoryId }),
  openSidebar: () => set({ sidebarOpen: true }),
  handleCategoryClick: (cat) => set({ selectedCategory: cat.id, sidebarOpen: false }),
  selectAll: () => set({ selectedCategory: 'all', sidebarOpen: false }),
});
