import { useState, useEffect, useCallback } from 'react';
import { LinkItem, Category, DEFAULT_CATEGORIES, INITIAL_LINKS } from '../types';
import { arrayMove } from '@dnd-kit/sortable';
import { LOCAL_STORAGE_KEY, FAVICON_CACHE_KEY, COMMON_CATEGORY_ID } from '../utils/constants';
import { generateId } from '../utils/id';
import { getCommonRecommendedLinks } from '../utils/recommendation';
import { useDialog } from '../components/ui/DialogProvider';
import { isLucideIconName, LEGACY_ICON_ALIASES } from '../components/ui/lucideIconMap';
import { safeLocalStorageGetItem, safeLocalStorageSetItem } from '../utils/storage';
import { normalizeHttpUrl } from '../utils/url';

const CATEGORY_ICON_FALLBACK = 'Folder';

const isTextIconName = (rawName: string): boolean => {
    const trimmed = rawName.trim();
    if (!trimmed) return false;
    return !/^[a-z0-9-]+$/i.test(trimmed);
};

const hasLucideIcon = (name: string): boolean => isLucideIconName(name);

const normalizeLegacyAliasKey = (value: string): string => value.trim().toLowerCase();

const resolveLegacyIconAlias = (value: string): string | null => {
    const alias = LEGACY_ICON_ALIASES[normalizeLegacyAliasKey(value)];
    return alias ?? null;
};

const kebabToPascal = (kebabName: string): string => (
    kebabName
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join('')
);

const normalizeCategoryIcon = (rawIcon: unknown): string => {
    if (typeof rawIcon !== 'string') return CATEGORY_ICON_FALLBACK;

    const trimmed = rawIcon.trim();
    if (!trimmed) return CATEGORY_ICON_FALLBACK;

    if (isTextIconName(trimmed)) return trimmed;

    const legacyAlias = resolveLegacyIconAlias(trimmed);
    if (legacyAlias) return legacyAlias;

    if (trimmed.includes('-')) {
        return kebabToPascal(trimmed);
    }

    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
};

type InvalidCategoryIcon = { name: string; icon: string };

const formatInvalidIconNotice = (invalidIcons: InvalidCategoryIcon[]): string => {
    const preview = invalidIcons
        .slice(0, 3)
        .map(({ name, icon }) => `${name}(${icon})`)
        .join('、');
    const suffix = invalidIcons.length > 3 ? ' 等' : '';
    return `检测到 ${invalidIcons.length} 个分类图标不在 Lucide 子集内，已自动替换为 ${CATEGORY_ICON_FALLBACK}：${preview}${suffix}`;
};

const sanitizeCategories = (input: Category[]): { categories: Category[]; didChange: boolean; invalidIcons: InvalidCategoryIcon[] } => {
    let didChange = false;
    const invalidIcons: InvalidCategoryIcon[] = [];

    const sanitized = input.map((category) => {
        const normalizedIcon = normalizeCategoryIcon(category.icon);
        let nextIcon = normalizedIcon;

        if (!isTextIconName(normalizedIcon) && !hasLucideIcon(normalizedIcon)) {
            invalidIcons.push({ name: category.name, icon: normalizedIcon });
            nextIcon = CATEGORY_ICON_FALLBACK;
        }

        if (nextIcon === category.icon) return category;
        didChange = true;
        return { ...category, icon: nextIcon };
    });

    return didChange
        ? { categories: sanitized, didChange, invalidIcons }
        : { categories: input, didChange, invalidIcons };
};

const sanitizeLinks = (input: unknown): { links: LinkItem[]; didChange: boolean; dropped: number; normalized: number } => {
    if (!Array.isArray(input)) {
        return { links: INITIAL_LINKS, didChange: true, dropped: 0, normalized: 0 };
    }

    let didChange = false;
    let dropped = 0;
    let normalized = 0;
    const sanitized: LinkItem[] = [];

    for (const raw of input) {
        if (!raw || typeof raw !== 'object') {
            didChange = true;
            dropped += 1;
            continue;
        }

        const candidate = raw as LinkItem;
        const safeUrl = normalizeHttpUrl(candidate.url);
        if (!safeUrl) {
            didChange = true;
            dropped += 1;
            continue;
        }

        if (safeUrl !== candidate.url) {
            didChange = true;
            normalized += 1;
            sanitized.push({ ...candidate, url: safeUrl });
            continue;
        }

        sanitized.push(candidate);
    }

    return didChange ? { links: sanitized, didChange, dropped, normalized } : { links: input as LinkItem[], didChange, dropped, normalized };
};

