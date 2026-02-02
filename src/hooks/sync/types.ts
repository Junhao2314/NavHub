/**
 * 同步引擎类型定义
 */

import { NavHubSyncData, SyncConflict } from '../../types';

export type PushToCloudOptions = {
  /**
   * 跳过写入"云端同步记录"(history snapshot)。
   */
  skipHistory?: boolean;
  /**
   * 页面关闭/切后台时的兜底同步：用 keepalive 提升请求在卸载阶段送达的概率。
   */
  keepalive?: boolean;
};

export interface UseSyncEngineOptions {
  onConflict?: (conflict: SyncConflict) => void;
  onSyncComplete?: (data: NavHubSyncData) => void;
  onError?: (error: string) => void;
}
