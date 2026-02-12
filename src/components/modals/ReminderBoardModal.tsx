import { Cron } from 'croner';
import { ChevronDown, X } from 'lucide-react';
import { DateTime } from 'luxon';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { HolidayEntry } from '../../data/holidays';
import { computeHolidayTargetDate, HOLIDAYS } from '../../data/holidays';
import { useI18n } from '../../hooks/useI18n';
import type {
  ChecklistItem,
  CountdownItem,
  CountdownLabelColor,
  CountdownPrecision,
  CountdownRule,
  LinkItem,
} from '../../types';
import { SOLAR_TERM_KEY_BY_ZH_NAME, SOLAR_TERM_ZH_NAMES } from '../../utils/chineseCalendar';
import { getNextOccurrence } from '../../utils/countdown';
import { generateId } from '../../utils/id';
import { formatTargetLocal, parseNaturalInput } from '../../utils/naturalDate';
import { parseTargetLocalExact } from '../../utils/targetLocal';
import {
  COMMON_TIME_ZONES,
  DEFAULT_TIME_ZONE,
  isValidTimeZone,
  normalizeTimeZone,
} from '../../utils/timezone';
import { normalizeHttpUrl } from '../../utils/url';

const DEFAULT_REMINDER_MINUTES = [60, 10, 0] as const;
const MAX_REMINDERS_PER_ITEM = 10;
const MAX_LINK_OPTIONS = 500;

type RepeatMode =
  | 'once'
  | 'daily'
  | 'weekly'
  | 'biweekly'
  | 'workday'
  | 'monthly'
  | 'quarterly'
  | 'yearly'
  | 'cron'
  | 'lunarYearly'
  | 'solarTermYearly';

const LABEL_COLOR_OPTIONS: { value: CountdownLabelColor; className: string; labelKey: string }[] = [
  { value: 'red', className: 'bg-red-500', labelKey: 'modals.countdown.labelColorRed' },
  { value: 'orange', className: 'bg-orange-500', labelKey: 'modals.countdown.labelColorOrange' },
  { value: 'amber', className: 'bg-amber-500', labelKey: 'modals.countdown.labelColorAmber' },
  { value: 'yellow', className: 'bg-yellow-500', labelKey: 'modals.countdown.labelColorYellow' },
  { value: 'green', className: 'bg-green-500', labelKey: 'modals.countdown.labelColorGreen' },
  { value: 'emerald', className: 'bg-emerald-500', labelKey: 'modals.countdown.labelColorEmerald' },
  { value: 'blue', className: 'bg-blue-500', labelKey: 'modals.countdown.labelColorBlue' },
  { value: 'indigo', className: 'bg-indigo-500', labelKey: 'modals.countdown.labelColorIndigo' },
  { value: 'violet', className: 'bg-violet-500', labelKey: 'modals.countdown.labelColorViolet' },
  { value: 'pink', className: 'bg-pink-500', labelKey: 'modals.countdown.labelColorPink' },
  { value: 'slate', className: 'bg-slate-500', labelKey: 'modals.countdown.labelColorSlate' },
];

const normalizeReminderMinutes = (value: unknown): number[] => {
  if (!Array.isArray(value)) return [...DEFAULT_REMINDER_MINUTES];

  const minutes: number[] = [];
  const seen = new Set<number>();

  for (const raw of value) {
    if (minutes.length >= MAX_REMINDERS_PER_ITEM) break;
    if (typeof raw !== 'number' || !Number.isFinite(raw)) continue;
    const next = Math.floor(raw);
    if (next < 0) continue;
    if (seen.has(next)) continue;
    seen.add(next);
    minutes.push(next);
  }

  minutes.sort((a, b) => b - a);
  return minutes;
};

const normalizeTags = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const tags = value
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.trim())
    .filter(Boolean);

  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const tag of tags) {
    if (seen.has(tag)) continue;
    seen.add(tag);
    deduped.push(tag);
  }
  return deduped;
};

const normalizeTimePart = (value: string): string => {
  const s = value.trim();
  if (!s) return '00:00:00';
  if (/^\\d{2}:\\d{2}$/.test(s)) return `${s}:00`;
  if (/^\\d{2}:\\d{2}:\\d{2}$/.test(s)) return s;
  return '00:00:00';
};

const clampTimeByPrecision = (precision: CountdownPrecision, timePart: string): string => {
  const [hh = '00', mm = '00', ss = '00'] = normalizeTimePart(timePart).split(':');
  if (precision === 'day') return '00:00:00';
  if (precision === 'hour') return `${hh}:00:00`;
  if (precision === 'minute') return `${hh}:${mm}:00`;
  return `${hh}:${mm}:${ss}`;
};

const normalizeCronExpression = (expression: string): string => {
  const parts = expression.trim().split(/\\s+/).filter(Boolean);
  // Support standard 5-field cron (min hour dom mon dow) by prefixing seconds
  if (parts.length === 5) return ['0', ...parts].join(' ');
  return parts.join(' ');
};

