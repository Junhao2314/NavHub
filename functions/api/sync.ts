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

// Cloudflare KV 类型定义 (内联，避免需要安装 @cloudflare/workers-types)
interface KVNamespaceInterface {
    get(key: string, type?: 'text' | 'json' | 'arrayBuffer' | 'stream'): Promise<any>;
    put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
    delete(key: string): Promise<void>;
    list(options?: { prefix?: string }): Promise<{ keys: Array<{ name: string; expiration?: number }> }>;
}

interface Env {
    YNAV_KV: KVNamespaceInterface;
    SYNC_PASSWORD?: string; // 可选的同步密码
}

interface SyncMetadata {
    updatedAt: number;
    deviceId: string;
    version: number;
    browser?: string;
    os?: string;
    syncKind?: 'auto' | 'manual';
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

// KV Key 常量
const KV_MAIN_DATA_KEY = 'ynav:data';
const KV_BACKUP_PREFIX = 'ynav:backup:';
const BACKUP_TTL_SECONDS = 30 * 24 * 60 * 60;
const KV_SYNC_HISTORY_PREFIX = `${KV_BACKUP_PREFIX}history-`;
const MAX_SYNC_HISTORY = 10;

// Auth Security (brute-force protection)
const AUTH_MAX_FAILED_ATTEMPTS = 5;
const AUTH_LOCKOUT_SECONDS = 60 * 60; // 1 hour
const KV_AUTH_ATTEMPT_PREFIX = 'ynav:auth_attempt:';

interface AuthAttemptRecord {
    failedCount: number;
    lockedUntil: number; // timestamp (ms)
    updatedAt: number;
}

type BackupKind = 'auto' | 'manual' | 'rollback';

const getBackupKindFromKey = (backupKey: string): BackupKind => {
    const suffix = backupKey.startsWith(KV_BACKUP_PREFIX)
        ? backupKey.slice(KV_BACKUP_PREFIX.length)
        : backupKey;
    if (suffix.startsWith('history-')) return 'auto';
    return suffix.startsWith('rollback-') ? 'rollback' : 'manual';
};

type SyncHistoryKind = 'auto' | 'manual';

const normalizeSyncKind = (value: unknown): SyncHistoryKind => {
    return value === 'manual' ? 'manual' : 'auto';
};

const buildHistoryKey = (now: number): string => {
    const timestamp = new Date(now).toISOString().replace(/[:.]/g, '-');
    return `${KV_SYNC_HISTORY_PREFIX}${timestamp}`;
};

const trimSyncHistory = async (env: Env): Promise<void> => {
    const list = await env.YNAV_KV.list({ prefix: KV_SYNC_HISTORY_PREFIX });
    if (!list?.keys || list.keys.length <= MAX_SYNC_HISTORY) return;

    const sorted = [...list.keys].sort((a, b) => b.name.localeCompare(a.name));
    const toDelete = sorted.slice(MAX_SYNC_HISTORY);
    await Promise.all(toDelete.map((key) => env.YNAV_KV.delete(key.name)));
};

const saveSyncHistory = async (env: Env, data: YNavSyncData, kind: SyncHistoryKind): Promise<string> => {
    const key = buildHistoryKey(data.meta?.updatedAt || Date.now());
    const payload: YNavSyncData = {
        ...data,
        meta: {
            ...data.meta,
            syncKind: kind
        }
    };
    await env.YNAV_KV.put(key, JSON.stringify(payload));
    await trimSyncHistory(env);
    return key;
};

const isSyncProtected = (env: Env): boolean => {
    return !!(env.SYNC_PASSWORD && env.SYNC_PASSWORD.trim() !== '');
};

const getClientIp = (request: Request): string => {
    const cfIp = request.headers.get('CF-Connecting-IP');
    if (cfIp) return cfIp;

    const forwardedFor = request.headers.get('X-Forwarded-For');
    if (forwardedFor) return forwardedFor.split(',')[0]?.trim() || 'unknown';

    return 'unknown';
};

const getAuthAttemptKey = (request: Request): string => {
    return `${KV_AUTH_ATTEMPT_PREFIX}${getClientIp(request)}`;
};

const buildLockoutResponse = (lockedUntil: number, now: number): Response => {
    const retryAfterSeconds = Math.max(1, Math.ceil((lockedUntil - now) / 1000));
    return new Response(JSON.stringify({
        success: false,
        error: '登录失败：连续输入错误次数过多，请稍后重试',
        lockedUntil,
        retryAfterSeconds,
        maxAttempts: AUTH_MAX_FAILED_ATTEMPTS
    }), {
        status: 429,
        headers: {
            'Content-Type': 'application/json',
            'Retry-After': String(retryAfterSeconds)
        }
    });
};

// 用于管理员接口的鉴权 + 错误次数限制
const requireAdminAccess = async (request: Request, env: Env): Promise<Response | null> => {
    if (!isSyncProtected(env)) {
        return null;
    }

    const providedPassword = (request.headers.get('X-Sync-Password') || '').trim();
    if (!providedPassword) {
        return new Response(JSON.stringify({
            success: false,
            error: 'Unauthorized: 管理员密码错误或未提供'
        }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }

    const attemptKey = getAuthAttemptKey(request);
    const now = Date.now();
    const record = await env.YNAV_KV.get(attemptKey, 'json') as AuthAttemptRecord | null;

    if (record?.lockedUntil && now < record.lockedUntil) {
        return buildLockoutResponse(record.lockedUntil, now);
    }

    if (providedPassword !== env.SYNC_PASSWORD) {
        const nextFailedCount = (record?.failedCount || 0) + 1;
        const remainingAttempts = Math.max(0, AUTH_MAX_FAILED_ATTEMPTS - nextFailedCount);
        const lockedUntil = nextFailedCount >= AUTH_MAX_FAILED_ATTEMPTS
            ? now + AUTH_LOCKOUT_SECONDS * 1000
            : 0;

        const nextRecord: AuthAttemptRecord = {
            failedCount: nextFailedCount,
            lockedUntil,
            updatedAt: now
        };

        await env.YNAV_KV.put(attemptKey, JSON.stringify(nextRecord), {
            expirationTtl: AUTH_LOCKOUT_SECONDS
        });

        if (lockedUntil) {
            return buildLockoutResponse(lockedUntil, now);
        }

        return new Response(JSON.stringify({
            success: false,
            error: '密码错误',
            remainingAttempts,
            maxAttempts: AUTH_MAX_FAILED_ATTEMPTS
        }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }

    // 登录成功/密码正确，清空错误计数
    if (record) {
        await env.YNAV_KV.delete(attemptKey);
    }

    return null;
};

// 辅助函数：验证管理员密码（允许“公开读 + 管理员写”模式）
const isAdminRequest = (request: Request, env: Env): boolean => {
    // 未设置服务端密码时，默认所有请求均为管理员
    if (!isSyncProtected(env)) {
        return true;
    }

    const authHeader = request.headers.get('X-Sync-Password');
    return authHeader === env.SYNC_PASSWORD;
};

const sanitizePublicData = (data: YNavSyncData): YNavSyncData => {
    const safeAiConfig = data.aiConfig && typeof data.aiConfig === 'object'
        ? { ...data.aiConfig, apiKey: '' }
        : undefined;

    return {
        ...data,
        aiConfig: safeAiConfig,
        privateVault: undefined
    };
};

// GET /api/sync - 读取云端数据
async function handleGet(request: Request, env: Env): Promise<Response> {
    const providedPassword = (request.headers.get('X-Sync-Password') || '').trim();
    if (isSyncProtected(env) && providedPassword) {
        const authError = await requireAdminAccess(request, env);
        if (authError) return authError;
    }

    const isAdmin = isAdminRequest(request, env);

    try {
        const data = await env.YNAV_KV.get(KV_MAIN_DATA_KEY, 'json') as YNavSyncData | null;

        if (!data) {
            return new Response(JSON.stringify({
                success: true,
                data: null,
                message: '云端暂无数据'
            }), {
                headers: { 'Content-Type': 'application/json' }
            });
        }

        return new Response(JSON.stringify({
            success: true,
            role: isAdmin ? 'admin' : 'user',
            data: isAdmin ? data : sanitizePublicData(data)
        }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error: any) {
        return new Response(JSON.stringify({
            success: false,
            error: error.message || '读取失败'
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

// GET /api/sync?action=auth - 查询当前请求的权限状态
async function handleAuth(request: Request, env: Env): Promise<Response> {
    const protectedMode = isSyncProtected(env);

    const providedPassword = (request.headers.get('X-Sync-Password') || '').trim();
    if (protectedMode && providedPassword) {
        const authError = await requireAdminAccess(request, env);
        if (authError) return authError;
    }

    const isAdmin = isAdminRequest(request, env);

    return new Response(JSON.stringify({
        success: true,
        protected: protectedMode,
        role: isAdmin ? 'admin' : 'user',
        canWrite: isAdmin
    }), { headers: { 'Content-Type': 'application/json' } });
}

// POST /api/sync?action=login - 管理员登录（带错误次数限制）
async function handleLogin(request: Request, env: Env): Promise<Response> {
    if (!isSyncProtected(env)) {
        return new Response(JSON.stringify({
            success: true,
            protected: false,
            role: 'admin',
            canWrite: true
        }), { headers: { 'Content-Type': 'application/json' } });
    }

    const authError = await requireAdminAccess(request, env);
    if (authError) return authError;

    return new Response(JSON.stringify({
        success: true,
        protected: true,
        role: 'admin',
        canWrite: true
    }), { headers: { 'Content-Type': 'application/json' } });
}

// POST /api/sync - 写入云端数据
async function handlePost(request: Request, env: Env): Promise<Response> {
    const authError = await requireAdminAccess(request, env);
    if (authError) return authError;

    try {
        const body = await request.json() as {
            data: YNavSyncData;
            expectedVersion?: number;  // 用于乐观锁校验
            syncKind?: SyncHistoryKind;
        };

        if (!body.data) {
            return new Response(JSON.stringify({
                success: false,
                error: '缺少 data 字段'
            }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // 获取当前云端数据进行版本校验
        const existingData = await env.YNAV_KV.get(KV_MAIN_DATA_KEY, 'json') as YNavSyncData | null;

        // 如果云端有数据且客户端提供了期望版本号，进行冲突检测
        if (existingData && body.expectedVersion !== undefined) {
            if (existingData.meta.version !== body.expectedVersion) {
                // 版本冲突，返回云端数据让客户端处理
                return new Response(JSON.stringify({
                    success: false,
                    conflict: true,
                    data: existingData,
                    error: '版本冲突，云端数据已被其他设备更新'
                }), {
                    status: 409,
                    headers: { 'Content-Type': 'application/json' }
                });
            }
        }

        // 确保 meta 信息完整
        const newVersion = existingData ? existingData.meta.version + 1 : 1;
        const now = Date.now();
        const kind = normalizeSyncKind(body.syncKind);
        const dataToSave: YNavSyncData = {
            ...body.data,
            meta: {
                ...body.data.meta,
                updatedAt: now,
                version: newVersion,
                syncKind: kind
            }
        };

        // 写入 KV
        await env.YNAV_KV.put(KV_MAIN_DATA_KEY, JSON.stringify(dataToSave));

        let historyKey: string | null = null;
        try {
            historyKey = await saveSyncHistory(env, dataToSave, kind);
        } catch {
            historyKey = null;
        }

        return new Response(JSON.stringify({
            success: true,
            data: dataToSave,
            historyKey,
            message: '同步成功'
        }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error: any) {
        return new Response(JSON.stringify({
            success: false,
            error: error.message || '写入失败'
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

// POST /api/sync (with action=backup) - 创建快照备份
async function handleBackup(request: Request, env: Env): Promise<Response> {
    const authError = await requireAdminAccess(request, env);
    if (authError) return authError;

    try {
        const body = await request.json() as { data: YNavSyncData };

        if (!body.data) {
            return new Response(JSON.stringify({
                success: false,
                error: '缺少 data 字段'
            }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // 生成时间戳格式的备份 key
        const now = new Date();
        const timestamp = now.toISOString().replace(/[:.]/g, '-');
        const backupKey = `${KV_BACKUP_PREFIX}${timestamp}`;

        // 写入备份
        await env.YNAV_KV.put(backupKey, JSON.stringify(body.data), {
            // 备份保留 30 天
            expirationTtl: BACKUP_TTL_SECONDS
        });

        return new Response(JSON.stringify({
            success: true,
            backupKey,
            message: `备份成功: ${backupKey}`
        }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error: any) {
        return new Response(JSON.stringify({
            success: false,
            error: error.message || '备份失败'
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

// POST /api/sync (with action=restore) - 从备份恢复并创建回滚点
async function handleRestoreBackup(request: Request, env: Env): Promise<Response> {
    const authError = await requireAdminAccess(request, env);
    if (authError) return authError;

    try {
        const body = await request.json() as { backupKey?: string; deviceId?: string };
        const backupKey = body.backupKey;

        if (!backupKey || !backupKey.startsWith(KV_BACKUP_PREFIX)) {
            return new Response(JSON.stringify({
                success: false,
                error: '无效的备份 key'
            }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const backupData = await env.YNAV_KV.get(backupKey, 'json') as YNavSyncData | null;
        if (!backupData) {
            return new Response(JSON.stringify({
                success: false,
                error: '备份不存在或已过期'
            }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const existingData = await env.YNAV_KV.get(KV_MAIN_DATA_KEY, 'json') as YNavSyncData | null;
        const now = Date.now();
        let rollbackKey: string | null = null;

        if (existingData) {
            const rollbackTimestamp = new Date(now).toISOString().replace(/[:.]/g, '-');
            rollbackKey = `${KV_BACKUP_PREFIX}rollback-${rollbackTimestamp}`;
            const rollbackData: YNavSyncData = {
                ...existingData,
                meta: {
                    ...existingData.meta,
                    updatedAt: now,
                    deviceId: body.deviceId || existingData.meta.deviceId
                }
            };
            await env.YNAV_KV.put(rollbackKey, JSON.stringify(rollbackData), {
                expirationTtl: BACKUP_TTL_SECONDS
            });
        }

        const newVersion = (existingData?.meta?.version ?? 0) + 1;
        const restoredData: YNavSyncData = {
            ...backupData,
            meta: {
                ...(backupData.meta || {}),
                updatedAt: now,
                deviceId: body.deviceId || backupData.meta?.deviceId || 'unknown',
                version: newVersion,
                syncKind: 'manual'
            }
        };

        await env.YNAV_KV.put(KV_MAIN_DATA_KEY, JSON.stringify(restoredData));

        try {
            await saveSyncHistory(env, restoredData, 'manual');
        } catch {
            // ignore history failures
        }

        return new Response(JSON.stringify({
            success: true,
            data: restoredData,
            rollbackKey
        }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error: any) {
        return new Response(JSON.stringify({
            success: false,
            error: error.message || '恢复失败'
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

// GET /api/sync (with action=backup) - 获取备份数据（用于导出）
async function handleGetBackup(request: Request, env: Env): Promise<Response> {
    const authError = await requireAdminAccess(request, env);
    if (authError) return authError;

    const url = new URL(request.url);
    const backupKey = url.searchParams.get('backupKey') || url.searchParams.get('key');

    if (!backupKey || !backupKey.startsWith(KV_BACKUP_PREFIX)) {
        return new Response(JSON.stringify({
            success: false,
            error: '无效的备份 key'
        }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    try {
        const backupData = await env.YNAV_KV.get(backupKey, 'json') as YNavSyncData | null;
        if (!backupData) {
            return new Response(JSON.stringify({
                success: false,
                error: '备份不存在或已过期'
            }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        return new Response(JSON.stringify({
            success: true,
            data: backupData
        }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error: any) {
        return new Response(JSON.stringify({
            success: false,
            error: error.message || '读取备份失败'
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

// GET /api/sync (with action=backups) - 获取备份列表
async function handleListBackups(request: Request, env: Env): Promise<Response> {
    const authError = await requireAdminAccess(request, env);
    if (authError) return authError;

    try {
        const currentData = await env.YNAV_KV.get(KV_MAIN_DATA_KEY, 'json') as YNavSyncData | null;
        const currentVersion = currentData?.meta?.version;

        const list = await env.YNAV_KV.list({ prefix: KV_SYNC_HISTORY_PREFIX });

        const backups = await Promise.all(list.keys.map(async (key: { name: string; expiration?: number }) => {
            let meta: SyncMetadata | null = null;
            try {
                const data = await env.YNAV_KV.get(key.name, 'json') as YNavSyncData | null;
                meta = data?.meta || null;
            } catch {
                meta = null;
            }

            const kind = normalizeSyncKind(meta?.syncKind);

            return {
                key: key.name,
                timestamp: key.name.replace(KV_BACKUP_PREFIX, ''),
                expiration: key.expiration,
                kind,
                deviceId: meta?.deviceId,
                updatedAt: meta?.updatedAt,
                version: meta?.version,
                browser: meta?.browser,
                os: meta?.os,
                isCurrent: typeof currentVersion === 'number' && meta?.version === currentVersion
            };
        }));

        return new Response(JSON.stringify({
            success: true,
            backups: backups
                .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
                .slice(0, MAX_SYNC_HISTORY)
        }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error: any) {
        return new Response(JSON.stringify({
            success: false,
            error: error.message || '获取备份列表失败'
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

// DELETE /api/sync (with action=backup) - 删除指定备份
async function handleDeleteBackup(request: Request, env: Env): Promise<Response> {
    const authError = await requireAdminAccess(request, env);
    if (authError) return authError;

    try {
        const body = await request.json() as { backupKey?: string };
        const backupKey = body.backupKey;

        if (!backupKey || !backupKey.startsWith(KV_BACKUP_PREFIX)) {
            return new Response(JSON.stringify({
                success: false,
                error: '无效的备份 key'
            }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // 检查备份是否存在
        const backupData = await env.YNAV_KV.get(backupKey, 'json') as YNavSyncData | null;
        if (!backupData) {
            return new Response(JSON.stringify({
                success: false,
                error: '备份不存在或已过期'
            }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        if (backupKey.startsWith(KV_SYNC_HISTORY_PREFIX)) {
            const currentData = await env.YNAV_KV.get(KV_MAIN_DATA_KEY, 'json') as YNavSyncData | null;
            const currentVersion = currentData?.meta?.version;
            if (typeof currentVersion === 'number' && backupData?.meta?.version === currentVersion) {
                return new Response(JSON.stringify({
                    success: false,
                    error: '当前记录不允许删除'
                }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' }
                });
            }
        }

        // 删除备份
        await env.YNAV_KV.delete(backupKey);

        return new Response(JSON.stringify({
            success: true,
            message: '备份已删除'
        }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error: any) {
        return new Response(JSON.stringify({
            success: false,
            error: error.message || '删除失败'
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

// 主入口 - 使用 Cloudflare Pages Function 规范
export const onRequest = async (context: { request: Request; env: Env }) => {
    const { request, env } = context;
    const url = new URL(request.url);
    const action = url.searchParams.get('action');

    // 根据请求方法和 action 参数路由
    if (request.method === 'GET') {
        if (action === 'auth') {
            return handleAuth(request, env);
        }
        if (action === 'backup') {
            return handleGetBackup(request, env);
        }
        if (action === 'backups') {
            return handleListBackups(request, env);
        }
        return handleGet(request, env);
    }

    if (request.method === 'POST') {
        if (action === 'login') {
            return handleLogin(request, env);
        }
        if (action === 'backup') {
            return handleBackup(request, env);
        }
        if (action === 'restore') {
            return handleRestoreBackup(request, env);
        }
        return handlePost(request, env);
    }

    if (request.method === 'DELETE') {
        if (action === 'backup') {
            return handleDeleteBackup(request, env);
        }
    }

    return new Response(JSON.stringify({
        success: false,
        error: 'Method not allowed'
    }), {
        status: 405,
        headers: { 'Content-Type': 'application/json' }
    });
};
