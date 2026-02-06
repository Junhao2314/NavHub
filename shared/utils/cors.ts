export type ResolveCorsHeadersOptions = {
  /**
   * If provided, these headers are used as-is for all responses (including OPTIONS).
   */
  corsHeaders?: Record<string, string>;
  /**
   * Allowed CORS origins. If omitted, only same-origin requests are allowed.
   * Use `["*"]` to allow any origin (not recommended).
   */
  corsAllowedOrigins?: string[];
  /**
   * Base CORS headers (allow-methods/allow-headers/max-age).
   */
  baseHeaders: Record<string, string>;
};

export function resolveCorsHeaders(
  request: Request,
  options: ResolveCorsHeadersOptions,
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
    'Access-Control-Allow-Methods': options.baseHeaders['Access-Control-Allow-Methods'],
    'Access-Control-Allow-Headers': options.baseHeaders['Access-Control-Allow-Headers'],
    'Access-Control-Max-Age': options.baseHeaders['Access-Control-Max-Age'],
  };

  if (allowOriginValue) {
    headers['Access-Control-Allow-Origin'] = allowOriginValue;
    if (allowOriginValue !== '*') {
      headers['Vary'] = 'Origin';
    }
  }

  return { headers, allowed };
}
