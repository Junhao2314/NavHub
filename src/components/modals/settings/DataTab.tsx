import {
  Clock,
  Cloud,
  CloudDownload,
  Cpu,
  Database,
  Download,
  Eye,
  EyeOff,
  Lock,
  LogOut,
  RefreshCw,
  Trash2,
  Upload,
} from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { useI18n } from '../../../hooks/useI18n';
import { downloadJsonFile } from '../../../services/exportService';
import {
  Category,
  LinkItem,
  SyncGetBackupResponse,
  SyncListBackupsResponse,
  SyncRole,
  VerifySyncPasswordResult,
} from '../../../types';
import { SYNC_API_ENDPOINT, SYNC_PASSWORD_LOCK_UNTIL_KEY } from '../../../utils/constants';
import { getErrorMessage } from '../../../utils/error';
import {
  clearSyncAdminSession,
  clearSyncPassword,
  getSyncPassword,
  setSyncPassword,
} from '../../../utils/secrets';
import {
  safeLocalStorageGetItem,
  safeLocalStorageRemoveItem,
  safeLocalStorageSetItem,
} from '../../../utils/storage';
import { getSyncAuthHeaders } from '../../../utils/syncAuthHeaders';
import DuplicateChecker from './DuplicateChecker';

interface DataTabProps {
  onOpenImport: () => void;
  onClose: () => void;
  onRestoreBackup: (backupKey: string) => Promise<boolean>;
  onDeleteBackup: (backupKey: string) => Promise<boolean>;
  onSyncPasswordChange: (password: string) => void;
  onVerifySyncPassword: () => Promise<VerifySyncPasswordResult>;
  syncRole: SyncRole;
  isSyncProtected: boolean;
  useSeparatePrivacyPassword: boolean;
  onSwitchPrivacyMode: (payload: {
    useSeparatePassword: boolean;
    oldPassword: string;
    newPassword: string;
  }) => Promise<boolean>;
  privacyGroupEnabled: boolean;
  onTogglePrivacyGroup: (enabled: boolean) => void;
  privacyPasswordEnabled: boolean;
  isTogglingPrivacyPassword: boolean;
  onTogglePrivacyPassword: (enabled: boolean) => void;
  privacyAutoUnlockEnabled: boolean;
  onTogglePrivacyAutoUnlock: (enabled: boolean) => void;
  links?: LinkItem[];
  categories?: Category[];
  onDeleteLink?: (id: string) => void;
  onNavigateToCategory?: (categoryId: string) => void;
}

interface BackupItem {
  key: string;
  timestamp?: string;
  expiration?: number;
  kind?: 'auto' | 'manual' | 'rollback';
  deviceId?: string;
  updatedAt?: number;
  version?: number;
  browser?: string;
  os?: string;
  isCurrent?: boolean;
}

const getBackupKind = (backup: BackupItem): 'auto' | 'manual' => {
  if (backup.kind === 'manual' || backup.kind === 'rollback') return 'manual';
  return 'auto';
};

const SYNC_HISTORY_DISPLAY_LIMIT = 20;
const SYNC_HISTORY_PAGE_SIZE = 10;

