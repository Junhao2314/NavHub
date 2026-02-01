import type {
  NavHubSyncData as FrontendNavHubSyncData,
  PrivacyConfig as FrontendPrivacyConfig,
  SyncMetadata as FrontendSyncMetadata,
} from '../../src/types';

// Cloudflare KV 类型定义 (内联，避免需要安装 @cloudflare/workers-types)
export type KVNamespaceGetOptions<Type extends 'text' | 'json' | 'arrayBuffer' | 'stream'> = {
  type: Type;
  cacheTtl?: number;
};

export interface KVNamespaceInterface {
  get(key: string): Promise<string | null>;
  get(key: string, type: 'text'): Promise<string | null>;
  get<Value = unknown>(key: string, type: 'json'): Promise<Value | null>;
  get(key: string, type: 'arrayBuffer'): Promise<ArrayBuffer | null>;
  get(key: string, type: 'stream'): Promise<ReadableStream | null>;
  get(key: string, options: KVNamespaceGetOptions<'text'>): Promise<string | null>;
  get<Value = unknown>(key: string, options: KVNamespaceGetOptions<'json'>): Promise<Value | null>;
  get(key: string, options: KVNamespaceGetOptions<'arrayBuffer'>): Promise<ArrayBuffer | null>;
  get(key: string, options: KVNamespaceGetOptions<'stream'>): Promise<ReadableStream | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<{
    keys: Array<{ name: string; expiration?: number }>;
    list_complete?: boolean;
    cursor?: string;
  }>;
}

// Cloudflare R2 类型定义 (内联，避免需要安装 @cloudflare/workers-types)
export type R2Conditional = {
  etagMatches?: string;
  etagDoesNotMatch?: string;
  uploadedBefore?: Date;
  uploadedAfter?: Date;
  secondsGranularity?: boolean;
};

export interface R2ObjectBodyInterface {
  readonly etag: string;
  json<T>(): Promise<T>;
  text(): Promise<string>;
}

export interface R2ObjectInterface {
  readonly etag: string;
}

export interface R2BucketInterface {
  get(key: string): Promise<R2ObjectBodyInterface | null>;
  put(
    key: string,
    value: string,
    options?: {
      onlyIf?: R2Conditional | Headers;
      httpMetadata?: unknown;
      customMetadata?: Record<string, string>;
    },
  ): Promise<R2ObjectInterface | null>;
}

// KV 绑定说明:
// - Cloudflare Pages Functions: 绑定名 `NAVHUB_KV`
// - Cloudflare Workers (wrangler.toml): 绑定名 `NAVHUB_WORKER_KV`
// 为了复用同一份实现，这里同时支持两种绑定名。
export type SyncApiEnv = {
  SYNC_PASSWORD?: string; // 可选的同步密码
  // R2 绑定（可选，推荐用于避免 KV 25MB 限制 + 最终一致性导致的"读到旧值"问题）
  // - Cloudflare Pages Functions: 绑定名 `NAVHUB_R2`
  // - Cloudflare Workers (wrangler.toml): 绑定名 `NAVHUB_WORKER_R2`
  NAVHUB_R2?: R2BucketInterface;
  NAVHUB_WORKER_R2?: R2BucketInterface;
} & (
  | { NAVHUB_KV: KVNamespaceInterface; NAVHUB_WORKER_KV?: KVNamespaceInterface }
  | { NAVHUB_WORKER_KV: KVNamespaceInterface; NAVHUB_KV?: KVNamespaceInterface }
);

export type Env = {
  NAVHUB_KV: KVNamespaceInterface;
  NAVHUB_R2?: R2BucketInterface;
  SYNC_PASSWORD?: string;
};

export type SyncMetadata = FrontendSyncMetadata;

export interface SyncHistoryIndexItem {
  key: string;
  meta: SyncMetadata;
}

export interface SyncHistoryIndex {
  version: number;
  items: SyncHistoryIndexItem[];
}

export type PrivacyConfig = FrontendPrivacyConfig;

export type NavHubSyncData = FrontendNavHubSyncData;

export type SyncHistoryKind = 'auto' | 'manual';
