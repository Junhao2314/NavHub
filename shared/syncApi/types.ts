// Cloudflare KV 类型定义 (内联，避免需要安装 @cloudflare/workers-types)
export interface KVNamespaceInterface {
    get(key: string, type?: 'text' | 'json' | 'arrayBuffer' | 'stream'): Promise<any>;
    put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
    delete(key: string): Promise<void>;
    list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<{
        keys: Array<{ name: string; expiration?: number }>;
        list_complete?: boolean;
        cursor?: string;
    }>;
}

// KV 绑定说明:
// - Cloudflare Pages Functions: 绑定名 `YNAV_KV`
// - Cloudflare Workers (wrangler.toml): 绑定名 `YNAV_WORKER_KV`
// 为了复用同一份实现，这里同时兼容两种绑定名。
export type SyncApiEnv = {
    SYNC_PASSWORD?: string; // 可选的同步密码
} & (
    | { YNAV_KV: KVNamespaceInterface; YNAV_WORKER_KV?: KVNamespaceInterface }
    | { YNAV_WORKER_KV: KVNamespaceInterface; YNAV_KV?: KVNamespaceInterface }
);

export type Env = {
    YNAV_KV: KVNamespaceInterface;
    SYNC_PASSWORD?: string;
};

export interface SyncMetadata {
    updatedAt: number;
    deviceId: string;
    version: number;
    browser?: string;
    os?: string;
    syncKind?: 'auto' | 'manual';
}

export interface SyncHistoryIndexItem {
    key: string;
    meta: SyncMetadata;
}

export interface SyncHistoryIndex {
    version: number;
    items: SyncHistoryIndexItem[];
    sources?: string[];
}

export interface PrivacyConfig {
    groupEnabled?: boolean;
    passwordEnabled?: boolean;
    autoUnlockEnabled?: boolean;
    useSeparatePassword?: boolean;
}

export interface NavHubSyncData {
    links: any[];
    categories: any[];
    searchConfig?: any;
    aiConfig?: any;
    siteSettings?: any;
    privateVault?: string;
    privacyConfig?: PrivacyConfig;
    meta: SyncMetadata;
    themeMode?: 'light' | 'dark' | 'system';
    encryptedSensitiveConfig?: string;
    customFaviconCache?: any;
}

export type SyncHistoryKind = 'auto' | 'manual';
