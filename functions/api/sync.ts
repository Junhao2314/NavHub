/**
 * Cloudflare Pages Function: KV 同步 API
 *
 * Thin wrapper around the shared implementation in `shared/syncApi.ts`.
 */

import { handleApiSyncRequest, type SyncApiEnv } from '../../shared/syncApi';
import { parseEnvBool } from '../../shared/utils/env';
import { applySecurityHeaders } from '../../shared/utils/securityHeaders';

type PagesSyncEnv = SyncApiEnv & {
  SECURITY_HEADERS_CSP_MODE?: string;
  SECURITY_HEADERS_HSTS_PRELOAD?: string;
};

export const onRequest = async (context: { request: Request; env: PagesSyncEnv }) => {
  const response = await handleApiSyncRequest(context.request, context.env);
  return applySecurityHeaders(response, {
    context: 'api',
    cspMode: context.env.SECURITY_HEADERS_CSP_MODE,
    enableHstsPreload: parseEnvBool(context.env.SECURITY_HEADERS_HSTS_PRELOAD),
    request: context.request,
  });
};