export const useDataStore = () => {
    const [links, setLinks] = useState<LinkItem[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [isLoaded, setIsLoaded] = useState(false);
    const { notify } = useDialog();

    // 加载本地图标缓存
    const loadLinkIcons = useCallback((linksToLoad: LinkItem[]) => {
        let cache: Record<string, string> = {};
        try {
            const stored = localStorage.getItem(FAVICON_CACHE_KEY);
            cache = stored ? JSON.parse(stored) : {};
        } catch (e) {
            cache = {};
        }

        if (!cache || Object.keys(cache).length === 0) return;

        const updatedLinks = linksToLoad.map(link => {
            if (!link.url) return link;
            try {
                const safeUrl = normalizeHttpUrl(link.url);
                if (!safeUrl) return link;
                const urlObj = new URL(safeUrl);
                const cachedIcon = cache[urlObj.hostname];
                if (!cachedIcon) return link;
                if (!link.icon || link.icon.includes('faviconextractor.com') || !cachedIcon.includes('faviconextractor.com')) {
                    return { ...link, icon: cachedIcon };
                }
            } catch (e) {
                return link;
            }
            return link;
        });

        setLinks(updatedLinks);
    }, []);

    useEffect(() => {
        const stored = safeLocalStorageGetItem(LOCAL_STORAGE_KEY);
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                let loadedCategories = parsed.categories && parsed.categories.length > 0
                    ? parsed.categories
                    : DEFAULT_CATEGORIES;

                // 如果"常用推荐"分类存在，确保它是第一个分类
                const commonIndex = loadedCategories.findIndex((c: Category) => c.id === 'common');
                if (commonIndex > 0) {
                    const commonCategory = loadedCategories[commonIndex];
                    loadedCategories = [
                        commonCategory,
                        ...loadedCategories.slice(0, commonIndex),
                        ...loadedCategories.slice(commonIndex + 1)
                    ];
                }

                const {
                    categories: sanitizedCategories,
                    didChange: categoriesChanged,
                    invalidIcons
                } = sanitizeCategories(loadedCategories);
                loadedCategories = sanitizedCategories;

                // 检查是否有链接的categoryId不存在于当前分类中，将这些链接移动到默认分类
                const validCategoryIds = new Set(loadedCategories.map((c: Category) => c.id));
                const fallbackCategoryId = loadedCategories.find((c: Category) => c.id === 'common')?.id
                    || loadedCategories[0]?.id;
                let loadedLinks = parsed.links || INITIAL_LINKS;
                const { links: sanitizedLinks, didChange: urlsChanged, dropped: droppedUrls } = sanitizeLinks(loadedLinks);
                loadedLinks = sanitizedLinks;
                let linksChanged = false;
                if (fallbackCategoryId) {
                    loadedLinks = loadedLinks.map((link: LinkItem) => {
                        if (!validCategoryIds.has(link.categoryId)) {
                            linksChanged = true;
                            return { ...link, categoryId: fallbackCategoryId };
                        }
                        return link;
                    });
                }

                setLinks(loadedLinks);
                setCategories(loadedCategories);
                loadLinkIcons(loadedLinks);

                if (invalidIcons.length > 0) {
                    notify(formatInvalidIconNotice(invalidIcons), 'warning');
                }

                if (droppedUrls > 0) {
                    notify(`已移除 ${droppedUrls} 条无效链接（仅支持 http/https）。`, 'warning');
                }

                if (categoriesChanged || linksChanged || urlsChanged) {
                    safeLocalStorageSetItem(LOCAL_STORAGE_KEY, JSON.stringify({ links: loadedLinks, categories: loadedCategories }));
                }
            } catch (e) {
                setLinks(INITIAL_LINKS);
                setCategories(DEFAULT_CATEGORIES);
                loadLinkIcons(INITIAL_LINKS);
            }
        } else {
            setLinks(INITIAL_LINKS);
            setCategories(DEFAULT_CATEGORIES);
            loadLinkIcons(INITIAL_LINKS);
        }
        setIsLoaded(true);
    }, [loadLinkIcons, notify]);

    const updateData = useCallback((newLinks: LinkItem[], newCategories: Category[]) => {
        const { categories: sanitizedCategories } = sanitizeCategories(newCategories);
        const { links: sanitizedLinks } = sanitizeLinks(newLinks);
        // 1. Optimistic UI Update
        setLinks(sanitizedLinks);
        setCategories(sanitizedCategories);

        // 2. Save to Local Cache
        safeLocalStorageSetItem(LOCAL_STORAGE_KEY, JSON.stringify({ links: sanitizedLinks, categories: sanitizedCategories }));
    }, []);

    const addLink = useCallback((data: Omit<LinkItem, 'id' | 'createdAt'>) => {
        const processedUrl = normalizeHttpUrl(data.url);
        if (!processedUrl) {
            notify('链接 URL 无效（仅支持 http/https）。', 'warning');
            return;
        }

        const isRecommended = Boolean(data.recommended);
        const maxRecommendedOrder = links
            .filter(link => link.recommended)
            .reduce((max, link) => Math.max(max, link.recommendedOrder ?? -1), -1);
        const recommendedOrder = isRecommended
            ? (data.recommendedOrder ?? maxRecommendedOrder + 1)
            : undefined;

        const categoryLinks = links.filter(link =>
            !link.pinned && (data.categoryId === 'all' || link.categoryId === data.categoryId)
        );

        const maxOrder = categoryLinks.length > 0
            ? Math.max(...categoryLinks.map(link => link.order || 0))
            : -1;

        const newLink: LinkItem = {
            ...data,
            url: processedUrl,
            id: generateId(),
            createdAt: Date.now(),
            order: maxOrder + 1,
            pinnedOrder: data.pinned ? links.filter(l => l.pinned).length : undefined,
            recommended: isRecommended,
            recommendedOrder
        };

        if (newLink.pinned) {
            const firstNonPinnedIndex = links.findIndex(link => !link.pinned);
            if (firstNonPinnedIndex === -1) {
                updateData([...links, newLink], categories);
            } else {
                const updatedLinks = [...links];
                updatedLinks.splice(firstNonPinnedIndex, 0, newLink);
                updateData(updatedLinks, categories);
            }
        } else {
            const updatedLinks = [...links, newLink].sort((a, b) => {
                if (a.pinned && !b.pinned) return -1;
                if (!a.pinned && b.pinned) return 1;
                const aOrder = a.order !== undefined ? a.order : a.createdAt;
                const bOrder = b.order !== undefined ? b.order : b.createdAt;
                return aOrder - bOrder;
            });
            updateData(updatedLinks, categories);
        }
    }, [links, categories, updateData, notify]);

    const updateLink = useCallback((data: Omit<LinkItem, 'createdAt'>) => {
        const processedUrl = normalizeHttpUrl(data.url);
        if (!processedUrl) {
            notify('链接 URL 无效（仅支持 http/https）。', 'warning');
            return;
        }
        const existing = links.find(l => l.id === data.id);
        if (!existing) return;

        const recommendedProvided = Object.prototype.hasOwnProperty.call(data, 'recommended');
        const nextRecommended = recommendedProvided ? Boolean(data.recommended) : Boolean(existing.recommended);

        const recommendedOrderProvided = Object.prototype.hasOwnProperty.call(data, 'recommendedOrder');
        const nextRecommendedOrderInput = recommendedOrderProvided ? data.recommendedOrder : existing.recommendedOrder;

        let nextRecommendedOrder: number | undefined = nextRecommendedOrderInput;
        if (nextRecommended) {
            if (typeof nextRecommendedOrder !== 'number') {
                const maxRecommendedOrder = links
                    .filter(link => link.id !== data.id && link.recommended)
                    .reduce((max, link) => Math.max(max, link.recommendedOrder ?? -1), -1);
                nextRecommendedOrder = maxRecommendedOrder + 1;
            }
        } else {
            nextRecommendedOrder = undefined;
        }

        const updated = links.map(l => l.id === data.id ? {
            ...l,
            ...data,
            url: processedUrl,
            recommended: nextRecommended,
            recommendedOrder: nextRecommendedOrder
        } : l);
        updateData(updated, categories);
    }, [links, categories, updateData, notify]);

    const deleteLink = useCallback((id: string) => {
        updateData(links.filter(l => l.id !== id), categories);
    }, [links, categories, updateData]);

    const recordAdminLinkClick = useCallback((id: string) => {
        const updatedLinks = links.map(link => {
            if (link.id !== id) return link;
            return {
                ...link,
                adminClicks: (link.adminClicks ?? 0) + 1,
                adminLastClickedAt: Date.now()
            };
        });
        updateData(updatedLinks, categories);
    }, [links, categories, updateData]);

    const togglePin = useCallback((id: string) => {
        const linkToToggle = links.find(l => l.id === id);
        if (!linkToToggle) return;

        const updated = links.map(l => {
            if (l.id === id) {
                const isPinned = !l.pinned;
                return {
                    ...l,
                    pinned: isPinned,
                    pinnedOrder: isPinned ? links.filter(link => link.pinned).length : undefined
                };
            }
            return l;
        });
        updateData(updated, categories);
    }, [links, categories, updateData]);

    const reorderLinks = useCallback((activeId: string, overId: string, selectedCategory: string) => {
        if (activeId === overId) return;

        if (selectedCategory === COMMON_CATEGORY_ID) {
            const commonLinks = getCommonRecommendedLinks(links);
            const activeIndex = commonLinks.findIndex(link => link.id === activeId);
            const overIndex = commonLinks.findIndex(link => link.id === overId);
            if (activeIndex === -1 || overIndex === -1) return;

            const reorderedCommonLinks = arrayMove(commonLinks, activeIndex, overIndex) as LinkItem[];
            const recommendedOrderMap = new Map<string, number>();
            reorderedCommonLinks.forEach((link, index) => {
                recommendedOrderMap.set(link.id, index);
            });

            const updatedLinks = links.map(link => {
                const nextOrder = recommendedOrderMap.get(link.id);
                if (nextOrder === undefined) return link;

                const isAlreadyManual = Boolean(link.recommended) || link.categoryId === COMMON_CATEGORY_ID;
                return {
                    ...link,
                    recommended: isAlreadyManual ? link.recommended : true,
                    recommendedOrder: nextOrder
                };
            });

            updateData(updatedLinks, categories);
            return;
        }

        const getOrderValue = (link: LinkItem) => (
            link.order !== undefined ? link.order : link.createdAt
        );

        const categoryLinks = links
            .filter(link => selectedCategory === 'all' || link.categoryId === selectedCategory)
            .slice()
            .sort((a, b) => getOrderValue(a) - getOrderValue(b));

        const activeIndex = categoryLinks.findIndex(link => link.id === activeId);
        const overIndex = categoryLinks.findIndex(link => link.id === overId);

        if (activeIndex !== -1 && overIndex !== -1) {
            const reorderedCategoryLinks = arrayMove(categoryLinks, activeIndex, overIndex) as LinkItem[];
            const updatedLinks = links.map(link => {
                const reorderedIndex = reorderedCategoryLinks.findIndex(l => l.id === link.id);
                if (reorderedIndex !== -1) {
                    return { ...link, order: reorderedIndex };
                }
                return link;
            });
            updatedLinks.sort((a, b) => getOrderValue(a) - getOrderValue(b));
            updateData(updatedLinks, categories);
        }
    }, [links, categories, updateData]);

    const reorderPinnedLinks = useCallback((activeId: string, overId: string) => {
        if (activeId === overId) return;

        const pinnedLinksList = links
            .filter(link => link.pinned)
            .slice()
            .sort((a, b) => {
                if (a.pinnedOrder !== undefined && b.pinnedOrder !== undefined) {
                    return a.pinnedOrder - b.pinnedOrder;
                }
                if (a.pinnedOrder !== undefined) return -1;
                if (b.pinnedOrder !== undefined) return 1;
                return a.createdAt - b.createdAt;
            });
        const activeIndex = pinnedLinksList.findIndex(link => link.id === activeId);
        const overIndex = pinnedLinksList.findIndex(link => link.id === overId);

        if (activeIndex !== -1 && overIndex !== -1) {
            const reorderedPinnedLinks = arrayMove(pinnedLinksList, activeIndex, overIndex) as LinkItem[];
            const pinnedOrderMap = new Map<string, number>();
            reorderedPinnedLinks.forEach((link, index) => {
                pinnedOrderMap.set(link.id, index);
            });

            const updatedLinks = links.map(link => {
                if (link.pinned) {
                    return { ...link, pinnedOrder: pinnedOrderMap.get(link.id) };
                }
                return link;
            });

            updatedLinks.sort((a, b) => {
                if (a.pinned && b.pinned) {
                    return (a.pinnedOrder || 0) - (b.pinnedOrder || 0);
                }
                if (a.pinned) return -1;
                if (b.pinned) return 1;
                const aOrder = a.order !== undefined ? a.order : a.createdAt;
                const bOrder = b.order !== undefined ? b.order : b.createdAt;
                return bOrder - aOrder;
            });
            updateData(updatedLinks, categories);
        }
    }, [links, categories, updateData]);

    const deleteCategory = useCallback((catId: string) => {
        if (categories.length <= 1) {
            notify('至少保留一个分类', 'warning');
            return;
        }
        const newCats = categories.filter(c => c.id !== catId);
        if (newCats.length === categories.length) return;
        const fallbackCategory = newCats.find(c => c.id === 'common') || newCats[0];
        const newLinks = links.map(l => l.categoryId === catId ? { ...l, categoryId: fallbackCategory.id } : l);
        updateData(newLinks, newCats);
    }, [links, categories, updateData]);

    const importData = useCallback((newLinks: LinkItem[], newCategories: Category[]) => {
        const mergedCategories = [...categories];
        newCategories.forEach(nc => {
            if (!mergedCategories.some(c => c.id === nc.id || c.name === nc.name)) {
                mergedCategories.push(nc);
            }
        });
        const mergedLinks = [...links, ...newLinks];
        updateData(mergedLinks, mergedCategories);
    }, [links, categories, updateData]);

    return {
        links,
        categories,
        setLinks,
        setCategories,
        updateData,
        isLoaded,
        addLink,
        updateLink,
        deleteLink,
        recordAdminLinkClick,
        togglePin,
        reorderLinks,
        reorderPinnedLinks,
        deleteCategory,
        importData
    };
};
