/**
 * OpenAI API Proxy Handler
 * OpenAI API 代理处理器
 *
 * Shared by / 共享于:
 * - Cloudflare Worker (/worker/index.ts)
 * - Cloudflare Pages Functions (/functions/api/ai.ts)
 *
 * Endpoints / 端点:
 * - POST /api/ai?action=chat    { baseUrl, apiKey, payload }  -> upstream /chat/completions
 *   聊天补全请求代理
 * - POST /api/ai?action=models  { baseUrl, apiKey }           -> upstream /models
 *   模型列表请求代理
 *
 * Security features / 安全特性:
 * - CORS origin validation / CORS 来源验证
 * - Upstream host allowlist / 上游主机白名单
 * - Private network blocking / 私有网络阻止
 * - Redirect validation / 重定向验证
 */

import { resolveCorsHeaders as resolveCorsHeadersBase } from './utils/cors';
import {
  buildOpenAICompatibleUrls,
  DEFAULT_OPENAI_COMPAT_BASE_URL,
  ensureHttpScheme,
} from './utils/openaiCompat';

// Preflight 缓存时间（秒）
const AI_CORS_MAX_AGE_SECONDS = 86400; // 24 hours

/**
 * Default CORS headers for AI proxy
 * AI 代理的默认 CORS 头
 */
export const AI_CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': String(AI_CORS_MAX_AGE_SECONDS),
};

type ChatPayload = Record<string, unknown>;

/**
 * Proxy request body structure
 * 代理请求体结构
 */
type ProxyRequestBody = {
  baseUrl?: string;
  apiKey?: string;
  payload?: ChatPayload;
};

/**
 * API AI handler options
 * API AI 处理器选项
 */
export type ApiAIHandlerOptions = {
  /**
   * If provided, these headers are used as-is for all responses (including OPTIONS).
   * Prefer `corsAllowedOrigins` for safer defaults.
   * 如果提供，这些头将原样用于所有响应（包括 OPTIONS）。
   * 建议使用 `corsAllowedOrigins` 以获得更安全的默认值。
   */
  corsHeaders?: Record<string, string>;
  /**
   * Allowed CORS origins. If omitted, only same-origin requests are allowed.
   * Use `["*"]` to allow any origin (not recommended).
   * 允许的 CORS 来源。如果省略，只允许同源请求。
   * 使用 `["*"]` 允许任何来源（不推荐）。
   */
  corsAllowedOrigins?: string[];
  /**
   * Allowed upstream hostnames (exact or wildcard like `*.example.com`).
   * If omitted, defaults to `api.openai.com` only.
   * 允许的上游主机名（精确匹配或通配符如 `*.example.com`）。
   * 如果省略，默认只允许 `api.openai.com`。
   */
  allowedBaseUrlHosts?: string[];
  /**
   * Allow upstream `http:` (insecure). Defaults to `false` (only `https:`).
   * 允许上游 `http:`（不安全）。默认为 `false`（仅 `https:`）。
   */
  allowInsecureHttp?: boolean;
  /**
   * Optional diagnostic hook for suppressed parsing/validation errors.
   * Must not throw.
   * 可选的诊断钩子，用于被抑制的解析/验证错误。不能抛出异常。
   */
  onError?: (error: unknown, context: ApiAIHandlerErrorContext) => void;
  fetchFn?: typeof fetch;
};

/**
 * Error context for diagnostic hook
 * 诊断钩子的错误上下文
 */
export type ApiAIHandlerErrorContext = {
  stage:
    | 'parseAllowedHostPattern'
    | 'buildOpenAICompatibleUrls'
    | 'parseRequestBodyJson'
    | 'parseBaseUrl';
};

/**
 * Parsed allowed host pattern
 * 解析后的允许主机模式
 */
type AllowedHostPattern = {
  hostnamePattern: string;
  port?: string;
};

function reportError(
  onError: ApiAIHandlerOptions['onError'] | undefined,
  error: unknown,
  context: ApiAIHandlerErrorContext,
): void {
  if (!onError) return;
  onError(error, context);
}

function jsonResponse(
  data: unknown,
  status: number,
  corsHeaders: Record<string, string>,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
      ...extraHeaders,
    },
  });
}

