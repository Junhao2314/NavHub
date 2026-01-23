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

const assetManifest = JSON.parse(manifestJSON);

// ============================================
// 类型定义
// ============================================

interface KVNamespaceInterface {
    get(key: string, type?: 'text' | 'json' | 'arrayBuffer' | 'stream'): Promise<any>;
    put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
    delete(key: string): Promise<void>;
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
    browser?: string;
    os?: string;
    syncKind?: 'auto' | 'manual';
}

interface PrivacyConfig {
    groupEnabled?: boolean;
    passwordEnabled?: boolean;
    autoUnlockEnabled?: boolean;
    useSeparatePassword?: boolean;
}

interface NavHubSyncData {
    links: any[];
    categories: any[];
    searchConfig?: any;
    aiConfig?: any;
    siteSettings?: any;
    privateVault?: string;
    privacyConfig?: PrivacyConfig;
    meta: SyncMetadata;
    // New fields for sync-data-enhancement
    themeMode?: 'light' | 'dark' | 'system';
    encryptedSensitiveConfig?: string;  // Encrypted sensitive config (safe to return to non-admin)
    customFaviconCache?: any;
}

// ============================================
// 常量
// ============================================

const KV_MAIN_DATA_KEY = 'ynav:data';
const KV_BACKUP_PREFIX = 'ynav:backup:';
const BACKUP_TTL_SECONDS = 30 * 24 * 60 * 60;
const KV_SYNC_HISTORY_PREFIX = `${KV_BACKUP_PREFIX}history-`;
const MAX_SYNC_HISTORY = 30;

// Legacy keys (backwards compatibility for older deployments)
const LEGACY_KV_MAIN_DATA_KEY = 'navhub:data';
const LEGACY_KV_BACKUP_PREFIX = 'navhub:backup:';
const LEGACY_KV_SYNC_HISTORY_PREFIX = `${LEGACY_KV_BACKUP_PREFIX}history-`;

// Auth Security (brute-force protection)
const AUTH_MAX_FAILED_ATTEMPTS = 5;
const AUTH_LOCKOUT_SECONDS = 60 * 60; // 1 hour
const KV_AUTH_ATTEMPT_PREFIX = 'ynav:auth_attempt:';
const LEGACY_KV_AUTH_ATTEMPT_PREFIX = 'navhub:auth_attempt:';

interface AuthAttemptRecord {
    failedCount: number;
    lockedUntil: number; // timestamp (ms)
    updatedAt: number;
}

type BackupKind = 'auto' | 'manual' | 'rollback';

function getBackupKindFromKey(backupKey: string): BackupKind {
    const suffix = backupKey.startsWith(KV_BACKUP_PREFIX)
        ? backupKey.slice(KV_BACKUP_PREFIX.length)
        : backupKey.startsWith(LEGACY_KV_BACKUP_PREFIX)
            ? backupKey.slice(LEGACY_KV_BACKUP_PREFIX.length)
            : backupKey;
    if (suffix.startsWith('history-')) return 'auto';
    return suffix.startsWith('rollback-') ? 'rollback' : 'manual';
}

type SyncHistoryKind = 'auto' | 'manual';

function normalizeSyncKind(value: unknown): SyncHistoryKind {
    return value === 'manual' ? 'manual' : 'auto';
}

function buildHistoryKey(now: number): string {
    const timestamp = new Date(now).toISOString().replace(/[:.]/g, '-');
    return `${KV_SYNC_HISTORY_PREFIX}${timestamp}`;
}

async function trimSyncHistory(env: Env): Promise<void> {
    const list = await env.YNAV_WORKER_KV.list({ prefix: KV_SYNC_HISTORY_PREFIX });
    if (!list?.keys || list.keys.length <= MAX_SYNC_HISTORY) return;

    const sorted = [...list.keys].sort((a, b) => b.name.localeCompare(a.name));
    const toDelete = sorted.slice(MAX_SYNC_HISTORY);
    await Promise.all(toDelete.map((key) => env.YNAV_WORKER_KV.delete(key.name)));
}

