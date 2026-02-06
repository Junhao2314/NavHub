export type VersionedJsonCryptoOptions = {
  version: string;
  saltLength?: number;
  ivLength?: number;
  iterations?: number;
  invalidPayloadErrorMessage?: string;
};

export class InvalidPayloadError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'InvalidPayloadError';
  }
}

export class DecryptionFailedError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'DecryptionFailedError';
  }
}

export const isInvalidPayloadError = (error: unknown): error is InvalidPayloadError => {
  return error instanceof Error && error.name === 'InvalidPayloadError';
};

export const isDecryptionFailedError = (error: unknown): error is DecryptionFailedError => {
  return error instanceof Error && error.name === 'DecryptionFailedError';
};

const DEFAULT_SALT_LENGTH = 16;
const DEFAULT_IV_LENGTH = 12;
const DEFAULT_PBKDF2_ITERATIONS = 100000;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const toBase64 = (buffer: ArrayBuffer | Uint8Array): string => {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

const fromBase64 = (value: string): Uint8Array => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

const getErrorName = (error: unknown): string | null => {
  if (!error || typeof error !== 'object') return null;
  if (!('name' in error)) return null;
  const name = (error as { name?: unknown }).name;
  return typeof name === 'string' ? name : null;
};

const buildInvalidPayloadError = (options: VersionedJsonCryptoOptions, cause?: unknown): Error => {
  const message = options.invalidPayloadErrorMessage || 'Invalid payload';
  return new InvalidPayloadError(message, cause === undefined ? undefined : { cause });
};

const deriveKey = async (
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<CryptoKey> => {
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
      salt,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
};

export const encryptVersionedJsonPayload = async (
  password: string,
  payload: unknown,
  options: VersionedJsonCryptoOptions,
): Promise<string> => {
  const saltLength = options.saltLength ?? DEFAULT_SALT_LENGTH;
  const ivLength = options.ivLength ?? DEFAULT_IV_LENGTH;
  const iterations = options.iterations ?? DEFAULT_PBKDF2_ITERATIONS;

  const salt = crypto.getRandomValues(new Uint8Array(saltLength));
  const iv = crypto.getRandomValues(new Uint8Array(ivLength));
  const key = await deriveKey(password, salt, iterations);
  const encoded = encoder.encode(JSON.stringify(payload));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);

  return `${options.version}.${toBase64(salt)}.${toBase64(iv)}.${toBase64(encrypted)}`;
};

export const decryptVersionedJsonPayload = async (
  password: string,
  cipherText: string,
  options: VersionedJsonCryptoOptions,
): Promise<unknown> => {
  const [version, saltB64, ivB64, dataB64] = cipherText.split('.');

  if (version !== options.version || !saltB64 || !ivB64 || !dataB64) {
    throw buildInvalidPayloadError(options);
  }

  const iterations = options.iterations ?? DEFAULT_PBKDF2_ITERATIONS;
  const saltLength = options.saltLength ?? DEFAULT_SALT_LENGTH;
  const ivLength = options.ivLength ?? DEFAULT_IV_LENGTH;

  let salt: Uint8Array;
  let iv: Uint8Array;
  let data: Uint8Array;
  try {
    salt = fromBase64(saltB64);
    iv = fromBase64(ivB64);
    data = fromBase64(dataB64);
  } catch (cause) {
    throw buildInvalidPayloadError(options, cause);
  }

  if (salt.length !== saltLength || iv.length !== ivLength || data.length === 0) {
    throw buildInvalidPayloadError(options);
  }

  const key = await deriveKey(password, salt, iterations);
  let decrypted: ArrayBuffer;
  try {
    decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  } catch (cause) {
    const causeName = getErrorName(cause);
    if (causeName === 'OperationError' || causeName === 'DataError') {
      throw new DecryptionFailedError('Decryption failed', { cause });
    }
    throw cause;
  }

  try {
    return JSON.parse(decoder.decode(decrypted));
  } catch (cause) {
    throw buildInvalidPayloadError(options, cause);
  }
};
