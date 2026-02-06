import { SensitiveConfigPayload } from '../types';
import {
  decryptVersionedJsonPayload,
  encryptVersionedJsonPayload,
  InvalidPayloadError,
  isDecryptionFailedError,
  isInvalidPayloadError,
} from './cryptoPayload';
import { isSensitiveConfigPayload } from './typeGuards';

/**
 * Sensitive Config Encryption Module
 *
 * Uses the same encryption mechanism as privateVault (PBKDF2 + AES-GCM)
 * for encrypting sensitive configuration data like API keys.
 *
 * Encryption format: v1.<salt_base64>.<iv_base64>.<encrypted_data_base64>
 * - Salt: 16 bytes for PBKDF2 key derivation
 * - IV: 12 bytes for AES-GCM initialization vector
 *
 * Requirements: 2.1, 2.2, 5.1
 */

const CONFIG_VERSION = 'v1';
const INVALID_SENSITIVE_CONFIG_PAYLOAD_MESSAGE = 'Invalid sensitive config payload';

/**
 * Encrypt sensitive configuration data
 *
 * Uses PBKDF2 for key derivation and AES-GCM for encryption,
 * matching the encryption mechanism used by privateVault.
 *
 * @param password - User's privacy password
 * @param payload - Sensitive configuration payload containing apiKey, etc.
 * @returns Encrypted string in format: v1.<salt_base64>.<iv_base64>.<encrypted_data_base64>
 *
 * Requirements: 2.1, 2.2, 5.1
 */
export const encryptSensitiveConfig = async (
  password: string,
  payload: SensitiveConfigPayload,
): Promise<string> => {
  return encryptVersionedJsonPayload(password, payload, { version: CONFIG_VERSION });
};

/**
 * Decrypt sensitive configuration data
 *
 * Decrypts the encrypted string using the provided password.
 * If decryption fails (wrong password or invalid format), throws an error.
 *
 * @param password - User's privacy password
 * @param cipherText - Encrypted string in format: v1.<salt_base64>.<iv_base64>.<encrypted_data_base64>
 * @returns Decrypted SensitiveConfigPayload
 * @throws Error if password is incorrect or cipherText format is invalid
 *
 * Requirements: 2.3, 2.4
 */
export const decryptSensitiveConfig = async (
  password: string,
  cipherText: string,
): Promise<SensitiveConfigPayload> => {
  const rawParsed = await decryptVersionedJsonPayload(password, cipherText, {
    version: CONFIG_VERSION,
    invalidPayloadErrorMessage: INVALID_SENSITIVE_CONFIG_PAYLOAD_MESSAGE,
  });

  // Validate the parsed payload structure.
  // Note: keep best-effort backward compatibility for a legacy string payload.
  if (isSensitiveConfigPayload(rawParsed)) return rawParsed;
  if (typeof rawParsed === 'string') {
    const apiKey = rawParsed.trim();
    return apiKey ? { apiKey } : {};
  }

  throw new InvalidPayloadError(INVALID_SENSITIVE_CONFIG_PAYLOAD_MESSAGE);
};

/**
 * Decrypt sensitive configuration data using a list of password candidates.
 *
 * Tries each candidate in order until decryption succeeds.
 * - Ignores empty/whitespace passwords
 * - De-duplicates candidates while preserving order
 *
 * @throws Error if no candidate works
 */
export const decryptSensitiveConfigWithFallback = async (
  passwords: string[],
  cipherText: string,
  options?: { maxCandidates?: number },
): Promise<SensitiveConfigPayload> => {
  const maxCandidates = options?.maxCandidates ?? 5;
  const candidates = Array.from(
    new Set(passwords.map((password) => password.trim()).filter(Boolean)),
  );

  if (candidates.length > maxCandidates) {
    throw new Error('Too many password candidates');
  }

  for (const candidate of candidates) {
    try {
      return await decryptSensitiveConfig(candidate, cipherText);
    } catch (error) {
      if (isInvalidPayloadError(error)) throw error;
      if (isDecryptionFailedError(error)) continue;
      throw error;
    }
  }

  throw new Error('No valid password');
};