async function saveSyncHistory(env: Env, data: NavHubSyncData, kind: SyncHistoryKind): Promise<string> {
    const key = buildHistoryKey(data.meta?.updatedAt || Date.now());
    const payload: NavHubSyncData = {
        ...data,
        meta: {
            ...data.meta,
            syncKind: kind
        }
    };
    await env.YNAV_WORKER_KV.put(key, JSON.stringify(payload));
    await trimSyncHistory(env);
    return key;
}

// ============================================
// 辅助函数
// ============================================

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

function isSyncProtected(env: Env): boolean {
    return !!(env.SYNC_PASSWORD && env.SYNC_PASSWORD.trim() !== '');
}

function getClientIp(request: Request): string {
    const cfIp = request.headers.get('CF-Connecting-IP');
    if (cfIp) return cfIp;

    const forwardedFor = request.headers.get('X-Forwarded-For');
    if (forwardedFor) return forwardedFor.split(',')[0]?.trim() || 'unknown';

    return 'unknown';
}

function getAuthAttemptKey(request: Request): string {
    return `${KV_AUTH_ATTEMPT_PREFIX}${getClientIp(request)}`;
}

function getLegacyAuthAttemptKey(request: Request): string {
    return `${LEGACY_KV_AUTH_ATTEMPT_PREFIX}${getClientIp(request)}`;
}

function isBackupKey(key: string): boolean {
    return key.startsWith(KV_BACKUP_PREFIX) || key.startsWith(LEGACY_KV_BACKUP_PREFIX);
}

function isSyncHistoryKey(key: string): boolean {
    return key.startsWith(KV_SYNC_HISTORY_PREFIX) || key.startsWith(LEGACY_KV_SYNC_HISTORY_PREFIX);
}

function stripBackupPrefix(key: string): string {
    if (key.startsWith(KV_BACKUP_PREFIX)) return key.slice(KV_BACKUP_PREFIX.length);
    if (key.startsWith(LEGACY_KV_BACKUP_PREFIX)) return key.slice(LEGACY_KV_BACKUP_PREFIX.length);
    return key;
}

async function getMainData(env: Env): Promise<NavHubSyncData | null> {
    const current = await env.YNAV_WORKER_KV.get(KV_MAIN_DATA_KEY, 'json') as NavHubSyncData | null;
    if (current) return current;

    const legacy = await env.YNAV_WORKER_KV.get(LEGACY_KV_MAIN_DATA_KEY, 'json') as NavHubSyncData | null;
    if (!legacy) return null;

    // Write-through migration (best-effort)
    try {
        await env.YNAV_WORKER_KV.put(KV_MAIN_DATA_KEY, JSON.stringify(legacy));
    } catch {
        // ignore migration failures
    }

    return legacy;
}

function mapLegacyBackupKeyToCurrent(key: string): string | null {
    if (!key.startsWith(LEGACY_KV_BACKUP_PREFIX)) return null;
    return `${KV_BACKUP_PREFIX}${key.slice(LEGACY_KV_BACKUP_PREFIX.length)}`;
}

async function migrateLegacyBackupKeys(env: Env): Promise<void> {
    const legacyList = await env.YNAV_WORKER_KV.list({ prefix: LEGACY_KV_BACKUP_PREFIX });
    const keys = legacyList?.keys || [];
    if (keys.length === 0) return;

    const nowSeconds = Math.floor(Date.now() / 1000);

    for (const key of keys) {
        const targetKey = mapLegacyBackupKeyToCurrent(key.name);
        if (!targetKey) continue;

        const existing = await env.YNAV_WORKER_KV.get(targetKey, 'text') as string | null;
        if (existing != null) continue;

        const legacyValue = await env.YNAV_WORKER_KV.get(key.name, 'text') as string | null;
        if (legacyValue == null) continue;

        if (typeof key.expiration === 'number') {
            const ttl = key.expiration - nowSeconds;
            if (ttl > 0) {
                await env.YNAV_WORKER_KV.put(targetKey, legacyValue, { expirationTtl: ttl });
            }
            continue;
        }

        await env.YNAV_WORKER_KV.put(targetKey, legacyValue);
    }
}

function buildLockoutResponse(lockedUntil: number, now: number): Response {
    const retryAfterSeconds = Math.max(1, Math.ceil((lockedUntil - now) / 1000));
    return jsonResponse({
        success: false,
        error: '登录失败：连续输入错误次数过多，请稍后重试',
        lockedUntil,
        retryAfterSeconds,
        maxAttempts: AUTH_MAX_FAILED_ATTEMPTS
    }, 429, { 'Retry-After': String(retryAfterSeconds) });
}

