import type { NavHubSyncData } from './types';

/**
 * 管理员数据脱敏：仅清空明文敏感字段（例如 `aiConfig.apiKey`）。
 *
 * 注意：此函数会刻意保留 `encryptedSensitiveConfig` 等“已加密”的敏感字段，
 * 以便管理员客户端在本地解密/恢复配置；因此不要用于非管理员响应。
 */
export const sanitizeSensitiveData = (data: NavHubSyncData): NavHubSyncData => {
  const safeAiConfig =
    data.aiConfig && typeof data.aiConfig === 'object'
      ? { ...data.aiConfig, apiKey: '' }
      : undefined;

  return {
    ...data,
    aiConfig: safeAiConfig,
  };
};

/**
 * 非管理员/公开数据脱敏：移除所有可能泄露隐私的信息。
 *
 * 除清空 `aiConfig.apiKey` 外，还会删除 `privateVault`、`encryptedSensitiveConfig`、`privacyConfig` 等字段，
 * 以避免将任何可用于推断或解密隐私的数据暴露给非管理员用户。
 */
export const sanitizePublicData = (data: NavHubSyncData): NavHubSyncData => {
  const safeAiConfig =
    data.aiConfig && typeof data.aiConfig === 'object'
      ? { ...data.aiConfig, apiKey: '' }
      : undefined;

  return {
    ...data,
    aiConfig: safeAiConfig,
    privateVault: undefined,
    encryptedSensitiveConfig: undefined,
    privacyConfig: undefined,
  };
};
