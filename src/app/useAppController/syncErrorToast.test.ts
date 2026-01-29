import { describe, expect, it } from 'vitest';
import {
  decideSyncErrorToast,
  SYNC_ERROR_TOAST_COOLDOWN_MS,
  USER_INITIATED_SYNC_WINDOW_MS,
} from './syncErrorToast';

describe('syncErrorToast', () => {
  it('ignores empty errors', () => {
    const result = decideSyncErrorToast({
      error: '   ',
      now: 1000,
      lastUserInitiatedAt: 0,
      lastToast: null,
      userInitiatedWindowMs: USER_INITIATED_SYNC_WINDOW_MS,
      cooldownMs: SYNC_ERROR_TOAST_COOLDOWN_MS,
    });

    expect(result.toastMessage).toBeNull();
    expect(result.nextToast).toBeNull();
  });

  it('formats and records the first toast', () => {
    const now = 1234;
    const result = decideSyncErrorToast({
      error: '  网络错误  ',
      now,
      lastUserInitiatedAt: 0,
      lastToast: null,
      userInitiatedWindowMs: USER_INITIATED_SYNC_WINDOW_MS,
      cooldownMs: SYNC_ERROR_TOAST_COOLDOWN_MS,
    });

    expect(result.toastMessage).toBe('同步失败：网络错误');
    expect(result.nextToast).toEqual({ message: '网络错误', at: now });
  });

  it('throttles repeated background errors within cooldown window', () => {
    const first = decideSyncErrorToast({
      error: '网络错误',
      now: 1000,
      lastUserInitiatedAt: 0,
      lastToast: null,
      userInitiatedWindowMs: USER_INITIATED_SYNC_WINDOW_MS,
      cooldownMs: SYNC_ERROR_TOAST_COOLDOWN_MS,
    });

    const second = decideSyncErrorToast({
      error: '网络错误',
      now: 2000,
      lastUserInitiatedAt: 0,
      lastToast: first.nextToast,
      userInitiatedWindowMs: USER_INITIATED_SYNC_WINDOW_MS,
      cooldownMs: SYNC_ERROR_TOAST_COOLDOWN_MS,
    });

    expect(second.toastMessage).toBeNull();
    expect(second.nextToast).toEqual(first.nextToast);
  });

  it('does not throttle user-initiated errors', () => {
    const first = decideSyncErrorToast({
      error: '网络错误',
      now: 1000,
      lastUserInitiatedAt: 1000,
      lastToast: null,
      userInitiatedWindowMs: USER_INITIATED_SYNC_WINDOW_MS,
      cooldownMs: SYNC_ERROR_TOAST_COOLDOWN_MS,
    });

    const second = decideSyncErrorToast({
      error: '网络错误',
      now: 1200,
      lastUserInitiatedAt: 1200,
      lastToast: first.nextToast,
      userInitiatedWindowMs: USER_INITIATED_SYNC_WINDOW_MS,
      cooldownMs: SYNC_ERROR_TOAST_COOLDOWN_MS,
    });

    expect(first.toastMessage).toBe('同步失败：网络错误');
    expect(second.toastMessage).toBe('同步失败：网络错误');
  });

  it('shows toast when message changes even within cooldown window', () => {
    const first = decideSyncErrorToast({
      error: '网络错误',
      now: 1000,
      lastUserInitiatedAt: 0,
      lastToast: null,
      userInitiatedWindowMs: USER_INITIATED_SYNC_WINDOW_MS,
      cooldownMs: SYNC_ERROR_TOAST_COOLDOWN_MS,
    });

    const second = decideSyncErrorToast({
      error: '推送失败',
      now: 2000,
      lastUserInitiatedAt: 0,
      lastToast: first.nextToast,
      userInitiatedWindowMs: USER_INITIATED_SYNC_WINDOW_MS,
      cooldownMs: SYNC_ERROR_TOAST_COOLDOWN_MS,
    });

    expect(second.toastMessage).toBe('同步失败：推送失败');
  });
});
