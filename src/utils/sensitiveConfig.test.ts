import { describe, expect, it } from 'vitest';
import {
  decryptSensitiveConfig,
  decryptSensitiveConfigWithFallback,
  encryptSensitiveConfig,
} from './sensitiveConfig';

describe('sensitiveConfig', () => {
  describe('encryptSensitiveConfig', () => {
    it('should encrypt a payload and return a v1 formatted string', async () => {
      const password = 'testPassword123';
      const payload = { apiKey: 'sk-test-api-key-12345' };

      const encrypted = await encryptSensitiveConfig(password, payload);

      // Check format: v1.<salt>.<iv>.<data>
      const parts = encrypted.split('.');
      expect(parts.length).toBe(4);
      expect(parts[0]).toBe('v1');
      // Salt, IV, and data should be non-empty base64 strings
      expect(parts[1].length).toBeGreaterThan(0);
      expect(parts[2].length).toBeGreaterThan(0);
      expect(parts[3].length).toBeGreaterThan(0);
    });

    it('should produce different ciphertext for same input (due to random salt/iv)', async () => {
      const password = 'testPassword123';
      const payload = { apiKey: 'sk-test-api-key-12345' };

      const encrypted1 = await encryptSensitiveConfig(password, payload);
      const encrypted2 = await encryptSensitiveConfig(password, payload);

      // Due to random salt and IV, the ciphertext should be different
      expect(encrypted1).not.toBe(encrypted2);
    });

    it('should handle empty payload', async () => {
      const password = 'testPassword123';
      const payload = {};

      const encrypted = await encryptSensitiveConfig(password, payload);
      expect(encrypted).toMatch(/^v1\./);
    });
  });

  describe('decryptSensitiveConfig', () => {
    it('should decrypt an encrypted payload correctly', async () => {
      const password = 'testPassword123';
      const originalPayload = { apiKey: 'sk-test-api-key-12345' };

      const encrypted = await encryptSensitiveConfig(password, originalPayload);
      const decrypted = await decryptSensitiveConfig(password, encrypted);

      expect(decrypted).toEqual(originalPayload);
    });

    it('should handle empty apiKey', async () => {
      const password = 'testPassword123';
      const originalPayload = { apiKey: '' };

      const encrypted = await encryptSensitiveConfig(password, originalPayload);
      const decrypted = await decryptSensitiveConfig(password, encrypted);

      expect(decrypted).toEqual(originalPayload);
    });

    it('should handle undefined apiKey', async () => {
      const password = 'testPassword123';
      const originalPayload = {};

      const encrypted = await encryptSensitiveConfig(password, originalPayload);
      const decrypted = await decryptSensitiveConfig(password, encrypted);

      expect(decrypted).toEqual(originalPayload);
    });

    it('should throw error for wrong password', async () => {
      const password = 'correctPassword';
      const wrongPassword = 'wrongPassword';
      const payload = { apiKey: 'sk-test-api-key-12345' };

      const encrypted = await encryptSensitiveConfig(password, payload);

      await expect(decryptSensitiveConfig(wrongPassword, encrypted)).rejects.toThrow();
    });

    it('should throw error for invalid ciphertext format', async () => {
      const password = 'testPassword123';

      await expect(decryptSensitiveConfig(password, 'invalid')).rejects.toThrow(
        'Invalid sensitive config payload',
      );

      await expect(decryptSensitiveConfig(password, 'v2.salt.iv.data')).rejects.toThrow(
        'Invalid sensitive config payload',
      );
    });

    it('should throw error for missing parts in ciphertext', async () => {
      const password = 'testPassword123';

      await expect(decryptSensitiveConfig(password, 'v1.salt.iv')).rejects.toThrow(
        'Invalid sensitive config payload',
      );

      await expect(decryptSensitiveConfig(password, 'v1.salt')).rejects.toThrow(
        'Invalid sensitive config payload',
      );
    });
  });

  describe('decryptSensitiveConfigWithFallback', () => {
    it('should decrypt using the first working password candidate', async () => {
      const password = 'correctPassword';
      const payload = { apiKey: 'sk-test-api-key-12345' };
      const encrypted = await encryptSensitiveConfig(password, payload);

      const decrypted = await decryptSensitiveConfigWithFallback(
        ['wrongPassword', password],
        encrypted,
      );

      expect(decrypted).toEqual(payload);
    });

    it('should ignore empty candidates and handle duplicates', async () => {
      const password = 'testPassword123';
      const payload = { apiKey: 'sk-test-key' };
      const encrypted = await encryptSensitiveConfig(password, payload);

      const decrypted = await decryptSensitiveConfigWithFallback(
        ['', '  ', password, password],
        encrypted,
      );

      expect(decrypted).toEqual(payload);
    });

    it('should throw error when no password candidate works', async () => {
      const password = 'correctPassword';
      const payload = { apiKey: 'sk-test-api-key-12345' };
      const encrypted = await encryptSensitiveConfig(password, payload);

      await expect(
        decryptSensitiveConfigWithFallback(['wrongPassword1', 'wrongPassword2'], encrypted),
      ).rejects.toThrow('No valid password');
    });

    it('should throw error for invalid ciphertext format', async () => {
      await expect(
        decryptSensitiveConfigWithFallback(['testPassword123'], 'invalid'),
      ).rejects.toThrow('Invalid sensitive config payload');
    });
  });

  describe('round-trip encryption', () => {
    it('should preserve complex payload through encryption/decryption', async () => {
      const password = 'complexPassword!@#$%';
      const payload = {
        apiKey: 'sk-very-long-api-key-with-special-chars-!@#$%^&*()',
      };

      const encrypted = await encryptSensitiveConfig(password, payload);
      const decrypted = await decryptSensitiveConfig(password, encrypted);

      expect(decrypted).toEqual(payload);
    });

    it('should work with unicode characters in apiKey', async () => {
      const password = 'testPassword';
      const payload = { apiKey: 'api-key-with-中文-日本語-한국어' };

      const encrypted = await encryptSensitiveConfig(password, payload);
      const decrypted = await decryptSensitiveConfig(password, encrypted);

      expect(decrypted).toEqual(payload);
    });

    it('should work with unicode characters in password', async () => {
      const password = '密码Password123';
      const payload = { apiKey: 'sk-test-key' };

      const encrypted = await encryptSensitiveConfig(password, payload);
      const decrypted = await decryptSensitiveConfig(password, encrypted);

      expect(decrypted).toEqual(payload);
    });
  });
});
