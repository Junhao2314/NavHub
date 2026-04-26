import { describe, expect, it } from 'vitest';
import {
  buildReminderSummary,
  DEFAULT_SUBSCRIPTION_REMINDER_MINUTES,
  formatReminderChipLabel,
  parseReminderLeadTime,
} from './reminderLeadTime';

const t = (key: string, params?: Record<string, unknown>) => {
  const messages: Record<string, string> = {
    'modals.countdown.atTime': 'At time',
    'modals.countdown.reminderMinuteChip': `${params?.count} min`,
    'modals.countdown.reminderHourChip': `${params?.count} hr`,
    'modals.countdown.reminderDayChip': `${params?.count} day`,
    'modals.countdown.reminderWeekChip': `${params?.count} week`,
    'modals.countdown.reminderMinuteSummaryItem': `${params?.count} min before`,
    'modals.countdown.reminderHourSummaryItem': `${params?.count} hr before`,
    'modals.countdown.reminderDaySummaryItem': `${params?.count} day before`,
    'modals.countdown.reminderWeekSummaryItem': `${params?.count} week before`,
    'modals.countdown.reminderSummaryActive': `Will remind ${params?.items}`,
    'modals.countdown.reminderSummaryEmpty': `Suggested default: ${params?.items}`,
  };
  return messages[key] ?? key;
};

describe('reminderLeadTime', () => {
  it('parses common Chinese and English lead-time phrases', () => {
    expect(parseReminderLeadTime('3天前')).toBe(4320);
    expect(parseReminderLeadTime('提前2小时')).toBe(120);
    expect(parseReminderLeadTime('半小时前')).toBe(30);
    expect(parseReminderLeadTime('前一晚')).toBe(1440);
    expect(parseReminderLeadTime('2 hours before')).toBe(120);
    expect(parseReminderLeadTime('day before')).toBe(1440);
    expect(parseReminderLeadTime('at time')).toBe(0);
  });

  it('formats chip labels and summaries in a readable order', () => {
    expect(formatReminderChipLabel(120, t)).toBe('2 hr');
    expect(buildReminderSummary([1440, 0], t, 'en-US')).toBe(
      'Will remind At time and 1 day before',
    );
    expect(buildReminderSummary([], t, 'en-US', [...DEFAULT_SUBSCRIPTION_REMINDER_MINUTES])).toBe(
      'Suggested default: At time and 1 day before',
    );
  });
});
