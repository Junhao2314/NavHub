import { describe, expect, it } from 'vitest';
import type { CountdownItem } from '../types';
import { getCountdownProgress, getNextOccurrence, getPreviousOccurrence } from './countdown';

const makeItem = (partial: Partial<CountdownItem>): CountdownItem => {
  const createdAt = Date.parse('2026-02-01T00:00:00.000Z');
  return {
    id: 'item',
    title: 'Test',
    note: undefined,
    targetDate: '2026-02-11T00:00:00.000Z',
    targetLocal: '2026-02-11T00:00:00',
    timeZone: 'UTC',
    precision: 'minute',
    rule: { kind: 'once' },
    reminderMinutes: [],
    createdAt,
    ...partial,
  };
};

describe('getCountdownProgress', () => {
  it('calculates progress for once countdown (midway)', () => {
    const createdAt = Date.parse('2026-02-01T00:00:00.000Z');
    const item = makeItem({
      rule: { kind: 'once' },
      targetDate: '2026-02-11T00:00:00.000Z',
      targetLocal: '2026-02-11T00:00:00',
      createdAt,
    });
    const now = new Date('2026-02-06T00:00:00.000Z');

    const result = getCountdownProgress({ item, createdAt, now });
    expect(result.totalMs).toBe(10 * 24 * 60 * 60 * 1000);
    expect(result.elapsedMs).toBe(5 * 24 * 60 * 60 * 1000);
    expect(result.ratio).toBe(0.5);
  });

  it('clamps ratio to 1 for overdue once countdown', () => {
    const createdAt = Date.parse('2026-02-01T00:00:00.000Z');
    const item = makeItem({
      rule: { kind: 'once' },
      targetDate: '2026-02-11T00:00:00.000Z',
      targetLocal: '2026-02-11T00:00:00',
      createdAt,
    });
    const now = new Date('2026-02-20T00:00:00.000Z');

    const result = getCountdownProgress({ item, createdAt, now });
    expect(result.totalMs).toBe(10 * 24 * 60 * 60 * 1000);
    expect(result.elapsedMs).toBe(19 * 24 * 60 * 60 * 1000);
    expect(result.ratio).toBe(1);
  });

  it('uses createdAt as start before first interval window', () => {
    const createdAt = Date.parse('2026-02-01T00:00:00.000Z');
    const item = makeItem({
      rule: { kind: 'interval', unit: 'day', every: 1 },
      targetDate: '2026-02-11T00:00:00.000Z',
      targetLocal: '2026-02-11T00:00:00',
      createdAt,
    });
    const now = new Date('2026-02-06T00:00:00.000Z');

    const result = getCountdownProgress({ item, createdAt, now });
    expect(result.totalMs).toBe(10 * 24 * 60 * 60 * 1000);
    expect(result.elapsedMs).toBe(5 * 24 * 60 * 60 * 1000);
    expect(result.ratio).toBe(0.5);
  });

  it('switches to previous interval window after recurrence starts', () => {
    const createdAt = Date.parse('2026-02-01T00:00:00.000Z');
    const item = makeItem({
      rule: { kind: 'interval', unit: 'day', every: 1 },
      targetDate: '2026-02-11T00:00:00.000Z',
      targetLocal: '2026-02-11T00:00:00',
      createdAt,
    });
    const now = new Date('2026-02-12T12:00:00.000Z');

    const result = getCountdownProgress({ item, createdAt, now });
    expect(result.totalMs).toBe(24 * 60 * 60 * 1000);
    expect(result.elapsedMs).toBe(12 * 60 * 60 * 1000);
    expect(result.ratio).toBe(0.5);
  });
});

describe('getNextOccurrence / getPreviousOccurrence', () => {
  it('supports biweekly interval', () => {
    const item = makeItem({
      rule: { kind: 'interval', unit: 'week', every: 2 },
      targetDate: '2026-02-01T00:00:00.000Z',
      targetLocal: '2026-02-01T00:00:00',
    });

    const now = new Date('2026-02-20T00:00:00.000Z');
    const next = getNextOccurrence(item, now);
    const prev = getPreviousOccurrence(item, now);

    expect(next.toISOString()).toBe('2026-03-01T00:00:00.000Z');
    expect(prev?.toISOString()).toBe('2026-02-15T00:00:00.000Z');
  });

  it('clamps quarterly interval across month end (Jan 31 + 3 months = Apr 30)', () => {
    const item = makeItem({
      rule: { kind: 'interval', unit: 'month', every: 3 },
      targetDate: '2026-01-31T00:00:00.000Z',
      targetLocal: '2026-01-31T00:00:00',
    });

    const now = new Date('2026-02-01T00:00:00.000Z');
    const next = getNextOccurrence(item, now);
    expect(next.toISOString()).toBe('2026-04-30T00:00:00.000Z');

    const prevAtMay = getPreviousOccurrence(item, new Date('2026-05-01T00:00:00.000Z'));
    expect(prevAtMay?.toISOString()).toBe('2026-04-30T00:00:00.000Z');
  });

  it('cron workdays skips weekend', () => {
    const item = makeItem({
      rule: { kind: 'cron', expression: '0 9 * * 1-5' },
      targetDate: '2026-02-01T00:00:00.000Z',
      targetLocal: '2026-02-01T00:00:00',
    });

    const now = new Date('2026-02-07T08:00:00.000Z'); // Saturday
    const next = getNextOccurrence(item, now);
    expect(next.toISOString()).toBe('2026-02-09T09:00:00.000Z'); // Monday
  });
});
