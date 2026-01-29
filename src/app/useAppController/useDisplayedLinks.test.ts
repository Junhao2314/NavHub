import { describe, expect, it } from 'vitest';
import type { Category, LinkItem } from '../../types';
import { COMMON_CATEGORY_ID } from '../../utils/constants';
import { computeDisplayedLinks, sortPinnedLinks } from './useDisplayedLinks';

const defaultCategories: Category[] = [
  { id: 'dev', name: '开发工具', icon: 'Code' },
  { id: 'read', name: '阅读资讯', icon: 'BookOpen' },
];

describe('useDisplayedLinks helpers', () => {
  it('sorts pinned links by pinnedOrder then createdAt', () => {
    const links: LinkItem[] = [
      {
        id: 'a',
        title: 'A',
        url: 'https://a.com',
        categoryId: 'dev',
        createdAt: 10,
        pinned: true,
        pinnedOrder: 2,
      },
      {
        id: 'b',
        title: 'B',
        url: 'https://b.com',
        categoryId: 'dev',
        createdAt: 5,
        pinned: true,
        pinnedOrder: 1,
      },
      { id: 'c', title: 'C', url: 'https://c.com', categoryId: 'dev', createdAt: 1, pinned: true },
      { id: 'd', title: 'D', url: 'https://d.com', categoryId: 'dev', createdAt: 2, pinned: true },
      { id: 'e', title: 'E', url: 'https://e.com', categoryId: 'dev', createdAt: 3, pinned: false },
    ];

    const sorted = sortPinnedLinks(links);
    expect(sorted.map((l) => l.id)).toEqual(['b', 'a', 'c', 'd']);
  });

  it('returns common recommended links unchanged when viewing common category with no internal query', () => {
    const commonRecommendedLinks: LinkItem[] = [
      {
        id: 'r1',
        title: 'R1',
        url: 'https://r1.com',
        categoryId: 'dev',
        createdAt: 1,
        pinned: false,
      },
    ];

    const result = computeDisplayedLinks({
      links: [
        {
          id: 'x',
          title: 'X',
          url: 'https://x.com',
          categoryId: 'dev',
          createdAt: 1,
          pinned: false,
        },
      ],
      categories: defaultCategories,
      commonRecommendedLinks,
      privateLinks: [],
      selectedCategory: COMMON_CATEGORY_ID,
      searchQuery: '',
      searchMode: 'internal',
      isAdmin: true,
      privacyGroupEnabled: false,
      privacyPasswordEnabled: true,
      isPrivateUnlocked: false,
    });

    expect(result).toEqual(commonRecommendedLinks);
  });

  it('internal search can include private links when allowed', () => {
    const result = computeDisplayedLinks({
      links: [
        {
          id: 'pub',
          title: 'Hello',
          url: 'https://pub.com',
          categoryId: 'dev',
          createdAt: 1,
          pinned: false,
        },
      ],
      categories: defaultCategories,
      commonRecommendedLinks: [],
      privateLinks: [
        {
          id: 'priv',
          title: 'Hello Secret',
          url: 'https://priv.com',
          categoryId: 'private',
          createdAt: 2,
          pinned: false,
        },
      ],
      selectedCategory: 'all',
      searchQuery: 'hello',
      searchMode: 'internal',
      isAdmin: true,
      privacyGroupEnabled: true,
      privacyPasswordEnabled: false,
      isPrivateUnlocked: true,
    });

    expect(result.map((l) => l.id).sort()).toEqual(['priv', 'pub']);
  });

  it('applies category filter when not in internal search with query', () => {
    const result = computeDisplayedLinks({
      links: [
        {
          id: 'a',
          title: 'A',
          url: 'https://a.com',
          categoryId: 'dev',
          createdAt: 1,
          pinned: false,
        },
        {
          id: 'b',
          title: 'B',
          url: 'https://b.com',
          categoryId: 'read',
          createdAt: 2,
          pinned: false,
        },
      ],
      categories: defaultCategories,
      commonRecommendedLinks: [],
      privateLinks: [],
      selectedCategory: 'dev',
      searchQuery: '',
      searchMode: 'internal',
      isAdmin: true,
      privacyGroupEnabled: false,
      privacyPasswordEnabled: true,
      isPrivateUnlocked: false,
    });

    expect(result.map((l) => l.id)).toEqual(['a']);
  });

  it('filters out hidden category links in user mode', () => {
    const categoriesWithHidden: Category[] = [
      { id: 'dev', name: '开发工具', icon: 'Code' },
      { id: 'secret', name: '秘密分类', icon: 'Lock', hidden: true },
    ];

    const result = computeDisplayedLinks({
      links: [
        {
          id: 'a',
          title: 'A',
          url: 'https://a.com',
          categoryId: 'dev',
          createdAt: 1,
          pinned: false,
        },
        {
          id: 'b',
          title: 'B',
          url: 'https://b.com',
          categoryId: 'secret',
          createdAt: 2,
          pinned: false,
        },
      ],
      categories: categoriesWithHidden,
      commonRecommendedLinks: [],
      privateLinks: [],
      selectedCategory: 'all',
      searchQuery: '',
      searchMode: 'internal',
      isAdmin: false,
      privacyGroupEnabled: false,
      privacyPasswordEnabled: true,
      isPrivateUnlocked: false,
    });

    expect(result.map((l) => l.id)).toEqual(['a']);
  });

  it('shows hidden category links in admin mode', () => {
    const categoriesWithHidden: Category[] = [
      { id: 'dev', name: '开发工具', icon: 'Code' },
      { id: 'secret', name: '秘密分类', icon: 'Lock', hidden: true },
    ];

    const result = computeDisplayedLinks({
      links: [
        {
          id: 'a',
          title: 'A',
          url: 'https://a.com',
          categoryId: 'dev',
          createdAt: 1,
          pinned: false,
        },
        {
          id: 'b',
          title: 'B',
          url: 'https://b.com',
          categoryId: 'secret',
          createdAt: 2,
          pinned: false,
        },
      ],
      categories: categoriesWithHidden,
      commonRecommendedLinks: [],
      privateLinks: [],
      selectedCategory: 'all',
      searchQuery: '',
      searchMode: 'internal',
      isAdmin: true,
      privacyGroupEnabled: false,
      privacyPasswordEnabled: true,
      isPrivateUnlocked: false,
    });

    expect(result.map((l) => l.id)).toEqual(['a', 'b']);
  });
});
