/**
 * useSyncEngine - NavHub KV 同步引擎
 * 
 * 功能:
 *   - 页面加载时检测云端数据并处理冲突
 *   - 数据变更时 debounce 自动同步到 KV
 *   - 手动触发备份
 *   - 同步状态管理
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import {
    NavHubSyncData,
    SyncStatus,
    SyncConflict,
    SyncMetadata,
    SyncAuthState,
    SyncRole,
    LinkItem,
    Category,
    SearchConfig,
    AIConfig,
    SiteSettings,
    ThemeMode,
    CustomFaviconCache,
    PrivacyConfig,
    SyncGetResponse,
    SyncAuthResponse,
    SyncPostResponse,
    SyncCreateBackupResponse,
    SyncRestoreBackupResponse,
    SyncDeleteBackupResponse
} from '../types';
import {
    SYNC_DEBOUNCE_MS,
    SYNC_API_ENDPOINT,
    SYNC_META_KEY,
    SYNC_PASSWORD_KEY,
    SYNC_ADMIN_SESSION_KEY,
    getDeviceId,
    getDeviceInfo
} from '../utils/constants';
import { getErrorMessage } from '../utils/error';

const KEEPALIVE_BODY_LIMIT_BYTES = 64 * 1024;
const keepaliveBodyEncoder = new TextEncoder();

const isKeepaliveBodyWithinLimit = (body: string): boolean => {
    return keepaliveBodyEncoder.encode(body).length <= KEEPALIVE_BODY_LIMIT_BYTES;
};

// 同步引擎配置
interface UseSyncEngineOptions {
    onConflict?: (conflict: SyncConflict) => void;
    onSyncComplete?: (data: NavHubSyncData) => void;
    onError?: (error: string) => void;
}

export type PushToCloudOptions = {
    /**
     * 跳过写入“云端同步记录”(history snapshot)。
     *
     * 业务场景：点击统计等高频字段变更（纯统计同步）仍需要同步到云端用于多端一致，
     * 但不希望刷屏“最近 20 次同步记录”（也避免额外的 KV 写放大）。
     */
    skipHistory?: boolean;
    /**
     * 页面关闭/切后台时的兜底同步：用 keepalive 提升请求在卸载阶段送达的概率。
     * 注意：keepalive 请求体大小在不同浏览器有上限（通常 ~64KB）。
     */
    keepalive?: boolean;
};

// 同步引擎返回值
interface UseSyncEngineReturn {
    // 状态
    syncStatus: SyncStatus;
    lastSyncTime: number | null;

    // 操作
    pullFromCloud: () => Promise<NavHubSyncData | null>;
    pushToCloud: (
        data: Omit<NavHubSyncData, 'meta'>,
        force?: boolean,
        syncKind?: 'auto' | 'manual',
        options?: PushToCloudOptions
    ) => Promise<boolean>;
    schedulePush: (data: Omit<NavHubSyncData, 'meta'>) => void;
    createBackup: (data: Omit<NavHubSyncData, 'meta'>) => Promise<boolean>;
    restoreBackup: (backupKey: string) => Promise<NavHubSyncData | null>;
    deleteBackup: (backupKey: string) => Promise<boolean>;

    // 冲突解决
    resolveConflict: (choice: 'local' | 'remote') => void;
    currentConflict: SyncConflict | null;

    // 工具
    cancelPendingSync: () => void;
    flushPendingSync: (options?: { keepalive?: boolean }) => Promise<boolean>;

    // 权限
    checkAuth: () => Promise<SyncAuthState>;
}

// 获取当前本地的 sync meta
const getLocalSyncMeta = (): SyncMetadata | null => {
    try {
        const stored = localStorage.getItem(SYNC_META_KEY);
        return stored ? JSON.parse(stored) : null;
    } catch {
        return null;
    }
};

// 保存 sync meta 到本地
const saveLocalSyncMeta = (meta: SyncMetadata): void => {
    localStorage.setItem(SYNC_META_KEY, JSON.stringify(meta));
};

