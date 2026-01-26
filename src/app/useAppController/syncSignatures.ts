import type { NavHubSyncData } from '../../types';

export type SyncPayload = Omit<NavHubSyncData, 'meta'>;

export const buildSyncFullSignature = (payload: SyncPayload): string => {
  const { encryptedSensitiveConfig, ...rest } = payload;
  return JSON.stringify(rest);
};

export const buildSyncBusinessSignature = (payload: SyncPayload): string => {
  const { encryptedSensitiveConfig, links, ...rest } = payload;
  // 业务签名：排除点击统计等“高频字段”，避免每次点击都触发“内容同步”与同步记录写入。
  const strippedLinks = Array.isArray(links)
    ? links.map(({ adminClicks, adminLastClickedAt, ...link }) => link)
    : links;

  return JSON.stringify({
    ...rest,
    links: strippedLinks
  });
};

