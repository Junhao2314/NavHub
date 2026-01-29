import type { MutableRefObject } from 'react';
import { encryptSensitiveConfig } from '../../../utils/sensitiveConfig';

export type EncryptedSensitiveConfigCache = {
  password: string;
  apiKey: string;
  encrypted: string;
};

export const encryptApiKeyForSync = async (args: {
  syncPassword: string;
  apiKey: string;
  cacheRef: MutableRefObject<EncryptedSensitiveConfigCache | null>;
}): Promise<string | undefined> => {
  if (!args.syncPassword || !args.apiKey) return undefined;

  const cached = args.cacheRef.current;
  if (cached && cached.password === args.syncPassword && cached.apiKey === args.apiKey) {
    return cached.encrypted;
  }

  try {
    const encrypted = await encryptSensitiveConfig(args.syncPassword, { apiKey: args.apiKey });
    args.cacheRef.current = {
      password: args.syncPassword,
      apiKey: args.apiKey,
      encrypted,
    };
    return encrypted;
  } catch {
    return undefined;
  }
};
