export type SecurityHeadersContext = 'api' | 'static';

export type SecurityHeadersCspMode = 'enforce' | 'off' | 'report-only';

export type ApplySecurityHeadersOptions = {
  context: SecurityHeadersContext;
  cspMode?: string;
  enableHstsPreload?: boolean;
  request: Request;
};

const DEFAULT_CSP_MODE: SecurityHeadersCspMode = 'report-only';

const BASE_SECURITY_HEADERS: Record<string, string> = {
  'Permissions-Policy':
    'accelerometer=(), autoplay=(), browsing-topics=(), camera=(), display-capture=(), geolocation=(), gyroscope=(), hid=(), microphone=(), midi=(), payment=(), serial=(), usb=(), xr-spatial-tracking=()',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-Permitted-Cross-Domain-Policies': 'none',
};

const STATIC_RESOURCE_SECURITY_HEADERS: Record<string, string> = {
  'Cross-Origin-Resource-Policy': 'same-origin',
};

const DOCUMENT_SECURITY_HEADERS: Record<string, string> = {
  'Cross-Origin-Opener-Policy': 'same-origin',
};

const DOCUMENT_CSP_DIRECTIVES = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "connect-src 'self' https:",
  "font-src 'self' data:",
  "img-src 'self' data: blob: https:",
  "manifest-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "style-src-elem 'self'",
  "style-src-attr 'unsafe-inline'",
  "worker-src 'self' blob:",
];

const DOCUMENT_CSP_VALUE = DOCUMENT_CSP_DIRECTIVES.join('; ');

function isHtmlResponse(response: Response): boolean {
  const contentType = response.headers.get('Content-Type') || '';
  return contentType.toLowerCase().includes('text/html');
}

function isHttpsRequest(request: Request): boolean {
  try {
    return new URL(request.url).protocol === 'https:';
  } catch {
    return false;
  }
}

function setHeaders(headers: Headers, nextHeaders: Record<string, string>): void {
  for (const [key, value] of Object.entries(nextHeaders)) {
    headers.set(key, value);
  }
}

function buildHstsValue(enablePreload: boolean): string {
  return enablePreload
    ? 'max-age=31536000; includeSubDomains; preload'
    : 'max-age=31536000; includeSubDomains';
}

export function resolveSecurityHeadersCspMode(rawMode?: string): SecurityHeadersCspMode {
  const normalized = rawMode?.trim().toLowerCase();
  if (normalized === 'off' || normalized === 'enforce' || normalized === 'report-only') {
    return normalized;
  }
  return DEFAULT_CSP_MODE;
}

export function applySecurityHeaders(
  response: Response,
  options: ApplySecurityHeadersOptions,
): Response {
  const headers = new Headers(response.headers);
  setHeaders(headers, BASE_SECURITY_HEADERS);

  if (isHttpsRequest(options.request)) {
    headers.set('Strict-Transport-Security', buildHstsValue(Boolean(options.enableHstsPreload)));
  }

  if (options.context === 'static' && isHtmlResponse(response)) {
    setHeaders(headers, STATIC_RESOURCE_SECURITY_HEADERS);
    setHeaders(headers, DOCUMENT_SECURITY_HEADERS);

    const cspMode = resolveSecurityHeadersCspMode(options.cspMode);
    if (cspMode === 'enforce') {
      headers.set('Content-Security-Policy', DOCUMENT_CSP_VALUE);
      headers.delete('Content-Security-Policy-Report-Only');
    } else if (cspMode === 'report-only') {
      headers.set('Content-Security-Policy-Report-Only', DOCUMENT_CSP_VALUE);
      headers.delete('Content-Security-Policy');
    } else {
      headers.delete('Content-Security-Policy');
      headers.delete('Content-Security-Policy-Report-Only');
    }
  } else if (options.context === 'static') {
    setHeaders(headers, STATIC_RESOURCE_SECURITY_HEADERS);
  } else {
    headers.delete('Content-Security-Policy');
    headers.delete('Content-Security-Policy-Report-Only');
    headers.delete('Cross-Origin-Resource-Policy');
  }

  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}