async function requireAdminAccess(request: Request, env: Env): Promise<Response | null> {
    if (!isSyncProtected(env)) {
        return null;
    }

    const providedPassword = (request.headers.get('X-Sync-Password') || '').trim();
    if (!providedPassword) {
        return jsonResponse({ success: false, error: 'Unauthorized: 管理员密码错误或未提供' }, 401);
    }

    const attemptKey = getAuthAttemptKey(request);
    const legacyAttemptKey = getLegacyAuthAttemptKey(request);
    const now = Date.now();
    let record = await env.YNAV_WORKER_KV.get(attemptKey, 'json') as AuthAttemptRecord | null;
    if (!record) {
        record = await env.YNAV_WORKER_KV.get(legacyAttemptKey, 'json') as AuthAttemptRecord | null;
    }

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

        await env.YNAV_WORKER_KV.put(attemptKey, JSON.stringify(nextRecord), {
            expirationTtl: AUTH_LOCKOUT_SECONDS
        });

        if (lockedUntil) {
            return buildLockoutResponse(lockedUntil, now);
        }

        return jsonResponse({
            success: false,
            error: '密码错误',
            remainingAttempts,
            maxAttempts: AUTH_MAX_FAILED_ATTEMPTS
        }, 401);
    }

    // 登录成功/密码正确，清空错误计数
    if (record) {
        await env.YNAV_WORKER_KV.delete(attemptKey);
        await env.YNAV_WORKER_KV.delete(legacyAttemptKey);
    }

    return null;
}

function isAdminRequest(request: Request, env: Env): boolean {
    if (!isSyncProtected(env)) {
        return true;
    }
    const authHeader = request.headers.get('X-Sync-Password');
    return authHeader === env.SYNC_PASSWORD;
}

/**
 * Sanitize sync data for non-admin users.
 * 
 * Security considerations:
 * - aiConfig.apiKey: Always set to empty string (sensitive, unencrypted)
 * - privateVault: Removed (contains encrypted private links, admin-only)
 * - encryptedSensitiveConfig: Preserved (already encrypted, safe to return)
 * - themeMode, customFaviconCache: Preserved (non-sensitive data)
 * 
 * @see Requirements 2.5: Non-admin users receive sanitized data with empty apiKey
 */
function sanitizePublicData(data: NavHubSyncData): NavHubSyncData {
    // Sanitize aiConfig: always set apiKey to empty string
    const safeAiConfig = data.aiConfig && typeof data.aiConfig === 'object'
        ? { ...data.aiConfig, apiKey: '' }
        : undefined;

    return {
        ...data,
        aiConfig: safeAiConfig,
        // privateVault contains encrypted private links - admin only
        privateVault: undefined,
        // privacyConfig is admin-only (contains privacy-group settings)
        privacyConfig: undefined,
        // encryptedSensitiveConfig is preserved (already encrypted, safe for non-admin)
        // themeMode is preserved (non-sensitive)
        // customFaviconCache is preserved (non-sensitive)
    };
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

    try {
        if (request.method === 'GET') {
            if (action === 'auth') {
                return await handleAuth(request, env);
            }
            if (action === 'backup') {
                const authError = await requireAdminAccess(request, env);
                if (authError) return authError;
                return await handleGetBackup(request, env);
            }
            if (action === 'backups') {
                const authError = await requireAdminAccess(request, env);
                if (authError) return authError;
                return await handleListBackups(env);
            }
            return await handleGet(request, env);
        }

        if (request.method === 'POST') {
            if (action === 'login') {
                return await handleLogin(request, env);
            }

            const authError = await requireAdminAccess(request, env);
            if (authError) return authError;
            if (action === 'backup') {
                return await handleBackup(request, env);
            }
            if (action === 'restore') {
                return await handleRestore(request, env);
            }
            return await handlePost(request, env);
        }

        if (request.method === 'DELETE') {
            if (action === 'backup') {
                const authError = await requireAdminAccess(request, env);
                if (authError) return authError;
                return await handleDeleteBackup(request, env);
            }
        }

        return jsonResponse({ success: false, error: 'Method not allowed' }, 405);
    } catch (error: any) {
        return jsonResponse({ success: false, error: error.message || '服务器错误' }, 500);
    }
}

