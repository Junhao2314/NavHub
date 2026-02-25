import { describe, expect, it } from 'vitest';
import type { CountdownItem } from '../types';
import { getNextOccurrence } from './countdown';
import { parseNaturalInput } from './naturalDate';

const makeItem = (partial: Partial<CountdownItem>): CountdownItem => {
  const createdAt = Date.parse('2026-01-01T00:00:00.000Z');
  return {
    id: 'item',
    title: 'Test',
    note: undefined,
    targetDate: '2026-01-01T00:00:00.000Z',
    targetLocal: '2026-01-01T00:00:00',
    timeZone: 'UTC',
    precision: 'minute',
    rule: { kind: 'once' },
    reminderMinutes: [],
    createdAt,
    ...partial,
  };
};

describe('parseNaturalInput', () => {
  it('parses relative time: 3天后', () => {
    const now = new Date('2026-02-01T10:20:30.000Z');
    const result = parseNaturalInput('3天后', { now, timeZone: 'UTC' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.targetLocal).toBe('2026-02-04T10:20:30');
    expect(result.precision).toBe('day');
  });

  it('parses weekday: 下周五', () => {
    const now = new Date('2026-02-11T00:00:00.000Z'); // Wed
    const result = parseNaturalInput('下周五', { now, timeZone: 'UTC' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.targetLocal).toBe('2026-02-20T00:00:00');
  });

  it('parses monthly rule: 每月15号', () => {
    const now = new Date('2026-02-11T00:00:00.000Z');
    const result = parseNaturalInput('每月15号', { now, timeZone: 'UTC' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rule?.kind).toBe('cron');
    expect(
      result.rule && result.rule.kind === 'cron' ? result.rule.expression.split(/\s+/).length : 0,
    ).toBe(6);
    expect(result.targetLocal).toBe('2026-02-15T00:00:00');
  });

  it('parses lunar and solar term rules and can compute a future occurrence', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');

    const lunar = parseNaturalInput('腊月二十三', { now, timeZone: 'UTC' });
    expect(lunar.ok).toBe(true);
    if (lunar.ok) {
      expect(lunar.rule?.kind).toBe('lunarYearly');
      const item = makeItem({
        timeZone: lunar.timeZone,
        rule: lunar.rule!,
        targetLocal: '2026-01-01T00:00:00',
      });
      const next = getNextOccurrence(item, now);
      expect(next.getTime()).toBeGreaterThan(now.getTime());
    }

    const term = parseNaturalInput('立春', { now, timeZone: 'UTC' });
    expect(term.ok).toBe(true);
    if (term.ok) {
      expect(term.rule?.kind).toBe('solarTermYearly');
      const item = makeItem({
        timeZone: term.timeZone,
        rule: term.rule!,
        targetLocal: '2026-01-01T00:00:00',
      });
      const next = getNextOccurrence(item, now);
      expect(next.getTime()).toBeGreaterThan(now.getTime());
    }
  });
});
