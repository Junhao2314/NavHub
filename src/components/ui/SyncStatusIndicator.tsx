/**
 * SyncStatusIndicator - Sync Status Indicator
 * 同步状态指示器
 *
 * Only shows on status change, auto-hides after sync success
 * 仅在状态变化时显示，同步成功后自动消失
 */

import { AlertCircle, Check, Cloud, CloudUpload, GitMerge, RefreshCw } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { SYNC_STATUS_AUTO_HIDE_DELAY_MS, SYNC_STATUS_EXIT_ANIMATION_MS } from '../../config/ui';
import { useI18n } from '../../hooks/useI18n';
import { SyncErrorKind, SyncStatus } from '../../types';
import { SYNC_DEBOUNCE_MS } from '../../utils/constants';

interface SyncStatusIndicatorProps {
  status: SyncStatus;
  lastSyncTime: number | null;
  errorMessage?: string | null;
  errorKind?: SyncErrorKind | null;
  onManualSync?: () => void;
  onManualPull?: () => void;
  onOpenConflict?: () => void;
  showWhenIdle?: boolean;
  className?: string;
}

const formatLastSyncTime = (timestamp: number | null, locale?: string): string | null => {
  if (!timestamp) return null;

  const date = new Date(timestamp);
  const now = new Date();
  const isSameDay = now.toDateString() === date.toDateString();

  const time = date.toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
  });

  if (isSameDay) return time;

  const datePart = date.toLocaleDateString(locale, {
    month: '2-digit',
    day: '2-digit',
  });

  return `${datePart} ${time}`;
};

