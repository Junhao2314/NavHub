/**
 * SyncConflictModal - 数据同步冲突解决对话框
 *
 * 当检测到云端数据版本与本地不一致时弹出，让用户选择保留哪个版本
 */

import {
  AlertTriangle,
  Clock,
  CloudOff,
  Cpu,
  FolderOpen,
  Link2,
  Smartphone,
  X,
} from 'lucide-react';
import React from 'react';
import { useI18n } from '../../hooks/useI18n';
import { SyncConflict } from '../../types';

interface SyncConflictModalProps {
  isOpen: boolean;
  conflict: SyncConflict | null;
  onResolve: (choice: 'local' | 'remote') => void;
  onClose: () => void;
  closeOnBackdrop?: boolean;
}

const SyncConflictModal: React.FC<SyncConflictModalProps> = ({
  isOpen,
  conflict,
  onResolve,
  onClose,
  closeOnBackdrop = true,
}) => {
  const { t, currentLanguage } = useI18n();

  if (!isOpen || !conflict) return null;

  const localTime = conflict.localData.meta.updatedAt;
  const remoteTime = conflict.remoteData.meta.updatedAt;

  // Determine locale for date formatting based on current language
  const dateLocale = currentLanguage === 'zh-CN' ? 'zh-CN' : 'en-US';

  const formatTime = (timestamp?: number) => {
    if (!timestamp) return t('common.unknownTime');
    return new Date(timestamp).toLocaleString(dateLocale, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDeviceLabel = (deviceId?: string) => {
    if (!deviceId) return t('common.unknownDevice');
    const parts = deviceId.split('_');
    if (parts.length >= 3 && parts[0] === 'device') {
      const timestamp = Number(parts[1]);
      if (!Number.isNaN(timestamp)) {
        return `${t('common.device')} ${new Date(timestamp).toLocaleString(dateLocale, {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })}`;
      }
    }
    return deviceId;
  };

  const localDeviceId = conflict.localData.meta.deviceId;
  const remoteDeviceId = conflict.remoteData.meta.deviceId;
  const localDeviceLabel = formatDeviceLabel(localDeviceId);
  const remoteDeviceLabel = formatDeviceLabel(remoteDeviceId);
  const showLocalDeviceId = localDeviceId && localDeviceLabel !== localDeviceId;
  const showRemoteDeviceId = remoteDeviceId && remoteDeviceLabel !== remoteDeviceId;
  const isLocalNewer = (localTime || 0) > (remoteTime || 0);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={closeOnBackdrop ? onClose : undefined}
    >
      <div
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200 dark:border-slate-700 animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 p-5 border-b border-slate-200 dark:border-slate-700 bg-amber-50 dark:bg-amber-900/20">
          <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-800/40 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
              {t('modals.syncConflict.title')}
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {t('modals.syncConflict.description')}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors"
            aria-label={t('common.close')}
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Content: Two columns comparison */}
        <div className="p-5 grid grid-cols-2 gap-4">
          {/* Local Version */}
          <div
            className={`relative p-4 rounded-xl border-2 transition-all cursor-pointer hover:shadow-lg group ${
              isLocalNewer
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : 'border-slate-200 dark:border-slate-600 hover:border-blue-400'
            }`}
            onClick={() => onResolve('local')}
          >
            {isLocalNewer && (
              <span className="absolute -top-2.5 left-4 px-2 py-0.5 text-xs font-medium bg-blue-500 text-white rounded-full">
                {t('common.newer')}
              </span>
            )}
            <div className="flex items-center gap-2 mb-3">
              <Smartphone className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <span className="font-medium text-slate-900 dark:text-white">
                {t('modals.syncConflict.localVersion')}
              </span>
            </div>

            <div className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4" />
                <span>{formatTime(localTime)}</span>
              </div>
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4" />
                <span className="break-all text-xs">{localDeviceLabel}</span>
              </div>
              {showLocalDeviceId && (
                <div className="pl-6 text-[10px] text-slate-500 dark:text-slate-400 break-all">
                  {localDeviceId}
                </div>
              )}
              <div className="flex items-center gap-2">
                <Link2 className="w-4 h-4" />
                <span>
                  {t('modals.syncConflict.links', { count: conflict.localData.links.length })}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <FolderOpen className="w-4 h-4" />
                <span>
                  {t('modals.syncConflict.categories', {
                    count: conflict.localData.categories.length,
                  })}
                </span>
              </div>
            </div>

            <button
              className="mt-4 w-full py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors group-hover:ring-2 ring-blue-400 ring-offset-2 dark:ring-offset-slate-800"
              onClick={(e) => {
                e.stopPropagation();
                onResolve('local');
              }}
            >
              {t('modals.syncConflict.useLocalVersion')}
            </button>
          </div>

          {/* Remote Version */}
          <div
            className={`relative p-4 rounded-xl border-2 transition-all cursor-pointer hover:shadow-lg group ${
              !isLocalNewer
                ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                : 'border-slate-200 dark:border-slate-600 hover:border-purple-400'
            }`}
            onClick={() => onResolve('remote')}
          >
            {!isLocalNewer && (
              <span className="absolute -top-2.5 left-4 px-2 py-0.5 text-xs font-medium bg-purple-500 text-white rounded-full">
                {t('common.newer')}
              </span>
            )}
            <div className="flex items-center gap-2 mb-3">
              <CloudOff className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              <span className="font-medium text-slate-900 dark:text-white">
                {t('modals.syncConflict.remoteVersion')}
              </span>
            </div>

            <div className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4" />
                <span>{formatTime(remoteTime)}</span>
              </div>
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4" />
                <span className="break-all text-xs">{remoteDeviceLabel}</span>
              </div>
              {showRemoteDeviceId && (
                <div className="pl-6 text-[10px] text-slate-500 dark:text-slate-400 break-all">
                  {remoteDeviceId}
                </div>
              )}
              <div className="flex items-center gap-2">
                <Link2 className="w-4 h-4" />
                <span>
                  {t('modals.syncConflict.links', { count: conflict.remoteData.links.length })}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <FolderOpen className="w-4 h-4" />
                <span>
                  {t('modals.syncConflict.categories', {
                    count: conflict.remoteData.categories.length,
                  })}
                </span>
              </div>
            </div>

            <button
              className="mt-4 w-full py-2 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg transition-colors group-hover:ring-2 ring-purple-400 ring-offset-2 dark:ring-offset-slate-800"
              onClick={(e) => {
                e.stopPropagation();
                onResolve('remote');
              }}
            >
              {t('modals.syncConflict.useRemoteVersion')}
            </button>
          </div>
        </div>

        {/* Footer hint */}
        <div className="px-5 pb-5">
          <div className="p-3 rounded-lg bg-slate-100 dark:bg-slate-700/50 text-xs text-slate-500 dark:text-slate-400">
            {t('modals.syncConflict.hint')}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SyncConflictModal;
