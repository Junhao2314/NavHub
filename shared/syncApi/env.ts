import type { Env, SyncApiEnv } from './types';

export const normalizeSyncApiEnv = (env: SyncApiEnv): Env => {
    const kv = env.YNAV_KV ?? env.YNAV_WORKER_KV;
    if (!kv) {
        throw new Error('Missing KV binding: YNAV_KV / YNAV_WORKER_KV');
    }
    return {
        ...env,
        YNAV_KV: kv
    };
};
