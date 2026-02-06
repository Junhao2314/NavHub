import { getErrorMessage } from '../../utils/error';
import { jsonResponse } from '../../utils/response';
import { requireAdminAccess } from '../auth';
import {
  getMainData,
  getMainDataWithEtag,
  normalizeSyncKind,
  putMainData,
  saveSyncHistory,
} from '../kv';
import { normalizeNavHubSyncData } from '../navHubSyncData';
import { sanitizeSensitiveData } from '../sanitize';
import type { Env, NavHubSyncData, SyncHistoryKind } from '../types';
import { getUtf8ByteLength, KV_VALUE_MAX_BYTES } from './limits';

// POST /api/sync - 写入云端数据
export async function handlePost(request: Request, env: Env): Promise<Response> {
  const authError = await requireAdminAccess(request, env);
  if (authError) return authError;

  let body: {
    data?: unknown;
    /**
     * 用于乐观锁校验（客户端期望的“当前云端 version”）。
     *
     * - 当 expectedVersion 与云端当前 version 不一致时，说明期间有其他设备写入过：返回 409 + 最新云端数据，交由客户端处理冲突。
     * - 注意：在 KV 模式下这里只能做“读后校验”的 best-effort（KV 不支持原子 compare-and-set 且存在最终一致性）。
     * - 在 R2 模式下会结合 ETag 做条件写（onlyIf），从而把“读-校验-写”变成更可靠的原子语义。
     */
    expectedVersion?: unknown;
    syncKind?: unknown;
    skipHistory?: unknown; // 纯统计同步：仍写入主数据/版本号，但不写入 navhub:backup:history-* 同步记录（避免刷屏）
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonResponse(
      {
        success: false,
        error: '无效的 JSON 请求体',
      },
      { status: 400 },
    );
  }

  try {
    const incomingData = normalizeNavHubSyncData(body.data);
    if (!incomingData) {
      return jsonResponse(
        {
          success: false,
          error: '无效的 data 字段',
        },
        { status: 400 },
      );
    }

    // 获取当前云端数据进行版本校验（R2 模式下同时获取 etag，用于条件写）
    // 说明：etag 是 R2 对象的版本标识，可用于实现“只有当对象仍是我读到的那一版时才写入”。
    let existing = await getMainDataWithEtag(env);
    let existingData = existing.data;
    let existingEtag = existing.etag;

    const expectedVersion =
      typeof body.expectedVersion === 'number' && Number.isFinite(body.expectedVersion)
        ? body.expectedVersion
        : undefined;

    // 如果云端有数据且客户端提供了期望版本号，进行冲突检测
    if (existingData && expectedVersion !== undefined) {
      if (existingData.meta.version !== expectedVersion) {
        // 版本冲突，返回云端数据让客户端处理
        return jsonResponse(
          {
            success: false,
            conflict: true,
            data: sanitizeSensitiveData(existingData),
            error: '版本冲突，云端数据已被其他设备更新',
          },
          { status: 409 },
        );
      }
    }

    // R2 + expectedVersion: 必须要有 etag 才能做条件写（否则会退化成 last-write-wins）。
    if (env.NAVHUB_R2 && expectedVersion !== undefined && existingData && !existingEtag) {
      // 理论上 r2.get 应该会返回 etag；这里做一次兜底刷新，避免极端情况下“误以为没法条件写”。
      existing = await getMainDataWithEtag(env);
      existingData = existing.data;
      existingEtag = existing.etag;
      if (existingData && !existingEtag) {
        return jsonResponse(
          {
            success: false,
            error: 'R2 etag missing',
          },
          { status: 500 },
        );
      }
    }

    // 服务端是 meta 的权威来源：统一生成 updatedAt/version/syncKind，避免客户端时间漂移/篡改导致排序与冲突判断异常。
    const newVersion = existingData ? existingData.meta.version + 1 : 1;
    const now = Date.now();
    const kind = normalizeSyncKind(body.syncKind as SyncHistoryKind);
    const incomingMeta = incomingData.meta;
    const dataToSave: NavHubSyncData = sanitizeSensitiveData({
      ...incomingData,
      meta: {
        ...incomingMeta,
        updatedAt: now,
        version: newVersion,
        syncKind: kind,
      },
    });

    if (!env.NAVHUB_R2) {
      const encodedBytes = getUtf8ByteLength(JSON.stringify(dataToSave));
      if (encodedBytes > KV_VALUE_MAX_BYTES) {
        return jsonResponse(
          {
            success: false,
            error:
              '数据过大，超过 Cloudflare KV 25MB 限制。建议绑定 R2（NAVHUB_R2 / NAVHUB_WORKER_R2）作为主同步存储。',
          },
          { status: 413 },
        );
      }
    }

    // 写入主数据：优先使用 R2（更强一致性、支持条件写），否则回退 KV。
    // - expectedVersion 存在 => 需要“带锁写入”。
    // - R2：使用 etagMatches / etagDoesNotMatch('*') 实现原子条件写。
    // - KV：无法原子条件写，这里的 options 仅用于对齐接口语义（最终效果仍是 last-write-wins）。
    const needsLock = expectedVersion !== undefined;
    const lockedWriteOk = await putMainData(
      env,
      dataToSave,
      needsLock
        ? existingData
          ? { onlyIfEtagMatches: existingEtag! }
          : { onlyIfNotExists: true }
        : undefined,
    );
    if (!lockedWriteOk) {
      // 条件写失败：返回最新云端数据，让客户端走冲突处理流程
      const latest = await getMainData(env);
      return jsonResponse(
        {
          success: false,
          conflict: true,
          data: latest ? sanitizeSensitiveData(latest) : null,
          error: '版本冲突，云端数据已被其他设备更新',
        },
        { status: 409 },
      );
    }

    // skipHistory 用于“纯统计同步”，避免点击统计等高频同步占用“最近 20 次同步记录”名额。
    // 默认策略：
    // - auto 同步：默认不写入同步记录（除非显式 skipHistory=false）
    // - manual 同步：默认写入同步记录（除非显式 skipHistory=true）
    const shouldSkipHistory =
      body.skipHistory === true || (body.skipHistory !== false && kind !== 'manual');
    let historyKey: string | null = null;
    if (!shouldSkipHistory) {
      try {
        historyKey = await saveSyncHistory(env, dataToSave, kind);
      } catch {
        historyKey = null;
      }
    }

    return jsonResponse({
      success: true,
      data: dataToSave,
      historyKey,
      message: '同步成功',
    });
  } catch (error: unknown) {
    return jsonResponse(
      {
        success: false,
        error: getErrorMessage(error, '写入失败'),
      },
      { status: 500 },
    );
  }
}
