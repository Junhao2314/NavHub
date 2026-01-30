import type { NavHubSyncData } from '../../types';

export type SyncPayload = Omit<NavHubSyncData, 'meta'>;

/**
 * 生成"同步签名"用于判定本地数据是否发生变化（从而决定是否触发同步）。
 *
 * 为什么需要签名而不是直接做深比较？
 * - useAppController 里会在多个 state 变更源（links/categories/settings/统计字段）下触发 effect；
 *   用签名可把"是否真的变了"压缩成 string 比较，逻辑更清晰，也便于区分不同类型的变更。
 *
 * 两种签名的语义：
 * - Full signature：尽可能覆盖所有"可同步字段"（不包含 encryptedSensitiveConfig），用于检测点击统计等高频字段的变化。
 * - Business signature：排除点击统计等高频字段，用于判定"业务内容是否变化"。
 *
 * 注：签名只用于触发策略，不作为安全校验/一致性证明。
 */

const stableJsonStringify = (value: unknown): string => {
  // 与 JSON.stringify 不同：这里会对 object key 排序，确保同内容不同 key 顺序时签名一致。
  // 另外对 undefined/function/symbol 等不可序列化值做了"signature 友好"的处理（视为 null/省略）。
  const seen = new Set<unknown>();

  const encode = (input: unknown): string => {
    if (
      input &&
      typeof input === 'object' &&
      'toJSON' in input &&
      typeof (input as { toJSON: unknown }).toJSON === 'function'
    ) {
      return encode((input as { toJSON: () => unknown }).toJSON());
    }

    if (input === null) return 'null';

    const type = typeof input;
    if (type === 'string' || type === 'number' || type === 'boolean') {
      return JSON.stringify(input);
    }

    if (type === 'bigint') {
      throw new TypeError('Do not know how to serialize a BigInt');
    }

    if (type === 'undefined' || type === 'function' || type === 'symbol') {
      // JSON.stringify turns these into null at the top level (undefined -> undefined) / in arrays, and omits them in objects.
      // For signature purposes, treat them as null in value positions.
      return 'null';
    }

    if (type !== 'object') return 'null';

    if (seen.has(input)) {
      throw new TypeError('Converting circular structure to JSON');
    }
    seen.add(input);

    try {
      if (Array.isArray(input)) {
        const parts: string[] = [];
        for (let i = 0; i < input.length; i++) {
          if (!(i in input)) {
            parts.push('null');
            continue;
          }
          const item = (input as unknown[])[i];
          const itemType = typeof item;
          if (item === undefined || itemType === 'function' || itemType === 'symbol') {
            parts.push('null');
            continue;
          }
          parts.push(encode(item));
        }
        return `[${parts.join(',')}]`;
      }

      const obj = input as Record<string, unknown>;
      const keys = Object.keys(obj).sort();
      const parts: string[] = [];

      for (const key of keys) {
        const val = obj[key];
        const valType = typeof val;
        if (val === undefined || valType === 'function' || valType === 'symbol') {
          continue;
        }
        parts.push(`${JSON.stringify(key)}:${encode(val)}`);
      }

      return `{${parts.join(',')}}`;
    } finally {
      seen.delete(input);
    }
  };

  return encode(value);
};

const normalizeCustomFaviconCacheForSignature = (
  cache: SyncPayload['customFaviconCache'],
): SyncPayload['customFaviconCache'] => {
  // customFaviconCache.entries 的顺序不应影响"是否变化"的判定：按 hostname 排序后再参与签名。
  if (!cache || !Array.isArray(cache.entries)) return cache;

  const sortedEntries = cache.entries.slice().sort((a, b) => a.hostname.localeCompare(b.hostname));

  return {
    ...cache,
    entries: sortedEntries,
  };
};

const sanitizeAiConfigForSignature = (config: SyncPayload['aiConfig']): SyncPayload['aiConfig'] => {
  // aiConfig.apiKey 不会被同步到云端（安全考虑），因此签名计算中也应排除它。
  // 否则会导致：本地签名（含 apiKey）与云端数据（不含 apiKey）不匹配，触发不必要的同步或冲突。
  if (!config) return config;
  const { apiKey, ...rest } = config;
  return { ...rest, apiKey: '' };
};

export const buildSyncFullSignature = (payload: SyncPayload): string => {
  // Full signature：用于检测任何可同步字段的变化（除了 encryptedSensitiveConfig）。
  // encryptedSensitiveConfig 的生成依赖 sync password；如果把它纳入签名，可能导致"仅密码变化"也触发重复同步。
  const {
    schemaVersion: _schemaVersion,
    encryptedSensitiveConfig,
    customFaviconCache,
    aiConfig,
    ...rest
  } = payload;
  return stableJsonStringify({
    ...rest,
    aiConfig: sanitizeAiConfigForSignature(aiConfig),
    customFaviconCache: normalizeCustomFaviconCacheForSignature(customFaviconCache),
  });
};

export const buildSyncBusinessSignature = (payload: SyncPayload): string => {
  const {
    schemaVersion: _schemaVersion,
    encryptedSensitiveConfig,
    links,
    customFaviconCache,
    aiConfig,
    ...rest
  } = payload;
  // Business signature：排除点击统计等"高频字段"，避免每次点击都触发"内容同步"。
  // 对应 useAppController 的策略：
  // - businessSignature 变化 => 走较短的 debounce 自动同步（合并多次编辑）。
  // - 只有 fullSignature 变化 => 认为只是统计字段变化，走更长间隔的批量同步（并跳过 history 记录）。
  const strippedLinks = Array.isArray(links)
    ? links.map(({ adminClicks, adminLastClickedAt, ...link }) => link)
    : links;

  return stableJsonStringify({
    ...rest,
    aiConfig: sanitizeAiConfigForSignature(aiConfig),
    links: strippedLinks,
    customFaviconCache: normalizeCustomFaviconCacheForSignature(customFaviconCache),
  });
};
