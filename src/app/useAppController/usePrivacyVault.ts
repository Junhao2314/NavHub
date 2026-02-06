import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import i18n from '../../config/i18n';
import type { Category, LinkItem } from '../../types';
import type { ConfirmFn, NotifyFn } from '../../types/ui';
import {
  PRIVACY_AUTO_UNLOCK_KEY,
  PRIVACY_GROUP_ENABLED_KEY,
  PRIVACY_PASSWORD_ENABLED_KEY,
  PRIVACY_SESSION_UNLOCKED_KEY,
  PRIVACY_USE_SEPARATE_PASSWORD_KEY,
  PRIVATE_CATEGORY_ID,
  PRIVATE_VAULT_KEY,
} from '../../utils/constants';
import { generateId } from '../../utils/id';
import {
  decryptPrivateVault,
  decryptPrivateVaultWithFallback,
  encryptPrivateVault,
  parsePlainPrivateVault,
} from '../../utils/privateVault';
import {
  clearPrivacyPassword,
  getPrivacyPassword,
  getSyncPassword,
  setPrivacyPassword,
} from '../../utils/secrets';
import {
  safeLocalStorageGetItem,
  safeLocalStorageRemoveItem,
  safeLocalStorageSetItem,
  safeSessionStorageGetItem,
  safeSessionStorageRemoveItem,
  safeSessionStorageSetItem,
} from '../../utils/storage';

export interface UsePrivacyVaultOptions {
  notify: NotifyFn;
  confirm: ConfirmFn;
  selectedCategory: string;
  setSelectedCategory: (categoryId: string) => void;
  setSidebarOpen: (open: boolean) => void;
}

