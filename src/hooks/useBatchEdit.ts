import { useState, useCallback } from 'react';
import { LinkItem, Category } from '../types';
import { useDialog } from '../components/ui/DialogProvider';

interface UseBatchEditProps {
    links: LinkItem[];
    categories: Category[];
    displayedLinks: LinkItem[];
    updateData: (links: LinkItem[], categories: Category[]) => void;
}

export function useBatchEdit({ links, categories, displayedLinks, updateData }: UseBatchEditProps) {
    const [isBatchEditMode, setIsBatchEditMode] = useState(false);
    const [selectedLinks, setSelectedLinks] = useState<Set<string>>(new Set());
    const { notify, confirm } = useDialog();

    const toggleBatchEditMode = useCallback(() => {
        setIsBatchEditMode(prev => !prev);
        setSelectedLinks(new Set()); // Clear selections when exiting
    }, []);

    const toggleLinkSelection = useCallback((linkId: string) => {
        setSelectedLinks(prev => {
            const newSet = new Set(prev);
            if (newSet.has(linkId)) {
                newSet.delete(linkId);
            } else {
                newSet.add(linkId);
            }
            return newSet;
        });
    }, []);

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
            variant: 'danger'
        });

        if (!shouldDelete) return;

        const newLinks = links.filter(link => !selectedLinks.has(link.id));
        updateData(newLinks, categories);
        setSelectedLinks(new Set());
        setIsBatchEditMode(false);
    }, [selectedLinks, links, categories, updateData, notify, confirm]);

    const handleBatchMove = useCallback((targetCategoryId: string) => {
        if (selectedLinks.size === 0) {
            notify('请先选择要移动的链接', 'warning');
            return;
        }

        const newLinks = links.map(link =>
            selectedLinks.has(link.id) ? { ...link, categoryId: targetCategoryId } : link
        );
        updateData(newLinks, categories);
        setSelectedLinks(new Set());
        setIsBatchEditMode(false);
    }, [selectedLinks, links, categories, updateData, notify]);

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
            .filter(link => selectedLinks.has(link.id) && !link.pinned)
            .map(link => link.id);

        let nextOrder = maxPinnedOrder + 1;
        const orderMap = new Map<string, number>();
        selectedOrder.forEach(id => {
            orderMap.set(id, nextOrder);
            nextOrder += 1;
        });

        if (orderMap.size === 0) {
            notify('所选链接已置顶', 'info');
            return;
        }

        const newLinks = links.map(link => {
            const order = orderMap.get(link.id);
            if (order === undefined) return link;
            return { ...link, pinned: true, pinnedOrder: order };
        });

        updateData(newLinks, categories);
        setSelectedLinks(new Set());
    }, [selectedLinks, links, categories, updateData, displayedLinks, notify]);

    const handleSelectAll = useCallback(() => {
        const currentLinkIds = displayedLinks.map(link => link.id);

        if (selectedLinks.size === currentLinkIds.length && currentLinkIds.every(id => selectedLinks.has(id))) {
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
        handleSelectAll
    };
}
