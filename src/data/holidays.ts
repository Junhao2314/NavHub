import { DateTime } from 'luxon';
import type { CountdownLabelColor, CountdownPrecision, CountdownRule } from '../types';
import { getNextOccurrence } from '../utils/countdown';
import { normalizeTimeZone } from '../utils/timezone';

export interface HolidayEntry {
  id: string;
  nameZh: string;
  nameEn: string;
  category: 'chinese_legal' | 'international';
  rule: CountdownRule;
  precision: CountdownPrecision;
  labelColor?: CountdownLabelColor;
  fixedMonth?: number;
  fixedDay?: number;
}

const yearlyInterval: CountdownRule = { kind: 'interval', unit: 'year', every: 1 };

export const HOLIDAYS: HolidayEntry[] = [
  // Chinese legal holidays (7)
  {
    id: 'cn_new_year',
    nameZh: '元旦',
    nameEn: "New Year's Day",
    category: 'chinese_legal',
    rule: yearlyInterval,
    precision: 'day',
    labelColor: 'red',
    fixedMonth: 1,
    fixedDay: 1,
  },
  {
    id: 'cn_spring',
    nameZh: '春节',
    nameEn: 'Spring Festival',
    category: 'chinese_legal',
    rule: { kind: 'lunarYearly', month: 1, day: 1 },
    precision: 'day',
    labelColor: 'red',
  },
  {
    id: 'cn_qingming',
    nameZh: '清明节',
    nameEn: 'Qingming Festival',
    category: 'chinese_legal',
    rule: { kind: 'solarTermYearly', term: '清明' },
    precision: 'day',
    labelColor: 'green',
  },
  {
    id: 'cn_labor',
    nameZh: '劳动节',
    nameEn: 'Labor Day',
    category: 'chinese_legal',
    rule: yearlyInterval,
    precision: 'day',
    labelColor: 'red',
    fixedMonth: 5,
    fixedDay: 1,
  },
  {
    id: 'cn_dragon_boat',
    nameZh: '端午节',
    nameEn: 'Dragon Boat Festival',
    category: 'chinese_legal',
    rule: { kind: 'lunarYearly', month: 5, day: 5 },
    precision: 'day',
    labelColor: 'emerald',
  },
  {
    id: 'cn_mid_autumn',
    nameZh: '中秋节',
    nameEn: 'Mid-Autumn Festival',
    category: 'chinese_legal',
    rule: { kind: 'lunarYearly', month: 8, day: 15 },
    precision: 'day',
    labelColor: 'amber',
  },
  {
    id: 'cn_national',
    nameZh: '国庆节',
    nameEn: 'National Day',
    category: 'chinese_legal',
    rule: yearlyInterval,
    precision: 'day',
    labelColor: 'red',
    fixedMonth: 10,
    fixedDay: 1,
  },

  // International holidays (8)
  {
    id: 'intl_valentines',
    nameZh: '情人节',
    nameEn: "Valentine's Day",
    category: 'international',
    rule: yearlyInterval,
    precision: 'day',
    labelColor: 'pink',
    fixedMonth: 2,
    fixedDay: 14,
  },
  {
    id: 'intl_womens',
    nameZh: '妇女节',
    nameEn: "Women's Day",
    category: 'international',
    rule: yearlyInterval,
    precision: 'day',
    labelColor: 'violet',
    fixedMonth: 3,
    fixedDay: 8,
  },
  {
    id: 'intl_mothers',
    nameZh: '母亲节',
    nameEn: "Mother's Day",
    category: 'international',
    rule: yearlyInterval,
    precision: 'day',
    labelColor: 'pink',
    // Computed: 2nd Sunday of May
  },
  {
    id: 'intl_fathers',
    nameZh: '父亲节',
    nameEn: "Father's Day",
    category: 'international',
    rule: yearlyInterval,
    precision: 'day',
    labelColor: 'blue',
    // Computed: 3rd Sunday of June
  },
  {
    id: 'intl_children',
    nameZh: '儿童节',
    nameEn: "Children's Day",
    category: 'international',
    rule: yearlyInterval,
    precision: 'day',
    labelColor: 'yellow',
    fixedMonth: 6,
    fixedDay: 1,
  },
  {
    id: 'intl_halloween',
    nameZh: '万圣节',
    nameEn: 'Halloween',
    category: 'international',
    rule: yearlyInterval,
    precision: 'day',
    labelColor: 'orange',
    fixedMonth: 10,
    fixedDay: 31,
  },
  {
    id: 'intl_christmas',
    nameZh: '圣诞节',
    nameEn: 'Christmas',
    category: 'international',
    rule: yearlyInterval,
    precision: 'day',
    labelColor: 'green',
    fixedMonth: 12,
    fixedDay: 25,
  },
  {
    id: 'intl_new_year_eve',
    nameZh: '跨年夜',
    nameEn: "New Year's Eve",
    category: 'international',
    rule: yearlyInterval,
    precision: 'day',
    labelColor: 'indigo',
    fixedMonth: 12,
    fixedDay: 31,
  },
];

