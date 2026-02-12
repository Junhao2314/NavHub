import i18n from 'i18next';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { initReactI18next } from 'react-i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LinkItem } from '../../types';
import LinkCard from './LinkCard';

i18n.use(initReactI18next).init({
  lng: 'zh-CN',
  fallbackLng: 'zh-CN',
  resources: {
    'zh-CN': {
      translation: {
        linkCard: {
          invalidUrl: '链接 URL 无效（仅支持 http/https）。',
          alternativeUrls: '{{count}} 个备选网址',
          edit: '编辑',
          category: '分类：{{category}}',
        },
      },
    },
  },
  interpolation: {
    escapeValue: false,
  },
});

const dialog = vi.hoisted(() => ({
  notify: vi.fn(),
  confirm: vi.fn(),
}));

vi.mock('./DialogProvider', () => ({
  useDialog: () => dialog,
}));

describe('LinkCard', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  const render = async (link: LinkItem, options?: { isBatchEditMode?: boolean }) => {
    if (!root) root = createRoot(container);
    await act(async () => {
      root?.render(
        <LinkCard
          link={link}
          siteCardStyle="detailed"
          isDarkMode={false}
          isBatchEditMode={options?.isBatchEditMode ?? false}
          isSelected={false}
          onSelect={vi.fn()}
          onContextMenu={vi.fn()}
          onEdit={vi.fn()}
        />,
      );
    });
  };

  beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    dialog.notify.mockReset();
    dialog.confirm.mockReset();
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

  it('shows alternative URLs as chips and expands with +N', async () => {
    const link = {
      id: '1',
      title: 'Example',
      url: 'https://main.example.com',
      categoryId: 'design',
      createdAt: 1,
      alternativeUrls: [
        'https://a.example.com',
        'https://b.example.com/path',
        'https://c.example.com',
      ],
    } satisfies LinkItem;

    await render(link);

    expect(container.textContent).toContain('a.example.com');
    expect(container.textContent).toContain('b.example.com');
    expect(container.textContent).toContain('+1');
    expect(container.textContent).not.toContain('https://c.example.com');

    const moreButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('+1'),
    ) as HTMLButtonElement | undefined;

    expect(moreButton).toBeTruthy();

    await act(async () => {
      moreButton!.click();
    });

    expect(container.textContent).toContain('https://c.example.com');
    expect(dialog.notify).not.toHaveBeenCalled();
  });

  it('renders title as a link with normalized href when not batch mode', async () => {
    const link = {
      id: '1',
      title: 'GitHub',
      url: 'github.com',
      categoryId: 'dev',
      createdAt: 1,
    } satisfies LinkItem;

    await render(link);

    const anchor = container.querySelector('h3 a') as HTMLAnchorElement | null;
    expect(anchor).toBeTruthy();
    expect(anchor?.getAttribute('href')).toBe('https://github.com');
    expect(anchor?.getAttribute('target')).toBe('_blank');
  });

  it('sets drag data on title dragstart', async () => {
    const link = {
      id: '1',
      title: 'Example',
      url: 'https://example.com',
      categoryId: 'dev',
      createdAt: 1,
    } satisfies LinkItem;

    await render(link);

    const anchor = container.querySelector('h3 a') as HTMLAnchorElement | null;
    expect(anchor).toBeTruthy();

    const setData = vi.fn();
    const dataTransfer = {
      setData,
      effectAllowed: '',
    };

    const dragStartEvent = new Event('dragstart', { bubbles: true, cancelable: true }) as any;
    dragStartEvent.dataTransfer = dataTransfer;

    await act(async () => {
      anchor!.dispatchEvent(dragStartEvent);
    });

    expect(setData).toHaveBeenCalledWith('text/uri-list', 'https://example.com');
    expect(setData).toHaveBeenCalledWith('text/plain', 'https://example.com');
    expect(dataTransfer.effectAllowed).toBe('copyLink');
  });

  it('does not render title as a link in batch edit mode', async () => {
    const link = {
      id: '1',
      title: 'Example',
      url: 'https://example.com',
      categoryId: 'dev',
      createdAt: 1,
    } satisfies LinkItem;

    await render(link, { isBatchEditMode: true });

    expect(container.querySelector('h3 a')).toBeNull();
  });
});
