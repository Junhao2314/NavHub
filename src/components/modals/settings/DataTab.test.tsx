import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CountdownItem } from '../../../types';
import DataTab from './DataTab';

const exportService = vi.hoisted(() => ({
  generateIcsContent: vi.fn(() => 'BEGIN:VCALENDAR'),
  downloadIcsFile: vi.fn(),
}));

vi.mock('../../../hooks/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, payload?: { count?: number }) => {
      if (key === 'modals.countdown.exportIcsHint') {
        return `${key}:${payload?.count ?? 0}`;
      }
      return key;
    },
    i18n: { language: 'en-US' },
    currentLanguage: 'en-US',
  }),
}));

vi.mock('../../../services/exportService', async () => {
  const actual = await vi.importActual<typeof import('../../../services/exportService')>(
    '../../../services/exportService',
  );
  return {
    ...actual,
    generateIcsContent: exportService.generateIcsContent,
    downloadIcsFile: exportService.downloadIcsFile,
  };
});

const createCountdownItem = (overrides: Partial<CountdownItem> = {}): CountdownItem => ({
  id: 'countdown-id',
  title: 'Reminder',
  targetDate: '2026-02-14T09:00:00.000Z',
  targetLocal: '2026-02-14T17:00:00',
  timeZone: 'Asia/Shanghai',
  precision: 'minute',
  rule: { kind: 'once' },
  createdAt: 1700000000000,
  ...overrides,
});

describe('DataTab export ics', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  const baseProps = {
    onOpenImport: vi.fn(),
    onClose: vi.fn(),
    onRestoreBackup: vi.fn(async () => true),
    onDeleteBackup: vi.fn(async () => true),
    onSyncPasswordChange: vi.fn(),
    onVerifySyncPassword: vi.fn(async () => ({ success: true, role: 'user' as const })),
    syncRole: 'user' as const,
    isSyncProtected: false,
    useSeparatePrivacyPassword: false,
    onSwitchPrivacyMode: vi.fn(async () => true),
    privacyGroupEnabled: true,
    onTogglePrivacyGroup: vi.fn(),
    privacyPasswordEnabled: true,
    isTogglingPrivacyPassword: false,
    onTogglePrivacyPassword: vi.fn(),
    privacyAutoUnlockEnabled: false,
    onTogglePrivacyAutoUnlock: vi.fn(),
    isPrivateUnlocked: false,
    links: [],
    categories: [],
    countdownItems: [] as CountdownItem[],
    onDeleteLink: vi.fn(),
    onNavigateToCategory: vi.fn(),
  };

  const renderDataTab = async (props: Partial<typeof baseProps> = {}) => {
    root = createRoot(container);
    await act(async () => {
      root?.render(<DataTab {...baseProps} {...props} />);
    });
  };

  const getExportButton = () => {
    return Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('modals.countdown.exportIcs'),
    ) as HTMLButtonElement | undefined;
  };

  beforeEach(() => {
    const testGlobals = globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    };
    testGlobals.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    exportService.generateIcsContent.mockClear();
    exportService.downloadIcsFile.mockClear();
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
      root = null;
    }
    container.remove();
  });

  it('disables export when user only has locked private reminders', async () => {
    await renderDataTab({
      syncRole: 'user',
      isPrivateUnlocked: false,
      countdownItems: [createCountdownItem({ id: 'private-1', isPrivate: true })],
    });

    const button = getExportButton();
    expect(button).toBeTruthy();
    expect(button?.disabled).toBe(true);

    await act(async () => {
      button?.click();
    });

    expect(exportService.generateIcsContent).not.toHaveBeenCalled();
    expect(exportService.downloadIcsFile).not.toHaveBeenCalled();
  });

  it('exports only non-private reminders for locked non-admin users', async () => {
    const publicItem = createCountdownItem({ id: 'public-1', title: 'Public reminder' });
    const privateItem = createCountdownItem({
      id: 'private-1',
      title: 'Private reminder',
      isPrivate: true,
    });

    await renderDataTab({
      syncRole: 'user',
      isPrivateUnlocked: false,
      countdownItems: [publicItem, privateItem],
    });

    const button = getExportButton();
    expect(button).toBeTruthy();
    expect(button?.disabled).toBe(false);

    await act(async () => {
      button?.click();
    });

    expect(exportService.generateIcsContent).toHaveBeenCalledTimes(1);
    expect(exportService.generateIcsContent).toHaveBeenCalledWith([publicItem]);
    expect(exportService.downloadIcsFile).toHaveBeenCalledWith('BEGIN:VCALENDAR');
  });

  it('keeps private reminders exportable for admins', async () => {
    const privateItem = createCountdownItem({ id: 'private-1', isPrivate: true });

    await renderDataTab({
      syncRole: 'admin',
      isPrivateUnlocked: false,
      countdownItems: [privateItem],
    });

    const button = getExportButton();
    expect(button).toBeTruthy();
    expect(button?.disabled).toBe(false);

    await act(async () => {
      button?.click();
    });

    expect(exportService.generateIcsContent).toHaveBeenCalledWith([privateItem]);
  });
});
