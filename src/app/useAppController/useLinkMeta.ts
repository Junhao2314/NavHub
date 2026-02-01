import { useMemo } from 'react';
import type { Category, LinkItem } from '../../types';
import { COMMON_CATEGORY_ID } from '../../utils/constants';

export const computeLinkCounts = (args: {
  links: LinkItem[];
  categories: Category[];
  commonRecommendedLinksCount: number;
}) => {
  const counts: Record<string, number> = {};

  // Initialize all categories with 0
  args.categories.forEach((cat) => {
    counts[cat.id] = 0;
  });
  counts.pinned = 0;

  args.links.forEach((link) => {
    // Count by category
    if (counts[link.categoryId] !== undefined) {
      counts[link.categoryId]++;
    } else {
      // Fallback for unknown categories, though shouldn't happen
      counts[link.categoryId] = 1;
    }

    // Count pinned
    if (link.pinned) {
      counts.pinned++;
    }
  });

  counts[COMMON_CATEGORY_ID] = args.commonRecommendedLinksCount;
  return counts;
};

export const collectExistingTags = (links: LinkItem[]) => {
  const tagSet = new Set<string>();
  links.forEach((link) => {
    if (Array.isArray(link.tags)) {
      link.tags.forEach((tag) => {
        if (tag && tag.trim()) {
          tagSet.add(tag.trim());
        }
      });
    }
  });
  return Array.from(tagSet).sort((a, b) => a.localeCompare(b, 'zh-CN'));
};

export const useLinkMeta = (args: {
  links: LinkItem[];
  categories: Category[];
  commonRecommendedLinksCount: number;
}) => {
  const { links, categories, commonRecommendedLinksCount } = args;

  const linkCounts = useMemo(
    () => computeLinkCounts({ links, categories, commonRecommendedLinksCount }),
    [links, categories, commonRecommendedLinksCount],
  );

  const existingTags = useMemo(() => collectExistingTags(links), [links]);

  return { linkCounts, existingTags };
};
