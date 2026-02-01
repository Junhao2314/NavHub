import { describe, expect, it } from 'vitest';
import { resolveSyncCorsHeaders } from '../../shared/syncApi/cors';

describe('/api/sync CORS', () => {
  it('allows same-origin requests by default', () => {
    const request = new Request('http://localhost/api/sync', {
      method: 'OPTIONS',
      headers: { Origin: 'http://localhost' },
    });

    const { headers, allowed } = resolveSyncCorsHeaders(request);

    expect(allowed).toBe(true);
    expect(headers['Access-Control-Allow-Origin']).toBe('http://localhost');
    expect(headers['Access-Control-Allow-Methods']).toBe('GET, POST, DELETE, OPTIONS');
    expect(headers['Access-Control-Allow-Headers']).toBe('Content-Type, X-Sync-Password');
    expect(headers.Vary).toBe('Origin');
  });

  it('rejects disallowed origins by default', () => {
    const request = new Request('http://localhost/api/sync', {
      method: 'OPTIONS',
      headers: { Origin: 'https://evil.com' },
    });

    const { headers, allowed } = resolveSyncCorsHeaders(request);

    expect(allowed).toBe(false);
    expect(headers['Access-Control-Allow-Origin']).toBeUndefined();
  });

  it('allows configured origins', () => {
    const request = new Request('http://localhost/api/sync', {
      method: 'OPTIONS',
      headers: { Origin: 'https://dev.example.com' },
    });

    const { headers, allowed } = resolveSyncCorsHeaders(request, {
      corsAllowedOrigins: ['https://dev.example.com'],
    });

    expect(allowed).toBe(true);
    expect(headers['Access-Control-Allow-Origin']).toBe('https://dev.example.com');
    expect(headers.Vary).toBe('Origin');
  });

  it('allows any origin when wildcard is configured', () => {
    const request = new Request('http://localhost/api/sync', {
      method: 'OPTIONS',
      headers: { Origin: 'https://dev.example.com' },
    });

    const { headers, allowed } = resolveSyncCorsHeaders(request, {
      corsAllowedOrigins: ['*'],
    });

    expect(allowed).toBe(true);
    expect(headers['Access-Control-Allow-Origin']).toBe('*');
    expect(headers.Vary).toBeUndefined();
  });
});
