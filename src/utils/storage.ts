/**
 * Storage Utility Module
 * 存储工具模块
 *
 * Provides safe wrappers for localStorage and sessionStorage operations.
 * 提供 localStorage 和 sessionStorage 操作的安全封装。
 *
 * Features / 功能:
 * - Graceful error handling (returns null/false instead of throwing)
 *   优雅的错误处理（返回 null/false 而非抛出异常）
 * - Works in environments where storage is unavailable (e.g., private browsing)
 *   在存储不可用的环境中也能正常工作（如隐私浏览模式）
 * - Unified API for both storage types
 *   统一的 API 接口支持两种存储类型
 */

/**
 * Storage type identifier
 * 存储类型标识
 * - 'local': localStorage (persistent across sessions / 跨会话持久化)
 * - 'session': sessionStorage (cleared when tab closes / 关闭标签页时清除)
 */
export type StorageKind = 'local' | 'session';

type StorageKey = 'localStorage' | 'sessionStorage';
type StorageGlobal = Partial<Record<StorageKey, Storage>>;

/**
 * Resolve the storage object based on kind
 * 根据类型获取对应的存储对象
 *
 * @param kind - Storage type / 存储类型
 * @returns Storage object or null if unavailable / 存储对象，不可用时返回 null
 */
const resolveStorage = (kind: StorageKind): Storage | null => {
  const key: StorageKey = kind === 'local' ? 'localStorage' : 'sessionStorage';

  try {
    if (!(key in globalThis)) return null;
    const storage = (globalThis as unknown as StorageGlobal)[key] ?? null;
    return storage ?? null;
  } catch {
    return null;
  }
};

/**
 * Safely get an item from storage
 * 安全地从存储中获取数据
 *
 * @param kind - Storage type / 存储类型
 * @param itemKey - Key to retrieve / 要获取的键名
 * @returns Value or null if not found/error / 值，未找到或出错时返回 null
 */
export const safeStorageGetItem = (kind: StorageKind, itemKey: string): string | null => {
  const storage = resolveStorage(kind);
  if (!storage) return null;
  try {
    return storage.getItem(itemKey);
  } catch {
    return null;
  }
};

/**
 * Safely set an item in storage
 * 安全地向存储中写入数据
 *
 * @param kind - Storage type / 存储类型
 * @param itemKey - Key to set / 要设置的键名
 * @param value - Value to store / 要存储的值
 * @returns true if successful, false otherwise / 成功返回 true，否则返回 false
 */
export const safeStorageSetItem = (kind: StorageKind, itemKey: string, value: string): boolean => {
  const storage = resolveStorage(kind);
  if (!storage) return false;
  try {
    storage.setItem(itemKey, value);
    return true;
  } catch {
    return false;
  }
};

/**
 * Safely remove an item from storage
 * 安全地从存储中删除数据
 *
 * @param kind - Storage type / 存储类型
 * @param itemKey - Key to remove / 要删除的键名
 * @returns true if successful, false otherwise / 成功返回 true，否则返回 false
 */
export const safeStorageRemoveItem = (kind: StorageKind, itemKey: string): boolean => {
  const storage = resolveStorage(kind);
  if (!storage) return false;
  try {
    storage.removeItem(itemKey);
    return true;
  } catch {
    return false;
  }
};

/**
 * Safely clear all items from storage
 * 安全地清空存储中的所有数据
 *
 * @param kind - Storage type / 存储类型
 * @returns true if successful, false otherwise / 成功返回 true，否则返回 false
 */
export const safeStorageClear = (kind: StorageKind): boolean => {
  const storage = resolveStorage(kind);
  if (!storage) return false;
  try {
    storage.clear();
    return true;
  } catch {
    return false;
  }
};

// ============ localStorage Shortcuts / localStorage 快捷方法 ============

/** Get item from localStorage / 从 localStorage 获取数据 */
export const safeLocalStorageGetItem = (itemKey: string): string | null =>
  safeStorageGetItem('local', itemKey);

/** Set item in localStorage / 向 localStorage 写入数据 */
export const safeLocalStorageSetItem = (itemKey: string, value: string): boolean =>
  safeStorageSetItem('local', itemKey, value);

