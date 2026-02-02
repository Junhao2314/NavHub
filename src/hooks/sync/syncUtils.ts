/**
 * 同步引擎工具函数
 */

import { AIConfig, NavHubSyncData, SyncMetadata } from '../../types';
import { SYNC_META_KEY } from '../../utils/constants';
import { getErrorMessage } from '../../utils/error';
import {
  safeLocalStorageGetItem,
  safeLocalStorageSetItem,
} from '../../utils/storage';

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
    return JSON.parse(stored) as SyncMetadata;
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
