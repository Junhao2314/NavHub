import {
  PRIVACY_PASSWORD_KEY,
  SYNC_ADMIN_SESSION_KEY,
  SYNC_PASSWORD_KEY
} from './constants';
import {
  safeLocalStorageGetItem,
  safeLocalStorageRemoveItem,
  safeLocalStorageSetItem,
  safeSessionStorageGetItem,
  safeSessionStorageRemoveItem,
  safeSessionStorageSetItem
} from './storage';

const getSessionValueWithLegacyLocalMigration = (key: string): string => {
  const sessionValue = safeSessionStorageGetItem(key);
  if (sessionValue !== null) {
    safeLocalStorageRemoveItem(key);
    return sessionValue;
  }

  const legacyValue = safeLocalStorageGetItem(key);
  if (legacyValue === null) return '';

  if (!legacyValue) {
    safeLocalStorageRemoveItem(key);
    return '';
  }

  const written = safeSessionStorageSetItem(key, legacyValue);
  if (written) {
    safeLocalStorageRemoveItem(key);
  }
  return legacyValue;
};

export const getSyncPassword = (): string => (
  getSessionValueWithLegacyLocalMigration(SYNC_PASSWORD_KEY)
);

export const setSyncPassword = (password: string): void => {
  if (password) {
    const written = safeSessionStorageSetItem(SYNC_PASSWORD_KEY, password);
    if (written) {
      safeLocalStorageRemoveItem(SYNC_PASSWORD_KEY);
    } else {
      safeLocalStorageSetItem(SYNC_PASSWORD_KEY, password);
    }
  } else {
    safeSessionStorageRemoveItem(SYNC_PASSWORD_KEY);
    safeLocalStorageRemoveItem(SYNC_PASSWORD_KEY);
  }
};

export const clearSyncPassword = (): void => {
  safeSessionStorageRemoveItem(SYNC_PASSWORD_KEY);
  safeLocalStorageRemoveItem(SYNC_PASSWORD_KEY);
};

export const isSyncAdminSession = (): boolean => (
  getSessionValueWithLegacyLocalMigration(SYNC_ADMIN_SESSION_KEY) === '1'
);

export const setSyncAdminSession = (enabled: boolean): void => {
  safeLocalStorageRemoveItem(SYNC_ADMIN_SESSION_KEY);
  if (enabled) {
    safeSessionStorageSetItem(SYNC_ADMIN_SESSION_KEY, '1');
  } else {
    safeSessionStorageRemoveItem(SYNC_ADMIN_SESSION_KEY);
  }
};

export const clearSyncAdminSession = (): void => {
  safeSessionStorageRemoveItem(SYNC_ADMIN_SESSION_KEY);
  safeLocalStorageRemoveItem(SYNC_ADMIN_SESSION_KEY);
};

export const getPrivacyPassword = (): string => (
  getSessionValueWithLegacyLocalMigration(PRIVACY_PASSWORD_KEY)
);

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

export const clearPrivacyPassword = (): void => {
  safeSessionStorageRemoveItem(PRIVACY_PASSWORD_KEY);
  safeLocalStorageRemoveItem(PRIVACY_PASSWORD_KEY);
};
