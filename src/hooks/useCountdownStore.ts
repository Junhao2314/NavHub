import { arrayMove } from '@dnd-kit/sortable';
import { DateTime } from 'luxon';
import { useCallback, useEffect, useState } from 'react';
import type {
  ChecklistItem,
  CountdownItem,
  CountdownLabelColor,
  CountdownPrecision,
  CountdownRecurrence,
  CountdownRule,
  CountdownTagsBatchOp,
} from '../types';
import { COUNTDOWN_STORAGE_KEY } from '../utils/constants';
import { generateId } from '../utils/id';
import {
  flushScheduledLocalStorageWrite,
  safeLocalStorageGetItem,
  scheduleLocalStorageSetItemLazy,
} from '../utils/storage';
import { normalizeTimeZone } from '../utils/timezone';
import { normalizeHttpUrl } from '../utils/url';

const DEFAULT_REMINDER_MINUTES = [60, 10, 0] as const;
const MAX_REMINDER_MINUTES = 60 * 24 * 30; // 30 days
const MAX_REMINDERS_PER_ITEM = 10;
const MAX_TAGS_PER_ITEM = 20;
const MAX_CHECKLIST_PER_ITEM = 20;
const MAX_CHECKLIST_TEXT_LENGTH = 200;

const PERSIST_OPTIONS = {
  debounceMs: 200,
  strategy: 'idle',
  idleTimeoutMs: 1000,
} as const;

const isCountdownRecurrence = (value: unknown): value is CountdownRecurrence => {
  return (
    value === 'once' ||
    value === 'daily' ||
    value === 'weekly' ||
    value === 'monthly' ||
    value === 'yearly'
  );
};

const isCountdownPrecision = (value: unknown): value is CountdownPrecision => {
  return value === 'day' || value === 'hour' || value === 'minute' || value === 'second';
};

const isCountdownRule = (value: unknown): value is CountdownRule => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const kind = record.kind;
  if (kind === 'once') return true;
  if (kind === 'interval') {
    return (
      (record.unit === 'day' ||
        record.unit === 'week' ||
        record.unit === 'month' ||
        record.unit === 'year') &&
      typeof record.every === 'number' &&
      Number.isFinite(record.every) &&
      record.every >= 1
    );
  }
  if (kind === 'cron') {
    return typeof record.expression === 'string' && record.expression.trim().length > 0;
  }
  if (kind === 'lunarYearly') {
    return (
      typeof record.month === 'number' &&
      Number.isFinite(record.month) &&
      record.month >= 1 &&
      record.month <= 12 &&
      typeof record.day === 'number' &&
      Number.isFinite(record.day) &&
      record.day >= 1 &&
      record.day <= 30 &&
      (record.isLeapMonth === undefined || typeof record.isLeapMonth === 'boolean')
    );
  }
  if (kind === 'solarTermYearly') {
    return typeof record.term === 'string' && record.term.trim().length > 0;
  }
  return false;
};

const isCountdownLabelColor = (value: unknown): value is CountdownLabelColor => {
  return (
    value === 'red' ||
    value === 'orange' ||
    value === 'amber' ||
    value === 'yellow' ||
    value === 'green' ||
    value === 'emerald' ||
    value === 'blue' ||
    value === 'indigo' ||
    value === 'violet' ||
    value === 'pink' ||
    value === 'slate'
  );
};

const normalizeReminderMinutes = (value: unknown): number[] | undefined => {
  if (!Array.isArray(value)) return undefined;

  const minutes: number[] = [];
  const seen = new Set<number>();

  for (const raw of value) {
    if (minutes.length >= MAX_REMINDERS_PER_ITEM) break;
    if (typeof raw !== 'number' || !Number.isFinite(raw)) continue;
    const next = Math.floor(raw);
    if (next < 0 || next > MAX_REMINDER_MINUTES) continue;
    if (seen.has(next)) continue;
    seen.add(next);
    minutes.push(next);
  }

  minutes.sort((a, b) => b - a);
  return minutes;
};

const normalizeTags = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) return undefined;

  const tags: string[] = [];
  const seen = new Set<string>();

  for (const raw of value) {
    if (tags.length >= MAX_TAGS_PER_ITEM) break;
    if (typeof raw !== 'string') continue;
    const next = raw.trim();
    if (!next) continue;
    if (seen.has(next)) continue;
    seen.add(next);
    tags.push(next);
  }

  return tags.length > 0 ? tags : undefined;
};

