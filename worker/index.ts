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
import {
  handleApiSyncRequest,
  type KVNamespaceInterface,
  type R2BucketInterface,
  type SyncApiEnv,
} from '../shared/syncApi';
import { resolveSyncCorsHeaders } from '../shared/syncApi/cors';

interface Env {
  YNAV_WORKER_KV: KVNamespaceInterface;
  YNAV_WORKER_R2?: R2BucketInterface;
  SYNC_PASSWORD?: string;
  SYNC_CORS_ALLOWED_ORIGINS?: string;
  AI_PROXY_ALLOWED_HOSTS?: string;
  AI_PROXY_ALLOWED_ORIGINS?: string;
  AI_PROXY_ALLOW_INSECURE_HTTP?: string;
  ASSETS: Fetcher;
}

function mergeVaryHeaderValue(prev: string | null, next: string): string {
  const prevParts = (prev ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  const nextParts = next
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  const merged = [...prevParts];
  for (const part of nextParts) {
    if (!merged.includes(part)) merged.push(part);
  }
  return merged.join(', ');
}

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

async function handleApiSync(request: Request, env: Env): Promise<Response> {
  const { headers: corsHeaders, allowed } = resolveSyncCorsHeaders(request, {
    corsAllowedOrigins: parseEnvList(env.SYNC_CORS_ALLOWED_ORIGINS),
  });
  if (!allowed) {
    return new Response(JSON.stringify({ success: false, error: 'CORS origin not allowed' }), {
      status: 403,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        ...corsHeaders,
      },
    });
  }

  // CORS 预检
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Cache-Control': 'no-store', ...corsHeaders } });
  }

  const syncEnv: SyncApiEnv = {
    YNAV_WORKER_KV: env.YNAV_WORKER_KV,
    YNAV_WORKER_R2: env.YNAV_WORKER_R2,
    SYNC_PASSWORD: env.SYNC_PASSWORD,
  };

  const response = await handleApiSyncRequest(request, syncEnv);
  return withCors(response, corsHeaders);
}

// ============================================
// AI Proxy (OpenAI Compatible)
// ============================================

function parseEnvList(value?: string): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

function parseEnvBool(value?: string): boolean {
  const normalized = (value || '').trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

async function handleApiAI(request: Request, env: Env): Promise<Response> {
  return handleApiAIRequest(request, {
    allowedBaseUrlHosts: parseEnvList(env.AI_PROXY_ALLOWED_HOSTS),
    corsAllowedOrigins: parseEnvList(env.AI_PROXY_ALLOWED_ORIGINS),
    allowInsecureHttp: parseEnvBool(env.AI_PROXY_ALLOW_INSECURE_HTTP),
  });
}

// ============================================
// 静态资源处理
// ============================================

async function handleStaticAssets(request: Request, env: Env): Promise<Response> {
  return env.ASSETS.fetch(request);
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

    // 静态资源
    return handleStaticAssets(request, env);
  },
};
