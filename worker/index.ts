/**
 * NavHub Cloudflare Worker 入口
 *
 * 功能:
 * 1. 托管静态资源 (SPA)
 * 2. 处理 /api/sync 相关请求
 *
 * 此文件整合了 Workers Assets 和 API 逻辑
 */

import { handleApiAIRequest } from '../shared/aiProxy';
import { processSubscriptionNotifications } from '../shared/notifications';
import {
  handleApiSyncRequest,
  type KVNamespaceInterface,
  type R2BucketInterface,
  type SyncApiEnv,
} from '../shared/syncApi';
import { resolveSyncCorsHeaders } from '../shared/syncApi/cors';
import { getMainData } from '../shared/syncApi/kv';
import { parseEnvBool, parseEnvList } from '../shared/utils/env';
import { mergeVaryHeaderValue } from '../shared/utils/httpHeaders';
import { applySecurityHeaders } from '../shared/utils/securityHeaders';
import { decryptSensitiveConfig } from '../src/utils/sensitiveConfig';

interface Env {
  NAVHUB_WORKER_KV: KVNamespaceInterface;
  NAVHUB_WORKER_R2?: R2BucketInterface;
  SYNC_PASSWORD?: string;
  SUBSCRIPTION_NOTIFICATION_LOOKBACK_HOURS?: string;
  SYNC_CORS_ALLOWED_ORIGINS?: string;
  AI_PROXY_ALLOWED_HOSTS?: string;
  AI_PROXY_ALLOWED_ORIGINS?: string;
  AI_PROXY_ALLOW_INSECURE_HTTP?: string;
  SECURITY_HEADERS_CSP_MODE?: string;
  SECURITY_HEADERS_HSTS_PRELOAD?: string;
  ASSETS: Fetcher;
}

const DEFAULT_SUBSCRIPTION_NOTIFICATION_LOOKBACK_HOURS = 8;
const BLOCKED_DEV_ONLY_PATHS = new Set(['/sync-diagnostic.html', '/__internal/sync-diagnostic']);

const parseNotificationLookbackMs = (rawHours?: string): number => {
  const parsedHours = Number(rawHours);
  const hours =
    Number.isFinite(parsedHours) && parsedHours > 0
      ? parsedHours
      : DEFAULT_SUBSCRIPTION_NOTIFICATION_LOOKBACK_HOURS;
  return hours * 60 * 60 * 1000;
};

function withCors(response: Response, corsHeaders: Record<string, string>): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders)) {
    if (key.toLowerCase() === 'vary') {
      const merged = mergeVaryHeaderValue(headers.get('Vary'), value);
      if (merged) {
        headers.set('Vary', merged);
      }
      continue;
    }
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function handleBlockedDevOnlyPath(): Response {
  return new Response('Not Found', {
    status: 404,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow, noarchive',
    },
  });
}

function withWorkerSecurityHeaders(
  request: Request,
  response: Response,
  env: Env,
  context: 'api' | 'static',
): Response {
  return applySecurityHeaders(response, {
    context,
    cspMode: env.SECURITY_HEADERS_CSP_MODE,
    enableHstsPreload: parseEnvBool(env.SECURITY_HEADERS_HSTS_PRELOAD),
    request,
  });
}

async function handleApiSync(request: Request, env: Env): Promise<Response> {
  const { headers: corsHeaders, allowed } = resolveSyncCorsHeaders(request, {
    corsAllowedOrigins: parseEnvList(env.SYNC_CORS_ALLOWED_ORIGINS),
  });
  if (!allowed) {
    return withWorkerSecurityHeaders(
      request,
      new Response(JSON.stringify({ success: false, error: 'CORS origin not allowed' }), {
        status: 403,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
          ...corsHeaders,
        },
      }),
      env,
      'api',
    );
  }

  // CORS 预检
  if (request.method === 'OPTIONS') {
    return withWorkerSecurityHeaders(
      request,
      new Response(null, { headers: { 'Cache-Control': 'no-store', ...corsHeaders } }),
      env,
      'api',
    );
  }

  const syncEnv: SyncApiEnv = {
    NAVHUB_WORKER_KV: env.NAVHUB_WORKER_KV,
    NAVHUB_WORKER_R2: env.NAVHUB_WORKER_R2,
    SYNC_PASSWORD: env.SYNC_PASSWORD,
  };

  const response = await handleApiSyncRequest(request, syncEnv);
  return withWorkerSecurityHeaders(request, withCors(response, corsHeaders), env, 'api');
}

// ============================================
// AI Proxy (OpenAI Compatible)
// ============================================

async function handleApiAI(request: Request, env: Env): Promise<Response> {
  return withWorkerSecurityHeaders(
    request,
    await handleApiAIRequest(request, {
      allowedBaseUrlHosts: parseEnvList(env.AI_PROXY_ALLOWED_HOSTS),
      corsAllowedOrigins: parseEnvList(env.AI_PROXY_ALLOWED_ORIGINS),
      allowInsecureHttp: parseEnvBool(env.AI_PROXY_ALLOW_INSECURE_HTTP),
    }),
    env,
    'api',
  );
}

// ============================================
// 静态资源处理
// ============================================

async function handleStaticAssets(request: Request, env: Env): Promise<Response> {
  return withWorkerSecurityHeaders(request, await env.ASSETS.fetch(request), env, 'static');
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // API 路由
    if (url.pathname.startsWith('/api/sync')) {
      return handleApiSync(request, env);
    }
    if (url.pathname.startsWith('/api/ai')) {
      return handleApiAI(request, env);
    }
    if (BLOCKED_DEV_ONLY_PATHS.has(url.pathname)) {
      return withWorkerSecurityHeaders(request, handleBlockedDevOnlyPath(), env, 'static');
    }

    // 静态资源
    return handleStaticAssets(request, env);
  },

  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
    if (!env.SYNC_PASSWORD?.trim()) {
      console.warn('[subscription-notifications] SYNC_PASSWORD is required; skip cron');
      return;
    }

    const syncEnv = {
      NAVHUB_KV: env.NAVHUB_WORKER_KV,
      NAVHUB_R2: env.NAVHUB_WORKER_R2,
      SYNC_PASSWORD: env.SYNC_PASSWORD,
    };
    const data = await getMainData(syncEnv);
    if (!data?.siteSettings?.subscriptionNotifications?.enabled) return;

    let sensitive = null;
    if (data.encryptedSensitiveConfig) {
      try {
        sensitive = await decryptSensitiveConfig(env.SYNC_PASSWORD, data.encryptedSensitiveConfig);
      } catch (error) {
        console.warn('[subscription-notifications] failed to decrypt sensitive config', error);
        return;
      }
    }

    const result = await processSubscriptionNotifications({
      env: syncEnv,
      data,
      sensitive,
      lookbackMs: parseNotificationLookbackMs(env.SUBSCRIPTION_NOTIFICATION_LOOKBACK_HOURS),
    });
    for (const warning of result.warnings) {
      console.warn(`[subscription-notifications] ${warning}`);
    }
  },
};
