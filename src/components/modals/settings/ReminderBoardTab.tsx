import { Clock, LayoutGrid, List, Loader2, Timer } from 'lucide-react';
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

type TestState = 'idle' | 'loading' | 'success' | { error: string };

const VIEW_STYLES: {
  value: ReminderViewStyle;
  icon: React.ReactNode;
  labelKey: string;
}[] = [
  {
    value: 'compact',
    icon: <List size={16} />,
    labelKey: 'modals.countdown.styleCompact',
  },
  {
    value: 'card',
    icon: <LayoutGrid size={16} />,
    labelKey: 'modals.countdown.styleCard',
  },
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
  {
    value: 'flip',
    icon: <Timer size={16} />,
    labelKey: 'modals.countdown.styleFlip',
  },
];

const TIMER_MODES: { value: ReminderTimerMode; labelKey: string }[] = [
  { value: 'cycle', labelKey: 'modals.countdown.timerModeCycle' },
  { value: 'forward', labelKey: 'modals.countdown.timerModeForward' },
];

const EXPIRED_EFFECTS: { value: ReminderExpiredEffect; labelKey: string }[] = [
  { value: 'dim', labelKey: 'modals.countdown.expiredEffectDim' },
  { value: 'blink', labelKey: 'modals.countdown.expiredEffectBlink' },
];

const NOTIFICATION_CHANNELS: {
  value: SubscriptionNotificationChannel;
  labelKey: string;
}[] = [
  { value: 'telegram', labelKey: 'settings.reminderBoard.channels.telegram' },
  { value: 'webhook', labelKey: 'settings.reminderBoard.channels.webhook' },
  { value: 'email', labelKey: 'settings.reminderBoard.channels.email' },
  { value: 'bark', labelKey: 'settings.reminderBoard.channels.bark' },
];

