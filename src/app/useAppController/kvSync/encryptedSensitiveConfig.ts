import type { MutableRefObject } from 'react';
import { encryptSensitiveConfig } from '../../../utils/sensitiveConfig';

export type EncryptedSensitiveConfigCache = {
  password: string;
  apiKey: string;
  encrypted: string;
};

export type EncryptApiKeyResult =
  | { encrypted: string; error?: undefined }
  | { encrypted?: undefined; error: 'encryption_failed' }
  | { encrypted?: undefined; error?: undefined }; // No password or apiKey

export const encryptApiKeyForSync = async (args: {
  syncPassword: string;
  apiKey: string;
  cacheRef: MutableRefObject<EncryptedSensitiveConfigCache | null>;
}): Promise<EncryptApiKeyResult> => {
  if (!args.syncPassword || !args.apiKey) {
    return {};
  }

  const cached = args.cacheRef.current;
  if (cached && cached.password === args.syncPassword && cached.apiKey === args.apiKey) {
    return { encrypted: cached.encrypted };
  }

  try {
    const encrypted = await encryptSensitiveConfig(args.syncPassword, { apiKey: args.apiKey });
    args.cacheRef.current = {
      password: args.syncPassword,
      apiKey: args.apiKey,
      encrypted,
    };
    return { encrypted };
  } catch (error) {
    console.warn('[encryptApiKeyForSync] Encryption failed:', error);
    return { error: 'encryption_failed' };
  }
};
