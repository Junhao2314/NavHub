/**
 * Cloudflare Pages Function: OpenAI Compatible Proxy
 *
 * Delegates to shared implementation so Worker/Pages stay consistent.
 */

import { handleApiAIRequest } from '../../shared/aiProxy';
import { parseEnvBool, parseEnvList } from '../../shared/utils/env';
import { applySecurityHeaders } from '../../shared/utils/securityHeaders';

type PagesEnv = Record<string, string | undefined>;

export const onRequest = async (context: {
  request: Request;
  env?: PagesEnv;
}): Promise<Response> => {
  const env = context.env || {};
  const response = await handleApiAIRequest(context.request, {
    allowedBaseUrlHosts: parseEnvList(env.AI_PROXY_ALLOWED_HOSTS),
    corsAllowedOrigins: parseEnvList(env.AI_PROXY_ALLOWED_ORIGINS),
    allowInsecureHttp: parseEnvBool(env.AI_PROXY_ALLOW_INSECURE_HTTP),
  });
  return applySecurityHeaders(response, {
    context: 'api',
    cspMode: env.SECURITY_HEADERS_CSP_MODE,
    enableHstsPreload: parseEnvBool(env.SECURITY_HEADERS_HSTS_PRELOAD),
    request: context.request,
  });
};
