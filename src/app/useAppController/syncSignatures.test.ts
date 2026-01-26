import { describe, expect, it } from 'vitest';
import { buildSyncBusinessSignature, buildSyncFullSignature, type SyncPayload } from './syncSignatures';

describe('syncSignatures', () => {
  const categories: SyncPayload['categories'] = [{ id: 'c1', name: 'Cat', icon: 'Star' }];
  const baseLink: SyncPayload['links'][number] = {
    id: 'l1',
    title: 'Title',
    url: 'https://example.com',
    categoryId: 'c1',
    createdAt: 1000,
    adminClicks: 1,
    adminLastClickedAt: 2000
  };

  it('business signature ignores click stats changes', () => {
    const payloadA: SyncPayload = { links: [baseLink], categories };
    const payloadB: SyncPayload = {
      ...payloadA,
      links: [{ ...baseLink, adminClicks: 2, adminLastClickedAt: 3000 }]
    };

    expect(buildSyncBusinessSignature(payloadA)).toBe(buildSyncBusinessSignature(payloadB));
    expect(buildSyncFullSignature(payloadA)).not.toBe(buildSyncFullSignature(payloadB));
  });

  it('signatures ignore encryptedSensitiveConfig changes', () => {
    const payloadA: SyncPayload = {
      links: [baseLink],
      categories,
      encryptedSensitiveConfig: 'enc-a'
    };
    const payloadB: SyncPayload = {
      ...payloadA,
      encryptedSensitiveConfig: 'enc-b'
    };

    expect(buildSyncBusinessSignature(payloadA)).toBe(buildSyncBusinessSignature(payloadB));
    expect(buildSyncFullSignature(payloadA)).toBe(buildSyncFullSignature(payloadB));
  });

  it('business signature changes when business fields change', () => {
    const payloadA: SyncPayload = { links: [baseLink], categories };
    const payloadB: SyncPayload = { ...payloadA, links: [{ ...baseLink, title: 'Title B' }] };

    expect(buildSyncBusinessSignature(payloadA)).not.toBe(buildSyncBusinessSignature(payloadB));
  });
});