const normalizeChecklist = (value: unknown): ChecklistItem[] | undefined => {
  if (!Array.isArray(value)) return undefined;

  const items: ChecklistItem[] = [];
  const seen = new Set<string>();

  for (const raw of value) {
    if (items.length >= MAX_CHECKLIST_PER_ITEM) break;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const record = raw as Record<string, unknown>;
    if (typeof record.id !== 'string' || !record.id) continue;
    if (typeof record.text !== 'string') continue;
    const text = record.text.slice(0, MAX_CHECKLIST_TEXT_LENGTH).trim();
    if (!text) continue;
    if (seen.has(record.id)) continue;
    seen.add(record.id);
    items.push({ id: record.id, text, done: Boolean(record.done) });
  }

  return items.length > 0 ? items : undefined;
};

const normalizeNewCountdownItem = (
  data: Omit<CountdownItem, 'id' | 'createdAt'>,
  order: number,
  now: number,
): CountdownItem => {
  const normalizedReminderMinutes =
    data.reminderMinutes !== undefined ? normalizeReminderMinutes(data.reminderMinutes) : undefined;
  const reminderMinutes =
    normalizedReminderMinutes !== undefined
      ? normalizedReminderMinutes
      : [...DEFAULT_REMINDER_MINUTES];

  const tags = normalizeTags(data.tags);
  const checklist = normalizeChecklist(data.checklist);

  return {
    ...data,
    tags,
    checklist,
    id: generateId(),
    createdAt: now,
    order,
    reminderMinutes,
  };
};

const toTargetLocalString = (dt: DateTime): string => dt.toFormat("yyyy-MM-dd'T'HH:mm:ss");

const getDefaultRuleFromLegacyRecurrence = (
  recurrence: CountdownRecurrence | undefined,
): CountdownRule => {
  if (recurrence === 'daily') return { kind: 'interval', unit: 'day', every: 1 };
  if (recurrence === 'weekly') return { kind: 'interval', unit: 'week', every: 1 };
  if (recurrence === 'monthly') return { kind: 'interval', unit: 'month', every: 1 };
  if (recurrence === 'yearly') return { kind: 'interval', unit: 'year', every: 1 };
  return { kind: 'once' };
};

const sanitizeCountdowns = (input: unknown): CountdownItem[] => {
  if (!Array.isArray(input)) return [];

  const result: CountdownItem[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const record = raw as Record<string, unknown>;

    const id = typeof record.id === 'string' ? record.id : '';
    const title = typeof record.title === 'string' ? record.title : '';
    const rawTargetDate = typeof record.targetDate === 'string' ? record.targetDate : '';
    const createdAt = record.createdAt;

    if (!id || !title) continue;
    if (typeof createdAt !== 'number' || !Number.isFinite(createdAt)) continue;

    const timeZone = normalizeTimeZone(
      typeof record.timeZone === 'string' ? record.timeZone : null,
    );
    const precision: CountdownPrecision = isCountdownPrecision(record.precision)
      ? record.precision
      : 'minute';

    const legacyRecurrence = isCountdownRecurrence(record.recurrence)
      ? record.recurrence
      : undefined;
    const rule: CountdownRule = isCountdownRule(record.rule)
      ? record.rule
      : getDefaultRuleFromLegacyRecurrence(legacyRecurrence);

    const targetLocalCandidate =
      typeof record.targetLocal === 'string' ? record.targetLocal.trim() : '';
    const targetLocalParsed = targetLocalCandidate
      ? DateTime.fromISO(targetLocalCandidate, { zone: timeZone })
      : null;

    const targetDateParsed = rawTargetDate
      ? DateTime.fromISO(rawTargetDate, { zone: 'utc' })
      : null;

    const local =
      targetLocalParsed && targetLocalParsed.isValid
        ? targetLocalParsed.set({ millisecond: 0 })
        : targetDateParsed && targetDateParsed.isValid
          ? targetDateParsed.setZone(timeZone).set({ millisecond: 0 })
          : null;

    if (!local || !local.isValid) continue;

    const targetLocal = toTargetLocalString(local);
    const targetDate = local.toUTC().toISO() ?? rawTargetDate;

    const note = typeof record.note === 'string' && record.note.trim() ? record.note : undefined;
    const linkedUrl =
      typeof record.linkedUrl === 'string' && record.linkedUrl.trim()
        ? (normalizeHttpUrl(record.linkedUrl) ?? undefined)
        : undefined;
    const hidden = typeof record.hidden === 'boolean' ? record.hidden : undefined;
    const isPrivate = typeof record.isPrivate === 'boolean' ? record.isPrivate : undefined;
    const labelColor = isCountdownLabelColor(record.labelColor) ? record.labelColor : undefined;
    const order =
      typeof record.order === 'number' && Number.isFinite(record.order) ? record.order : undefined;

    const normalizedTags = normalizeTags(record.tags);
    const legacyGroup =
      typeof record.group === 'string' && record.group.trim() ? record.group.trim() : undefined;
    const tags = normalizedTags ?? (legacyGroup ? [legacyGroup] : undefined);
    const archivedAt =
      typeof record.archivedAt === 'number' && Number.isFinite(record.archivedAt)
        ? record.archivedAt
        : undefined;

    const normalizedReminderMinutes = normalizeReminderMinutes(record.reminderMinutes);
    const reminderMinutes =
      normalizedReminderMinutes !== undefined
        ? normalizedReminderMinutes
        : [...DEFAULT_REMINDER_MINUTES];

    const checklist = normalizeChecklist(record.checklist);

    result.push({
      id,
      title,
      note,
      linkedUrl,
      targetDate,
      targetLocal,
      timeZone,
      precision,
      rule,
      reminderMinutes,
      labelColor,
      hidden,
      isPrivate,
      tags,
      archivedAt,
      createdAt,
      order,
      checklist,
    });
  }

  return result;
};