function normalizeHostname(value: string): string {
  const trimmed = value.trim().toLowerCase().replace(/\.$/, '');
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function normalizeHostnamePattern(value: string): string {
  const trimmed = value.trim();
  if (trimmed === '*') return '';
  if (trimmed.includes('*') && !trimmed.startsWith('*.')) return '';
  if (trimmed.startsWith('*.')) {
    const restInput = trimmed.slice(2);
    if (restInput.includes('*')) return '';
    const rest = normalizeHostname(restInput);
    return rest ? `*.${rest}` : '';
  }
  return normalizeHostname(trimmed);
}

function getEffectivePort(url: URL): string {
  if (url.port) return url.port;
  if (url.protocol === 'http:') return '80';
  if (url.protocol === 'https:') return '443';
  return '';
}

function isValidIpv4(value: string): boolean {
  const parts = value.split('.');
  if (parts.length !== 4) return false;
  return parts.every((part) => {
    if (!/^\d{1,3}$/.test(part)) return false;
    const num = Number(part);
    return num >= 0 && num <= 255;
  });
}

function parseIpv4Octets(value: string): [number, number, number, number] | null {
  if (!isValidIpv4(value)) return null;
  const parts = value.split('.').map((n) => Number(n));
  if (parts.length !== 4) return null;
  if (parts.some((n) => !Number.isFinite(n))) return null;
  return parts as [number, number, number, number];
}

function isPrivateIpv4Octets([a, b]: [number, number, number, number]): boolean {
  // 0.0.0.0/8, 10.0.0.0/8, 127.0.0.0/8
  if (a === 0 || a === 10 || a === 127) return true;
  // 169.254.0.0/16
  if (a === 169 && b === 254) return true;
  // 172.16.0.0/12
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168.0.0/16
  if (a === 192 && b === 168) return true;
  // 100.64.0.0/10 (CGNAT)
  if (a === 100 && b >= 64 && b <= 127) return true;
  // 198.18.0.0/15 (benchmark)
  if (a === 198 && (b === 18 || b === 19)) return true;

  // Multicast/reserved (224.0.0.0/4, 240.0.0.0/4) and broadcast.
  if (a >= 224) return true;

  return false;
}

function parseIpv6Hextets(hostname: string): Uint16Array | null {
  const input = normalizeHostname(hostname);
  if (!input) return null;

  const zoneIndex = input.indexOf('%');
  const withoutZone = zoneIndex === -1 ? input : input.slice(0, zoneIndex);
  if (!withoutZone) return null;

  const parts = withoutZone.split('::');
  if (parts.length > 2) return null;

  const splitPart = (value: string): string[] => value.split(':').filter(Boolean);
  const left = parts[0] ? splitPart(parts[0]) : [];
  const right = parts.length === 2 && parts[1] ? splitPart(parts[1]) : [];

  const replaceEmbeddedIpv4 = (segments: string[]): boolean => {
    if (segments.length === 0) return false;
    const last = segments[segments.length - 1] || '';
    if (!last.includes('.')) return true;

    const ipv4 = parseIpv4Octets(last);
    if (!ipv4) return false;
    const [a, b, c, d] = ipv4;
    const hi = ((a << 8) | b).toString(16);
    const lo = ((c << 8) | d).toString(16);
    segments.splice(segments.length - 1, 1, hi, lo);
    return true;
  };

  if (!replaceEmbeddedIpv4(right.length > 0 ? right : left)) return null;

  const total = left.length + right.length;
  const hasCompression = parts.length === 2;
  if (!hasCompression) {
    if (total !== 8) return null;
  } else {
    const missing = 8 - total;
    if (missing < 1) return null;
    for (let i = 0; i < missing; i += 1) {
      right.unshift('0');
    }
  }

  const all = [...left, ...right];
  if (all.length !== 8) return null;

  const out = new Uint16Array(8);
  for (let i = 0; i < 8; i += 1) {
    const part = all[i] || '';
    if (!/^[0-9a-f]{1,4}$/i.test(part)) return null;
    const parsed = Number.parseInt(part, 16);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 0xffff) return null;
    out[i] = parsed;
  }

  return out;
}

