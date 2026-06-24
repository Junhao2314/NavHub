import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CountdownItem } from '../types';
import { COUNTDOWN_STORAGE_KEY } from '../utils/constants';
import { useCountdownStore } from './useCountdownStore';

const createCountdown = (overrides: Partial<CountdownItem> = {}): CountdownItem => ({
  id: 'countdown-1',
  title: 'Subscription countdown',
  targetDate: '2026-05-01T00:00:00.000Z',
  targetLocal: '2026-05-01T08:00:00',
  timeZone: 'Asia/Shanghai',
  precision: 'minute',
  rule: { kind: 'once' },
  reminderMinutes: [1440, 0],
  createdAt: 1,
  ...overrides,
});

describe('useCountdownStore', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  const renderStore = async () => {
    let api: ReturnType<typeof useCountdownStore> | null = null;

    function Harness() {
      const value = useCountdownStore();
      useEffect(() => {
        api = value;
      }, [value]);
      return null;
    }

    root = createRoot(container);
    await act(async () => {
      root?.render(<Harness />);
    });

    return {
      get: () => {
        if (!api) throw new Error('useCountdownStore not initialized');
        return api;
      },
    };
  };

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    localStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
      root = null;
    }
    container.remove();
    vi.restoreAllMocks();
  });

  it('restores subscription metadata from localStorage after refresh', async () => {
    const stored = [
      createCountdown({
        subscription: {
          enabled: true,
          name: 'Netflix',
          content: 'Renew this weekend',
        },
      }),
    ];
    localStorage.setItem(COUNTDOWN_STORAGE_KEY, JSON.stringify(stored));

    const { get } = await renderStore();

    expect(get().isLoaded).toBe(true);
    expect(get().countdowns[0]?.subscription).toEqual({
      enabled: true,
      name: 'Netflix',
      content: 'Renew this weekend',
    });
  });

  it('preserves subscription metadata when replacing countdowns from sync', async () => {
    const { get } = await renderStore();
    const synced = [
      createCountdown({
        id: 'sync-1',
        subscription: {
          enabled: true,
          name: 'Dropbox',
          content: 'Cloud sync payload',
        },
      }),
    ];

    act(() => {
      get().replaceCountdowns(synced);
    });

    expect(get().countdowns[0]?.subscription).toEqual({
      enabled: true,
      name: 'Dropbox',
      content: 'Cloud sync payload',
    });
  });
});
