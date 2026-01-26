import { isAdminRequest, isSyncProtected, requireAdminAccess } from './auth';
import {
    BACKUP_TTL_SECONDS,
    KV_BACKUP_PREFIX,
    KV_MAIN_DATA_KEY,
    SYNC_HISTORY_INDEX_VERSION,
    ensureSyncHistoryIndexForListing,
    getBackupTimestampForDisplay,
    getMainData,
    isBackupKey,
    isSyncHistoryKey,
    normalizeSyncKind,
    readSyncHistoryIndex,
    removeFromSyncHistoryIndex,
    saveSyncHistory
} from './kv';
import { sanitizePublicData, sanitizeSensitiveData } from './sanitize';
import type { Env, NavHubSyncData, SyncHistoryIndex, SyncHistoryKind } from './types';
import { getErrorMessage } from '../utils/error';

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
            return new Response(JSON.stringify({
                success: true,
                data: null,
                message: '云端暂无数据'
            }), {
                headers: { 'Content-Type': 'application/json' }
            });
        }

        return new Response(JSON.stringify({
            success: true,
            role: isAdmin ? 'admin' : 'user',
            data: isAdmin ? sanitizeSensitiveData(data) : sanitizePublicData(data)
        }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error: unknown) {
        return new Response(JSON.stringify({
            success: false,
            error: getErrorMessage(error, '读取失败')
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

// GET /api/sync?action=auth - 查询当前请求的权限状态
export async function handleAuth(request: Request, env: Env): Promise<Response> {
    const protectedMode = isSyncProtected(env);

    const providedPassword = (request.headers.get('X-Sync-Password') || '').trim();
    if (protectedMode && providedPassword) {
        const authError = await requireAdminAccess(request, env);
        if (authError) return authError;
    }

    const isAdmin = isAdminRequest(request, env);

    return new Response(JSON.stringify({
        success: true,
        protected: protectedMode,
        role: isAdmin ? 'admin' : 'user',
        canWrite: isAdmin
    }), { headers: { 'Content-Type': 'application/json' } });
}

// POST /api/sync?action=login - 管理员登录（带错误次数限制）
export async function handleLogin(request: Request, env: Env): Promise<Response> {
    if (!isSyncProtected(env)) {
        return new Response(JSON.stringify({
            success: true,
            protected: false,
            role: 'admin',
            canWrite: true
        }), { headers: { 'Content-Type': 'application/json' } });
    }

    const authError = await requireAdminAccess(request, env);
    if (authError) return authError;

    return new Response(JSON.stringify({
        success: true,
        protected: true,
        role: 'admin',
        canWrite: true
    }), { headers: { 'Content-Type': 'application/json' } });
}

// POST /api/sync - 写入云端数据
export async function handlePost(request: Request, env: Env): Promise<Response> {
    const authError = await requireAdminAccess(request, env);
    if (authError) return authError;

    try {
        const body = await request.json() as {
            data: NavHubSyncData;
            expectedVersion?: number;  // 用于乐观锁校验
            syncKind?: SyncHistoryKind;
            skipHistory?: boolean; // 纯统计同步：仍写入主数据/版本号，但不写入 ynav:backup:history-* 同步记录（避免刷屏）
        };

        if (!body.data) {
            return new Response(JSON.stringify({
                success: false,
                error: '缺少 data 字段'
            }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // 获取当前云端数据进行版本校验
        const existingData = await getMainData(env);

        // 如果云端有数据且客户端提供了期望版本号，进行冲突检测
        if (existingData && body.expectedVersion !== undefined) {
            if (existingData.meta.version !== body.expectedVersion) {
                // 版本冲突，返回云端数据让客户端处理
                return new Response(JSON.stringify({
                    success: false,
                    conflict: true,
                    data: sanitizeSensitiveData(existingData),
                    error: '版本冲突，云端数据已被其他设备更新'
                }), {
                    status: 409,
                    headers: { 'Content-Type': 'application/json' }
                });
            }
        }

        // 确保 meta 信息完整
        const newVersion = existingData ? existingData.meta.version + 1 : 1;
        const now = Date.now();
        const kind = normalizeSyncKind(body.syncKind);
        const dataToSave: NavHubSyncData = sanitizeSensitiveData({
            ...body.data,
            meta: {
                ...body.data.meta,
                updatedAt: now,
                version: newVersion,
                syncKind: kind
            }
        });

        // 写入 KV
        await env.YNAV_KV.put(KV_MAIN_DATA_KEY, JSON.stringify(dataToSave));

        // skipHistory 用于“纯统计同步”，避免点击统计等高频同步占用“最近 20 次同步记录”名额。
        let historyKey: string | null = null;
        if (!body.skipHistory) {
            try {
                historyKey = await saveSyncHistory(env, dataToSave, kind);
            } catch {
                historyKey = null;
            }
        }

        return new Response(JSON.stringify({
            success: true,
            data: dataToSave,
            historyKey,
            message: '同步成功'
        }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error: unknown) {
        return new Response(JSON.stringify({
            success: false,
            error: getErrorMessage(error, '写入失败')
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

// POST /api/sync (with action=backup) - 创建快照备份
export async function handleBackup(request: Request, env: Env): Promise<Response> {
    const authError = await requireAdminAccess(request, env);
    if (authError) return authError;

    try {
        const body = await request.json() as { data: NavHubSyncData };

        if (!body.data) {
            return new Response(JSON.stringify({
                success: false,
                error: '缺少 data 字段'
            }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // 生成时间戳格式的备份 key
        const now = new Date();
        const timestamp = now.toISOString().replace(/[:.]/g, '-');
        const backupKey = `${KV_BACKUP_PREFIX}${timestamp}`;
        const dataToSave = sanitizeSensitiveData(body.data);

        // 写入备份
        await env.YNAV_KV.put(backupKey, JSON.stringify(dataToSave), {
            // 备份保留 30 天
            expirationTtl: BACKUP_TTL_SECONDS
        });

        return new Response(JSON.stringify({
            success: true,
            backupKey,
            message: `备份成功: ${backupKey}`
        }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error: unknown) {
        return new Response(JSON.stringify({
            success: false,
            error: getErrorMessage(error, '备份失败')
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

// POST /api/sync (with action=restore) - 从备份恢复并创建回滚点
export async function handleRestoreBackup(request: Request, env: Env): Promise<Response> {
    const authError = await requireAdminAccess(request, env);
    if (authError) return authError;

    try {
        const body = await request.json() as { backupKey?: string; deviceId?: string };
        const backupKey = body.backupKey;

        if (!backupKey || !isBackupKey(backupKey)) {
            return new Response(JSON.stringify({
                success: false,
                error: '无效的备份 key'
            }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const backupData = await env.YNAV_KV.get(backupKey, 'json') as NavHubSyncData | null;
        if (!backupData) {
            return new Response(JSON.stringify({
                success: false,
                error: '备份不存在或已过期'
            }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const existingData = await getMainData(env);
        const now = Date.now();
        let rollbackKey: string | null = null;

        if (existingData) {
            const rollbackTimestamp = new Date(now).toISOString().replace(/[:.]/g, '-');
            rollbackKey = `${KV_BACKUP_PREFIX}rollback-${rollbackTimestamp}`;
            const rollbackData: NavHubSyncData = sanitizeSensitiveData({
                ...existingData,
                meta: {
                    ...existingData.meta,
                    updatedAt: now,
                    deviceId: body.deviceId || existingData.meta.deviceId
                }
            });
            await env.YNAV_KV.put(rollbackKey, JSON.stringify(rollbackData), {
                expirationTtl: BACKUP_TTL_SECONDS
            });
        }

        const newVersion = (existingData?.meta?.version ?? 0) + 1;
        const restoredData: NavHubSyncData = sanitizeSensitiveData({
            ...backupData,
            meta: {
                ...(backupData.meta || {}),
                updatedAt: now,
                deviceId: body.deviceId || backupData.meta?.deviceId || 'unknown',
                version: newVersion,
                syncKind: 'manual'
            }
        });

        await env.YNAV_KV.put(KV_MAIN_DATA_KEY, JSON.stringify(restoredData));

        try {
            await saveSyncHistory(env, restoredData, 'manual');
        } catch {
            // ignore history failures
        }

        return new Response(JSON.stringify({
            success: true,
            data: restoredData,
            rollbackKey
        }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error: unknown) {
        return new Response(JSON.stringify({
            success: false,
            error: getErrorMessage(error, '恢复失败')
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

// GET /api/sync (with action=backup) - 获取备份数据（用于导出）
export async function handleGetBackup(request: Request, env: Env): Promise<Response> {
    const authError = await requireAdminAccess(request, env);
    if (authError) return authError;

    const url = new URL(request.url);
    const backupKey = url.searchParams.get('backupKey') || url.searchParams.get('key');

    if (!backupKey || !isBackupKey(backupKey)) {
        return new Response(JSON.stringify({
            success: false,
            error: '无效的备份 key'
        }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    try {
        const backupData = await env.YNAV_KV.get(backupKey, 'json') as NavHubSyncData | null;
        if (!backupData) {
            return new Response(JSON.stringify({
                success: false,
                error: '备份不存在或已过期'
            }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        return new Response(JSON.stringify({
            success: true,
            data: sanitizeSensitiveData(backupData)
        }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error: unknown) {
        return new Response(JSON.stringify({
            success: false,
            error: getErrorMessage(error, '读取备份失败')
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
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
                isCurrent: typeof currentVersion === 'number' && meta?.version === currentVersion
            };
        });

        return new Response(JSON.stringify({
            success: true,
            backups: backups.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
        }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error: unknown) {
        return new Response(JSON.stringify({
            success: false,
            error: getErrorMessage(error, '获取备份列表失败')
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

// DELETE /api/sync (with action=backup) - 删除指定备份
export async function handleDeleteBackup(request: Request, env: Env): Promise<Response> {
    const authError = await requireAdminAccess(request, env);
    if (authError) return authError;

    try {
        const body = await request.json() as { backupKey?: string };
        const backupKey = body.backupKey;

        if (!backupKey || !isBackupKey(backupKey)) {
            return new Response(JSON.stringify({
                success: false,
                error: '无效的备份 key'
            }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // 检查备份是否存在
        const backupData = await env.YNAV_KV.get(backupKey, 'json') as NavHubSyncData | null;
        if (!backupData) {
            return new Response(JSON.stringify({
                success: false,
                error: '备份不存在或已过期'
            }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        if (isSyncHistoryKey(backupKey)) {
            const currentData = await getMainData(env);
            const currentVersion = currentData?.meta?.version;
            if (typeof currentVersion === 'number' && backupData?.meta?.version === currentVersion) {
                return new Response(JSON.stringify({
                    success: false,
                    error: '当前记录不允许删除'
                }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' }
                });
            }
        }

        // 删除备份
        await env.YNAV_KV.delete(backupKey);
        if (isSyncHistoryKey(backupKey)) {
            try {
                await removeFromSyncHistoryIndex(env, backupKey);
            } catch {
                // ignore index update failures
            }
        }

        return new Response(JSON.stringify({
            success: true,
            message: '备份已删除'
        }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error: unknown) {
        return new Response(JSON.stringify({
            success: false,
            error: getErrorMessage(error, '删除失败')
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
