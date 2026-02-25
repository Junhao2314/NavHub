import { safeLocalStorageGetItem, safeLocalStorageSetItem } from './storage';

// Local Storage Keys
export const LOCAL_STORAGE_KEY = 'navhub_data_cache_v2';
export const AI_CONFIG_KEY = 'navhub_ai_config';
export const AI_API_KEY_SESSION_KEY = 'navhub_ai_api_key_session';
export const SEARCH_CONFIG_KEY = 'navhub_search_config';
export const FAVICON_CACHE_KEY = 'navhub_favicon_cache';
export const FAVICON_CUSTOM_KEY = 'navhub_favicon_custom'; // List of hostnames with user-customized icons
export const FAVICON_CUSTOM_META_KEY = 'navhub_favicon_custom_meta'; // Record<string, number> hostname -> updatedAt
export const SITE_SETTINGS_KEY = 'navhub_site_settings';
export const THEME_KEY = 'theme';

// Sync System Keys
export const DEVICE_ID_KEY = 'navhub_device_id';
export const DEVICE_INFO_KEY = 'navhub_device_info';
export const SYNC_META_KEY = 'navhub_sync_meta';
export const SYNC_PASSWORD_KEY = 'navhub_sync_password';
export const LAST_SYNC_KEY = 'navhub_last_sync';
export const SYNC_ADMIN_SESSION_KEY = 'navhub_sync_admin_session';
export const SYNC_PASSWORD_LOCK_UNTIL_KEY = 'navhub_sync_password_lock_until';

// Sync Auth Security (brute-force protection)
export const SYNC_PASSWORD_MAX_ATTEMPTS = 5;
export const SYNC_PASSWORD_LOCKOUT_MS = 60 * 60 * 1000; // 1 hour

// Privacy Vault Keys
export const PRIVATE_VAULT_KEY = 'navhub_private_vault_v1';
export const PRIVACY_PASSWORD_KEY = 'navhub_privacy_password';
export const PRIVACY_USE_SEPARATE_PASSWORD_KEY = 'navhub_privacy_use_separate_password';
export const PRIVACY_GROUP_ENABLED_KEY = 'navhub_privacy_group_enabled';
export const PRIVACY_PASSWORD_ENABLED_KEY = 'navhub_privacy_password_enabled';
export const PRIVACY_AUTO_UNLOCK_KEY = 'navhub_privacy_auto_unlock';
export const PRIVACY_SESSION_UNLOCKED_KEY = 'navhub_privacy_session_unlocked';
export const COMMON_CATEGORY_ID = 'common';
export const PRIVATE_CATEGORY_ID = '__private__';
export const COUNTDOWN_STORAGE_KEY = 'navhub_countdowns_v1';

// Sync Configuration
// 默认值偏保守：Cloudflare KV 免费额度写入较紧张，降低自动同步频率以减少 Write operations。
export const SYNC_DEBOUNCE_MS = 2 * 60 * 1000; // 2分钟内无新操作则触发同步
export const SYNC_STATS_DEBOUNCE_MS = 60 * 60 * 1000; // 点击统计等高频字段的批量同步间隔（1小时）
export const SYNC_API_ENDPOINT = '/api/sync';

// GitHub Repo URL
export const GITHUB_REPO_URL = 'https://github.com/Junhao2314/NavHub';

// 获取浏览器信息
const getBrowserInfo = (): string => {
  const ua = navigator.userAgent;
  if (ua.includes('Edg/')) return 'Edge';
  if (ua.includes('Chrome/')) return 'Chrome';
  if (ua.includes('Firefox/')) return 'Firefox';
  if (ua.includes('Safari/') && !ua.includes('Chrome')) return 'Safari';
  if (ua.includes('OPR/') || ua.includes('Opera/')) return 'Opera';
  return 'Unknown';
};

// 获取操作系统信息
const getOSInfo = (): string => {
  const ua = navigator.userAgent;
  if (ua.includes('Win')) return 'Windows';
  if (ua.includes('Mac')) return 'macOS';
  if (ua.includes('Linux')) return 'Linux';
  if (ua.includes('Android')) return 'Android';
  if (ua.includes('iOS') || ua.includes('iPhone') || ua.includes('iPad')) return 'iOS';
  return 'Unknown';
};

// 设备信息接口
export interface DeviceInfo {
  id: string;
  browser: string;
  os: string;
  createdAt: number;
}

let cachedDeviceId: string | null = null;

// 生成或获取设备唯一ID
export const getDeviceId = (): string => {
  if (cachedDeviceId) return cachedDeviceId;

  const storedDeviceId = safeLocalStorageGetItem(DEVICE_ID_KEY);
  if (storedDeviceId) {
    cachedDeviceId = storedDeviceId;

    // Ensure device info exists for the stored deviceId / 确保设备信息存在
    const existingInfo = safeLocalStorageGetItem(DEVICE_INFO_KEY);
    if (!existingInfo) {
      const deviceInfo: DeviceInfo = {
        id: storedDeviceId,
        browser: getBrowserInfo(),
        os: getOSInfo(),
        createdAt: Date.now(),
      };
      safeLocalStorageSetItem(DEVICE_INFO_KEY, JSON.stringify(deviceInfo));
    }

    return storedDeviceId;
  }

  const deviceId = `device_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  cachedDeviceId = deviceId;

  safeLocalStorageSetItem(DEVICE_ID_KEY, deviceId);

  // 保存设备信息
  const deviceInfo: DeviceInfo = {
    id: deviceId,
    browser: getBrowserInfo(),
    os: getOSInfo(),
    createdAt: Date.now(),
  };
  safeLocalStorageSetItem(DEVICE_INFO_KEY, JSON.stringify(deviceInfo));

  return deviceId;
};

// 获取设备信息
export const getDeviceInfo = (): DeviceInfo | null => {
  const infoStr = safeLocalStorageGetItem(DEVICE_INFO_KEY);
  if (!infoStr) return null;
  try {
    return JSON.parse(infoStr);
  } catch {
    return null;
  }
};
