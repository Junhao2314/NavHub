import { jsonResponse } from '../../utils/response';
import { isAdminRequest, isSyncProtected, requireAdminAccess } from '../auth';
import type { Env } from '../types';

// GET /api/sync?action=auth - 查询当前请求的权限状态
export async function handleAuth(request: Request, env: Env): Promise<Response> {
  const protectedMode = isSyncProtected(env);

  const providedPassword = (request.headers.get('X-Sync-Password') || '').trim();
  if (protectedMode && providedPassword) {
    const authError = await requireAdminAccess(request, env, { clearAttemptsOnSuccess: true });
    if (authError) return authError;
  }

  const isAdmin = isAdminRequest(request, env);

  return jsonResponse({
    success: true,
    protected: protectedMode,
    role: isAdmin ? 'admin' : 'user',
    canWrite: isAdmin,
  });
}

// POST /api/sync?action=login - 管理员登录（带错误次数限制）
export async function handleLogin(request: Request, env: Env): Promise<Response> {
  if (!isSyncProtected(env)) {
    return jsonResponse({
      success: true,
      protected: false,
      role: 'admin',
      canWrite: true,
    });
  }

  const authError = await requireAdminAccess(request, env, { clearAttemptsOnSuccess: true });
  if (authError) return authError;

  return jsonResponse({
    success: true,
    protected: true,
    role: 'admin',
    canWrite: true,
  });
}