function isAllZeroIpv6(hextets: Uint16Array): boolean {
  for (let i = 0; i < hextets.length; i += 1) {
    if (hextets[i] !== 0) return false;
  }
  return true;
}

function isLoopbackIpv6(hextets: Uint16Array): boolean {
  for (let i = 0; i < 7; i += 1) {
    if (hextets[i] !== 0) return false;
  }
  return hextets[7] === 1;
}

function extractMappedIpv4FromIpv6(hextets: Uint16Array): [number, number, number, number] | null {
  const isIpv4Compatible =
    hextets[0] === 0 &&
    hextets[1] === 0 &&
    hextets[2] === 0 &&
    hextets[3] === 0 &&
    hextets[4] === 0 &&
    hextets[5] === 0;

  const isIpv4Mapped =
    hextets[0] === 0 &&
    hextets[1] === 0 &&
    hextets[2] === 0 &&
    hextets[3] === 0 &&
    hextets[4] === 0 &&
    hextets[5] === 0xffff;

  if (!isIpv4Compatible && !isIpv4Mapped) return null;

  const a = (hextets[6] >> 8) & 0xff;
  const b = hextets[6] & 0xff;
  const c = (hextets[7] >> 8) & 0xff;
  const d = hextets[7] & 0xff;
  return [a, b, c, d];
}

function isPrivateNetworkHostname(hostname: string): boolean {
  const host = normalizeHostname(hostname);
  if (!host) return true;
  if (host === 'localhost' || host.endsWith('.localhost')) return true;

  const ipv4 = parseIpv4Octets(host);
  if (ipv4) {
    return isPrivateIpv4Octets(ipv4);
  }

  // IPv6 literals (including v4-mapped/v4-compatible)
  if (host.includes(':') || host.includes('%')) {
    const ipv6 = parseIpv6Hextets(host);
    if (!ipv6) {
      // Fail closed: a hostname containing ':' should be an IPv6 literal; if parsing fails, treat as unsafe.
      return true;
    }

    if (isAllZeroIpv6(ipv6)) return true; // ::
    if (isLoopbackIpv6(ipv6)) return true; // ::1

    // Unique local: fc00::/7
    if ((ipv6[0] & 0xfe00) === 0xfc00) return true;
    // Link-local: fe80::/10
    if ((ipv6[0] & 0xffc0) === 0xfe80) return true;
    // Deprecated site-local: fec0::/10
    if ((ipv6[0] & 0xffc0) === 0xfec0) return true;
    // Multicast: ff00::/8
    if ((ipv6[0] & 0xff00) === 0xff00) return true;

    const mappedIpv4 = extractMappedIpv4FromIpv6(ipv6);
    if (mappedIpv4) {
      return isPrivateIpv4Octets(mappedIpv4);
    }
  }

  return false;
}

function parseAllowedHostPattern(
  value: string,
  onError?: ApiAIHandlerOptions['onError'],
): AllowedHostPattern | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed === '*') return null;

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      return {
        hostnamePattern: normalizeHostname(parsed.hostname),
        port: parsed.port || undefined,
      };
    } catch (error: unknown) {
      reportError(onError, error, { stage: 'parseAllowedHostPattern' });
      return null;
    }
  }

  const hostPart = trimmed.split('/')[0];
  if (hostPart.startsWith('[')) {
    const endBracket = hostPart.indexOf(']');
    if (endBracket === -1) return null;
    const ipv6Literal = hostPart.slice(1, endBracket);
    const rest = hostPart.slice(endBracket + 1);
    if (rest && !rest.startsWith(':')) return null;
    const port = rest.startsWith(':') ? rest.slice(1) : '';
    if (port && !/^\d+$/.test(port)) return null;
    const hostnamePattern = normalizeHostname(ipv6Literal);
    if (!hostnamePattern) return null;
    return { hostnamePattern, ...(port ? { port } : {}) };
  }

  const colonCount = (hostPart.match(/:/g) || []).length;
  if (colonCount > 1) {
    // Likely an IPv6 literal without brackets/port (e.g. "::1").
    const hostnamePattern = normalizeHostname(hostPart);
    if (!hostnamePattern || hostnamePattern.includes('*')) return null;
    return { hostnamePattern };
  }

  const match = hostPart.match(/^(.*):(\d+)$/);
  if (match) {
    const hostnamePattern = normalizeHostnamePattern(match[1]);
    if (!hostnamePattern) return null;
    return { hostnamePattern, port: match[2] };
  }

  const hostnamePattern = normalizeHostnamePattern(hostPart);
  if (!hostnamePattern) return null;
  return { hostnamePattern };
}

