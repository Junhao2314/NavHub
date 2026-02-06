/**
 * 同步引擎工具函数
 */

import { AIConfig, NavHubSyncData, SyncMetadata } from '../../types';
import { SYNC_META_KEY } from '../../utils/constants';
import { getErrorMessage } from '../../utils/error';
import { safeLocalStorageGetItem, safeLocalStorageSetItem } from '../../utils/storage';
import { isSyncMetadata } from '../../utils/typeGuards';

type UnknownRecord = Record<string, unknown>;

// fetch(..., { keepalive: true }) 的请求体大小在不同浏览器/平台有上限（常见约 64KB）。
const KEEPALIVE_BODY_LIMIT_BYTES = 64 * 1024;
const keepaliveBodyEncoder = new TextEncoder();

export const isKeepaliveBodyWithinLimit = (body: string): boolean => {
  return keepaliveBodyEncoder.encode(body).length <= KEEPALIVE_BODY_LIMIT_BYTES;
};

export const readWindowSearchParam = (key: string): string => {
  if (typeof window === 'undefined') return '';
  try {
    return new URLSearchParams(window.location.search).get(key) || '';
  } catch {
    return '';
  }
};

export const resolveSyncDebugFlags = (): { enabled: boolean; dump: boolean } => {
  const isDev = import.meta.env.DEV;
  const debugParam = readWindowSearchParam('debug');
  const debugSyncParam = readWindowSearchParam('debugSync');

  if (debugSyncParam === '0') return { enabled: false, dump: false };

  const enabled = isDev || debugSyncParam === '1' || debugParam === 'sync';
  const dump = enabled && readWindowSearchParam('debugSyncDump') === '1';

  return { enabled, dump };
};

export const summarizeSyncDataForDebug = (
  data: NavHubSyncData,
): {
  schemaVersion: NavHubSyncData['schemaVersion'];
  meta: NavHubSyncData['meta'];
  counts: { links: number; categories: number };
  has: {
    privateVault: boolean;
    encryptedSensitiveConfig: boolean;
    privacyConfig: boolean;
    customFaviconCache: boolean;
  };
} => {
  return {
    schemaVersion: data.schemaVersion,
    meta: data.meta,
    counts: {
      links: Array.isArray(data.links) ? data.links.length : 0,
      categories: Array.isArray(data.categories) ? data.categories.length : 0,
    },
    has: {
      privateVault: !!data.privateVault,
      encryptedSensitiveConfig: !!data.encryptedSensitiveConfig,
      privacyConfig: !!data.privacyConfig,
      customFaviconCache: !!data.customFaviconCache,
    },
  };
};

export const getResponseHeader = (response: unknown, name: string): string | undefined => {
  const headers = (response as { headers?: unknown })?.headers as { get?: unknown } | undefined;
  if (!headers) return undefined;
  const getter = headers.get;
  if (typeof getter !== 'function') return undefined;
  const value = getter.call(headers, name) as unknown;
  return typeof value === 'string' && value ? value : undefined;
};

export const redactSyncDataForDebug = (data: NavHubSyncData): NavHubSyncData => {
  const aiConfig =
    data.aiConfig && typeof data.aiConfig === 'object'
      ? { ...data.aiConfig, apiKey: '[REDACTED]' }
      : data.aiConfig;
  return {
    ...data,
    aiConfig,
    privateVault: data.privateVault ? '[REDACTED]' : data.privateVault,
    encryptedSensitiveConfig: data.encryptedSensitiveConfig
      ? '[REDACTED]'
      : data.encryptedSensitiveConfig,
  };
};

/**
 * 脱敏备份列表响应，移除可能的敏感数据
 */
export const redactBackupsResponseForDebug = (
  response: unknown,
): { backupsCount: number | null; keys: string[] | null } => {
  if (!response || typeof response !== 'object') {
    return { backupsCount: null, keys: null };
  }
  const record = response as UnknownRecord;
  const backups = record.backups;
  if (!Array.isArray(backups)) {
    return { backupsCount: null, keys: null };
  }
  // 只提取备份的 key（时间戳），不暴露完整数据
  const keys = backups
    .map((b) => (b && typeof b === 'object' ? (b as UnknownRecord).key : null))
    .filter((k): k is string => typeof k === 'string');
  return { backupsCount: backups.length, keys };
};