/** Remove item from localStorage / 从 localStorage 删除数据 */
export const safeLocalStorageRemoveItem = (itemKey: string): boolean =>
  safeStorageRemoveItem('local', itemKey);

/** Clear all localStorage / 清空 localStorage */
export const safeLocalStorageClear = (): boolean => safeStorageClear('local');

// ============ sessionStorage Shortcuts / sessionStorage 快捷方法 ============

/** Get item from sessionStorage / 从 sessionStorage 获取数据 */
export const safeSessionStorageGetItem = (itemKey: string): string | null =>
  safeStorageGetItem('session', itemKey);

/** Set item in sessionStorage / 向 sessionStorage 写入数据 */
export const safeSessionStorageSetItem = (itemKey: string, value: string): boolean =>
  safeStorageSetItem('session', itemKey, value);

/** Remove item from sessionStorage / 从 sessionStorage 删除数据 */
export const safeSessionStorageRemoveItem = (itemKey: string): boolean =>
  safeStorageRemoveItem('session', itemKey);

/** Clear all sessionStorage / 清空 sessionStorage */
export const safeSessionStorageClear = (): boolean => safeStorageClear('session');

// ============ Deferred Writes / 延迟写入（合并 + 调度） ============

export type DeferredStorageWriteStrategy = 'timeout' | 'idle';

export interface DeferredStorageWriteOptions {
  /**
   * Debounce window before scheduling the write (ms).
   * 写入前的 debounce 时间（毫秒）。
   */
  debounceMs?: number;
  /**
   * When to run the actual `setItem`.
   * - 'idle': prefer requestIdleCallback (with timeout) when available
   * - 'timeout': use setTimeout to yield to the event loop
   */
  strategy?: DeferredStorageWriteStrategy;
  /**
   * requestIdleCallback timeout (ms). Only used when strategy === 'idle'.
   * requestIdleCallback 的超时时间（毫秒）。
   */
  idleTimeoutMs?: number;
}

type RequestIdleCallback = (callback: () => void, options?: { timeout: number }) => number;
type CancelIdleCallback = (handle: number) => void;

const DEFAULT_DEFERRED_WRITE_OPTIONS: Required<DeferredStorageWriteOptions> = {
  debounceMs: 0,
  strategy: 'idle',
  idleTimeoutMs: 1000,
};

type PendingWriteValue = string | (() => string);

type PendingWrite = {
  kind: StorageKind;
  itemKey: string;
  value: PendingWriteValue;
  timer: ReturnType<typeof setTimeout> | null;
  idleHandle: number | null;
};

const pendingWrites = new Map<string, PendingWrite>();

const getDeferredWriteId = (kind: StorageKind, itemKey: string): string => `${kind}:${itemKey}`;

const resolveRequestIdleCallback = (): RequestIdleCallback | null => {
  const ric = (globalThis as unknown as { requestIdleCallback?: unknown }).requestIdleCallback;
  return typeof ric === 'function' ? (ric as RequestIdleCallback) : null;
};

const resolveCancelIdleCallback = (): CancelIdleCallback | null => {
  const cic = (globalThis as unknown as { cancelIdleCallback?: unknown }).cancelIdleCallback;
  return typeof cic === 'function' ? (cic as CancelIdleCallback) : null;
};

const cancelPendingWriteHandles = (pending: PendingWrite): void => {
  if (pending.timer) {
    clearTimeout(pending.timer);
    pending.timer = null;
  }
  if (pending.idleHandle !== null) {
    const cancelIdleCallback = resolveCancelIdleCallback();
    cancelIdleCallback?.(pending.idleHandle);
    pending.idleHandle = null;
  }
};

export const cancelScheduledStorageWrite = (kind: StorageKind, itemKey: string): void => {
  const id = getDeferredWriteId(kind, itemKey);
  const pending = pendingWrites.get(id);
  if (!pending) return;
  cancelPendingWriteHandles(pending);
  pendingWrites.delete(id);
};

export const flushScheduledStorageWrite = (kind: StorageKind, itemKey: string): boolean => {
  const id = getDeferredWriteId(kind, itemKey);
  const pending = pendingWrites.get(id);
  if (!pending) return true;
  cancelPendingWriteHandles(pending);
  pendingWrites.delete(id);
  try {
    const value = typeof pending.value === 'function' ? pending.value() : pending.value;
    return safeStorageSetItem(kind, itemKey, value);
  } catch {
    return false;
  }
};

