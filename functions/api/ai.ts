/**
 * Cloudflare Pages Function: OpenAI Compatible Proxy
 *
 * Delegates to shared implementation so Worker/Pages stay consistent.
 */

import { handleApiAIRequest } from '../../shared/aiProxy';

type PagesEnv = Record<string, string | undefined>;

const parseEnvList = (value?: string): string[] => {
  if (!value) return [];
  return value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
};

const parseEnvBool = (value?: string): boolean => {
  const normalized = (value || '').trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
};

export const onRequest = async (context: {
  request: Request;
  env?: PagesEnv;
}): Promise<Response> => {
  const env = context.env || {};
  return handleApiAIRequest(context.request, {
    allowedBaseUrlHosts: parseEnvList(env.AI_PROXY_ALLOWED_HOSTS),
    corsAllowedOrigins: parseEnvList(env.AI_PROXY_ALLOWED_ORIGINS),
    allowInsecureHttp: parseEnvBool(env.AI_PROXY_ALLOW_INSECURE_HTTP),
  });
};
