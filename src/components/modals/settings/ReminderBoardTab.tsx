import { Clock, LayoutGrid, List, Timer } from 'lucide-react';
import React from 'react';
import { useI18n } from '../../../hooks/useI18n';
import {
  type ReminderExpiredEffect,
  type ReminderTimerMode,
  type ReminderViewStyle,
  useReminderBoardPrefs,
} from '../../../hooks/useReminderBoardPrefs';
import type {
  SiteSettings,
  SiteSettingsChangeHandler,
  SubscriptionNotificationChannel,
  SubscriptionNotificationSettings,
  SyncRole,
} from '../../../types';

interface ReminderBoardTabProps {
  settings: SiteSettings;
  onChange: SiteSettingsChangeHandler;
  onAddHolidays?: () => void;
  syncRole: SyncRole;
  sensitiveConfig?: {
    telegramBotToken?: string;
    telegramChatId?: string;
    webhookUrl?: string;
    webhookHeaders?: Record<string, string>;
    resendApiKey?: string;
    resendFrom?: string;
    emailTo?: string;
    barkKey?: string;
  };
  onSensitiveConfigChange?: (config: NonNullable<ReminderBoardTabProps['sensitiveConfig']>) => void;
}

const VIEW_STYLES: { value: ReminderViewStyle; icon: React.ReactNode; labelKey: string }[] = [
  { value: 'compact', icon: <List size={16} />, labelKey: 'modals.countdown.styleCompact' },
  { value: 'card', icon: <LayoutGrid size={16} />, labelKey: 'modals.countdown.styleCard' },
  {
    value: 'ring',
    icon: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M12 6v6l4 2" />
      </svg>
    ),
    labelKey: 'modals.countdown.styleRing',
  },
  { value: 'flip', icon: <Timer size={16} />, labelKey: 'modals.countdown.styleFlip' },
];

const TIMER_MODES: { value: ReminderTimerMode; labelKey: string }[] = [
  { value: 'cycle', labelKey: 'modals.countdown.timerModeCycle' },
  { value: 'forward', labelKey: 'modals.countdown.timerModeForward' },
];

const EXPIRED_EFFECTS: { value: ReminderExpiredEffect; labelKey: string }[] = [
  { value: 'dim', labelKey: 'modals.countdown.expiredEffectDim' },
  { value: 'blink', labelKey: 'modals.countdown.expiredEffectBlink' },
];

const NOTIFICATION_CHANNELS: { value: SubscriptionNotificationChannel; label: string }[] = [
  { value: 'telegram', label: 'Telegram' },
  { value: 'webhook', label: 'Webhook' },
  { value: 'email', label: 'Email / Resend' },
  { value: 'bark', label: 'Bark' },
];

