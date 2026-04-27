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
    'modals.countdown.reminderMinuteChipSingle': '1 minute before',
    'modals.countdown.reminderHourChipSingle': '1 hour before',
    'modals.countdown.reminderDayChipSingle': '1 day before',
    'modals.countdown.reminderWeekChipSingle': '1 week before',
    'modals.countdown.reminderMonthChipSingle': '1 month before',
    'modals.countdown.reminderYearChipSingle': '1 year before',
    'modals.countdown.reminderMinuteChip': `${params?.count} minutes before`,
    'modals.countdown.reminderHourChip': `${params?.count} hours before`,
    'modals.countdown.reminderDayChip': `${params?.count} days before`,
    'modals.countdown.reminderWeekChip': `${params?.count} weeks before`,
    'modals.countdown.reminderMonthChip': `${params?.count} months before`,
    'modals.countdown.reminderYearChip': `${params?.count} years before`,
    'modals.countdown.reminderMinuteSummaryItemSingle': '1 minute before',
    'modals.countdown.reminderHourSummaryItemSingle': '1 hour before',
    'modals.countdown.reminderDaySummaryItemSingle': '1 day before',
    'modals.countdown.reminderWeekSummaryItemSingle': '1 week before',
    'modals.countdown.reminderMonthSummaryItemSingle': '1 month before',
    'modals.countdown.reminderYearSummaryItemSingle': '1 year before',
    'modals.countdown.reminderMinuteSummaryItem': `${params?.count} minutes before`,
    'modals.countdown.reminderHourSummaryItem': `${params?.count} hours before`,
    'modals.countdown.reminderDaySummaryItem': `${params?.count} days before`,
    'modals.countdown.reminderWeekSummaryItem': `${params?.count} weeks before`,
    'modals.countdown.reminderMonthSummaryItem': `${params?.count} months before`,
    'modals.countdown.reminderYearSummaryItem': `${params?.count} years before`,
    'modals.countdown.reminderPresetAtTime': 'At time',
    'modals.countdown.reminderPresetDayBefore': '1 day before',
    'modals.countdown.reminderPresetTwoHoursBefore': '2 hours before',
    'modals.countdown.reminderPresetWeekBefore': '1 week before',
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
    expect(parseReminderLeadTime('1 month before')).toBe(43200);
    expect(parseReminderLeadTime('1 year before')).toBe(525600);
    expect(parseReminderLeadTime('day before')).toBe(1440);
    expect(parseReminderLeadTime('at time')).toBe(0);
  });

  it('formats chip labels and summaries in a readable order', () => {
    expect(formatReminderChipLabel(120, t)).toBe('2 hours before');
    expect(formatReminderChipLabel(45, t)).toBe('45 minutes before');
    expect(formatReminderChipLabel(43200, t)).toBe('1 month before');
    expect(formatReminderChipLabel(525600, t)).toBe('1 year before');
    expect(buildReminderSummary([1440, 0], t, 'en-US')).toBe(
      'Will remind At time and 1 day before',
    );
    expect(buildReminderSummary([], t, 'en-US', [...DEFAULT_SUBSCRIPTION_REMINDER_MINUTES])).toBe(
      'Suggested default: At time and 1 day before',
    );
  });
});
