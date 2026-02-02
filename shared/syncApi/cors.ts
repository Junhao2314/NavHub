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
  if (options.corsHeaders) {
    return { headers: options.corsHeaders, allowed: true };
  }

  const urlOrigin = new URL(request.url).origin;
  const requestOrigin = (request.headers.get('Origin') || '').trim();
  const configuredOrigins = (options.corsAllowedOrigins || []).map((v) => v.trim()).filter(Boolean);
  const allowAnyOrigin = configuredOrigins.includes('*');

  let allowOriginValue = '';
  let allowed = true;

  if (requestOrigin) {
    if (allowAnyOrigin) {
      allowOriginValue = '*';
    } else if (configuredOrigins.length > 0) {
      allowed = configuredOrigins.includes(requestOrigin);
      if (allowed) allowOriginValue = requestOrigin;
    } else {
      allowed = requestOrigin === urlOrigin;
      if (allowed) allowOriginValue = requestOrigin;
    }
  }

  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': SYNC_CORS_HEADERS['Access-Control-Allow-Methods'],
    'Access-Control-Allow-Headers': SYNC_CORS_HEADERS['Access-Control-Allow-Headers'],
    'Access-Control-Max-Age': SYNC_CORS_HEADERS['Access-Control-Max-Age'],
  };

  if (allowOriginValue) {
    headers['Access-Control-Allow-Origin'] = allowOriginValue;
    if (allowOriginValue !== '*') {
      headers['Vary'] = 'Origin';
    }
  }

  return { headers, allowed };
}