const ReminderBoardTab: React.FC<ReminderBoardTabProps> = ({
  settings,
  onChange,
  onAddHolidays,
  syncRole,
  sensitiveConfig,
  onSensitiveConfigChange,
}) => {
  const { t } = useI18n();
  const prefs = useReminderBoardPrefs();

  const archiveMode = settings.reminderBoardArchiveMode;
  const archiveDelayMinutes = settings.reminderBoardArchiveDelayMinutes ?? 60;
  const showOverdueForUsers = settings.reminderBoardShowOverdueForUsers ?? false;
  const notificationSettings = settings.subscriptionNotifications ?? {};
  const canConfigureNotifications = syncRole === 'admin';
  const updateNotificationSettings = (patch: Partial<SubscriptionNotificationSettings>) => {
    if (!canConfigureNotifications) return;
    onChange('subscriptionNotifications', {
      ...notificationSettings,
      ...patch,
    });
  };
  const toggleChannel = (channel: SubscriptionNotificationChannel) => {
    const current = notificationSettings.channels ?? [];
    updateNotificationSettings({
      channels: current.includes(channel)
        ? current.filter((value) => value !== channel)
        : [...current, channel],
    });
  };
  const updateSensitiveConfig = (
    patch: Partial<NonNullable<ReminderBoardTabProps['sensitiveConfig']>>,
  ) => {
    if (!canConfigureNotifications) return;
    onSensitiveConfigChange?.({ ...(sensitiveConfig ?? {}), ...patch });
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* View Style */}
      <div>
        <label className="block text-sm font-bold text-slate-700 dark:text-slate-200 mb-3">
          {t('modals.countdown.settingsViewStyle')}
        </label>
        <div className="grid grid-cols-4 gap-3">
          {VIEW_STYLES.map((vs) => (
            <button
              key={vs.value}
              type="button"
              onClick={() => prefs.setViewStyle(vs.value)}
              className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-all ${
                prefs.viewStyle === vs.value
                  ? 'border-accent bg-accent/10 text-accent ring-2 ring-accent/20'
                  : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-accent/50 hover:text-accent'
              }`}
            >
              {vs.icon}
              <span className="text-xs font-medium">{t(vs.labelKey)}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="h-px bg-slate-100 dark:bg-slate-800" />

      {/* Timer Mode */}
      <div>
        <label className="block text-sm font-bold text-slate-700 dark:text-slate-200 mb-3">
          {t('modals.countdown.settingsTimerMode')}
        </label>
        <div className="grid grid-cols-2 gap-3">
          {TIMER_MODES.map((tm) => (
            <button
              key={tm.value}
              type="button"
              onClick={() => prefs.setTimerMode(tm.value)}
              className={`px-4 py-2.5 rounded-xl text-sm font-medium border transition-all ${
                prefs.timerMode === tm.value
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-accent/50'
              }`}
            >
              {t(tm.labelKey)}
            </button>
          ))}
        </div>
      </div>

      <div className="h-px bg-slate-100 dark:bg-slate-800" />

      {/* Expired Effect */}
      <div>
        <label className="block text-sm font-bold text-slate-700 dark:text-slate-200 mb-3">
          {t('modals.countdown.settingsExpiredEffect')}
        </label>
        <div className="grid grid-cols-2 gap-3">
          {EXPIRED_EFFECTS.map((ee) => (
            <button
              key={ee.value}
              type="button"
              onClick={() => prefs.setExpiredEffect(ee.value)}
              className={`px-4 py-2.5 rounded-xl text-sm font-medium border transition-all ${
                prefs.expiredEffect === ee.value
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-accent/50'
              }`}
            >
              {t(ee.labelKey)}
            </button>
          ))}
        </div>
      </div>

      <div className="h-px bg-slate-100 dark:bg-slate-800" />

      {/* Auto Archive */}
      <div className="space-y-3">
        <label className="block text-sm font-bold text-slate-700 dark:text-slate-200">
          {t('modals.countdown.settingsAutoArchive')}
        </label>
        <div className="grid grid-cols-3 gap-3">
          {[
            { value: '', labelKey: 'modals.countdown.archiveModeDisabled' },
            { value: 'immediate', labelKey: 'modals.countdown.archiveModeImmediate' },
            { value: 'delay', labelKey: 'modals.countdown.archiveModeDelay' },
          ].map((am) => (
            <button
              key={am.value}
              type="button"
              onClick={() =>
                onChange(
                  'reminderBoardArchiveMode' as keyof SiteSettings,
                  am.value === 'immediate' || am.value === 'delay' ? am.value : undefined,
                )
              }
              className={`px-4 py-2.5 rounded-xl text-sm font-medium border transition-all ${
                (archiveMode ?? '') === am.value
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-accent/50'
              }`}
            >
              {t(am.labelKey)}
            </button>
          ))}
        </div>
        {archiveMode === 'delay' && (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
            <span className="text-sm text-slate-600 dark:text-slate-300">
              {t('modals.countdown.archiveDelayMinutes')}:
            </span>
            <input
              type="number"
              min={1}
              value={archiveDelayMinutes}
              onChange={(e) => {
                const val = Number.parseInt(e.target.value, 10);
                if (Number.isFinite(val) && val >= 1) {
                  onChange('reminderBoardArchiveDelayMinutes' as keyof SiteSettings, val);
                }
              }}
              className="w-24 px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none"
            />
          </div>
        )}
      </div>

      {/* Overdue Visibility (only relevant in forward mode) */}
      {prefs.timerMode === 'forward' && (
        <>
          <div className="h-px bg-slate-100 dark:bg-slate-800" />
          <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
            <div>
              <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                {t('modals.countdown.settingsOverdueVisibility')}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {t('modals.countdown.overdueVisibilityForUsers')}
              </div>
            </div>
            <button
              type="button"
              onClick={() =>
                onChange(
                  'reminderBoardShowOverdueForUsers' as keyof SiteSettings,
                  !showOverdueForUsers,
                )
              }
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                showOverdueForUsers ? 'bg-accent' : 'bg-slate-300 dark:bg-slate-600'
              }`}
              aria-pressed={showOverdueForUsers}
              aria-label={t('modals.countdown.settingsOverdueVisibility')}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${
                  showOverdueForUsers ? 'translate-x-5' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </>
      )}

      <div className="h-px bg-slate-100 dark:bg-slate-800" />

      <div className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <label className="block text-sm font-bold text-slate-700 dark:text-slate-200">
              订阅提醒通知
            </label>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Worker Cron 定时发送 Telegram / Webhook / Resend / Bark 通知。
            </p>
          </div>
          <button
            type="button"
            disabled={!canConfigureNotifications}
            onClick={() => updateNotificationSettings({ enabled: !notificationSettings.enabled })}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              notificationSettings.enabled ? 'bg-accent' : 'bg-slate-300 dark:bg-slate-600'
            } ${canConfigureNotifications ? '' : 'opacity-50 cursor-not-allowed'}`}
            aria-pressed={Boolean(notificationSettings.enabled)}
            aria-label="订阅提醒通知"
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${
                notificationSettings.enabled ? 'translate-x-5' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {!canConfigureNotifications && (
          <div className="text-xs text-amber-600 dark:text-amber-300 rounded-xl border border-amber-200/70 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-3 py-2">
            管理员模式可配置外部通知；普通用户只读。
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          {NOTIFICATION_CHANNELS.map((channel) => (
            <label
              key={channel.value}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm ${
                notificationSettings.channels?.includes(channel.value)
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
              } ${canConfigureNotifications ? 'cursor-pointer' : 'opacity-60 cursor-not-allowed'}`}
            >
              <input
                type="checkbox"
                disabled={!canConfigureNotifications}
                checked={notificationSettings.channels?.includes(channel.value) ?? false}
                onChange={() => toggleChannel(channel.value)}
                className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-accent focus:ring-accent/20"
              />
              {channel.label}
            </label>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-2">
          <input
            type="text"
            disabled={!canConfigureNotifications}
            value={notificationSettings.timeZone ?? ''}
            onChange={(event) => updateNotificationSettings({ timeZone: event.target.value })}
            placeholder="通知时区，例如 Asia/Shanghai"
            className="px-4 py-3 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 disabled:opacity-60"
          />
          <input
            type="text"
            disabled={!canConfigureNotifications}
            value={notificationSettings.titleTemplate ?? ''}
            onChange={(event) => updateNotificationSettings({ titleTemplate: event.target.value })}
            placeholder="标题模板：订阅即将到期：{{name}}"
            className="px-4 py-3 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 disabled:opacity-60"
          />
          <textarea
            disabled={!canConfigureNotifications}
            value={notificationSettings.bodyTemplate ?? ''}
            onChange={(event) => updateNotificationSettings({ bodyTemplate: event.target.value })}
            placeholder="正文模板，可用变量：{{name}} {{dueLocal}} {{daysLeft}}"
            rows={3}
            className="px-4 py-3 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 disabled:opacity-60 resize-none"
          />
        </div>

        {canConfigureNotifications && (
          <div className="grid grid-cols-1 gap-2">
            <input
              type="password"
              value={sensitiveConfig?.telegramBotToken ?? ''}
              onChange={(event) => updateSensitiveConfig({ telegramBotToken: event.target.value })}
              placeholder="Telegram Bot Token"
              className="px-4 py-3 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200"
            />
            <input
              type="text"
              value={sensitiveConfig?.telegramChatId ?? ''}
              onChange={(event) => updateSensitiveConfig({ telegramChatId: event.target.value })}
              placeholder="Telegram Chat ID"
              className="px-4 py-3 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200"
            />
            <input
              type="password"
              value={sensitiveConfig?.webhookUrl ?? ''}
              onChange={(event) => updateSensitiveConfig({ webhookUrl: event.target.value })}
              placeholder="Webhook URL"
              className="px-4 py-3 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200"
            />
            <input
              type="password"
              value={sensitiveConfig?.resendApiKey ?? ''}
              onChange={(event) => updateSensitiveConfig({ resendApiKey: event.target.value })}
              placeholder="Resend API Key"
              className="px-4 py-3 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                value={sensitiveConfig?.resendFrom ?? ''}
                onChange={(event) => updateSensitiveConfig({ resendFrom: event.target.value })}
                placeholder="Resend From"
                className="px-4 py-3 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200"
              />
              <input
                type="text"
                value={sensitiveConfig?.emailTo ?? ''}
                onChange={(event) => updateSensitiveConfig({ emailTo: event.target.value })}
                placeholder="Email To"
                className="px-4 py-3 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200"
              />
            </div>
            <input
              type="password"
              value={sensitiveConfig?.barkKey ?? ''}
              onChange={(event) => updateSensitiveConfig({ barkKey: event.target.value })}
              placeholder="Bark Key"
              className="px-4 py-3 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200"
            />
          </div>
        )}

        <div className="text-[11px] text-slate-400 dark:text-slate-500">
          Token、Webhook URL、Resend Key、Bark Key 存在加密敏感配置中；当前版本先复用同步密码解密。
        </div>
      </div>

      {/* Batch Add Holidays */}
      {onAddHolidays && (
        <>
          <div className="h-px bg-slate-100 dark:bg-slate-800" />
          <button
            type="button"
            onClick={onAddHolidays}
            className="flex items-center gap-2 w-full px-4 py-3 text-sm font-medium rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-accent hover:border-accent/50 bg-white/60 dark:bg-slate-800/60 transition-all"
          >
            <Clock size={16} />
            {t('modals.countdown.holidaysBatchTitle')}
          </button>
        </>
      )}
    </div>
  );
};

export default ReminderBoardTab;