function hostnameMatchesPattern(hostname: string, pattern: string): boolean {
  const host = normalizeHostname(hostname);
  const normalizedPattern = normalizeHostnamePattern(pattern);
  if (!host || !normalizedPattern) return false;
  if (normalizedPattern.startsWith('*.')) {
    const suffix = normalizedPattern.slice(1); // ".example.com"
    return host.endsWith(suffix) && host.length > suffix.length;
  }
  return host === normalizedPattern;
}

function isUpstreamAllowed(url: URL, patterns: AllowedHostPattern[]): boolean {
  const hostname = url.hostname;
  const port = getEffectivePort(url);

  for (const pattern of patterns) {
    if (!hostnameMatchesPattern(hostname, pattern.hostnamePattern)) continue;
    if (pattern.port) {
      if (port === pattern.port) return true;
      continue;
    }
    if (url.protocol === 'https:' && port === '443') return true;
    if (url.protocol === 'http:' && port === '80') return true;
  }

  return false;
}

function resolveCorsHeaders(
  request: Request,
  options: ApiAIHandlerOptions,
): { headers: Record<string, string>; allowed: boolean } {
  return resolveCorsHeadersBase(request, {
    corsHeaders: options.corsHeaders,
    corsAllowedOrigins: options.corsAllowedOrigins,
    baseHeaders: AI_CORS_HEADERS,
  });
}

function isRedirectStatus(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

async function forward(
  fetchFn: typeof fetch,
  url: string,
  init: RequestInit,
  corsHeaders: Record<string, string>,
  validateUrl: (url: URL) => boolean,
): Promise<Response> {
  const maxRedirects = 3;
  let currentUrl = url;
  let currentInit = init;

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    const upstream = await fetchFn(currentUrl, { ...currentInit, redirect: 'manual' });

    if (!isRedirectStatus(upstream.status)) {
      return new Response(upstream.body, {
        status: upstream.status,
        headers: {
          ...corsHeaders,
          'Content-Type': upstream.headers.get('Content-Type') || 'application/json',
        },
      });
    }

    const location = upstream.headers.get('Location');
    if (!location) {
      return new Response(upstream.body, {
        status: upstream.status,
        headers: {
          ...corsHeaders,
          'Content-Type': upstream.headers.get('Content-Type') || 'application/json',
        },
      });
    }

    if (redirectCount === maxRedirects) {
      return jsonResponse(
        { success: false, error: 'Upstream redirected too many times' },
        502,
        corsHeaders,
      );
    }

    let nextUrl: URL;
    try {
      nextUrl = new URL(location, currentUrl);
    } catch {
      return jsonResponse(
        { success: false, error: 'Upstream redirect is invalid' },
        502,
        corsHeaders,
      );
    }

    if (!validateUrl(nextUrl)) {
      return jsonResponse(
        { success: false, error: 'Upstream redirect not allowed' },
        502,
        corsHeaders,
      );
    }

    const method = (currentInit.method || 'GET').toString().toUpperCase();
    if (
      upstream.status === 303 ||
      ((upstream.status === 301 || upstream.status === 302) &&
        method !== 'GET' &&
        method !== 'HEAD')
    ) {
      const headers = new Headers(currentInit.headers);
      headers.delete('Content-Type');
      currentInit = {
        ...currentInit,
        method: 'GET',
        body: undefined,
        headers,
      };
    }

    currentUrl = nextUrl.toString();
  }

  return jsonResponse({ success: false, error: 'Upstream request failed' }, 502, corsHeaders);
}

