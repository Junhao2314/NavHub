import type { Env, SyncApiEnv } from './types';

export const normalizeSyncApiEnv = (env: SyncApiEnv): Env => {
  const kv = env.NAVHUB_KV ?? env.NAVHUB_WORKER_KV;
  if (!kv) {
    throw new Error('Missing KV binding: NAVHUB_KV / NAVHUB_WORKER_KV');
  }
  const r2 = env.NAVHUB_R2 ?? env.NAVHUB_WORKER_R2;
  return {
    ...env,
    NAVHUB_KV: kv,
    ...(r2 ? { NAVHUB_R2: r2 } : {}),
  };
};
