import { describe, expect, it } from 'vitest';
import type { Category, LinkItem } from '../types';
import { generateBookmarkHtml } from './exportService';

describe('generateBookmarkHtml', () => {
  it('escapes href and icon attributes to prevent attribute injection', () => {
    const categories: Category[] = [{ id: 'c', name: 'Cat', icon: 'Star' }];
    const url = 'https://example.com" onmouseover="alert(1)';
    const icon = 'https://icons.example.com/favicon.ico" onerror="alert(2)';
    const links: LinkItem[] = [
      { id: '1', title: 'T', url, icon, categoryId: 'c', createdAt: 1000 },
    ];

    const html = generateBookmarkHtml(links, categories);
    const doc = new DOMParser().parseFromString(html, 'text/html');

    const anchors = Array.from(doc.querySelectorAll('a'));
    expect(anchors).toHaveLength(1);

    const anchor = anchors[0];
    expect(anchor.getAttribute('href')).toBe(url);
    expect(anchor.getAttribute('onmouseover')).toBeNull();
    expect(anchor.getAttribute('icon')).toBe(icon);
    expect(anchor.getAttribute('onerror')).toBeNull();
  });

  it('prevents markup injection via malicious href values', () => {
    const categories: Category[] = [{ id: 'c', name: 'Cat', icon: 'Star' }];
    const url =
      'https://example.com/"><script id="pwn">alert(1)</script><a href="https://safe.example.com';
    const links: LinkItem[] = [{ id: '1', title: 'T', url, categoryId: 'c', createdAt: 1000 }];

    const html = generateBookmarkHtml(links, categories);
    const doc = new DOMParser().parseFromString(html, 'text/html');

    expect(doc.querySelector('script')).toBeNull();
    expect(doc.querySelectorAll('a')).toHaveLength(1);
    expect(doc.querySelector('a')?.getAttribute('href')).toBe(url);
  });

  it('escapes href values for uncategorized links', () => {
    const url = 'https://uncat.example/" onclick="alert(1)';
    const links: LinkItem[] = [
      { id: '1', title: 'T', url, categoryId: 'missing', createdAt: 1000 },
    ];

    const html = generateBookmarkHtml(links, []);
    const doc = new DOMParser().parseFromString(html, 'text/html');

    expect(doc.querySelectorAll('a')).toHaveLength(1);
    expect(doc.querySelector('a')?.getAttribute('href')).toBe(url);
    expect(doc.querySelector('a')?.getAttribute('onclick')).toBeNull();
  });
});
