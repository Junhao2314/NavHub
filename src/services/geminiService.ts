import { GenerateContentResponse, GoogleGenAI } from '@google/genai';
import {
  buildOpenAICompatibleUrls,
  DEFAULT_OPENAI_COMPAT_BASE_URL,
} from '../../shared/utils/openaiCompat';
import i18n from '../config/i18n';
import { AIConfig } from '../types';
import { isGeminiModelsListResponse, isOpenAIModelsListResponse } from '../utils/typeGuards';

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
        return i18n.t('settings.ai.missingApiKey');
      case 'MISSING_MODEL':
        return i18n.t('settings.ai.missingModel');
      case 'NETWORK_ERROR':
        return i18n.t('errors.networkErrorRetry');
      case 'API_ERROR':
        return i18n.t('settings.ai.apiError');
      case 'INVALID_RESPONSE':
        return i18n.t('settings.ai.invalidResponse');
      case 'UNKNOWN_ERROR':
      default:
        return i18n.t('errors.unknownError');
    }
  }
}

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

  const prompt = i18n.t('settings.ai.linkDescriptionUserPrompt', { title, url });

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
      i18n.t('settings.ai.linkDescriptionSystemPrompt'),
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

    const rawData: unknown = await response.json();
    if (!isGeminiModelsListResponse(rawData)) {
      return [];
    }
    const data = rawData;
    if (data.models && Array.isArray(data.models)) {
      return data.models
        .map((model) => (typeof model?.name === 'string' ? model.name.replace('models/', '') : ''))
        .filter((name) => name.includes('gemini'));
    }
    return [];
  } else {
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

    const rawData: unknown = await response.json();
    if (!isOpenAIModelsListResponse(rawData)) {
      return [];
    }
    const data = rawData;
    if (data.data && Array.isArray(data.data)) {
      return data.data
        .map((model) => (typeof model?.id === 'string' ? model.id : ''))
        .filter(Boolean)
        .sort();
    }
    return [];
  }
};
