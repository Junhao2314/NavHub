// Local Storage Keys
export const LOCAL_STORAGE_KEY = 'ynav_data_cache_v2';
export const AI_CONFIG_KEY = 'ynav_ai_config';
export const SEARCH_CONFIG_KEY = 'ynav_search_config';
export const FAVICON_CACHE_KEY = 'ynav_favicon_cache';
export const SITE_SETTINGS_KEY = 'ynav_site_settings';
export const THEME_KEY = 'theme';

// Sync System Keys
export const DEVICE_ID_KEY = 'ynav_device_id';
export const SYNC_META_KEY = 'ynav_sync_meta';
export const SYNC_PASSWORD_KEY = 'ynav_sync_password';
export const LAST_SYNC_KEY = 'ynav_last_sync';

// Privacy Vault Keys
export const PRIVATE_VAULT_KEY = 'ynav_private_vault_v1';
export const PRIVACY_PASSWORD_KEY = 'ynav_privacy_password';
export const PRIVACY_USE_SEPARATE_PASSWORD_KEY = 'ynav_privacy_use_separate_password';
export const PRIVACY_GROUP_ENABLED_KEY = 'ynav_privacy_group_enabled';
export const PRIVACY_AUTO_UNLOCK_KEY = 'ynav_privacy_auto_unlock';
export const PRIVACY_SESSION_UNLOCKED_KEY = 'ynav_privacy_session_unlocked';
export const PRIVATE_CATEGORY_ID = '__private__';

// Sync Configuration
export const SYNC_DEBOUNCE_MS = 3000; // 3秒内无新操作则触发同步
export const SYNC_API_ENDPOINT = '/api/sync';

// GitHub Repo URL
export const GITHUB_REPO_URL = 'https://github.com/yml2213/Y-Nav.git';

// 生成或获取设备唯一ID
export const getDeviceId = (): string => {
    let deviceId = localStorage.getItem(DEVICE_ID_KEY);
    if (!deviceId) {
        deviceId = `device_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        localStorage.setItem(DEVICE_ID_KEY, deviceId);
    }
    return deviceId;
};
