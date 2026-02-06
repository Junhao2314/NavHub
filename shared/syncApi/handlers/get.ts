import { getErrorMessage } from '../../utils/error';
import { jsonResponse } from '../../utils/response';
import { isAdminRequest, isSyncProtected, requireAdminAccess } from '../auth';
import { ensureSyncHistoryIndexForListing, getMainData } from '../kv';
import { normalizeNavHubSyncData } from '../navHubSyncData';
import { sanitizePublicData, sanitizeSensitiveData } from '../sanitize';
import type { Env, NavHubSyncData, SyncHistoryIndex } from '../types';

const HISTORY_FALLBACK_READ_CONCURRENCY = 4;

const safeReadSyncHistoryCandidate = async (
  env: Env,
  key: string,
): Promise<NavHubSyncData | null> => {
  try {
    const raw = (await env.NAVHUB_KV.get(key, 'json')) as unknown;
    return normalizeNavHubSyncData(raw);
  } catch {
    return null;
  }
};

const findNewestValidSyncHistoryCandidate = async (
  env: Env,
  candidates: SyncHistoryIndex['items'],
): Promise<NavHubSyncData | null> => {
  if (candidates.length === 0) return null;

  const concurrency = Math.max(
    1,
    Math.min(HISTORY_FALLBACK_READ_CONCURRENCY, Math.floor(candidates.length)),
  );

  let nextIndexToStart = 0;
  const inFlight = new Map<number, Promise<NavHubSyncData | null>>();
  const settled = new Map<number, NavHubSyncData | null>();
  let nextIndexToCheck = 0;

  const startNext = (): void => {
    const index = nextIndexToStart;
    const key = candidates[index]?.key;
    nextIndexToStart += 1;
    if (!key) return;
    inFlight.set(
      index,
      safeReadSyncHistoryCandidate(env, key).catch(() => null),
    );
  };

  while (nextIndexToStart < candidates.length && inFlight.size < concurrency) {
    startNext();
  }

  while (inFlight.size > 0) {
    const { index, data } = await Promise.race(
      Array.from(inFlight.entries()).map(([idx, promise]) =>
        promise.then((value) => ({ index: idx, data: value })),
      ),
    );
    inFlight.delete(index);
    settled.set(index, data);

    while (nextIndexToStart < candidates.length && inFlight.size < concurrency) {
      startNext();
    }

    while (settled.has(nextIndexToCheck)) {
      const resolved = settled.get(nextIndexToCheck) ?? null;
      settled.delete(nextIndexToCheck);
      if (resolved) return resolved;
      nextIndexToCheck += 1;
    }
  }

  return null;
};

// GET /api/sync - 读取云端数据
export async function handleGet(request: Request, env: Env): Promise<Response> {
  const providedPassword = (request.headers.get('X-Sync-Password') || '').trim();
  if (isSyncProtected(env) && providedPassword) {
    const authError = await requireAdminAccess(request, env);
    if (authError) return authError;
  }

  const isAdmin = isAdminRequest(request, env);

  try {
    const data = await getMainData(env);

    if (!data) {
      // 主数据缺失时，尝试回退到最近的同步历史记录
      let historyExisted = false;
      try {
        const index = await ensureSyncHistoryIndexForListing(env);
        const candidates = index?.items ?? [];
        historyExisted = candidates.length > 0;
        const backupData = await findNewestValidSyncHistoryCandidate(env, candidates);
        if (backupData) {
          return jsonResponse({
            success: true,
            role: isAdmin ? 'admin' : 'user',
            data: isAdmin ? sanitizeSensitiveData(backupData) : sanitizePublicData(backupData),
            message: '主数据缺失，已回退到最近同步记录',
            fallback: true,
          });
        }
      } catch {
        // ignore fallback errors and return empty
      }

      // emptyReason 区分空数据原因：
      // - "virgin": 首次使用，从未同步过（无历史记录）
      // - "lost": 数据丢失，曾经同步过（有历史记录但恢复失败）
      const emptyReason = historyExisted ? 'lost' : 'virgin';

      return jsonResponse({
        success: true,
        data: null,
        message: emptyReason === 'virgin' ? '云端暂无数据' : '云端数据丢失，历史记录恢复失败',
        emptyReason,
      });
    }

    return jsonResponse({
      success: true,
      role: isAdmin ? 'admin' : 'user',
      data: isAdmin ? sanitizeSensitiveData(data) : sanitizePublicData(data),
    });
  } catch (error: unknown) {
    return jsonResponse(
      {
        success: false,
        error: getErrorMessage(error, '读取失败'),
      },
      { status: 500 },
    );
  }
}
