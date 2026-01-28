import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { AIConfig } from "../types";

const DEFAULT_OPENAI_COMPAT_BASE_URL = 'https://api.openai.com/v1';

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
            modelsUrl: base.replace(/\/chat\/completions$/, '/models')
        };
    }

    if (pathname.endsWith('/models')) {
        return {
            chatCompletionsUrl: base.replace(/\/models$/, '/chat/completions'),
            modelsUrl: base
        };
    }

    if (pathname.endsWith('/v1')) {
        return {
            chatCompletionsUrl: `${base}/chat/completions`,
            modelsUrl: `${base}/models`
        };
    }

    return {
        chatCompletionsUrl: `${base}/v1/chat/completions`,
        modelsUrl: `${base}/v1/models`
    };
};

/**
 * Helper to call OpenAI Compatible API
 */
const callOpenAICompatible = async (config: AIConfig, systemPrompt: string, userPrompt: string): Promise<string> => {
    try {
        const apiKey = config.apiKey.trim();
        const model = config.model.trim();
        const baseUrlInput = (config.baseUrl || DEFAULT_OPENAI_COMPAT_BASE_URL).trim();
        const { chatCompletionsUrl } = buildOpenAICompatibleUrls(baseUrlInput);

        if (!apiKey) return "";
        if (!model) return "";

        const payload = {
            model,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ],
            temperature: 0.7
        };

        let response: Response;
        try {
            response = await fetch(chatCompletionsUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify(payload)
            });
        } catch (directError) {
            // Fallback: same-origin proxy to bypass browser CORS restrictions.
            console.warn('Direct OpenAI Compatible request failed, trying /api/ai proxy...', directError);
            response = await fetch('/api/ai?action=chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                },
                body: JSON.stringify({
                    baseUrl: baseUrlInput,
                    apiKey,
                    payload
                })
            });
        }

        if (!response.ok) {
            const err = await response.text();
            console.error("OpenAI Compatible API Error:", response.status, err);
            return "";
        }

        const data = await response.json();
        const content = data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text ?? "";
        return typeof content === 'string' ? content.trim() : "";
    } catch (e) {
        console.error("OpenAI Compatible Call Failed", e);
        return "";
    }
};

/**
 * Uses configured AI to generate a description
 */
export const generateLinkDescription = async (title: string, url: string, config: AIConfig): Promise<string> => {
    if (!config.apiKey) {
        return "请在设置中配置 API Key";
    }

    const prompt = `
      Title: ${title}
      URL: ${url}
      Please write a very short description (max 15 words) in Chinese (Simplified) that explains what this website is for. Return ONLY the description text. No quotes.
  `;

    try {
        if (config.provider === 'gemini') {
            const ai = new GoogleGenAI({ apiKey: config.apiKey });
            // Use user defined model or fallback
            const modelName = config.model || 'gemini-2.5-flash';

            const response: GenerateContentResponse = await ai.models.generateContent({
                model: modelName,
                contents: `I have a website bookmark. ${prompt}`,
            });
            return response.text ? response.text.trim() : "无法生成描述";
        } else {
            // OpenAI Compatible
            const result = await callOpenAICompatible(
                config,
                "You are a helpful assistant that summarizes website bookmarks.",
                prompt
            );
            return result || "生成描述失败";
        }
    } catch (error) {
        console.error("AI generation error:", error);
        return "生成描述失败";
    }
};

/**
 * Suggests a category
 */
export const suggestCategory = async (title: string, url: string, categories: { id: string, name: string }[], config: AIConfig): Promise<string | null> => {
    if (!config.apiKey) return null;
    if (categories.length === 0) return null;

    const fallbackId = categories.find(c => c.id === 'common')?.id || categories[0].id;

    const catList = categories.map(c => `${c.id}: ${c.name}`).join('\n');
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
        return categories.some(c => c.id === trimmed) ? trimmed : fallbackId;
    };

    try {
        if (config.provider === 'gemini') {
            const ai = new GoogleGenAI({ apiKey: config.apiKey });
            const modelName = config.model || 'gemini-2.5-flash';

            const response: GenerateContentResponse = await ai.models.generateContent({
                model: modelName,
                contents: `Task: Categorize this website.\n${prompt}`,
            });
            return normalizeCategoryId(response.text);
        } else {
            // OpenAI Compatible
            const result = await callOpenAICompatible(
                config,
                "You are an intelligent classification assistant. You only output the category ID.",
                prompt
            );
            return normalizeCategoryId(result);
        }
    } catch (e) {
        console.error(e);
        return null;
    }
}

/**
 * Tests the connection to the AI provider
 */
export const testAIConnection = async (config: AIConfig): Promise<boolean> => {
    if (!config.apiKey) return false;

    try {
        if (config.provider === 'gemini') {
            const ai = new GoogleGenAI({ apiKey: config.apiKey });
            const modelName = config.model || 'gemini-2.5-flash';
            // Try a simple generation
            await ai.models.generateContent({
                model: modelName,
                contents: "Hello",
            });
            return true;
        } else {
            // OpenAI Test
            const result = await callOpenAICompatible(
                config,
                "You are a connection tester.",
                "Ping"
            );
            return result.length > 0;
        }
    } catch (e) {
        console.error("Connection Test Failed", e);
        return false;
    }
};

/**
 * Fetches available models from the provider
 */
export const fetchAvailableModels = async (config: AIConfig): Promise<string[]> => {
    const apiKey = config.apiKey.trim();
    if (!apiKey) return [];

    try {
        if (config.provider === 'gemini') {
            type GeminiModelsListResponse = {
                models?: Array<{ name?: unknown }>;
            };
            // Use REST API for listing models to keep it guaranteed
            const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'x-goog-api-key': apiKey
                }
            });
            if (!response.ok) return [];
            const data = await response.json() as GeminiModelsListResponse;
            // Data format: { models: [{ name: 'models/gemini-pro', ... }] }
            if (data.models && Array.isArray(data.models)) {
                return data.models
                    .map((model) => typeof model?.name === 'string' ? model.name.replace('models/', '') : '')
                    .filter((name) => name.includes('gemini')); // Simple filter
            }
            return [];
        } else {
            type OpenAIModelsListResponse = {
                data?: Array<{ id?: unknown }>;
            };
            // OpenAI Compatible
            const baseUrlInput = (config.baseUrl || DEFAULT_OPENAI_COMPAT_BASE_URL).trim();
            const { modelsUrl } = buildOpenAICompatibleUrls(baseUrlInput);

            if (!apiKey) return [];

            let response: Response;
            try {
                response = await fetch(modelsUrl, {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json',
                        'Authorization': `Bearer ${apiKey}`
                    }
                });
            } catch (directError) {
                // Fallback: same-origin proxy to bypass browser CORS restrictions.
                console.warn('Direct OpenAI Compatible models request failed, trying /api/ai proxy...', directError);
                response = await fetch('/api/ai?action=models', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                    },
                    body: JSON.stringify({
                        baseUrl: baseUrlInput,
                        apiKey
                    })
                });
            }

            if (!response.ok) {
                return [];
            }

            const data = await response.json() as OpenAIModelsListResponse;
            // OpenAI format: { data: [ { id: 'gpt-3.5-turbo', ... } ] }
            if (data.data && Array.isArray(data.data)) {
                return data.data
                    .map((model) => typeof model?.id === 'string' ? model.id : '')
                    .filter(Boolean)
                    .sort();
            }
            return [];
        }
    } catch (e) {
        console.error("Fetch Models Failed", e);
        return [];
    }
};
