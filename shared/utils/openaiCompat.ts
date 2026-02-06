export const DEFAULT_OPENAI_COMPAT_BASE_URL = 'https://api.openai.com/v1';

export type OpenAICompatibleUrls = {
  chatCompletionsUrl: string;
  modelsUrl: string;
};

export type BuildOpenAICompatibleUrlsOnError = (
  error: unknown,
  context: { stage: 'buildOpenAICompatibleUrls' },
) => void;

export function ensureHttpScheme(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function buildOpenAICompatibleUrls(
  baseUrlInput: string,
  onError?: BuildOpenAICompatibleUrlsOnError,
): OpenAICompatibleUrls {
  const normalizedInput = ensureHttpScheme(baseUrlInput) || DEFAULT_OPENAI_COMPAT_BASE_URL;

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(normalizedInput);
  } catch (error: unknown) {
    onError?.(error, { stage: 'buildOpenAICompatibleUrls' });
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
