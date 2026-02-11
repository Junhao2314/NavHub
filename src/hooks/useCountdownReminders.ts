import { useEffect, useRef } from 'react';
import i18n from '../config/i18n';
import type { CountdownItem, CountdownRecurrence } from '../types';
import type { NotifyFn } from '../types/ui';
import { getNextOccurrence } from '../utils/countdown';
import {
  flushScheduledLocalStorageWrite,
  safeLocalStorageGetItem,
  scheduleLocalStorageSetItemLazy,
} from '../utils/storage';

const COUNTDOWN_REMINDER_STATE_KEY = 'navhub_countdown_reminder_state_v1';

const DEFAULT_REMINDER_MINUTES = [60, 10, 0] as const;
const CHECK_INTERVAL_MS = 1000;
const AT_TIME_GRACE_MS = 2 * 60 * 1000;
const STATE_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_STATE_ENTRIES = 500;

const PERSIST_OPTIONS = {
  debounceMs: 200,
  strategy: 'idle',
  idleTimeoutMs: 1000,
} as const;

type ReminderState = Record<string, number>;

const isReminderState = (value: unknown): value is ReminderState => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  for (const entry of Object.entries(value as Record<string, unknown>)) {
    const [key, val] = entry;
    if (typeof key !== 'string') return false;
    if (typeof val !== 'number' || !Number.isFinite(val)) return false;
  }
  return true;
};

const pruneState = (state: ReminderState, now: number): ReminderState => {
  const entries = Object.entries(state).filter(([, firedAt]) => now - firedAt <= STATE_TTL_MS);
  if (entries.length <= MAX_STATE_ENTRIES) return Object.fromEntries(entries);
  entries.sort((a, b) => b[1] - a[1]);
  return Object.fromEntries(entries.slice(0, MAX_STATE_ENTRIES));
};

const normalizeReminderMinutes = (value: unknown): number[] => {
  if (!Array.isArray(value)) return [...DEFAULT_REMINDER_MINUTES];
  const minutes: number[] = [];
  const seen = new Set<number>();
  for (const raw of value) {
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

const getPreviousOccurrence = (next: Date, recurrence: CountdownRecurrence): Date => {
  const prev = new Date(next);
  switch (recurrence) {
    case 'daily':
      prev.setDate(prev.getDate() - 1);
      break;
    case 'weekly':
      prev.setDate(prev.getDate() - 7);
      break;
    case 'monthly':
      prev.setMonth(prev.getMonth() - 1);
      break;
    case 'yearly':
      prev.setFullYear(prev.getFullYear() - 1);
      break;
    case 'once':
      break;
  }
  return prev;
};

const fireReminder = (args: { item: CountdownItem; minutes: number; notify: NotifyFn }): void => {
  const { item, minutes, notify } = args;

  const base =
    minutes === 0
      ? i18n.t('modals.countdown.reminderDue', { title: item.title })
      : i18n.t('modals.countdown.reminderBefore', { title: item.title, minutes });

  const message = item.note ? `${base}\n${item.note}` : base;
  const variant = minutes === 0 || minutes <= 10 ? 'warning' : 'info';
  notify(message, variant);

  if (typeof window === 'undefined') return;
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  try {
    const title = i18n.t('modals.countdown.reminderTitle');
    const body = item.note ? `${item.title}\n${item.note}` : item.title;
    // tag prevents some browsers from spamming identical notifications.
    new Notification(title, { body, tag: `countdown:${item.id}:${minutes}` });
  } catch {
    // ignore notification errors
  }
};

export const useCountdownReminders = (args: {
  countdowns: CountdownItem[];
  isAdmin: boolean;
  notify: NotifyFn;
}) => {
  const firedRef = useRef<ReminderState>({});
  const didLoadRef = useRef(false);

  // Load + prune stored state once
  useEffect(() => {
    if (didLoadRef.current) return;
    didLoadRef.current = true;

    const now = Date.now();
    try {
      const stored = safeLocalStorageGetItem(COUNTDOWN_REMINDER_STATE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as unknown;
        if (isReminderState(parsed)) {
          firedRef.current = pruneState(parsed, now);
        }
      }
    } catch {
      // ignore parse errors
    }

    scheduleLocalStorageSetItemLazy(
      COUNTDOWN_REMINDER_STATE_KEY,
      () => JSON.stringify(firedRef.current),
      PERSIST_OPTIONS,
    );
  }, []);

  // Reminder loop
  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      const visibleCountdowns = args.isAdmin
        ? args.countdowns
        : args.countdowns.filter((item) => !item.hidden);

      for (const item of visibleCountdowns) {
        const baseTarget = new Date(item.targetDate);
        if (!Number.isFinite(baseTarget.getTime())) continue;

        // Skip expired one-time countdowns.
        if (item.recurrence === 'once' && baseTarget.getTime() <= now) continue;

        const reminderMinutes = normalizeReminderMinutes(item.reminderMinutes);
        const nextTarget = getNextOccurrence(item.targetDate, item.recurrence);
        const nextTargetMs = nextTarget.getTime();

        for (const minutes of reminderMinutes) {
          if (minutes === 0) {
            const dueTimeMs =
              item.recurrence === 'once'
                ? baseTarget.getTime()
                : getPreviousOccurrence(nextTarget, item.recurrence).getTime();

            if (now < dueTimeMs || now - dueTimeMs > AT_TIME_GRACE_MS) continue;

            const key = `${item.id}:${dueTimeMs}:0`;
            if (firedRef.current[key]) continue;
            fireReminder({ item, minutes: 0, notify: args.notify });
            firedRef.current[key] = now;
            continue;
          }

          const triggerTimeMs = nextTargetMs - minutes * 60 * 1000;
          if (now < triggerTimeMs) continue;
          if (now >= nextTargetMs) continue;

          const key = `${item.id}:${nextTargetMs}:${minutes}`;
          if (firedRef.current[key]) continue;
          fireReminder({ item, minutes, notify: args.notify });
          firedRef.current[key] = now;
        }
      }

      firedRef.current = pruneState(firedRef.current, now);
      scheduleLocalStorageSetItemLazy(
        COUNTDOWN_REMINDER_STATE_KEY,
        () => JSON.stringify(firedRef.current),
        PERSIST_OPTIONS,
      );
    };

    const timer = setInterval(tick, CHECK_INTERVAL_MS);
    return () => {
      clearInterval(timer);
      flushScheduledLocalStorageWrite(COUNTDOWN_REMINDER_STATE_KEY);
    };
  }, [args.countdowns, args.isAdmin, args.notify]);
};