const deriveRepeatModeFromRule = (rule: CountdownRule): RepeatMode => {
  if (rule.kind === 'once') return 'once';
  if (rule.kind === 'interval') {
    if (rule.unit === 'day' && rule.every === 1) return 'daily';
    if (rule.unit === 'week' && rule.every === 1) return 'weekly';
    if (rule.unit === 'week' && rule.every === 2) return 'biweekly';
    if (rule.unit === 'month' && rule.every === 1) return 'monthly';
    if (rule.unit === 'month' && rule.every === 3) return 'quarterly';
    if (rule.unit === 'year' && rule.every === 1) return 'yearly';
    return 'weekly';
  }
  if (rule.kind === 'cron') {
    const parts = normalizeCronExpression(rule.expression).split(/\\s+/);
    if (parts.length >= 6 && parts[3] === '*' && parts[4] === '*' && parts[5] === '1-5')
      return 'workday';
    return 'cron';
  }
  if (rule.kind === 'lunarYearly') return 'lunarYearly';
  return 'solarTermYearly';
};

const buildRuleFromState = (args: {
  repeatMode: RepeatMode;
  timePart: string;
  cronExpression: string;
  lunarMonth: number;
  lunarDay: number;
  lunarLeap: boolean;
  solarTermKey: string;
}): CountdownRule => {
  const [hour = '0', minute = '0', second = '0'] = normalizeTimePart(args.timePart).split(':');

  switch (args.repeatMode) {
    case 'once':
      return { kind: 'once' };
    case 'daily':
      return { kind: 'interval', unit: 'day', every: 1 };
    case 'weekly':
      return { kind: 'interval', unit: 'week', every: 1 };
    case 'biweekly':
      return { kind: 'interval', unit: 'week', every: 2 };
    case 'monthly':
      return { kind: 'interval', unit: 'month', every: 1 };
    case 'quarterly':
      return { kind: 'interval', unit: 'month', every: 3 };
    case 'yearly':
      return { kind: 'interval', unit: 'year', every: 1 };
    case 'workday':
      return { kind: 'cron', expression: `${second} ${minute} ${hour} * * 1-5` };
    case 'cron':
      return { kind: 'cron', expression: normalizeCronExpression(args.cronExpression) };
    case 'lunarYearly':
      return {
        kind: 'lunarYearly',
        month: args.lunarMonth,
        day: args.lunarDay,
        isLeapMonth: args.lunarLeap || undefined,
      };
    case 'solarTermYearly':
      return { kind: 'solarTermYearly', term: args.solarTermKey };
  }
};

const toTargetLocalString = (dt: DateTime): string => dt.toFormat("yyyy-MM-dd'T'HH:mm:ss");

interface ReminderBoardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Omit<CountdownItem, 'id' | 'createdAt'>) => void;
  initialData?: Partial<CountdownItem>;
  closeOnBackdrop?: boolean;
  isAdmin?: boolean;
  privacyGroupEnabled?: boolean;
  groups?: string[];
  links?: LinkItem[];
}

