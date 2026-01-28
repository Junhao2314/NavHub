/**
 * OpenAI Compatible Proxy handler shared by:
 * - Cloudflare Worker (/worker/index.ts)
 * - Cloudflare Pages Functions (/functions/api/ai.ts)
 *
 * Endpoints:
 * - POST /api/ai?action=chat    { baseUrl, apiKey, payload }  -> upstream /chat/completions
 * - POST /api/ai?action=models  { baseUrl, apiKey }           -> upstream /models
 */

const DEFAULT_OPENAI_COMPAT_BASE_URL = 'https://api.openai.com/v1';

export const AI_CORS_HEADERS: Record<string, string> = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

type OpenAICompatibleUrls = {
    chatCompletionsUrl: string;
    modelsUrl: string;
};

type ChatPayload = Record<string, unknown>;

type ProxyRequestBody = {
    baseUrl?: string;
    apiKey?: string;
    payload?: ChatPayload;
};

export type ApiAIHandlerOptions = {
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
    /**
     * Allowed upstream hostnames (exact or wildcard like `*.example.com`).
     * If omitted, defaults to `api.openai.com` only.
     */
    allowedBaseUrlHosts?: string[];
    /**
     * Allow upstream `http:` (insecure). Defaults to `false` (only `https:`).
     */
    allowInsecureHttp?: boolean;
    /**
     * Optional diagnostic hook for suppressed parsing/validation errors.
     * Must not throw.
     */
    onError?: (error: unknown, context: ApiAIHandlerErrorContext) => void;
    fetchFn?: typeof fetch;
};

export type ApiAIHandlerErrorContext = {
    stage:
        | 'parseAllowedHostPattern'
        | 'buildOpenAICompatibleUrls'
        | 'parseRequestBodyJson'
        | 'parseBaseUrl';
};

type AllowedHostPattern = {
    hostnamePattern: string;
    port?: string;
};

function reportError(
    onError: ApiAIHandlerOptions['onError'] | undefined,
    error: unknown,
    context: ApiAIHandlerErrorContext
): void {
    if (!onError) return;
    onError(error, context);
}

function jsonResponse(
    data: unknown,
    status: number,
    corsHeaders: Record<string, string>,
    extraHeaders: Record<string, string> = {}
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

function ensureHttpScheme(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) return trimmed;
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return trimmed;
    return `https://${trimmed}`;
}

function normalizeHostname(value: string): string {
    return value.trim().toLowerCase().replace(/\.$/, '');
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

function isPrivateNetworkHostname(hostname: string): boolean {
    const host = normalizeHostname(hostname);
    if (!host) return true;
    if (host === 'localhost' || host.endsWith('.localhost')) return true;

    if (isValidIpv4(host)) {
        const [a, b] = host.split('.').map((n) => Number(n));
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
    }

    const lower = host.toLowerCase();
    if (lower === '::' || lower === '::1') return true;
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // fc00::/7
    if (lower.startsWith('fe80:')) return true; // fe80::/10

    return false;
}

function parseAllowedHostPattern(value: string, onError?: ApiAIHandlerOptions['onError']): AllowedHostPattern | null {
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

function resolveCorsHeaders(request: Request, options: ApiAIHandlerOptions): { headers: Record<string, string>; allowed: boolean } {
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
        'Access-Control-Allow-Methods': AI_CORS_HEADERS['Access-Control-Allow-Methods'],
        'Access-Control-Allow-Headers': AI_CORS_HEADERS['Access-Control-Allow-Headers'],
    };
    if (allowOriginValue) {
        headers['Access-Control-Allow-Origin'] = allowOriginValue;
        if (allowOriginValue !== '*') {
            headers['Vary'] = 'Origin';
        }
    }

    return { headers, allowed };
}

function buildOpenAICompatibleUrls(
    baseUrlInput: string,
    onError?: ApiAIHandlerOptions['onError']
): OpenAICompatibleUrls {
    const normalizedInput = ensureHttpScheme(baseUrlInput) || DEFAULT_OPENAI_COMPAT_BASE_URL;

    let parsedUrl: URL;
    try {
        parsedUrl = new URL(normalizedInput);
    } catch (error: unknown) {
        reportError(onError, error, { stage: 'buildOpenAICompatibleUrls' });
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
            modelsUrl: base.replace(/\/chat\/completions$/, '/models'),
        };
    }

    if (pathname.endsWith('/models')) {
        return {
            chatCompletionsUrl: base.replace(/\/models$/, '/chat/completions'),
            modelsUrl: base,
        };
    }

    if (pathname.endsWith('/v1')) {
        return {
            chatCompletionsUrl: `${base}/chat/completions`,
            modelsUrl: `${base}/models`,
        };
    }

    return {
        chatCompletionsUrl: `${base}/v1/chat/completions`,
        modelsUrl: `${base}/v1/models`,
    };
}

function isRedirectStatus(status: number): boolean {
    return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

async function forward(
    fetchFn: typeof fetch,
    url: string,
    init: RequestInit,
    corsHeaders: Record<string, string>,
    validateUrl: (url: URL) => boolean
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
            return jsonResponse({ success: false, error: 'Upstream redirected too many times' }, 502, corsHeaders);
        }

        let nextUrl: URL;
        try {
            nextUrl = new URL(location, currentUrl);
        } catch {
            return jsonResponse({ success: false, error: 'Upstream redirect is invalid' }, 502, corsHeaders);
        }

        if (!validateUrl(nextUrl)) {
            return jsonResponse({ success: false, error: 'Upstream redirect not allowed' }, 502, corsHeaders);
        }

        const method = (currentInit.method || 'GET').toString().toUpperCase();
        if (upstream.status === 303 || ((upstream.status === 301 || upstream.status === 302) && method !== 'GET' && method !== 'HEAD')) {
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

export async function handleApiAIRequest(request: Request, options: ApiAIHandlerOptions = {}): Promise<Response> {
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

    const allowedHostInputs = options.allowedBaseUrlHosts && options.allowedBaseUrlHosts.length > 0
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

    if (parsedBaseUrl.protocol !== 'https:' && !(options.allowInsecureHttp && parsedBaseUrl.protocol === 'http:')) {
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

    const { chatCompletionsUrl, modelsUrl } = buildOpenAICompatibleUrls(normalizedBaseUrl, options.onError);
    const validateUrl = (urlToValidate: URL): boolean => {
        if (urlToValidate.protocol !== 'https:' && !(options.allowInsecureHttp && urlToValidate.protocol === 'http:')) {
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
                    'Accept': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                },
            },
            corsHeaders,
            validateUrl
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
                'Accept': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify(payload),
        },
        corsHeaders,
        validateUrl
    );
}
