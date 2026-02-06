import { useMemo } from 'react';
import type { Category, LinkItem, SearchMode } from '../../types';
import { COMMON_CATEGORY_ID, PRIVATE_CATEGORY_ID } from '../../utils/constants';
import { getCommonRecommendedLinks } from '../../utils/recommendation';

export const sortPinnedLinks = (links: LinkItem[]) =>
  links
    .filter((l) => l.pinned)
    .sort((a, b) => {
      if (a.pinnedOrder !== undefined && b.pinnedOrder !== undefined) {
        return a.pinnedOrder - b.pinnedOrder;
      }
      if (a.pinnedOrder !== undefined) return -1;
      if (b.pinnedOrder !== undefined) return 1;
      return a.createdAt - b.createdAt;
    });

/** Pre-build lowercased search text for a link (fields joined by \0 to prevent cross-field matches) */
const buildSearchText = (l: LinkItem): string =>
  [l.title, l.url, l.description || '', ...(Array.isArray(l.tags) ? l.tags : [])]
    .join('\0')
    .toLowerCase();

export const computeDisplayedLinks = (args: {
  links: LinkItem[];
  categories: Category[];
  commonRecommendedLinks: LinkItem[];
  privateLinks: LinkItem[];
  selectedCategory: string;
  searchQuery: string;
  searchMode: SearchMode;
  isAdmin: boolean;
  privacyGroupEnabled: boolean;
  privacyPasswordEnabled: boolean;
  isPrivateUnlocked: boolean;
}) => {
  const q = args.searchQuery.trim().toLowerCase();

  // 站内搜索模式且有搜索词时，搜索全站资源
  const isInternalSearchWithQuery = args.searchMode === 'internal' && q;

  // 管理员模式 + 隐私分组启用 + 密码保护关闭 + 已解锁 → 站内搜索包含隐私分组
  const canSearchPrivate =
    args.isAdmin &&
    args.privacyGroupEnabled &&
    !args.privacyPasswordEnabled &&
    args.isPrivateUnlocked;

  // 获取隐藏分类的ID集合（非管理员模式需要过滤）
  const hiddenCategoryIds = args.isAdmin
    ? new Set<string>()
    : new Set(args.categories.filter((c) => c.hidden).map((c) => c.id));

  // 过滤掉隐藏分类的链接（非管理员模式）
  const visibleLinks = args.isAdmin
    ? args.links
    : args.links.filter((l) => !hiddenCategoryIds.has(l.categoryId));

  // 过滤常用推荐链接（非管理员模式）
  const visibleCommonRecommendedLinks = args.isAdmin
    ? args.commonRecommendedLinks
    : args.commonRecommendedLinks.filter((l) => !hiddenCategoryIds.has(l.categoryId));

  const baseLinks =
    args.selectedCategory === COMMON_CATEGORY_ID ? visibleCommonRecommendedLinks : visibleLinks;

  let result = baseLinks;

  // Search Filter
  if (q) {
    // 站内搜索时搜索全站资源，符合条件时包含隐私分组
    let searchBase = isInternalSearchWithQuery ? visibleLinks : baseLinks;
    if (isInternalSearchWithQuery && canSearchPrivate) {
      searchBase = [...visibleLinks, ...args.privateLinks];
    }
    result = searchBase.filter(
      (l) =>
        l.title.toLowerCase().includes(q) ||
        l.url.toLowerCase().includes(q) ||
        (l.description && l.description.toLowerCase().includes(q)) ||
        (Array.isArray(l.tags) && l.tags.some((tag) => tag.toLowerCase().includes(q))),
    );
  }

  // Category Filter (exclude common：常用推荐为"叠加集合"，不走 categoryId 过滤)
  // 站内搜索模式下不过滤分类，显示全站搜索结果
  if (
    !isInternalSearchWithQuery &&
    args.selectedCategory !== 'all' &&
    args.selectedCategory !== PRIVATE_CATEGORY_ID &&
    args.selectedCategory !== COMMON_CATEGORY_ID
  ) {
    result = result.filter((l) => l.categoryId === args.selectedCategory);
  }

  if (args.selectedCategory === COMMON_CATEGORY_ID && !isInternalSearchWithQuery) {
    // 常用推荐已在 getCommonRecommendedLinks 内完成排序
    return result;
  }

  // Sort by order
  return result.slice().sort((a, b) => {
    const aOrder = a.order !== undefined ? a.order : a.createdAt;
    const bOrder = b.order !== undefined ? b.order : b.createdAt;
    return aOrder - bOrder;
  });
};

export const computeDisplayedPrivateLinks = (args: {
  privateLinks: LinkItem[];
  searchQuery: string;
}) => {
  let result = args.privateLinks;

  if (args.searchQuery.trim()) {
    const q = args.searchQuery.toLowerCase();
    result = result.filter(
      (l) =>
        l.title.toLowerCase().includes(q) ||
        l.url.toLowerCase().includes(q) ||
        (l.description && l.description.toLowerCase().includes(q)) ||
        (Array.isArray(l.tags) && l.tags.some((tag) => tag.toLowerCase().includes(q))),
    );
  }

  return result.slice().sort((a, b) => {
    const aOrder = a.order !== undefined ? a.order : a.createdAt;
    const bOrder = b.order !== undefined ? b.order : b.createdAt;
    return aOrder - bOrder;
  });
};

