/**
 * NavHub Cloudflare Worker 入口
 *
 * 功能:
 * 1. 托管静态资源 (SPA)
 * 2. 处理 /api/sync 相关请求
 *
 * 此文件整合了 Workers Sites 和 API 逻辑
 */

import { getAssetFromKV, NotFoundError, MethodNotAllowedError } from '@cloudflare/kv-asset-handler';
// @ts-ignore - 这是 Workers Sites 自动生成的 manifest
import manifestJSON from '__STATIC_CONTENT_MANIFEST';
import { handleApiAIRequest } from '../shared/aiProxy';
import { handleApiSyncRequest, type KVNamespaceInterface, type SyncApiEnv } from '../shared/syncApi';
import { resolveSyncCorsHeaders } from '../shared/syncApi/cors';

const assetManifest = JSON.parse(manifestJSON);

interface Env {
    YNAV_WORKER_KV: KVNamespaceInterface;
    SYNC_PASSWORD?: string;
    SYNC_CORS_ALLOWED_ORIGINS?: string;
    AI_PROXY_ALLOWED_HOSTS?: string;
    AI_PROXY_ALLOWED_ORIGINS?: string;
    AI_PROXY_ALLOW_INSECURE_HTTP?: string;
    __STATIC_CONTENT: KVNamespace;
}

function withCors(response: Response, corsHeaders: Record<string, string>): Response {
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(corsHeaders)) {
        headers.set(key, value);
    }
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
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
                ...corsHeaders
            }
        });
    }

    // CORS 预检
    if (request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    const syncEnv: SyncApiEnv = {
        YNAV_WORKER_KV: env.YNAV_WORKER_KV,
        SYNC_PASSWORD: env.SYNC_PASSWORD
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

async function handleStaticAssets(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
        return await getAssetFromKV(
            {
                request,
                waitUntil: ctx.waitUntil.bind(ctx),
            },
            {
                ASSET_NAMESPACE: env.__STATIC_CONTENT,
                ASSET_MANIFEST: assetManifest,
            }
        );
    } catch (e) {
        if (e instanceof NotFoundError) {
            // SPA fallback: 返回 index.html
            const notFoundRequest = new Request(new URL('/index.html', request.url).toString(), request);
            return await getAssetFromKV(
                {
                    request: notFoundRequest,
                    waitUntil: ctx.waitUntil.bind(ctx),
                },
                {
                    ASSET_NAMESPACE: env.__STATIC_CONTENT,
                    ASSET_MANIFEST: assetManifest,
                }
            );
        } else if (e instanceof MethodNotAllowedError) {
            return new Response('Method Not Allowed', { status: 405 });
        }
        return new Response('Internal Error', { status: 500 });
    }
}

export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        const url = new URL(request.url);

        // API 路由
        if (url.pathname.startsWith('/api/sync')) {
            return handleApiSync(request, env);
        }
        if (url.pathname.startsWith('/api/ai')) {
            return handleApiAI(request, env);
        }

        // 静态资源
        return handleStaticAssets(request, env, ctx);
    }
};
