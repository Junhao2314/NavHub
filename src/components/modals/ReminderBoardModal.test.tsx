import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ReminderBoardModal from './ReminderBoardModal';

vi.mock('../../hooks/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
    i18n: { language: 'en-US' } as unknown,
    currentLanguage: 'en-US',
  }),
}));

describe('ReminderBoardModal', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  const renderModal = async () => {
    root = createRoot(container);
    await act(async () => {
      root?.render(
        <ReminderBoardModal
          isOpen
          onClose={vi.fn()}
          onSave={vi.fn()}
          isAdmin
          privacyGroupEnabled
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

  it('constrains height and uses inner scroll with a fixed footer', async () => {
    await renderModal();

    const card = container.querySelector('div.max-w-md');
    expect(card).toBeTruthy();
    expect(card?.className).toContain('max-h-[90vh]');
    expect(card?.className).toContain('flex');
    expect(card?.className).toContain('flex-col');

    const form = container.querySelector('form');
    expect(form).toBeTruthy();
    expect(form?.className).toContain('overflow-hidden');

    const scrollArea = container.querySelector('form > div.flex-1.overflow-y-auto');
    expect(scrollArea).toBeTruthy();

    const footer = container.querySelector('form > div.shrink-0');
    expect(footer).toBeTruthy();

    const submitButton = container.querySelector('button[type="submit"]');
    expect(submitButton).toBeTruthy();
    expect(footer?.contains(submitButton as Node)).toBe(true);
    expect(scrollArea?.contains(submitButton as Node)).toBe(false);
  });
});
