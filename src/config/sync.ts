/**
 * 同步配置
 */

/**
 * 当检测到版本冲突时的默认行为
 * - 'prompt': 弹出对话框让用户选择（默认）
 * - 'use-cloud': 自动使用云端数据
 * - 'use-local': 自动使用本地数据
 */
export const SYNC_CONFLICT_STRATEGY: 'prompt' | 'use-cloud' | 'use-local' = 'use-cloud';
