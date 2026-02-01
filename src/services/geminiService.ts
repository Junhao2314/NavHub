import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { AIConfig } from "../types";

/**
 * Helper to call OpenAI Compatible API
 */
const callOpenAICompatible = async (config: AIConfig, systemPrompt: string, userPrompt: string): Promise<string> => {
    try {
        let baseUrl = config.baseUrl.replace(/\/$/, '');
        // If user didn't provide full path, assume /v1/chat/completions logic or just trust them
        // Common convention: if URL ends with /v1, append /chat/completions
        if (!baseUrl.includes('/chat/completions')) {
            if (baseUrl.endsWith('/v1')) {
                baseUrl += '/chat/completions';
            } else {
                // If it's just a domain like api.openai.com, usually implies /v1/chat/completions
                // But let's assume user might input full path or standard base. 
                // To be safe, let's append /chat/completions if not present
                baseUrl += '/chat/completions';
            }
        }

        const response = await fetch(baseUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.apiKey}`
            },
            body: JSON.stringify({
                model: config.model,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userPrompt }
                ],
                temperature: 0.7
            })
        });

        if (!response.ok) {
            const err = await response.text();
            console.error("OpenAI API Error:", err);
            return "";
        }

        const data = await response.json();
        return data.choices?.[0]?.message?.content?.trim() || "";
    } catch (e) {
        console.error("OpenAI Call Failed", e);
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
    if (!config.apiKey) return [];

    try {
        if (config.provider === 'gemini') {
            // Use REST API for listing models to keep it guaranteed
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${config.apiKey}`);
            if (!response.ok) return [];
            const data = await response.json();
            // Data format: { models: [{ name: 'models/gemini-pro', ... }] }
            if (data.models && Array.isArray(data.models)) {
                return data.models
                    .map((m: any) => m.name.replace('models/', '')) // Strip prefix
                    .filter((n: string) => n.includes('gemini')); // Simple filter
            }
            return [];
        } else {
            // OpenAI Compatible
            // Need to extract base URL from the config which might be user entered
            let baseUrl = config.baseUrl || 'https://api.openai.com/v1';
            // Common Cleanup: remove /chat/completions if user added it
            baseUrl = baseUrl.replace(/\/chat\/completions\/?$/, '');
            baseUrl = baseUrl.replace(/\/v1\/?$/, ''); // We often need to add /v1 back for models, strictly speaking /v1/models is standard

            // Re-construct standard path
            const modelsUrl = `${baseUrl}/v1/models`;

            const response = await fetch(modelsUrl, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${config.apiKey}`
                }
            });

            if (!response.ok) {
                return [];
            }

            const data = await response.json();
            // OpenAI format: { data: [ { id: 'gpt-3.5-turbo', ... } ] }
            if (data.data && Array.isArray(data.data)) {
                return data.data.map((m: any) => m.id).sort();
            }
            return [];
        }
    } catch (e) {
        console.error("Fetch Models Failed", e);
        return [];
    }
};
