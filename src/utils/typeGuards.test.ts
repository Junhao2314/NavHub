import { describe, expect, it } from 'vitest';
import { isPartialSiteSettings, isSensitiveConfigPayload } from './typeGuards';

describe('typeGuards subscription notifications', () => {
  it('accepts subscription notification settings', () => {
    expect(
      isPartialSiteSettings({
        subscriptionNotifications: {
          enabled: true,
          channels: ['telegram', 'webhook', 'email', 'bark'],
          timeZone: 'Asia/Shanghai',
          titleTemplate: '订阅即将到期：{{name}}',
          bodyTemplate: '{{dueLocal}}',
        },
      }),
    ).toBe(true);
  });

  it('rejects invalid subscription channels', () => {
    expect(
      isPartialSiteSettings({
        subscriptionNotifications: {
          enabled: true,
          channels: ['sms'],
        },
      }),
    ).toBe(false);
  });

  it('accepts notification sensitive payload fields', () => {
    expect(
      isSensitiveConfigPayload({
        apiKey: 'ai-key',
        notifications: {
          telegramBotToken: 'bot-token',
          telegramChatId: 'chat-id',
          webhookUrl: 'https://example.com/hook',
          webhookHeaders: { Authorization: 'Bearer token' },
          resendApiKey: 're_123',
          resendFrom: 'NavHub <noreply@example.com>',
          emailTo: 'me@example.com',
          barkKey: 'bark-key',
        },
      }),
    ).toBe(true);
  });

  it('rejects invalid notification sensitive payload fields', () => {
    expect(
      isSensitiveConfigPayload({
        notifications: {
          webhookHeaders: { Authorization: 123 },
        },
      }),
    ).toBe(false);
  });
});
