import i18n from 'i18next';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { initReactI18next } from 'react-i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateLinkDescription, suggestCategory } from '../../services/geminiService';
import type { AIConfig, Category, LinkItem } from '../../types';
import LinkModal from './LinkModal';

// Initialize i18n for tests
i18n.use(initReactI18next).init({
  lng: 'zh-CN',
  fallbackLng: 'zh-CN',
  resources: {
    'zh-CN': {
      translation: {
        common: {
          delete: '删除',
          clear: '清空',
          upload: '上传',
          auto: '自动',
        },
        modals: {
          link: {
            addTitle: '添加新链接',
            editTitle: '编辑链接',
            batchMode: '批量模式',
            batchModeOn: '批量模式已开',
            pinned: '置顶',
            isPinned: '已置顶',
            recommend: '推荐',
            isRecommended: '已推荐',
            alreadyInCategory: '已在此分类',
            recommendHint: '加入「常用推荐」，同时保留原分类',
            alreadyRecommendedHint: '当前分类已是「常用推荐」',
            websiteTitle: '网站标题',
            websiteUrl: 'https://example.com',
            iconUrl: '图标链接...',
            autoFetchIcon: '自动获取',
            autoFetchOnInput: '输入链接时自动获取',
            supportedFormats: '支持 SVG, PNG, ICO',
            iconColor: '图标颜色',
            selectIconColor: '选择图标颜色',
            addDescription: '添加描述...',
            aiFill: 'AI 填写',
            aiGenerating: '生成中...',
            tags: '标签',
            tagInputPlaceholder: '输入标签，回车/逗号添加',
            existingTags: '已有标签',
            tagHint: '回车/逗号添加，Backspace 可快速删除最后一个标签',
            removeTag: '移除标签 {{tag}}',
            saveLink: '保存链接',
            saveSuccess: '保存成功',
            invalidUrl: '链接 URL 无效（仅支持 http/https）。',
            fetchIconFailed: '无法获取图标，请检查URL是否正确',
            readIconFailed: '读取图标文件失败',
            iconFormatError: '请上传 PNG、JPG、SVG 或 ICO 格式的图标',
            iconSizeError: '图标文件大小不能超过 2MB',
            configureAiFirst: '请先点击侧边栏左下角设置图标配置 AI API Key',
            aiRecommendCategory: 'AI 推荐分类：{{category}}（右上角可手动切换）',
            aiFillFailed: 'AI 生成失败，请检查 AI 配置或查看控制台日志',
          },
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

  const renderModal = async (options?: {
    defaultCategoryId?: string;
    initialData?: Partial<LinkItem>;
    onDelete?: (id: string) => void;
  }) => {
    root = createRoot(container);
    await act(async () => {
      root?.render(
        <LinkModal
          isOpen
          onClose={vi.fn()}
          onSave={vi.fn()}
          onDelete={options?.onDelete}
          categories={categories}
          aiConfig={aiConfig}
          defaultCategoryId={options?.defaultCategoryId}
          initialData={options?.initialData}
        />,
      );
    });
  };

  beforeEach(() => {
    const testGlobals = globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    };
    testGlobals.IS_REACT_ACT_ENVIRONMENT = true;
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

    await renderModal({ initialData, onDelete: vi.fn() });

    const beforeSelect = container.querySelector('select') as HTMLSelectElement | null;
    expect(beforeSelect).toBeTruthy();
    expect(beforeSelect!.value).toBe('design');

    const aiButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('AI 填写'),
    ) as HTMLButtonElement | undefined;
    expect(aiButton).toBeTruthy();

    await act(async () => {
      aiButton!.click();
    });

    const description = container.querySelector(
      'textarea[placeholder="添加描述..."]',
    ) as HTMLTextAreaElement | null;
    expect(description).toBeTruthy();
    expect(description!.value).toBe('AI desc');

    const afterSelect = container.querySelector('select') as HTMLSelectElement | null;
    expect(afterSelect).toBeTruthy();
    expect(afterSelect!.value).toBe('design');
  });
});
