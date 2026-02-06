import { getErrorMessage } from '../../utils/error';
import { jsonResponse } from '../../utils/response';
import { requireAdminAccess } from '../auth';
import {
  BACKUP_TTL_SECONDS,
  ensureSyncHistoryIndexForListing,
  getBackupTimestampForDisplay,
  getMainData,
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
} from '../kv';
import { normalizeNavHubSyncData } from '../navHubSyncData';
import { sanitizeSensitiveData } from '../sanitize';
import type { Env, NavHubSyncData, SyncHistoryIndex } from '../types';
import { getUtf8ByteLength, KV_VALUE_MAX_BYTES } from './limits';

// POST /api/sync (with action=backup) - 创建快照备份
export async function handleBackup(request: Request, env: Env): Promise<Response> {
  const authError = await requireAdminAccess(request, env);
  if (authError) return authError;

  try {
    let body: { data?: unknown };
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

    // 生成时间戳格式的备份 key
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-');
    const backupKey = `${KV_BACKUP_PREFIX}${timestamp}`;
    const backupMeta = normalizeSyncMeta(incomingData.meta);
    const dataToSave = sanitizeSensitiveData({ ...incomingData, meta: backupMeta });

    const encodedBytes = getUtf8ByteLength(JSON.stringify(dataToSave));
    if (encodedBytes > KV_VALUE_MAX_BYTES) {
      return jsonResponse(
        {
          success: false,
          error:
            '数据过大，超过 Cloudflare KV 25MB 限制。备份/历史目前仍存 KV，因此无法备份超过 25MB 的数据。',
        },
        { status: 413 },
      );
    }

    // 写入备份
    await env.NAVHUB_KV.put(backupKey, JSON.stringify(dataToSave), {
      // 备份保留 30 天
      expirationTtl: BACKUP_TTL_SECONDS,
    });

    return jsonResponse({
      success: true,
      backupKey,
      message: `备份成功: ${backupKey}`,
    });
  } catch (error: unknown) {
    return jsonResponse(
      {
        success: false,
        error: getErrorMessage(error, '备份失败'),
      },
      { status: 500 },
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
      return jsonResponse(
        {
          success: false,
          error: '无效的 JSON 请求体',
        },
        { status: 400 },
      );
    }
    const backupKey = body.backupKey;

    if (!backupKey || !isBackupKey(backupKey)) {
      return jsonResponse(
        {
          success: false,
          error: '无效的备份 key',
        },
        { status: 400 },
      );
    }

    const backupRaw = (await env.NAVHUB_KV.get(backupKey, 'json')) as unknown;
    const backupData = normalizeNavHubSyncData(backupRaw);
    if (!backupData) {
      return jsonResponse(
        {
          success: false,
          error: '备份不存在或已过期',
        },
        { status: 404 },
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

    await putMainData(env, restoredData);

    try {
      await saveSyncHistory(env, restoredData, 'manual');
    } catch {
      // ignore history failures
    }

    return jsonResponse({
      success: true,
      data: restoredData,
      rollbackKey,
    });
  } catch (error: unknown) {
    return jsonResponse(
      {
        success: false,
        error: getErrorMessage(error, '恢复失败'),
      },
      { status: 500 },
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
    return jsonResponse(
      {
        success: false,
        error: '无效的备份 key',
      },
      { status: 400 },
    );
  }

  try {
    const backupRaw = (await env.NAVHUB_KV.get(backupKey, 'json')) as unknown;
    const backupData = normalizeNavHubSyncData(backupRaw);
    if (!backupData) {
      return jsonResponse(
        {
          success: false,
          error: '备份不存在或已过期',
        },
        { status: 404 },
      );
    }

    return jsonResponse({
      success: true,
      data: sanitizeSensitiveData(backupData),
    });
  } catch (error: unknown) {
    return jsonResponse(
      {
        success: false,
        error: getErrorMessage(error, '读取备份失败'),
      },
      { status: 500 },
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

    return jsonResponse({
      success: true,
      backups: backups.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)),
    });
  } catch (error: unknown) {
    return jsonResponse(
      {
        success: false,
        error: getErrorMessage(error, '获取备份列表失败'),
      },
      { status: 500 },
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
      return jsonResponse(
        {
          success: false,
          error: '无效的 JSON 请求体',
        },
        { status: 400 },
      );
    }
    const backupKey = body.backupKey;

    if (!backupKey || !isBackupKey(backupKey)) {
      return jsonResponse(
        {
          success: false,
          error: '无效的备份 key',
        },
        { status: 400 },
      );
    }

    const isHistoryKey = isSyncHistoryKey(backupKey);

    // 非同步历史记录：删除操作可幂等，避免为了“是否存在”多一次 KV.get（Read）。
    if (!isHistoryKey) {
      await env.NAVHUB_KV.delete(backupKey);
      return jsonResponse({
        success: true,
        message: '备份已删除',
      });
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
        return jsonResponse(
          {
            success: false,
            error: '当前记录不允许删除',
          },
          { status: 400 },
        );
      }

      // index 缺失/未命中时，回退读取备份本体做版本校验（保持历史行为，尤其是 index 未建立/损坏时）。
      if (typeof indexedVersion !== 'number') {
        try {
          const backupRaw = (await env.NAVHUB_KV.get(backupKey, 'json')) as unknown;
          const backupData = normalizeNavHubSyncData(backupRaw);
          const backupVersion = backupData?.meta?.version;
          if (typeof backupVersion === 'number' && backupVersion === currentVersion) {
            return jsonResponse(
              {
                success: false,
                error: '当前记录不允许删除',
              },
              { status: 400 },
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

    return jsonResponse({
      success: true,
      message: '备份已删除',
    });
  } catch (error: unknown) {
    return jsonResponse(
      {
        success: false,
        error: getErrorMessage(error, '删除失败'),
      },
      { status: 500 },
    );
  }
}