const INPUT_CLS =
  'w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none disabled:opacity-50';

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

  const [testStates, setTestStates] = React.useState<
    Record<SubscriptionNotificationChannel, TestState>
  >({
    telegram: 'idle',
    webhook: 'idle',
    email: 'idle',
    bark: 'idle',
  });

  const archiveMode = settings.reminderBoardArchiveMode;
  const archiveDelayMinutes = settings.reminderBoardArchiveDelayMinutes ?? 60;
  const showOverdueForUsers = settings.reminderBoardShowOverdueForUsers ?? false;
  const notificationSettings = settings.subscriptionNotifications ?? {};
  const canConfigureNotifications = syncRole === 'admin';
  const selectedNotificationChannels = notificationSettings.channels ?? [];
  const quietHours = notificationSettings.quietHours ?? {};

  const isChannelSelected = (channel: SubscriptionNotificationChannel) =>
    selectedNotificationChannels.includes(channel);

  const updateNotificationSettings = (patch: Partial<SubscriptionNotificationSettings>) => {
    if (!canConfigureNotifications) return;
    onChange('subscriptionNotifications', {
      ...notificationSettings,
      ...patch,
    });
  };

  const updateQuietHours = (
    patch: Partial<NonNullable<SubscriptionNotificationSettings['quietHours']>>,
  ) => {
    updateNotificationSettings({ quietHours: { ...quietHours, ...patch } });
  };

  const toggleChannel = (channel: SubscriptionNotificationChannel) => {
    updateNotificationSettings({
      channels: selectedNotificationChannels.includes(channel)
        ? selectedNotificationChannels.filter((v) => v !== channel)
        : [...selectedNotificationChannels, channel],
    });
  };

  const updateSensitiveConfig = (
    patch: Partial<NonNullable<ReminderBoardTabProps['sensitiveConfig']>>,
  ) => {
    if (!canConfigureNotifications) return;
    onSensitiveConfigChange?.({ ...(sensitiveConfig ?? {}), ...patch });
  };

  const handleTestNotification = async (channel: SubscriptionNotificationChannel) => {
    setTestStates((prev) => ({ ...prev, [channel]: 'loading' }));
    const testTitle = t('settings.reminderBoard.testMessageTitle');
    const testBody = t('settings.reminderBoard.testMessageBody');
    const scheduleReset = () => {
      setTimeout(() => setTestStates((prev) => ({ ...prev, [channel]: 'idle' })), 3000);
    };
    try {
      let ok = false;
      let errMsg = '';

      if (channel === 'telegram') {
        if (!sensitiveConfig?.telegramBotToken || !sensitiveConfig?.telegramChatId) {
          throw new Error(t('settings.reminderBoard.testNotConfigured'));
        }
        const res = await fetch(
          `https://api.telegram.org/bot${sensitiveConfig.telegramBotToken}/sendMessage`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: sensitiveConfig.telegramChatId,
              text: `${testTitle}\n\n${testBody}`,
            }),
          },
        );
        ok = res.ok;
        if (!ok) errMsg = res.statusText;
      } else if (channel === 'webhook') {
        if (!sensitiveConfig?.webhookUrl) {
          throw new Error(t('settings.reminderBoard.testNotConfigured'));
        }
        const res = await fetch(sensitiveConfig.webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(sensitiveConfig.webhookHeaders ?? {}),
          },
          body: JSON.stringify({
            event: 'test',
            title: testTitle,
            body: testBody,
          }),
        });
        ok = res.ok;
        if (!ok) errMsg = res.statusText;
      } else if (channel === 'email') {
        if (
          !sensitiveConfig?.resendApiKey ||
          !sensitiveConfig?.resendFrom ||
          !sensitiveConfig?.emailTo
        ) {
          throw new Error(t('settings.reminderBoard.testNotConfigured'));
        }
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${sensitiveConfig.resendApiKey}`,
          },
          body: JSON.stringify({
            from: sensitiveConfig.resendFrom,
            to: sensitiveConfig.emailTo
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean),
            subject: testTitle,
            text: testBody,
          }),
        });
        ok = res.ok;
        if (!ok) errMsg = res.statusText;
      } else if (channel === 'bark') {
        if (!sensitiveConfig?.barkKey) {
          throw new Error(t('settings.reminderBoard.testNotConfigured'));
        }
        const res = await fetch(`https://api.day.app/${sensitiveConfig.barkKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: testTitle, body: testBody }),
        });
        ok = res.ok;
        if (!ok) errMsg = res.statusText;
      }

      if (ok) {
        setTestStates((prev) => ({ ...prev, [channel]: 'success' }));
      } else {
        setTestStates((prev) => ({
          ...prev,
          [channel]: { error: errMsg || 'failed' },
        }));
      }
      scheduleReset();
    } catch (e) {
      setTestStates((prev) => ({
        ...prev,
        [channel]: { error: e instanceof Error ? e.message : 'unknown' },
      }));
      scheduleReset();
    }
  };

  const renderTestButton = (channel: SubscriptionNotificationChannel) => {
    const state = testStates[channel];
    if (state === 'loading') {
      return (
        <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-500 shrink-0">
          <Loader2 size={12} className="animate-spin" />
          {t('settings.reminderBoard.testSending')}
        </span>
      );
    }
    if (state === 'success') {
      return (
        <span className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 shrink-0">
          ✓ {t('settings.reminderBoard.testSuccess')}
        </span>
      );
    }
    if (typeof state === 'object') {
      return (
        <span
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-50 dark:bg-red-900/20 text-red-500 dark:text-red-400 shrink-0 max-w-40 truncate"
          title={state.error}
        >
          ✗ {t('settings.reminderBoard.testFailed')}: {state.error}
        </span>
      );
    }
    // idle
    return (
      <button
        type="button"
        onClick={() => handleTestNotification(channel)}
        className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-accent/60 hover:text-accent transition-colors"
      >
        {t('settings.reminderBoard.testSend')}
      </button>
    );
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
            {
              value: 'immediate',
              labelKey: 'modals.countdown.archiveModeImmediate',
            },
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

      {canConfigureNotifications && (
        <>
          <div className="h-px bg-slate-100 dark:bg-slate-800" />

          {/* Subscription Notifications Card */}
          <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/40 shadow-sm">
            {/* Card Header */}
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/40 p-4">
              <div>
                <label className="block text-sm font-bold text-slate-800 dark:text-slate-100">
                  {t('settings.reminderBoard.subscriptionNotifications')}
                </label>
                <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                  {t('settings.reminderBoard.subscriptionNotificationsDesc')}
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  updateNotificationSettings({
                    enabled: !notificationSettings.enabled,
                  })
                }
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors ${
                  notificationSettings.enabled ? 'bg-accent' : 'bg-slate-300 dark:bg-slate-600'
                }`}
                aria-pressed={Boolean(notificationSettings.enabled)}
                aria-label={t('settings.reminderBoard.subscriptionNotifications')}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${
                    notificationSettings.enabled ? 'translate-x-5' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* Card Body — dimmed when disabled */}
            <div
              className={`divide-y divide-slate-100 dark:divide-slate-800 transition-opacity duration-200 ${
                notificationSettings.enabled ? 'opacity-100' : 'opacity-40 pointer-events-none'
              }`}
            >
              {/* ── Section A: Notification Channels (Accordion) ── */}
              <div className="p-4 space-y-3">
                <div>
                  <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    {t('settings.reminderBoard.channelSectionTitle')}
                  </h4>
                  <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
                    {t('settings.reminderBoard.channelSectionDesc')}
                  </p>
                </div>
                <div className="space-y-2">
                  {NOTIFICATION_CHANNELS.map((channel) => {
                    const selected = isChannelSelected(channel.value);
                    return (
                      <div
                        key={channel.value}
                        className={`rounded-xl border transition-colors ${
                          selected
                            ? 'border-accent/40 bg-accent/5 dark:bg-accent/10'
                            : 'border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        {/* Channel header row */}
                        <div className="flex items-center gap-3 px-3 py-2.5">
                          <label className="flex flex-1 items-center gap-2.5 cursor-pointer min-w-0">
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => toggleChannel(channel.value)}
                              className="w-4 h-4 shrink-0 rounded border-slate-300 dark:border-slate-600 text-accent focus:ring-accent/20 cursor-pointer"
                            />
                            <span
                              className={`text-sm font-medium truncate ${
                                selected ? 'text-accent' : 'text-slate-600 dark:text-slate-300'
                              }`}
                            >
                              {t(channel.labelKey)}
                            </span>
                          </label>
                          {selected && renderTestButton(channel.value)}
                        </div>

                        {/* Expanded credentials panel */}
                        {selected && (
                          <div className="border-t border-slate-100 dark:border-slate-800 px-3 pt-3 pb-3 space-y-3">
                            {/* Telegram */}
                            {channel.value === 'telegram' && (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="space-y-1">
                                  <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                                    {t('settings.reminderBoard.telegramBotTokenLabel')}
                                  </label>
                                  <input
                                    type="password"
                                    value={sensitiveConfig?.telegramBotToken ?? ''}
                                    onChange={(e) =>
                                      updateSensitiveConfig({
                                        telegramBotToken: e.target.value,
                                      })
                                    }
                                    placeholder="bot123456:ABC-..."
                                    className={INPUT_CLS}
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                                    {t('settings.reminderBoard.telegramChatIdLabel')}
                                  </label>
                                  <input
                                    type="text"
                                    value={sensitiveConfig?.telegramChatId ?? ''}
                                    onChange={(e) =>
                                      updateSensitiveConfig({
                                        telegramChatId: e.target.value,
                                      })
                                    }
                                    placeholder="-1001234567890"
                                    className={INPUT_CLS}
                                  />
                                </div>
                              </div>
                            )}

                            {/* Webhook */}
                            {channel.value === 'webhook' && (
                              <div className="space-y-1">
                                <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                                  {t('settings.reminderBoard.webhookUrlLabel')}
                                </label>
                                <input
                                  type="password"
                                  value={sensitiveConfig?.webhookUrl ?? ''}
                                  onChange={(e) =>
                                    updateSensitiveConfig({
                                      webhookUrl: e.target.value,
                                    })
                                  }
                                  placeholder="https://hooks.example.com/..."
                                  className={INPUT_CLS}
                                />
                              </div>
                            )}

                            {/* Email / Resend */}
                            {channel.value === 'email' && (
                              <div className="space-y-3">
                                <div className="space-y-1">
                                  <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                                    {t('settings.reminderBoard.resendApiKeyLabel')}
                                  </label>
                                  <input
                                    type="password"
                                    value={sensitiveConfig?.resendApiKey ?? ''}
                                    onChange={(e) =>
                                      updateSensitiveConfig({
                                        resendApiKey: e.target.value,
                                      })
                                    }
                                    placeholder="re_..."
                                    className={INPUT_CLS}
                                  />
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                  <div className="space-y-1">
                                    <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                                      {t('settings.reminderBoard.resendFromLabel')}
                                    </label>
                                    <input
                                      type="text"
                                      value={sensitiveConfig?.resendFrom ?? ''}
                                      onChange={(e) =>
                                        updateSensitiveConfig({
                                          resendFrom: e.target.value,
                                        })
                                      }
                                      placeholder="NavHub <noreply@example.com>"
                                      className={INPUT_CLS}
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                                      {t('settings.reminderBoard.emailToLabel')}
                                    </label>
                                    <input
                                      type="text"
                                      value={sensitiveConfig?.emailTo ?? ''}
                                      onChange={(e) =>
                                        updateSensitiveConfig({
                                          emailTo: e.target.value,
                                        })
                                      }
                                      placeholder="you@example.com"
                                      className={INPUT_CLS}
                                    />
                                    <p className="text-[11px] text-slate-400 dark:text-slate-500">
                                      {t('settings.reminderBoard.emailToHelperText')}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Bark */}
                            {channel.value === 'bark' && (
                              <div className="space-y-1">
                                <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                                  {t('settings.reminderBoard.barkKeyLabel')}
                                </label>
                                <input
                                  type="password"
                                  value={sensitiveConfig?.barkKey ?? ''}
                                  onChange={(e) =>
                                    updateSensitiveConfig({
                                      barkKey: e.target.value,
                                    })
                                  }
                                  placeholder="xxxxxxxxxxxxxx"
                                  className={INPUT_CLS}
                                />
                              </div>
                            )}

                            {/* Encrypted storage hint */}
                            <p className="text-[11px] text-slate-400 dark:text-slate-500">
                              🔒 {t('settings.reminderBoard.encryptedStorageHint')}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ── Section B: Delivery Rules & Templates ── */}
              <div className="p-4 space-y-4">
                <div>
                  <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    {t('settings.reminderBoard.deliverySectionTitle')}
                  </h4>
                  <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
                    {t('settings.reminderBoard.deliverySectionDesc')}
                  </p>
                </div>

                {/* Time Zone */}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                    {t('settings.reminderBoard.timeZoneLabel')}
                  </label>
                  <input
                    type="text"
                    disabled={!canConfigureNotifications}
                    value={notificationSettings.timeZone ?? ''}
                    onChange={(e) => updateNotificationSettings({ timeZone: e.target.value })}
                    placeholder="Asia/Shanghai"
                    className={INPUT_CLS}
                  />
                  <p className="text-[11px] text-slate-400 dark:text-slate-500">
                    {t('settings.reminderBoard.timeZoneHelperText')}
                  </p>
                </div>

                {/* Title Template */}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                    {t('settings.reminderBoard.titleTemplateLabel')}
                  </label>
                  <input
                    type="text"
                    disabled={!canConfigureNotifications}
                    value={notificationSettings.titleTemplate ?? ''}
                    onChange={(e) =>
                      updateNotificationSettings({
                        titleTemplate: e.target.value,
                      })
                    }
                    placeholder={t('settings.reminderBoard.titleTemplatePlaceholder')}
                    className={INPUT_CLS}
                  />
                  <p className="text-[11px] text-slate-400 dark:text-slate-500">
                    {t('settings.reminderBoard.titleTemplateDefaultHint')}
                  </p>
                </div>

                {/* Body Template */}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                    {t('settings.reminderBoard.bodyTemplateLabel')}
                  </label>
                  <textarea
                    disabled={!canConfigureNotifications}
                    value={notificationSettings.bodyTemplate ?? ''}
                    onChange={(e) =>
                      updateNotificationSettings({
                        bodyTemplate: e.target.value,
                      })
                    }
                    placeholder={t('settings.reminderBoard.bodyTemplatePlaceholder')}
                    rows={3}
                    className={`${INPUT_CLS} resize-none`}
                  />
                  <p className="text-[11px] text-slate-400 dark:text-slate-500">
                    {t('settings.reminderBoard.bodyTemplateVars')}
                  </p>
                </div>
              </div>

              {/* ── Section C: Quiet Hours ── */}
              <div className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                      {t('settings.reminderBoard.quietHoursLabel')}
                    </h4>
                    <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
                      {t('settings.reminderBoard.quietHoursDesc')}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => updateQuietHours({ enabled: !quietHours.enabled })}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors ${
                      quietHours.enabled ? 'bg-accent' : 'bg-slate-300 dark:bg-slate-600'
                    }`}
                    aria-pressed={Boolean(quietHours.enabled)}
                    aria-label={t('settings.reminderBoard.quietHoursLabel')}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${
                        quietHours.enabled ? 'translate-x-5' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
                {quietHours.enabled && (
                  <div className="flex items-end gap-3">
                    <div className="flex-1 space-y-1">
                      <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                        {t('settings.reminderBoard.quietHoursFrom')}
                      </label>
                      <input
                        type="time"
                        value={quietHours.start ?? '22:00'}
                        onChange={(e) => updateQuietHours({ start: e.target.value })}
                        className={INPUT_CLS}
                      />
                    </div>
                    <span className="pb-2.5 text-slate-400 dark:text-slate-500 text-sm shrink-0">
                      —
                    </span>
                    <div className="flex-1 space-y-1">
                      <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                        {t('settings.reminderBoard.quietHoursTo')}
                      </label>
                      <input
                        type="time"
                        value={quietHours.end ?? '08:00'}
                        onChange={(e) => updateQuietHours({ end: e.target.value })}
                        className={INPUT_CLS}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

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
