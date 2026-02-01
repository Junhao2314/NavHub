import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AIConfig, NavHubSyncData, SyncRole } from '../../../types';

// Mock the dependencies
vi.mock('../../../utils/secrets', () => ({
  getSyncPassword: vi.fn(() => 'test-sync-password'),
  getPrivacyPassword: vi.fn(() => ''),
}));

vi.mock('../../../utils/sensitiveConfig', () => ({
  decryptSensitiveConfigWithFallback: vi.fn(),
}));

vi.mock('../../../utils/storage', () => ({
  safeLocalStorageSetItem: vi.fn(() => true),
  safeLocalStorageRemoveItem: vi.fn(() => true),
  safeSessionStorageSetItem: vi.fn(() => true),
  safeSessionStorageRemoveItem: vi.fn(() => true),
}));

vi.mock('../../../utils/faviconCache', () => ({
  mergeFromCloud: vi.fn(),
}));

vi.mock('../../../utils/privateVault', () => ({
  decryptPrivateVault: vi.fn(),
  parsePlainPrivateVault: vi.fn(() => null),
}));

import { getSyncPassword } from '../../../utils/secrets';
import { decryptSensitiveConfigWithFallback } from '../../../utils/sensitiveConfig';
import { applyCloudDataToLocalState } from './applyCloudData';

describe('applyCloudDataToLocalState - encryptedSensitiveConfig', () => {
  const createMockArgs = () => {
    const restoreAIConfig = vi.fn();
    return {
      data: {
        links: [],
        categories: [],
        meta: { updatedAt: Date.now(), deviceId: 'test', version: 1 },
      } as NavHubSyncData,
      role: 'admin' as SyncRole,
      updateData: vi.fn(),
      restoreSearchConfigRef: { current: vi.fn() },
      restoreSiteSettings: vi.fn(),
      applyFromSync: vi.fn(),
      aiConfig: { provider: 'gemini', apiKey: '', baseUrl: '', model: '' } as AIConfig,
      restoreAIConfig,
      selectedCategory: 'all',
      setSelectedCategory: vi.fn(),
      privacyGroupEnabled: false,
      setPrivacyGroupEnabled: vi.fn(),
      privacyPasswordEnabled: false,
      setPrivacyPasswordEnabled: vi.fn(),
      privacyAutoUnlockEnabled: false,
      setPrivacyAutoUnlockEnabled: vi.fn(),
      setUseSeparatePrivacyPassword: vi.fn(),
      setPrivateVaultCipher: vi.fn(),
      setPrivateLinks: vi.fn(),
      isPrivateUnlocked: false,
      setIsPrivateUnlocked: vi.fn(),
      privateVaultPassword: null,
      setPrivateVaultPassword: vi.fn(),
      setIsPrivateModalOpen: vi.fn(),
      setEditingPrivateLink: vi.fn(),
      setPrefillPrivateLink: vi.fn(),
      notify: vi.fn(),
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should decrypt encryptedSensitiveConfig and restore API key', async () => {
    const mockDecrypt = vi.mocked(decryptSensitiveConfigWithFallback);
    mockDecrypt.mockResolvedValue({ apiKey: 'decrypted-api-key' });

    const args = createMockArgs();
    args.data.encryptedSensitiveConfig = 'v1.encrypted.data';
    args.data.aiConfig = { provider: 'gemini', apiKey: '', baseUrl: '', model: 'gemini-2.5-flash' };

    applyCloudDataToLocalState(args);

    // Wait for async decryption
    await vi.waitFor(() => {
      expect(mockDecrypt).toHaveBeenCalledWith(['test-sync-password', '', ''], 'v1.encrypted.data');
    });

    // Wait for restoreAIConfig to be called with decrypted key
    await vi.waitFor(() => {
      expect(args.restoreAIConfig).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: 'decrypted-api-key' }),
      );
    });
  });

  it('should not attempt decryption when no password candidates available', () => {
    vi.mocked(getSyncPassword).mockReturnValue('');
    const mockDecrypt = vi.mocked(decryptSensitiveConfigWithFallback);

    const args = createMockArgs();
    args.data.encryptedSensitiveConfig = 'v1.encrypted.data';
    args.privateVaultPassword = null;

    applyCloudDataToLocalState(args);

    expect(mockDecrypt).not.toHaveBeenCalled();
  });

  it('should handle decryption failure gracefully', async () => {
    // Reset the mock to return password again
    vi.mocked(getSyncPassword).mockReturnValue('test-sync-password');

    const mockDecrypt = vi.mocked(decryptSensitiveConfigWithFallback);
    mockDecrypt.mockRejectedValue(new Error('Decryption failed'));

    const args = createMockArgs();
    args.data.encryptedSensitiveConfig = 'v1.encrypted.data';
    args.data.aiConfig = { provider: 'gemini', apiKey: '', baseUrl: '', model: 'gemini-2.5-flash' };

    // Should not throw
    applyCloudDataToLocalState(args);

    // Wait for the rejection to be handled
    await vi.waitFor(() => {
      expect(mockDecrypt).toHaveBeenCalled();
    });

    // restoreAIConfig should be called once for aiConfig (with empty apiKey)
    // but NOT called again with decrypted key since decryption failed
    expect(args.restoreAIConfig).toHaveBeenCalledTimes(1);
    expect(args.restoreAIConfig).toHaveBeenCalledWith(expect.objectContaining({ apiKey: '' }));
  });
});
