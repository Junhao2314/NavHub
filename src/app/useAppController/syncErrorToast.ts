export type SyncErrorToastRecord = {
  message: string;
  at: number;
};

export const USER_INITIATED_SYNC_WINDOW_MS = 6000;
export const SYNC_ERROR_TOAST_COOLDOWN_MS = 15000;

export const decideSyncErrorToast = (args: {
  error: string;
  now: number;
  lastUserInitiatedAt: number;
  lastToast: SyncErrorToastRecord | null;
  userInitiatedWindowMs: number;
  cooldownMs: number;
}): { toastMessage: string | null; nextToast: SyncErrorToastRecord | null } => {
  const message = (args.error || '').trim();
  if (!message) {
    return { toastMessage: null, nextToast: args.lastToast };
  }

  const isUserInitiated = args.lastUserInitiatedAt > 0
    && args.now - args.lastUserInitiatedAt < args.userInitiatedWindowMs;
  const cooldown = isUserInitiated ? 0 : args.cooldownMs;
  const lastToast = args.lastToast;
  if (lastToast && lastToast.message === message && args.now - lastToast.at < cooldown) {
    return { toastMessage: null, nextToast: lastToast };
  }

  const nextToast: SyncErrorToastRecord = { message, at: args.now };
  return { toastMessage: `同步失败：${message}`, nextToast };
};