async function handleAuth(request: Request, env: Env): Promise<Response> {
    const protectedMode = isSyncProtected(env);

    const providedPassword = (request.headers.get('X-Sync-Password') || '').trim();
    if (protectedMode && providedPassword) {
        const authError = await requireAdminAccess(request, env);
        if (authError) return authError;
    }

    const isAdmin = isAdminRequest(request, env);
    return jsonResponse({
        success: true,
        protected: protectedMode,
        role: isAdmin ? 'admin' : 'user',
        canWrite: isAdmin
    });
}

async function handleLogin(request: Request, env: Env): Promise<Response> {
    if (!isSyncProtected(env)) {
        return jsonResponse({ success: true, protected: false, role: 'admin', canWrite: true });
    }

    const authError = await requireAdminAccess(request, env);
    if (authError) return authError;

    return jsonResponse({ success: true, protected: true, role: 'admin', canWrite: true });
}

async function handleGet(request: Request, env: Env): Promise<Response> {
    const providedPassword = (request.headers.get('X-Sync-Password') || '').trim();
    if (isSyncProtected(env) && providedPassword) {
        const authError = await requireAdminAccess(request, env);
        if (authError) return authError;
    }

    const isAdmin = isAdminRequest(request, env);
    const data = await getMainData(env);
    if (!data) {
        return jsonResponse({ success: true, data: null, message: '云端暂无数据' });
    }
    return jsonResponse({
        success: true,
        role: isAdmin ? 'admin' : 'user',
        data: isAdmin ? data : sanitizePublicData(data)
    });
}

async function handlePost(request: Request, env: Env): Promise<Response> {
    const body = await request.json() as { data: NavHubSyncData; expectedVersion?: number; syncKind?: SyncHistoryKind };

    if (!body.data) {
        return jsonResponse({ success: false, error: '缺少 data 字段' }, 400);
    }

    const existingData = await getMainData(env);

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
    const now = Date.now();
    const kind = normalizeSyncKind(body.syncKind);
    const dataToSave: NavHubSyncData = {
        ...body.data,
        meta: {
            ...body.data.meta,
            updatedAt: now,
            version: newVersion,
            syncKind: kind
        }
    };

    await env.YNAV_WORKER_KV.put(KV_MAIN_DATA_KEY, JSON.stringify(dataToSave));

    let historyKey: string | null = null;
    try {
        historyKey = await saveSyncHistory(env, dataToSave, kind);
    } catch {
        historyKey = null;
    }

    return jsonResponse({ success: true, data: dataToSave, historyKey, message: '同步成功' });
}