export const flushAllScheduledStorageWrites = (): { attempted: number; succeeded: number } => {
  const entries = Array.from(pendingWrites.values());
  let attempted = 0;
  let succeeded = 0;

  for (const entry of entries) {
    attempted += 1;
    if (flushScheduledStorageWrite(entry.kind, entry.itemKey)) {
      succeeded += 1;
    }
  }

  return { attempted, succeeded };
};

const scheduleDeferredFlush = (
  kind: StorageKind,
  itemKey: string,
  options: Required<DeferredStorageWriteOptions>,
): void => {
  const id = getDeferredWriteId(kind, itemKey);
  const pending = pendingWrites.get(id);
  if (!pending) return;

  // Prefer idling when possible (reduces jank on the main thread).
  if (options.strategy === 'idle') {
    const requestIdleCallback = resolveRequestIdleCallback();
    if (requestIdleCallback) {
      pending.idleHandle = requestIdleCallback(
        () => {
          flushScheduledStorageWrite(kind, itemKey);
        },
        { timeout: options.idleTimeoutMs },
      );
      return;
    }
  }

  // Fallback: yield to next macrotask.
  pending.timer = setTimeout(() => {
    flushScheduledStorageWrite(kind, itemKey);
  }, 0);
};

export const scheduleStorageSetItem = (
  kind: StorageKind,
  itemKey: string,
  value: string,
  options?: DeferredStorageWriteOptions,
): void => {
  scheduleStorageSetItemLazy(kind, itemKey, () => value, options);
};

export const scheduleStorageSetItemLazy = (
  kind: StorageKind,
  itemKey: string,
  getValue: () => string,
  options?: DeferredStorageWriteOptions,
): void => {
  const resolvedOptions: Required<DeferredStorageWriteOptions> = {
    ...DEFAULT_DEFERRED_WRITE_OPTIONS,
    ...options,
  };

  const id = getDeferredWriteId(kind, itemKey);
  const existing = pendingWrites.get(id);
  if (existing) {
    cancelPendingWriteHandles(existing);
  }

  const pending: PendingWrite = { kind, itemKey, value: getValue, timer: null, idleHandle: null };
  pendingWrites.set(id, pending);

  if (resolvedOptions.debounceMs > 0) {
    pending.timer = setTimeout(() => {
      const current = pendingWrites.get(id);
      if (!current) return;
      // The debounce timer has fired, clear it so the next stage can schedule.
      if (current.timer) {
        clearTimeout(current.timer);
        current.timer = null;
      }
      scheduleDeferredFlush(kind, itemKey, resolvedOptions);
    }, resolvedOptions.debounceMs);
    return;
  }

  scheduleDeferredFlush(kind, itemKey, resolvedOptions);
};

export const scheduleLocalStorageSetItem = (
  itemKey: string,
  value: string,
  options?: DeferredStorageWriteOptions,
): void => scheduleStorageSetItem('local', itemKey, value, options);

export const scheduleLocalStorageSetItemLazy = (
  itemKey: string,
  getValue: () => string,
  options?: DeferredStorageWriteOptions,
): void => scheduleStorageSetItemLazy('local', itemKey, getValue, options);

export const cancelScheduledLocalStorageWrite = (itemKey: string): void =>
  cancelScheduledStorageWrite('local', itemKey);

export const flushScheduledLocalStorageWrite = (itemKey: string): boolean =>
  flushScheduledStorageWrite('local', itemKey);

export const scheduleSessionStorageSetItem = (
  itemKey: string,
  value: string,
  options?: DeferredStorageWriteOptions,
): void => scheduleStorageSetItem('session', itemKey, value, options);

export const scheduleSessionStorageSetItemLazy = (
  itemKey: string,
  getValue: () => string,
  options?: DeferredStorageWriteOptions,
): void => scheduleStorageSetItemLazy('session', itemKey, getValue, options);

export const cancelScheduledSessionStorageWrite = (itemKey: string): void =>
  cancelScheduledStorageWrite('session', itemKey);

export const flushScheduledSessionStorageWrite = (itemKey: string): boolean =>
  flushScheduledStorageWrite('session', itemKey);
