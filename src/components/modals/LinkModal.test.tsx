import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import LinkModal from './LinkModal';
import type { AIConfig, Category, LinkItem } from '../../types';
import { generateLinkDescription, suggestCategory } from '../../services/geminiService';

const dialog = vi.hoisted(() => ({
  notify: vi.fn(),
  confirm: vi.fn(),
}));

vi.mock('../ui/DialogProvider', () => ({
  useDialog: () => dialog,
}));

vi.mock('../../services/geminiService', () => ({
  generateLinkDescription: vi.fn(),
  suggestCategory: vi.fn(),
}));

describe('LinkModal', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  const categories: Category[] = [
    { id: 'common', name: '常用推荐', icon: 'Star' },
    { id: 'design', name: '设计', icon: 'Palette' },
    { id: 'ai', name: 'AI', icon: 'Sparkles' },
  ];

  const aiConfig: AIConfig = {
    provider: 'openai',
    apiKey: 'test',
    baseUrl: 'https://example.com',
    model: 'gpt-test',
  };

  const renderModal = async (options?: { defaultCategoryId?: string; initialData?: LinkItem }) => {
    root = createRoot(container);
    await act(async () => {
      root?.render(
        <LinkModal
          isOpen
          onClose={vi.fn()}
          onSave={vi.fn()}
          categories={categories}
          aiConfig={aiConfig}
          defaultCategoryId={options?.defaultCategoryId}
          initialData={options?.initialData}
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
    vi.mocked(generateLinkDescription).mockReset();
    vi.mocked(suggestCategory).mockReset();
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
      root = null;
    }
    container.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('does not change category when AI assist fills description', async () => {
    vi.mocked(generateLinkDescription).mockResolvedValue('AI desc');
    vi.mocked(suggestCategory).mockResolvedValue('ai');

    const initialData = {
      id: '1',
      title: 'Example',
      url: 'https://example.com',
      categoryId: 'design',
      createdAt: 1,
    } satisfies LinkItem;

    await renderModal({ initialData });

    const beforeSelect = container.querySelector('select') as HTMLSelectElement | null;
    expect(beforeSelect).toBeTruthy();
    expect(beforeSelect!.value).toBe('design');

    const aiButton = Array.from(container.querySelectorAll('button')).find(button =>
      button.textContent?.includes('AI 填写'),
    ) as HTMLButtonElement | undefined;
    expect(aiButton).toBeTruthy();

    await act(async () => {
      aiButton!.click();
    });

    const description = container.querySelector('textarea[placeholder="添加描述..."]') as HTMLTextAreaElement | null;
    expect(description).toBeTruthy();
    expect(description!.value).toBe('AI desc');

    const afterSelect = container.querySelector('select') as HTMLSelectElement | null;
    expect(afterSelect).toBeTruthy();
    expect(afterSelect!.value).toBe('design');
  });
});
