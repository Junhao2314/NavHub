import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ReminderBoardModal from './ReminderBoardModal';

vi.mock('../../hooks/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      const messages: Record<string, string> = {
        'modals.countdown.addReminder': 'Add reminder',
        'modals.countdown.atTime': 'At time',
        'modals.countdown.removeReminder': 'Remove reminder',
        'modals.countdown.reminderDayChip': `${params?.count} day`,
        'modals.countdown.reminderMinuteChip': `${params?.count} min`,
        'modals.countdown.reminderWeekChip': `${params?.count} week`,
        'modals.countdown.subscriptionReminder': 'Subscription reminder',
        'modals.countdown.subscriptionReminderHint':
          'Worker Cron sends external notifications when the browser is closed',
      };
      return messages[key] ?? key;
    },
    i18n: { language: 'en-US' } as unknown,
    currentLanguage: 'en-US',
  }),
}));

describe('ReminderBoardModal', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  const setInputValue = (input: HTMLInputElement, value: string) => {
    const valueSetter = Object.getOwnPropertyDescriptor(input, 'value')?.set;
    const prototypeValueSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )?.set;
    if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
      prototypeValueSetter.call(input, value);
    } else {
      valueSetter?.call(input, value);
    }
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };

  const renderModal = async (options: { isAdmin?: boolean } = {}) => {
    root = createRoot(container);
    await act(async () => {
      root?.render(
        <ReminderBoardModal
          isOpen
          onClose={vi.fn()}
          onSave={vi.fn()}
          isAdmin={options.isAdmin ?? true}
          privacyGroupEnabled
        />,
      );
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
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('constrains height and uses inner scroll with a fixed footer', async () => {
    await renderModal();

    const card = container.querySelector('div.max-w-md');
    expect(card).toBeTruthy();
    expect(card?.className).toContain('max-h-[90vh]');
    expect(card?.className).toContain('flex');
    expect(card?.className).toContain('flex-col');

    const form = container.querySelector('form');
    expect(form).toBeTruthy();
    expect(form?.className).toContain('overflow-hidden');

    const scrollArea = container.querySelector('form > div.flex-1.overflow-y-auto');
    expect(scrollArea).toBeTruthy();

    const footer = container.querySelector('form > div.shrink-0');
    expect(footer).toBeTruthy();

    const submitButton = container.querySelector('button[type="submit"]');
    expect(submitButton).toBeTruthy();
    expect(footer?.contains(submitButton as Node)).toBe(true);
    expect(scrollArea?.contains(submitButton as Node)).toBe(false);
  });

  it('hides subscription reminder controls for non-admin users', async () => {
    await renderModal({ isAdmin: false });

    expect(container.textContent).not.toContain('订阅提醒');
    expect(container.textContent).not.toContain('Worker Cron');
  });

  it('shows reminder settings only after enabling subscription reminders', async () => {
    await renderModal({ isAdmin: true });

    expect(container.textContent).toContain('Subscription reminder');
    expect(container.querySelector('input[type="number"]')).toBeNull();
    expect(container.textContent).not.toContain('1 week');

    const subscriptionToggle = container.querySelector(
      'input[type="checkbox"]',
    ) as HTMLInputElement | null;
    expect(subscriptionToggle).toBeTruthy();

    await act(async () => {
      subscriptionToggle?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.querySelector('input[type="number"]')).toBeTruthy();
    expect(container.textContent).toContain('1 week');
    expect(container.textContent).toContain('1 day');
    expect(container.textContent).toContain('At time');
  });

  it('adds reminder chips below the input and removes them with explicit controls', async () => {
    await renderModal({ isAdmin: true });

    const subscriptionToggle = container.querySelector(
      'input[type="checkbox"]',
    ) as HTMLInputElement | null;
    await act(async () => {
      subscriptionToggle?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const reminderInput = container.querySelector('input[type="number"]') as HTMLInputElement | null;
    expect(reminderInput).toBeTruthy();
    await act(async () => {
      if (!reminderInput) return;
      setInputValue(reminderInput, '30');
    });

    const addButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Add reminder',
    );
    expect(addButton).toBeTruthy();
    await act(async () => {
      addButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('30 min');

    const removeButton = Array.from(
      container.querySelectorAll('button[aria-label="Remove reminder"]'),
    ).find((button) => button.parentElement?.textContent?.includes('30 min'));
    expect(removeButton).toBeTruthy();
    await act(async () => {
      removeButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).not.toContain('30 min');
  });

});
