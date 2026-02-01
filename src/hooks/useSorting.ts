import { useState, useCallback, useMemo } from 'react';
import { DragEndEvent, PointerSensor, useSensor, useSensors, KeyboardSensor } from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { LinkItem, Category } from '../types';

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
    reorderPinnedLinks
}: UseSortingProps) {
    const [isSortingMode, setIsSortingMode] = useState<string | null>(null);
    const [isSortingPinned, setIsSortingPinned] = useState(false);

    // DnD-kit sensors
    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8, // Prevent accidental drags
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    // Start sorting for a category
    const startSorting = useCallback((categoryId: string) => {
        setIsSortingMode(categoryId);
    }, []);

    // Save sorting
    const saveSorting = useCallback(() => {
        updateData(links, categories);
        setIsSortingMode(null);
    }, [links, categories, updateData]);

    // Cancel sorting
    const cancelSorting = useCallback(() => {
        setIsSortingMode(null);
    }, []);

    // Start pinned sorting
    const startPinnedSorting = useCallback(() => {
        setIsSortingPinned(true);
    }, []);

    // Save pinned sorting
    const savePinnedSorting = useCallback(() => {
        updateData(links, categories);
        setIsSortingPinned(false);
    }, [links, categories, updateData]);

    // Cancel pinned sorting
    const cancelPinnedSorting = useCallback(() => {
        setIsSortingPinned(false);
    }, []);

    // Handle drag end for category links
    const handleDragEnd = useCallback((event: DragEndEvent) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            reorderLinks(active.id as string, over.id as string, selectedCategory);
        }
    }, [reorderLinks, selectedCategory]);

    // Handle drag end for pinned links
    const handlePinnedDragEnd = useCallback((event: DragEndEvent) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            reorderPinnedLinks(active.id as string, over.id as string);
        }
    }, [reorderPinnedLinks]);

    // Check if sorting is possible
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
        handlePinnedDragEnd
    };
}
