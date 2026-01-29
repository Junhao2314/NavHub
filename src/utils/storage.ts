export type StorageKind = 'local' | 'session';

const resolveStorage = (kind: StorageKind): Storage | null => {
  const key = kind === 'local' ? 'localStorage' : 'sessionStorage';

  try {
    if (!(key in globalThis)) return null;
    const storage = (globalThis as any)[key] as Storage | undefined | null;
    return storage ?? null;
  } catch {
    return null;
  }
};

export const safeStorageGetItem = (kind: StorageKind, itemKey: string): string | null => {
  const storage = resolveStorage(kind);
  if (!storage) return null;
  try {
    return storage.getItem(itemKey);
  } catch {
    return null;
  }
};

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

export const safeLocalStorageGetItem = (itemKey: string): string | null =>
  safeStorageGetItem('local', itemKey);

export const safeLocalStorageSetItem = (itemKey: string, value: string): boolean =>
  safeStorageSetItem('local', itemKey, value);

export const safeLocalStorageRemoveItem = (itemKey: string): boolean =>
  safeStorageRemoveItem('local', itemKey);

export const safeLocalStorageClear = (): boolean => safeStorageClear('local');

export const safeSessionStorageGetItem = (itemKey: string): string | null =>
  safeStorageGetItem('session', itemKey);

export const safeSessionStorageSetItem = (itemKey: string, value: string): boolean =>
  safeStorageSetItem('session', itemKey, value);

export const safeSessionStorageRemoveItem = (itemKey: string): boolean =>
  safeStorageRemoveItem('session', itemKey);

export const safeSessionStorageClear = (): boolean => safeStorageClear('session');
