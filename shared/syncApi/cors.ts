import { resolveCorsHeaders } from '../utils/cors';

// Preflight 缓存时间（秒）- 浏览器缓存 OPTIONS 响应，减少重复预检请求
const CORS_MAX_AGE_SECONDS = 86400; // 24 hours

export const SYNC_CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Sync-Password',
  'Access-Control-Max-Age': String(CORS_MAX_AGE_SECONDS),
};

export type SyncCorsOptions = {
  /**
   * If provided, these headers are used as-is for all responses (including OPTIONS).
   * Prefer `corsAllowedOrigins` for safer defaults.
   */
  corsHeaders?: Record<string, string>;
  /**
   * Allowed CORS origins. If omitted, only same-origin requests are allowed.
   * Use `["*"]` to allow any origin (not recommended).
   */
  corsAllowedOrigins?: string[];
};

export function resolveSyncCorsHeaders(
  request: Request,
  options: SyncCorsOptions = {},
): { headers: Record<string, string>; allowed: boolean } {
  return resolveCorsHeaders(request, {
    corsHeaders: options.corsHeaders,
    corsAllowedOrigins: options.corsAllowedOrigins,
    baseHeaders: SYNC_CORS_HEADERS,
  });
}
