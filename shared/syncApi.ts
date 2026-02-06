/**
 * Cloudflare Pages Function: KV Sync API
 * Cloudflare Pages 函数：KV 同步 API
 *
 * Endpoints / 端点:
 *   GET  /api/sync         - Read cloud data / 读取云端数据
 *   POST /api/sync         - Write cloud data (with version check) / 写入云端数据（带版本校验）
 *   POST /api/sync/backup  - Create timestamped snapshot backup / 创建带时间戳的快照备份
 *   POST /api/sync/restore - Restore from backup and create rollback point / 从备份恢复并创建回滚点
 *   GET  /api/sync/backups - Get backup list / 获取备份列表
 *
 * Features / 功能:
 *   - Optimistic locking with version numbers / 使用版本号的乐观锁
 *   - Automatic backup on restore / 恢复时自动备份
 *   - Admin/user role-based access control / 基于管理员/用户角色的访问控制
 */

import { normalizeSyncApiEnv } from './syncApi/env';
import {
  handleAuth,
  handleBackup,
  handleDeleteBackup,
  handleGet,
  handleGetBackup,
  handleListBackups,
  handleLogin,
  handlePost,
  handleRestoreBackup,
} from './syncApi/handlers';
import type { Env, KVNamespaceInterface, R2BucketInterface, SyncApiEnv } from './syncApi/types';
import { getErrorMessage } from './utils/error';
import { mergeVaryHeaderValue } from './utils/httpHeaders';
import { jsonResponse } from './utils/response';

export type { KVNamespaceInterface, R2BucketInterface, SyncApiEnv };

const withSyncApiResponseHeaders = (response: Response): Response => {
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store');
  const vary = mergeVaryHeaderValue(headers.get('Vary'), 'X-Sync-Password');
  if (vary) {
    headers.set('Vary', vary);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

/**
 * Main entry point - follows Cloudflare Pages Function specification
 * 主入口 - 遵循 Cloudflare Pages Function 规范
 *
 * @param request - Incoming HTTP request / 传入的 HTTP 请求
 * @param env - Environment bindings (KV, R2, secrets) / 环境绑定（KV、R2、密钥）
 * @returns HTTP response / HTTP 响应
 */
export async function handleApiSyncRequest(request: Request, env: SyncApiEnv): Promise<Response> {
  // Normalize and validate environment bindings
  // 标准化并验证环境绑定
  let resolvedEnv: Env;
  try {
    resolvedEnv = normalizeSyncApiEnv(env);
  } catch (error: unknown) {
    return withSyncApiResponseHeaders(
      jsonResponse(
        {
          success: false,
          error: getErrorMessage(error, 'KV binding missing'),
        },
        { status: 500 },
      ),
    );
  }

  const url = new URL(request.url);
  const action = url.searchParams.get('action');

  // Route based on HTTP method and action parameter
  // 根据 HTTP 方法和 action 参数路由
  if (request.method === 'GET') {
    if (action === 'auth') {
      return withSyncApiResponseHeaders(await handleAuth(request, resolvedEnv));
    }
    if (action === 'backup') {
      return withSyncApiResponseHeaders(await handleGetBackup(request, resolvedEnv));
    }
    if (action === 'backups') {
      return withSyncApiResponseHeaders(await handleListBackups(request, resolvedEnv));
    }
    return withSyncApiResponseHeaders(await handleGet(request, resolvedEnv));
  }

  if (request.method === 'POST') {
    if (action === 'login') {
      return withSyncApiResponseHeaders(await handleLogin(request, resolvedEnv));
    }
    if (action === 'backup') {
      return withSyncApiResponseHeaders(await handleBackup(request, resolvedEnv));
    }
    if (action === 'restore') {
      return withSyncApiResponseHeaders(await handleRestoreBackup(request, resolvedEnv));
    }
    return withSyncApiResponseHeaders(await handlePost(request, resolvedEnv));
  }

  if (request.method === 'DELETE') {
    if (action === 'backup') {
      return withSyncApiResponseHeaders(await handleDeleteBackup(request, resolvedEnv));
    }
  }

  return withSyncApiResponseHeaders(
    jsonResponse(
      {
        success: false,
        error: 'Method not allowed',
      },
      { status: 405 },
    ),
  );
}
