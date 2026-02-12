import i18n from 'i18next';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { initReactI18next } from 'react-i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import zhCN from '../../locales/zh-CN.json';
import type { Category, CountdownItem, LinkItem } from '../../types';
import LinkSections from './LinkSections';

const mocked = vi.hoisted(() => {
  return {
    storeState: {
      selectedCategory: 'all',
      searchQuery: '',
      searchMode: 'internal',
      siteSettings: { title: 'NavHub', cardStyle: 'simple' },
      isDarkMode: false,
    } as Record<string, unknown>,
    notify: vi.fn(),
  };
});

vi.mock('../../stores/useAppStore', () => ({
  useAppStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector(mocked.storeState),
}));

vi.mock('../ui/DialogProvider', () => ({
  useDialog: () => ({ notify: mocked.notify, confirm: vi.fn() }),
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

describe('LinkSections (Reminder Board)', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  const categories: Category[] = [{ id: 'cat-1', name: '分类 1', icon: 'Folder' }];

  const render = async (options: {
    pinnedLinks: LinkItem[];
    reminderBoardItems: CountdownItem[];
    isAdmin: boolean;
  }) => {
    if (!root) root = createRoot(container);
    await act(async () => {
      root?.render(
        <LinkSections
          linksCount={options.pinnedLinks.length}
          pinnedLinks={options.pinnedLinks}
          displayedLinks={[]}
          categories={categories}
          isSortingPinned={false}
          isSortingMode={null}
          isBatchEditMode={false}
          selectedLinksCount={0}
          selectedLinks={new Set()}
          sensors={[]}
          onPinnedDragEnd={vi.fn()}
          onDragEnd={vi.fn()}
          onToggleBatchEditMode={vi.fn()}
          onBatchDelete={vi.fn()}
          onBatchPin={vi.fn()}
          onSelectAll={vi.fn()}
          onBatchMove={vi.fn()}
          onAddLink={vi.fn()}
          onLinkOpen={vi.fn()}
          onLinkSelect={vi.fn()}
          onLinkContextMenu={vi.fn()}
          onLinkEdit={vi.fn()}
          isPrivateUnlocked={true}
          onPrivateUnlock={vi.fn(async () => true)}
          privateUnlockHint=""
          reminderBoardItems={options.reminderBoardItems}
          isAdmin={options.isAdmin}
          onReminderBoardAdd={vi.fn()}
          onReminderBoardEdit={vi.fn()}
          onReminderBoardDelete={vi.fn()}
          onReminderBoardToggleHidden={vi.fn()}
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

  it('renders reminder board when pinned links exist', async () => {
    const pinnedLinks: LinkItem[] = [
      {
        id: 'link-1',
        title: 'Pinned 1',
        url: 'https://example.com',
        categoryId: 'cat-1',
        createdAt: Date.now(),
        pinned: true,
      },
    ];

    await render({ pinnedLinks, reminderBoardItems: [], isAdmin: true });
    expect(container.textContent).toContain('备忘板');
  });

  it('does not render reminder board when no pinned links exist', async () => {
    await render({ pinnedLinks: [], reminderBoardItems: [], isAdmin: true });
    expect(container.textContent).not.toContain('备忘板');
  });

  it('shows overdue visibility toggle for admins in forward mode', async () => {
    localStorage.setItem('navhub_reminder_board_timer_mode_v1', 'forward');

    const pinnedLinks: LinkItem[] = [
      {
        id: 'link-1',
        title: 'Pinned 1',
        url: 'https://example.com',
        categoryId: 'cat-1',
        createdAt: Date.now(),
        pinned: true,
      },
    ];

    await render({ pinnedLinks, reminderBoardItems: [], isAdmin: true });

    const settingsButton = Array.from(container.querySelectorAll('button')).find((btn) =>
      btn.textContent?.includes('显示设置'),
    ) as HTMLButtonElement | undefined;
    expect(settingsButton).toBeTruthy();

    await act(async () => {
      settingsButton?.click();
    });

    expect(container.textContent).toContain('用户显示过期项');
  });
});
