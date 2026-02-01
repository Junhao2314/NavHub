import { getErrorMessage } from '../utils/error';
import { isAdminRequest, isSyncProtected, requireAdminAccess } from './auth';
import {
  BACKUP_TTL_SECONDS,
  ensureSyncHistoryIndexForListing,
  getBackupTimestampForDisplay,
  getMainData,
  getMainDataWithEtag,
  isBackupKey,
  isSyncHistoryKey,
  KV_BACKUP_PREFIX,
  normalizeSyncKind,
  normalizeSyncMeta,
  putMainData,
  readSyncHistoryIndex,
  removeFromSyncHistoryIndexWithIndex,
  SYNC_HISTORY_INDEX_VERSION,
  saveSyncHistory,
} from './kv';
import { normalizeNavHubSyncData } from './navHubSyncData';
import { sanitizePublicData, sanitizeSensitiveData } from './sanitize';
import type { Env, NavHubSyncData, SyncHistoryIndex, SyncHistoryKind } from './types';

const KV_VALUE_MAX_BYTES = 25 * 1024 * 1024;
const kvValueEncoder = new TextEncoder();
const getUtf8ByteLength = (value: string): number => kvValueEncoder.encode(value).length;

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
      return new Response(
        JSON.stringify({
          success: true,
          data: null,
          message: '云端暂无数据',
        }),
        {
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        role: isAdmin ? 'admin' : 'user',
        data: isAdmin ? sanitizeSensitiveData(data) : sanitizePublicData(data),
      }),
      {
        headers: { 'Content-Type': 'application/json' },
      },
    );
  } catch (error: unknown) {
    return new Response(
      JSON.stringify({
        success: false,
        error: getErrorMessage(error, '读取失败'),
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
}

// GET /api/sync?action=auth - 查询当前请求的权限状态
export async function handleAuth(request: Request, env: Env): Promise<Response> {
  const protectedMode = isSyncProtected(env);

  const providedPassword = (request.headers.get('X-Sync-Password') || '').trim();
  if (protectedMode && providedPassword) {
    const authError = await requireAdminAccess(request, env, { clearAttemptsOnSuccess: true });
    if (authError) return authError;
  }

  const isAdmin = isAdminRequest(request, env);

  return new Response(
    JSON.stringify({
      success: true,
      protected: protectedMode,
      role: isAdmin ? 'admin' : 'user',
      canWrite: isAdmin,
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
}

// POST /api/sync?action=login - 管理员登录（带错误次数限制）
export async function handleLogin(request: Request, env: Env): Promise<Response> {
  if (!isSyncProtected(env)) {
    return new Response(
      JSON.stringify({
        success: true,
        protected: false,
        role: 'admin',
        canWrite: true,
      }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  }

  const authError = await requireAdminAccess(request, env, { clearAttemptsOnSuccess: true });
  if (authError) return authError;

  return new Response(
    JSON.stringify({
      success: true,
      protected: true,
      role: 'admin',
      canWrite: true,
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
}

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
    return new Response(
      JSON.stringify({
        success: false,
        error: '无效的 JSON 请求体',
      }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  try {
    const incomingData = normalizeNavHubSyncData(body.data);
    if (!incomingData) {
      return new Response(
        JSON.stringify({
          success: false,
          error: '无效的 data 字段',
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        },
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
        return new Response(
          JSON.stringify({
            success: false,
            conflict: true,
            data: sanitizeSensitiveData(existingData),
            error: '版本冲突，云端数据已被其他设备更新',
          }),
          {
            status: 409,
            headers: { 'Content-Type': 'application/json' },
          },
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
        return new Response(
          JSON.stringify({
            success: false,
            error: 'R2 etag missing',
          }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          },
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
        return new Response(
          JSON.stringify({
            success: false,
            error:
              '数据过大，超过 Cloudflare KV 25MB 限制。建议绑定 R2（NAVHUB_R2 / NAVHUB_WORKER_R2）作为主同步存储。',
          }),
          {
            status: 413,
            headers: { 'Content-Type': 'application/json' },
          },
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
      return new Response(
        JSON.stringify({
          success: false,
          conflict: true,
          data: latest ? sanitizeSensitiveData(latest) : null,
          error: '版本冲突，云端数据已被其他设备更新',
        }),
        {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        },
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

    return new Response(
      JSON.stringify({
        success: true,
        data: dataToSave,
        historyKey,
        message: '同步成功',
      }),
      {
        headers: { 'Content-Type': 'application/json' },
      },
    );
  } catch (error: unknown) {
    return new Response(
      JSON.stringify({
        success: false,
        error: getErrorMessage(error, '写入失败'),
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
}

// POST /api/sync (with action=backup) - 创建快照备份
export async function handleBackup(request: Request, env: Env): Promise<Response> {
  const authError = await requireAdminAccess(request, env);
  if (authError) return authError;

  try {
    let body: { data?: unknown };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return new Response(
        JSON.stringify({
          success: false,
          error: '无效的 JSON 请求体',
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    const incomingData = normalizeNavHubSyncData(body.data);
    if (!incomingData) {
      return new Response(
        JSON.stringify({
          success: false,
          error: '无效的 data 字段',
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    // 生成时间戳格式的备份 key
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-');
    const backupKey = `${KV_BACKUP_PREFIX}${timestamp}`;
    const backupMeta = normalizeSyncMeta(incomingData.meta);
    const dataToSave = sanitizeSensitiveData({ ...incomingData, meta: backupMeta });

    const encodedBytes = getUtf8ByteLength(JSON.stringify(dataToSave));
    if (encodedBytes > KV_VALUE_MAX_BYTES) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            '数据过大，超过 Cloudflare KV 25MB 限制。备份/历史目前仍存 KV，因此无法备份超过 25MB 的数据。',
        }),
        {
          status: 413,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    // 写入备份
    await env.NAVHUB_KV.put(backupKey, JSON.stringify(dataToSave), {
      // 备份保留 30 天
      expirationTtl: BACKUP_TTL_SECONDS,
    });

    return new Response(
      JSON.stringify({
        success: true,
        backupKey,
        message: `备份成功: ${backupKey}`,
      }),
      {
        headers: { 'Content-Type': 'application/json' },
      },
    );
  } catch (error: unknown) {
    return new Response(
      JSON.stringify({
        success: false,
        error: getErrorMessage(error, '备份失败'),
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
}

// POST /api/sync (with action=restore) - 从备份恢复并创建回滚点
export async function handleRestoreBackup(request: Request, env: Env): Promise<Response> {
  const authError = await requireAdminAccess(request, env);
  if (authError) return authError;

  try {
    let body: { backupKey?: string; deviceId?: string };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return new Response(
        JSON.stringify({
          success: false,
          error: '无效的 JSON 请求体',
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }
    const backupKey = body.backupKey;

    if (!backupKey || !isBackupKey(backupKey)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: '无效的备份 key',
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    const backupRaw = (await env.NAVHUB_KV.get(backupKey, 'json')) as unknown;
    const backupData = normalizeNavHubSyncData(backupRaw);
    if (!backupData) {
      return new Response(
        JSON.stringify({
          success: false,
          error: '备份不存在或已过期',
        }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    const existingData = await getMainData(env);
    const now = Date.now();
    let rollbackKey: string | null = null;

    if (existingData) {
      const existingMeta = normalizeSyncMeta(existingData.meta);
      const rollbackTimestamp = new Date(now).toISOString().replace(/[:.]/g, '-');
      rollbackKey = `${KV_BACKUP_PREFIX}rollback-${rollbackTimestamp}`;
      const rollbackData: NavHubSyncData = sanitizeSensitiveData({
        ...existingData,
        meta: {
          ...existingMeta,
          updatedAt: now,
          deviceId: body.deviceId || existingMeta.deviceId,
        },
      });
      try {
        const encodedBytes = getUtf8ByteLength(JSON.stringify(rollbackData));
        if (encodedBytes > KV_VALUE_MAX_BYTES) {
          rollbackKey = null;
        } else {
          await env.NAVHUB_KV.put(rollbackKey, JSON.stringify(rollbackData), {
            expirationTtl: BACKUP_TTL_SECONDS,
          });
        }
      } catch {
        rollbackKey = null;
      }
    }

    const newVersion = (existingData?.meta?.version ?? 0) + 1;
    const restoredMeta = normalizeSyncMeta(backupData.meta);
    const restoredData: NavHubSyncData = sanitizeSensitiveData({
      ...backupData,
      meta: {
        ...restoredMeta,
        updatedAt: now,
        deviceId: body.deviceId || restoredMeta.deviceId,
        version: newVersion,
        syncKind: 'manual',
      },
    });

    if (!env.NAVHUB_R2) {
      const encodedBytes = getUtf8ByteLength(JSON.stringify(restoredData));
      if (encodedBytes > KV_VALUE_MAX_BYTES) {
        return new Response(
          JSON.stringify({
            success: false,
            error:
              '数据过大，超过 Cloudflare KV 25MB 限制。建议绑定 R2（NAVHUB_R2 / NAVHUB_WORKER_R2）作为主同步存储。',
          }),
          {
            status: 413,
            headers: { 'Content-Type': 'application/json' },
          },
        );
      }
    }

    await putMainData(env, restoredData);

    try {
      await saveSyncHistory(env, restoredData, 'manual');
    } catch {
      // ignore history failures
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: restoredData,
        rollbackKey,
      }),
      {
        headers: { 'Content-Type': 'application/json' },
      },
    );
  } catch (error: unknown) {
    return new Response(
      JSON.stringify({
        success: false,
        error: getErrorMessage(error, '恢复失败'),
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
}

// GET /api/sync (with action=backup) - 获取备份数据（用于导出）
export async function handleGetBackup(request: Request, env: Env): Promise<Response> {
  const authError = await requireAdminAccess(request, env);
  if (authError) return authError;

  const url = new URL(request.url);
  const backupKey = url.searchParams.get('backupKey');

  if (!backupKey || !isBackupKey(backupKey)) {
    return new Response(
      JSON.stringify({
        success: false,
        error: '无效的备份 key',
      }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  try {
    const backupRaw = (await env.NAVHUB_KV.get(backupKey, 'json')) as unknown;
    const backupData = normalizeNavHubSyncData(backupRaw);
    if (!backupData) {
      return new Response(
        JSON.stringify({
          success: false,
          error: '备份不存在或已过期',
        }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: sanitizeSensitiveData(backupData),
      }),
      {
        headers: { 'Content-Type': 'application/json' },
      },
    );
  } catch (error: unknown) {
    return new Response(
      JSON.stringify({
        success: false,
        error: getErrorMessage(error, '读取备份失败'),
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
}

// GET /api/sync (with action=backups) - 获取备份列表
export async function handleListBackups(request: Request, env: Env): Promise<Response> {
  const authError = await requireAdminAccess(request, env);
  if (authError) return authError;

  try {
    const currentData = await getMainData(env);
    const currentVersion = currentData?.meta?.version;

    let index: SyncHistoryIndex | null = null;
    try {
      index = await ensureSyncHistoryIndexForListing(env);
    } catch {
      try {
        index = await readSyncHistoryIndex(env);
      } catch {
        index = null;
      }
    }
    if (!index) {
      index = { version: SYNC_HISTORY_INDEX_VERSION, items: [] };
    }

    const backups = index.items.map((item) => {
      const meta = item.meta;
      const kind = normalizeSyncKind(meta?.syncKind);
      return {
        key: item.key,
        timestamp: getBackupTimestampForDisplay(item.key),
        kind,
        deviceId: meta?.deviceId,
        updatedAt: meta?.updatedAt,
        version: meta?.version,
        browser: meta?.browser,
        os: meta?.os,
        isCurrent: typeof currentVersion === 'number' && meta?.version === currentVersion,
      };
    });

    return new Response(
      JSON.stringify({
        success: true,
        backups: backups.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)),
      }),
      {
        headers: { 'Content-Type': 'application/json' },
      },
    );
  } catch (error: unknown) {
    return new Response(
      JSON.stringify({
        success: false,
        error: getErrorMessage(error, '获取备份列表失败'),
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
}

// DELETE /api/sync (with action=backup) - 删除指定备份
export async function handleDeleteBackup(request: Request, env: Env): Promise<Response> {
  const authError = await requireAdminAccess(request, env);
  if (authError) return authError;

  try {
    let body: { backupKey?: string };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return new Response(
        JSON.stringify({
          success: false,
          error: '无效的 JSON 请求体',
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }
    const backupKey = body.backupKey;

    if (!backupKey || !isBackupKey(backupKey)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: '无效的备份 key',
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    const isHistoryKey = isSyncHistoryKey(backupKey);

    // 非同步历史记录：删除操作可幂等，避免为了“是否存在”多一次 KV.get（Read）。
    if (!isHistoryKey) {
      await env.NAVHUB_KV.delete(backupKey);
      return new Response(
        JSON.stringify({
          success: true,
          message: '备份已删除',
        }),
        {
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    // 同步历史记录：优先读 index 获取 meta/version（用于“禁止删除当前记录”校验 + 索引更新），减少 KV.get(backupKey) 的 Read。
    let index: SyncHistoryIndex | null = null;
    try {
      index = await readSyncHistoryIndex(env);
    } catch {
      index = null;
    }

    const indexedVersion = index?.items.find((item) => item.key === backupKey)?.meta?.version;

    const currentData = await getMainData(env);
    const currentVersion = currentData?.meta?.version;

    if (typeof currentVersion === 'number') {
      if (typeof indexedVersion === 'number' && indexedVersion === currentVersion) {
        return new Response(
          JSON.stringify({
            success: false,
            error: '当前记录不允许删除',
          }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          },
        );
      }

      // index 缺失/未命中时，回退读取备份本体做版本校验（保持历史行为，尤其是 index 未建立/损坏时）。
      if (typeof indexedVersion !== 'number') {
        try {
          const backupRaw = (await env.NAVHUB_KV.get(backupKey, 'json')) as unknown;
          const backupData = normalizeNavHubSyncData(backupRaw);
          const backupVersion = backupData?.meta?.version;
          if (typeof backupVersion === 'number' && backupVersion === currentVersion) {
            return new Response(
              JSON.stringify({
                success: false,
                error: '当前记录不允许删除',
              }),
              {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
              },
            );
          }
        } catch {
          // ignore best-effort fallback
        }
      }
    }

    // 删除备份（幂等）
    await env.NAVHUB_KV.delete(backupKey);
    if (index) {
      try {
        await removeFromSyncHistoryIndexWithIndex(env, backupKey, index);
      } catch {
        // ignore index update failures
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: '备份已删除',
      }),
      {
        headers: { 'Content-Type': 'application/json' },
      },
    );
  } catch (error: unknown) {
    return new Response(
      JSON.stringify({
        success: false,
        error: getErrorMessage(error, '删除失败'),
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
}