async function handleBackup(request: Request, env: Env): Promise<Response> {
    const body = await request.json() as { data: NavHubSyncData };
    if (!body.data) {
        return jsonResponse({ success: false, error: '缺少 data 字段' }, 400);
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupKey = `${KV_BACKUP_PREFIX}${timestamp}`;

    await env.YNAV_WORKER_KV.put(backupKey, JSON.stringify(body.data), {
        expirationTtl: BACKUP_TTL_SECONDS
    });

    return jsonResponse({ success: true, backupKey, message: `备份成功: ${backupKey}` });
}

async function handleGetBackup(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const backupKey = url.searchParams.get('backupKey') || url.searchParams.get('key');

    if (!backupKey || !isBackupKey(backupKey)) {
        return jsonResponse({ success: false, error: '无效的备份 key' }, 400);
    }

    const backupData = await env.YNAV_WORKER_KV.get(backupKey, 'json') as NavHubSyncData | null;
    if (!backupData) {
        return jsonResponse({ success: false, error: '备份不存在或已过期' }, 404);
    }

    return jsonResponse({ success: true, data: backupData });
}

async function handleRestore(request: Request, env: Env): Promise<Response> {
    const body = await request.json() as { backupKey?: string; deviceId?: string };
    const backupKey = body.backupKey;

    if (!backupKey || !isBackupKey(backupKey)) {
        return jsonResponse({ success: false, error: '无效的备份 key' }, 400);
    }

    const backupData = await env.YNAV_WORKER_KV.get(backupKey, 'json') as NavHubSyncData | null;
    if (!backupData) {
        return jsonResponse({ success: false, error: '备份不存在或已过期' }, 404);
    }

    const existingData = await getMainData(env);
    const now = Date.now();
    let rollbackKey: string | null = null;

    // 创建回滚点
    if (existingData) {
        const rollbackTimestamp = new Date(now).toISOString().replace(/[:.]/g, '-');
        rollbackKey = `${KV_BACKUP_PREFIX}rollback-${rollbackTimestamp}`;
        await env.YNAV_WORKER_KV.put(rollbackKey, JSON.stringify({
            ...existingData,
            meta: { ...existingData.meta, updatedAt: now, deviceId: body.deviceId || existingData.meta.deviceId }
        }), { expirationTtl: BACKUP_TTL_SECONDS });
    }

    const newVersion = (existingData?.meta?.version ?? 0) + 1;
    const restoredData: NavHubSyncData = {
        ...backupData,
        meta: {
            ...(backupData.meta || {}),
            updatedAt: now,
            deviceId: body.deviceId || backupData.meta?.deviceId || 'unknown',
            version: newVersion,
            syncKind: 'manual'
        }
    };

    await env.YNAV_WORKER_KV.put(KV_MAIN_DATA_KEY, JSON.stringify(restoredData));
    try {
        await saveSyncHistory(env, restoredData, 'manual');
    } catch {
        // ignore history failures
    }
    return jsonResponse({ success: true, data: restoredData, rollbackKey });
}

async function handleListBackups(env: Env): Promise<Response> {
    await migrateLegacyBackupKeys(env);

    const currentData = await getMainData(env);
    const currentVersion = currentData?.meta?.version;

    const [list, legacyList] = await Promise.all([
        env.YNAV_WORKER_KV.list({ prefix: KV_SYNC_HISTORY_PREFIX }),
        env.YNAV_WORKER_KV.list({ prefix: LEGACY_KV_SYNC_HISTORY_PREFIX })
    ]);

    const currentKeyNames = new Set((list?.keys || []).map((k) => k.name));
    const legacyKeys = (legacyList?.keys || []).filter((k) => {
        const mapped = mapLegacyBackupKeyToCurrent(k.name);
        return !mapped || !currentKeyNames.has(mapped);
    });

    const allKeys = [
        ...(list?.keys || []),
        ...legacyKeys
    ];

    const backups = await Promise.all(allKeys.map(async (key) => {
        let meta: SyncMetadata | null = null;
        try {
            const data = await env.YNAV_WORKER_KV.get(key.name, 'json') as NavHubSyncData | null;
            meta = data?.meta || null;
        } catch {
            meta = null;
        }
        const kind = normalizeSyncKind(meta?.syncKind);
        return {
            key: key.name,
            timestamp: stripBackupPrefix(key.name),
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

    return jsonResponse({
        success: true,
        backups: backups
            .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
            .slice(0, MAX_SYNC_HISTORY)
    });
}

async function handleDeleteBackup(request: Request, env: Env): Promise<Response> {
    const body = await request.json() as { backupKey?: string };
    const backupKey = body.backupKey;

    if (!backupKey || !isBackupKey(backupKey)) {
        return jsonResponse({ success: false, error: '无效的备份 key' }, 400);
    }

    const backupData = await env.YNAV_WORKER_KV.get(backupKey, 'json') as NavHubSyncData | null;
    if (!backupData) {
        return jsonResponse({ success: false, error: '备份不存在或已过期' }, 404);
    }

    if (isSyncHistoryKey(backupKey)) {
        const currentData = await getMainData(env);
        const currentVersion = currentData?.meta?.version;
        if (typeof currentVersion === 'number' && backupData?.meta?.version === currentVersion) {
            return jsonResponse({ success: false, error: '当前记录不允许删除' }, 400);
        }
    }

    await env.YNAV_WORKER_KV.delete(backupKey);
    return jsonResponse({ success: true, message: '备份已删除' });
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
        if (url.pathname.startsWith('/api/ai')) {
            return handleApiAI(request);
        }

        // 静态资源
        return handleStaticAssets(request, env, ctx);
    }
};
