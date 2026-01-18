/**
 * Cloudflare Pages Function: OpenAI Compatible Proxy
 *
 * Why:
 * - Many OpenAI-compatible endpoints do NOT enable browser CORS.
 * - This endpoint lets the frontend call same-origin `/api/ai` and the server does the upstream request.
 *
 * Endpoints:
 * - POST /api/ai?action=chat    { baseUrl, apiKey, payload }  -> upstream /chat/completions
 * - POST /api/ai?action=models  { baseUrl, apiKey }           -> upstream /models
 */

const DEFAULT_OPENAI_COMPAT_BASE_URL = 'https://api.openai.com/v1';

type OpenAICompatibleUrls = {
  chatCompletionsUrl: string;
  modelsUrl: string;
};

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const jsonResponse = (data: unknown, status = 200, headers: Record<string, string> = {}): Response => {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
      ...headers,
    },
  });
};

const ensureHttpScheme = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
};

const buildOpenAICompatibleUrls = (baseUrlInput: string): OpenAICompatibleUrls => {
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
};

type ChatPayload = Record<string, unknown>;

type ProxyRequestBody = {
  baseUrl?: string;
  apiKey?: string;
  payload?: ChatPayload;
};

const forward = async (url: string, init: RequestInit): Promise<Response> => {
  const upstream = await fetch(url, init);
  const bodyText = await upstream.text();
  return new Response(bodyText, {
    status: upstream.status,
    headers: {
      ...corsHeaders,
      'Content-Type': upstream.headers.get('Content-Type') || 'application/json',
    },
  });
};

export const onRequest = async (context: { request: Request }): Promise<Response> => {
  const { request } = context;
  const url = new URL(request.url);
  const action = (url.searchParams.get('action') || 'chat').toLowerCase();

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ success: false, error: 'Method not allowed' }, 405);
  }

  let body: ProxyRequestBody | null = null;
  try {
    body = (await request.json()) as ProxyRequestBody;
  } catch {
    body = null;
  }

  if (!body || typeof body !== 'object') {
    return jsonResponse({ success: false, error: 'Invalid JSON body' }, 400);
  }

  const baseUrlInput = typeof body.baseUrl === 'string' ? body.baseUrl.trim() : '';
  const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
  if (!apiKey) {
    return jsonResponse({ success: false, error: 'Missing apiKey' }, 400);
  }

  const { chatCompletionsUrl, modelsUrl } = buildOpenAICompatibleUrls(baseUrlInput || DEFAULT_OPENAI_COMPAT_BASE_URL);

  if (action === 'models') {
    return forward(modelsUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
    });
  }

  const payload = body.payload;
  if (!payload || typeof payload !== 'object') {
    return jsonResponse({ success: false, error: 'Missing payload' }, 400);
  }

  return forward(chatCompletionsUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });
};