export const usePrivacyVault = ({
  notify,
  confirm,
  selectedCategory,
  setSelectedCategory,
  setSidebarOpen,
}: UsePrivacyVaultOptions) => {
  const [privateVaultCipher, setPrivateVaultCipher] = useState<string | null>(null);
  const [privateLinks, setPrivateLinks] = useState<LinkItem[]>([]);
  const [isPrivateUnlocked, setIsPrivateUnlocked] = useState(false);
  const [privateVaultPassword, setPrivateVaultPassword] = useState<string | null>(null);
  const [useSeparatePrivacyPassword, setUseSeparatePrivacyPassword] = useState(false);
  const [privacyGroupEnabled, setPrivacyGroupEnabled] = useState(false);
  const [privacyPasswordEnabled, setPrivacyPasswordEnabled] = useState(true);
  const [privacyAutoUnlockEnabled, setPrivacyAutoUnlockEnabled] = useState(false);
  const [isTogglingPrivacyPassword, setIsTogglingPrivacyPassword] = useState(false);
  const togglingPrivacyPasswordRef = useRef(false);
  const autoUnlockAttemptedRef = useRef(false);
  const [isPrivateModalOpen, setIsPrivateModalOpen] = useState(false);
  const [editingPrivateLink, setEditingPrivateLink] = useState<LinkItem | null>(null);
  const [prefillPrivateLink, setPrefillPrivateLink] = useState<Partial<LinkItem> | null>(null);

  useEffect(() => {
    setPrivateVaultCipher(safeLocalStorageGetItem(PRIVATE_VAULT_KEY));
    setUseSeparatePrivacyPassword(
      safeLocalStorageGetItem(PRIVACY_USE_SEPARATE_PASSWORD_KEY) === '1',
    );
    setPrivacyGroupEnabled(safeLocalStorageGetItem(PRIVACY_GROUP_ENABLED_KEY) === '1');
    setPrivacyPasswordEnabled(safeLocalStorageGetItem(PRIVACY_PASSWORD_ENABLED_KEY) !== '0');
    setPrivacyAutoUnlockEnabled(safeLocalStorageGetItem(PRIVACY_AUTO_UNLOCK_KEY) === '1');
  }, []);

  const privateCategory = useMemo<Category>(
    () => ({
      id: PRIVATE_CATEGORY_ID,
      name: i18n.t('privacy.groupName'),
      icon: 'Lock',
    }),
    [],
  );

  const privateCategories = useMemo(() => [privateCategory], [privateCategory]);

  const resolvePrivacyPassword = useCallback(
    (input?: string) => {
      const trimmed = input?.trim();
      if (trimmed) return trimmed;
      if (useSeparatePrivacyPassword) {
        return getPrivacyPassword().trim();
      }
      return getSyncPassword().trim();
    },
    [useSeparatePrivacyPassword],
  );

  const handleUnlockPrivateVault = useCallback(
    async (input?: string) => {
      const plain = privateVaultCipher ? parsePlainPrivateVault(privateVaultCipher) : null;
      if (plain) {
        setPrivateLinks(plain.links || []);
        setIsPrivateUnlocked(true);
        setPrivateVaultPassword(null);
        if (privacyAutoUnlockEnabled) {
          safeSessionStorageSetItem(PRIVACY_SESSION_UNLOCKED_KEY, '1');
        }
        return true;
      }

      // 如果密码功能已禁用，直接解锁
      if (!privacyPasswordEnabled) {
        setPrivateVaultPassword(null);
        if (!privateVaultCipher || !privateVaultCipher.trim()) {
          setPrivateLinks([]);
          setIsPrivateUnlocked(true);
          if (privacyAutoUnlockEnabled) {
            safeSessionStorageSetItem(PRIVACY_SESSION_UNLOCKED_KEY, '1');
          }
          return true;
        }

        // Password is disabled but vault is still encrypted -> require a one-time conversion using the old password.
        const candidates = [
          (input || '').trim(),
          getSyncPassword().trim(),
          getPrivacyPassword().trim(),
        ].filter(Boolean);

        if (candidates.length === 0) {
          setPrivateLinks([]);
          setIsPrivateUnlocked(false);
          safeSessionStorageRemoveItem(PRIVACY_SESSION_UNLOCKED_KEY);
          if (input !== undefined) {
            notify(i18n.t('privacy.unlockHintNeedsConversion'), 'warning');
          }
          return false;
        }

        try {
          const payload = await decryptPrivateVaultWithFallback(candidates, privateVaultCipher);
          const plaintext = JSON.stringify({ links: payload.links || [] });
          safeLocalStorageSetItem(PRIVATE_VAULT_KEY, plaintext);
          setPrivateVaultCipher(plaintext);
          setPrivateLinks(payload.links || []);
          setIsPrivateUnlocked(true);
          if (privacyAutoUnlockEnabled) {
            safeSessionStorageSetItem(PRIVACY_SESSION_UNLOCKED_KEY, '1');
          }
          return true;
        } catch {
          setPrivateLinks([]);
          setIsPrivateUnlocked(false);
          safeSessionStorageRemoveItem(PRIVACY_SESSION_UNLOCKED_KEY);
          if (input !== undefined) {
            notify(i18n.t('privacy.oldPasswordWrongOrCorrupted'), 'error');
          }
          return false;
        }
      }

      const password = resolvePrivacyPassword(input);
      if (!password) {
        notify(i18n.t('privacy.enterPrivacyPasswordFirst'), 'warning');
        return false;
      }

      if (!useSeparatePrivacyPassword) {
        const syncPassword = getSyncPassword().trim();
        if (!syncPassword) {
          notify(i18n.t('privacy.setSyncPasswordBeforeUnlock'), 'warning');
          return false;
        }
        if (password !== syncPassword) {
          notify(i18n.t('privacy.syncPasswordMismatch'), 'error');
          return false;
        }
      }

      if (!privateVaultCipher) {
        setPrivateLinks([]);
        setIsPrivateUnlocked(true);
        setPrivateVaultPassword(password);
        if (useSeparatePrivacyPassword) {
          setPrivacyPassword(password);
        }
        if (privacyAutoUnlockEnabled) {
          safeSessionStorageSetItem(PRIVACY_SESSION_UNLOCKED_KEY, '1');
        }
        return true;
      }

      try {
        const payload = await decryptPrivateVault(password, privateVaultCipher);
        setPrivateLinks(payload.links || []);
        setIsPrivateUnlocked(true);
        setPrivateVaultPassword(password);
        if (useSeparatePrivacyPassword) {
          setPrivacyPassword(password);
        }
        if (privacyAutoUnlockEnabled) {
          safeSessionStorageSetItem(PRIVACY_SESSION_UNLOCKED_KEY, '1');
        }
        return true;
      } catch {
        notify(i18n.t('privacy.passwordWrongOrCorrupted'), 'error');
        return false;
      }
    },
    [
      privateVaultCipher,
      notify,
      resolvePrivacyPassword,
      useSeparatePrivacyPassword,
      privacyAutoUnlockEnabled,
      privacyPasswordEnabled,
    ],
  );

  const persistPrivateVault = useCallback(
    async (nextLinks: LinkItem[], passwordOverride?: string) => {
      // 如果密码功能已禁用，直接保存链接到本地（不加密）
      if (!privacyPasswordEnabled) {
        if (
          privateVaultCipher &&
          privateVaultCipher.trim() &&
          !parsePlainPrivateVault(privateVaultCipher)
        ) {
          notify(i18n.t('privacy.needsConversionBeforeSave'), 'warning');
          return false;
        }
        safeLocalStorageSetItem(PRIVATE_VAULT_KEY, JSON.stringify({ links: nextLinks }));
        setPrivateVaultCipher(JSON.stringify({ links: nextLinks }));
        setPrivateLinks(nextLinks);
        setIsPrivateUnlocked(true);
        setPrivateVaultPassword(null);
        return true;
      }

      const password = (
        passwordOverride ||
        privateVaultPassword ||
        resolvePrivacyPassword()
      ).trim();
      if (!password) {
        notify(i18n.t('privacy.setPrivacyPasswordFirst'), 'warning');
        return false;
      }

      try {
        const cipher = await encryptPrivateVault(password, { links: nextLinks });
        safeLocalStorageSetItem(PRIVATE_VAULT_KEY, cipher);
        setPrivateVaultCipher(cipher);
        setPrivateLinks(nextLinks);
        setIsPrivateUnlocked(true);
        setPrivateVaultPassword(password);
        return true;
      } catch {
        notify(i18n.t('privacy.encryptionFailedRetry'), 'error');
        return false;
      }
    },
    [
      notify,
      privateVaultCipher,
      privateVaultPassword,
      resolvePrivacyPassword,
      privacyPasswordEnabled,
    ],
  );

  const handleSwitchPrivacyMode = useCallback(
    async (payload: { useSeparatePassword: boolean; oldPassword: string; newPassword: string }) => {
      const { useSeparatePassword, oldPassword, newPassword } = payload;
      const trimmedOld = oldPassword.trim();
      const trimmedNew = newPassword.trim();
      const syncPassword = getSyncPassword().trim();

      if (!trimmedOld || !trimmedNew) {
        notify(i18n.t('privacy.fillOldAndNewPassword'), 'warning');
        return false;
      }

      if (useSeparatePassword && !syncPassword) {
        notify(i18n.t('privacy.setSyncPasswordBeforeSeparateMode'), 'warning');
        return false;
      }

      if (!useSeparatePassword && trimmedNew !== syncPassword) {
        notify(i18n.t('privacy.newPasswordMustMatchSyncPassword'), 'warning');
        return false;
      }

      const expectedOld = useSeparatePrivacyPassword ? getPrivacyPassword().trim() : syncPassword;

      if (expectedOld && trimmedOld !== expectedOld) {
        notify(i18n.t('privacy.oldPasswordIncorrect'), 'error');
        return false;
      }

      let nextLinks: LinkItem[] = privateLinks;
      if (privateVaultCipher) {
        try {
          const payloadData = await decryptPrivateVault(trimmedOld, privateVaultCipher);
          nextLinks = payloadData.links || [];
        } catch {
          notify(i18n.t('privacy.oldPasswordIncorrectOrCorrupted'), 'error');
          return false;
        }
      }

      // Re-encrypt privateVault with new password (Requirements 5.2)
      if (privateVaultCipher || nextLinks.length > 0) {
        const cipher = await encryptPrivateVault(trimmedNew, { links: nextLinks });
        safeLocalStorageSetItem(PRIVATE_VAULT_KEY, cipher);
        setPrivateVaultCipher(cipher);
      } else {
        safeLocalStorageRemoveItem(PRIVATE_VAULT_KEY);
        setPrivateVaultCipher(null);
      }

      if (useSeparatePassword) {
        setPrivacyPassword(trimmedNew);
        safeLocalStorageSetItem(PRIVACY_USE_SEPARATE_PASSWORD_KEY, '1');
      } else {
        clearPrivacyPassword();
        safeLocalStorageSetItem(PRIVACY_USE_SEPARATE_PASSWORD_KEY, '0');
      }

      setUseSeparatePrivacyPassword(useSeparatePassword);
      setPrivateLinks(nextLinks);
      setIsPrivateUnlocked(true);
      setPrivateVaultPassword(trimmedNew);
      notify(i18n.t('privacy.conversionComplete'), 'success');
      return true;
    },
    [notify, privateLinks, privateVaultCipher, useSeparatePrivacyPassword],
  );

  const closePrivateModal = useCallback(() => {
    setIsPrivateModalOpen(false);
    setEditingPrivateLink(null);
    setPrefillPrivateLink(null);
  }, []);

  const openPrivateAddModal = useCallback(() => {
    if (!isPrivateUnlocked) {
      notify(i18n.t('privacy.unlockFirst'), 'warning');
      return;
    }
    setEditingPrivateLink(null);
    setPrefillPrivateLink(null);
    setIsPrivateModalOpen(true);
  }, [isPrivateUnlocked, notify]);

  const openPrivateEditModal = useCallback(
    (link: LinkItem) => {
      if (!isPrivateUnlocked) {
        notify(i18n.t('privacy.unlockFirst'), 'warning');
        return;
      }
      setEditingPrivateLink(link);
      setIsPrivateModalOpen(true);
    },
    [isPrivateUnlocked, notify],
  );

  const handlePrivateAddLink = useCallback(
    async (data: Omit<LinkItem, 'id' | 'createdAt'>) => {
      if (!isPrivateUnlocked) {
        notify(i18n.t('privacy.unlockFirst'), 'warning');
        return;
      }
      const now = Date.now();
      const maxOrder = privateLinks.reduce((max, link) => {
        const order = link.order !== undefined ? link.order : link.createdAt;
        return Math.max(max, order);
      }, -1);
      const newLink: LinkItem = {
        ...data,
        id: generateId(),
        createdAt: now,
        categoryId: PRIVATE_CATEGORY_ID,
        pinned: false,
        pinnedOrder: undefined,
        order: maxOrder + 1,
      };
      await persistPrivateVault([...privateLinks, newLink]);
    },
    [isPrivateUnlocked, notify, persistPrivateVault, privateLinks],
  );

  const handlePrivateEditLink = useCallback(
    async (data: Omit<LinkItem, 'id' | 'createdAt'>) => {
      if (!isPrivateUnlocked) {
        notify(i18n.t('privacy.unlockFirst'), 'warning');
        return;
      }
      if (!editingPrivateLink) {
        notify(i18n.t('privacy.linkNotFoundToEdit'), 'warning');
        return;
      }
      const updatedLinks = privateLinks.map((link) =>
        link.id === editingPrivateLink.id
          ? {
              ...link,
              ...data,
              categoryId: PRIVATE_CATEGORY_ID,
              pinned: false,
              pinnedOrder: undefined,
            }
          : link,
      );
      await persistPrivateVault(updatedLinks);
      setEditingPrivateLink(null);
    },
    [editingPrivateLink, isPrivateUnlocked, notify, persistPrivateVault, privateLinks],
  );

  const handlePrivateDeleteLink = useCallback(
    async (id: string) => {
      if (!isPrivateUnlocked) {
        notify(i18n.t('privacy.unlockFirst'), 'warning');
        return;
      }
      const shouldDelete = await confirm({
        title: i18n.t('privacy.deletePrivateLinkTitle'),
        message: i18n.t('privacy.deletePrivateLinkMessage'),
        confirmText: i18n.t('common.delete'),
        cancelText: i18n.t('common.cancel'),
        variant: 'danger',
      });

      if (!shouldDelete) return;
      const updated = privateLinks.filter((link) => link.id !== id);
      await persistPrivateVault(updated);
    },
    [confirm, isPrivateUnlocked, notify, persistPrivateVault, privateLinks],
  );

  const handleTogglePrivacyGroup = useCallback(
    (enabled: boolean) => {
      setPrivacyGroupEnabled(enabled);
      safeLocalStorageSetItem(PRIVACY_GROUP_ENABLED_KEY, enabled ? '1' : '0');

      if (!enabled) {
        safeSessionStorageRemoveItem(PRIVACY_SESSION_UNLOCKED_KEY);
        if (selectedCategory === PRIVATE_CATEGORY_ID) {
          setSelectedCategory('all');
        }
        setIsPrivateUnlocked(false);
        setPrivateVaultPassword(null);
        setPrivateLinks([]);
        setIsPrivateModalOpen(false);
        setEditingPrivateLink(null);
        setPrefillPrivateLink(null);
      }
    },
    [selectedCategory, setSelectedCategory],
  );

  const handleTogglePrivacyAutoUnlock = useCallback(
    (enabled: boolean) => {
      setPrivacyAutoUnlockEnabled(enabled);
      safeLocalStorageSetItem(PRIVACY_AUTO_UNLOCK_KEY, enabled ? '1' : '0');
      if (!enabled) {
        safeSessionStorageRemoveItem(PRIVACY_SESSION_UNLOCKED_KEY);
      } else if (isPrivateUnlocked) {
        safeSessionStorageSetItem(PRIVACY_SESSION_UNLOCKED_KEY, '1');
      }
    },
    [isPrivateUnlocked],
  );

  const handleTogglePrivacyPassword = useCallback(
    (enabled: boolean) => {
      if (togglingPrivacyPasswordRef.current) return;

      void (async () => {
        try {
          togglingPrivacyPasswordRef.current = true;
          setIsTogglingPrivacyPassword(true);

          if (!enabled) {
            // 关闭密码保护时，确保 privateVault 以明文格式存储，避免跨设备同步后无法读取
            let nextLinks: LinkItem[] = privateLinks;

            if (privateVaultCipher) {
              const plain = parsePlainPrivateVault(privateVaultCipher);
              if (plain) {
                nextLinks = plain.links || [];
              } else if (!isPrivateUnlocked) {
                const password = resolvePrivacyPassword();
                if (!password) {
                  notify(i18n.t('privacy.unlockBeforeDisablePassword'), 'warning');
                  return;
                }
                try {
                  const payload = await decryptPrivateVault(password, privateVaultCipher);
                  nextLinks = payload.links || [];
                } catch {
                  notify(i18n.t('privacy.unlockBeforeDisablePassword'), 'warning');
                  return;
                }
              }
            }

            const plaintext = JSON.stringify({ links: nextLinks });
            safeLocalStorageSetItem(PRIVATE_VAULT_KEY, plaintext);
            setPrivateVaultCipher(plaintext);
            setPrivateLinks(nextLinks);

            setPrivacyPasswordEnabled(false);
            safeLocalStorageSetItem(PRIVACY_PASSWORD_ENABLED_KEY, '0');

            setIsPrivateUnlocked(true);
            setPrivateVaultPassword(null);
            if (privacyAutoUnlockEnabled) {
              safeSessionStorageSetItem(PRIVACY_SESSION_UNLOCKED_KEY, '1');
            } else {
              safeSessionStorageRemoveItem(PRIVACY_SESSION_UNLOCKED_KEY);
            }
            return;
          }

          // 开启密码保护：若当前为明文格式，先加密再锁定
          let nextCipher: string | null = privateVaultCipher;
          const plain = nextCipher ? parsePlainPrivateVault(nextCipher) : null;

          if (plain) {
            const password = resolvePrivacyPassword();
            if (!password) {
              notify(i18n.t('privacy.setPrivacyPasswordFirst'), 'warning');
              return;
            }
            try {
              nextCipher = await encryptPrivateVault(password, plain);
            } catch {
              notify(i18n.t('privacy.encryptionFailedRetry'), 'error');
              return;
            }
          } else if (!nextCipher && privateLinks.length > 0) {
            const password = resolvePrivacyPassword();
            if (!password) {
              notify(i18n.t('privacy.setPrivacyPasswordFirst'), 'warning');
              return;
            }
            try {
              nextCipher = await encryptPrivateVault(password, { links: privateLinks });
            } catch {
              notify(i18n.t('privacy.encryptionFailedRetry'), 'error');
              return;
            }
          }

          if (nextCipher) {
            safeLocalStorageSetItem(PRIVATE_VAULT_KEY, nextCipher);
            setPrivateVaultCipher(nextCipher);
          }

          setPrivacyPasswordEnabled(true);
          safeLocalStorageSetItem(PRIVACY_PASSWORD_ENABLED_KEY, '1');

          setIsPrivateUnlocked(false);
          setPrivateVaultPassword(null);
          setPrivateLinks([]);
          safeSessionStorageRemoveItem(PRIVACY_SESSION_UNLOCKED_KEY);
        } catch {
          notify(i18n.t('privacy.settingsUpdateFailedRetry'), 'error');
        } finally {
          togglingPrivacyPasswordRef.current = false;
          setIsTogglingPrivacyPassword(false);
        }
      })();
    },
    [
      isPrivateUnlocked,
      notify,
      privateLinks,
      privateVaultCipher,
      privacyAutoUnlockEnabled,
      resolvePrivacyPassword,
    ],
  );

  const handleSelectPrivate = useCallback(() => {
    if (!privacyGroupEnabled) {
      notify(i18n.t('privacy.groupDisabledCanEnableInSettings'), 'warning');
      return;
    }
    setSelectedCategory(PRIVATE_CATEGORY_ID);
    setSidebarOpen(false);
  }, [notify, privacyGroupEnabled, setSelectedCategory, setSidebarOpen]);

  // 自动解锁（同会话）
  useEffect(() => {
    if (!privacyGroupEnabled || !privacyAutoUnlockEnabled || isPrivateUnlocked) return;
    if (safeSessionStorageGetItem(PRIVACY_SESSION_UNLOCKED_KEY) !== '1') return;
    if (autoUnlockAttemptedRef.current) return;
    autoUnlockAttemptedRef.current = true;
    handleUnlockPrivateVault().then((success) => {
      if (!success) {
        safeSessionStorageRemoveItem(PRIVACY_SESSION_UNLOCKED_KEY);
      }
    });
  }, [privacyGroupEnabled, privacyAutoUnlockEnabled, isPrivateUnlocked, handleUnlockPrivateVault]);

  // 当密码禁用且隐私分组启用时，自动解锁
  useEffect(() => {
    if (privacyGroupEnabled && !privacyPasswordEnabled && !isPrivateUnlocked) {
      handleUnlockPrivateVault();
    }
  }, [privacyGroupEnabled, privacyPasswordEnabled, isPrivateUnlocked, handleUnlockPrivateVault]);

  useEffect(() => {
    autoUnlockAttemptedRef.current = false;
    if (!privacyGroupEnabled || !privacyAutoUnlockEnabled) return;
  }, [privacyGroupEnabled, privacyAutoUnlockEnabled]);

  // 收集隐私分组的已有标签
  const existingPrivateTags = useMemo(() => {
    const tagSet = new Set<string>();
    privateLinks.forEach((link) => {
      if (Array.isArray(link.tags)) {
        link.tags.forEach((tag) => {
          if (tag && tag.trim()) {
            tagSet.add(tag.trim());
          }
        });
      }
    });
    return Array.from(tagSet).sort((a, b) => a.localeCompare(b, 'zh-CN'));
  }, [privateLinks]);

  const privateCount = privacyGroupEnabled && isPrivateUnlocked ? privateLinks.length : 0;
  const privateVaultNeedsConversion = useMemo(() => {
    if (!privacyGroupEnabled) return false;
    if (privacyPasswordEnabled) return false;
    if (!privateVaultCipher || !privateVaultCipher.trim()) return false;
    return !parsePlainPrivateVault(privateVaultCipher);
  }, [privacyGroupEnabled, privacyPasswordEnabled, privateVaultCipher]);

  const privateUnlockHint = !privacyPasswordEnabled
    ? privateVaultNeedsConversion
      ? i18n.t('privacy.unlockHintNeedsConversion')
      : i18n.t('privacy.unlockHintNoPassword')
    : useSeparatePrivacyPassword
      ? i18n.t('privacy.unlockHintEnterSeparatePassword')
      : i18n.t('privacy.unlockHintEnterSyncPassword');
  const privateUnlockSubHint = !privacyPasswordEnabled
    ? privateVaultNeedsConversion
      ? i18n.t('privacy.unlockSubHintConversionPlain')
      : undefined
    : useSeparatePrivacyPassword
      ? i18n.t('privacy.unlockSubHintSeparateSessionCache')
      : i18n.t('privacy.unlockSubHintSyncPasswordFromSettings');

  return {
    privateVaultCipher,
    setPrivateVaultCipher,
    privateLinks,
    setPrivateLinks,
    isPrivateUnlocked,
    setIsPrivateUnlocked,
    privateVaultPassword,
    setPrivateVaultPassword,
    useSeparatePrivacyPassword,
    setUseSeparatePrivacyPassword,
    privacyGroupEnabled,
    setPrivacyGroupEnabled,
    privacyPasswordEnabled,
    setPrivacyPasswordEnabled,
    privacyAutoUnlockEnabled,
    setPrivacyAutoUnlockEnabled,
    isTogglingPrivacyPassword,
    isPrivateModalOpen,
    setIsPrivateModalOpen,
    editingPrivateLink,
    setEditingPrivateLink,
    prefillPrivateLink,
    setPrefillPrivateLink,
    privateCategories,
    existingPrivateTags,
    privateUnlockHint,
    privateUnlockSubHint,
    privateCount,
    privateVaultNeedsConversion,
    closePrivateModal,
    openPrivateAddModal,
    openPrivateEditModal,
    handleUnlockPrivateVault,
    handlePrivateAddLink,
    handlePrivateEditLink,
    handlePrivateDeleteLink,
    handleSwitchPrivacyMode,
    handleTogglePrivacyGroup,
    handleTogglePrivacyPassword,
    handleTogglePrivacyAutoUnlock,
    handleSelectPrivate,
  };
};
