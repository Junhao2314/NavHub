import { describe, expect, it } from 'vitest';
import { parsePlainPrivateVault } from './privateVault';

describe('parsePlainPrivateVault', () => {
  it('parses plaintext vault payload with links array', () => {
    const payload = {
      links: [{ id: '1', title: 't', url: 'https://example.com', categoryId: 'c', createdAt: 1 }],
    };

    expect(parsePlainPrivateVault(JSON.stringify(payload))).toEqual(payload);
  });

  it('parses legacy plaintext array as links', () => {
    const links = [
      { id: '1', title: 't', url: 'https://example.com', categoryId: 'c', createdAt: 1 },
    ];
    expect(parsePlainPrivateVault(JSON.stringify(links))).toEqual({ links });
  });

  it('filters invalid link items and coerces numeric fields', () => {
    const payload = {
      links: [
        { id: '1', title: 't', url: 'https://example.com', categoryId: 'c', createdAt: 1 },
        { nope: true },
        'not-an-object',
        null,
        123,
        false,
        [],
        {
          id: 'nested',
          title: { text: 'nope' },
          url: 'https://example.com/nested',
          categoryId: 'c',
          createdAt: 1,
        },
        { id: '2', title: 't2', url: 'https://example.com/2', categoryId: 'c', createdAt: '2' },
        { id: '3', title: 't3', url: 'https://example.com/3', categoryId: 'c', createdAt: 'nope' },
      ],
    };

    expect(parsePlainPrivateVault(JSON.stringify(payload))).toEqual({
      links: [
        { id: '1', title: 't', url: 'https://example.com', categoryId: 'c', createdAt: 1 },
        { id: '2', title: 't2', url: 'https://example.com/2', categoryId: 'c', createdAt: 2 },
      ],
    });
  });

  it('handles nested objects and sanitizes optional fields', () => {
    const payload = {
      links: [
        {
          id: '1',
          title: 't',
          url: 'https://example.com',
          categoryId: 'c',
          createdAt: 1,
          icon: { href: 'nope' },
          description: { text: 'nope' },
          tags: ['tag', 1, { nope: true }, ['nested']],
          pinned: 'true',
          extra: { nested: { value: 1 } },
        },
      ],
    };

    expect(parsePlainPrivateVault(JSON.stringify(payload))).toEqual({
      links: [
        {
          id: '1',
          title: 't',
          url: 'https://example.com',
          categoryId: 'c',
          createdAt: 1,
          tags: ['tag'],
        },
      ],
    });
  });

  it('parses very large links arrays', () => {
    const links = Array.from({ length: 10000 }, (_, index) => ({
      id: String(index),
      title: `t${index}`,
      url: `https://example.com/${index}`,
      categoryId: 'c',
      createdAt: index,
    }));

    const parsed = parsePlainPrivateVault(JSON.stringify({ links }));

    expect(parsed).not.toBeNull();
    expect(parsed?.links.length).toBe(10000);
    expect(parsed?.links[0]).toEqual(links[0]);
    expect(parsed?.links[9999]).toEqual(links[9999]);
  });

  it('returns null for invalid JSON', () => {
    expect(parsePlainPrivateVault('{not-json')).toBeNull();
  });

  it('returns null for non-links payload', () => {
    expect(parsePlainPrivateVault(JSON.stringify({ nope: true }))).toBeNull();
    expect(parsePlainPrivateVault(JSON.stringify({ links: 'nope' }))).toBeNull();
  });
});