const ReminderBoardModal: React.FC<ReminderBoardModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialData,
  closeOnBackdrop = true,
  isAdmin = false,
  privacyGroupEnabled = false,
  groups = [],
  links = [],
}) => {
  const { t, i18n } = useI18n();
  const isEditMode = Boolean(initialData?.id);

  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [linkedUrlInput, setLinkedUrlInput] = useState('');
  const [labelColor, setLabelColor] = useState<CountdownLabelColor | ''>('');

  const [precision, setPrecision] = useState<CountdownPrecision>('minute');
  const [timeZone, setTimeZone] = useState(DEFAULT_TIME_ZONE);

  const [naturalInput, setNaturalInput] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [datePart, setDatePart] = useState('');
  const [timePart, setTimePart] = useState('00:00:00');

  const [repeatMode, setRepeatMode] = useState<RepeatMode>('once');
  const [cronExpression, setCronExpression] = useState('0 0 9 * * 1-5');

  const [lunarMonth, setLunarMonth] = useState(12);
  const [lunarDay, setLunarDay] = useState(23);
  const [lunarLeap, setLunarLeap] = useState(false);
  const [solarTermKey, setSolarTermKey] = useState(SOLAR_TERM_KEY_BY_ZH_NAME['立春']);

  const [reminderMinutes, setReminderMinutes] = useState<number[]>([...DEFAULT_REMINDER_MINUTES]);
  const [reminderInput, setReminderInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [checklistInput, setChecklistInput] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showTemplateDropdown, setShowTemplateDropdown] = useState(false);
  const templateDropdownRef = useRef<HTMLDivElement>(null);
  const linkOptions = useMemo(() => links.slice(0, MAX_LINK_OPTIONS), [links]);

  const rule = useMemo(
    () =>
      buildRuleFromState({
        repeatMode,
        timePart,
        cronExpression,
        lunarMonth,
        lunarDay,
        lunarLeap,
        solarTermKey,
      }),
    [repeatMode, timePart, cronExpression, lunarMonth, lunarDay, lunarLeap, solarTermKey],
  );

  const timeStep = precision === 'second' ? 1 : precision === 'minute' ? 60 : 3600;

  const nextOccurrencePreview = useMemo(() => {
    const zone = timeZone.trim() || DEFAULT_TIME_ZONE;
    if (!isValidTimeZone(zone)) return null;

    if (rule.kind === 'cron') {
      const nowZoned = DateTime.now().setZone(zone).set({ millisecond: 0 });
      const previewItem: CountdownItem = {
        id: 'preview',
        title: title.trim() || 'preview',
        note: undefined,
        targetLocal: toTargetLocalString(nowZoned),
        targetDate: nowZoned.toUTC().toISO() ?? new Date().toISOString(),
        timeZone: zone,
        precision,
        rule,
        reminderMinutes: [],
        createdAt: 0,
      };

      try {
        const next = getNextOccurrence(previewItem, new Date());
        const nextLocal = DateTime.fromJSDate(next, { zone });
        if (!nextLocal.isValid) return null;
        return nextLocal.toFormat('yyyy-LL-dd HH:mm:ss');
      } catch {
        return null;
      }
    }

    const clampedTime = clampTimeByPrecision(precision, timePart);
    const baseTargetLocal = formatTargetLocal({ date: datePart, time: clampedTime, precision });
    if (!baseTargetLocal) return null;

    const parsed = parseTargetLocalExact(baseTargetLocal, zone);
    if (!parsed.ok) return null;

    const previewItem: CountdownItem = {
      id: 'preview',
      title: title.trim() || 'preview',
      note: undefined,
      targetLocal: parsed.targetLocal,
      targetDate: parsed.targetDate,
      timeZone: zone,
      precision,
      rule,
      reminderMinutes: [],
      createdAt: 0,
    };

    try {
      const next = getNextOccurrence(previewItem, new Date());
      const nextLocal = DateTime.fromJSDate(next, { zone });
      if (!nextLocal.isValid) return null;
      return nextLocal.toFormat('yyyy-LL-dd HH:mm:ss');
    } catch {
      return null;
    }
  }, [timeZone, precision, timePart, datePart, rule, title]);

  const cronNextPreview = useMemo(() => {
    if (rule.kind !== 'cron') return null;
    const zone = timeZone.trim() || DEFAULT_TIME_ZONE;
    if (!isValidTimeZone(zone)) return null;
    try {
      const job = new Cron(rule.expression, { timezone: zone, paused: true });
      const next = job.nextRun(new Date(Date.now() + 1));
      if (!(next instanceof Date) || !Number.isFinite(next.getTime())) return null;
      return DateTime.fromJSDate(next, { zone }).toFormat('yyyy-LL-dd HH:mm:ss');
    } catch {
      return null;
    }
  }, [rule, timeZone]);

  useEffect(() => {
    if (!isOpen) return;

    setNaturalInput('');
    setErrorMessage(null);

    if (initialData) {
      const initZone = normalizeTimeZone(initialData.timeZone ?? DEFAULT_TIME_ZONE);
      const initPrecision: CountdownPrecision = initialData.precision ?? 'minute';
      const initRule: CountdownRule =
        initialData.rule ??
        (initialData.recurrence === 'daily'
          ? { kind: 'interval', unit: 'day', every: 1 }
          : initialData.recurrence === 'weekly'
            ? { kind: 'interval', unit: 'week', every: 1 }
            : initialData.recurrence === 'monthly'
              ? { kind: 'interval', unit: 'month', every: 1 }
              : initialData.recurrence === 'yearly'
                ? { kind: 'interval', unit: 'year', every: 1 }
                : { kind: 'once' });

      const fallbackLocal =
        initialData.targetLocal ||
        (initialData.targetDate
          ? DateTime.fromISO(initialData.targetDate, { zone: 'utc' })
              .setZone(initZone)
              .toFormat("yyyy-MM-dd'T'HH:mm:ss")
          : '');

      const nextLocal = (() => {
        if (!fallbackLocal) return '';
        const local = DateTime.fromISO(fallbackLocal, { zone: initZone });
        const targetDate = local.isValid
          ? (local.toUTC().toISO() ?? new Date().toISOString())
          : new Date().toISOString();
        const previewItem: CountdownItem = {
          id: 'preview',
          title: 'preview',
          note: undefined,
          targetLocal: fallbackLocal,
          targetDate,
          timeZone: initZone,
          precision: initPrecision,
          rule: initRule,
          reminderMinutes: [],
          createdAt: 0,
        };
        const next = getNextOccurrence(previewItem, new Date());
        return toTargetLocalString(DateTime.fromJSDate(next, { zone: initZone }));
      })();

      setTitle(initialData.title ?? '');
      setNote(initialData.note ?? '');
      setLinkedUrlInput(initialData.linkedUrl ?? '');
      setLabelColor((initialData.labelColor as CountdownLabelColor) ?? '');

      setTimeZone(initZone);
      setPrecision(initPrecision);
      setRepeatMode(deriveRepeatModeFromRule(initRule));

      if (initRule.kind === 'cron') {
        setCronExpression(normalizeCronExpression(initRule.expression));
      }
      if (initRule.kind === 'lunarYearly') {
        setLunarMonth(initRule.month);
        setLunarDay(initRule.day);
        setLunarLeap(Boolean(initRule.isLeapMonth));
      }
      if (initRule.kind === 'solarTermYearly') {
        setSolarTermKey(initRule.term);
      }

      if (nextLocal) {
        const [d, tpart] = nextLocal.split('T');
        setDatePart(d ?? '');
        setTimePart(normalizeTimePart(tpart ?? '00:00:00'));
      } else {
        setDatePart('');
        setTimePart('00:00:00');
      }

      setReminderMinutes(normalizeReminderMinutes(initialData.reminderMinutes));
      setReminderInput('');
      setTags(normalizeTags(initialData.tags));
      setTagInput('');
      setChecklist(initialData.checklist ?? []);
      setChecklistInput('');
      setIsPrivate(Boolean(initialData.isPrivate));

      // Auto-expand advanced section if any advanced fields have data
      const hasAdvancedData =
        (initialData.checklist && initialData.checklist.length > 0) ||
        !!initialData.linkedUrl ||
        (initialData.tags && initialData.tags.length > 0) ||
        (initialData.precision && initialData.precision !== 'minute') ||
        (initialData.timeZone && initialData.timeZone !== DEFAULT_TIME_ZONE) ||
        (initialData.reminderMinutes &&
          JSON.stringify([...initialData.reminderMinutes].sort()) !==
            JSON.stringify([...DEFAULT_REMINDER_MINUTES].sort())) ||
        !!initialData.isPrivate;
      setShowAdvanced(!!hasAdvancedData);
    } else {
      const nowZoned = DateTime.now().setZone(DEFAULT_TIME_ZONE).set({ millisecond: 0 });
      const initDatePart = nowZoned.toFormat('yyyy-MM-dd');
      const initTimePart = nowZoned.set({ second: 0 }).toFormat('HH:mm:ss');

      setTitle('');
      setNote('');
      setLinkedUrlInput('');
      setLabelColor('');
      setTimeZone(DEFAULT_TIME_ZONE);
      setPrecision('minute');
      setNaturalInput('');
      setDatePart(initDatePart);
      setTimePart(initTimePart);
      setRepeatMode('once');
      setCronExpression('0 0 9 * * 1-5');
      setLunarMonth(12);
      setLunarDay(23);
      setLunarLeap(false);
      setSolarTermKey(SOLAR_TERM_KEY_BY_ZH_NAME['立春']);
      setReminderMinutes([...DEFAULT_REMINDER_MINUTES]);
      setReminderInput('');
      setTags([]);
      setTagInput('');
      setChecklist([]);
      setChecklistInput('');
      setIsPrivate(false);
      setShowAdvanced(false);
    }
  }, [isOpen, initialData]);

  useEffect(() => {
    if (!isOpen) return;
    setTimePart((prev) => clampTimeByPrecision(precision, prev));
  }, [isOpen, precision]);

  // Close template dropdown on click outside
  useEffect(() => {
    if (!showTemplateDropdown) return;
    const handler = (e: MouseEvent) => {
      if (templateDropdownRef.current && !templateDropdownRef.current.contains(e.target as Node)) {
        setShowTemplateDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showTemplateDropdown]);

  const handleSelectTemplate = useCallback(
    (entry: HolidayEntry) => {
      const { targetLocal: tl } = computeHolidayTargetDate(entry, timeZone);
      const dtLocal = DateTime.fromISO(tl, { zone: timeZone });

      const lang = i18n.language;
      setTitle(lang === 'zh-CN' ? entry.nameZh : entry.nameEn);
      setPrecision(entry.precision);
      if (entry.labelColor) setLabelColor(entry.labelColor);

      setRepeatMode(deriveRepeatModeFromRule(entry.rule));
      if (entry.rule.kind === 'cron') {
        setCronExpression(normalizeCronExpression(entry.rule.expression));
      }
      if (entry.rule.kind === 'lunarYearly') {
        setLunarMonth(entry.rule.month);
        setLunarDay(entry.rule.day);
        setLunarLeap(Boolean(entry.rule.isLeapMonth));
      }
      if (entry.rule.kind === 'solarTermYearly') {
        setSolarTermKey(entry.rule.term);
      }

      if (dtLocal.isValid) {
        setDatePart(dtLocal.toFormat('yyyy-MM-dd'));
        setTimePart(dtLocal.toFormat('HH:mm:ss'));
      } else {
        const [d, tpart] = tl.split('T');
        setDatePart(d ?? '');
        setTimePart(normalizeTimePart(tpart ?? '00:00:00'));
      }

      setShowTemplateDropdown(false);
    },
    [i18n.language, timeZone],
  );

  const handleApplyNatural = () => {
    setErrorMessage(null);

    const [hh = '00', mm = '00', ss = '00'] = normalizeTimePart(timePart).split(':');
    const fallbackTime = {
      hour: Number.parseInt(hh, 10),
      minute: Number.parseInt(mm, 10),
      second: Number.parseInt(ss, 10),
    };

    const parsed = parseNaturalInput(naturalInput, { timeZone, fallbackTime });
    if (!parsed.ok) {
      setErrorMessage(parsed.errors.join('；'));
      return;
    }

    setTimeZone(parsed.timeZone);
    if (parsed.precision) setPrecision(parsed.precision);

    if (parsed.rule) {
      setRepeatMode(deriveRepeatModeFromRule(parsed.rule));

      if (parsed.rule.kind === 'cron')
        setCronExpression(normalizeCronExpression(parsed.rule.expression));
      if (parsed.rule.kind === 'lunarYearly') {
        setLunarMonth(parsed.rule.month);
        setLunarDay(parsed.rule.day);
        setLunarLeap(Boolean(parsed.rule.isLeapMonth));
      }
      if (parsed.rule.kind === 'solarTermYearly') setSolarTermKey(parsed.rule.term);
    }

    if (parsed.targetLocal) {
      const [d, tpart] = parsed.targetLocal.split('T');
      if (d) setDatePart(d);
      if (tpart) setTimePart(normalizeTimePart(tpart));
    }
  };

  const handleAddTags = () => {
    const raw = tagInput.trim();
    if (!raw) return;
    const parts = raw
      .split(/[,，]/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length === 0) return;

    setTags((prev) => normalizeTags([...prev, ...parts]));
    setTagInput('');
  };

  const handleRemoveTag = (tag: string) => {
    const normalized = tag.trim();
    if (!normalized) return;
    setTags((prev) => prev.filter((t) => t.trim() !== normalized));
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const zone = timeZone.trim() || DEFAULT_TIME_ZONE;
    if (!isValidTimeZone(zone)) {
      setErrorMessage(t('modals.countdown.invalidTimeZone'));
      return;
    }

    const clampedTime = clampTimeByPrecision(precision, timePart);
    const baseTargetLocal = formatTargetLocal({ date: datePart, time: clampedTime, precision });

    if (!title.trim()) return;

    // For cron rules, store next run as targetLocal (preview)
    let finalTargetLocal = baseTargetLocal;
    let finalRule = rule;
    let cronNextDate: Date | null = null;
    let finalTargetDate: string | null = null;

    if (rule.kind === 'cron') {
      try {
        const normalized = normalizeCronExpression(rule.expression);
        const job = new Cron(normalized, { timezone: zone, paused: true });
        const next = job.nextRun(new Date(Date.now() + 1));
        if (!(next instanceof Date) || !Number.isFinite(next.getTime())) {
          setErrorMessage(t('modals.countdown.invalidCron'));
          return;
        }
        cronNextDate = next;
        finalTargetLocal = toTargetLocalString(DateTime.fromJSDate(next, { zone }));
        finalRule = { kind: 'cron', expression: normalized };
      } catch {
        setErrorMessage(t('modals.countdown.invalidCron'));
        return;
      }
    } else if (!finalTargetLocal) {
      setErrorMessage(t('modals.countdown.invalidTargetTime'));
      return;
    }

    if (finalRule.kind === 'cron' && cronNextDate) {
      finalTargetDate = cronNextDate.toISOString();
      const local = DateTime.fromJSDate(cronNextDate, { zone });
      if (!local.isValid) {
        setErrorMessage(t('modals.countdown.invalidTargetTime'));
        return;
      }
      finalTargetLocal = toTargetLocalString(local.set({ millisecond: 0 }));
    } else {
      const parsed = parseTargetLocalExact(finalTargetLocal, zone);
      if (!parsed.ok) {
        setErrorMessage(
          parsed.error === 'nonexistent'
            ? t('modals.countdown.invalidTargetWallTime')
            : t('modals.countdown.invalidTargetTime'),
        );
        return;
      }
      finalTargetLocal = parsed.targetLocal;
      finalTargetDate = parsed.targetDate;
    }

    const rawLinkedUrl = linkedUrlInput.trim();
    let linkedUrl: string | undefined = undefined;
    if (rawLinkedUrl) {
      const normalized = normalizeHttpUrl(rawLinkedUrl);
      if (!normalized) {
        setErrorMessage(t('modals.countdown.invalidLinkedUrl'));
        return;
      }
      linkedUrl = normalized;
    }

    const normalizedTags = normalizeTags(tags);

    onSave({
      title: title.trim(),
      note: note.trim() ? note.trim() : undefined,
      linkedUrl,
      targetLocal: finalTargetLocal,
      targetDate: finalTargetDate ?? new Date().toISOString(),
      timeZone: zone,
      precision,
      rule: finalRule,
      reminderMinutes,
      labelColor: labelColor || undefined,
      hidden: initialData?.hidden,
      isPrivate: isPrivate || undefined,
      order: initialData?.order,
      tags: normalizedTags.length > 0 ? normalizedTags : undefined,
      checklist: checklist.length > 0 ? checklist : undefined,
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm transition-opacity duration-300"
      onClick={closeOnBackdrop ? onClose : undefined}
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-100 dark:border-slate-800 transition-transform duration-300 flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center px-6 py-5 border-b border-slate-100 dark:border-slate-800/50 shrink-0">
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 tracking-tight">
            {isEditMode ? t('modals.countdown.editCountdown') : t('modals.countdown.addCountdown')}
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
          >
            <X size={20} strokeWidth={2} />
          </button>
        </div>

        <form onSubmit={handleSave} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-hide">
            {errorMessage && (
              <div className="px-4 py-3 rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm">
                {errorMessage}
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                  {t('modals.countdown.title')}
                </label>
                {!isEditMode && (
                  <div className="relative" ref={templateDropdownRef}>
                    <button
                      type="button"
                      onClick={() => setShowTemplateDropdown((prev) => !prev)}
                      className="text-xs font-medium text-accent hover:text-accent/80 transition-colors"
                    >
                      {t('modals.countdown.templateButton')}
                    </button>
                    {showTemplateDropdown && (
                      <div className="absolute right-0 top-full mt-1 z-50 w-56 max-h-72 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl">
                        <div className="p-2">
                          <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 dark:text-slate-500 px-2 py-1">
                            {t('modals.countdown.templateChinese')}
                          </div>
                          {HOLIDAYS.filter((h) => h.category === 'chinese_legal').map((h) => (
                            <button
                              key={h.id}
                              type="button"
                              onClick={() => handleSelectTemplate(h)}
                              className="w-full text-left px-2 py-1.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                            >
                              {i18n.language === 'zh-CN' ? h.nameZh : h.nameEn}
                            </button>
                          ))}
                          <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 dark:text-slate-500 px-2 py-1 mt-1">
                            {t('modals.countdown.templateInternational')}
                          </div>
                          {HOLIDAYS.filter((h) => h.category === 'international').map((h) => (
                            <button
                              key={h.id}
                              type="button"
                              onClick={() => handleSelectTemplate(h)}
                              className="w-full text-left px-2 py-1.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                            >
                              {i18n.language === 'zh-CN' ? h.nameZh : h.nameEn}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm font-medium"
                placeholder={t('modals.countdown.title')}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                {t('modals.countdown.note')}
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-sm min-h-[60px] resize-none"
                placeholder={t('modals.countdown.notePlaceholder')}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                {t('modals.countdown.targetDate')}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={datePart}
                  onChange={(e) => setDatePart(e.target.value)}
                  className="flex-1 px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm font-medium"
                />
                {precision !== 'day' && (
                  <input
                    type="time"
                    step={timeStep}
                    value={
                      precision === 'second'
                        ? normalizeTimePart(timePart)
                        : precision === 'minute'
                          ? normalizeTimePart(timePart).slice(0, 5)
                          : normalizeTimePart(timePart).slice(0, 2) + ':00'
                    }
                    onChange={(e) => setTimePart(normalizeTimePart(e.target.value))}
                    className="w-[140px] px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm font-medium"
                  />
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                {t('modals.countdown.recurrence')}
              </label>
              <select
                value={repeatMode}
                onChange={(e) => setRepeatMode(e.target.value as RepeatMode)}
                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm font-medium"
              >
                <option value="once">{t('modals.countdown.once')}</option>
                <option value="daily">{t('modals.countdown.daily')}</option>
                <option value="weekly">{t('modals.countdown.weekly')}</option>
                <option value="biweekly">{t('modals.countdown.biweekly')}</option>
                <option value="workday">{t('modals.countdown.workday')}</option>
                <option value="monthly">{t('modals.countdown.monthly')}</option>
                <option value="quarterly">{t('modals.countdown.quarterly')}</option>
                <option value="yearly">{t('modals.countdown.yearly')}</option>
                <option value="cron">{t('modals.countdown.cron')}</option>
                <option value="lunarYearly">{t('modals.countdown.lunarYearly')}</option>
                <option value="solarTermYearly">{t('modals.countdown.solarTermYearly')}</option>
              </select>

              {repeatMode === 'cron' && (
                <div className="mt-2 space-y-2">
                  <input
                    type="text"
                    value={cronExpression}
                    onChange={(e) => setCronExpression(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm font-medium"
                    placeholder={t('modals.countdown.cronPlaceholder')}
                  />
                  <div className="text-[11px] text-slate-400 dark:text-slate-500">
                    {t('modals.countdown.cronHint')}
                  </div>
                  {cronNextPreview && (
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      {t('modals.countdown.nextOccurrence')}: {cronNextPreview} (
                      {normalizeTimeZone(timeZone)})
                    </div>
                  )}
                </div>
              )}

              {repeatMode === 'lunarYearly' && (
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <select
                    value={lunarMonth}
                    onChange={(e) => setLunarMonth(Number.parseInt(e.target.value, 10))}
                    className="px-3 py-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-sm"
                  >
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                      <option key={m} value={m}>
                        {m === 11
                          ? t('modals.countdown.lunarMonth11')
                          : m === 12
                            ? t('modals.countdown.lunarMonth12')
                            : t('modals.countdown.lunarMonthN', { count: m })}
                      </option>
                    ))}
                  </select>
                  <select
                    value={lunarDay}
                    onChange={(e) => setLunarDay(Number.parseInt(e.target.value, 10))}
                    className="px-3 py-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-sm"
                  >
                    {Array.from({ length: 30 }, (_, i) => i + 1).map((d) => (
                      <option key={d} value={d}>
                        {t('modals.countdown.lunarDayN', { count: d })}
                      </option>
                    ))}
                  </select>
                  <label className="flex items-center justify-center gap-2 px-3 py-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-sm text-slate-700 dark:text-slate-200">
                    <input
                      type="checkbox"
                      checked={lunarLeap}
                      onChange={(e) => setLunarLeap(e.target.checked)}
                    />
                    {t('modals.countdown.lunarLeap')}
                  </label>
                </div>
              )}

              {repeatMode === 'solarTermYearly' && (
                <div className="mt-2">
                  <select
                    value={solarTermKey}
                    onChange={(e) => setSolarTermKey(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm font-medium"
                  >
                    {SOLAR_TERM_ZH_NAMES.map((name) => (
                      <option key={name} value={SOLAR_TERM_KEY_BY_ZH_NAME[name]}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Label Color Marker */}
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                {t('modals.countdown.labelColor')}
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setLabelColor('')}
                  className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
                    labelColor === ''
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-accent/50'
                  }`}
                >
                  {t('modals.countdown.labelColorNone')}
                </button>
                {LABEL_COLOR_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setLabelColor(opt.value)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
                      labelColor === opt.value
                        ? 'border-accent bg-accent/10 text-accent'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-accent/50'
                    }`}
                  >
                    <span className={`inline-block w-2 h-2 rounded-full ${opt.className}`} />
                    {t(opt.labelKey)}
                  </button>
                ))}
              </div>
            </div>

            {/* Advanced Options Toggle */}
            <button
              type="button"
              onClick={() => setShowAdvanced((prev) => !prev)}
              className="flex items-center gap-2 w-full py-2 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-accent transition-colors"
            >
              <ChevronDown
                size={14}
                className={`transition-transform duration-200 ${showAdvanced ? 'rotate-180' : ''}`}
              />
              {t('modals.countdown.advancedOptions')}
              <div className="flex-1 h-px bg-slate-200/60 dark:bg-slate-700/60" />
            </button>

            {/* Advanced Fields */}
            <div
              className={`space-y-4 transition-all duration-300 ease-in-out overflow-hidden ${
                showAdvanced ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'
              }`}
            >
              {/* Checklist Section */}
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                    {t('modals.countdown.checklist')}
                  </label>
                  {checklist.length === 0 && (
                    <span className="text-[11px] text-slate-400 dark:text-slate-500">
                      {t('modals.countdown.checklistEmpty')}
                    </span>
                  )}
                </div>

                {checklist.length > 0 && (
                  <ul className="space-y-1.5 mb-2">
                    {checklist.map((ci) => (
                      <li key={ci.id} className="flex items-center gap-2 group">
                        <button
                          type="button"
                          onClick={() =>
                            setChecklist((prev) =>
                              prev.map((item) =>
                                item.id === ci.id ? { ...item, done: !item.done } : item,
                              ),
                            )
                          }
                          className={`shrink-0 w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                            ci.done
                              ? 'bg-emerald-500 border-emerald-500 text-white'
                              : 'border-slate-300 dark:border-slate-600 hover:border-emerald-400'
                          }`}
                        >
                          {ci.done && (
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                              <path
                                d="M2.5 6L5 8.5L9.5 3.5"
                                stroke="currentColor"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          )}
                        </button>
                        <span
                          className={`flex-1 text-sm ${
                            ci.done
                              ? 'line-through text-slate-400 dark:text-slate-500'
                              : 'text-slate-700 dark:text-slate-200'
                          }`}
                        >
                          {ci.text}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setChecklist((prev) => prev.filter((item) => item.id !== ci.id))
                          }
                          className="shrink-0 p-1 text-slate-300 dark:text-slate-600 hover:text-red-500 dark:hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                        >
                          <X size={14} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {checklist.length < 20 ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={checklistInput}
                      onChange={(e) => setChecklistInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const text = checklistInput.trim();
                          if (!text) return;
                          setChecklist((prev) => [
                            ...prev,
                            { id: generateId(), text, done: false },
                          ]);
                          setChecklistInput('');
                        }
                      }}
                      className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                      placeholder={t('modals.countdown.checklistHint')}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const text = checklistInput.trim();
                        if (!text) return;
                        setChecklist((prev) => [...prev, { id: generateId(), text, done: false }]);
                        setChecklistInput('');
                      }}
                      className="shrink-0 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-accent hover:border-accent/50 transition-all"
                    >
                      {t('modals.countdown.checklistAdd')}
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-amber-500">
                    {t('modals.countdown.checklistMaxReached', { max: 20 })}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                  {t('modals.countdown.linkedUrl')}
                </label>
                <input
                  type="text"
                  value={linkedUrlInput}
                  onChange={(e) => setLinkedUrlInput(e.target.value)}
                  list={linkOptions.length > 0 ? 'navhub-reminder-linked-url-options' : undefined}
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm font-medium"
                  placeholder={t('modals.countdown.linkedUrlPlaceholder')}
                />
                {linkOptions.length > 0 && (
                  <datalist id="navhub-reminder-linked-url-options">
                    {linkOptions.map((link) => (
                      <option key={link.id} value={link.url} label={link.title} />
                    ))}
                  </datalist>
                )}
              </div>

              {isAdmin && (
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                      {t('modals.countdown.group')}
                    </label>
                    {tags.length === 0 && (
                      <span className="text-[11px] text-slate-400 dark:text-slate-500">
                        {t('modals.countdown.groupNoneDefault')}
                      </span>
                    )}
                  </div>
                  {tags.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {tags.map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => handleRemoveTag(tag)}
                          className="px-2.5 py-1.5 rounded-full text-[11px] font-semibold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-red-300 hover:text-red-600 transition-colors"
                          title={t('common.delete')}
                        >
                          <span className="inline-flex items-center gap-1">
                            <span className="max-w-[180px] truncate">{tag}</span>
                            <X size={12} />
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      list={groups.length > 0 ? 'navhub-reminder-tag-options' : undefined}
                      className="flex-1 px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm font-medium"
                      placeholder={t('modals.countdown.groupNewPlaceholder')}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddTags();
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={handleAddTags}
                      className="px-3 py-3 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-accent/50 hover:text-accent transition-all whitespace-nowrap"
                    >
                      {t('common.add')}
                    </button>
                  </div>

                  {groups.length > 0 && (
                    <datalist id="navhub-reminder-tag-options">
                      {groups.map((tag) => (
                        <option key={tag} value={tag} />
                      ))}
                    </datalist>
                  )}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                  {t('modals.countdown.precision')}
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {(['day', 'hour', 'minute', 'second'] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPrecision(p)}
                      className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
                        precision === p
                          ? 'border-accent bg-accent/10 text-accent'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-accent/50'
                      }`}
                    >
                      {t(`modals.countdown.precision_${p}`)}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                  {t('modals.countdown.timeZone')}
                </label>
                <input
                  type="text"
                  value={timeZone}
                  onChange={(e) => setTimeZone(e.target.value)}
                  list="navhub-timezone-options"
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm font-medium"
                  placeholder={DEFAULT_TIME_ZONE}
                />
                <datalist id="navhub-timezone-options">
                  {COMMON_TIME_ZONES.map((opt) => (
                    <option key={opt.value} value={opt.value} label={opt.label} />
                  ))}
                </datalist>
                <div className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                  {t('modals.countdown.timeZoneHint')}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                  {t('modals.countdown.naturalInput')}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={naturalInput}
                    onChange={(e) => setNaturalInput(e.target.value)}
                    className="flex-1 px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm font-medium"
                    placeholder={t('modals.countdown.naturalInputPlaceholder')}
                  />
                  <button
                    type="button"
                    onClick={handleApplyNatural}
                    className="px-3 py-3 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-accent/50 hover:text-accent transition-all whitespace-nowrap"
                  >
                    {t('modals.countdown.applyNatural')}
                  </button>
                </div>
                {nextOccurrencePreview && (
                  <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                    {t('modals.countdown.nextOccurrence')}: {nextOccurrencePreview} (
                    {normalizeTimeZone(timeZone)})
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                    {t('modals.countdown.reminders')}
                  </label>
                  <span className="text-[11px] text-slate-400 dark:text-slate-500">
                    {t('modals.countdown.remindersHint')}
                  </span>
                </div>

                <div className="flex flex-wrap gap-2 mb-2">
                  {reminderMinutes.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setReminderMinutes((prev) => prev.filter((x) => x !== m))}
                      className="px-2.5 py-1.5 rounded-full text-[11px] font-semibold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-red-300 hover:text-red-600 transition-colors"
                      title={t('common.delete')}
                    >
                      {m === 0
                        ? t('modals.countdown.atTime')
                        : t('modals.countdown.reminderChip', { minutes: m })}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    value={reminderInput}
                    onChange={(e) => setReminderInput(e.target.value)}
                    className="flex-1 px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm font-medium"
                    placeholder={t('modals.countdown.reminderPlaceholder')}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const n = Number.parseInt(reminderInput.trim(), 10);
                      if (!Number.isFinite(n) || n < 0) {
                        setErrorMessage(t('modals.countdown.invalidReminderMinutes'));
                        return;
                      }

                      setReminderMinutes((prev) => normalizeReminderMinutes([...prev, n]));
                      setReminderInput('');
                    }}
                    className="px-3 py-3 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-accent/50 hover:text-accent transition-all whitespace-nowrap"
                  >
                    {t('modals.countdown.addReminder')}
                  </button>
                </div>
              </div>

              {isAdmin && privacyGroupEnabled && (
                <label className="flex items-center gap-3 px-1 py-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isPrivate}
                    onChange={(e) => setIsPrivate(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-accent focus:ring-accent/20"
                  />
                  <span className="text-sm text-slate-700 dark:text-slate-200">
                    {t('modals.countdown.isPrivate')}
                  </span>
                </label>
              )}

              {/* End of Advanced Fields */}
            </div>
          </div>

          <div className="shrink-0 p-6 pt-2 border-t border-slate-100 dark:border-slate-800/50">
            <button
              type="submit"
              className="w-full bg-slate-900 dark:bg-accent text-white font-bold py-3.5 px-4 rounded-xl hover:bg-slate-800 dark:hover:bg-accent/90 transition-all shadow-lg shadow-slate-200 dark:shadow-none active:scale-[0.99] text-sm"
            >
              {t('modals.countdown.saveCountdown')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ReminderBoardModal;
