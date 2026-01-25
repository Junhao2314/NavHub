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
import { handleApiSyncRequest, type KVNamespaceInterface, type SyncApiEnv } from '../shared/syncApi';

const assetManifest = JSON.parse(manifestJSON);

interface Env {
    YNAV_WORKER_KV: KVNamespaceInterface;
    SYNC_PASSWORD?: string;
    __STATIC_CONTENT: KVNamespace;
}

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Sync-Password',
};

function jsonResponse(data: any, status = 200, extraHeaders: Record<string, string> = {}): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
            ...extraHeaders
        }
    });
}

function withCors(response: Response): Response {
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(corsHeaders)) {
        headers.set(key, value);
    }
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function handleApiSync(request: Request, env: Env): Promise<Response> {
    // CORS 预检
    if (request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    const syncEnv: SyncApiEnv = {
        YNAV_WORKER_KV: env.YNAV_WORKER_KV,
        SYNC_PASSWORD: env.SYNC_PASSWORD
    };

    const response = await handleApiSyncRequest(request, syncEnv);
    return withCors(response);
}

// ============================================
// AI Proxy (OpenAI Compatible)
// ============================================

const DEFAULT_OPENAI_COMPAT_BASE_URL = 'https://api.openai.com/v1';

type OpenAICompatibleUrls = {
    chatCompletionsUrl: string;
    modelsUrl: string;
};

function ensureHttpScheme(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) return trimmed;
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return `https://${trimmed}`;
}

function buildOpenAICompatibleUrls(baseUrlInput: string): OpenAICompatibleUrls {
    const normalizedInput = ensureHttpScheme(baseUrlInput) || DEFAULT_OPENAI_COMPAT_BASE_URL;

    let parsedUrl: URL;
    try {
        parsedUrl = new URL(normalizedInput);
    } catch {
        parsedUrl = new URL(DEFAULT_OPENAI_COMPAT_BASE_URL);
    }

    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        parsedUrl = new URL(DEFAULT_OPENAI_COMPAT_BASE_URL);
    }

    const origin = parsedUrl.origin;
    const pathname = parsedUrl.pathname.replace(/\/+$/, '');
    const base = `${origin}${pathname === '/' ? '' : pathname}`;

    if (pathname.endsWith('/chat/completions')) {
        return {
            chatCompletionsUrl: base,
            modelsUrl: base.replace(/\/chat\/completions$/, '/models')
        };
    }

    if (pathname.endsWith('/models')) {
        return {
            chatCompletionsUrl: base.replace(/\/models$/, '/chat/completions'),
            modelsUrl: base
        };
    }

    if (pathname.endsWith('/v1')) {
        return {
            chatCompletionsUrl: `${base}/chat/completions`,
            modelsUrl: `${base}/models`
        };
    }

    return {
        chatCompletionsUrl: `${base}/v1/chat/completions`,
        modelsUrl: `${base}/v1/models`
    };
}

async function handleApiAI(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const action = (url.searchParams.get('action') || 'chat').toLowerCase();

    // CORS 预检
    if (request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== 'POST') {
        return jsonResponse({ success: false, error: 'Method not allowed' }, 405);
    }

    let body: any = null;
    try {
        body = await request.json();
    } catch {
        body = null;
    }

    const baseUrlInput = typeof body?.baseUrl === 'string' ? body.baseUrl.trim() : '';
    const apiKey = typeof body?.apiKey === 'string' ? body.apiKey.trim() : '';
    if (!apiKey) {
        return jsonResponse({ success: false, error: 'Missing apiKey' }, 400);
    }

    const { chatCompletionsUrl, modelsUrl } = buildOpenAICompatibleUrls(baseUrlInput || DEFAULT_OPENAI_COMPAT_BASE_URL);

    if (action === 'models') {
        const upstream = await fetch(modelsUrl, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            }
        });
        const text = await upstream.text();
        return new Response(text, {
            status: upstream.status,
            headers: {
                ...corsHeaders,
                'Content-Type': upstream.headers.get('Content-Type') || 'application/json'
            }
        });
    }

    const payload = body?.payload;
    if (!payload || typeof payload !== 'object') {
        return jsonResponse({ success: false, error: 'Missing payload' }, 400);
    }

    const upstream = await fetch(chatCompletionsUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(payload)
    });

    const text = await upstream.text();
    return new Response(text, {
        status: upstream.status,
        headers: {
            ...corsHeaders,
            'Content-Type': upstream.headers.get('Content-Type') || 'application/json'
        }
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
            return handleApiAI(request);
        }

        // 静态资源
        return handleStaticAssets(request, env, ctx);
    }
};
