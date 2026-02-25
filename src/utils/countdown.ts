import { Cron } from 'croner';
import { Lunar, Solar } from 'lunar-javascript';
import { DateTime } from 'luxon';
import type {
  CountdownItem,
  CountdownPrecision,
  CountdownRecurrence,
  CountdownRule,
} from '../types';
import { getSolarTermKeyByZhName, getSolarTermZhNameByKey } from './chineseCalendar';
import { normalizeTimeZone } from './timezone';

export type CountdownUrgency = 'critical' | 'warning' | 'normal';

export interface CountdownRemaining {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  isPast: boolean;
  urgency: CountdownUrgency;
  totalMs: number;
}

export interface CountdownProgress {
  prev: Date;
  next: Date;
  elapsedMs: number;
  totalMs: number;
  ratio: number;
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const toTargetLocalString = (dt: DateTime): string => dt.toFormat("yyyy-MM-dd'T'HH:mm:ss");

const normalizeCronExpression = (expression: string): string => {
  const parts = expression.trim().split(/\s+/).filter(Boolean);
  // Support standard 5-field cron (min hour dom mon dow) by prefixing seconds
  if (parts.length === 5) return ['0', ...parts].join(' ');
  return parts.join(' ');
};

const getEffectiveRule = (item: CountdownItem): CountdownRule => {
  if (item.rule) return item.rule;

  const legacy = item.recurrence;
  if (legacy) {
    if (legacy === 'once') return { kind: 'once' };
    if (legacy === 'daily') return { kind: 'interval', unit: 'day', every: 1 };
    if (legacy === 'weekly') return { kind: 'interval', unit: 'week', every: 1 };
    if (legacy === 'monthly') return { kind: 'interval', unit: 'month', every: 1 };
    if (legacy === 'yearly') return { kind: 'interval', unit: 'year', every: 1 };
  }

  return { kind: 'once' };
};

const getAnchorInZone = (item: CountdownItem, zone: string): DateTime => {
  const local = DateTime.fromISO(item.targetLocal, { zone });
  if (local.isValid) return local.set({ millisecond: 0 });

  const utc = DateTime.fromISO(item.targetDate, { zone: 'utc' });
  if (utc.isValid) return utc.setZone(zone).set({ millisecond: 0 });

  return DateTime.now().setZone(zone).set({ millisecond: 0 });
};

const cronCache = new Map<string, Cron>();

const getCronJob = (expression: string, timeZone: string): Cron | null => {
  const zone = normalizeTimeZone(timeZone);
  const normalized = normalizeCronExpression(expression);
  const key = `${zone}::${normalized}`;

  const cached = cronCache.get(key);
  if (cached) return cached;

  try {
    const job = new Cron(normalized, { timezone: zone, paused: true });
    cronCache.set(key, job);
    return job;
  } catch {
    return null;
  }
};

const getSolarTermKey = (term: string): string | null => {
  const trimmed = term.trim();
  if (!trimmed) return null;
  // Legacy placeholder keys used by older versions.
  if (trimmed.startsWith('{jq.') && trimmed.endsWith('}')) {
    return getSolarTermZhNameByKey(trimmed) ?? trimmed;
  }
  // Prefer zh names; allow other known keys (e.g. LI_CHUN) to pass through.
  return getSolarTermKeyByZhName(trimmed) ?? trimmed;
};

const getCurrentLunarYear = (now: DateTime): number => {
  try {
    const lunar = Solar.fromYmdHms(
      now.year,
      now.month,
      now.day,
      now.hour,
      now.minute,
      now.second,
    ).getLunar();
    return lunar.getYear();
  } catch {
    return now.year;
  }
};

const getNextByInterval = (args: {
  anchor: DateTime;
  now: DateTime;
  unit: 'day' | 'week' | 'month' | 'year';
  every: number;
}): DateTime => {
  const every = Math.max(1, Math.floor(args.every));
  const anchor = args.anchor;
  const now = args.now;

  let candidate = anchor;
  if (candidate <= now) {
    switch (args.unit) {
      case 'day': {
        const intervalMs = every * 24 * 60 * 60 * 1000;
        const diffMs = now.toMillis() - anchor.toMillis();
        const n = diffMs > 0 ? Math.floor(diffMs / intervalMs) : 0;
        candidate = anchor.plus({ days: n * every });
        while (candidate <= now) candidate = candidate.plus({ days: every });
        break;
      }
      case 'week': {
        const intervalMs = every * 7 * 24 * 60 * 60 * 1000;
        const diffMs = now.toMillis() - anchor.toMillis();
        const n = diffMs > 0 ? Math.floor(diffMs / intervalMs) : 0;
        candidate = anchor.plus({ weeks: n * every });
        while (candidate <= now) candidate = candidate.plus({ weeks: every });
        break;
      }
      case 'month': {
        const monthsDiff = (now.year - anchor.year) * 12 + (now.month - anchor.month);
        const n = monthsDiff > 0 ? Math.floor(monthsDiff / every) : 0;
        candidate = anchor.plus({ months: n * every });
        while (candidate <= now) candidate = candidate.plus({ months: every });
        break;
      }
      case 'year': {
        const yearsDiff = now.year - anchor.year;
        const n = yearsDiff > 0 ? Math.floor(yearsDiff / every) : 0;
        candidate = anchor.plus({ years: n * every });
        while (candidate <= now) candidate = candidate.plus({ years: every });
        break;
      }
    }
  }

  return candidate;
};

const getPrevByInterval = (args: {
  anchor: DateTime;
  now: DateTime;
  unit: 'day' | 'week' | 'month' | 'year';
  every: number;
}): DateTime | null => {
  const every = Math.max(1, Math.floor(args.every));
  const anchor = args.anchor;
  const now = args.now;

  if (anchor > now) return null;

  let candidate = anchor;
  switch (args.unit) {
    case 'day': {
      const intervalMs = every * 24 * 60 * 60 * 1000;
      const diffMs = now.toMillis() - anchor.toMillis();
      const n = diffMs > 0 ? Math.floor(diffMs / intervalMs) : 0;
      candidate = anchor.plus({ days: n * every });
      while (candidate.plus({ days: every }) <= now) candidate = candidate.plus({ days: every });
      break;
    }
    case 'week': {
      const intervalMs = every * 7 * 24 * 60 * 60 * 1000;
      const diffMs = now.toMillis() - anchor.toMillis();
      const n = diffMs > 0 ? Math.floor(diffMs / intervalMs) : 0;
      candidate = anchor.plus({ weeks: n * every });
      while (candidate.plus({ weeks: every }) <= now) candidate = candidate.plus({ weeks: every });
      break;
    }
    case 'month': {
      const monthsDiff = (now.year - anchor.year) * 12 + (now.month - anchor.month);
      const n = monthsDiff > 0 ? Math.floor(monthsDiff / every) : 0;
      candidate = anchor.plus({ months: n * every });
      while (candidate > now) candidate = candidate.minus({ months: every });
      while (candidate.plus({ months: every }) <= now)
        candidate = candidate.plus({ months: every });
      break;
    }
    case 'year': {
      const yearsDiff = now.year - anchor.year;
      const n = yearsDiff > 0 ? Math.floor(yearsDiff / every) : 0;
      candidate = anchor.plus({ years: n * every });
      while (candidate > now) candidate = candidate.minus({ years: every });
      while (candidate.plus({ years: every }) <= now) candidate = candidate.plus({ years: every });
      break;
    }
  }

  return candidate;
};

export const getNextOccurrence = (item: CountdownItem, now: Date = new Date()): Date => {
  const zone = normalizeTimeZone(item.timeZone);
  const rule = getEffectiveRule(item);
  const nowZoned = DateTime.fromJSDate(now, { zone });
  const anchor = getAnchorInZone(item, zone);

  switch (rule.kind) {
    case 'once': {
      const utc = DateTime.fromISO(item.targetDate, { zone: 'utc' });
      return (utc.isValid ? utc : anchor.toUTC()).toJSDate();
    }
    case 'interval': {
      const next = getNextByInterval({
        anchor,
        now: nowZoned,
        unit: rule.unit,
        every: rule.every,
      });
      return next.toJSDate();
    }
    case 'cron': {
      const job = getCronJob(rule.expression, zone);
      if (!job) return anchor.toJSDate();
      const next = job.nextRun(new Date(now.getTime() + 1));
      if (!(next instanceof Date) || !Number.isFinite(next.getTime())) return anchor.toJSDate();
      return next;
    }
    case 'lunarYearly': {
      const lunarMonth = rule.isLeapMonth ? -Math.abs(rule.month) : Math.abs(rule.month);
      const start = getCurrentLunarYear(nowZoned);
      const hour = anchor.hour;
      const minute = anchor.minute;
      const second = anchor.second;

      for (let y = start; y <= start + 50; y += 1) {
        try {
          const lunar = Lunar.fromYmdHms(y, lunarMonth, rule.day, hour, minute, second);
          const solar = lunar.getSolar();
          const candidate = DateTime.fromObject(
            {
              year: solar.getYear(),
              month: solar.getMonth(),
              day: solar.getDay(),
              hour: solar.getHour(),
              minute: solar.getMinute(),
              second: solar.getSecond(),
              millisecond: 0,
            },
            { zone },
          );
          if (candidate.isValid && candidate > nowZoned) return candidate.toJSDate();
        } catch {
          // skip invalid years (e.g. leap month not present)
        }
      }
      return anchor.toJSDate();
    }
    case 'solarTermYearly': {
      const key = getSolarTermKey(rule.term);
      if (!key) return anchor.toJSDate();

      const hour = anchor.hour;
      const minute = anchor.minute;
      const second = anchor.second;

      for (let y = nowZoned.year; y <= nowZoned.year + 5; y += 1) {
        try {
          const table = Lunar.fromYmd(y, 1, 1).getJieQiTable();
          const solar = table[key] ?? table[rule.term];
          if (!solar) continue;
          const candidate = DateTime.fromObject(
            {
              year: solar.getYear(),
              month: solar.getMonth(),
              day: solar.getDay(),
              hour,
              minute,
              second,
              millisecond: 0,
            },
            { zone },
          );
          if (candidate.isValid && candidate > nowZoned) return candidate.toJSDate();
        } catch {
          // ignore
        }
      }
      return anchor.toJSDate();
    }
  }
};

export const getPreviousOccurrence = (item: CountdownItem, now: Date = new Date()): Date | null => {
  const zone = normalizeTimeZone(item.timeZone);
  const rule = getEffectiveRule(item);
  const nowZoned = DateTime.fromJSDate(now, { zone });
  const anchor = getAnchorInZone(item, zone);

  switch (rule.kind) {
    case 'once': {
      const utc = DateTime.fromISO(item.targetDate, { zone: 'utc' });
      const target = (utc.isValid ? utc : anchor.toUTC()).toJSDate();
      return target.getTime() <= now.getTime() ? target : null;
    }
    case 'interval': {
      const prev = getPrevByInterval({
        anchor,
        now: nowZoned,
        unit: rule.unit,
        every: rule.every,
      });
      return prev ? prev.toJSDate() : null;
    }
    case 'cron': {
      const job = getCronJob(rule.expression, zone);
      if (!job) return null;
      const list = job.previousRuns(1, new Date(now.getTime() + 1));
      const prev = Array.isArray(list) ? list[0] : null;
      if (!(prev instanceof Date) || !Number.isFinite(prev.getTime())) return null;
      return prev;
    }
    case 'lunarYearly': {
      const lunarMonth = rule.isLeapMonth ? -Math.abs(rule.month) : Math.abs(rule.month);
      const start = getCurrentLunarYear(nowZoned);
      const hour = anchor.hour;
      const minute = anchor.minute;
      const second = anchor.second;

      for (let y = start; y >= start - 50; y -= 1) {
        try {
          const lunar = Lunar.fromYmdHms(y, lunarMonth, rule.day, hour, minute, second);
          const solar = lunar.getSolar();
          const candidate = DateTime.fromObject(
            {
              year: solar.getYear(),
              month: solar.getMonth(),
              day: solar.getDay(),
              hour: solar.getHour(),
              minute: solar.getMinute(),
              second: solar.getSecond(),
              millisecond: 0,
            },
            { zone },
          );
          if (candidate.isValid && candidate <= nowZoned) return candidate.toJSDate();
        } catch {
          // ignore
        }
      }
      return null;
    }
    case 'solarTermYearly': {
      const key = getSolarTermKey(rule.term);
      if (!key) return null;

      const hour = anchor.hour;
      const minute = anchor.minute;
      const second = anchor.second;

      for (let y = nowZoned.year; y >= nowZoned.year - 5; y -= 1) {
        try {
          const table = Lunar.fromYmd(y, 1, 1).getJieQiTable();
          const solar = table[key] ?? table[rule.term];
          if (!solar) continue;
          const candidate = DateTime.fromObject(
            {
              year: solar.getYear(),
              month: solar.getMonth(),
              day: solar.getDay(),
              hour,
              minute,
              second,
              millisecond: 0,
            },
            { zone },
          );
          if (candidate.isValid && candidate <= nowZoned) return candidate.toJSDate();
        } catch {
          // ignore
        }
      }
      return null;
    }
  }
};

/**
 * Calculate time remaining until the next target occurrence.
 */
export const getCountdownRemaining = (
  item: CountdownItem,
  now: Date = new Date(),
): CountdownRemaining => {
  const target = getNextOccurrence(item, now);
  const diffMs = target.getTime() - now.getTime();
  const isPast = diffMs <= 0;
  const absDiff = Math.abs(diffMs);

  const days = Math.floor(absDiff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((absDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((absDiff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((absDiff % (1000 * 60)) / 1000);

  const totalDaysRemaining = diffMs / (1000 * 60 * 60 * 24);
  let urgency: CountdownUrgency = 'normal';
  if (!isPast && totalDaysRemaining <= 1) {
    urgency = 'critical';
  } else if (!isPast && totalDaysRemaining <= 3) {
    urgency = 'warning';
  }

  return { days, hours, minutes, seconds, isPast, urgency, totalMs: diffMs };
};

const getPreviousWindowStart = (args: {
  item: CountdownItem;
  rule: CountdownRule;
  next: Date;
}): Date | null => {
  const zone = normalizeTimeZone(args.item.timeZone);

  switch (args.rule.kind) {
    case 'interval': {
      const every = Math.max(1, Math.floor(args.rule.every));
      const nextZoned = DateTime.fromJSDate(args.next, { zone });
      const prev =
        args.rule.unit === 'day'
          ? nextZoned.minus({ days: every })
          : args.rule.unit === 'week'
            ? nextZoned.minus({ weeks: every })
            : args.rule.unit === 'month'
              ? nextZoned.minus({ months: every })
              : nextZoned.minus({ years: every });
      return prev.isValid ? prev.toJSDate() : null;
    }
    case 'cron':
    case 'lunarYearly':
    case 'solarTermYearly': {
      const probe = new Date(args.next.getTime() - 1);
      return getPreviousOccurrence(args.item, probe);
    }
    case 'once':
      return null;
  }
};

export const getCountdownProgress = (args: {
  item: CountdownItem;
  createdAt: number;
  now?: Date;
}): CountdownProgress => {
  const now = args.now ?? new Date();
  const next = getNextOccurrence(args.item, now);

  const createdAtDate = new Date(args.createdAt);
  const createdAtMs = createdAtDate.getTime();
  const nextMs = next.getTime();

  if (!Number.isFinite(createdAtMs) || !Number.isFinite(nextMs)) {
    return {
      prev: Number.isFinite(createdAtMs) ? createdAtDate : now,
      next: Number.isFinite(nextMs) ? next : now,
      elapsedMs: 0,
      totalMs: 0,
      ratio: 0,
    };
  }

  let prev: Date;
  const rule = getEffectiveRule(args.item);
  if (rule.kind === 'once') {
    prev = createdAtDate;
  } else {
    const candidate = getPreviousWindowStart({ item: args.item, rule, next });
    prev = candidate && candidate.getTime() <= now.getTime() ? candidate : createdAtDate;
  }

  const prevMs = prev.getTime();
  const totalMsRaw = nextMs - prevMs;
  const totalMs = Math.max(0, totalMsRaw);
  const elapsedMs = now.getTime() - prevMs;
  const ratio = totalMs > 0 ? clamp01(elapsedMs / totalMs) : now.getTime() >= nextMs ? 1 : 0;

  return {
    prev,
    next,
    elapsedMs,
    totalMs,
    ratio,
  };
};

export const getDefaultPrecision = (value: unknown): CountdownPrecision => {
  return value === 'day' || value === 'hour' || value === 'minute' || value === 'second'
    ? (value as CountdownPrecision)
    : 'minute';
};

export const getDefaultRecurrenceRule = (
  recurrence: CountdownRecurrence | undefined,
): CountdownRule => {
  if (recurrence === 'daily') return { kind: 'interval', unit: 'day', every: 1 };
  if (recurrence === 'weekly') return { kind: 'interval', unit: 'week', every: 1 };
  if (recurrence === 'monthly') return { kind: 'interval', unit: 'month', every: 1 };
  if (recurrence === 'yearly') return { kind: 'interval', unit: 'year', every: 1 };
  return { kind: 'once' };
};

export const formatCountdownRule = (rule: CountdownRule): string => {
  if (rule.kind === 'once') return 'once';
  if (rule.kind === 'interval') return `${rule.every}${rule.unit}`;
  if (rule.kind === 'cron') return `cron:${rule.expression}`;
  if (rule.kind === 'lunarYearly')
    return `lunar:${rule.month}/${rule.day}${rule.isLeapMonth ? '(leap)' : ''}`;
  if (rule.kind === 'solarTermYearly') return `solarTerm:${rule.term}`;
  return 'unknown';
};

export const ensureItemTargetDateConsistency = (item: CountdownItem): CountdownItem => {
  const zone = normalizeTimeZone(item.timeZone);
  const local = DateTime.fromISO(item.targetLocal, { zone });
  if (!local.isValid) return item;
  return {
    ...item,
    targetDate: local.toUTC().toISO() ?? item.targetDate,
    targetLocal: toTargetLocalString(local),
    timeZone: zone,
  };
};

export interface CountdownSummaryStats {
  totalActive: number;
  expiringThisMonth: number;
  expiringSoon: number;
  overdueCount: number;
}

export const computeSummaryStats = (
  items: CountdownItem[],
  now: Date = new Date(),
): CountdownSummaryStats => {
  const nowDt = DateTime.fromJSDate(now);
  const monthEnd = nowDt.endOf('month');
  const soonThreshold = 7 * 24 * 60 * 60 * 1000; // 7 days in ms

  let totalActive = 0;
  let expiringThisMonth = 0;
  let expiringSoon = 0;
  let overdueCount = 0;

  for (const item of items) {
    if (item.archivedAt) continue;
    totalActive++;

    const nextOccurrence = getNextOccurrence(item, now);
    const diffMs = nextOccurrence.getTime() - now.getTime();
    const isOnce = (item.rule?.kind ?? 'once') === 'once';

    if (isOnce && diffMs <= 0) {
      overdueCount++;
      continue;
    }

    const nextDt = DateTime.fromJSDate(nextOccurrence);
    if (nextDt <= monthEnd) {
      expiringThisMonth++;
    }
    if (diffMs > 0 && diffMs <= soonThreshold) {
      expiringSoon++;
    }
  }

  return { totalActive, expiringThisMonth, expiringSoon, overdueCount };
};
