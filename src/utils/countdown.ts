import type { CountdownRecurrence } from '../types';

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

/**
 * Calculate the next occurrence for a recurring countdown.
 * For 'once', returns the original date.
 * For recurring types, advances the date until it's in the future.
 */
export const getNextOccurrence = (targetDate: string, recurrence: CountdownRecurrence): Date => {
  const target = new Date(targetDate);
  if (recurrence === 'once') return target;

  const now = new Date();
  const result = new Date(target);

  while (result <= now) {
    switch (recurrence) {
      case 'daily':
        result.setDate(result.getDate() + 1);
        break;
      case 'weekly':
        result.setDate(result.getDate() + 7);
        break;
      case 'monthly':
        result.setMonth(result.getMonth() + 1);
        break;
      case 'yearly':
        result.setFullYear(result.getFullYear() + 1);
        break;
    }
  }

  return result;
};

/**
 * Calculate time remaining until the target date.
 */
export const getCountdownRemaining = (
  targetDate: string,
  recurrence: CountdownRecurrence,
): CountdownRemaining => {
  const target = getNextOccurrence(targetDate, recurrence);
  const now = new Date();
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
