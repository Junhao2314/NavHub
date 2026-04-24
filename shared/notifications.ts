import type {
  CountdownItem,
  NavHubSyncData,
  SensitiveConfigPayload,
  SubscriptionNotificationChannel,
  SubscriptionNotificationSettings,
} from '../src/types';
import type { Env } from './syncApi/types';

export const SUBSCRIPTION_NOTIFICATION_SENT_PREFIX = 'navhub:subscription-notification:';
const SUBSCRIPTION_NOTIFICATION_LOOKBACK_MS = 60 * 60 * 1000;

const DEFAULT_TITLE_TEMPLATE = '订阅即将到期：{{name}}';
const DEFAULT_BODY_TEMPLATE =
  '{{name}} 将于 {{dueLocal}} 到期，剩余 {{daysLeft}} 天。请及时续费或处理。';
const DEFAULT_TIME_ZONE = 'Asia/Shanghai';

export interface SubscriptionNotificationCandidate {
  item: CountdownItem;
  occurrence: Date;
  reminderMinutes: number;
  dedupeKey: string;
  title: string;
  body: string;
}

export interface NotificationSendResult {
  channel: SubscriptionNotificationChannel;
  ok: boolean;
  error?: string;
}

export interface ProcessSubscriptionNotificationsResult {
  checked: number;
  sent: number;
  skipped: number;
  warnings: string[];
}

const minuteBucket = (date: Date): number => Math.floor(date.getTime() / 60000);

const isValidTimeZone = (timeZone: string): boolean => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
};

const addInterval = (date: Date, unit: 'day' | 'week' | 'month' | 'year', every: number): Date => {
  const next = new Date(date.getTime());
  if (unit === 'day') next.setUTCDate(next.getUTCDate() + every);
  if (unit === 'week') next.setUTCDate(next.getUTCDate() + every * 7);
  if (unit === 'month') next.setUTCMonth(next.getUTCMonth() + every);
  if (unit === 'year') next.setUTCFullYear(next.getUTCFullYear() + every);
  return next;
};

const getNextNotifiableIntervalOccurrence = (
  item: CountdownItem,
  now: Date,
  reminderMinutes: number[],
): Date | null => {
  if (item.rule.kind !== 'interval') return null;
  const every = Math.max(1, Math.floor(item.rule.every));
  let occurrence = new Date(item.targetDate);
  if (!Number.isFinite(occurrence.getTime())) return null;
  let guard = 0;
  while (
    reminderMinutes.every((minutes) => {
      const remindAtMs = occurrence.getTime() - minutes * 60000;
      return now.getTime() >= remindAtMs + SUBSCRIPTION_NOTIFICATION_LOOKBACK_MS;
    }) &&
    guard < 1000
  ) {
    occurrence = addInterval(occurrence, item.rule.unit, every);
    guard += 1;
  }
  return guard >= 1000 ? null : occurrence;
};

const replaceTemplate = (template: string, values: Record<string, string | number>): string => {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => String(values[key] ?? ''));
};

const formatDueLocal = (date: Date, timeZone: string): string => {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
};

const normalizeChannels = (
  settings?: SubscriptionNotificationSettings,
): SubscriptionNotificationChannel[] => {
  const channels = settings?.channels ?? [];
  return channels.filter((channel, index) => channels.indexOf(channel) === index);
};

export const collectSubscriptionNotificationCandidates = (
  data: NavHubSyncData,
  now = new Date(),
): SubscriptionNotificationCandidate[] => {
  const settings = data.siteSettings?.subscriptionNotifications;
  if (!settings?.enabled) return [];

  const channels = normalizeChannels(settings);
  if (channels.length === 0) return [];

  const timeZone =
    settings.timeZone && isValidTimeZone(settings.timeZone) ? settings.timeZone : DEFAULT_TIME_ZONE;
  const titleTemplate = settings.titleTemplate?.trim() || DEFAULT_TITLE_TEMPLATE;
  const bodyTemplate = settings.bodyTemplate?.trim() || DEFAULT_BODY_TEMPLATE;

  return (data.countdowns ?? []).flatMap((item) => {
    if (!item.subscription?.enabled) return [];

    // Support interval (recurring) and once (single date) rules only
    const isInterval = item.rule.kind === 'interval';
    const isOnce = item.rule.kind === 'once';
    if (!isInterval && !isOnce) return [];

    const reminderMinutes = (item.reminderMinutes?.length ? item.reminderMinutes : [0]).filter(
      (minutes) => Number.isFinite(minutes) && minutes >= 0,
    );
    if (reminderMinutes.length === 0) return [];

    let occurrence: Date;
    if (isInterval) {
      const occ = getNextNotifiableIntervalOccurrence(item, now, reminderMinutes);
      if (!occ) return [];
      occurrence = occ;
    } else {
      // once: the occurrence is the item's fixed targetDate
      occurrence = new Date(item.targetDate);
      if (!Number.isFinite(occurrence.getTime())) return [];
      // Skip if all reminder windows have already passed
      if (
        reminderMinutes.every((minutes) => {
          const remindAtMs = occurrence.getTime() - minutes * 60000;
          return now.getTime() >= remindAtMs + SUBSCRIPTION_NOTIFICATION_LOOKBACK_MS;
        })
      )
        return [];
    }

    const name = item.subscription.name?.trim() || item.title;
    const dueLocal = formatDueLocal(occurrence, item.timeZone || timeZone);
    const daysLeft = Math.max(0, Math.ceil((occurrence.getTime() - now.getTime()) / 86400000));

    return reminderMinutes.flatMap((minutes) => {
      const remindAt = new Date(occurrence.getTime() - minutes * 60000);
      const diffMs = now.getTime() - remindAt.getTime();
      if (diffMs < 0 || diffMs >= SUBSCRIPTION_NOTIFICATION_LOOKBACK_MS) return [];

      const templateValues = {
        name,
        title: item.title,
        dueLocal,
        daysLeft,
        reminderMinutes: minutes,
      };

      return [
        {
          item,
          occurrence,
          reminderMinutes: minutes,
          dedupeKey: `${SUBSCRIPTION_NOTIFICATION_SENT_PREFIX}${item.id}:${minuteBucket(
            occurrence,
          )}:${minutes}`,
          title: replaceTemplate(titleTemplate, templateValues),
          body: replaceTemplate(bodyTemplate, templateValues),
        },
      ];
    });
  });
};

