/**
 * Secrets Management Module
 * 密钥管理模块
 *
 * Manages sensitive credentials with secure storage strategies.
 * 使用安全存储策略管理敏感凭证。
 *
 * Security design / 安全设计:
 * - Passwords stored in sessionStorage (cleared on tab close)
 *   密码存储在 sessionStorage（关闭标签页时清除）
 * - Fallback to localStorage if sessionStorage unavailable
 *   sessionStorage 不可用时回退到 localStorage
 */

import { PRIVACY_PASSWORD_KEY, SYNC_ADMIN_SESSION_KEY, SYNC_PASSWORD_KEY } from './constants';
import {
  safeLocalStorageGetItem,
  safeLocalStorageRemoveItem,
  safeLocalStorageSetItem,
  safeSessionStorageGetItem,
  safeSessionStorageRemoveItem,
  safeSessionStorageSetItem,
} from './storage';

/**
 * Read secret value with storage fallback
 * 读取密钥（带存储回退）
 *
 * Policy / 策略:
 * - Prefer sessionStorage (cleared on tab close) / 优先 sessionStorage
 * - Fall back to localStorage only when sessionStorage is not writable / 仅在 sessionStorage 不可写时回退到 localStorage
 */
const SESSION_STORAGE_PROBE_KEY = '__navhub_session_storage_probe__';
let cachedSessionStorageWritable: boolean | null = null;

const isSessionStorageWritable = (): boolean => {
  if (cachedSessionStorageWritable !== null) return cachedSessionStorageWritable;
  const written = safeSessionStorageSetItem(SESSION_STORAGE_PROBE_KEY, '1');
  if (written) {
    safeSessionStorageRemoveItem(SESSION_STORAGE_PROBE_KEY);
  }
  cachedSessionStorageWritable = written;
  return written;
};

const getSecretValue = (key: string): string => {
  const sessionValue = safeSessionStorageGetItem(key);
  if (sessionValue !== null) return sessionValue;

  if (isSessionStorageWritable()) {
    return '';
  }

  return safeLocalStorageGetItem(key) || '';
};

// ============ Sync Password / 同步密码 ============

/**
 * Get sync password
 * 获取同步密码
 */
export const getSyncPassword = (): string => getSecretValue(SYNC_PASSWORD_KEY);

/**
 * Set sync password
 * 设置同步密码
 *
 * @param password - Password to store (empty to clear) / 要存储的密码（空则清除）
 */
export const setSyncPassword = (password: string): void => {
  if (password) {
    // Try sessionStorage first, fallback to localStorage
    // 优先尝试 sessionStorage，回退到 localStorage
    const written = safeSessionStorageSetItem(SYNC_PASSWORD_KEY, password);
    if (written) {
      safeLocalStorageRemoveItem(SYNC_PASSWORD_KEY);
    } else {
      safeLocalStorageSetItem(SYNC_PASSWORD_KEY, password);
    }
  } else {
    // Clear from both storages / 从两个存储中清除
    safeSessionStorageRemoveItem(SYNC_PASSWORD_KEY);
    safeLocalStorageRemoveItem(SYNC_PASSWORD_KEY);
  }
};

/**
 * Clear sync password from all storages
 * 从所有存储中清除同步密码
 */
export const clearSyncPassword = (): void => {
  safeSessionStorageRemoveItem(SYNC_PASSWORD_KEY);
  safeLocalStorageRemoveItem(SYNC_PASSWORD_KEY);
};

// ============ Admin Session / 管理员会话 ============

/**
 * Check if current session is admin
 * 检查当前会话是否为管理员
 */
export const isSyncAdminSession = (): boolean =>
  getSecretValue(SYNC_ADMIN_SESSION_KEY) === '1';

/**
 * Set admin session status
 * 设置管理员会话状态
 *
 * @param enabled - Whether admin session is enabled / 是否启用管理员会话
 */
export const setSyncAdminSession = (enabled: boolean): void => {
  // Always clean up localStorage / 始终清理 localStorage
  safeLocalStorageRemoveItem(SYNC_ADMIN_SESSION_KEY);
  if (enabled) {
    safeSessionStorageSetItem(SYNC_ADMIN_SESSION_KEY, '1');
  } else {
    safeSessionStorageRemoveItem(SYNC_ADMIN_SESSION_KEY);
  }
};

/**
 * Clear admin session from all storages
 * 从所有存储中清除管理员会话
 */
export const clearSyncAdminSession = (): void => {
  safeSessionStorageRemoveItem(SYNC_ADMIN_SESSION_KEY);
  safeLocalStorageRemoveItem(SYNC_ADMIN_SESSION_KEY);
};

// ============ Privacy Password / 隐私密码 ============

/**
 * Get privacy vault password
 * 获取隐私保险库密码
 */
export const getPrivacyPassword = (): string => getSecretValue(PRIVACY_PASSWORD_KEY);

/**
 * Set privacy vault password
 * 设置隐私保险库密码
 *
 * @param password - Password to store (empty to clear) / 要存储的密码（空则清除）
 */
export const setPrivacyPassword = (password: string): void => {
  if (password) {
    const written = safeSessionStorageSetItem(PRIVACY_PASSWORD_KEY, password);
    if (written) {
      safeLocalStorageRemoveItem(PRIVACY_PASSWORD_KEY);
    } else {
      safeLocalStorageSetItem(PRIVACY_PASSWORD_KEY, password);
    }
  } else {
    safeSessionStorageRemoveItem(PRIVACY_PASSWORD_KEY);
    safeLocalStorageRemoveItem(PRIVACY_PASSWORD_KEY);
  }
};

/**
 * Clear privacy password from all storages
 * 从所有存储中清除隐私密码
 */
export const clearPrivacyPassword = (): void => {
  safeSessionStorageRemoveItem(PRIVACY_PASSWORD_KEY);
  safeLocalStorageRemoveItem(PRIVACY_PASSWORD_KEY);
};
