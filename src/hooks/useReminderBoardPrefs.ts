import { useCallback, useEffect, useState } from 'react';
import { safeLocalStorageGetItem, safeLocalStorageSetItem } from '../utils/storage';

export type ReminderViewStyle = 'compact' | 'card' | 'ring' | 'flip';
export type ReminderTimerMode = 'cycle' | 'forward';
export type ReminderExpiredEffect = 'dim' | 'blink';
export type ReminderSortMode = 'remaining' | 'created' | 'custom';

const REMINDER_VIEW_STYLE_KEY = 'navhub_reminder_board_view_style_v1';
const REMINDER_TIMER_MODE_KEY = 'navhub_reminder_board_timer_mode_v1';
const REMINDER_EXPIRED_EFFECT_KEY = 'navhub_reminder_board_expired_effect_v1';
const REMINDER_SORT_MODE_KEY = 'navhub_reminder_board_sort_mode_v1';

const isReminderViewStyle = (v: string | null): v is ReminderViewStyle =>
  v === 'compact' || v === 'card' || v === 'ring' || v === 'flip';

const isReminderTimerMode = (v: string | null): v is ReminderTimerMode =>
  v === 'cycle' || v === 'forward';

const isReminderExpiredEffect = (v: string | null): v is ReminderExpiredEffect =>
  v === 'dim' || v === 'blink';

const isReminderSortMode = (v: string | null): v is ReminderSortMode =>
  v === 'remaining' || v === 'created' || v === 'custom';

export interface ReminderBoardPrefs {
  viewStyle: ReminderViewStyle;
  setViewStyle: (v: ReminderViewStyle) => void;
  timerMode: ReminderTimerMode;
  setTimerMode: (v: ReminderTimerMode) => void;
  expiredEffect: ReminderExpiredEffect;
  setExpiredEffect: (v: ReminderExpiredEffect) => void;
  sortMode: ReminderSortMode;
  setSortMode: (v: ReminderSortMode) => void;
}

let sharedState: {
  viewStyle: ReminderViewStyle;
  timerMode: ReminderTimerMode;
  expiredEffect: ReminderExpiredEffect;
  sortMode: ReminderSortMode;
} | null = null;

const listeners = new Set<() => void>();

function getSharedState() {
  if (!sharedState) {
    const storedStyle = safeLocalStorageGetItem(REMINDER_VIEW_STYLE_KEY);
    const storedMode = safeLocalStorageGetItem(REMINDER_TIMER_MODE_KEY);
    const storedEffect = safeLocalStorageGetItem(REMINDER_EXPIRED_EFFECT_KEY);
    const storedSortMode = safeLocalStorageGetItem(REMINDER_SORT_MODE_KEY);

    sharedState = {
      viewStyle: isReminderViewStyle(storedStyle) ? storedStyle : 'card',
      timerMode: isReminderTimerMode(storedMode) ? storedMode : 'cycle',
      expiredEffect: isReminderExpiredEffect(storedEffect) ? storedEffect : 'dim',
      sortMode: isReminderSortMode(storedSortMode) ? storedSortMode : 'remaining',
    };
  }
  return sharedState;
}

function updateSharedState(
  key: keyof NonNullable<typeof sharedState>,
  value: string,
  storageKey: string,
) {
  const state = getSharedState();
  if ((state as Record<string, string>)[key] === value) return;
  (state as Record<string, string>)[key] = value;
  safeLocalStorageSetItem(storageKey, value);
  listeners.forEach((fn) => {
    fn();
  });
}

export function useReminderBoardPrefs(): ReminderBoardPrefs {
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    const listener = () => forceUpdate((n) => n + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const state = getSharedState();

  const setViewStyle = useCallback((v: ReminderViewStyle) => {
    updateSharedState('viewStyle', v, REMINDER_VIEW_STYLE_KEY);
  }, []);

  const setTimerMode = useCallback((v: ReminderTimerMode) => {
    updateSharedState('timerMode', v, REMINDER_TIMER_MODE_KEY);
  }, []);

  const setExpiredEffect = useCallback((v: ReminderExpiredEffect) => {
    updateSharedState('expiredEffect', v, REMINDER_EXPIRED_EFFECT_KEY);
  }, []);

  const setSortMode = useCallback((v: ReminderSortMode) => {
    updateSharedState('sortMode', v, REMINDER_SORT_MODE_KEY);
  }, []);

  return {
    viewStyle: state.viewStyle,
    setViewStyle,
    timerMode: state.timerMode,
    setTimerMode,
    expiredEffect: state.expiredEffect,
    setExpiredEffect,
    sortMode: state.sortMode,
    setSortMode,
  };
}
