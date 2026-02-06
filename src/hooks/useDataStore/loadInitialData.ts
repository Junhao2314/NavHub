import type { Category, LinkItem } from '../../types';
import { COMMON_CATEGORY_ID } from '../../utils/constants';
import { type InvalidCategoryIcon, sanitizeCategories, sanitizeLinks } from '../../utils/sanitize';
import { hydrateLinksWithFaviconCache } from './faviconCache';

export type LoadInitialDataResult = {
  links: LinkItem[];
  categories: Category[];
  shouldPersist: boolean;
  persistedLinks: LinkItem[];
  persistedCategories: Category[];
  droppedUrls: number;
  invalidIcons: InvalidCategoryIcon[];
};

export function loadInitialData(options: {
  stored: string | null;
  seedCategories: Category[];
  seedLinks: LinkItem[];
  faviconCache: Record<string, string>;
}): LoadInitialDataResult {
  const { stored, seedCategories, seedLinks, faviconCache } = options;

  if (!stored) {
    return {
      links: hydrateLinksWithFaviconCache(seedLinks, faviconCache),
      categories: seedCategories,
      shouldPersist: false,
      persistedLinks: seedLinks,
      persistedCategories: seedCategories,
      droppedUrls: 0,
      invalidIcons: [],
    };
  }

  try {
    const parsed: unknown = JSON.parse(stored);
    const record = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};

    let categoriesChanged = false;

    let loadedCategories =
      Array.isArray(record.categories) && record.categories.length > 0
        ? (record.categories as Category[])
        : seedCategories;

    // 如果"常用推荐"分类存在，确保它是第一个分类
    const commonIndex = loadedCategories.findIndex((c: Category) => c.id === COMMON_CATEGORY_ID);
    if (commonIndex > 0) {
      const commonCategory = loadedCategories[commonIndex];
      loadedCategories = [
        commonCategory,
        ...loadedCategories.slice(0, commonIndex),
        ...loadedCategories.slice(commonIndex + 1),
      ];
      categoriesChanged = true;
    }

    const {
      categories: sanitizedCategories,
      didChange: categoriesChangedRaw,
      invalidIcons,
    } = sanitizeCategories(loadedCategories);
    if (categoriesChangedRaw) {
      categoriesChanged = true;
    }
    loadedCategories = sanitizedCategories;

    // 检查是否有链接的categoryId不存在于当前分类中，将这些链接移动到默认分类
    const validCategoryIds = new Set(loadedCategories.map((c: Category) => c.id));
    const fallbackCategoryId =
      loadedCategories.find((c: Category) => c.id === COMMON_CATEGORY_ID)?.id ||
      loadedCategories[0]?.id;

    let loadedLinks = Array.isArray(record.links) ? (record.links as LinkItem[]) : seedLinks;
    const { links: sanitizedLinks, didChange: urlsChanged, dropped } = sanitizeLinks(loadedLinks);
    const droppedUrls = dropped;
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

    const shouldPersist = categoriesChanged || linksChanged || urlsChanged;

    return {
      links: hydrateLinksWithFaviconCache(loadedLinks, faviconCache),
      categories: loadedCategories,
      shouldPersist,
      persistedLinks: loadedLinks,
      persistedCategories: loadedCategories,
      droppedUrls,
      invalidIcons,
    };
  } catch {
    return {
      links: hydrateLinksWithFaviconCache(seedLinks, faviconCache),
      categories: seedCategories,
      shouldPersist: false,
      persistedLinks: seedLinks,
      persistedCategories: seedCategories,
      droppedUrls: 0,
      invalidIcons: [],
    };
  }
}