const SyncStatusIndicator: React.FC<SyncStatusIndicatorProps> = ({
  status,
  lastSyncTime,
  errorMessage,
  errorKind,
  onManualSync,
  onManualPull,
  onOpenConflict,
  showWhenIdle = false,
  className = '',
}) => {
  const { t, i18n } = useI18n();
  const [visible, setVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const hideTimer = useRef<NodeJS.Timeout | null>(null);
  const prevStatus = useRef<SyncStatus>(status);

  // 清除定时器
  const clearHideTimer = useCallback(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }, []);

  // 开始隐藏动画
  const startHide = useCallback(() => {
    setIsExiting(true);
    setTimeout(() => {
      setVisible(false);
      setIsExiting(false);
    }, SYNC_STATUS_EXIT_ANIMATION_MS); // 动画持续时间
  }, []);

  // 安排自动隐藏
  const scheduleHide = useCallback(() => {
    clearHideTimer();
    hideTimer.current = setTimeout(startHide, SYNC_STATUS_AUTO_HIDE_DELAY_MS);
  }, [clearHideTimer, startHide]);

  // 监听状态变化
  useEffect(() => {
    // idle 状态：默认不显示，但允许显式展示（用户模式也能看到同步信息）
    if (status === 'idle') {
      if (showWhenIdle) {
        setVisible(true);
        setIsExiting(false);
        clearHideTimer();
      } else if (visible) {
        startHide();
      }
      return;
    }

    // 状态发生变化时显示
    if (status !== prevStatus.current) {
      prevStatus.current = status;
      setVisible(true);
      setIsExiting(false);
      clearHideTimer();

      // synced 状态自动隐藏
      if (status === 'synced') {
        scheduleHide();
      }
    }
  }, [status, visible, startHide, clearHideTimer, scheduleHide, showWhenIdle]);

  // 清理
  useEffect(() => {
    return () => clearHideTimer();
  }, [clearHideTimer]);

  const getStatusConfig = () => {
    const lastSyncedText = formatLastSyncTime(lastSyncTime, i18n.language || undefined);
    const autoSyncSeconds = Math.max(1, Math.round(SYNC_DEBOUNCE_MS / 1000));

    switch (status) {
      case 'idle':
        return {
          icon: Cloud,
          color: 'text-slate-400',
          bgColor: 'bg-slate-400/10',
          borderColor: 'border-slate-400/30',
          label: t('sync.disconnected'),
          description: lastSyncedText ? t('sync.lastSync', { time: lastSyncedText }) : undefined,
          animate: false as const,
          title: t('sync.disconnectedClickRefresh'),
        };
      case 'synced':
        return {
          icon: Check,
          color: 'text-green-500',
          bgColor: 'bg-green-500/10 dark:bg-green-500/20',
          borderColor: 'border-green-500/30',
          label: t('sync.synced'),
          description: lastSyncedText
            ? t('sync.lastSync', { time: lastSyncedText })
            : t('sync.syncedWithCloud'),
          animate: false as const,
          title: lastSyncedText
            ? t('sync.syncedLastClickRefresh', { time: lastSyncedText })
            : t('sync.syncedClickRefresh'),
        };
      case 'syncing':
        return {
          icon: RefreshCw,
          color: 'text-blue-500',
          bgColor: 'bg-blue-500/10 dark:bg-blue-500/20',
          borderColor: 'border-blue-500/30',
          label: t('sync.syncing'),
          description: t('sync.syncingWithCloud'),
          animate: 'spin' as const,
          title: t('sync.syncingPleaseWait'),
        };
      case 'pending':
        return {
          icon: CloudUpload,
          color: 'text-orange-500',
          bgColor: 'bg-orange-500/10 dark:bg-orange-500/20',
          borderColor: 'border-orange-500/30',
          label: t('sync.pending'),
          description: t('sync.pendingAutoSync', { seconds: autoSyncSeconds }),
          animate: false as const,
          title: t('sync.pendingDetected', { seconds: autoSyncSeconds }),
        };
      case 'error': {
        const label =
          errorKind === 'storage'
            ? t('sync.storageUnavailable')
            : errorKind === 'network'
              ? t('sync.networkError')
              : t('sync.syncFailed');
        const message = (errorMessage || '').trim();
        return {
          icon: AlertCircle,
          color: 'text-red-500',
          bgColor: 'bg-red-500/10 dark:bg-red-500/20',
          borderColor: 'border-red-500/30',
          label,
          description: message || t('sync.unknownError'),
          animate: false as const,
          title: message
            ? t('sync.errorWithMessageClickRetry', { label, message })
            : t('sync.errorClickRetry', { label }),
        };
      }
      case 'conflict':
        return {
          icon: GitMerge,
          color: 'text-amber-500',
          bgColor: 'bg-amber-500/10 dark:bg-amber-500/20',
          borderColor: 'border-amber-500/30',
          label: t('sync.conflict'),
          description: t('sync.conflictDescription'),
          animate: 'pulse',
          title: t('sync.conflictDetected'),
        };
      default:
        return {
          icon: Cloud,
          color: 'text-slate-400',
          bgColor: 'bg-slate-400/10',
          borderColor: 'border-slate-400/30',
          label: t('sync.disconnected'),
          description: lastSyncedText ? t('sync.lastSync', { time: lastSyncedText }) : undefined,
          animate: false as const,
          title: t('sync.disconnectedClickRefresh'),
        };
    }
  };

  // 不显示时返回空
  if (!visible) return null;

  const config = getStatusConfig();
  const Icon = config.icon;

  // 点击处理
  const handleClick = () => {
    if (status === 'conflict') {
      onOpenConflict?.();
      return;
    }

    if (status === 'error' || status === 'pending') {
      onManualSync?.();
    } else {
      onManualPull?.();
    }
  };

  return (
    <button
      onClick={handleClick}
      className={`
        flex items-start gap-2 px-4 py-2 rounded-xl text-sm font-medium text-left
        ${config.bgColor} ${config.borderColor} border
        backdrop-blur-sm shadow-lg
        transition-all duration-300 ease-out
        hover:scale-105 active:scale-95
        ${isExiting ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0'}
        ${className}
      `}
      disabled={status === 'syncing'}
      title={config.title}
    >
      <Icon
        className={`w-4 h-4 ${config.color} ${config.animate === 'spin' ? 'animate-spin' : ''} ${config.animate === 'pulse' ? 'animate-pulse' : ''}`}
      />
      <div className="min-w-0 flex-1 leading-tight">
        <div className={`truncate ${config.color}`}>{config.label}</div>
        {config.description && (
          <div className="mt-0.5 text-[11px] text-slate-600/80 dark:text-slate-300/80 truncate">
            {config.description}
          </div>
        )}
      </div>
    </button>
  );
};

export default React.memo(SyncStatusIndicator);
