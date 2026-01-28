import { getSyncPassword, isSyncAdminSession } from './secrets';

export const getSyncAuthHeaders = (): HeadersInit => {
  const password = getSyncPassword().trim();
  const isAdminSession = isSyncAdminSession();

  // 只有在“已通过管理员登录”的会话中才发送同步密码：
  // - 避免用户只是“设置了密码但还没验证”时误带上 header
  // - 减少密码暴露面（尤其是共享设备/临时 session）
  return {
    'Content-Type': 'application/json',
    ...(password && isAdminSession ? { 'X-Sync-Password': password } : {}),
  };
};
