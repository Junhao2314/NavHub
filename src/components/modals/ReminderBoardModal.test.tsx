import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CountdownItem } from '../../types';
import ReminderBoardModal from './ReminderBoardModal';

vi.mock('../../hooks/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      const messages: Record<string, string> = {
        'modals.countdown.addReminder': 'Add reminder',
        'modals.countdown.applyNatural': 'Parse/Apply',
        'modals.countdown.atTime': 'At time',
        'modals.countdown.naturalInput': 'Natural language',
        'modals.countdown.naturalInputPlaceholder': 'next Fri, in 3 days, monthly 15th...',
        'modals.countdown.removeReminder': 'Remove reminder',
        'modals.countdown.reminderMinuteChipSingle': '1 minute before',
        'modals.countdown.reminderHourChipSingle': '1 hour before',
        'modals.countdown.reminderDayChipSingle': '1 day before',
        'modals.countdown.reminderWeekChipSingle': '1 week before',
        'modals.countdown.reminderMonthChipSingle': '1 month before',
        'modals.countdown.reminderYearChipSingle': '1 year before',
        'modals.countdown.reminderHourChip': `${params?.count} hours before`,
        'modals.countdown.reminderDayChip': `${params?.count} days before`,
        'modals.countdown.reminderMinuteChip': `${params?.count} minutes before`,
        'modals.countdown.reminderMonthChip': `${params?.count} months before`,
        'modals.countdown.reminderYearChip': `${params?.count} years before`,
        'modals.countdown.reminderMinuteSummaryItemSingle': '1 minute before',
        'modals.countdown.reminderHourSummaryItemSingle': '1 hour before',
        'modals.countdown.reminderDaySummaryItemSingle': '1 day before',
        'modals.countdown.reminderWeekSummaryItemSingle': '1 week before',
        'modals.countdown.reminderMonthSummaryItemSingle': '1 month before',
        'modals.countdown.reminderYearSummaryItemSingle': '1 year before',
        'modals.countdown.reminderHourSummaryItem': `${params?.count} hours before`,
        'modals.countdown.reminderDaySummaryItem': `${params?.count} days before`,
        'modals.countdown.reminderMinuteSummaryItem': `${params?.count} minutes before`,
        'modals.countdown.reminderPlaceholder':
          'Custom, e.g. 3 days before, 45 min before, 1 month before, at time',
        'modals.countdown.reminderPresetAtTime': 'At time',
        'modals.countdown.reminderPresetDefaultBadge': 'Default',
        'modals.countdown.reminderPresetDayBefore': '1 day before',
        'modals.countdown.reminderPresetTwoHoursBefore': '2 hours before',
        'modals.countdown.reminderPresetWeekBefore': '1 week before',
        'modals.countdown.reminderSummaryActive': `Will remind ${params?.items}`,
        'modals.countdown.reminderSummaryEmpty': `No reminder selected. Suggested default: ${params?.items}`,
        'modals.countdown.reminderSummaryLabel': 'Reminder plan',
        'modals.countdown.reminderWeekChip': `${params?.count} weeks before`,
        'modals.countdown.reminderWeekSummaryItem': `${params?.count} weeks before`,
        'modals.countdown.reminderMonthSummaryItem': `${params?.count} months before`,
        'modals.countdown.reminderYearSummaryItem': `${params?.count} years before`,
        'modals.countdown.remindersHint':
          'Use quick presets or natural-language input, such as 3 days before, 45 min before, 1 month before, or at time',
        'modals.countdown.subscriptionContentPlaceholder': 'Content (defaults to note)',
        'modals.countdown.subscriptionReminderCurrentLabel': 'Current reminders',
        'modals.countdown.subscriptionReminderEmpty': 'No reminders yet',
        'modals.countdown.subscriptionReminder': 'Subscription reminder',
        'modals.countdown.subscriptionReminderHint':
          'Worker Cron sends external notifications when the browser is closed',
        'modals.countdown.targetDate': 'Target Date',
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

  const renderModal = async (
    options: {
      initialData?: Partial<CountdownItem>;
      isAdmin?: boolean;
      onSave?: ReturnType<typeof vi.fn>;
    } = {},
  ) => {
    const onSave = options.onSave ?? vi.fn();
    root = createRoot(container);
    await act(async () => {
      root?.render(
        <ReminderBoardModal
          isOpen
          onClose={vi.fn()}
          onSave={onSave}
          initialData={options.initialData}
          isAdmin={options.isAdmin ?? true}
          privacyGroupEnabled
        />,
      );
    });
    return { onSave };
  };

  const toggleSubscription = async () => {
    const subscriptionToggle = container.querySelector(
      'input[type="checkbox"]',
    ) as HTMLInputElement | null;
    expect(subscriptionToggle).toBeTruthy();
    await act(async () => {
      subscriptionToggle?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  };

  const getReminderRemoveButtons = () =>
    Array.from(container.querySelectorAll('button[aria-label="Remove reminder"]'));

  const removeReminderByLabel = async (label: string) => {
    const removeButton = getReminderRemoveButtons().find((button) =>
      button.parentElement?.textContent?.includes(label),
    );
    expect(removeButton).toBeTruthy();
    await act(async () => {
      removeButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
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

    expect(container.textContent).not.toContain('Subscription reminder');
    expect(container.textContent).not.toContain('Worker Cron');
  });

  it('keeps natural language parsing inside the target time section', async () => {
    await renderModal({ isAdmin: true });

    const targetDateLabel = Array.from(container.querySelectorAll('label')).find(
      (label) => label.textContent === 'Target Date',
    );
    const targetSection = targetDateLabel?.parentElement;

    expect(targetSection).toBeTruthy();
    expect(targetSection?.textContent).toContain('Natural language');
    expect(targetSection?.textContent).toContain('Parse/Apply');
    expect(
      targetSection?.querySelector('input[placeholder="next Fri, in 3 days, monthly 15th..."]'),
    ).toBeTruthy();
  });

  it('shows reminder settings only after enabling subscription reminders', async () => {
    await renderModal({ isAdmin: true });

    expect(container.textContent).toContain('Subscription reminder');
    expect(
      container.querySelector(
        'input[placeholder="Custom, e.g. 3 days before, 45 min before, 1 month before, at time"]',
      ),
    ).toBeNull();

    await toggleSubscription();

    expect(
      container.querySelector(
        'input[placeholder="Custom, e.g. 3 days before, 45 min before, 1 month before, at time"]',
      ),
    ).toBeTruthy();
    expect(
      container.querySelector('textarea[placeholder="Content (defaults to note)"]'),
    ).toBeTruthy();
    const reminderInput = container.querySelector(
      'input[placeholder="Custom, e.g. 3 days before, 45 min before, 1 month before, at time"]',
    ) as HTMLInputElement | null;
    const currentReminderLabel = Array.from(container.querySelectorAll('span')).find(
      (element) => element.textContent === 'Current reminders',
    );
    expect(reminderInput).toBeTruthy();
    expect(currentReminderLabel).toBeTruthy();
    expect(
      reminderInput?.compareDocumentPosition(currentReminderLabel as Node) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(container.textContent).toContain('Current reminders');
    expect(container.textContent).toContain('At time');
    expect(container.textContent).toContain('1 day before');
    expect(getReminderRemoveButtons()).toHaveLength(2);
    expect(container.textContent).not.toContain('1 week before');
    expect(container.textContent).not.toContain('Reminder plan');
    expect(container.textContent).not.toContain('2 hours before');
    expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(2);
  });

  it('migrates legacy 1 hour / 10 minute defaults to subscription defaults when enabling', async () => {
    const onSave = vi.fn();
    await renderModal({
      initialData: {
        id: 'legacy',
        title: 'Legacy item',
        targetDate: '2026-05-01T00:00:00.000Z',
        targetLocal: '2026-05-01T08:00:00',
        timeZone: 'Asia/Shanghai',
        precision: 'minute',
        rule: { kind: 'once' },
        reminderMinutes: [60, 10, 0],
      },
      isAdmin: true,
      onSave,
    });

    await toggleSubscription();

    await act(async () => {
      const submitButton = container.querySelector('button[type="submit"]');
      submitButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).not.toContain('1 hr');
    expect(container.textContent).not.toContain('10 min');
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0]?.[0]?.reminderMinutes).toEqual([1440, 0]);
  });

  it('adds natural-language reminders into the current subscription reminder list', async () => {
    await renderModal({ isAdmin: true });

    await toggleSubscription();

    const reminderInput = container.querySelector(
      'input[placeholder="Custom, e.g. 3 days before, 45 min before, 1 month before, at time"]',
    ) as HTMLInputElement | null;
    expect(reminderInput).toBeTruthy();
    await act(async () => {
      if (!reminderInput) return;
      setInputValue(reminderInput, '2 hours before');
    });

    const addButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Add reminder',
    );
    expect(addButton).toBeTruthy();
    await act(async () => {
      addButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('2 hours before');
    expect(container.textContent).toContain('At time');
    expect(container.textContent).toContain('1 day before');
    expect(getReminderRemoveButtons()).toHaveLength(3);

    await removeReminderByLabel('2 hours before');

    expect(container.textContent).not.toContain('2 hours before');
    expect(getReminderRemoveButtons()).toHaveLength(2);
  });

  it('supports month and year reminder labels from natural-language input', async () => {
    await renderModal({ isAdmin: true });

    await toggleSubscription();

    const reminderInput = container.querySelector(
      'input[placeholder="Custom, e.g. 3 days before, 45 min before, 1 month before, at time"]',
    ) as HTMLInputElement | null;
    expect(reminderInput).toBeTruthy();

    await act(async () => {
      if (!reminderInput) return;
      setInputValue(reminderInput, '1 month before');
    });

    const addButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Add reminder',
    );
    expect(addButton).toBeTruthy();
    await act(async () => {
      addButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('1 month before');

    await act(async () => {
      if (!reminderInput) return;
      setInputValue(reminderInput, '1 year before');
    });

    await act(async () => {
      addButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('1 year before');
  });

  it('allows removing default subscription reminders and saving an empty list', async () => {
    const onSave = vi.fn();
    await renderModal({
      initialData: {
        id: 'subscription-item',
        title: 'Subscription item',
        targetDate: '2026-05-01T00:00:00.000Z',
        targetLocal: '2026-05-01T08:00:00',
        timeZone: 'Asia/Shanghai',
        precision: 'minute',
        rule: { kind: 'once' },
        reminderMinutes: [1440, 0],
        subscription: { enabled: true },
      },
      isAdmin: true,
      onSave,
    });

    expect(container.textContent).toContain('At time');
    expect(container.textContent).toContain('1 day before');

    await removeReminderByLabel('At time');
    await removeReminderByLabel('1 day before');

    expect(container.textContent).toContain('No reminders yet');
    expect(getReminderRemoveButtons()).toHaveLength(0);

    await act(async () => {
      const submitButton = container.querySelector('button[type="submit"]');
      submitButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0]?.[0]?.reminderMinutes).toEqual([]);
  });

  it('keeps enabled subscription reminder lists empty when saved data is empty', async () => {
    const onSave = vi.fn();
    await renderModal({
      initialData: {
        id: 'empty-subscription-item',
        title: 'Empty subscription item',
        targetDate: '2026-05-01T00:00:00.000Z',
        targetLocal: '2026-05-01T08:00:00',
        timeZone: 'Asia/Shanghai',
        precision: 'minute',
        rule: { kind: 'once' },
        reminderMinutes: [],
        subscription: { enabled: true },
      },
      isAdmin: true,
      onSave,
    });

    expect(container.textContent).toContain('Current reminders');
    expect(container.textContent).toContain('No reminders yet');
    expect(container.textContent).not.toContain('At time');
    expect(container.textContent).not.toContain('1 day before');
    expect(getReminderRemoveButtons()).toHaveLength(0);

    await act(async () => {
      const submitButton = container.querySelector('button[type="submit"]');
      submitButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0]?.[0]?.reminderMinutes).toEqual([]);
  });
});