export const useCountdownStore = () => {
  const [countdowns, setCountdowns] = useState<CountdownItem[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Persist helper
  const persist = useCallback((items: CountdownItem[]) => {
    scheduleLocalStorageSetItemLazy(
      COUNTDOWN_STORAGE_KEY,
      () => JSON.stringify(items),
      PERSIST_OPTIONS,
    );
  }, []);

  // Load from localStorage
  useEffect(() => {
    try {
      const stored = safeLocalStorageGetItem(COUNTDOWN_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        const sanitized = sanitizeCountdowns(parsed);
        setCountdowns(sanitized);
        // Persist once to migrate legacy / invalid data.
        scheduleLocalStorageSetItemLazy(
          COUNTDOWN_STORAGE_KEY,
          () => JSON.stringify(sanitized),
          PERSIST_OPTIONS,
        );
      }
    } catch {
      // ignore parse errors
    }
    setIsLoaded(true);
  }, []);

  // Flush on pagehide / visibilitychange
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const flush = () => {
      flushScheduledLocalStorageWrite(COUNTDOWN_STORAGE_KEY);
    };

    const onPageHide = () => flush();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flush();
    };

    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      flush();
    };
  }, []);

  const addCountdown = useCallback(
    (data: Omit<CountdownItem, 'id' | 'createdAt'>) => {
      const newItem = normalizeNewCountdownItem(data, countdowns.length, Date.now());
      const updated = [...countdowns, newItem];
      setCountdowns(updated);
      persist(updated);
    },
    [countdowns, persist],
  );

  const addCountdowns = useCallback(
    (items: Omit<CountdownItem, 'id' | 'createdAt'>[]) => {
      if (items.length === 0) return;
      const now = Date.now();
      const newItems = items.map((data, i) =>
        normalizeNewCountdownItem(data, countdowns.length + i, now),
      );
      const updated = [...countdowns, ...newItems];
      setCountdowns(updated);
      persist(updated);
    },
    [countdowns, persist],
  );

  const updateCountdown = useCallback(
    (data: Partial<CountdownItem> & { id: string }) => {
      const patch = { ...data };
      if (Array.isArray(data.reminderMinutes)) {
        patch.reminderMinutes = normalizeReminderMinutes(data.reminderMinutes) ?? [];
      }
      if (Array.isArray(data.tags)) {
        patch.tags = normalizeTags(data.tags);
      }
      if (Array.isArray(data.checklist)) {
        patch.checklist = normalizeChecklist(data.checklist);
      }
      if (typeof data.timeZone === 'string' || typeof data.targetLocal === 'string') {
        const nextTimeZone = normalizeTimeZone(
          typeof data.timeZone === 'string' ? data.timeZone : undefined,
        );
        const targetLocal = typeof data.targetLocal === 'string' ? data.targetLocal : null;
        const nextLocal = targetLocal
          ? DateTime.fromISO(targetLocal, { zone: nextTimeZone })
          : null;
        if (nextLocal && nextLocal.isValid) {
          patch.timeZone = nextTimeZone;
          patch.targetLocal = toTargetLocalString(nextLocal.set({ millisecond: 0 }));
          patch.targetDate = nextLocal.toUTC().toISO() ?? patch.targetDate;
        } else if (typeof data.timeZone === 'string') {
          patch.timeZone = nextTimeZone;
        }
      }
      const updated = countdowns.map((item) =>
        item.id === data.id ? { ...item, ...patch } : item,
      );
      setCountdowns(updated);
      persist(updated);
    },
    [countdowns, persist],
  );

  const deleteCountdown = useCallback(
    (id: string) => {
      const updated = countdowns.filter((item) => item.id !== id);
      setCountdowns(updated);
      persist(updated);
    },
    [countdowns, persist],
  );

  const deleteCountdowns = useCallback(
    (ids: string[]) => {
      const idSet = new Set(ids.filter(Boolean));
      if (idSet.size === 0) return;
      const updated = countdowns.filter((item) => !idSet.has(item.id));
      setCountdowns(updated);
      persist(updated);
    },
    [countdowns, persist],
  );

  const toggleHidden = useCallback(
    (id: string) => {
      const updated = countdowns.map((item) =>
        item.id === id ? { ...item, hidden: !item.hidden } : item,
      );
      setCountdowns(updated);
      persist(updated);
    },
    [countdowns, persist],
  );

  const archiveCountdown = useCallback(
    (id: string) => {
      const updated = countdowns.map((item) =>
        item.id === id ? { ...item, archivedAt: Date.now() } : item,
      );
      setCountdowns(updated);
      persist(updated);
    },
    [countdowns, persist],
  );

  const archiveCountdowns = useCallback(
    (ids: string[]) => {
      const idSet = new Set(ids.filter(Boolean));
      if (idSet.size === 0) return;
      const archivedAt = Date.now();
      const updated = countdowns.map((item) => {
        if (!idSet.has(item.id)) return item;
        if (item.archivedAt) return item;
        return { ...item, archivedAt };
      });
      setCountdowns(updated);
      persist(updated);
    },
    [countdowns, persist],
  );

  const restoreCountdown = useCallback(
    (id: string) => {
      const updated = countdowns.map((item) => {
        if (item.id !== id) return item;
        const { archivedAt: _, ...rest } = item;
        return rest as CountdownItem;
      });
      setCountdowns(updated);
      persist(updated);
    },
    [countdowns, persist],
  );

  const updateCountdownsTags = useCallback(
    (ids: string[], op: CountdownTagsBatchOp) => {
      const idSet = new Set(ids.filter(Boolean));
      if (idSet.size === 0) return;
      const updated = countdowns.map((item) => {
        if (!idSet.has(item.id)) return item;

        if (op.kind === 'clear') {
          if (!item.tags || item.tags.length === 0) return item;
          const { tags: _, ...rest } = item;
          return rest as CountdownItem;
        }

        const tag = op.tag.trim();
        if (!tag) return item;

        const tags = normalizeTags(item.tags) ?? [];

        if (op.kind === 'add') {
          if (tags.includes(tag)) return item;
          return { ...item, tags: [...tags, tag] };
        }

        // remove
        if (!tags.includes(tag)) return item;
        const nextTags = tags.filter((t) => t !== tag);
        if (nextTags.length === 0) {
          const { tags: _, ...rest } = item;
          return rest as CountdownItem;
        }
        return { ...item, tags: nextTags };
      });
      setCountdowns(updated);
      persist(updated);
    },
    [countdowns, persist],
  );

  const reorderCountdowns = useCallback(
    (activeId: string, overId: string) => {
      if (activeId === overId) return;

      const activeItems = countdowns.filter((item) => !item.archivedAt);
      const activeIndex = activeItems.findIndex((item) => item.id === activeId);
      const overIndex = activeItems.findIndex((item) => item.id === overId);
      if (activeIndex === -1 || overIndex === -1) return;

      const reordered = arrayMove(activeItems, activeIndex, overIndex);
      const orderMap = new Map<string, number>();
      reordered.forEach((item, index) => {
        orderMap.set(item.id, index);
      });

      const updated = countdowns.map((item) => {
        const nextOrder = orderMap.get(item.id);
        if (nextOrder === undefined) return item;
        return { ...item, order: nextOrder };
      });
      setCountdowns(updated);
      persist(updated);
    },
    [countdowns, persist],
  );

  const replaceCountdowns = useCallback(
    (items: CountdownItem[]) => {
      const sanitized = sanitizeCountdowns(items);
      setCountdowns(sanitized);
      persist(sanitized);
    },
    [persist],
  );

  return {
    countdowns,
    isLoaded,
    addCountdown,
    addCountdowns,
    updateCountdown,
    deleteCountdown,
    deleteCountdowns,
    toggleHidden,
    archiveCountdown,
    archiveCountdowns,
    restoreCountdown,
    reorderCountdowns,
    updateCountdownsTags,
    replaceCountdowns,
  };
};
