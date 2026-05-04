import { describe, expect, it, vi } from 'vitest';

import worker from '../../worker/index';

function createEnv(response = new Response('asset ok', { status: 200 })) {
  return {
    ASSETS: {
      fetch: vi.fn(async () => response),
    },
  } as const;
}

describe('worker dev-only routes', () => {
  it.each([
    '/sync-diagnostic.html',
    '/__internal/sync-diagnostic',
  ])('returns 404 for %s', async (pathname) => {
    const env = createEnv();

    const response = await worker.fetch(
      new Request(`https://example.com${pathname}`),
      env as never,
      {} as never,
    );

    expect(response.status).toBe(404);
    expect(await response.text()).toBe('Not Found');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('X-Frame-Options')).toBe('DENY');
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex, nofollow, noarchive');
    expect(env.ASSETS.fetch).not.toHaveBeenCalled();
  });

  it('delegates other static assets to ASSETS.fetch', async () => {
    const env = createEnv();
    const request = new Request('https://example.com/favicon.ico');

    const response = await worker.fetch(request, env as never, {} as never);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('asset ok');
    expect(response.headers.get('Cross-Origin-Resource-Policy')).toBe('same-origin');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(env.ASSETS.fetch).toHaveBeenCalledOnce();
    expect(env.ASSETS.fetch).toHaveBeenCalledWith(request);
  });

  it('adds report-only CSP headers to html documents by default', async () => {
    const env = createEnv(
      new Response('<!doctype html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      }),
    );

    const response = await worker.fetch(
      new Request('https://example.com/'),
      env as never,
      {} as never,
    );

    expect(response.headers.get('Content-Security-Policy')).toBeNull();
    expect(response.headers.get('Content-Security-Policy-Report-Only')).toContain(
      "default-src 'self'",
    );
    expect(response.headers.get('Cross-Origin-Opener-Policy')).toBe('same-origin');
  });

  it('supports enforcing CSP via environment configuration', async () => {
    const env = {
      ...createEnv(
        new Response('<!doctype html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        }),
      ),
      SECURITY_HEADERS_CSP_MODE: 'enforce',
    };

    const response = await worker.fetch(
      new Request('https://example.com/'),
      env as never,
      {} as never,
    );

    expect(response.headers.get('Content-Security-Policy')).toContain("script-src 'self'");
    expect(response.headers.get('Content-Security-Policy-Report-Only')).toBeNull();
  });
});
