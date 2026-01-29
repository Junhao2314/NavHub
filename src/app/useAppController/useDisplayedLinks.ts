import { useMemo } from 'react';
import type { LinkItem, SearchMode } from '../../types';
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

export const computeDisplayedLinks = (args: {
  links: LinkItem[];
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

  const baseLinks =
    args.selectedCategory === COMMON_CATEGORY_ID ? args.commonRecommendedLinks : args.links;

  let result = baseLinks;

  // Search Filter
  if (q) {
    // 站内搜索时搜索全站资源，符合条件时包含隐私分组
    let searchBase = isInternalSearchWithQuery ? args.links : baseLinks;
    if (isInternalSearchWithQuery && canSearchPrivate) {
      searchBase = [...args.links, ...args.privateLinks];
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
  privateLinks: LinkItem[];
  selectedCategory: string;
  searchQuery: string;
  searchMode: SearchMode;
  isAdmin: boolean;
  privacyGroupEnabled: boolean;
  privacyPasswordEnabled: boolean;
  isPrivateUnlocked: boolean;
}) => {
  const pinnedLinks = useMemo(() => sortPinnedLinks(args.links), [args.links]);

  const commonRecommendedLinks = useMemo(() => getCommonRecommendedLinks(args.links), [args.links]);

  const displayedLinks = useMemo(
    () =>
      computeDisplayedLinks({
        links: args.links,
        commonRecommendedLinks,
        privateLinks: args.privateLinks,
        selectedCategory: args.selectedCategory,
        searchQuery: args.searchQuery,
        searchMode: args.searchMode,
        isAdmin: args.isAdmin,
        privacyGroupEnabled: args.privacyGroupEnabled,
        privacyPasswordEnabled: args.privacyPasswordEnabled,
        isPrivateUnlocked: args.isPrivateUnlocked,
      }),
    [
      args.links,
      args.privateLinks,
      args.selectedCategory,
      args.searchQuery,
      args.searchMode,
      args.isAdmin,
      args.privacyGroupEnabled,
      args.privacyPasswordEnabled,
      args.isPrivateUnlocked,
      commonRecommendedLinks,
    ],
  );

  const displayedPrivateLinks = useMemo(
    () =>
      computeDisplayedPrivateLinks({
        privateLinks: args.privateLinks,
        searchQuery: args.searchQuery,
      }),
    [args.privateLinks, args.searchQuery],
  );

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
