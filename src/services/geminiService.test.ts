import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AIConfig } from '../types';
import { fetchAvailableModels } from './geminiService';

describe('fetchAvailableModels', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('sends Gemini API key via header (not URL)', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      return new Response(
        JSON.stringify({
          models: [{ name: 'models/gemini-2.5-flash' }, { name: 'models/text-bison-001' }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const config: AIConfig = {
      provider: 'gemini',
      apiKey: 'test-key',
      baseUrl: '',
      model: '',
    };

    const models = await fetchAvailableModels(config);

    expect(models).toEqual(['gemini-2.5-flash']);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models');
    expect(String(url)).not.toContain('key=');
    expect(init).toEqual(
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Accept: 'application/json',
          'x-goog-api-key': 'test-key',
        }),
      }),
    );
  });
});