export const useDisplayedLinks = (args: {
  links: LinkItem[];
  categories: Category[];
  privateLinks: LinkItem[];
  selectedCategory: string;
  searchQuery: string;
  searchMode: SearchMode;
  isAdmin: boolean;
  privacyGroupEnabled: boolean;
  privacyPasswordEnabled: boolean;
  isPrivateUnlocked: boolean;
}) => {
  // 获取隐藏分类的ID集合（非管理员模式需要过滤）
  const hiddenCategoryIds = useMemo(
    () =>
      args.isAdmin
        ? new Set<string>()
        : new Set(args.categories.filter((c) => c.hidden).map((c) => c.id)),
    [args.isAdmin, args.categories],
  );

  // 过滤掉隐藏分类的链接用于置顶（非管理员模式）
  const visibleLinks = useMemo(
    () =>
      args.isAdmin ? args.links : args.links.filter((l) => !hiddenCategoryIds.has(l.categoryId)),
    [args.isAdmin, args.links, hiddenCategoryIds],
  );

  const pinnedLinks = useMemo(() => sortPinnedLinks(visibleLinks), [visibleLinks]);

  const commonRecommendedLinks = useMemo(() => getCommonRecommendedLinks(args.links), [args.links]);

  // Pre-compute visible common recommended links (non-admin filters out hidden categories)
  const visibleCommonRecommendedLinks = useMemo(
    () =>
      args.isAdmin
        ? commonRecommendedLinks
        : commonRecommendedLinks.filter((l) => !hiddenCategoryIds.has(l.categoryId)),
    [args.isAdmin, commonRecommendedLinks, hiddenCategoryIds],
  );

  // Pre-compute search index: id -> lowercased search text
  // Only recomputes when links/privateLinks change, NOT on every searchQuery keystroke
  const searchIndex = useMemo(() => {
    const index = new Map<string, string>();
    for (const l of args.links) {
      index.set(l.id, buildSearchText(l));
    }
    for (const l of args.privateLinks) {
      if (!index.has(l.id)) {
        index.set(l.id, buildSearchText(l));
      }
    }
    return index;
  }, [args.links, args.privateLinks]);

  // Optimized: use pre-computed visibleLinks, visibleCommonRecommendedLinks, and searchIndex
  // This avoids redundant computation when searchQuery changes
  const displayedLinks = useMemo(() => {
    const q = args.searchQuery.trim().toLowerCase();
    const isInternalSearchWithQuery = args.searchMode === 'internal' && q;
    const canSearchPrivate =
      args.isAdmin &&
      args.privacyGroupEnabled &&
      !args.privacyPasswordEnabled &&
      args.isPrivateUnlocked;

    const baseLinks =
      args.selectedCategory === COMMON_CATEGORY_ID ? visibleCommonRecommendedLinks : visibleLinks;

    let result = baseLinks;

    if (q) {
      let searchBase = isInternalSearchWithQuery ? visibleLinks : baseLinks;
      if (isInternalSearchWithQuery && canSearchPrivate) {
        searchBase = [...visibleLinks, ...args.privateLinks];
      }
      // Use pre-indexed search text instead of repeated toLowerCase() calls
      result = searchBase.filter((l) => {
        const text = searchIndex.get(l.id);
        return text != null && text.includes(q);
      });
    }

    // Category Filter (exclude common: 常用推荐为"叠加集合"，不走 categoryId 过滤)
    if (
      !isInternalSearchWithQuery &&
      args.selectedCategory !== 'all' &&
      args.selectedCategory !== PRIVATE_CATEGORY_ID &&
      args.selectedCategory !== COMMON_CATEGORY_ID
    ) {
      result = result.filter((l) => l.categoryId === args.selectedCategory);
    }

    if (args.selectedCategory === COMMON_CATEGORY_ID && !isInternalSearchWithQuery) {
      return result;
    }

    return result.slice().sort((a, b) => {
      const aOrder = a.order !== undefined ? a.order : a.createdAt;
      const bOrder = b.order !== undefined ? b.order : b.createdAt;
      return aOrder - bOrder;
    });
  }, [
    args.searchQuery,
    args.searchMode,
    args.selectedCategory,
    args.isAdmin,
    args.privacyGroupEnabled,
    args.privacyPasswordEnabled,
    args.isPrivateUnlocked,
    args.privateLinks,
    visibleLinks,
    visibleCommonRecommendedLinks,
    searchIndex,
  ]);

  // Optimized: use pre-indexed search text for private links
  const displayedPrivateLinks = useMemo(() => {
    let result = args.privateLinks;
    const q = args.searchQuery.trim().toLowerCase();

    if (q) {
      result = result.filter((l) => {
        const text = searchIndex.get(l.id);
        return text != null && text.includes(q);
      });
    }

    return result.slice().sort((a, b) => {
      const aOrder = a.order !== undefined ? a.order : a.createdAt;
      const bOrder = b.order !== undefined ? b.order : b.createdAt;
      return aOrder - bOrder;
    });
  }, [args.privateLinks, args.searchQuery, searchIndex]);

  const isPrivateView = args.selectedCategory === PRIVATE_CATEGORY_ID;
  const activeDisplayedLinks = isPrivateView ? displayedPrivateLinks : displayedLinks;

  return {
    pinnedLinks,
    commonRecommendedLinks,
    displayedLinks,
    displayedPrivateLinks,
    activeDisplayedLinks,
  };
};
