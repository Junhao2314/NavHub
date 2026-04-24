import type { MutableRefObject } from 'react';
import type { SensitiveConfigPayload } from '../../../types';
import { encryptSensitiveConfig } from '../../../utils/sensitiveConfig';

export type EncryptedSensitiveConfigCache = {
  password: string;
  payloadKey: string;
  encrypted: string;
};

export type EncryptApiKeyResult =
  | { encrypted: string; error?: undefined }
  | { encrypted?: undefined; error: 'encryption_failed' }
  | { encrypted?: undefined; error?: undefined }; // No password or apiKey

export const encryptApiKeyForSync = async (args: {
  syncPassword: string;
  apiKey: string;
  existingPayload?: SensitiveConfigPayload;
  cacheRef: MutableRefObject<EncryptedSensitiveConfigCache | null>;
}): Promise<EncryptApiKeyResult> => {
  const payload: SensitiveConfigPayload = {
    ...(args.existingPayload ?? {}),
    apiKey: args.apiKey,
  };
  const hasSensitiveValue =
    !!payload.apiKey?.trim() ||
    !!payload.notifications?.telegramBotToken?.trim() ||
    !!payload.notifications?.telegramChatId?.trim() ||
    !!payload.notifications?.webhookUrl?.trim() ||
    !!payload.notifications?.resendApiKey?.trim() ||
    !!payload.notifications?.resendFrom?.trim() ||
    !!payload.notifications?.emailTo?.trim() ||
    !!payload.notifications?.barkKey?.trim() ||
    (payload.notifications?.webhookHeaders &&
      Object.keys(payload.notifications.webhookHeaders).length > 0);

  if (!args.syncPassword || !hasSensitiveValue) {
    return {};
  }

  const payloadKey = JSON.stringify(payload);
  const cached = args.cacheRef.current;
  if (cached && cached.password === args.syncPassword && cached.payloadKey === payloadKey) {
    return { encrypted: cached.encrypted };
  }

  try {
    const encrypted = await encryptSensitiveConfig(args.syncPassword, payload);
    args.cacheRef.current = {
      password: args.syncPassword,
      payloadKey,
      encrypted,
    };
    return { encrypted };
  } catch (error) {
    console.warn('[encryptApiKeyForSync] Encryption failed:', error);
    return { error: 'encryption_failed' };
  }
};