const getAuthHeaders = (): HeadersInit => {
    const password = (localStorage.getItem(SYNC_PASSWORD_KEY) || '').trim();
    const isAdminSession = localStorage.getItem(SYNC_ADMIN_SESSION_KEY) === '1';
    return {
        'Content-Type': 'application/json',
        ...(password && isAdminSession ? { 'X-Sync-Password': password } : {})
    };
};

const sanitizeAiConfigForCloud = (config?: AIConfig): AIConfig | undefined => {
    if (!config) return undefined;
    return { ...config, apiKey: '' };
};

export function useSyncEngine(options: UseSyncEngineOptions = {}): UseSyncEngineReturn {
    const { onConflict, onSyncComplete, onError } = options;

    // 状态
    const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
    const [lastSyncTime, setLastSyncTime] = useState<number | null>(null);
    const [currentConflict, setCurrentConflict] = useState<SyncConflict | null>(null);

    // Refs for debounce
    const debounceTimer = useRef<NodeJS.Timeout | null>(null);
    const pendingData = useRef<Omit<NavHubSyncData, 'meta'> | null>(null);
    const pushChainRef = useRef<Promise<void>>(Promise.resolve());

    // 从云端拉取数据
    const pullFromCloud = useCallback(async (): Promise<NavHubSyncData | null> => {
        setSyncStatus('syncing');

        try {
            const response = await fetch(SYNC_API_ENDPOINT, {
                headers: getAuthHeaders()
            });
            const result = (await response.json()) as SyncGetResponse;

            if (result.success === false) {
                setSyncStatus('error');
                onError?.(result.error || '拉取失败');
                return null;
            }

            if (!result.data) {
                // 云端无数据
                setSyncStatus('idle');
                return null;
            }

            setSyncStatus('synced');
            setLastSyncTime(result.data.meta.updatedAt);

            // 保存云端的 meta 到本地
            saveLocalSyncMeta(result.data.meta);

            return result.data;
        } catch (error: unknown) {
            setSyncStatus('error');
            onError?.(getErrorMessage(error, '网络错误'));
            return null;
        }
    }, [onError]);

    const checkAuth = useCallback(async (): Promise<SyncAuthState> => {
        try {
            const response = await fetch(`${SYNC_API_ENDPOINT}?action=auth`, {
                headers: getAuthHeaders()
            });
            const result = (await response.json()) as SyncAuthResponse;

            if (!result?.success) {
                return { protected: true, role: 'user', canWrite: false };
            }

            const role: SyncRole = result.role === 'admin' ? 'admin' : 'user';
            return {
                protected: !!result.protected,
                role,
                canWrite: !!result.canWrite
            };
        } catch {
            return { protected: true, role: 'user', canWrite: false };
        }
    }, []);

    // 实际执行推送（不做并发控制）
    const doPushToCloud = useCallback(async (
        data: Omit<NavHubSyncData, 'meta'>,
        force: boolean = false,
        syncKind: 'auto' | 'manual' = 'auto',
        options?: PushToCloudOptions
    ): Promise<boolean> => {
        setSyncStatus('syncing');

        try {
            const localMeta = getLocalSyncMeta();
            const deviceId = getDeviceId();
            const deviceInfo = getDeviceInfo();

            // Never send plaintext apiKey to the cloud; use encryptedSensitiveConfig instead.
            const sanitizedPayload = {
                ...data,
                aiConfig: sanitizeAiConfigForCloud(data.aiConfig)
            };

            // 构建完整的同步数据
            const now = Date.now();
            const syncData: NavHubSyncData = {
                ...sanitizedPayload,
                meta: {
                    updatedAt: now,
                    deviceId,
                    version: localMeta?.version ?? 0,
                    browser: deviceInfo?.browser,
                    os: deviceInfo?.os,
                    syncKind
                }
            };

            const requestBody = JSON.stringify({
                data: syncData,
                expectedVersion: force ? undefined : (localMeta?.version ?? 0),
                syncKind,
                ...(options?.skipHistory ? { skipHistory: true } : {})
            });

            const keepaliveRequested = options?.keepalive === true;
            const keepalive = keepaliveRequested && isKeepaliveBodyWithinLimit(requestBody);

            const response = await fetch(SYNC_API_ENDPOINT, {
                method: 'POST',
                headers: getAuthHeaders(),
                keepalive,
                body: requestBody
            });

            const result = (await response.json()) as SyncPostResponse;

            if (result.success !== true) {
                // 处理冲突
                if (result.conflict && result.data) {
                    setSyncStatus('conflict');
                    const conflict: SyncConflict = {
                        localData: syncData,
                        remoteData: result.data
                    };
                    setCurrentConflict(conflict);
                    try {
                        onConflict?.(conflict);
                    } catch {}
                    return false;
                }

                setSyncStatus('error');
                try {
                    onError?.(result.error || '推送失败');
                } catch {}
                return false;
            }

            // 成功，更新本地 meta
            if (result.data?.meta) {
                saveLocalSyncMeta(result.data.meta);
                setLastSyncTime(result.data.meta.updatedAt);
            }

            // 注意：这里不会调用 onSyncComplete 将 result.data 回写到业务状态。
            // push 成功返回的数据会包含服务端生成的 meta（updatedAt/version），若回写会触发上层的 auto-sync effect，
            // 导致“push → 回写 → 再 push”的循环同步。业务数据的覆盖/合并应由 pull/restore/冲突解决流程处理。
            setSyncStatus('synced');
            return true;
        } catch (error: unknown) {
            setSyncStatus('error');
            try {
                onError?.(getErrorMessage(error, '网络错误'));
            } catch {}
            return false;
        }
    }, [onConflict, onError]);

    // 推送数据到云端（串行化，避免并发推送导致 expectedVersion 冲突/交错）
    const pushToCloud = useCallback(async (
        data: Omit<NavHubSyncData, 'meta'>,
        force: boolean = false,
        syncKind: 'auto' | 'manual' = 'auto',
        options?: PushToCloudOptions
    ): Promise<boolean> => {
        const run = () => doPushToCloud(data, force, syncKind, options);
        const resultPromise = pushChainRef.current.then(run, run);
        pushChainRef.current = resultPromise.then(() => undefined, () => undefined);
        return resultPromise;
    }, [doPushToCloud]);

    // 带 debounce 的推送调度
    const schedulePush = useCallback((data: Omit<NavHubSyncData, 'meta'>) => {
        // 存储待推送数据
        pendingData.current = data;
        setSyncStatus('pending');

        // 清除之前的定时器
        if (debounceTimer.current) {
            clearTimeout(debounceTimer.current);
        }

        // 设置新的定时器
        debounceTimer.current = setTimeout(async () => {
            if (pendingData.current) {
                // 自动同步默认不写入“云端同步记录”(history snapshot)，以减少 KV 写放大。
                await pushToCloud(pendingData.current, false, 'auto', { skipHistory: true });
                pendingData.current = null;
            }
        }, SYNC_DEBOUNCE_MS);
    }, [pushToCloud]);

    // 取消待处理的同步
    const cancelPendingSync = useCallback(() => {
        if (debounceTimer.current) {
            clearTimeout(debounceTimer.current);
            debounceTimer.current = null;
        }
        pendingData.current = null;
        setSyncStatus('idle');
    }, []);

    const flushPendingSync = useCallback(async (options?: { keepalive?: boolean }): Promise<boolean> => {
        if (debounceTimer.current) {
            clearTimeout(debounceTimer.current);
            debounceTimer.current = null;
        }

        const pending = pendingData.current;
        if (!pending) return false;

        pendingData.current = null;
        return pushToCloud(pending, false, 'auto', { skipHistory: true, keepalive: options?.keepalive === true });
    }, [pushToCloud]);

    // 创建备份
    const createBackup = useCallback(async (
        data: Omit<NavHubSyncData, 'meta'>
    ): Promise<boolean> => {
        setSyncStatus('syncing');

        const deviceId = getDeviceId();
        const deviceInfo = getDeviceInfo();
        const sanitizedPayload = {
            ...data,
            aiConfig: sanitizeAiConfigForCloud(data.aiConfig)
        };
        const syncData: NavHubSyncData = {
            ...sanitizedPayload,
            meta: {
                updatedAt: Date.now(),
                deviceId,
                version: getLocalSyncMeta()?.version || 0,
                browser: deviceInfo?.browser,
                os: deviceInfo?.os
            }
        };

        try {
            const response = await fetch(`${SYNC_API_ENDPOINT}?action=backup`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ data: syncData })
            });

            const result = (await response.json()) as SyncCreateBackupResponse;

            if (result.success === false) {
                setSyncStatus('error');
                onError?.(result.error || '备份失败');
                return false;
            }

            setSyncStatus('synced');
            return true;
        } catch (error: unknown) {
            setSyncStatus('error');
            onError?.(getErrorMessage(error, '网络错误'));
            return false;
        }
    }, [onError]);

    // 从备份恢复（服务端会创建回滚点）
    const restoreBackup = useCallback(async (backupKey: string): Promise<NavHubSyncData | null> => {
        setSyncStatus('syncing');

        try {
            const response = await fetch(`${SYNC_API_ENDPOINT}?action=restore`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ backupKey, deviceId: getDeviceId() })
            });
            const result = (await response.json()) as SyncRestoreBackupResponse;

            if (result.success === false) {
                setSyncStatus('error');
                onError?.(result.error || '恢复失败');
                return null;
            }

            if (!result.data) {
                setSyncStatus('error');
                onError?.('恢复失败');
                return null;
            }

            saveLocalSyncMeta(result.data.meta);
            setLastSyncTime(result.data.meta.updatedAt);
            setSyncStatus('synced');

            return result.data;
        } catch (error: unknown) {
            setSyncStatus('error');
            onError?.(getErrorMessage(error, '网络错误'));
            return null;
        }
    }, [onError]);

    // 删除备份
    const deleteBackup = useCallback(async (backupKey: string): Promise<boolean> => {
        try {
            const response = await fetch(`${SYNC_API_ENDPOINT}?action=backup`, {
                method: 'DELETE',
                headers: getAuthHeaders(),
                body: JSON.stringify({ backupKey })
            });
            const result = (await response.json()) as SyncDeleteBackupResponse;

            if (result.success === false) {
                onError?.(result.error || '删除失败');
                return false;
            }

            return true;
        } catch (error: unknown) {
            onError?.(getErrorMessage(error, '网络错误'));
            return false;
        }
    }, [onError]);

    // 解决冲突
    const resolveConflict = useCallback((choice: 'local' | 'remote') => {
        if (!currentConflict) return;

        if (choice === 'local') {
            // 使用本地版本，强制推送
            pushToCloud(currentConflict.localData, true, 'manual');
        } else {
            // 使用云端版本
            saveLocalSyncMeta(currentConflict.remoteData.meta);
            setLastSyncTime(currentConflict.remoteData.meta.updatedAt);
            onSyncComplete?.(currentConflict.remoteData);
            setSyncStatus('synced');
        }

        setCurrentConflict(null);
    }, [currentConflict, pushToCloud, onSyncComplete]);

    // 清理定时器
    useEffect(() => {
        return () => {
            if (debounceTimer.current) {
                clearTimeout(debounceTimer.current);
            }
        };
    }, []);

    return {
        syncStatus,
        lastSyncTime,
        pullFromCloud,
        pushToCloud,
        schedulePush,
        createBackup,
        restoreBackup,
        deleteBackup,
        resolveConflict,
        currentConflict,
        cancelPendingSync,
        flushPendingSync,
        checkAuth
    };
}

// 辅助函数：构建同步数据对象
export function buildSyncData(
    links: LinkItem[],
    categories: Category[],
    searchConfig?: SearchConfig,
    aiConfig?: AIConfig,
    siteSettings?: SiteSettings,
    privateVault?: string,
    // 新增参数
    privacyConfig?: PrivacyConfig,
    themeMode?: ThemeMode,
    encryptedSensitiveConfig?: string,
    customFaviconCache?: CustomFaviconCache
): Omit<NavHubSyncData, 'meta'> {
    return {
        links,
        categories,
        searchConfig,
        aiConfig,
        siteSettings,
        privateVault,
        privacyConfig,
        themeMode,
        encryptedSensitiveConfig,
        customFaviconCache
    };
}
