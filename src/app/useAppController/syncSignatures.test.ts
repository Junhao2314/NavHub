import { describe, expect, it } from 'vitest';
import {
  buildSyncBusinessSignature,
  buildSyncFullSignature,
  type SyncPayload,
} from './syncSignatures';

describe('syncSignatures', () => {
  const categories: SyncPayload['categories'] = [{ id: 'c1', name: 'Cat', icon: 'Star' }];
  const baseLink: SyncPayload['links'][number] = {
    id: 'l1',
    title: 'Title',
    url: 'https://example.com',
    categoryId: 'c1',
    createdAt: 1000,
    adminClicks: 1,
    adminLastClickedAt: 2000,
  };

  it('business signature ignores click stats changes', () => {
    const payloadA: SyncPayload = { links: [baseLink], categories };
    const payloadB: SyncPayload = {
      ...payloadA,
      links: [{ ...baseLink, adminClicks: 2, adminLastClickedAt: 3000 }],
    };

    expect(buildSyncBusinessSignature(payloadA)).toBe(buildSyncBusinessSignature(payloadB));
    expect(buildSyncFullSignature(payloadA)).not.toBe(buildSyncFullSignature(payloadB));
  });

  it('signatures ignore encryptedSensitiveConfig changes', () => {
    const payloadA: SyncPayload = {
      links: [baseLink],
      categories,
      encryptedSensitiveConfig: 'enc-a',
    };
    const payloadB: SyncPayload = {
      ...payloadA,
      encryptedSensitiveConfig: 'enc-b',
    };

    expect(buildSyncBusinessSignature(payloadA)).toBe(buildSyncBusinessSignature(payloadB));
    expect(buildSyncFullSignature(payloadA)).toBe(buildSyncFullSignature(payloadB));
  });

  it('signatures ignore schemaVersion changes', () => {
    const payloadA: SyncPayload = { links: [baseLink], categories, schemaVersion: 1 };
    const payloadB: SyncPayload = { ...payloadA, schemaVersion: 999 };

    expect(buildSyncBusinessSignature(payloadA)).toBe(buildSyncBusinessSignature(payloadB));
    expect(buildSyncFullSignature(payloadA)).toBe(buildSyncFullSignature(payloadB));
  });

  it('business signature changes when business fields change', () => {
    const payloadA: SyncPayload = { links: [baseLink], categories };
    const payloadB: SyncPayload = { ...payloadA, links: [{ ...baseLink, title: 'Title B' }] };

    expect(buildSyncBusinessSignature(payloadA)).not.toBe(buildSyncBusinessSignature(payloadB));
  });

  it('signatures are stable across key order differences', () => {
    const linkA: SyncPayload['links'][number] = {
      id: 'l1',
      title: 'Title',
      url: 'https://example.com',
      categoryId: 'c1',
      createdAt: 1000,
    };
    const linkB: SyncPayload['links'][number] = {
      title: 'Title',
      createdAt: 1000,
      categoryId: 'c1',
      url: 'https://example.com',
      id: 'l1',
    };

    const catA: SyncPayload['categories'][number] = { id: 'c1', name: 'Cat', icon: 'Star' };
    const catB: SyncPayload['categories'][number] = { name: 'Cat', icon: 'Star', id: 'c1' };

    const payloadA: SyncPayload = { links: [linkA], categories: [catA] };
    const payloadB: SyncPayload = { categories: [catB], links: [linkB] };

    expect(buildSyncBusinessSignature(payloadA)).toBe(buildSyncBusinessSignature(payloadB));
    expect(buildSyncFullSignature(payloadA)).toBe(buildSyncFullSignature(payloadB));
  });

  it('signatures ignore customFaviconCache entry order', () => {
    const payloadA: SyncPayload = {
      links: [baseLink],
      categories,
      customFaviconCache: {
        entries: [
          { hostname: 'b.example.com', iconUrl: 'b', isCustom: true, updatedAt: 2 },
          { hostname: 'a.example.com', iconUrl: 'a', isCustom: true, updatedAt: 1 },
        ],
        updatedAt: 2,
      },
    };
    const payloadB: SyncPayload = {
      links: [baseLink],
      categories,
      customFaviconCache: {
        entries: [
          { hostname: 'a.example.com', iconUrl: 'a', isCustom: true, updatedAt: 1 },
          { hostname: 'b.example.com', iconUrl: 'b', isCustom: true, updatedAt: 2 },
        ],
        updatedAt: 2,
      },
    };

    expect(buildSyncBusinessSignature(payloadA)).toBe(buildSyncBusinessSignature(payloadB));
    expect(buildSyncFullSignature(payloadA)).toBe(buildSyncFullSignature(payloadB));
  });
});
