import { describe, expect, it } from 'vitest';
import {
  applySecurityHeaders,
  resolveSecurityHeadersCspMode,
} from '../../shared/utils/securityHeaders';

describe('resolveSecurityHeadersCspMode', () => {
  it('defaults to report-only for unknown values', () => {
    expect(resolveSecurityHeadersCspMode()).toBe('report-only');
    expect(resolveSecurityHeadersCspMode('invalid')).toBe('report-only');
  });

  it('accepts supported csp modes', () => {
    expect(resolveSecurityHeadersCspMode('off')).toBe('off');
    expect(resolveSecurityHeadersCspMode('report-only')).toBe('report-only');
    expect(resolveSecurityHeadersCspMode('enforce')).toBe('enforce');
  });
});

describe('applySecurityHeaders', () => {
  it('adds document headers and report-only CSP for html responses by default', () => {
    const response = applySecurityHeaders(
      new Response('<!doctype html>', {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      }),
      {
        context: 'static',
        request: new Request('https://example.com/'),
      },
    );

    expect(response.headers.get('Content-Security-Policy')).toBeNull();
    expect(response.headers.get('Content-Security-Policy-Report-Only')).toContain(
      "script-src 'self'",
    );
    expect(response.headers.get('Cross-Origin-Opener-Policy')).toBe('same-origin');
    expect(response.headers.get('Cross-Origin-Resource-Policy')).toBe('same-origin');
    expect(response.headers.get('Permissions-Policy')).toContain('camera=()');
    expect(response.headers.get('Strict-Transport-Security')).toBe(
      'max-age=31536000; includeSubDomains',
    );
    expect(response.headers.get('X-Frame-Options')).toBe('DENY');
  });

  it('adds resource headers to non-html static assets without CSP', () => {
    const response = applySecurityHeaders(
      new Response('body { color: red; }', {
        headers: { 'Content-Type': 'text/css; charset=utf-8' },
      }),
      {
        context: 'static',
        cspMode: 'enforce',
        request: new Request('https://example.com/app.css'),
      },
    );

    expect(response.headers.get('Content-Security-Policy')).toBeNull();
    expect(response.headers.get('Content-Security-Policy-Report-Only')).toBeNull();
    expect(response.headers.get('Cross-Origin-Resource-Policy')).toBe('same-origin');
  });

  it('uses enforcing CSP when configured', () => {
    const response = applySecurityHeaders(
      new Response('<!doctype html>', {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      }),
      {
        context: 'static',
        cspMode: 'enforce',
        request: new Request('https://example.com/'),
      },
    );

    expect(response.headers.get('Content-Security-Policy')).toContain("default-src 'self'");
    expect(response.headers.get('Content-Security-Policy-Report-Only')).toBeNull();
  });

  it('omits CSP when mode is off', () => {
    const response = applySecurityHeaders(
      new Response('<!doctype html>', {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      }),
      {
        context: 'static',
        cspMode: 'off',
        request: new Request('https://example.com/'),
      },
    );

    expect(response.headers.get('Content-Security-Policy')).toBeNull();
    expect(response.headers.get('Content-Security-Policy-Report-Only')).toBeNull();
  });

  it('adds base headers but no CSP for api responses', () => {
    const response = applySecurityHeaders(
      new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json' },
      }),
      {
        context: 'api',
        cspMode: 'enforce',
        request: new Request('https://example.com/api/sync'),
      },
    );

    expect(response.headers.get('Content-Security-Policy')).toBeNull();
    expect(response.headers.get('Content-Security-Policy-Report-Only')).toBeNull();
    expect(response.headers.get('Cross-Origin-Opener-Policy')).toBeNull();
    expect(response.headers.get('Cross-Origin-Resource-Policy')).toBeNull();
    expect(response.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('skips HSTS on non-https requests and supports preload when enabled', () => {
    const httpResponse = applySecurityHeaders(
      new Response('ok', {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      }),
      {
        context: 'api',
        request: new Request('http://localhost/api/health'),
      },
    );
    expect(httpResponse.headers.get('Strict-Transport-Security')).toBeNull();

    const httpsResponse = applySecurityHeaders(
      new Response('<!doctype html>', {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      }),
      {
        context: 'static',
        enableHstsPreload: true,
        request: new Request('https://example.com/'),
      },
    );
    expect(httpsResponse.headers.get('Strict-Transport-Security')).toBe(
      'max-age=31536000; includeSubDomains; preload',
    );
  });
});
