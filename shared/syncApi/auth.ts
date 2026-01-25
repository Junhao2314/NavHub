import type { Env } from './types';

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

export const isSyncProtected = (env: Env): boolean => {
    return !!(env.SYNC_PASSWORD && env.SYNC_PASSWORD.trim() !== '');
};

// 获取客户端 IP（用于按 IP 记录管理员密码错误次数，防止爆破）。
// 注意：本地/非 Cloudflare 环境可能取不到 IP（无 `CF-Connecting-IP` / `X-Forwarded-For`）会回退为 `unknown`，
// 从而导致所有请求共享同一个限速/锁定键（看起来像“全局锁”）。建议在反代/本地调试时补齐 `X-Forwarded-For`。
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

const getLegacyAuthAttemptKey = (request: Request): string => {
    return `${LEGACY_KV_AUTH_ATTEMPT_PREFIX}${getClientIp(request)}`;
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
export const requireAdminAccess = async (request: Request, env: Env): Promise<Response | null> => {
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
    const legacyAttemptKey = getLegacyAuthAttemptKey(request);
    const now = Date.now();
    let record = await env.YNAV_KV.get(attemptKey, 'json') as AuthAttemptRecord | null;
    if (!record) {
        record = await env.YNAV_KV.get(legacyAttemptKey, 'json') as AuthAttemptRecord | null;
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
        await env.YNAV_KV.delete(legacyAttemptKey);
    }

    return null;
};

// 辅助函数：验证管理员密码（允许“公开读 + 管理员写”模式）
export const isAdminRequest = (request: Request, env: Env): boolean => {
    // 未设置服务端密码时，默认所有请求均为管理员
    if (!isSyncProtected(env)) {
        return true;
    }

    const authHeader = (request.headers.get('X-Sync-Password') || '').trim();
    return authHeader === env.SYNC_PASSWORD;
};