export const getSyncNetworkErrorMessage = (error: unknown, t: (key: string) => string): string => {
  const message = getErrorMessage(error, t('errors.networkError')).trim();
  if (!message) return t('errors.networkError');

  const normalized = message.toLowerCase();
  const looksLikeNetworkError =
    error instanceof TypeError ||
    message === 'Failed to fetch' ||
    normalized.includes('networkerror') ||
    normalized.includes('load failed') ||
    (normalized.includes('fetch') && normalized.includes('failed')) ||
    normalized.includes('the network connection was lost') ||
    normalized.includes('the internet connection appears to be offline');

  if (looksLikeNetworkError) {
    return t('errors.networkErrorRetry');
  }

  return message;
};

export type SyncEngineCallbackName = 'onConflict' | 'onSyncComplete' | 'onError';

export const callSyncEngineCallback = <Args extends unknown[]>(
  name: SyncEngineCallbackName,
  callback: ((...args: Args) => void) | undefined,
  ...args: Args
): void => {
  if (!callback) return;
  try {
    callback(...args);
  } catch (error) {
    console.error(`[useSyncEngine] ${name} callback threw`, error);
  }
};

// 获取当前本地的 sync meta
export const getLocalSyncMeta = (): SyncMetadata | null => {
  const stored = safeLocalStorageGetItem(SYNC_META_KEY);
  if (!stored) return null;
  try {
    const parsed: unknown = JSON.parse(stored);
    if (!isSyncMetadata(parsed)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

// 保存 sync meta 到本地
export const saveLocalSyncMeta = (meta: SyncMetadata): void => {
  safeLocalStorageSetItem(SYNC_META_KEY, JSON.stringify(meta));
};

export const sanitizeAiConfigForCloud = (config?: AIConfig): AIConfig | undefined => {
  if (!config) return undefined;
  return { ...config, apiKey: '' };
};

// 默认请求超时时间（毫秒）
const DEFAULT_FETCH_TIMEOUT_MS = 30_000;

/**
 * 带超时控制的 fetch 封装
 * 防止网络慢时无限挂起
 */
export const fetchWithTimeout = async (
  input: RequestInfo | URL,
  init?: RequestInit & { timeout?: number },
): Promise<Response> => {
  const { timeout = DEFAULT_FETCH_TIMEOUT_MS, ...fetchInit } = init ?? {};

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(input, {
      ...fetchInit,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
};

/**
 * 判断错误是否为可重试的网络错误
 * 仅对网络层错误重试，HTTP 状态码错误(4xx/5xx)不重试
 */
export const isRetryableNetworkError = (error: unknown): boolean => {
  // AbortError 可能是超时导致的，应重试
  if (error instanceof DOMException && error.name === 'AbortError') {
    return true;
  }

  // TypeError 通常表示网络层错误（如 DNS 解析失败、连接被拒绝等）
  if (error instanceof TypeError) {
    return true;
  }

  const message = getErrorMessage(error, '').toLowerCase();

  // 常见网络错误消息
  const networkErrorPatterns = [
    'failed to fetch',
    'networkerror',
    'network error',
    'load failed',
    'fetch failed',
    'the network connection was lost',
    'the internet connection appears to be offline',
    'net::err_',
    'econnrefused',
    'enotfound',
    'etimedout',
    'econnreset',
  ];

  return networkErrorPatterns.some((pattern) => message.includes(pattern));
};

export interface FetchRetryOptions {
  /** 最大重试次数（不含首次请求），默认 2 */
  maxRetries?: number;
  /** 基础延迟时间（毫秒），默认 1000 */
  baseDelayMs?: number;
  /** 最大延迟时间（毫秒），默认 5000 */
  maxDelayMs?: number;
  /** 重试时的回调，用于日志等 */
  onRetry?: (attempt: number, error: unknown, delayMs: number) => void;
}

const DEFAULT_RETRY_OPTIONS: Required<Omit<FetchRetryOptions, 'onRetry'>> = {
  maxRetries: 2,
  baseDelayMs: 1000,
  maxDelayMs: 5000,
};

/**
 * 带网络错误自动重试的 fetch 封装
 *
 * 重试策略:
 * - 仅对网络层错误重试（超时、连接失败等）
 * - HTTP 响应（包括 4xx/5xx）不重试，因为服务器已响应
 * - 使用指数退避：delay = baseDelay * 2^attempt（带随机抖动）
 */
export const fetchWithRetry = async (
  input: RequestInfo | URL,
  init?: RequestInit & { timeout?: number },
  retryOptions?: FetchRetryOptions,
): Promise<Response> => {
  const { maxRetries, baseDelayMs, maxDelayMs } = {
    ...DEFAULT_RETRY_OPTIONS,
    ...retryOptions,
  };
  const { onRetry } = retryOptions ?? {};

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fetchWithTimeout(input, init);
    } catch (error) {
      lastError = error;

      // 如果不是可重试的网络错误，或已达到最大重试次数，直接抛出
      if (!isRetryableNetworkError(error) || attempt >= maxRetries) {
        throw error;
      }

      // 计算延迟：指数退避 + 随机抖动（±20%）
      const exponentialDelay = baseDelayMs * Math.pow(2, attempt);
      const jitter = 0.8 + Math.random() * 0.4; // 0.8 ~ 1.2
      const delayMs = Math.min(exponentialDelay * jitter, maxDelayMs);

      onRetry?.(attempt + 1, error, delayMs);

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  // 不应该到达这里，但为了类型安全
  throw lastError;
};

/**
 * 验证是否为有效的 SyncApiResponse 基础结构
 */
const isSyncApiResponseBase = (value: unknown): value is UnknownRecord => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as UnknownRecord;
  return typeof record.success === 'boolean';
};

/**
 * 验证 SyncAuthResponse 响应结构
 * 成功时需包含 protected, role, canWrite
 */
export const validateSyncAuthResponse = (
  value: unknown,
): { valid: true; data: UnknownRecord } | { valid: false; reason: string } => {
  if (!isSyncApiResponseBase(value)) {
    return { valid: false, reason: 'Invalid response structure' };
  }

  const record = value as UnknownRecord;
  if (record.success === false) {
    // 失败响应只需要 error 字段
    if (typeof record.error !== 'string') {
      return { valid: false, reason: 'Missing error message in failure response' };
    }
    return { valid: true, data: record };
  }

  // 成功响应需验证 SyncAuthState 字段
  if (typeof record.protected !== 'boolean') {
    return { valid: false, reason: 'Missing or invalid "protected" field' };
  }
  if (typeof record.canWrite !== 'boolean') {
    return { valid: false, reason: 'Missing or invalid "canWrite" field' };
  }
  if (record.role !== 'admin' && record.role !== 'user') {
    return { valid: false, reason: 'Invalid "role" field' };
  }

  return { valid: true, data: record };
};

/**
 * 验证 SyncPostResponse 响应结构
 */
export const validateSyncPostResponse = (
  value: unknown,
): { valid: true; data: UnknownRecord } | { valid: false; reason: string } => {
  if (!isSyncApiResponseBase(value)) {
    return { valid: false, reason: 'Invalid response structure' };
  }

  const record = value as UnknownRecord;
  if (record.success === false) {
    // 失败响应允许带 conflict + data
    if (typeof record.error !== 'string') {
      return { valid: false, reason: 'Missing error message in failure response' };
    }
    return { valid: true, data: record };
  }

  // 成功响应需包含 data
  if (!record.data || typeof record.data !== 'object') {
    return { valid: false, reason: 'Missing or invalid "data" field in success response' };
  }

  return { valid: true, data: record };
};

/**
 * 验证 SyncGetResponse 响应结构
 */
export const validateSyncGetResponse = (
  value: unknown,
): { valid: true; data: UnknownRecord } | { valid: false; reason: string } => {
  if (!isSyncApiResponseBase(value)) {
    return { valid: false, reason: 'Invalid response structure' };
  }

  const record = value as UnknownRecord;
  if (record.success === false) {
    if (typeof record.error !== 'string') {
      return { valid: false, reason: 'Missing error message in failure response' };
    }
    return { valid: true, data: record };
  }

  // 成功响应 data 可为 null（空数据场景）
  if (record.data !== null && (typeof record.data !== 'object' || Array.isArray(record.data))) {
    return { valid: false, reason: 'Invalid "data" field in success response' };
  }

  return { valid: true, data: record };
};
