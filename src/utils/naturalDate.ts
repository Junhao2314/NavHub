import { Cron } from 'croner';
import { DateTime } from 'luxon';
import type { CountdownPrecision, CountdownRule } from '../types';
import {
  getSolarTermKeyByZhName,
  parseLunarMonthDayZh,
  SOLAR_TERM_ZH_NAMES,
} from './chineseCalendar';
import { normalizeTimeZone } from './timezone';

export type NaturalDateParseContext = {
  now?: Date;
  timeZone?: string;
  fallbackTime?: { hour: number; minute: number; second: number };
};

export type NaturalDateParseResult =
  | {
      ok: true;
      timeZone: string;
      targetLocal?: string;
      precision?: CountdownPrecision;
      rule?: CountdownRule;
    }
  | {
      ok: false;
      timeZone: string;
      errors: string[];
    };

const pad2 = (n: number): string => String(n).padStart(2, '0');

const toTargetLocalString = (dt: DateTime): string => dt.toFormat("yyyy-MM-dd'T'HH:mm:ss");

const normalizeCronExpression = (expression: string): string => {
  const parts = expression.trim().split(/\s+/).filter(Boolean);
  // Support standard 5-field cron (min hour dom mon dow) by prefixing seconds
  if (parts.length === 5) return ['0', ...parts].join(' ');
  return parts.join(' ');
};

const extractTime = (
  text: string,
): { rest: string; time?: { hour: number; minute: number; second: number } } => {
  const raw = text.trim();
  if (!raw) return { rest: raw };

  // HH:mm(:ss)?
  const colon = raw.match(/(.*?)(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (colon) {
    const hour = Number.parseInt(colon[2], 10);
    const minute = Number.parseInt(colon[3], 10);
    const second = colon[4] ? Number.parseInt(colon[4], 10) : 0;
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 && second >= 0 && second <= 59) {
      return { rest: colon[1].trim(), time: { hour, minute, second } };
    }
  }

  // H点M分S秒 (minute/second optional)
  const hm = raw.match(/(.*?)(\d{1,2})点(?:(\d{1,2})分?)?(?:(\d{1,2})秒?)?$/);
  if (hm) {
    const hour = Number.parseInt(hm[2], 10);
    const minute = hm[3] ? Number.parseInt(hm[3], 10) : 0;
    const second = hm[4] ? Number.parseInt(hm[4], 10) : 0;
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 && second >= 0 && second <= 59) {
      return { rest: hm[1].trim(), time: { hour, minute, second } };
    }
  }

  return { rest: raw };
};

const parseWeekday = (text: string): number | null => {
  const s = text.trim();
  if (!s) return null;
  const map: Record<string, number> = {
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    日: 7,
    天: 7,
    1: 1,
    2: 2,
    3: 3,
    4: 4,
    5: 5,
    6: 6,
    7: 7,
  };
  return map[s] ?? null;
};

const nextWeekday = (args: {
  now: DateTime;
  weekday: number; // 1-7
  forceNextWeek?: boolean;
}): DateTime => {
  const base = args.now;
  const delta = ((args.weekday - base.weekday + 7) % 7) + (args.forceNextWeek ? 7 : 0);
  const candidate = base.plus({ days: delta });
  return candidate;
};

const buildCronForTime = (args: {
  expression: string;
  time: { hour: number; minute: number; second: number };
}): string => {
  const normalized = normalizeCronExpression(args.expression);
  const parts = normalized.split(/\s+/);
  // If it's a cron expression (not ISO), and has at least seconds/minutes/hours fields, override them.
  if (parts.length >= 6) {
    parts[0] = String(args.time.second);
    parts[1] = String(args.time.minute);
    parts[2] = String(args.time.hour);
  }
  return parts.join(' ');
};

const getNextCronTargetLocal = (args: {
  expression: string;
  timeZone: string;
  now: Date;
}): string | null => {
  try {
    const job = new Cron(args.expression, { timezone: args.timeZone, paused: true });
    const next = job.nextRun(new Date(args.now.getTime() + 1));
    if (!(next instanceof Date) || !Number.isFinite(next.getTime())) return null;
    const dt = DateTime.fromJSDate(next, { zone: args.timeZone });
    return toTargetLocalString(dt);
  } catch {
    return null;
  }
};

