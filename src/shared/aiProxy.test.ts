import { describe, expect, it, vi } from 'vitest';
import { handleApiAIRequest } from '../../shared/aiProxy';

describe('/api/ai proxy', () => {
  it('returns CORS headers for OPTIONS', async () => {
    const request = new Request('http://localhost/api/ai', {
      method: 'OPTIONS',
      headers: { Origin: 'http://localhost' },
    });
    const response = await handleApiAIRequest(request);

    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost');
    expect(response.headers.get('Access-Control-Allow-Methods')).toBe('POST, OPTIONS');
    expect(response.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type');
    expect(response.headers.get('Vary')).toBe('Origin');
  });

  it('rejects disallowed CORS origins by default', async () => {
    const request = new Request('http://localhost/api/ai', {
      method: 'OPTIONS',
      headers: { Origin: 'https://evil.com' },
    });
    const response = await handleApiAIRequest(request);

    expect(response.status).toBe(403);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(await response.json()).toEqual({ success: false, error: 'CORS origin not allowed' });
  });

  it('rejects invalid JSON bodies', async () => {
    const fetchFn = vi.fn(
      async () => new Response('should not be called'),
    ) as unknown as typeof fetch;

    const request = new Request('http://localhost/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{',
    });

    const response = await handleApiAIRequest(request, { fetchFn });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ success: false, error: 'Invalid JSON body' });
  });

  it('reports request body parse errors via onError', async () => {
    const fetchFn = vi.fn(
      async () => new Response('should not be called'),
    ) as unknown as typeof fetch;
    const onError = vi.fn();

    const request = new Request('http://localhost/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{',
    });

    const response = await handleApiAIRequest(request, { fetchFn, onError });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(response.status).toBe(400);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[1]).toEqual({ stage: 'parseRequestBodyJson' });
  });

  it('forwards model listing requests to /v1/models', async () => {
    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://example.com/v1/models');
      expect(init?.method).toBe('GET');
      expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer test-key');
      return new Response('{"data":["m1"]}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as unknown as typeof fetch;

    const request = new Request('http://localhost/api/ai?action=models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost' },
      body: JSON.stringify({
        baseUrl: 'example.com',
        apiKey: 'test-key',
      }),
    });

    const response = await handleApiAIRequest(request, {
      fetchFn,
      allowedBaseUrlHosts: ['example.com'],
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/json');
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost');
    expect(await response.text()).toBe('{"data":["m1"]}');
  });

  it('forwards upstream streams without buffering', async () => {
    const upstreamBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: hello\n\n'));
        controller.close();
      },
    });

    const upstream = {
      status: 200,
      headers: new Headers({ 'Content-Type': 'text/event-stream' }),
      body: upstreamBody,
      text: () => {
        throw new Error('upstream.text() should not be called');
      },
    } as unknown as Response;

    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://api.openai.com/v1/chat/completions');
      expect(init?.method).toBe('POST');
      expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer test-key');
      return upstream;
    }) as unknown as typeof fetch;

    const request = new Request('http://localhost/api/ai?action=chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost' },
      body: JSON.stringify({
        apiKey: 'test-key',
        payload: { model: 'gpt-test', messages: [], stream: true },
      }),
    });

    const response = await handleApiAIRequest(request, { fetchFn });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(response.body).toBe(upstreamBody);
    expect(response.headers.get('Content-Type')).toBe('text/event-stream');
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost');
  });

  it('allows wildcard subdomain hosts', async () => {
    const payload = { model: 'gpt-test', messages: [] };

    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://api.example.com/v1/chat/completions');
      expect(init?.method).toBe('POST');
      expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer test-key');
      expect(init?.body).toBe(JSON.stringify(payload));
      return new Response('{"id":"1"}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as unknown as typeof fetch;

    const request = new Request('http://localhost/api/ai?action=chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost' },
      body: JSON.stringify({
        baseUrl: 'https://api.example.com/v1',
        apiKey: 'test-key',
        payload,
      }),
    });

    const response = await handleApiAIRequest(request, {
      fetchFn,
      allowedBaseUrlHosts: ['*.example.com'],
    });

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('{"id":"1"}');
  });

  it('does not allow wildcard patterns to match apex domains', async () => {
    const payload = { model: 'gpt-test', messages: [] };

    const fetchFn = vi.fn(
      async () => new Response('should not be called'),
    ) as unknown as typeof fetch;

    const request = new Request('http://localhost/api/ai?action=chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseUrl: 'https://example.com/v1',
        apiKey: 'test-key',
        payload,
      }),
    });

    const response = await handleApiAIRequest(request, {
      fetchFn,
      allowedBaseUrlHosts: ['*.example.com'],
    });

    expect(fetchFn).not.toHaveBeenCalled();
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ success: false, error: 'baseUrl host not allowed' });
  });

  it('allows matching later port allowlist entries', async () => {
    const payload = { model: 'gpt-test', messages: [] };

    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://example.com:8443/v1/chat/completions');
      expect(init?.method).toBe('POST');
      expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer test-key');
      expect(init?.body).toBe(JSON.stringify(payload));
      return new Response('{"id":"1"}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as unknown as typeof fetch;

    const request = new Request('http://localhost/api/ai?action=chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost' },
      body: JSON.stringify({
        baseUrl: 'https://example.com:8443/v1',
        apiKey: 'test-key',
        payload,
      }),
    });

    const response = await handleApiAIRequest(request, {
      fetchFn,
      allowedBaseUrlHosts: ['example.com:443', 'example.com:8443'],
    });

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('{"id":"1"}');
  });

  it('rejects non-https baseUrl schemes by default', async () => {
    const payload = { model: 'gpt-test', messages: [] };

    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      throw new Error(`should not be called: ${String(input)} ${init?.method}`);
    }) as unknown as typeof fetch;

    const request = new Request('http://localhost/api/ai?action=chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseUrl: 'ftp://example.com/v1',
        apiKey: 'test-key',
        payload,
      }),
    });

    const response = await handleApiAIRequest(request, { fetchFn });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ success: false, error: 'Invalid baseUrl protocol' });
  });

  it('reports baseUrl parse errors via onError', async () => {
    const payload = { model: 'gpt-test', messages: [] };
    const fetchFn = vi.fn(
      async () => new Response('should not be called'),
    ) as unknown as typeof fetch;
    const onError = vi.fn();

    const request = new Request('http://localhost/api/ai?action=chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseUrl: 'https://%%%%',
        apiKey: 'test-key',
        payload,
      }),
    });

    const response = await handleApiAIRequest(request, { fetchFn, onError });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(response.status).toBe(400);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[1]).toEqual({ stage: 'parseBaseUrl' });
  });

  it('uses default OpenAI baseUrl when baseUrl is omitted', async () => {
    const payload = { model: 'gpt-test', messages: [] };

    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://api.openai.com/v1/chat/completions');
      expect(init?.method).toBe('POST');
      expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer test-key');
      expect(init?.body).toBe(JSON.stringify(payload));
      return new Response('{"id":"1"}', {
        status: 201,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      });
    }) as unknown as typeof fetch;

    const request = new Request('http://localhost/api/ai?action=chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost' },
      body: JSON.stringify({
        apiKey: 'test-key',
        payload,
      }),
    });

    const response = await handleApiAIRequest(request, { fetchFn });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(201);
    expect(response.headers.get('Content-Type')).toBe('application/json; charset=utf-8');
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost');
    expect(await response.text()).toBe('{"id":"1"}');
  });

  it('rejects baseUrl hosts that are not allowlisted', async () => {
    const payload = { model: 'gpt-test', messages: [] };

    const fetchFn = vi.fn(
      async () => new Response('should not be called'),
    ) as unknown as typeof fetch;

    const request = new Request('http://localhost/api/ai?action=chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseUrl: 'https://example.com/v1',
        apiKey: 'test-key',
        payload,
      }),
    });

    const response = await handleApiAIRequest(request, { fetchFn });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ success: false, error: 'baseUrl host not allowed' });
  });

  it('rejects allow-all host patterns', async () => {
    const payload = { model: 'gpt-test', messages: [] };
    const fetchFn = vi.fn(
      async () => new Response('should not be called'),
    ) as unknown as typeof fetch;

    const request = new Request('http://localhost/api/ai?action=chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseUrl: 'https://example.com/v1',
        apiKey: 'test-key',
        payload,
      }),
    });

    const response = await handleApiAIRequest(request, { fetchFn, allowedBaseUrlHosts: ['*'] });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ success: false, error: 'baseUrl host not allowed' });
  });

  it('follows allowlisted upstream redirects', async () => {
    const payload = { model: 'gpt-test', messages: [] };

    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      expect(init?.redirect).toBe('manual');

      if (url.endsWith('/v1/chat/completions')) {
        return new Response(null, {
          status: 308,
          headers: { Location: '/v1/chat/completions/' },
        });
      }

      expect(url).toBe('https://example.com/v1/chat/completions/');
      expect(init?.method).toBe('POST');
      expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer test-key');
      expect(init?.body).toBe(JSON.stringify(payload));

      return new Response('{"id":"1"}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as unknown as typeof fetch;

    const request = new Request('http://localhost/api/ai?action=chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost' },
      body: JSON.stringify({
        baseUrl: 'https://example.com/v1',
        apiKey: 'test-key',
        payload,
      }),
    });

    const response = await handleApiAIRequest(request, {
      fetchFn,
      allowedBaseUrlHosts: ['example.com'],
    });
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('{"id":"1"}');
  });

  it('blocks upstream redirects to disallowed hosts', async () => {
    const payload = { model: 'gpt-test', messages: [] };

    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://example.com/v1/chat/completions');
      expect(init?.redirect).toBe('manual');
      return new Response(null, {
        status: 307,
        headers: { Location: 'https://evil.com/v1/chat/completions' },
      });
    }) as unknown as typeof fetch;

    const request = new Request('http://localhost/api/ai?action=chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseUrl: 'https://example.com/v1',
        apiKey: 'test-key',
        payload,
      }),
    });

    const response = await handleApiAIRequest(request, {
      fetchFn,
      allowedBaseUrlHosts: ['example.com'],
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      success: false,
      error: 'Upstream redirect not allowed',
    });
  });

  it('allows bracketed IPv6 literals in allowlist patterns', async () => {
    const payload = { model: 'gpt-test', messages: [] };

    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://[2001:db8::1]/v1/chat/completions');
      expect(init?.method).toBe('POST');
      expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer test-key');
      expect(init?.body).toBe(JSON.stringify(payload));
      return new Response('{"id":"1"}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as unknown as typeof fetch;

    const request = new Request('http://localhost/api/ai?action=chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost' },
      body: JSON.stringify({
        baseUrl: 'https://[2001:db8::1]/v1',
        apiKey: 'test-key',
        payload,
      }),
    });

    const response = await handleApiAIRequest(request, {
      fetchFn,
      allowedBaseUrlHosts: ['[2001:db8::1]'],
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('{"id":"1"}');
  });

  it('blocks IPv6 loopback even when allowlisted', async () => {
    const payload = { model: 'gpt-test', messages: [] };

    const fetchFn = vi.fn(
      async () => new Response('should not be called'),
    ) as unknown as typeof fetch;

    const request = new Request('http://localhost/api/ai?action=chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseUrl: 'https://[::1]/v1',
        apiKey: 'test-key',
        payload,
      }),
    });

    const response = await handleApiAIRequest(request, {
      fetchFn,
      allowedBaseUrlHosts: ['[::1]'],
    });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ success: false, error: 'baseUrl host not allowed' });
  });

  it('blocks IPv4-mapped loopback in IPv6 literals', async () => {
    const payload = { model: 'gpt-test', messages: [] };

    const fetchFn = vi.fn(
      async () => new Response('should not be called'),
    ) as unknown as typeof fetch;

    const request = new Request('http://localhost/api/ai?action=chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseUrl: 'https://[::ffff:127.0.0.1]/v1',
        apiKey: 'test-key',
        payload,
      }),
    });

    const response = await handleApiAIRequest(request, {
      fetchFn,
      allowedBaseUrlHosts: ['https://[::ffff:7f00:1]'],
    });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ success: false, error: 'baseUrl host not allowed' });
  });
});
