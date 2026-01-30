import type { NotifyFn } from '../types/ui';

export type { NotifyFn, ToastVariant } from '../types/ui';

export const ADMIN_EDIT_DISABLED_HINT = '用户模式不可编辑，请先输入 API 访问密码进入管理员模式。';

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
  const toastMessage = message ?? ADMIN_EDIT_DISABLED_HINT;
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