export const parseNaturalInput = (
  input: string,
  context: NaturalDateParseContext = {},
): NaturalDateParseResult => {
  const timeZone = normalizeTimeZone(context.timeZone);
  const nowDate = context.now ?? new Date();
  const now = DateTime.fromJSDate(nowDate, { zone: timeZone });
  const fallbackTime = context.fallbackTime ?? { hour: 0, minute: 0, second: 0 };

  const trimmed = input.trim();
  if (!trimmed) {
    return { ok: false, timeZone, errors: ['输入为空'] };
  }

  const { rest, time } = extractTime(trimmed);
  const timeOfDay = time ?? fallbackTime;
  const main = rest.replace(/\s+/g, '');

  // Relative: 3天后 / 2小时后 / 15分钟后 / 30秒后
  const rel = main.match(/^(\d+)(天|日|小时|时|分钟|分|秒)后$/);
  if (rel) {
    const amount = Number.parseInt(rel[1], 10);
    const unit = rel[2];
    if (!Number.isFinite(amount) || amount < 0) {
      return { ok: false, timeZone, errors: ['时间数量不合法'] };
    }
    const dt =
      unit === '天' || unit === '日'
        ? now.plus({ days: amount })
        : unit === '小时' || unit === '时'
          ? now.plus({ hours: amount })
          : unit === '分钟' || unit === '分'
            ? now.plus({ minutes: amount })
            : now.plus({ seconds: amount });

    const precision: CountdownPrecision =
      unit === '秒'
        ? 'second'
        : unit === '分钟' || unit === '分'
          ? 'minute'
          : unit === '小时' || unit === '时'
            ? 'hour'
            : 'day';

    return { ok: true, timeZone, targetLocal: toTargetLocalString(dt), precision };
  }

  // Monthly: 每月15号
  const monthly = main.match(/^每(月|个月)(\d{1,2})(号|日)$/);
  if (monthly) {
    const day = Number.parseInt(monthly[2], 10);
    if (!Number.isFinite(day) || day < 1 || day > 31) {
      return { ok: false, timeZone, errors: ['每月日期应为 1-31'] };
    }
    const expr = buildCronForTime({
      expression: `0 0 ${timeOfDay.hour} ${day} * *`,
      time: timeOfDay,
    });
    const normalized = normalizeCronExpression(expr);
    const targetLocal = getNextCronTargetLocal({ expression: normalized, timeZone, now: nowDate });
    return {
      ok: true,
      timeZone,
      rule: { kind: 'cron', expression: normalized },
      targetLocal: targetLocal ?? undefined,
    };
  }

  // Workdays: 工作日 / 每工作日
  if (main === '工作日' || main === '每工作日') {
    const expr = buildCronForTime({
      expression: `0 0 ${timeOfDay.hour} * * 1-5`,
      time: timeOfDay,
    });
    const normalized = normalizeCronExpression(expr);
    const targetLocal = getNextCronTargetLocal({ expression: normalized, timeZone, now: nowDate });
    return {
      ok: true,
      timeZone,
      rule: { kind: 'cron', expression: normalized },
      targetLocal: targetLocal ?? undefined,
    };
  }

  // Every 2 weeks: 每两周 / 每2周
  if (main === '每两周' || main === '每2周') {
    return {
      ok: true,
      timeZone,
      rule: { kind: 'interval', unit: 'week', every: 2 },
    };
  }

  // Quarterly: 每季度
  if (main === '每季度') {
    return {
      ok: true,
      timeZone,
      rule: { kind: 'interval', unit: 'month', every: 3 },
    };
  }

  // Lunar: 腊月二十三 / 闰二月初一
  const lunar = parseLunarMonthDayZh(main);
  if (lunar) {
    return {
      ok: true,
      timeZone,
      rule: {
        kind: 'lunarYearly',
        month: lunar.month,
        day: lunar.day,
        isLeapMonth: lunar.isLeapMonth || undefined,
      },
    };
  }

  // Solar term: 立春 / ...
  if (SOLAR_TERM_ZH_NAMES.includes(main)) {
    const key = getSolarTermKeyByZhName(main);
    if (!key) return { ok: false, timeZone, errors: ['节气名称不支持'] };
    return { ok: true, timeZone, rule: { kind: 'solarTermYearly', term: key } };
  }

  // Weekday: 下周五 / 周五
  const weekdayMatch = main.match(/^(下|本|这)?(周|星期)([一二三四五六日天1-7])$/);
  if (weekdayMatch) {
    const prefix = weekdayMatch[1] ?? '';
    const weekday = parseWeekday(weekdayMatch[3]);
    if (!weekday) return { ok: false, timeZone, errors: ['星期解析失败'] };
    const forceNextWeek = prefix === '下';
    let dt = nextWeekday({ now, weekday, forceNextWeek });
    dt = dt.set({
      hour: timeOfDay.hour,
      minute: timeOfDay.minute,
      second: timeOfDay.second,
      millisecond: 0,
    });
    if (!forceNextWeek && dt <= now) {
      dt = dt.plus({ days: 7 });
    }
    return { ok: true, timeZone, targetLocal: toTargetLocalString(dt) };
  }

  return { ok: false, timeZone, errors: ['无法解析该输入'] };
};

export const formatTargetLocal = (args: {
  date: string;
  time?: string;
  precision: CountdownPrecision;
}): string => {
  const date = args.date.trim();
  if (!date) return '';
  const time = (args.time ?? '').trim();

  const parts = time.split(':').map((p) => p.trim());
  const hour = parts[0] ? Number.parseInt(parts[0], 10) : 0;
  const minute = parts[1] ? Number.parseInt(parts[1], 10) : 0;
  const second = parts[2] ? Number.parseInt(parts[2], 10) : 0;

  const h = Number.isFinite(hour) ? hour : 0;
  const m = Number.isFinite(minute) ? minute : 0;
  const s = Number.isFinite(second) ? second : 0;

  if (args.precision === 'day') return `${date}T00:00:00`;
  if (args.precision === 'hour') return `${date}T${pad2(h)}:00:00`;
  if (args.precision === 'minute') return `${date}T${pad2(h)}:${pad2(m)}:00`;
  return `${date}T${pad2(h)}:${pad2(m)}:${pad2(s)}`;
};
