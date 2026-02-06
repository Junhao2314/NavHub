import i18n from '../../config/i18n';

export type SyncErrorToastRecord = {
  message: string;
  at: number;
};

/**
 * 同步错误 toast 的“去噪”策略：
 *
 * - 自动同步（debounce / stats 批量）失败可能会在后台连续发生，如果每次都 toast 会非常打扰。
 * - 用户手动触发同步/拉取/冲突解决后发生的错误，应该立即提示（不做冷却）。
 *
 * useAppController 会在手动操作前更新 lastUserInitiatedAt，用于这里判定是否属于“用户刚刚触发”的窗口期。
 */

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

  // 窗口期内视为“用户发起”：相同错误不做冷却去重（用户会期待立刻反馈）。
  const isUserInitiated =
    args.lastUserInitiatedAt > 0 &&
    args.now - args.lastUserInitiatedAt < args.userInitiatedWindowMs;
  const cooldown = isUserInitiated ? 0 : args.cooldownMs;
  const lastToast = args.lastToast;
  // 仅对“相同错误文本”做去重：不同错误应提示（便于排查/反馈）。
  if (lastToast && lastToast.message === message && args.now - lastToast.at < cooldown) {
    return { toastMessage: null, nextToast: lastToast };
  }

  const nextToast: SyncErrorToastRecord = { message, at: args.now };
  return { toastMessage: i18n.t('sync.syncFailedWithMessage', { message }), nextToast };
};
