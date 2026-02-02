import { GenerateContentResponse, GoogleGenAI } from '@google/genai';
import { AIConfig } from '../types';

const DEFAULT_OPENAI_COMPAT_BASE_URL = 'https://api.openai.com/v1';

/** AI 服务错误类型 */
export type AIErrorCode =
  | 'MISSING_API_KEY'
  | 'MISSING_MODEL'
  | 'NETWORK_ERROR'
  | 'API_ERROR'
  | 'INVALID_RESPONSE'
  | 'UNKNOWN_ERROR';

/** AI 服务错误 */
export class AIServiceError extends Error {
  constructor(
    public readonly code: AIErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'AIServiceError';
  }

  /** 获取用户友好的错误消息 */
  getUserMessage(): string {
    switch (this.code) {
      case 'MISSING_API_KEY':
        return '请在设置中配置 API Key';
      case 'MISSING_MODEL':
        return '请选择 AI 模型';
      case 'NETWORK_ERROR':
        return '网络连接失败，请检查网络';
      case 'API_ERROR':
        return 'AI 服务调用失败，请稍后重试';
      case 'INVALID_RESPONSE':
        return 'AI 返回了无效响应';
      case 'UNKNOWN_ERROR':
      default:
        return '发生未知错误';
    }
  }
}

type OpenAICompatibleUrls = {
  chatCompletionsUrl: string;
  modelsUrl: string;
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

  const origin = parsedUrl.origin;
  const pathname = parsedUrl.pathname.replace(/\/+$/, ''); // drop trailing slash
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

/**
 * Helper to call OpenAI Compatible API
 * @throws {AIServiceError} 当调用失败时抛出
 */
const callOpenAICompatible = async (
  config: AIConfig,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> => {
  const apiKey = config.apiKey.trim();
  const model = config.model.trim();
  const baseUrlInput = (config.baseUrl || DEFAULT_OPENAI_COMPAT_BASE_URL).trim();
  const { chatCompletionsUrl } = buildOpenAICompatibleUrls(baseUrlInput);

  if (!apiKey) {
    throw new AIServiceError('MISSING_API_KEY', 'API Key is required');
  }
  if (!model) {
    throw new AIServiceError('MISSING_MODEL', 'Model is required');
  }

  const payload = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.7,
  };

  let response: Response;
  try {
    response = await fetch(chatCompletionsUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });
  } catch (directError) {
    // Fallback: same-origin proxy to bypass browser CORS restrictions.
    console.warn('Direct OpenAI Compatible request failed, trying /api/ai proxy...', directError);
    try {
      response = await fetch('/api/ai?action=chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          baseUrl: baseUrlInput,
          apiKey,
          payload,
        }),
      });
    } catch (proxyError) {
      throw new AIServiceError('NETWORK_ERROR', 'Failed to connect to AI service', proxyError);
    }
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => 'Unknown error');
    throw new AIServiceError('API_ERROR', `API returned ${response.status}: ${errText}`, {
      status: response.status,
      body: errText,
    });
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text ?? '';
  if (typeof content !== 'string' || !content.trim()) {
    throw new AIServiceError('INVALID_RESPONSE', 'AI returned empty or invalid response');
  }
  return content.trim();
};

/**
 * Uses configured AI to generate a description
 * @throws {AIServiceError} 当调用失败时抛出
 */
export const generateLinkDescription = async (
  title: string,
  url: string,
  config: AIConfig,
): Promise<string> => {
  if (!config.apiKey) {
    throw new AIServiceError('MISSING_API_KEY', 'API Key is required');
  }

  const prompt = `Title: ${title}
URL: ${url}

为这个网站写一句简短的中文描述（最多15个字），说明它的用途。

输出规则：
- 只输出描述文本本身
- 禁止输出引号、前缀、后缀
- 禁止输出 FINISH、Done、完成、END 等标记词
- 禁止输出任何解释或额外文字`;

  const sanitizeDescription = (text: string): string => {
    return text
      .replace(/^["'`「」『』""'']+|["'`「」『』""'']+$/g, '') // 移除首尾引号
      .replace(/\s*(FINISH|Done|完成|\[END\]|END|finished|结束)[\s.。]*$/i, '') // 移除结束标记
      .trim();
  };

  if (config.provider === 'gemini') {
    try {
      const ai = new GoogleGenAI({ apiKey: config.apiKey });
      const modelName = config.model || 'gemini-2.5-flash';

      const response: GenerateContentResponse = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
      });
      const text = response.text?.trim();
      if (!text) {
        throw new AIServiceError('INVALID_RESPONSE', 'Gemini returned empty response');
      }
      return sanitizeDescription(text);
    } catch (error) {
      if (error instanceof AIServiceError) throw error;
      throw new AIServiceError('API_ERROR', 'Gemini API call failed', error);
    }
  } else {
    // OpenAI Compatible - callOpenAICompatible 已经会抛出 AIServiceError
    const result = await callOpenAICompatible(
      config,
      '你是一个网站描述生成助手。只输出描述文本，不要输出任何标记词、引号或额外内容。',
      prompt,
    );
    return sanitizeDescription(result);
  }
};

