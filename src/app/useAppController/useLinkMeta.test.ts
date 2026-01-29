import { describe, expect, it } from 'vitest';
import type { Category, LinkItem } from '../../types';
import { collectExistingTags, computeLinkCounts } from './useLinkMeta';

describe('useLinkMeta helpers', () => {
  it('computes category and pinned counts and overwrites common count', () => {
    const categories: Category[] = [
      { id: 'common', name: '常用推荐', icon: 'Star' },
      { id: 'dev', name: '开发工具', icon: 'Code' },
      { id: 'read', name: '阅读资讯', icon: 'BookOpen' },
    ];

    const links: LinkItem[] = [
      { id: '1', title: 'A', url: 'https://a.com', categoryId: 'dev', createdAt: 1, pinned: true },
      { id: '2', title: 'B', url: 'https://b.com', categoryId: 'dev', createdAt: 2 },
      { id: '3', title: 'C', url: 'https://c.com', categoryId: 'common', createdAt: 3 },
      { id: '4', title: 'D', url: 'https://d.com', categoryId: 'unknown', createdAt: 4 },
    ];

    const counts = computeLinkCounts({ links, categories, commonRecommendedLinksCount: 5 });
    expect(counts.dev).toBe(2);
    expect(counts.read).toBe(0);
    expect(counts.unknown).toBe(1);
    expect(counts.pinned).toBe(1);
    expect(counts.common).toBe(5);
  });

  it('collects and trims existing tags', () => {
    const links: LinkItem[] = [
      {
        id: '1',
        title: 'A',
        url: 'https://a.com',
        categoryId: 'dev',
        createdAt: 1,
        tags: [' b', 'a', 'a', ''],
      },
      {
        id: '2',
        title: 'B',
        url: 'https://b.com',
        categoryId: 'dev',
        createdAt: 2,
        tags: ['b', '  '],
      },
    ];

    expect(collectExistingTags(links)).toEqual(['a', 'b']);
  });
});
