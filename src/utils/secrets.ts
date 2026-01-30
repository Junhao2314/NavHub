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
 * - Automatic migration from localStorage to sessionStorage
 *   自动从 localStorage 迁移到 sessionStorage
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
 * Get value from sessionStorage with legacy localStorage migration
 * 从 sessionStorage 获取值，并处理旧版 localStorage 迁移
 *
 * Migration flow / 迁移流程:
 * 1. Check sessionStorage first / 首先检查 sessionStorage
 * 2. If not found, check localStorage (legacy) / 如果没找到，检查 localStorage（旧版）
 * 3. Migrate legacy value to sessionStorage / 将旧版值迁移到 sessionStorage
 * 4. Remove from localStorage after migration / 迁移后从 localStorage 删除
 *
 * @param key - Storage key / 存储键名
 * @returns Value or empty string / 值或空字符串
 */
const getSessionValueWithLegacyLocalMigration = (key: string): string => {
  // Check sessionStorage first / 首先检查 sessionStorage
  const sessionValue = safeSessionStorageGetItem(key);
  if (sessionValue !== null) {
    // Clean up any legacy localStorage value / 清理任何旧版 localStorage 值
    safeLocalStorageRemoveItem(key);
    return sessionValue;
  }

  // Check for legacy localStorage value / 检查旧版 localStorage 值
  const legacyValue = safeLocalStorageGetItem(key);
  if (legacyValue === null) return '';

  if (!legacyValue) {
    safeLocalStorageRemoveItem(key);
    return '';
  }

  // Migrate to sessionStorage / 迁移到 sessionStorage
  const written = safeSessionStorageSetItem(key, legacyValue);
  if (written) {
    safeLocalStorageRemoveItem(key);
  }
  return legacyValue;
};

// ============ Sync Password / 同步密码 ============

/**
 * Get sync password
 * 获取同步密码
 */
export const getSyncPassword = (): string =>
  getSessionValueWithLegacyLocalMigration(SYNC_PASSWORD_KEY);

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
  getSessionValueWithLegacyLocalMigration(SYNC_ADMIN_SESSION_KEY) === '1';

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
export const getPrivacyPassword = (): string =>
  getSessionValueWithLegacyLocalMigration(PRIVACY_PASSWORD_KEY);

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
