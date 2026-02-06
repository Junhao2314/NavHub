import { describe, expect, it } from 'vitest';
import {
  decryptPrivateVault,
  decryptPrivateVaultWithFallback,
  encryptPrivateVault,
} from './privateVault';

describe('privateVault crypto', () => {
  it('should encrypt/decrypt private vault payload correctly', async () => {
    const password = 'testPassword123';
    const payload = {
      links: [
        {
          id: '1',
          title: 't',
          url: 'https://example.com',
          categoryId: 'c',
          createdAt: 1,
        },
      ],
    };

    const encrypted = await encryptPrivateVault(password, payload);
    const decrypted = await decryptPrivateVault(password, encrypted);

    expect(decrypted).toEqual(payload);
  });

  it('should decrypt using the first working password candidate', async () => {
    const password = 'correctPassword';
    const payload = {
      links: [
        {
          id: '1',
          title: 't',
          url: 'https://example.com',
          categoryId: 'c',
          createdAt: 1,
        },
      ],
    };

    const encrypted = await encryptPrivateVault(password, payload);

    const decrypted = await decryptPrivateVaultWithFallback(['wrongPassword', password], encrypted);
    expect(decrypted).toEqual(payload);
  });

  it('should fail fast for invalid ciphertext format/base64', async () => {
    await expect(decryptPrivateVaultWithFallback(['pw'], 'invalid')).rejects.toThrow(
      'Invalid vault payload',
    );
    await expect(decryptPrivateVaultWithFallback(['pw'], 'v1.@@@.@@@.@@@')).rejects.toThrow(
      'Invalid vault payload',
    );
    await expect(decryptPrivateVaultWithFallback(['pw'], 'v1.AQ==.AQ==.AQ==')).rejects.toThrow(
      'Invalid vault payload',
    );
  });

  it('should enforce a maximum number of password candidates', async () => {
    await expect(
      decryptPrivateVaultWithFallback(['a', 'b', 'c', 'd', 'e', 'f'], 'invalid'),
    ).rejects.toThrow('Too many password candidates');
  });
});
