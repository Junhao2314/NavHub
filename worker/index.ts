/**
 * Y-Nav Cloudflare Worker 入口
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

const assetManifest = JSON.parse(manifestJSON);

// ============================================
// 类型定义
// ============================================

interface KVNamespaceInterface {
    get(key: string, type?: 'text' | 'json' | 'arrayBuffer' | 'stream'): Promise<any>;
    put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
    list(options?: { prefix?: string }): Promise<{ keys: Array<{ name: string; expiration?: number }> }>;
}

interface Env {
    YNAV_WORKER_KV: KVNamespaceInterface;
    SYNC_PASSWORD?: string;
    __STATIC_CONTENT: KVNamespace;
}

interface SyncMetadata {
    updatedAt: number;
    deviceId: string;
    version: number;
}

interface YNavSyncData {
    links: any[];
    categories: any[];
    searchConfig?: any;
    aiConfig?: any;
    siteSettings?: any;
    privateVault?: string;
    meta: SyncMetadata;
}

// ============================================
// 常量
// ============================================

const KV_MAIN_DATA_KEY = 'ynav:data';
const KV_BACKUP_PREFIX = 'ynav:backup:';
const BACKUP_TTL_SECONDS = 30 * 24 * 60 * 60;

// ============================================
// 辅助函数
// ============================================

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Sync-Password',
};

function jsonResponse(data: any, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
        }
    });
}

function isAuthenticated(request: Request, env: Env): boolean {
    if (!env.SYNC_PASSWORD || env.SYNC_PASSWORD.trim() === '') {
        return true;
    }
    const authHeader = request.headers.get('X-Sync-Password');
    return authHeader === env.SYNC_PASSWORD;
}

// ============================================
// API 处理函数
// ============================================

async function handleApiSync(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const action = url.searchParams.get('action');

    // CORS 预检
    if (request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    // 鉴权检查
    if (!isAuthenticated(request, env)) {
        return jsonResponse({
            success: false,
            error: 'Unauthorized: 密码错误或未配置'
        }, 401);
    }

    try {
        if (request.method === 'GET') {
            if (action === 'backups') {
                return await handleListBackups(env);
            }
            return await handleGet(env);
        }

        if (request.method === 'POST') {
            if (action === 'backup') {
                return await handleBackup(request, env);
            }
            if (action === 'restore') {
                return await handleRestore(request, env);
            }
            return await handlePost(request, env);
        }

        return jsonResponse({ success: false, error: 'Method not allowed' }, 405);
    } catch (error: any) {
        return jsonResponse({ success: false, error: error.message || '服务器错误' }, 500);
    }
}

async function handleGet(env: Env): Promise<Response> {
    const data = await env.YNAV_WORKER_KV.get(KV_MAIN_DATA_KEY, 'json');
    if (!data) {
        return jsonResponse({ success: true, data: null, message: '云端暂无数据' });
    }
    return jsonResponse({ success: true, data });
}

async function handlePost(request: Request, env: Env): Promise<Response> {
    const body = await request.json() as { data: YNavSyncData; expectedVersion?: number };

    if (!body.data) {
        return jsonResponse({ success: false, error: '缺少 data 字段' }, 400);
    }

    const existingData = await env.YNAV_WORKER_KV.get(KV_MAIN_DATA_KEY, 'json') as YNavSyncData | null;

    // 版本冲突检测
    if (existingData && body.expectedVersion !== undefined) {
        if (existingData.meta.version !== body.expectedVersion) {
            return jsonResponse({
                success: false,
                conflict: true,
                data: existingData,
                error: '版本冲突，云端数据已被其他设备更新'
            }, 409);
        }
    }

    const newVersion = existingData ? existingData.meta.version + 1 : 1;
    const dataToSave: YNavSyncData = {
        ...body.data,
        meta: {
            ...body.data.meta,
            updatedAt: Date.now(),
            version: newVersion
        }
    };

    await env.YNAV_WORKER_KV.put(KV_MAIN_DATA_KEY, JSON.stringify(dataToSave));
    return jsonResponse({ success: true, data: dataToSave, message: '同步成功' });
}

async function handleBackup(request: Request, env: Env): Promise<Response> {
    const body = await request.json() as { data: YNavSyncData };
    if (!body.data) {
        return jsonResponse({ success: false, error: '缺少 data 字段' }, 400);
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('.')[0];
    const backupKey = `${KV_BACKUP_PREFIX}${timestamp}`;

    await env.YNAV_WORKER_KV.put(backupKey, JSON.stringify(body.data), {
        expirationTtl: BACKUP_TTL_SECONDS
    });

    return jsonResponse({ success: true, backupKey, message: `备份成功: ${backupKey}` });
}

async function handleRestore(request: Request, env: Env): Promise<Response> {
    const body = await request.json() as { backupKey?: string; deviceId?: string };
    const backupKey = body.backupKey;

    if (!backupKey || !backupKey.startsWith(KV_BACKUP_PREFIX)) {
        return jsonResponse({ success: false, error: '无效的备份 key' }, 400);
    }

    const backupData = await env.YNAV_WORKER_KV.get(backupKey, 'json') as YNavSyncData | null;
    if (!backupData) {
        return jsonResponse({ success: false, error: '备份不存在或已过期' }, 404);
    }

    const existingData = await env.YNAV_WORKER_KV.get(KV_MAIN_DATA_KEY, 'json') as YNavSyncData | null;
    const now = Date.now();
    let rollbackKey: string | null = null;

    // 创建回滚点
    if (existingData) {
        const rollbackTimestamp = new Date(now).toISOString().replace(/[:.]/g, '-').split('.')[0];
        rollbackKey = `${KV_BACKUP_PREFIX}rollback-${rollbackTimestamp}`;
        await env.YNAV_WORKER_KV.put(rollbackKey, JSON.stringify({
            ...existingData,
            meta: { ...existingData.meta, updatedAt: now, deviceId: body.deviceId || existingData.meta.deviceId }
        }), { expirationTtl: BACKUP_TTL_SECONDS });
    }

    const newVersion = (existingData?.meta?.version ?? 0) + 1;
    const restoredData: YNavSyncData = {
        ...backupData,
        meta: {
            ...(backupData.meta || {}),
            updatedAt: now,
            deviceId: body.deviceId || backupData.meta?.deviceId || 'unknown',
            version: newVersion
        }
    };

    await env.YNAV_WORKER_KV.put(KV_MAIN_DATA_KEY, JSON.stringify(restoredData));
    return jsonResponse({ success: true, data: restoredData, rollbackKey });
}

async function handleListBackups(env: Env): Promise<Response> {
    const list = await env.YNAV_WORKER_KV.list({ prefix: KV_BACKUP_PREFIX });

    const backups = await Promise.all(list.keys.map(async (key) => {
        let meta: SyncMetadata | null = null;
        try {
            const data = await env.YNAV_WORKER_KV.get(key.name, 'json') as YNavSyncData | null;
            meta = data?.meta || null;
        } catch {
            meta = null;
        }
        return {
            key: key.name,
            timestamp: key.name.replace(KV_BACKUP_PREFIX, ''),
            expiration: key.expiration,
            deviceId: meta?.deviceId,
            updatedAt: meta?.updatedAt,
            version: meta?.version
        };
    }));

    return jsonResponse({ success: true, backups });
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

// ============================================
// 主入口
// ============================================

export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        const url = new URL(request.url);

        // API 路由
        if (url.pathname.startsWith('/api/sync')) {
            return handleApiSync(request, env);
        }

        // 静态资源
        return handleStaticAssets(request, env, ctx);
    }
};
