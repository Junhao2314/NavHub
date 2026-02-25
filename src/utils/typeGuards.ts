/**
 * Type Guards - 运行时类型安全检查
 *
 * 功能:
 *   - 提供类型守卫函数替代不安全的 `as` 类型断言
 *   - 在运行时验证数据结构，防止类型相关的运行时错误
 *   - 为 JSON.parse 结果和 API 响应提供安全的类型检查
 */

import type {
  AIConfig,
  SearchConfig,
  SensitiveConfigPayload,
  SiteSettings,
  SyncCreateBackupResponse,
  SyncDeleteBackupResponse,
  SyncLoginResponse,
  SyncMetadata,
  SyncRestoreBackupResponse,
} from '../types';

// ============ 基础类型守卫 ============

/** 检查值是否为非空对象 */
export const isRecord = (value: unknown): value is Record<string, unknown> => {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
};

/** 检查值是否为字符串 */
export const isString = (value: unknown): value is string => {
  return typeof value === 'string';
};

/** 检查值是否为数字 */
export const isNumber = (value: unknown): value is number => {
  return typeof value === 'number' && !Number.isNaN(value);
};

/** 检查值是否为布尔值 */
export const isBoolean = (value: unknown): value is boolean => {
  return typeof value === 'boolean';
};

// ============ 配置类型守卫 ============

/**
 * 验证是否为有效的 Partial<AIConfig>
 *
 * 只验证存在的字段类型是否正确，不要求所有字段都存在
 */
export const isPartialAIConfig = (value: unknown): value is Partial<AIConfig> => {
  if (!isRecord(value)) return false;

  // 验证存在的字段类型
  if ('provider' in value && value.provider !== 'gemini' && value.provider !== 'openai') {
    return false;
  }
  if ('apiKey' in value && !isString(value.apiKey)) return false;
  if ('baseUrl' in value && !isString(value.baseUrl)) return false;
  if ('model' in value && !isString(value.model)) return false;
  if (
    'websiteTitle' in value &&
    value.websiteTitle !== undefined &&
    !isString(value.websiteTitle)
  ) {
    return false;
  }
  if ('faviconUrl' in value && value.faviconUrl !== undefined && !isString(value.faviconUrl)) {
    return false;
  }
  if (
    'navigationName' in value &&
    value.navigationName !== undefined &&
    !isString(value.navigationName)
  ) {
    return false;
  }

  return true;
};

/**
 * 验证是否为有效的 Partial<SiteSettings>
 *
 * 只验证存在的字段类型是否正确
 */
export const isPartialSiteSettings = (value: unknown): value is Partial<SiteSettings> => {
  if (!isRecord(value)) return false;

  if ('title' in value && !isString(value.title)) return false;
  if ('navTitle' in value && !isString(value.navTitle)) return false;
  if ('favicon' in value && !isString(value.favicon)) return false;
  if ('cardStyle' in value && value.cardStyle !== 'detailed' && value.cardStyle !== 'simple') {
    return false;
  }
  if (
    'reminderBoardShowOverdueForUsers' in value &&
    value.reminderBoardShowOverdueForUsers !== undefined &&
    !isBoolean(value.reminderBoardShowOverdueForUsers)
  ) {
    return false;
  }
  if (
    'reminderBoardGroups' in value &&
    value.reminderBoardGroups !== undefined &&
    !Array.isArray(value.reminderBoardGroups)
  ) {
    return false;
  }
  if (
    'reminderBoardArchiveMode' in value &&
    value.reminderBoardArchiveMode !== undefined &&
    value.reminderBoardArchiveMode !== 'immediate' &&
    value.reminderBoardArchiveMode !== 'delay'
  ) {
    return false;
  }
  if (
    'reminderBoardArchiveDelayMinutes' in value &&
    value.reminderBoardArchiveDelayMinutes !== undefined &&
    typeof value.reminderBoardArchiveDelayMinutes !== 'number'
  ) {
    return false;
  }
  if ('accentColor' in value && value.accentColor !== undefined && !isString(value.accentColor)) {
    return false;
  }
  if ('grayScale' in value && value.grayScale !== undefined) {
    if (
      value.grayScale !== 'slate' &&
      value.grayScale !== 'zinc' &&
      value.grayScale !== 'neutral'
    ) {
      return false;
    }
  }
  if (
    'closeOnBackdrop' in value &&
    value.closeOnBackdrop !== undefined &&
    !isBoolean(value.closeOnBackdrop)
  ) {
    return false;
  }
  if (
    'backgroundImage' in value &&
    value.backgroundImage !== undefined &&
    !isString(value.backgroundImage)
  ) {
    return false;
  }
  if (
    'backgroundImageEnabled' in value &&
    value.backgroundImageEnabled !== undefined &&
    !isBoolean(value.backgroundImageEnabled)
  ) {
    return false;
  }
  if (
    'backgroundMotion' in value &&
    value.backgroundMotion !== undefined &&
    !isBoolean(value.backgroundMotion)
  ) {
    return false;
  }

  return true;
};

