import { useCallback, useEffect, useState } from 'react';
import type { CountdownItem, CountdownRecurrence } from '../types';
import { COUNTDOWN_STORAGE_KEY } from '../utils/constants';
import { generateId } from '../utils/id';
import {
  flushScheduledLocalStorageWrite,
  safeLocalStorageGetItem,
  scheduleLocalStorageSetItemLazy,
} from '../utils/storage';

const DEFAULT_REMINDER_MINUTES = [60, 10, 0] as const;
const MAX_REMINDER_MINUTES = 60 * 24 * 30; // 30 days
const MAX_REMINDERS_PER_ITEM = 10;

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

const sanitizeCountdowns = (input: unknown): CountdownItem[] => {
  if (!Array.isArray(input)) return [];

  const result: CountdownItem[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const record = raw as Record<string, unknown>;

    const id = typeof record.id === 'string' ? record.id : '';
    const title = typeof record.title === 'string' ? record.title : '';
    const targetDate = typeof record.targetDate === 'string' ? record.targetDate : '';
    const recurrence = record.recurrence;
    const createdAt = record.createdAt;

    if (!id || !title || !targetDate) continue;
    if (!isCountdownRecurrence(recurrence)) continue;
    if (typeof createdAt !== 'number' || !Number.isFinite(createdAt)) continue;
    if (!Number.isFinite(new Date(targetDate).getTime())) continue;

    const note = typeof record.note === 'string' && record.note.trim() ? record.note : undefined;
    const hidden = typeof record.hidden === 'boolean' ? record.hidden : undefined;
    const order =
      typeof record.order === 'number' && Number.isFinite(record.order) ? record.order : undefined;

    const normalizedReminderMinutes = normalizeReminderMinutes(record.reminderMinutes);
    const reminderMinutes =
      normalizedReminderMinutes !== undefined
        ? normalizedReminderMinutes
        : [...DEFAULT_REMINDER_MINUTES];

    result.push({
      id,
      title,
      note,
      targetDate,
      recurrence,
      reminderMinutes,
      hidden,
      createdAt,
      order,
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
      const normalizedReminderMinutes =
        data.reminderMinutes !== undefined
          ? normalizeReminderMinutes(data.reminderMinutes)
          : undefined;
      const reminderMinutes =
        normalizedReminderMinutes !== undefined
          ? normalizedReminderMinutes
          : [...DEFAULT_REMINDER_MINUTES];

      const newItem: CountdownItem = {
        ...data,
        id: generateId(),
        createdAt: Date.now(),
        order: countdowns.length,
        reminderMinutes,
      };
      const updated = [...countdowns, newItem];
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
    updateCountdown,
    deleteCountdown,
    toggleHidden,
    replaceCountdowns,
  };
};
