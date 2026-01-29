/**
 * Cloudflare Pages Function: KV 同步 API
 *
 * Thin wrapper around the shared implementation in `shared/syncApi.ts`.
 */

import { handleApiSyncRequest, type SyncApiEnv } from '../../shared/syncApi';

export const onRequest = async (context: { request: Request; env: SyncApiEnv }) => {
  return handleApiSyncRequest(context.request, context.env);
};
