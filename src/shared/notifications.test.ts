import { describe, expect, it, vi } from 'vitest';
import {
  collectSubscriptionNotificationCandidates,
  processSubscriptionNotifications,
  sendSubscriptionNotification,
} from '../../shared/notifications';
import type { KVNamespaceInterface } from '../../shared/syncApi/types';
import type { CountdownItem, NavHubSyncData } from '../types';

const makeItem = (partial: Partial<CountdownItem> = {}): CountdownItem => ({
  id: 'sub-1',
  title: 'GitHub Pro',
  targetDate: '2026-05-01T00:00:00.000Z',
  targetLocal: '2026-05-01T00:00:00',
  timeZone: 'UTC',
  precision: 'minute',
  rule: { kind: 'interval', unit: 'month', every: 1 },
  reminderMinutes: [1440],
  createdAt: 1,
  subscription: { enabled: true },
  ...partial,
});

const makeData = (item: CountdownItem = makeItem()): NavHubSyncData => ({
  links: [],
  categories: [],
  countdowns: [item],
  siteSettings: {
    title: 'NavHub',
    navTitle: 'NavHub',
    favicon: '',
    cardStyle: 'detailed',
    subscriptionNotifications: {
      enabled: true,
      channels: ['telegram', 'webhook', 'email', 'bark'],
    },
  },
  meta: { updatedAt: 1, deviceId: 'test', version: 1 },
});

const makeKv = (): KVNamespaceInterface => {
  const store = new Map<string, string>();
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    put: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    delete: vi.fn(async (key: string) => {
      store.delete(key);
    }),
    list: vi.fn(async () => ({ keys: [] })),
  } as unknown as KVNamespaceInterface;
};

describe('subscription notifications', () => {
  it('collects enabled interval subscriptions at reminder time', () => {
    const candidates = collectSubscriptionNotificationCandidates(
      makeData(),
      new Date('2026-04-30T00:00:00.000Z'),
    );

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.title).toContain('GitHub Pro');
  });

  it('uses subscription content before note for notification body', () => {
    const candidates = collectSubscriptionNotificationCandidates(
      makeData(
        makeItem({
          note: 'Fallback note',
          subscription: { enabled: true, content: 'Custom subscription content' },
        }),
      ),
      new Date('2026-04-30T00:00:00.000Z'),
    );

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.body).toBe('Custom subscription content');
  });

  it('falls back to note when subscription content is empty', () => {
    const candidates = collectSubscriptionNotificationCandidates(
      makeData(
        makeItem({
          note: 'Fallback note',
          subscription: { enabled: true },
        }),
      ),
      new Date('2026-04-30T00:00:00.000Z'),
    );

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.body).toBe('Fallback note');
  });

  it('uses the configured body template when item content is unavailable', () => {
    const data = makeData();
    data.siteSettings!.subscriptionNotifications!.bodyTemplate = 'Due {{name}} at {{dueLocal}}';

    const candidates = collectSubscriptionNotificationCandidates(
      data,
      new Date('2026-04-30T00:00:00.000Z'),
    );

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.body).toContain('Due GitHub Pro at');
  });

  it('keeps an eight-hour catch-up window for lower-frequency cron runs', () => {
    const candidates = collectSubscriptionNotificationCandidates(
      makeData(),
      new Date('2026-04-30T07:59:00.000Z'),
    );

    expect(candidates).toHaveLength(1);
  });

  it('skips reminders outside the eight-hour catch-up window', () => {
    const candidates = collectSubscriptionNotificationCandidates(
      makeData(),
      new Date('2026-04-30T08:00:00.000Z'),
    );

    expect(candidates).toHaveLength(0);
  });

  it('supports custom lookback window override', () => {
    const withinCustomLookback = collectSubscriptionNotificationCandidates(
      makeData(),
      new Date('2026-04-30T02:59:00.000Z'),
      3 * 60 * 60 * 1000,
    );
    const outsideCustomLookback = collectSubscriptionNotificationCandidates(
      makeData(),
      new Date('2026-04-30T03:00:00.000Z'),
      3 * 60 * 60 * 1000,
    );

    expect(withinCustomLookback).toHaveLength(1);
    expect(outsideCustomLookback).toHaveLength(0);
  });

  it('collects once (non-recurring) subscription rules at reminder time', () => {
    const candidates = collectSubscriptionNotificationCandidates(
      makeData(makeItem({ rule: { kind: 'once' } })),
      new Date('2026-04-30T00:00:00.000Z'),
    );

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.title).toContain('GitHub Pro');
  });

  it('skips once subscription rules that are outside the lookback window', () => {
    const candidates = collectSubscriptionNotificationCandidates(
      makeData(makeItem({ rule: { kind: 'once' } })),
      new Date('2026-04-29T00:00:00.000Z'), // 2 days before, reminder at 1440min = 1 day before
    );

    expect(candidates).toHaveLength(0);
  });

  it('skips cron/lunar/solarTerm subscription rules', () => {
    const cronCandidates = collectSubscriptionNotificationCandidates(
      makeData(makeItem({ rule: { kind: 'cron', expression: '0 0 9 * * *' } })),
      new Date('2026-04-30T00:00:00.000Z'),
    );
    expect(cronCandidates).toHaveLength(0);
  });

  it('sends Telegram, Webhook, Resend, and Bark payloads', async () => {
    const candidate = collectSubscriptionNotificationCandidates(
      makeData(),
      new Date('2026-04-30T00:00:00.000Z'),
    )[0]!;
    const fetcher = vi.fn(async () => new Response('{}', { status: 200 }));

    const results = await sendSubscriptionNotification(
      candidate,
      makeData().siteSettings!.subscriptionNotifications!,
      {
        telegramBotToken: 'token',
        telegramChatId: 'chat',
        webhookUrl: 'https://example.com/hook',
        resendApiKey: 're_key',
        resendFrom: 'NavHub <noreply@example.com>',
        emailTo: 'me@example.com',
        barkKey: 'bark',
      },
      fetcher as unknown as typeof fetch,
    );

    expect(results.every((result) => result.ok)).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it('dedupes sent notifications with KV keys', async () => {
    const kv = makeKv();
    const fetcher = vi.fn(async () => new Response('{}', { status: 200 }));
    const args = {
      env: { NAVHUB_KV: kv },
      data: makeData(),
      sensitive: { notifications: { webhookUrl: 'https://example.com/hook' } },
      now: new Date('2026-04-30T00:00:00.000Z'),
      fetcher: fetcher as unknown as typeof fetch,
    };
    args.data.siteSettings!.subscriptionNotifications!.channels = ['webhook'];

    const first = await processSubscriptionNotifications(args);
    const second = await processSubscriptionNotifications(args);

    expect(first.sent).toBe(1);
    expect(second.skipped).toBe(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