/**
 * 验证是否为有效的 SearchConfig
 */
export const isSearchConfig = (value: unknown): value is SearchConfig => {
  if (!isRecord(value)) return false;

  // mode 是必需的
  if (!('mode' in value) || (value.mode !== 'internal' && value.mode !== 'external')) {
    return false;
  }

  // externalSources 必须是数组
  if ('externalSources' in value && !Array.isArray(value.externalSources)) {
    return false;
  }

  return true;
};

/**
 * 验证是否为有效的 SyncMetadata
 */
export const isSyncMetadata = (value: unknown): value is SyncMetadata => {
  if (!isRecord(value)) return false;

  // 必需字段
  if (!('updatedAt' in value) || !isNumber(value.updatedAt)) return false;
  if (!('deviceId' in value) || !isString(value.deviceId)) return false;
  if (!('version' in value) || !isNumber(value.version)) return false;

  // 可选字段类型检查
  if ('browser' in value && value.browser !== undefined && !isString(value.browser)) return false;
  if ('os' in value && value.os !== undefined && !isString(value.os)) return false;
  if ('syncKind' in value && value.syncKind !== undefined) {
    if (value.syncKind !== 'auto' && value.syncKind !== 'manual') return false;
  }

  return true;
};

/**
 * 验证是否为有效的 SensitiveConfigPayload
 */
export const isSensitiveConfigPayload = (value: unknown): value is SensitiveConfigPayload => {
  if (!isRecord(value)) return false;

  // apiKey 是可选的，但如果存在必须是字符串
  if ('apiKey' in value && value.apiKey !== undefined && !isString(value.apiKey)) {
    return false;
  }

  return true;
};

// ============ API 响应验证 ============

/**
 * 验证 SyncCreateBackupResponse 响应结构
 */
export const validateCreateBackupResponse = (
  value: unknown,
): { valid: true; data: SyncCreateBackupResponse } | { valid: false; reason: string } => {
  if (!isRecord(value)) {
    return { valid: false, reason: 'Invalid response structure' };
  }

  if (!isBoolean(value.success)) {
    return { valid: false, reason: 'Missing or invalid "success" field' };
  }

  if (value.success === false) {
    if (!isString(value.error)) {
      return { valid: false, reason: 'Missing error message in failure response' };
    }
    return { valid: true, data: value as SyncCreateBackupResponse };
  }

  // 成功响应需包含 backupKey
  if (!isString(value.backupKey)) {
    return { valid: false, reason: 'Missing or invalid "backupKey" field in success response' };
  }

  return { valid: true, data: value as SyncCreateBackupResponse };
};

/**
 * 验证 SyncRestoreBackupResponse 响应结构
 */