const DataTab: React.FC<DataTabProps> = ({
  onOpenImport,
  onClose,
  onRestoreBackup,
  onDeleteBackup,
  onSyncPasswordChange,
  onVerifySyncPassword,
  syncRole,
  isSyncProtected,
  useSeparatePrivacyPassword,
  onSwitchPrivacyMode,
  privacyGroupEnabled,
  onTogglePrivacyGroup,
  privacyPasswordEnabled,
  isTogglingPrivacyPassword,
  onTogglePrivacyPassword,
  privacyAutoUnlockEnabled,
  onTogglePrivacyAutoUnlock,
  links = [],
  categories = [],
  onDeleteLink,
  onNavigateToCategory,
}) => {
  const { t, i18n } = useI18n();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isVerifyingSyncPassword, setIsVerifyingSyncPassword] = useState(false);
  const [syncPasswordMessage, setSyncPasswordMessage] = useState<string | null>(null);
  const [loginLockedUntil, setLoginLockedUntil] = useState<number | null>(null);
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [isSyncHistoryVisible, setIsSyncHistoryVisible] = useState(false);
  const [hasLoadedBackups, setHasLoadedBackups] = useState(false);
  const [syncHistoryPage, setSyncHistoryPage] = useState(1);
  const [isLoadingBackups, setIsLoadingBackups] = useState(false);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [restoringKey, setRestoringKey] = useState<string | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [exportingKey, setExportingKey] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [privacyTarget, setPrivacyTarget] = useState<'sync' | 'separate' | null>(null);
  const [privacyOldPassword, setPrivacyOldPassword] = useState('');
  const [privacyNewPassword, setPrivacyNewPassword] = useState('');
  const [showPrivacyOldPassword, setShowPrivacyOldPassword] = useState(false);
  const [showPrivacyNewPassword, setShowPrivacyNewPassword] = useState(false);
  const [privacyError, setPrivacyError] = useState<string | null>(null);
  const [isSwitchingPrivacyMode, setIsSwitchingPrivacyMode] = useState(false);

  useEffect(() => {
    setPassword(getSyncPassword());

    const lockedUntilStr = safeLocalStorageGetItem(SYNC_PASSWORD_LOCK_UNTIL_KEY);
    const lockedUntil = lockedUntilStr ? Number(lockedUntilStr) : Number.NaN;
    if (!Number.isNaN(lockedUntil) && lockedUntil > Date.now()) {
      setLoginLockedUntil(lockedUntil);
    } else {
      safeLocalStorageRemoveItem(SYNC_PASSWORD_LOCK_UNTIL_KEY);
    }
  }, []);

  useEffect(() => {
    if (!loginLockedUntil) return;
    const remaining = loginLockedUntil - Date.now();
    if (remaining <= 0) {
      setLoginLockedUntil(null);
      safeLocalStorageRemoveItem(SYNC_PASSWORD_LOCK_UNTIL_KEY);
      return;
    }
    const timer = setTimeout(() => {
      setLoginLockedUntil(null);
      safeLocalStorageRemoveItem(SYNC_PASSWORD_LOCK_UNTIL_KEY);
    }, remaining + 50);
    return () => clearTimeout(timer);
  }, [loginLockedUntil]);

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = e.target.value;
    setPassword(newVal);
    setSyncPasswordMessage(null);
    setSyncPassword(newVal);
    onSyncPasswordChange(newVal);
  };

  const getAuthHeaders = useCallback(getSyncAuthHeaders, []);

  const formatBackupTime = (backup: BackupItem) => {
    const locale = i18n.language === 'zh-CN' ? 'zh-CN' : 'en-US';
    if (backup.updatedAt) {
      return new Date(backup.updatedAt).toLocaleString(locale, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
    if (backup.timestamp) {
      return backup.timestamp.replace('T', ' ');
    }
    return t('common.unknownTime');
  };

  const formatDeviceLabel = (deviceId?: string, browser?: string, os?: string) => {
    const locale = i18n.language === 'zh-CN' ? 'zh-CN' : 'en-US';
    // 如果有浏览器和操作系统信息,优先显示
    if (browser && os) {
      return `${browser} • ${os}`;
    }

    // 否则使用原有的设备ID格式化逻辑
    if (!deviceId) return t('common.unknownDevice');
    const parts = deviceId.split('_');
    if (parts.length >= 3 && parts[0] === 'device') {
      const timestamp = Number(parts[1]);
      if (!Number.isNaN(timestamp)) {
        return `${t('common.device')} ${new Date(timestamp).toLocaleString(locale, {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })}`;
      }
    }
    return deviceId;
  };

  const fetchBackups = useCallback(async () => {
    setIsLoadingBackups(true);
    setBackupError(null);
    try {
      const response = await fetch(`${SYNC_API_ENDPOINT}?action=backups&t=${Date.now()}`, {
        headers: getAuthHeaders(),
        cache: 'no-store',
      });
      const result = (await response.json()) as SyncListBackupsResponse;
      if (result.success === false) {
        setBackupError(result.error || t('settings.data.fetchBackupsFailed'));
        setBackups([]);
        return;
      }
      const next = Array.isArray(result.backups) ? [...result.backups] : [];
      next.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      setBackups(next);
    } catch (error: unknown) {
      setBackupError(getErrorMessage(error, t('errors.networkError')));
    } finally {
      setIsLoadingBackups(false);
      setHasLoadedBackups(true);
    }
  }, [getAuthHeaders, t]);

  const handleRestoreBackup = useCallback(
    async (backupKey: string) => {
      setRestoringKey(backupKey);
      try {
        const success = await onRestoreBackup(backupKey);
        if (success && isSyncHistoryVisible) {
          await fetchBackups();
        }
      } finally {
        setRestoringKey(null);
      }
    },
    [fetchBackups, onRestoreBackup, isSyncHistoryVisible],
  );

  const handleDeleteBackup = useCallback(
    async (backupKey: string) => {
      const current = backups.find((item) => item.key === backupKey);
      if (current?.isCurrent) return;

      setDeletingKey(backupKey);
      try {
        const success = await onDeleteBackup(backupKey);
        if (success && isSyncHistoryVisible) {
          await fetchBackups();
        }
      } finally {
        setDeletingKey(null);
      }
    },
    [fetchBackups, onDeleteBackup, backups, isSyncHistoryVisible],
  );

  const handleExportBackup = useCallback(
    async (backup: BackupItem) => {
      setExportingKey(backup.key);
      setExportError(null);
      try {
        const response = await fetch(
          `${SYNC_API_ENDPOINT}?action=backup&backupKey=${encodeURIComponent(backup.key)}&t=${Date.now()}`,
          {
            headers: getAuthHeaders(),
            cache: 'no-store',
          },
        );
        const result = (await response.json()) as SyncGetBackupResponse;

        if (result.success === false) {
          setExportError(result.error || t('settings.data.exportFailed'));
          return;
        }

        if (!result.data) {
          setExportError(t('settings.data.exportFailed'));
          return;
        }

        const keySuffix = backup.key.startsWith('navhub:backup:')
          ? backup.key.replace('navhub:backup:', '')
          : `${Date.now()}`;
        downloadJsonFile(result.data, `navhub_backup_${keySuffix}.json`);
      } catch (error: unknown) {
        setExportError(getErrorMessage(error, t('errors.networkError')));
      } finally {
        setExportingKey(null);
      }
    },
    [getAuthHeaders, t],
  );

  const handleVerifySyncPassword = useCallback(async () => {
    const locale = i18n.language === 'zh-CN' ? 'zh-CN' : 'en-US';
    if (loginLockedUntil && loginLockedUntil > Date.now()) {
      setSyncPasswordMessage(
        t('settings.data.loginLocked', { time: new Date(loginLockedUntil).toLocaleString(locale) }),
      );
      return;
    }

    setIsVerifyingSyncPassword(true);
    setSyncPasswordMessage(null);
    try {
      const result = await onVerifySyncPassword();

      if (result?.success && result.role === 'admin') {
        setLoginLockedUntil(null);
        safeLocalStorageRemoveItem(SYNC_PASSWORD_LOCK_UNTIL_KEY);
        setSyncPasswordMessage(t('settings.data.loginSuccess'));
        return;
      }

      if (typeof result?.lockedUntil === 'number' && result.lockedUntil > Date.now()) {
        setLoginLockedUntil(result.lockedUntil);
        safeLocalStorageSetItem(SYNC_PASSWORD_LOCK_UNTIL_KEY, String(result.lockedUntil));
        setSyncPasswordMessage(
          t('settings.data.loginFailedLocked', {
            time: new Date(result.lockedUntil).toLocaleString(locale),
          }),
        );
        return;
      }

      let message = result?.error || t('settings.data.loginFailed');
      if (
        typeof result?.remainingAttempts === 'number' &&
        typeof result?.maxAttempts === 'number'
      ) {
        message += t('settings.data.remainingAttempts', {
          remaining: result.remainingAttempts,
          max: result.maxAttempts,
        });
      }
      setSyncPasswordMessage(message);
    } finally {
      setIsVerifyingSyncPassword(false);
    }
  }, [onVerifySyncPassword, loginLockedUntil, t, i18n.language]);

  const handleLogoutSyncPassword = useCallback(() => {
    setSyncPasswordMessage(null);
    setPassword('');
    clearSyncAdminSession();
    clearSyncPassword();
    onSyncPasswordChange('');
  }, [onSyncPasswordChange]);

  const isSyncPasswordReady = password.trim().length > 0;
  const isLoginLocked = !!loginLockedUntil && loginLockedUntil > Date.now();
  const currentPrivacyMode = useSeparatePrivacyPassword
    ? t('settings.data.separatePassword')
    : t('settings.data.syncPassword');

  const resetPrivacySwitch = useCallback(() => {
    setPrivacyTarget(null);
    setPrivacyOldPassword('');
    setPrivacyNewPassword('');
    setPrivacyError(null);
    setShowPrivacyOldPassword(false);
    setShowPrivacyNewPassword(false);
  }, []);

  const handleStartPrivacySwitch = (target: 'sync' | 'separate') => {
    setPrivacyTarget(target);
    setPrivacyOldPassword('');
    setPrivacyNewPassword('');
    setPrivacyError(null);
  };

  const handleConfirmPrivacySwitch = useCallback(async () => {
    if (!privacyTarget) return;
    setIsSwitchingPrivacyMode(true);
    setPrivacyError(null);
    try {
      const success = await onSwitchPrivacyMode({
        useSeparatePassword: privacyTarget === 'separate',
        oldPassword: privacyOldPassword,
        newPassword: privacyNewPassword,
      });
      if (!success) {
        setPrivacyError(t('settings.data.switchFailed'));
        return;
      }
      resetPrivacySwitch();
    } finally {
      setIsSwitchingPrivacyMode(false);
    }
  }, [
    privacyTarget,
    privacyOldPassword,
    privacyNewPassword,
    onSwitchPrivacyMode,
    resetPrivacySwitch,
    t,
  ]);

  useEffect(() => {
    if (syncRole === 'admin') return;
    setBackups([]);
    setBackupError(null);
    setIsLoadingBackups(false);
    setSyncHistoryPage(1);
    setIsSyncHistoryVisible(false);
    setHasLoadedBackups(false);
  }, [syncRole]);

  const handleToggleSyncHistory = useCallback(async () => {
    if (syncRole !== 'admin') return;
    if (isSyncHistoryVisible) {
      setIsSyncHistoryVisible(false);
      return;
    }
    setIsSyncHistoryVisible(true);
    if (!hasLoadedBackups) {
      await fetchBackups();
    }
  }, [fetchBackups, hasLoadedBackups, isSyncHistoryVisible, syncRole]);

  useEffect(() => {
    const display = backups.slice(0, SYNC_HISTORY_DISPLAY_LIMIT);
    const totalPages = Math.max(1, Math.ceil(display.length / SYNC_HISTORY_PAGE_SIZE));
    setSyncHistoryPage((prev) => (prev > totalPages ? totalPages : prev));
  }, [backups]);

  const displayBackups = backups.slice(0, SYNC_HISTORY_DISPLAY_LIMIT);
  const totalBackupPages = Math.max(1, Math.ceil(displayBackups.length / SYNC_HISTORY_PAGE_SIZE));
  const pagedBackups = displayBackups.slice(
    (syncHistoryPage - 1) * SYNC_HISTORY_PAGE_SIZE,
    syncHistoryPage * SYNC_HISTORY_PAGE_SIZE,
  );

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div>
        <h4 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-4 flex items-center gap-2">
          <Database size={16} className="text-slate-500" />
          {t('settings.data.title')}
        </h4>

        {/* KV Sync Info */}
        <div className="mb-4 p-4 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
          <div className="flex items-center gap-3">
            <Cloud className="w-5 h-5 text-green-600 dark:text-green-400" />
            <div className="flex-1">
              <div className="font-medium text-green-700 dark:text-green-300">
                {t('settings.data.cloudSyncEnabled')}
              </div>
              <div className="text-xs text-green-600 dark:text-green-400 mt-0.5">
                {t('settings.data.cloudSyncDesc')}
              </div>
            </div>
          </div>

          {/* API Password Input */}
          <div className="mt-4 pt-4 border-t border-green-200 dark:border-green-800/50">
            <label className="block text-xs font-bold text-green-800 dark:text-green-200 mb-2 flex items-center gap-1.5">
              <Lock size={12} />
              {t('settings.data.apiPassword')}
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={handlePasswordChange}
                placeholder={t('settings.data.apiPasswordPlaceholder')}
                className="w-full pl-3 pr-10 py-2 bg-white dark:bg-slate-900 border border-green-200 dark:border-green-800 rounded-lg text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
              >
                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <p className="text-[10px] text-green-600/80 dark:text-green-400/80 mt-1.5 leading-relaxed">
              {t('settings.data.apiPasswordHint')}
            </p>
            <div className="mt-2 flex items-center justify-between text-[10px] text-green-700/80 dark:text-green-300/80">
              <span>{t('settings.data.currentMode')}</span>
              <span
                className={`font-semibold ${syncRole === 'admin' ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-600 dark:text-slate-300'}`}
              >
                {syncRole === 'admin' ? t('settings.data.adminMode') : t('settings.data.userMode')}
              </span>
            </div>
            {isSyncProtected && (
              <div className="mt-2 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={handleVerifySyncPassword}
                  disabled={!isSyncPasswordReady || isVerifyingSyncPassword || isLoginLocked}
                  className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-300 hover:text-emerald-900 dark:hover:text-emerald-200 disabled:opacity-60"
                >
                  <RefreshCw size={12} className={isVerifyingSyncPassword ? 'animate-spin' : ''} />
                  {t('common.login')}
                </button>
                <button
                  type="button"
                  onClick={handleLogoutSyncPassword}
                  disabled={
                    isVerifyingSyncPassword || (!isSyncPasswordReady && syncRole !== 'admin')
                  }
                  className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white disabled:opacity-60"
                >
                  <LogOut size={12} />
                  {t('common.logout')}
                </button>
              </div>
            )}
            {isSyncProtected && isLoginLocked && !syncPasswordMessage && (
              <div className="mt-1 text-[10px] text-red-600/80 dark:text-red-400/80">
                {t('settings.data.loginLocked', {
                  time: new Date(loginLockedUntil as number).toLocaleString(
                    i18n.language === 'zh-CN' ? 'zh-CN' : 'en-US',
                  ),
                })}
              </div>
            )}
            {syncPasswordMessage && (
              <div
                className={`mt-1 text-[10px] ${syncPasswordMessage.startsWith(t('settings.data.loginSuccess').split(':')[0]) ? 'text-emerald-700/80 dark:text-emerald-300/80' : 'text-red-600/80 dark:text-red-400/80'}`}
              >
                {syncPasswordMessage}
              </div>
            )}
            {!isSyncProtected && (
              <div className="mt-1 text-[10px] text-green-600/80 dark:text-green-400/80">
                {t('settings.data.noPasswordProtection')}
              </div>
            )}
          </div>
        </div>

        {/* Privacy Vault - Admin Only */}
        {syncRole === 'admin' && (
          <div className="mb-4 p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/40">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200">
              <Lock size={14} className="text-slate-500" />
              {t('settings.data.privacyGroup')}
            </div>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-xs text-slate-600 dark:text-slate-300">
                {t('settings.data.enablePrivacyGroup')}
              </span>
              <button
                type="button"
                onClick={() => onTogglePrivacyGroup(!privacyGroupEnabled)}
                disabled={isTogglingPrivacyPassword}
                className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors ${privacyGroupEnabled ? 'bg-accent' : 'bg-slate-200 dark:bg-slate-700'} ${isTogglingPrivacyPassword ? 'opacity-50 cursor-not-allowed' : ''}`}
                aria-pressed={privacyGroupEnabled}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${privacyGroupEnabled ? 'translate-x-5' : 'translate-x-1'}`}
                />
              </button>
            </div>
            {!privacyGroupEnabled && (
              <div className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                {t('settings.data.privacyGroupDisabledHint')}
              </div>
            )}
            <div className="mt-3 flex items-center justify-between">
              <span className="text-xs text-slate-600 dark:text-slate-300">
                {t('settings.data.enablePassword')}
              </span>
              <button
                type="button"
                onClick={() => onTogglePrivacyPassword(!privacyPasswordEnabled)}
                disabled={!privacyGroupEnabled || isTogglingPrivacyPassword}
                className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors ${privacyPasswordEnabled ? 'bg-accent' : 'bg-slate-200 dark:bg-slate-700'} ${!privacyGroupEnabled || isTogglingPrivacyPassword ? 'opacity-50 cursor-not-allowed' : ''}`}
                aria-pressed={privacyPasswordEnabled}
                aria-busy={isTogglingPrivacyPassword}
              >
                <span
                  className={`inline-flex h-4 w-4 transform items-center justify-center rounded-full bg-white shadow transition-transform ${privacyPasswordEnabled ? 'translate-x-5' : 'translate-x-1'}`}
                >
                  {isTogglingPrivacyPassword && (
                    <RefreshCw size={10} className="animate-spin text-slate-500" />
                  )}
                </span>
              </button>
            </div>
            {!privacyPasswordEnabled && privacyGroupEnabled && (
              <div className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                {t('settings.data.passwordDisabledHint')}
              </div>
            )}
            <div className="mt-3 flex items-center justify-between">
              <span className="text-xs text-slate-600 dark:text-slate-300">
                {t('settings.data.autoUnlock')}
              </span>
              <button
                type="button"
                onClick={() => onTogglePrivacyAutoUnlock(!privacyAutoUnlockEnabled)}
                disabled={
                  !privacyGroupEnabled || !privacyPasswordEnabled || isTogglingPrivacyPassword
                }
                className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors ${privacyAutoUnlockEnabled ? 'bg-accent' : 'bg-slate-200 dark:bg-slate-700'} ${!privacyGroupEnabled || !privacyPasswordEnabled || isTogglingPrivacyPassword ? 'opacity-50 cursor-not-allowed' : ''}`}
                aria-pressed={privacyAutoUnlockEnabled}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${privacyAutoUnlockEnabled ? 'translate-x-5' : 'translate-x-1'}`}
                />
              </button>
            </div>
            {privacyAutoUnlockEnabled && privacyPasswordEnabled && (
              <div className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                {t('settings.data.autoUnlockHint')}
              </div>
            )}
            {privacyPasswordEnabled && (
              <>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                  {t('settings.data.currentPrivacyMode', { mode: currentPrivacyMode })}
                </p>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleStartPrivacySwitch('separate')}
                    disabled={
                      isTogglingPrivacyPassword ||
                      useSeparatePrivacyPassword ||
                      !isSyncPasswordReady
                    }
                    className="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-accent/50 hover:text-accent disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {t('settings.data.switchToSeparatePassword')}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleStartPrivacySwitch('sync')}
                    disabled={isTogglingPrivacyPassword || !useSeparatePrivacyPassword}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-accent/50 hover:text-accent disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {t('settings.data.switchToSyncPassword')}
                  </button>
                </div>

                {!isSyncPasswordReady && !useSeparatePrivacyPassword && (
                  <div className="mt-2 text-[10px] text-amber-600 dark:text-amber-400">
                    {t('settings.data.setSyncPasswordFirst')}
                  </div>
                )}
              </>
            )}

            {privacyPasswordEnabled && privacyTarget && (
              <div className="mt-4 space-y-3">
                <div className="text-xs text-slate-600 dark:text-slate-300">
                  {t('settings.data.enterPasswordsToSwitch')}
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                    {t('settings.data.oldPassword')}
                  </label>
                  <div className="relative">
                    <input
                      type={showPrivacyOldPassword ? 'text' : 'password'}
                      value={privacyOldPassword}
                      onChange={(e) => setPrivacyOldPassword(e.target.value)}
                      placeholder={t('settings.data.oldPasswordPlaceholder')}
                      className="w-full pl-3 pr-10 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPrivacyOldPassword((prev) => !prev)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                    >
                      {showPrivacyOldPassword ? <EyeOff size={12} /> : <Eye size={12} />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                    {t('settings.data.newPassword')}
                  </label>
                  <div className="relative">
                    <input
                      type={showPrivacyNewPassword ? 'text' : 'password'}
                      value={privacyNewPassword}
                      onChange={(e) => setPrivacyNewPassword(e.target.value)}
                      placeholder={
                        privacyTarget === 'sync'
                          ? t('settings.data.newPasswordSyncPlaceholder')
                          : t('settings.data.newPasswordPlaceholder')
                      }
                      className="w-full pl-3 pr-10 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPrivacyNewPassword((prev) => !prev)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                    >
                      {showPrivacyNewPassword ? <EyeOff size={12} /> : <Eye size={12} />}
                    </button>
                  </div>
                </div>

                {privacyError && (
                  <div className="text-xs text-red-600 dark:text-red-400">{privacyError}</div>
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleConfirmPrivacySwitch}
                    disabled={
                      isSwitchingPrivacyMode || (privacyTarget === 'separate' && !isSyncPasswordReady)
                    }
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-accent text-white hover:bg-accent/90 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {isSwitchingPrivacyMode
                      ? t('settings.data.switching')
                      : t('settings.data.confirmSwitch')}
                  </button>
                  <button
                    type="button"
                    onClick={resetPrivacySwitch}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-500 dark:text-slate-300 hover:text-slate-700 dark:hover:text-white"
                  >
                    {t('common.cancel')}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Duplicate Checker - Admin Only */}
        {syncRole === 'admin' && onDeleteLink && (
          <div className="mb-4">
            <DuplicateChecker
              links={links}
              categories={categories}
              onDeleteLink={onDeleteLink}
              onNavigateToCategory={onNavigateToCategory}
            />
          </div>
        )}

        {/* Backup List */}
        <div className="mb-4 p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/40">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-sm font-bold text-slate-700 dark:text-slate-200">
                {t('settings.data.syncHistory')}
              </div>
              <div className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                {t('settings.data.syncHistoryHint')}
              </div>
            </div>
            {syncRole === 'admin' && (
              <div className="flex items-center gap-3 flex-wrap justify-end">
                <button
                  type="button"
                  onClick={handleToggleSyncHistory}
                  disabled={isLoadingBackups}
                  className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white disabled:opacity-60"
                >
                  <Cloud size={12} />
                  {isSyncHistoryVisible ? t('common.hide') : t('common.show')}
                </button>
                {isSyncHistoryVisible && (
                  <button
                    type="button"
                    onClick={fetchBackups}
                    disabled={isLoadingBackups}
                    className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white disabled:opacity-60"
                  >
                    <RefreshCw size={12} className={isLoadingBackups ? 'animate-spin' : ''} />
                    {t('common.refresh')}
                  </button>
                )}
              </div>
            )}
          </div>

          {syncRole !== 'admin' ? (
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {t('settings.data.userModeNoHistory')}
            </div>
          ) : (
            <>
              <div className="mb-2 text-xs text-slate-500 dark:text-slate-400">
                {t('settings.data.syncHistoryNote')}
              </div>
              {!isSyncHistoryVisible ? (
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {t('settings.data.syncHistoryDefaultHidden')}
                </div>
              ) : (
                <>
                  {exportError && (
                    <div className="mb-2 text-xs text-red-600 dark:text-red-400">{exportError}</div>
                  )}

                  {isLoadingBackups && (
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {t('common.loading')}
                    </div>
                  )}

                  {!isLoadingBackups && backupError && (
                    <div className="text-xs text-red-600 dark:text-red-400">{backupError}</div>
                  )}

                  {!isLoadingBackups && !backupError && displayBackups.length === 0 && (
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {t('settings.data.noRecords')}
                    </div>
                  )}

                  {!isLoadingBackups && !backupError && displayBackups.length > 0 && (
                    <>
                      <div className="space-y-2">
                        {pagedBackups.map((backup) => {
                          const deviceLabel = formatDeviceLabel(
                            backup.deviceId,
                            backup.browser,
                            backup.os,
                          );
                          const showDeviceId =
                            backup.deviceId &&
                            !backup.browser &&
                            !backup.os &&
                            deviceLabel !== backup.deviceId;
                          const kind = getBackupKind(backup);
                          const isCurrent = !!backup.isCurrent;
                          return (
                            <div
                              key={backup.key}
                              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/40 px-3 py-2"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                                  <Clock size={12} />
                                  <span>{formatBackupTime(backup)}</span>
                                  <span
                                    className={`px-1.5 py-0.5 rounded-md text-[10px] font-semibold ${
                                      kind === 'auto'
                                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200'
                                        : 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-200'
                                    }`}
                                  >
                                    {kind === 'auto'
                                      ? t('settings.data.autoSync')
                                      : t('settings.data.manualSync')}
                                  </span>
                                  {isCurrent && (
                                    <span className="px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100">
                                      {t('common.current')}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handleExportBackup(backup)}
                                    disabled={!!restoringKey || !!deletingKey || !!exportingKey}
                                    className="flex items-center gap-1.5 text-xs text-sky-700 dark:text-sky-300 hover:text-sky-900 dark:hover:text-sky-200 disabled:opacity-60"
                                  >
                                    <Download
                                      size={12}
                                      className={exportingKey === backup.key ? 'animate-spin' : ''}
                                    />
                                    {t('common.export')}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleRestoreBackup(backup.key)}
                                    disabled={
                                      isCurrent || !!restoringKey || !!deletingKey || !!exportingKey
                                    }
                                    className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300 hover:text-amber-900 dark:hover:text-amber-200 disabled:opacity-60"
                                  >
                                    <CloudDownload
                                      size={12}
                                      className={restoringKey === backup.key ? 'animate-spin' : ''}
                                    />
                                    {t('settings.data.restore')}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteBackup(backup.key)}
                                    disabled={
                                      isCurrent || !!restoringKey || !!deletingKey || !!exportingKey
                                    }
                                    className={`flex items-center gap-1.5 text-xs ${
                                      isCurrent
                                        ? 'text-slate-400 dark:text-slate-500 cursor-not-allowed'
                                        : 'text-red-700 dark:text-red-300 hover:text-red-900 dark:hover:text-red-200'
                                    } disabled:opacity-60`}
                                  >
                                    <Trash2
                                      size={12}
                                      className={deletingKey === backup.key ? 'animate-spin' : ''}
                                    />
                                    {t('common.delete')}
                                  </button>
                                </div>
                              </div>
                              <div className="mt-1 flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                                <Cpu size={12} />
                                <span className="break-all">{deviceLabel}</span>
                              </div>
                              {showDeviceId && (
                                <div className="mt-1 pl-5 text-[10px] text-slate-500 dark:text-slate-400 break-all">
                                  {backup.deviceId}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      {totalBackupPages > 1 && (
                        <div className="mt-3 flex items-center justify-between gap-2">
                          <div className="text-[10px] text-slate-500 dark:text-slate-400">
                            {t('common.page')} {syncHistoryPage}/{totalBackupPages}
                          </div>
                          <div className="flex items-center gap-1">
                            {Array.from({ length: totalBackupPages }, (_, idx) => {
                              const page = idx + 1;
                              const isActive = page === syncHistoryPage;
                              return (
                                <button
                                  key={page}
                                  type="button"
                                  onClick={() => setSyncHistoryPage(page)}
                                  className={`px-2 py-1 rounded-md text-xs font-medium transition-colors ${
                                    isActive
                                      ? 'bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white'
                                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                                  }`}
                                >
                                  {page}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
            </>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4">
          <button
            onClick={() => {
              if (syncRole !== 'admin') return;
              onOpenImport();
              onClose();
            }}
            disabled={syncRole !== 'admin'}
            className={`flex flex-col items-center justify-center gap-3 p-6 rounded-xl border border-dashed border-slate-300 dark:border-slate-600 transition-all group ${
              syncRole === 'admin'
                ? 'hover:border-accent hover:bg-accent/5 dark:hover:bg-accent/10'
                : 'opacity-60 cursor-not-allowed'
            }`}
          >
            <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400 group-hover:text-accent group-hover:bg-white dark:group-hover:bg-slate-700 transition-colors shadow-sm">
              <Upload size={24} />
            </div>
            <div className="text-center">
              <div className="font-bold text-slate-700 dark:text-slate-200 group-hover:text-accent">
                {t('settings.data.importData')}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {t('settings.data.importDataHint')}
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};

export default DataTab;
