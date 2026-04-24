import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SiteSettings, SubscriptionNotificationChannel } from '../../../types';
import ReminderBoardTab from './ReminderBoardTab';

vi.mock('../../../hooks/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('../../../hooks/useReminderBoardPrefs', () => ({
  useReminderBoardPrefs: () => ({
    viewStyle: 'compact',
    setViewStyle: vi.fn(),
    timerMode: 'cycle',
    setTimerMode: vi.fn(),
    expiredEffect: 'dim',
    setExpiredEffect: vi.fn(),
  }),
}));

const makeSettings = (channels: SubscriptionNotificationChannel[]): SiteSettings => ({
  title: 'NavHub',
  navTitle: 'NavHub',
  favicon: '',
  cardStyle: 'detailed',
  subscriptionNotifications: {
    enabled: true,
    channels,
  },
});

describe('ReminderBoardTab', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  const renderTab = async (
    syncRole: 'admin' | 'user',
    settings = makeSettings(['telegram', 'webhook', 'email', 'bark']),
  ) => {
    root = createRoot(container);
    await act(async () => {
      root?.render(<ReminderBoardTab settings={settings} onChange={vi.fn()} syncRole={syncRole} />);
    });
  };

  beforeEach(() => {
    const testGlobals = globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    };
    testGlobals.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
      root = null;
    }
    container.remove();
    vi.restoreAllMocks();
  });

  it('shows subscription notification settings only for admins', async () => {
    await renderTab('admin');

    expect(container.textContent).toContain('settings.reminderBoard.subscriptionNotificationsDesc');
    expect(container.textContent).toContain('settings.reminderBoard.channels.telegram');

    act(() => {
      root?.unmount();
    });
    root = null;
    container.textContent = '';

    await renderTab('user');

    expect(container.textContent).not.toContain('settings.reminderBoard.subscriptionNotificationsDesc');
    expect(container.textContent).not.toContain('settings.reminderBoard.channels.telegram');
  });

  it('shows credentials only for selected notification channels', async () => {
    await renderTab('admin', makeSettings(['webhook']));

    expect(container.querySelector('input[placeholder="settings.reminderBoard.webhookUrlPlaceholder"]')).toBeTruthy();
    expect(
      container.querySelector('input[placeholder="settings.reminderBoard.telegramBotTokenPlaceholder"]'),
    ).toBeNull();
    expect(
      container.querySelector('input[placeholder="settings.reminderBoard.resendApiKeyPlaceholder"]'),
    ).toBeNull();
    expect(container.querySelector('input[placeholder="settings.reminderBoard.barkKeyPlaceholder"]')).toBeNull();
  });
});
