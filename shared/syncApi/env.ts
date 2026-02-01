import type { Env, SyncApiEnv } from './types';

export const normalizeSyncApiEnv = (env: SyncApiEnv): Env => {
  const kv = env.YNAV_KV ?? env.YNAV_WORKER_KV;
  if (!kv) {
    throw new Error('Missing KV binding: YNAV_KV / YNAV_WORKER_KV');
  }
  const r2 = env.YNAV_R2 ?? env.YNAV_WORKER_R2;
  return {
    ...env,
    YNAV_KV: kv,
    ...(r2 ? { YNAV_R2: r2 } : {}),
  };
};
