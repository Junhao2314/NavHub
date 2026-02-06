import type { MutableRefObject } from 'react';
import i18n from '../../../config/i18n';
import type {
  AIConfig,
  Category,
  ExternalSearchSource,
  LinkItem,
  NavHubSyncData,
  SearchMode,
  SiteSettings,
  SyncRole,
  ThemeMode,
} from '../../../types';
import type { NotifyFn } from '../../../types/ui';
import {
  PRIVACY_AUTO_UNLOCK_KEY,
  PRIVACY_GROUP_ENABLED_KEY,
  PRIVACY_PASSWORD_ENABLED_KEY,
  PRIVACY_SESSION_UNLOCKED_KEY,
  PRIVACY_USE_SEPARATE_PASSWORD_KEY,
  PRIVATE_CATEGORY_ID,
  PRIVATE_VAULT_KEY,
} from '../../../utils/constants';
import { mergeFromCloud } from '../../../utils/faviconCache';
import {
  decryptPrivateVault,
  decryptPrivateVaultWithFallback,
  parsePlainPrivateVault,
} from '../../../utils/privateVault';
import { getPrivacyPassword, getSyncPassword } from '../../../utils/secrets';
import { decryptSensitiveConfigWithFallback } from '../../../utils/sensitiveConfig';
import {
  safeLocalStorageRemoveItem,
  safeLocalStorageSetItem,
  safeSessionStorageRemoveItem,
  safeSessionStorageSetItem,
} from '../../../utils/storage';

