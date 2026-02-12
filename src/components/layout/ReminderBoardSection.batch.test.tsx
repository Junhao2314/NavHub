import i18n from 'i18next';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { initReactI18next } from 'react-i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import zhCN from '../../locales/zh-CN.json';
import type { CountdownItem, CountdownTagsBatchOp, SiteSettings } from '../../types';
import ReminderBoardSection from './ReminderBoardSection';

const mocked = vi.hoisted(() => {
  return {
    storeState: {
      siteSettings: { reminderBoardGroups: ['Work'] } as Partial<SiteSettings>,
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

const createItem = (args: { id: string; title: string; tags?: string[] }): CountdownItem => {
  const now = new Date('2026-02-11T00:00:00.000Z');
  return {
    id: args.id,
    title: args.title,
    targetDate: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
    targetLocal: '2026-02-11T09:00:00',
    timeZone: 'Asia/Shanghai',
    precision: 'minute',
    rule: { kind: 'once' },
    tags: args.tags,
    createdAt: now.getTime(),
  };
};

describe('ReminderBoardSection (Batch)', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  const render = async (options: {
    items: CountdownItem[];
    onBatchDelete?: (ids: string[]) => void;
    onBatchArchive?: (ids: string[]) => void;
    onBatchUpdateTags?: (ids: string[], op: CountdownTagsBatchOp) => void;
  }) => {
    if (!root) root = createRoot(container);
    await act(async () => {
      root?.render(
        <ReminderBoardSection
          items={options.items}
          isAdmin={true}
          onAdd={vi.fn()}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
          onToggleHidden={vi.fn()}
          onBatchDelete={options.onBatchDelete}
          onBatchArchive={options.onBatchArchive}
          onBatchUpdateTags={options.onBatchUpdateTags}
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
    mocked.storeState.siteSettings = { reminderBoardGroups: ['Work'] } as Partial<SiteSettings>;
    mocked.storeState.setSiteSettings = vi.fn();
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

  it('archives selected reminders in batch mode', async () => {
    const items = [createItem({ id: 'a', title: 'A' }), createItem({ id: 'b', title: 'B' })];
    const onBatchArchive = vi.fn();

    await render({ items, onBatchArchive, onBatchDelete: vi.fn(), onBatchUpdateTags: vi.fn() });

    const enterBtn = Array.from(container.querySelectorAll('button')).find((btn) =>
      btn.textContent?.includes('批量编辑'),
    ) as HTMLButtonElement | undefined;
    expect(enterBtn).toBeTruthy();

    await act(async () => {
      enterBtn?.click();
    });

    const selectA = container.querySelector(
      'button[aria-label="选择「A」"]',
    ) as HTMLButtonElement | null;
    expect(selectA).toBeTruthy();

    await act(async () => {
      selectA?.click();
    });

    expect(container.textContent).toContain('已选 1');

    const archiveBtn = container.querySelector(
      'button[aria-label="批量归档"]',
    ) as HTMLButtonElement | null;
    expect(archiveBtn).toBeTruthy();

    await act(async () => {
      archiveBtn?.click();
    });

    expect(onBatchArchive).toHaveBeenCalledWith(['a']);
  });

  it('deletes selected reminders in batch mode after confirmation', async () => {
    const items = [createItem({ id: 'a', title: 'A' }), createItem({ id: 'b', title: 'B' })];
    const onBatchDelete = vi.fn();
    mocked.confirm.mockResolvedValue(true);

    await render({ items, onBatchArchive: vi.fn(), onBatchDelete, onBatchUpdateTags: vi.fn() });

    const enterBtn = Array.from(container.querySelectorAll('button')).find((btn) =>
      btn.textContent?.includes('批量编辑'),
    ) as HTMLButtonElement | undefined;
    expect(enterBtn).toBeTruthy();

    await act(async () => {
      enterBtn?.click();
    });

    const selectA = container.querySelector(
      'button[aria-label="选择「A」"]',
    ) as HTMLButtonElement | null;
    expect(selectA).toBeTruthy();

    await act(async () => {
      selectA?.click();
    });

    const deleteBtn = container.querySelector(
      'button[aria-label="批量删除"]',
    ) as HTMLButtonElement | null;
    expect(deleteBtn).toBeTruthy();

    await act(async () => {
      deleteBtn?.click();
    });

    expect(mocked.confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '批量删除备忘',
        variant: 'danger',
      }),
    );
    expect(onBatchDelete).toHaveBeenCalledWith(['a']);
  });

  it('adds tag for selected reminders in batch mode', async () => {
    const items = [createItem({ id: 'a', title: 'A' }), createItem({ id: 'b', title: 'B' })];
    const onBatchUpdateTags = vi.fn();

    await render({ items, onBatchArchive: vi.fn(), onBatchDelete: vi.fn(), onBatchUpdateTags });

    const enterBtn = Array.from(container.querySelectorAll('button')).find((btn) =>
      btn.textContent?.includes('批量编辑'),
    ) as HTMLButtonElement | undefined;
    expect(enterBtn).toBeTruthy();

    await act(async () => {
      enterBtn?.click();
    });

    const selectA = container.querySelector(
      'button[aria-label="选择「A」"]',
    ) as HTMLButtonElement | null;
    expect(selectA).toBeTruthy();

    await act(async () => {
      selectA?.click();
    });

    const tagAddSelect = container.querySelector(
      'select[aria-label="批量添加标签"]',
    ) as HTMLSelectElement | null;
    expect(tagAddSelect).toBeTruthy();

    await act(async () => {
      if (!tagAddSelect) return;
      tagAddSelect.value = 'Work';
      tagAddSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(onBatchUpdateTags).toHaveBeenCalledWith(['a'], { kind: 'add', tag: 'Work' });
  });
});
