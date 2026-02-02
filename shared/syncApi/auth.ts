import type { Env } from './types';

// Auth Security (brute-force protection)
const AUTH_MAX_FAILED_ATTEMPTS = 5;
const AUTH_MAX_FAILED_ATTEMPTS_UNKNOWN_IP = 3; // 未知 IP 更严格
const AUTH_MAX_FAILED_ATTEMPTS_NO_FINGERPRINT = 2; // 完全无指纹请求最严格
const AUTH_LOCKOUT_SECONDS = 60 * 60; // 1 hour
const KV_AUTH_ATTEMPT_PREFIX = 'navhub:auth_attempt:';
const AUTH_ATTEMPT_HASH_PREFIX = 'sha256:';
const CLIENT_KEY_SEED_MAX_LENGTH = 256;

// IP 来源类型
type IpSourceType = 'cf' | 'forwarded' | 'unknown';

// In-memory best-effort cache: avoid doing KV.delete on every successful admin request.
// Most requests will never see a failed-attempt record, so deleting every time is wasteful.
// When we observe a failed/locked record, we note it for up to AUTH_LOCKOUT_SECONDS, and only then clear on success.
const recentAuthAttemptExpiresAtByKey = new Map<string, number>();

const noteRecentAuthAttemptKey = (attemptKey: string, now: number): void => {
  recentAuthAttemptExpiresAtByKey.set(attemptKey, now + AUTH_LOCKOUT_SECONDS * 1000);
  // Best-effort cleanup to keep the map bounded in long-lived isolates.
  if (recentAuthAttemptExpiresAtByKey.size > 1024) {
    for (const [key, expiresAt] of recentAuthAttemptExpiresAtByKey) {
      if (expiresAt <= now) recentAuthAttemptExpiresAtByKey.delete(key);
    }
  }
};

const shouldClearAuthAttemptsOnSuccess = (attemptKey: string, now: number): boolean => {
  const expiresAt = recentAuthAttemptExpiresAtByKey.get(attemptKey);
  if (!expiresAt) return false;
  if (expiresAt <= now) {
    recentAuthAttemptExpiresAtByKey.delete(attemptKey);
    return false;
  }
  recentAuthAttemptExpiresAtByKey.delete(attemptKey);
  return true;
};

const encoder = new TextEncoder();

const bytesToHex = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
};

const hashKeySeedSha256Hex = async (seed: string): Promise<string> => {
  const cryptoObj = (globalThis as unknown as { crypto?: Crypto }).crypto;
  if (cryptoObj?.subtle?.digest) {
    try {
      const digest = await cryptoObj.subtle.digest('SHA-256', encoder.encode(seed));
      return bytesToHex(digest);
    } catch {
      // fall through to non-crypto fallback
    }
  }

  // Non-cryptographic fallback (FNV-1a 32-bit). Should only be used in test/edge runtimes.
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
};

const normalizeClientKeySeed = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return 'unknown';
  return trimmed.length > CLIENT_KEY_SEED_MAX_LENGTH
    ? trimmed.slice(0, CLIENT_KEY_SEED_MAX_LENGTH)
    : trimmed;
};

interface AuthAttemptRecord {
  failedCount: number;
  lockedUntil: number; // timestamp (ms)
  updatedAt: number;
}

export const isSyncProtected = (env: Env): boolean => {
  return !!(env.SYNC_PASSWORD && env.SYNC_PASSWORD.trim() !== '');
};

// 收集请求指纹特征（用于无 IP 时区分客户端）
const collectRequestFingerprint = (request: Request): string => {
  const parts: string[] = [];

  // User-Agent
  const ua = request.headers.get('User-Agent');
  if (ua) parts.push(ua);

  // Accept-Language（浏览器语言偏好，相对稳定）
  const lang = request.headers.get('Accept-Language');
  if (lang) parts.push(lang);

  // Accept-Encoding（压缩支持，相对稳定）
  const encoding = request.headers.get('Accept-Encoding');
  if (encoding) parts.push(encoding);

  // Sec-Ch-Ua（浏览器 Client Hints，Chrome 系浏览器提供）
  const chUa = request.headers.get('Sec-Ch-Ua');
  if (chUa) parts.push(chUa);

  // Sec-Ch-Ua-Platform（操作系统平台）
  const chPlatform = request.headers.get('Sec-Ch-Ua-Platform');
  if (chPlatform) parts.push(chPlatform);

  return parts.join('|');
};

// 客户端标识信息
interface ClientKeyInfo {
  seed: string;
  source: IpSourceType;
  noFingerprint: boolean; // 完全无指纹（无 IP 且无任何请求特征）
}