const postJson = async (
  fetcher: typeof fetch,
  url: string,
  payload: unknown,
  headers?: Record<string, string>,
): Promise<Response> => {
  return fetcher(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(headers ?? {}) },
    body: JSON.stringify(payload),
  });
};

export const sendSubscriptionNotification = async (
  candidate: SubscriptionNotificationCandidate,
  settings: SubscriptionNotificationSettings,
  sensitive: SensitiveConfigPayload['notifications'],
  fetcher: typeof fetch = fetch,
): Promise<NotificationSendResult[]> => {
  const channels = normalizeChannels(settings);
  const results: NotificationSendResult[] = [];

  for (const channel of channels) {
    try {
      if (channel === 'telegram') {
        if (!sensitive?.telegramBotToken || !sensitive.telegramChatId) {
          results.push({
            channel,
            ok: false,
            error: 'telegram_not_configured',
          });
          continue;
        }
        const response = await postJson(
          fetcher,
          `https://api.telegram.org/bot${sensitive.telegramBotToken}/sendMessage`,
          {
            chat_id: sensitive.telegramChatId,
            text: `${candidate.title}\n\n${candidate.body}`,
          },
        );
        results.push({
          channel,
          ok: response.ok,
          error: response.ok ? undefined : response.statusText,
        });
        continue;
      }

      if (channel === 'webhook') {
        if (!sensitive?.webhookUrl) {
          results.push({ channel, ok: false, error: 'webhook_not_configured' });
          continue;
        }
        const response = await postJson(
          fetcher,
          sensitive.webhookUrl,
          {
            event: 'subscription_due',
            title: candidate.title,
            body: candidate.body,
            itemId: candidate.item.id,
            dueAt: candidate.occurrence.toISOString(),
          },
          sensitive.webhookHeaders,
        );
        results.push({
          channel,
          ok: response.ok,
          error: response.ok ? undefined : response.statusText,
        });
        continue;
      }

      if (channel === 'email') {
        if (!sensitive?.resendApiKey || !sensitive.resendFrom || !sensitive.emailTo) {
          results.push({ channel, ok: false, error: 'email_not_configured' });
          continue;
        }
        const response = await postJson(
          fetcher,
          'https://api.resend.com/emails',
          {
            from: sensitive.resendFrom,
            to: sensitive.emailTo
              .split(',')
              .map((mail) => mail.trim())
              .filter(Boolean),
            subject: candidate.title,
            text: candidate.body,
          },
          { Authorization: `Bearer ${sensitive.resendApiKey}` },
        );
        results.push({
          channel,
          ok: response.ok,
          error: response.ok ? undefined : response.statusText,
        });
        continue;
      }

      if (channel === 'bark') {
        if (!sensitive?.barkKey) {
          results.push({ channel, ok: false, error: 'bark_not_configured' });
          continue;
        }
        const response = await postJson(fetcher, `https://api.day.app/${sensitive.barkKey}`, {
          title: candidate.title,
          body: candidate.body,
        });
        results.push({
          channel,
          ok: response.ok,
          error: response.ok ? undefined : response.statusText,
        });
      }
    } catch (error) {
      results.push({
        channel,
        ok: false,
        error: error instanceof Error ? error.message : 'send_failed',
      });
    }
  }

  return results;
};

export const processSubscriptionNotifications = async (args: {
  env: Env;
  data: NavHubSyncData | null;
  sensitive: SensitiveConfigPayload | null;
  now?: Date;
  fetcher?: typeof fetch;
}): Promise<ProcessSubscriptionNotificationsResult> => {
  const warnings: string[] = [];
  if (!args.data) return { checked: 0, sent: 0, skipped: 0, warnings };

  const settings = args.data.siteSettings?.subscriptionNotifications;
  const candidates = collectSubscriptionNotificationCandidates(args.data, args.now);
  let sent = 0;
  let skipped = 0;

  for (const candidate of candidates) {
    const existing = await args.env.NAVHUB_KV.get(candidate.dedupeKey);
    if (existing) {
      skipped += 1;
      continue;
    }

    const results = await sendSubscriptionNotification(
      candidate,
      settings ?? {},
      args.sensitive?.notifications,
      args.fetcher,
    );
    if (results.some((result) => result.ok)) {
      await args.env.NAVHUB_KV.put(candidate.dedupeKey, '1', {
        expirationTtl: 90 * 24 * 60 * 60,
      });
      sent += 1;
    } else {
      skipped += 1;
      warnings.push(
        `subscription notification skipped for ${candidate.item.id}: ${results
          .map((result) => `${result.channel}:${result.error ?? 'failed'}`)
          .join(',')}`,
      );
    }
  }

  return { checked: candidates.length, sent, skipped, warnings };
};