export const applyCloudDataToLocalState = (args: {
  data: NavHubSyncData;
  role: SyncRole;

  updateData: (links: LinkItem[], categories: Category[]) => void;
  restoreSearchConfigRef: MutableRefObject<
    ((config: { mode: SearchMode; externalSources: ExternalSearchSource[] }) => void) | null
  >;
  restoreSiteSettings: (settings: SiteSettings) => void;
  applyFromSync: (mode: ThemeMode) => void;

  aiConfig: AIConfig;
  restoreAIConfig: (config: AIConfig) => void;

  selectedCategory: string;
  setSelectedCategory: (categoryId: string) => void;

  privacyGroupEnabled: boolean;
  setPrivacyGroupEnabled: (enabled: boolean) => void;
  privacyPasswordEnabled: boolean;
  setPrivacyPasswordEnabled: (enabled: boolean) => void;
  privacyAutoUnlockEnabled: boolean;
  setPrivacyAutoUnlockEnabled: (enabled: boolean) => void;
  setUseSeparatePrivacyPassword: (useSeparate: boolean) => void;

  setPrivateVaultCipher: (cipher: string | null) => void;
  setPrivateLinks: (links: LinkItem[]) => void;
  isPrivateUnlocked: boolean;
  setIsPrivateUnlocked: (unlocked: boolean) => void;
  privateVaultPassword: string | null;
  setPrivateVaultPassword: (password: string | null) => void;
  setIsPrivateModalOpen: (open: boolean) => void;
  setEditingPrivateLink: (link: LinkItem | null) => void;
  setPrefillPrivateLink: (link: Partial<LinkItem> | null) => void;

  notify: NotifyFn;
}) => {
  const { data, role } = args;

  if (data.links && data.categories) {
    args.updateData(data.links, data.categories);
  }
  if (data.searchConfig) {
    args.restoreSearchConfigRef.current?.(data.searchConfig);
  }
  if (data.siteSettings) {
    args.restoreSiteSettings(data.siteSettings);
  }

  // Apply themeMode from sync (Requirements 1.2)
  if (data.themeMode) {
    args.applyFromSync(data.themeMode);
  }

  // Merge customFaviconCache from cloud (Requirements 3.3)
  if (data.customFaviconCache) {
    mergeFromCloud(data.customFaviconCache);
  }

  // 用户模式：仅展示管理员最新内容，不覆盖本地敏感配置（如 AI Key、隐私分组）
  if (role !== 'admin') return;

  // Apply privacyConfig from sync (admin only)
  if (data.privacyConfig && typeof data.privacyConfig === 'object') {
    const cfg = data.privacyConfig;
    const nextGroupEnabled = typeof cfg.groupEnabled === 'boolean' ? cfg.groupEnabled : undefined;
    const effectiveGroupEnabled = nextGroupEnabled ?? args.privacyGroupEnabled;

    if (typeof cfg.useSeparatePassword === 'boolean') {
      args.setUseSeparatePrivacyPassword(cfg.useSeparatePassword);
      safeLocalStorageSetItem(
        PRIVACY_USE_SEPARATE_PASSWORD_KEY,
        cfg.useSeparatePassword ? '1' : '0',
      );
    }

    if (typeof nextGroupEnabled === 'boolean') {
      args.setPrivacyGroupEnabled(nextGroupEnabled);
      safeLocalStorageSetItem(PRIVACY_GROUP_ENABLED_KEY, nextGroupEnabled ? '1' : '0');

      if (!nextGroupEnabled) {
        safeSessionStorageRemoveItem(PRIVACY_SESSION_UNLOCKED_KEY);
        if (args.selectedCategory === PRIVATE_CATEGORY_ID) {
          args.setSelectedCategory('all');
        }
        args.setIsPrivateUnlocked(false);
        args.setPrivateVaultPassword(null);
        args.setPrivateLinks([]);
        args.setIsPrivateModalOpen(false);
        args.setEditingPrivateLink(null);
        args.setPrefillPrivateLink(null);
      }
    }

    if (typeof cfg.passwordEnabled === 'boolean') {
      args.setPrivacyPasswordEnabled(cfg.passwordEnabled);
      safeLocalStorageSetItem(PRIVACY_PASSWORD_ENABLED_KEY, cfg.passwordEnabled ? '1' : '0');

      // Only apply lock/unlock side-effects when privacy group is enabled
      if (effectiveGroupEnabled) {
        if (cfg.passwordEnabled) {
          args.setIsPrivateUnlocked(false);
          args.setPrivateVaultPassword(null);
          args.setPrivateLinks([]);
          safeSessionStorageRemoveItem(PRIVACY_SESSION_UNLOCKED_KEY);
        } else {
          // Password is disabled, but the vault may still be encrypted from a previous configuration.
          // Unlock/conversion should happen only after we confirm plaintext is available.
          args.setPrivateVaultPassword(null);
        }
      }
    }

    if (typeof cfg.autoUnlockEnabled === 'boolean') {
      args.setPrivacyAutoUnlockEnabled(cfg.autoUnlockEnabled);
      safeLocalStorageSetItem(PRIVACY_AUTO_UNLOCK_KEY, cfg.autoUnlockEnabled ? '1' : '0');

      if (effectiveGroupEnabled) {
        if (!cfg.autoUnlockEnabled) {
          safeSessionStorageRemoveItem(PRIVACY_SESSION_UNLOCKED_KEY);
        } else if (args.isPrivateUnlocked) {
          safeSessionStorageSetItem(PRIVACY_SESSION_UNLOCKED_KEY, '1');
        }
      }
    }
  }

  if (data.aiConfig) {
    const localApiKey = args.aiConfig?.apiKey || '';
    const nextApiKey = data.aiConfig.apiKey ? data.aiConfig.apiKey : localApiKey;
    args.restoreAIConfig({ ...data.aiConfig, apiKey: nextApiKey });
  }

  // Decrypt and apply encryptedSensitiveConfig (Requirements 2.3)
  if (typeof data.encryptedSensitiveConfig === 'string' && data.encryptedSensitiveConfig) {
    // `encryptedSensitiveConfig` is encrypted using the sync password. When “独立隐私密码” is enabled,
    // the in-memory `privateVaultPassword` may differ, so always try sync password first.
    const candidates = [
      getSyncPassword().trim(),
      (args.privateVaultPassword || '').trim(),
      getPrivacyPassword().trim(),
    ];
    const hasAnyCandidate = candidates.some(Boolean);

    if (hasAnyCandidate) {
      decryptSensitiveConfigWithFallback(candidates, data.encryptedSensitiveConfig)
        .then((payload) => {
          if (payload.apiKey) {
            // Apply the decrypted apiKey to aiConfig
            const currentAiConfig = data.aiConfig ?? args.aiConfig;
            args.restoreAIConfig({ ...currentAiConfig, apiKey: payload.apiKey });
          }
        })
        .catch(() => {
          // Password incorrect or data corrupted - leave apiKey empty
          // User will need to re-enter password or apiKey
          console.warn('Failed to decrypt sensitive config - password may be incorrect');
          args.notify(i18n.t('errors.decryptionFailed'), 'warning');
        });
    }
  }

  // 同步 privateVault：管理员模式下云端数据会包含 privateVault
  if (typeof data.privateVault === 'string') {
    const privateVaultCipher = data.privateVault;
    args.setPrivateVaultCipher(privateVaultCipher);
    safeLocalStorageSetItem(PRIVATE_VAULT_KEY, privateVaultCipher);
    const nextGroupEnabled =
      typeof data.privacyConfig?.groupEnabled === 'boolean'
        ? data.privacyConfig.groupEnabled
        : args.privacyGroupEnabled;
    const nextPasswordEnabled =
      typeof data.privacyConfig?.passwordEnabled === 'boolean'
        ? data.privacyConfig.passwordEnabled
        : args.privacyPasswordEnabled;
    const plainVault = privateVaultCipher.trim()
      ? parsePlainPrivateVault(privateVaultCipher)
      : null;

    if (nextGroupEnabled && !nextPasswordEnabled) {
      args.setPrivateVaultPassword(null);
      if (!privateVaultCipher.trim()) {
        args.setPrivateLinks([]);
        args.setIsPrivateUnlocked(true);
        if (args.privacyAutoUnlockEnabled) {
          safeSessionStorageSetItem(PRIVACY_SESSION_UNLOCKED_KEY, '1');
        }
      } else if (plainVault) {
        args.setPrivateLinks(plainVault.links || []);
        args.setIsPrivateUnlocked(true);
        if (args.privacyAutoUnlockEnabled) {
          safeSessionStorageSetItem(PRIVACY_SESSION_UNLOCKED_KEY, '1');
        }
      } else {
        // Vault is encrypted while password protection is disabled: keep locked and avoid accidental overwrite.
        args.setPrivateLinks([]);
        args.setIsPrivateUnlocked(false);
        safeSessionStorageRemoveItem(PRIVACY_SESSION_UNLOCKED_KEY);
        const candidates = [getSyncPassword().trim(), getPrivacyPassword().trim()];

        if (candidates.some(Boolean)) {
          decryptPrivateVaultWithFallback(candidates, privateVaultCipher)
            .then((payload) => {
              const plaintext = JSON.stringify({ links: payload.links || [] });
              safeLocalStorageSetItem(PRIVATE_VAULT_KEY, plaintext);
              args.setPrivateVaultCipher(plaintext);
              args.setPrivateLinks(payload.links || []);
              args.setIsPrivateUnlocked(true);
              if (args.privacyAutoUnlockEnabled) {
                safeSessionStorageSetItem(PRIVACY_SESSION_UNLOCKED_KEY, '1');
              }
            })
            .catch(() => {
              // Ignore: user may need to provide a password on this device to recover the vault
            });
        }
      }
    } else if (plainVault && args.isPrivateUnlocked) {
      args.setPrivateLinks(plainVault.links || []);
    } else if (args.isPrivateUnlocked && args.privateVaultPassword) {
      decryptPrivateVault(args.privateVaultPassword, privateVaultCipher)
        .then((payload) => args.setPrivateLinks(payload.links || []))
        .catch(() => {
          args.setIsPrivateUnlocked(false);
          args.setPrivateLinks([]);
          args.setPrivateVaultPassword(null);
          args.notify(i18n.t('privacy.lockedPleaseReunlock'), 'warning');
        });
    }
  } else if (data.privateVault === null) {
    // 云端明确清空了 privateVault（区别于 undefined 表示未传递）
    args.setPrivateVaultCipher(null);
    safeLocalStorageRemoveItem(PRIVATE_VAULT_KEY);
    args.setPrivateLinks([]);
    args.setIsPrivateUnlocked(false);
    args.setPrivateVaultPassword(null);
  }
};
