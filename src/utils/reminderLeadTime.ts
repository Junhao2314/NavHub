const MAX_REMINDERS_PER_ITEM = 10;
const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 1440;
const MINUTES_PER_WEEK = 10080;
const MINUTES_PER_MONTH = 43200;
const MINUTES_PER_YEAR = 525600;

export const DEFAULT_SUBSCRIPTION_REMINDER_MINUTES = [1440, 0] as const;

export const SUBSCRIPTION_REMINDER_PRESETS = [
  { minutes: 0, labelKey: 'modals.countdown.reminderPresetAtTime', isDefault: true },
  { minutes: 1440, labelKey: 'modals.countdown.reminderPresetDayBefore', isDefault: true },
  { minutes: 120, labelKey: 'modals.countdown.reminderPresetTwoHoursBefore', isDefault: false },
  { minutes: 10080, labelKey: 'modals.countdown.reminderPresetWeekBefore', isDefault: false },
] as const;

type Translate = (key: string, params?: Record<string, unknown>) => string;

const SUMMARY_LOCALE_MAP: Record<string, string> = {
  'zh-CN': 'zh-CN',
  'en-US': 'en-US',
};

const normalizeSummaryLocale = (locale: string): string =>
  SUMMARY_LOCALE_MAP[locale] ?? (locale.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US');

const parseChineseNumeral = (token: string): number | null => {
  const digitMap: Record<string, number> = {
    零: 0,
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  };
  const unitMap: Record<string, number> = {
    十: 10,
    百: 100,
  };

  let total = 0;
  let section = 0;
  let number = 0;

  for (const char of token) {
    if (char in digitMap) {
      number = digitMap[char];
      continue;
    }

    if (!(char in unitMap)) return null;

    const unit = unitMap[char];
    const current = number || 1;
    if (unit === 10) {
      section += current * unit;
    } else {
      total += (section + current) * unit;
      section = 0;
    }
    number = 0;
  }

  return total + section + number;
};

const parseAmountToken = (token: string | undefined): number | null => {
  if (!token) return 1;
  if (token === '半' || token === '半个' || token === '半個') return 0.5;
  if (/^\d+(?:\.\d+)?$/.test(token)) return Number.parseFloat(token);
  return parseChineseNumeral(token);
};

const sortReminderMinutesForSummary = (minutes: number[]): number[] =>
  [...minutes].sort((a, b) => {
    if (a === 0) return -1;
    if (b === 0) return 1;
    return a - b;
  });

export const normalizeReminderMinutes = (value: unknown): number[] => {
  if (!Array.isArray(value)) return [...DEFAULT_SUBSCRIPTION_REMINDER_MINUTES];

  const minutes: number[] = [];
  const seen = new Set<number>();

  for (const raw of value) {
    if (minutes.length >= MAX_REMINDERS_PER_ITEM) break;
    if (typeof raw !== 'number' || !Number.isFinite(raw)) continue;
    const next = Math.floor(raw);
    if (next < 0 || seen.has(next)) continue;
    seen.add(next);
    minutes.push(next);
  }

  minutes.sort((a, b) => b - a);
  return minutes;
};

export const formatReminderChipLabel = (minutes: number, t: Translate): string => {
  if (minutes === 0) return t('modals.countdown.atTime');

  const preset = SUBSCRIPTION_REMINDER_PRESETS.find((entry) => entry.minutes === minutes);
  if (preset) return t(preset.labelKey);

  if (minutes % MINUTES_PER_YEAR === 0) {
    if (minutes === MINUTES_PER_YEAR) return t('modals.countdown.reminderYearChipSingle');
    return t('modals.countdown.reminderYearChip', { count: minutes / MINUTES_PER_YEAR });
  }
  if (minutes % MINUTES_PER_MONTH === 0) {
    if (minutes === MINUTES_PER_MONTH) return t('modals.countdown.reminderMonthChipSingle');
    return t('modals.countdown.reminderMonthChip', { count: minutes / MINUTES_PER_MONTH });
  }
  if (minutes % MINUTES_PER_WEEK === 0) {
    if (minutes === MINUTES_PER_WEEK) return t('modals.countdown.reminderWeekChipSingle');
    return t('modals.countdown.reminderWeekChip', { count: minutes / MINUTES_PER_WEEK });
  }
  if (minutes % MINUTES_PER_DAY === 0) {
    if (minutes === MINUTES_PER_DAY) return t('modals.countdown.reminderDayChipSingle');
    return t('modals.countdown.reminderDayChip', { count: minutes / MINUTES_PER_DAY });
  }
  if (minutes % MINUTES_PER_HOUR === 0) {
    if (minutes === MINUTES_PER_HOUR) return t('modals.countdown.reminderHourChipSingle');
    return t('modals.countdown.reminderHourChip', { count: minutes / MINUTES_PER_HOUR });
  }
  if (minutes === 1) return t('modals.countdown.reminderMinuteChipSingle');
  return t('modals.countdown.reminderMinuteChip', { count: minutes });
};

export const formatReminderSummaryItem = (minutes: number, t: Translate): string => {
  if (minutes === 0) return t('modals.countdown.atTime');
  if (minutes % MINUTES_PER_YEAR === 0) {
    if (minutes === MINUTES_PER_YEAR) return t('modals.countdown.reminderYearSummaryItemSingle');
    return t('modals.countdown.reminderYearSummaryItem', { count: minutes / MINUTES_PER_YEAR });
  }
  if (minutes % MINUTES_PER_MONTH === 0) {
    if (minutes === MINUTES_PER_MONTH) return t('modals.countdown.reminderMonthSummaryItemSingle');
    return t('modals.countdown.reminderMonthSummaryItem', { count: minutes / MINUTES_PER_MONTH });
  }
  if (minutes % MINUTES_PER_WEEK === 0) {
    if (minutes === MINUTES_PER_WEEK) return t('modals.countdown.reminderWeekSummaryItemSingle');
    return t('modals.countdown.reminderWeekSummaryItem', { count: minutes / MINUTES_PER_WEEK });
  }
  if (minutes % MINUTES_PER_DAY === 0) {
    if (minutes === MINUTES_PER_DAY) return t('modals.countdown.reminderDaySummaryItemSingle');
    return t('modals.countdown.reminderDaySummaryItem', { count: minutes / MINUTES_PER_DAY });
  }
  if (minutes % MINUTES_PER_HOUR === 0) {
    if (minutes === MINUTES_PER_HOUR) return t('modals.countdown.reminderHourSummaryItemSingle');
    return t('modals.countdown.reminderHourSummaryItem', { count: minutes / MINUTES_PER_HOUR });
  }
  if (minutes === 1) return t('modals.countdown.reminderMinuteSummaryItemSingle');
  return t('modals.countdown.reminderMinuteSummaryItem', { count: minutes });
};

export const buildReminderSummary = (
  minutes: number[],
  t: Translate,
  locale: string,
  fallbackMinutes: number[] = [...DEFAULT_SUBSCRIPTION_REMINDER_MINUTES],
): string => {
  const active = normalizeReminderMinutes(minutes);
  if (active.length === 0) {
    const suggestedItems = sortReminderMinutesForSummary(fallbackMinutes).map((value) =>
      formatReminderSummaryItem(value, t),
    );
    const suggested = new Intl.ListFormat(normalizeSummaryLocale(locale), {
      style: 'long',
      type: 'conjunction',
    }).format(suggestedItems);
    return t('modals.countdown.reminderSummaryEmpty', { items: suggested });
  }

  const items = sortReminderMinutesForSummary(active).map((value) =>
    formatReminderSummaryItem(value, t),
  );
  const summary = new Intl.ListFormat(normalizeSummaryLocale(locale), {
    style: 'long',
    type: 'conjunction',
  }).format(items);
  return t('modals.countdown.reminderSummaryActive', { items: summary });
};

export const parseReminderLeadTime = (value: string): number | null => {
  const raw = value.trim().toLowerCase();
  if (!raw) return null;

  const normalized = raw.replace(/\s+/g, '');
  if (
    normalized === '到点' ||
    normalized === '到時' ||
    normalized === '准点' ||
    normalized === '到期时' ||
    normalized === '到期時' ||
    normalized === 'attime' ||
    normalized === 'ontime' ||
    normalized === 'due'
  ) {
    return 0;
  }

  const directAliasMap: Record<string, number> = {
    前一晚: 1440,
    前一天: 1440,
    前一日: 1440,
    前一周: 10080,
    前一星期: 10080,
    前半小时: 30,
    前半小時: 30,
    半小时前: 30,
    半小時前: 30,
    半个小时前: 30,
    半個小時前: 30,
    daybefore: 1440,
    thedaybefore: 1440,
    nightbefore: 1440,
    weekbefore: 10080,
    theweekbefore: 10080,
    monthbefore: 43200,
    themonthbefore: 43200,
    yearbefore: 525600,
    theyearbefore: 525600,
    halfhourbefore: 30,
  };
  if (normalized in directAliasMap) return directAliasMap[normalized];

  let body = normalized;
  if (body.startsWith('提前')) body = body.slice(2);
  if (body.startsWith('前')) body = body.slice(1);

  if (body.endsWith('之前')) body = body.slice(0, -2);
  else if (body.endsWith('前')) body = body.slice(0, -1);
  else if (body.endsWith('before')) body = body.slice(0, -6);
  else if (body.endsWith('earlier')) body = body.slice(0, -7);
  else if (body.endsWith('inadvance')) body = body.slice(0, -9);

  body = body.replace(
    /^(an|a)(?=(year|years|yr|yrs|month|months|mo|mos|week|weeks|wk|w|day|days|d|hour|hours|hr|hrs|h|minute|minutes|min|mins|m))/,
    '1',
  );

  const match = body.match(
    /^(?<amount>\d+(?:\.\d+)?|半个|半個|半|[零一二两三四五六七八九十百]+)?(?:个|個)?(?<unit>年|year|years|yr|yrs|月|month|months|mo|mos|周|星期|礼拜|week|weeks|wk|w|天|日|day|days|d|小时|小時|时|钟头|鐘頭|hr|hrs|hour|hours|h|分钟|分鐘|分|min|mins|minute|minutes|m)$/,
  );
  if (!match?.groups) return null;

  const amount = parseAmountToken(match.groups.amount);
  if (amount === null || !Number.isFinite(amount) || amount < 0) return null;

  const unit = match.groups.unit;
  if (unit === '年' || unit === 'year' || unit === 'years' || unit === 'yr' || unit === 'yrs') {
    return Math.round(amount * MINUTES_PER_YEAR);
  }
  if (unit === '月' || unit === 'month' || unit === 'months' || unit === 'mo' || unit === 'mos') {
    return Math.round(amount * MINUTES_PER_MONTH);
  }
  if (
    unit === '周' ||
    unit === '星期' ||
    unit === '礼拜' ||
    unit === 'week' ||
    unit === 'weeks' ||
    unit === 'wk' ||
    unit === 'w'
  ) {
    return Math.round(amount * MINUTES_PER_WEEK);
  }
  if (unit === '天' || unit === '日' || unit === 'day' || unit === 'days' || unit === 'd') {
    return Math.round(amount * MINUTES_PER_DAY);
  }
  if (
    unit === '小时' ||
    unit === '小時' ||
    unit === '时' ||
    unit === '钟头' ||
    unit === '鐘頭' ||
    unit === 'hr' ||
    unit === 'hrs' ||
    unit === 'hour' ||
    unit === 'hours' ||
    unit === 'h'
  ) {
    return Math.round(amount * MINUTES_PER_HOUR);
  }
  return Math.round(amount);
};
