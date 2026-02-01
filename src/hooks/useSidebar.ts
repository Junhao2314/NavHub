import { useState, useCallback } from 'react';
import { Category } from '../types';

export function useSidebar() {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState<string>('all');

    const sidebarWidthClass = isSidebarCollapsed ? 'w-64 lg:w-20' : 'w-64 lg:w-56';

    const openSidebar = useCallback(() => {
        setSidebarOpen(true);
    }, []);

    const closeSidebar = useCallback(() => {
        setSidebarOpen(false);
    }, []);

    const toggleSidebarCollapsed = useCallback(() => {
        setIsSidebarCollapsed(prev => !prev);
    }, []);

    const selectCategory = useCallback((categoryId: string) => {
        setSelectedCategory(categoryId);
        setSidebarOpen(false);
    }, []);

    const handleCategoryClick = useCallback((cat: Category) => {
        setSelectedCategory(cat.id);
        setSidebarOpen(false);
    }, []);

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
        selectAll
    };
}