/**
 * Compute Nth weekday of a given month.
 * weekday: 1=Monday ... 7=Sunday (Luxon convention)
 */
const getNthWeekdayOfMonth = (
  year: number,
  month: number,
  weekday: number,
  nth: number,
  zone: string,
): DateTime => {
  const first = DateTime.fromObject({ year, month, day: 1 }, { zone });
  let candidate = first;
  // Advance to first occurrence of the weekday
  const diff = (weekday - first.weekday + 7) % 7;
  candidate = candidate.plus({ days: diff });
  // Advance to Nth occurrence
  candidate = candidate.plus({ weeks: nth - 1 });
  return candidate;
};

/**
 * Compute next occurrence of Mother's Day (2nd Sunday May) or Father's Day (3rd Sunday June).
 */
const computeNthWeekdayNextDate = (
  month: number,
  weekday: number,
  nth: number,
  zone: string,
): DateTime => {
  const now = DateTime.now().setZone(zone);
  let candidate = getNthWeekdayOfMonth(now.year, month, weekday, nth, zone);
  if (candidate <= now) {
    candidate = getNthWeekdayOfMonth(now.year + 1, month, weekday, nth, zone);
  }
  return candidate;
};

/**
 * Returns { targetLocal, targetDate } for a holiday entry.
 */
export const computeHolidayTargetDate = (
  entry: HolidayEntry,
  timeZone?: string,
): { targetLocal: string; targetDate: string } => {
  const zone = normalizeTimeZone(timeZone ?? 'Asia/Shanghai');

  // Mother's Day: 2nd Sunday of May
  if (entry.id === 'intl_mothers') {
    const dt = computeNthWeekdayNextDate(5, 7, 2, zone);
    return {
      targetLocal: dt.toFormat("yyyy-MM-dd'T'HH:mm:ss"),
      targetDate: dt.toUTC().toISO()!,
    };
  }

  // Father's Day: 3rd Sunday of June
  if (entry.id === 'intl_fathers') {
    const dt = computeNthWeekdayNextDate(6, 7, 3, zone);
    return {
      targetLocal: dt.toFormat("yyyy-MM-dd'T'HH:mm:ss"),
      targetDate: dt.toUTC().toISO()!,
    };
  }

  // For lunar/solar term rules: use getNextOccurrence with a temporary item
  if (entry.rule.kind === 'lunarYearly' || entry.rule.kind === 'solarTermYearly') {
    const now = DateTime.now().setZone(zone);
    const anchorLocal = now.toFormat("yyyy-MM-dd'T'00:00:00");
    const tempItem = {
      id: entry.id,
      title: entry.nameZh,
      targetDate: now.toUTC().toISO()!,
      targetLocal: anchorLocal,
      timeZone: zone,
      precision: entry.precision,
      rule: entry.rule,
      reminderMinutes: [0],
      createdAt: Date.now(),
    };
    const nextDate = getNextOccurrence(tempItem);
    const nextDt = DateTime.fromJSDate(nextDate, { zone });
    return {
      targetLocal: nextDt.toFormat("yyyy-MM-dd'T'HH:mm:ss"),
      targetDate: nextDt.toUTC().toISO()!,
    };
  }

  // Fixed Gregorian dates: compute next occurrence of month/day
  if (entry.fixedMonth && entry.fixedDay) {
    const now = DateTime.now().setZone(zone);
    let candidate = DateTime.fromObject(
      {
        year: now.year,
        month: entry.fixedMonth,
        day: entry.fixedDay,
        hour: 0,
        minute: 0,
        second: 0,
      },
      { zone },
    );
    if (candidate <= now) {
      candidate = candidate.plus({ years: 1 });
    }
    return {
      targetLocal: candidate.toFormat("yyyy-MM-dd'T'HH:mm:ss"),
      targetDate: candidate.toUTC().toISO()!,
    };
  }

  // Fallback
  const now = DateTime.now().setZone(zone);
  return {
    targetLocal: now.toFormat("yyyy-MM-dd'T'HH:mm:ss"),
    targetDate: now.toUTC().toISO()!,
  };
};
