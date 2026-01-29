/**
 * Cloudflare Pages Function: KV 同步 API
 *
 * 端点:
 *   GET  /api/sync         - 读取云端数据
 *   POST /api/sync         - 写入云端数据 (带版本校验)
 *   POST /api/sync/backup  - 创建带时间戳的快照备份
 *   POST /api/sync/restore - 从备份恢复并创建回滚点
 *   GET  /api/sync/backups - 获取备份列表
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

export type { KVNamespaceInterface, R2BucketInterface, SyncApiEnv };

// 主入口 - 使用 Cloudflare Pages Function 规范
export async function handleApiSyncRequest(request: Request, env: SyncApiEnv): Promise<Response> {
  let resolvedEnv: Env;
  try {
    resolvedEnv = normalizeSyncApiEnv(env);
  } catch (error: unknown) {
    return new Response(
      JSON.stringify({
        success: false,
        error: getErrorMessage(error, 'KV binding missing'),
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  const url = new URL(request.url);
  const action = url.searchParams.get('action');

  // 根据请求方法和 action 参数路由
  if (request.method === 'GET') {
    if (action === 'auth') {
      return handleAuth(request, resolvedEnv);
    }
    if (action === 'backup') {
      return handleGetBackup(request, resolvedEnv);
    }
    if (action === 'backups') {
      return handleListBackups(request, resolvedEnv);
    }
    return handleGet(request, resolvedEnv);
  }

  if (request.method === 'POST') {
    if (action === 'login') {
      return handleLogin(request, resolvedEnv);
    }
    if (action === 'backup') {
      return handleBackup(request, resolvedEnv);
    }
    if (action === 'restore') {
      return handleRestoreBackup(request, resolvedEnv);
    }
    return handlePost(request, resolvedEnv);
  }

  if (request.method === 'DELETE') {
    if (action === 'backup') {
      return handleDeleteBackup(request, resolvedEnv);
    }
  }

  return new Response(
    JSON.stringify({
      success: false,
      error: 'Method not allowed',
    }),
    {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    },
  );
}
