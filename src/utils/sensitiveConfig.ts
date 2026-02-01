import { SensitiveConfigPayload } from '../types';

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
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const PBKDF2_ITERATIONS = 100000;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Convert ArrayBuffer or Uint8Array to Base64 string
 */
const toBase64 = (buffer: ArrayBuffer | Uint8Array): string => {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

/**
 * Convert Base64 string to Uint8Array
 */
const fromBase64 = (value: string): Uint8Array => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

/**
 * Derive AES-256 key from password using PBKDF2
 */
const deriveKey = async (password: string, salt: Uint8Array): Promise<CryptoKey> => {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
};

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
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const key = await deriveKey(password, salt);
  const encoded = encoder.encode(JSON.stringify(payload));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, encoded);
  return `${CONFIG_VERSION}.${toBase64(salt)}.${toBase64(iv)}.${toBase64(encrypted)}`;
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
  const [version, saltB64, ivB64, dataB64] = cipherText.split('.');

  if (version !== CONFIG_VERSION || !saltB64 || !ivB64 || !dataB64) {
    throw new Error('Invalid sensitive config payload');
  }

  const salt = fromBase64(saltB64);
  const iv = fromBase64(ivB64);
  const data = fromBase64(dataB64);
  const key = await deriveKey(password, salt);

  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, data);
  const parsed = JSON.parse(decoder.decode(decrypted)) as SensitiveConfigPayload;

  // Validate the parsed payload structure
  if (!parsed || typeof parsed !== 'object') {
    return {};
  }

  return parsed;
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
): Promise<SensitiveConfigPayload> => {
  const candidates = Array.from(
    new Set(passwords.map((password) => password.trim()).filter(Boolean)),
  );

  for (const candidate of candidates) {
    try {
      return await decryptSensitiveConfig(candidate, cipherText);
    } catch (error) {
      if (error instanceof Error && error.message === 'Invalid sensitive config payload') {
        throw error;
      }
    }
  }

  throw new Error('No valid password');
};
