import i18n from '../config/i18n';
import type { NotifyFn } from '../types/ui';

export type { NotifyFn, ToastVariant } from '../types/ui';

export const ADMIN_EDIT_DISABLED_HINT_KEY = 'admin.editDisabledHint';

type AdminAccessToastRecord = {
  message: string;
  at: number;
};

const ADMIN_ACCESS_TOAST_DEDUP_WINDOW_MS = 800;
let lastAdminAccessToast: AdminAccessToastRecord | null = null;

export const requireAdminAccess = (
  isAdmin: boolean,
  notify: NotifyFn,
  message?: string,
): boolean => {
  if (isAdmin) return true;
  const toastMessage = message ?? i18n.t(ADMIN_EDIT_DISABLED_HINT_KEY);
  const now = Date.now();
  if (
    lastAdminAccessToast &&
    lastAdminAccessToast.message === toastMessage &&
    now - lastAdminAccessToast.at < ADMIN_ACCESS_TOAST_DEDUP_WINDOW_MS
  ) {
    return false;
  }
  lastAdminAccessToast = { message: toastMessage, at: now };
  notify(toastMessage, 'warning');
  return false;
};