export async function handleApiAIRequest(
  request: Request,
  options: ApiAIHandlerOptions = {},
): Promise<Response> {
  const fetchFn = options.fetchFn ?? fetch;
  const corsResolution = resolveCorsHeaders(request, options);
  const corsHeaders = corsResolution.headers;

  const url = new URL(request.url);
  const action = (url.searchParams.get('action') || 'chat').toLowerCase();

  if (!corsResolution.allowed) {
    return jsonResponse({ success: false, error: 'CORS origin not allowed' }, 403, corsHeaders);
  }

  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ success: false, error: 'Method not allowed' }, 405, corsHeaders);
  }

  let body: ProxyRequestBody | null = null;
  try {
    body = (await request.json()) as ProxyRequestBody;
  } catch (error: unknown) {
    reportError(options.onError, error, { stage: 'parseRequestBodyJson' });
    body = null;
  }

  if (!body || typeof body !== 'object') {
    return jsonResponse({ success: false, error: 'Invalid JSON body' }, 400, corsHeaders);
  }

  const baseUrlInput = typeof body.baseUrl === 'string' ? body.baseUrl.trim() : '';
  const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
  if (!apiKey) {
    return jsonResponse({ success: false, error: 'Missing apiKey' }, 400, corsHeaders);
  }

  const allowedHostInputs =
    options.allowedBaseUrlHosts && options.allowedBaseUrlHosts.length > 0
      ? options.allowedBaseUrlHosts
      : ['api.openai.com'];
  const allowedPatterns = allowedHostInputs
    .map((value) => parseAllowedHostPattern(value, options.onError))
    .filter((v): v is AllowedHostPattern => Boolean(v));

  const effectiveBaseUrlInput = baseUrlInput || DEFAULT_OPENAI_COMPAT_BASE_URL;
  const normalizedBaseUrl = ensureHttpScheme(effectiveBaseUrlInput);
  let parsedBaseUrl: URL;
  try {
    parsedBaseUrl = new URL(normalizedBaseUrl);
  } catch (error: unknown) {
    reportError(options.onError, error, { stage: 'parseBaseUrl' });
    return jsonResponse({ success: false, error: 'Invalid baseUrl' }, 400, corsHeaders);
  }

  if (
    parsedBaseUrl.protocol !== 'https:' &&
    !(options.allowInsecureHttp && parsedBaseUrl.protocol === 'http:')
  ) {
    return jsonResponse({ success: false, error: 'Invalid baseUrl protocol' }, 400, corsHeaders);
  }

  if (parsedBaseUrl.username || parsedBaseUrl.password || parsedBaseUrl.hash) {
    return jsonResponse({ success: false, error: 'Invalid baseUrl' }, 400, corsHeaders);
  }

  if (isPrivateNetworkHostname(parsedBaseUrl.hostname)) {
    return jsonResponse({ success: false, error: 'baseUrl host not allowed' }, 403, corsHeaders);
  }

  if (!isUpstreamAllowed(parsedBaseUrl, allowedPatterns)) {
    return jsonResponse({ success: false, error: 'baseUrl host not allowed' }, 403, corsHeaders);
  }

  const { chatCompletionsUrl, modelsUrl } = buildOpenAICompatibleUrls(
    normalizedBaseUrl,
    options.onError,
  );
  const validateUrl = (urlToValidate: URL): boolean => {
    if (
      urlToValidate.protocol !== 'https:' &&
      !(options.allowInsecureHttp && urlToValidate.protocol === 'http:')
    ) {
      return false;
    }
    if (urlToValidate.username || urlToValidate.password || urlToValidate.hash) return false;
    if (isPrivateNetworkHostname(urlToValidate.hostname)) return false;
    return isUpstreamAllowed(urlToValidate, allowedPatterns);
  };

  if (action === 'models') {
    return forward(
      fetchFn,
      modelsUrl,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
      },
      corsHeaders,
      validateUrl,
    );
  }

  const payload = body.payload;
  if (!payload || typeof payload !== 'object') {
    return jsonResponse({ success: false, error: 'Missing payload' }, 400, corsHeaders);
  }

  return forward(
    fetchFn,
    chatCompletionsUrl,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    },
    corsHeaders,
    validateUrl,
  );
}