export const validateRestoreBackupResponse = (
  value: unknown,
): { valid: true; data: SyncRestoreBackupResponse } | { valid: false; reason: string } => {
  if (!isRecord(value)) {
    return { valid: false, reason: 'Invalid response structure' };
  }

  if (!isBoolean(value.success)) {
    return { valid: false, reason: 'Missing or invalid "success" field' };
  }

  if (value.success === false) {
    if (!isString(value.error)) {
      return { valid: false, reason: 'Missing error message in failure response' };
    }
    return { valid: true, data: value as SyncRestoreBackupResponse };
  }

  // 成功响应需包含 data
  if (!isRecord(value.data)) {
    return { valid: false, reason: 'Missing or invalid "data" field in success response' };
  }

  return { valid: true, data: value as SyncRestoreBackupResponse };
};

/**
 * 验证 SyncDeleteBackupResponse 响应结构
 */
export const validateDeleteBackupResponse = (
  value: unknown,
): { valid: true; data: SyncDeleteBackupResponse } | { valid: false; reason: string } => {
  if (!isRecord(value)) {
    return { valid: false, reason: 'Invalid response structure' };
  }

  if (!isBoolean(value.success)) {
    return { valid: false, reason: 'Missing or invalid "success" field' };
  }

  if (value.success === false) {
    if (!isString(value.error)) {
      return { valid: false, reason: 'Missing error message in failure response' };
    }
  }

  return { valid: true, data: value as SyncDeleteBackupResponse };
};

/**
 * 验证 SyncLoginResponse 响应结构
 */
export const validateLoginResponse = (
  value: unknown,
): { valid: true; data: SyncLoginResponse } | { valid: false; reason: string } => {
  if (!isRecord(value)) {
    return { valid: false, reason: 'Invalid response structure' };
  }

  if (!isBoolean(value.success)) {
    return { valid: false, reason: 'Missing or invalid "success" field' };
  }

  if (value.success === false) {
    if (!isString(value.error)) {
      return { valid: false, reason: 'Missing error message in failure response' };
    }
    // 失败响应可能包含锁定信息
    return { valid: true, data: value as SyncLoginResponse };
  }

  // 成功响应需验证 SyncAuthState 字段
  if (!isBoolean(value.protected)) {
    return { valid: false, reason: 'Missing or invalid "protected" field' };
  }
  if (!isBoolean(value.canWrite)) {
    return { valid: false, reason: 'Missing or invalid "canWrite" field' };
  }
  if (value.role !== 'admin' && value.role !== 'user') {
    return { valid: false, reason: 'Invalid "role" field' };
  }

  return { valid: true, data: value as SyncLoginResponse };
};

// ============ Hitokoto API 响应验证 ============

export interface HitokotoPayload {
  hitokoto: string;
  from?: string;
  from_who?: string | null;
}

/**
 * 验证 Hitokoto API 响应结构
 */
export const isHitokotoPayload = (value: unknown): value is HitokotoPayload => {
  if (!isRecord(value)) return false;
  if (!isString(value.hitokoto)) return false;
  if ('from' in value && value.from !== undefined && !isString(value.from)) return false;
  if (
    'from_who' in value &&
    value.from_who !== undefined &&
    value.from_who !== null &&
    !isString(value.from_who)
  ) {
    return false;
  }
  return true;
};

// ============ Gemini/OpenAI 模型列表响应验证 ============

export interface GeminiModelsListResponse {
  models?: Array<{ name?: unknown }>;
}

export interface OpenAIModelsListResponse {
  data?: Array<{ id?: unknown }>;
}

/**
 * 验证 Gemini 模型列表响应
 */
export const isGeminiModelsListResponse = (value: unknown): value is GeminiModelsListResponse => {
  if (!isRecord(value)) return false;
  if ('models' in value && value.models !== undefined) {
    if (!Array.isArray(value.models)) return false;
  }
  return true;
};

/**
 * 验证 OpenAI 模型列表响应
 */
export const isOpenAIModelsListResponse = (value: unknown): value is OpenAIModelsListResponse => {
  if (!isRecord(value)) return false;
  if ('data' in value && value.data !== undefined) {
    if (!Array.isArray(value.data)) return false;
  }
  return true;
};