// 获取客户端标识信息，用于按来源记录密码错误次数，防止爆破。
// 返回 seed, source, noFingerprint：
// - 'cf'：Cloudflare 提供的真实 IP，可信度最高
// - 'forwarded'：X-Forwarded-For（可被伪造），与 User-Agent 组合降低绕过风险
// - 'unknown'：无 IP 信息，采用最严格限流
// - noFingerprint: 完全无请求特征，走最严格限流
const getClientKeyInfo = (request: Request): ClientKeyInfo => {
  const cfIp = request.headers.get('CF-Connecting-IP');
  if (cfIp) {
    return { seed: normalizeClientKeySeed(cfIp), source: 'cf', noFingerprint: false };
  }

  const forwardedFor = request.headers.get('X-Forwarded-For');
  if (forwardedFor) {
    const ip = normalizeClientKeySeed(forwardedFor.split(',')[0] || '');
    // X-Forwarded-For 可伪造，混入 User-Agent 增加碰撞难度
    const ua = request.headers.get('User-Agent') || '';
    const seed = ip === 'unknown' ? ua || 'unknown' : `${ip}|${ua}`;
    return { seed: normalizeClientKeySeed(seed), source: 'forwarded', noFingerprint: false };
  }

  // 无 IP 信息：收集多维度请求指纹来区分客户端
  // 即使攻击者省略 User-Agent，也需要伪造多个请求头才能共享限流桶
  const fingerprint = collectRequestFingerprint(request);
  if (fingerprint) {
    return { seed: normalizeClientKeySeed(fingerprint), source: 'unknown', noFingerprint: false };
  }

  // 完全无特征的请求：使用特殊标记，走最严格限流
  return { seed: '__no_fingerprint__', source: 'unknown', noFingerprint: true };
};

const resolveAuthAttemptKey = async (
  request: Request,
): Promise<{ key: string; source: IpSourceType; noFingerprint: boolean }> => {
  const { seed, source, noFingerprint } = getClientKeyInfo(request);
  const hash = await hashKeySeedSha256Hex(seed);
  return { key: `${KV_AUTH_ATTEMPT_PREFIX}${AUTH_ATTEMPT_HASH_PREFIX}${hash}`, source, noFingerprint };
};

const buildLockoutResponse = (lockedUntil: number, now: number): Response => {
  const retryAfterSeconds = Math.max(1, Math.ceil((lockedUntil - now) / 1000));
  return new Response(
    JSON.stringify({
      success: false,
      error: '登录失败：连续输入错误次数过多，请稍后重试',
      lockedUntil,
      retryAfterSeconds,
      maxAttempts: AUTH_MAX_FAILED_ATTEMPTS,
    }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(retryAfterSeconds),
      },
    },
  );
};

// 用于管理员接口的鉴权 + 错误次数限制
export const requireAdminAccess = async (
  request: Request,
  env: Env,
  options?: { clearAttemptsOnSuccess?: boolean },
): Promise<Response | null> => {
  if (!isSyncProtected(env)) {
    return null;
  }

  const { key: attemptKey, source: ipSource, noFingerprint } = await resolveAuthAttemptKey(request);
  const providedPassword = (request.headers.get('X-Sync-Password') || '').trim();

  if (!providedPassword) {
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Unauthorized: 管理员密码错误或未提供',
      }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // Fast-path: correct password -> allow.
  // Important: avoid KV.delete on every successful request; only clear if we previously observed a failed/locked record.
  if (providedPassword === env.SYNC_PASSWORD) {
    const now = Date.now();
    const forceClear = options?.clearAttemptsOnSuccess === true;
    const shouldClear = forceClear || shouldClearAuthAttemptsOnSuccess(attemptKey, now);
    if (forceClear) {
      recentAuthAttemptExpiresAtByKey.delete(attemptKey);
    }

    if (shouldClear) {
      try {
        await env.NAVHUB_KV.delete(attemptKey);
      } catch {
        // Ignore KV deletion failures and still allow admin access.
      }
    }
    return null;
  }

  const now = Date.now();
  const record = (await env.NAVHUB_KV.get(attemptKey, 'json')) as AuthAttemptRecord | null;

  if (record) {
    noteRecentAuthAttemptKey(attemptKey, now);
  }

  if (record?.lockedUntil && now < record.lockedUntil) {
    return buildLockoutResponse(record.lockedUntil, now);
  }

  // 根据来源可信度决定限流严格程度
  // cf: 5次, forwarded/unknown 有指纹: 3次, 完全无指纹: 2次
  const maxAttempts = noFingerprint
    ? AUTH_MAX_FAILED_ATTEMPTS_NO_FINGERPRINT
    : ipSource === 'cf'
      ? AUTH_MAX_FAILED_ATTEMPTS
      : AUTH_MAX_FAILED_ATTEMPTS_UNKNOWN_IP;
  const nextFailedCount = (record?.failedCount || 0) + 1;
  const remainingAttempts = Math.max(0, maxAttempts - nextFailedCount);
  const lockedUntil =
    nextFailedCount >= maxAttempts ? now + AUTH_LOCKOUT_SECONDS * 1000 : 0;

  const nextRecord: AuthAttemptRecord = {
    failedCount: nextFailedCount,
    lockedUntil,
    updatedAt: now,
  };

  await env.NAVHUB_KV.put(attemptKey, JSON.stringify(nextRecord), {
    expirationTtl: AUTH_LOCKOUT_SECONDS,
  });
  noteRecentAuthAttemptKey(attemptKey, now);

  if (lockedUntil) {
    return buildLockoutResponse(lockedUntil, now);
  }

  return new Response(
    JSON.stringify({
      success: false,
      error: '密码错误',
      remainingAttempts,
      maxAttempts,
    }),
    { status: 401, headers: { 'Content-Type': 'application/json' } },
  );
};

// 辅助函数：验证管理员密码（允许"公开读 + 管理员写"模式）
export const isAdminRequest = (request: Request, env: Env): boolean => {
  // 未设置服务端密码时，默认所有请求均为管理员
  if (!isSyncProtected(env)) {
    return true;
  }

  const authHeader = (request.headers.get('X-Sync-Password') || '').trim();
  return authHeader === env.SYNC_PASSWORD;
};
