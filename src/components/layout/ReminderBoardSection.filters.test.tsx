import i18n from 'i18next';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { initReactI18next } from 'react-i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import zhCN from '../../locales/zh-CN.json';
import type { CountdownItem, CountdownLabelColor, SiteSettings } from '../../types';
import ReminderBoardSection from './ReminderBoardSection';

const mocked = vi.hoisted(() => {
  return {
    storeState: {
      siteSettings: {} as Partial<SiteSettings>,
      setSiteSettings: vi.fn(),
    } as Record<string, unknown>,
    notify: vi.fn(),
    confirm: vi.fn(),
  };
});

vi.mock('../../stores/useAppStore', () => ({
  useAppStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector(mocked.storeState),
}));

vi.mock('../ui/DialogProvider', () => ({
  useDialog: () => ({ notify: mocked.notify, confirm: mocked.confirm }),
}));

i18n.use(initReactI18next).init({
  lng: 'zh-CN',
  fallbackLng: 'zh-CN',
  resources: {
    'zh-CN': { translation: zhCN },
  },
  interpolation: {
    escapeValue: false,
  },
  react: {
    useSuspense: false,
  },
});

const BASE_NOW = new Date('2026-02-11T12:00:00.000Z');

const toDateInputValue = (date: Date): string => {
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const setNativeValue = (element: HTMLInputElement, value: string): void => {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  descriptor?.set?.call(element, value);
};

const setInputValue = (element: HTMLInputElement, value: string): void => {
  setNativeValue(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
};

const createItem = (args: {
  id: string;
  title: string;
  note?: string;
  offsetMs: number;
  labelColor?: CountdownLabelColor;
  tags?: string[];
  archivedAt?: number;
}): CountdownItem => {
  const target = new Date(BASE_NOW.getTime() + args.offsetMs);
  const iso = target.toISOString();
  return {
    id: args.id,
    title: args.title,
    note: args.note,
    tags: args.tags,
    labelColor: args.labelColor,
    archivedAt: args.archivedAt,
    targetDate: iso,
    targetLocal: iso.slice(0, 19),
    timeZone: 'UTC',
    precision: 'minute',
    rule: { kind: 'once' },
    createdAt: BASE_NOW.getTime(),
  };
};

describe('ReminderBoardSection (Filters)', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  const render = async (options: { items: CountdownItem[]; isAdmin?: boolean }) => {
    if (!root) root = createRoot(container);
    await act(async () => {
      root?.render(
        <ReminderBoardSection
          items={options.items}
          isAdmin={options.isAdmin ?? true}
          onAdd={vi.fn()}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
          onToggleHidden={vi.fn()}
        />,
      );
    });
  };

  beforeEach(() => {
    const testGlobals = globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    };
    testGlobals.IS_REACT_ACT_ENVIRONMENT = true;
    localStorage.clear();
    mocked.notify.mockReset();
    mocked.confirm.mockReset();
    mocked.storeState.siteSettings = {} as Partial<SiteSettings>;
    mocked.storeState.setSiteSettings = vi.fn();
    vi.useFakeTimers();
    vi.setSystemTime(BASE_NOW);
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
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('supports full-text search across title and note (AND tokens)', async () => {
    const items = [
      createItem({ id: 'a', title: 'Alpha Task', note: 'Hello world', offsetMs: 60_000 }),
      createItem({ id: 'b', title: 'Beta Task', note: 'foo bar', offsetMs: 60_000 }),
    ];

    await render({ items });

    const searchInput = container.querySelector(
      'input[aria-label="搜索备忘"]',
    ) as HTMLInputElement | null;
    expect(searchInput).toBeTruthy();

    await act(async () => {
      setInputValue(searchInput!, 'Alpha');
    });
    expect(container.textContent).toContain('Alpha Task');
    expect(container.textContent).not.toContain('Beta Task');

    await act(async () => {
      setInputValue(searchInput!, 'hello');
    });
    expect(container.textContent).toContain('Alpha Task');
    expect(container.textContent).not.toContain('Beta Task');

    await act(async () => {
      setInputValue(searchInput!, 'foo bar');
    });
    expect(container.textContent).toContain('Beta Task');
    expect(container.textContent).not.toContain('Alpha Task');

    await act(async () => {
      setInputValue(searchInput!, 'foo baz');
    });
    expect(container.textContent).not.toContain('Alpha Task');
    expect(container.textContent).not.toContain('Beta Task');
  });

  it('filters by status: active / expired / archived', async () => {
    const items = [
      createItem({ id: 'future', title: 'Future', offsetMs: 60 * 60 * 1000 }),
      createItem({ id: 'past', title: 'Past', offsetMs: -60 * 60 * 1000 }),
      createItem({
        id: 'arch',
        title: 'Archived',
        offsetMs: 60 * 60 * 1000,
        archivedAt: BASE_NOW.getTime(),
      }),
    ];

    await render({ items });

    const statusSelect = container.querySelector(
      'select[aria-label="状态"]',
    ) as HTMLSelectElement | null;
    expect(statusSelect).toBeTruthy();

    await act(async () => {
      statusSelect!.value = 'active';
      statusSelect!.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(container.textContent).toContain('Future');
    expect(container.textContent).not.toContain('Past');
    expect(container.textContent).not.toContain('Archived');

    await act(async () => {
      statusSelect!.value = 'expired';
      statusSelect!.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(container.textContent).toContain('Past');
    expect(container.textContent).not.toContain('Future');
    expect(container.textContent).not.toContain('Archived');

    await act(async () => {
      statusSelect!.value = 'archived';
      statusSelect!.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(container.textContent).toContain('Archived');
    expect(container.textContent).not.toContain('Future');
    expect(container.textContent).not.toContain('Past');
  });

  it('filters by label color (multi-select + none)', async () => {
    const items = [
      createItem({
        id: 'red',
        title: 'Red item',
        offsetMs: 60_000,
        labelColor: 'red',
      }),
      createItem({
        id: 'none',
        title: 'No color item',
        offsetMs: 60_000,
      }),
    ];

    await render({ items });

    const noneBtn = Array.from(container.querySelectorAll('button')).find(
      (btn) => btn.textContent?.trim() === '无',
    ) as HTMLButtonElement | undefined;
    expect(noneBtn).toBeTruthy();

    await act(async () => {
      noneBtn?.click();
    });
    expect(container.textContent).toContain('No color item');
    expect(container.textContent).not.toContain('Red item');

    const allBtn = Array.from(container.querySelectorAll('button')).find(
      (btn) => btn.textContent?.trim() === '全部',
    ) as HTMLButtonElement | undefined;
    expect(allBtn).toBeTruthy();

    await act(async () => {
      allBtn?.click();
    });

    const redBtn = container.querySelector('button[aria-label="红色"]') as HTMLButtonElement | null;
    expect(redBtn).toBeTruthy();

    await act(async () => {
      redBtn?.click();
    });
    expect(container.textContent).toContain('Red item');
    expect(container.textContent).not.toContain('No color item');
  });

  it('filters by date range (target/next occurrence)', async () => {
    const inRange = createItem({ id: 'in', title: 'In range', offsetMs: 2 * 24 * 60 * 60 * 1000 });
    const outRange = createItem({
      id: 'out',
      title: 'Out of range',
      offsetMs: 10 * 24 * 60 * 60 * 1000,
    });

    await render({ items: [inRange, outRange] });

    const fromInput = container.querySelector(
      'input[aria-label="开始日期"]',
    ) as HTMLInputElement | null;
    const toInput = container.querySelector(
      'input[aria-label="结束日期"]',
    ) as HTMLInputElement | null;
    expect(fromInput).toBeTruthy();
    expect(toInput).toBeTruthy();

    const dateValue = toDateInputValue(new Date(inRange.targetDate));

    await act(async () => {
      setInputValue(fromInput!, dateValue);
      setInputValue(toInput!, dateValue);
    });

    expect(container.textContent).toContain('In range');
    expect(container.textContent).not.toContain('Out of range');
  });
});
