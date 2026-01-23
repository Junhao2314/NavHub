import { describe, expect, it } from 'vitest';
import { buildSyncData } from './useSyncEngine';

describe('buildSyncData', () => {
  it('includes privacyConfig in the returned sync payload', () => {
    const links = [{ id: '1', title: 't', url: 'https://example.com', categoryId: 'c', createdAt: 1 }];
    const categories = [{ id: 'c', name: 'C', icon: 'Star' }];
    const privacyConfig = { groupEnabled: true, passwordEnabled: false, autoUnlockEnabled: true, useSeparatePassword: true };

    const data = buildSyncData(
      links,
      categories,
      undefined,
      undefined,
      undefined,
      undefined,
      privacyConfig,
      'light',
      'encrypted',
      { entries: [], updatedAt: 1 }
    );

    expect(data.privacyConfig).toEqual(privacyConfig);
    expect(data.themeMode).toBe('light');
  });
});