/**
 * Suggests a category
 * @returns 分类 ID，如果无法分类则返回 null
 * @throws {AIServiceError} 当调用失败时抛出
 */
export const suggestCategory = async (
  title: string,
  url: string,
  categories: { id: string; name: string }[],
  config: AIConfig,
): Promise<string | null> => {
  if (!config.apiKey) {
    throw new AIServiceError('MISSING_API_KEY', 'API Key is required');
  }
  if (categories.length === 0) return null;

  const fallbackId = categories.find((c) => c.id === 'common')?.id || categories[0].id;

  const catList = categories.map((c) => `${c.id}: ${c.name}`).join('\n');
  const prompt = `
        Website: "${title}" (${url})

        Available Categories:
        ${catList}

        Return ONLY the 'id' of the best matching category. If unsure, return '${fallbackId}'.
    `;

  const normalizeCategoryId = (value: string | null | undefined): string | null => {
    if (!value) return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    return categories.some((c) => c.id === trimmed) ? trimmed : fallbackId;
  };

  if (config.provider === 'gemini') {
    try {
      const ai = new GoogleGenAI({ apiKey: config.apiKey });
      const modelName = config.model || 'gemini-2.5-flash';

      const response: GenerateContentResponse = await ai.models.generateContent({
        model: modelName,
        contents: `Task: Categorize this website.\n${prompt}`,
      });
      return normalizeCategoryId(response.text);
    } catch (error) {
      if (error instanceof AIServiceError) throw error;
      throw new AIServiceError('API_ERROR', 'Gemini API call failed', error);
    }
  } else {
    // OpenAI Compatible
    const result = await callOpenAICompatible(
      config,
      'You are an intelligent classification assistant. You only output the category ID.',
      prompt,
    );
    return normalizeCategoryId(result);
  }
};

/**
 * Tests the connection to the AI provider
 * @throws {AIServiceError} 当连接测试失败时抛出
 */
export const testAIConnection = async (config: AIConfig): Promise<boolean> => {
  if (!config.apiKey) {
    throw new AIServiceError('MISSING_API_KEY', 'API Key is required');
  }

  if (config.provider === 'gemini') {
    try {
      const ai = new GoogleGenAI({ apiKey: config.apiKey });
      const modelName = config.model || 'gemini-2.5-flash';
      await ai.models.generateContent({
        model: modelName,
        contents: 'Hello',
      });
      return true;
    } catch (error) {
      throw new AIServiceError('API_ERROR', 'Gemini connection test failed', error);
    }
  } else {
    // OpenAI Test - callOpenAICompatible 会抛出错误
    await callOpenAICompatible(config, 'You are a connection tester.', 'Ping');
    return true;
  }
};

/**
 * Fetches available models from the provider
 * @throws {AIServiceError} 当获取模型列表失败时抛出
 */
export const fetchAvailableModels = async (config: AIConfig): Promise<string[]> => {
  const apiKey = config.apiKey.trim();
  if (!apiKey) {
    throw new AIServiceError('MISSING_API_KEY', 'API Key is required');
  }

  if (config.provider === 'gemini') {
    type GeminiModelsListResponse = {
      models?: Array<{ name?: unknown }>;
    };
    let response: Response;
    try {
      response = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'x-goog-api-key': apiKey,
        },
      });
    } catch (error) {
      throw new AIServiceError('NETWORK_ERROR', 'Failed to fetch Gemini models', error);
    }

    if (!response.ok) {
      throw new AIServiceError('API_ERROR', `Failed to fetch models: ${response.status}`, {
        status: response.status,
      });
    }

    const data = (await response.json()) as GeminiModelsListResponse;
    if (data.models && Array.isArray(data.models)) {
      return data.models
        .map((model) => (typeof model?.name === 'string' ? model.name.replace('models/', '') : ''))
        .filter((name) => name.includes('gemini'));
    }
    return [];
  } else {
    type OpenAIModelsListResponse = {
      data?: Array<{ id?: unknown }>;
    };
    const baseUrlInput = (config.baseUrl || DEFAULT_OPENAI_COMPAT_BASE_URL).trim();
    const { modelsUrl } = buildOpenAICompatibleUrls(baseUrlInput);

    let response: Response;
    try {
      response = await fetch(modelsUrl, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
      });
    } catch (directError) {
      console.warn(
        'Direct OpenAI Compatible models request failed, trying /api/ai proxy...',
        directError,
      );
      try {
        response = await fetch('/api/ai?action=models', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            baseUrl: baseUrlInput,
            apiKey,
          }),
        });
      } catch (proxyError) {
        throw new AIServiceError('NETWORK_ERROR', 'Failed to fetch models', proxyError);
      }
    }

    if (!response.ok) {
      throw new AIServiceError('API_ERROR', `Failed to fetch models: ${response.status}`, {
        status: response.status,
      });
    }

    const data = (await response.json()) as OpenAIModelsListResponse;
    if (data.data && Array.isArray(data.data)) {
      return data.data
        .map((model) => (typeof model?.id === 'string' ? model.id : ''))
        .filter(Boolean)
        .sort();
    }
    return [];
  }
};
