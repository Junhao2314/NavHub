export type TranslationLanguage = 'zh-CHS' | 'en';

export interface TranslationMeta {
  lang?: TranslationLanguage;
  updatedAt?: number;
}

export interface LinkItem {
  id: string;
  title: string;
  url: string;
  icon?: string;
  iconTone?: string;
  description?: string;
  tags?: string[];
  categoryId: string;
  createdAt: number;
  translationMeta?: TranslationMeta;
  pinned?: boolean; // New field for pinning
  pinnedOrder?: number; // Field for pinned link sorting order
  order?: number; // Field for sorting order
  recommended?: boolean; // 手动加入「常用推荐」
  recommendedOrder?: number; // 手动推荐排序（越小越靠前）
  adminClicks?: number; // 管理员模式点击次数（用于自动推荐）
  adminLastClickedAt?: number; // 管理员最近点击时间戳（毫秒）
  alternativeUrls?: string[]; // 备选网址
}

export interface Category {
  id: string;
  name: string;
  icon: string; // Lucide icon name or emoji
  hidden?: boolean; // 是否隐藏（仅管理员可见）
  translationMeta?: TranslationMeta;
}

export interface SiteSettings {
  title: string;
  navTitle: string;
  favicon: string;
  cardStyle: 'detailed' | 'simple';
  accentColor?: string; // RGB values e.g. "99 102 241"
  grayScale?: 'slate' | 'zinc' | 'neutral'; // Background tone
  closeOnBackdrop?: boolean; // Allow closing modals by clicking the backdrop
  backgroundImage?: string; // Background image URL or data URL
  backgroundImageEnabled?: boolean; // Enable custom background image
  backgroundMotion?: boolean; // Enable background highlight motion
  translationMeta?: TranslationMeta;
}

export type SiteSettingsChangeHandler = <K extends keyof SiteSettings>(
  key: K,
  value: SiteSettings[K],
) => void;

export interface AppState {
  links: LinkItem[];
  categories: Category[];
  darkMode: boolean;
  settings?: SiteSettings;
}

export type AIProvider = 'gemini' | 'openai';

export interface AIConfig {
  provider: AIProvider;
  apiKey: string;
  baseUrl: string;
  model: string;
  websiteTitle?: string; // 网站标题 (浏览器标签)
  faviconUrl?: string; // 网站图标URL
  navigationName?: string;
}

// 搜索模式类型
export type SearchMode = 'internal' | 'external';

// 倒计时重复类型
export type CountdownRecurrence = 'once' | 'daily' | 'weekly' | 'monthly' | 'yearly';

// 倒计时项
export interface CountdownItem {
  id: string;
  title: string;
  note?: string;
  targetDate: string; // ISO 8601
  recurrence: CountdownRecurrence;
  reminderMinutes?: number[]; // 提醒（提前 N 分钟；可包含 0 = 到点提醒）
  hidden?: boolean; // 管理员控制可见性
  createdAt: number;
  order?: number;
}

// 外部搜索源配置
export interface ExternalSearchSource {
  id: string;
  name: string;
  url: string;
  icon?: string;
  enabled: boolean;
  createdAt: number;
  translationMeta?: TranslationMeta;
}

// 搜索配置
export interface SearchConfig {
  mode: SearchMode;
  externalSources: ExternalSearchSource[];
  selectedSource?: ExternalSearchSource | null; // 选中的搜索源
  selectedSourceId?: string; // 选中的搜索源ID
}

// ============ 同步系统类型定义 ============

// 主题模式类型
export type ThemeMode = 'light' | 'dark' | 'system';

// 同步角色
export type SyncRole = 'admin' | 'user';

// 同步鉴权状态
export interface SyncAuthState {
  protected: boolean;
  role: SyncRole;
  canWrite: boolean;
}

// 校验同步密码返回结果
export type VerifySyncPasswordResult = {
  success: boolean;
  role: SyncRole;
  error?: string;
  lockedUntil?: number;
  retryAfterSeconds?: number;
  remainingAttempts?: number;
  maxAttempts?: number;
};

// 敏感配置载荷（用于加密同步 API Key 等敏感数据）
export interface SensitiveConfigPayload {
  apiKey?: string;
  // 未来可扩展其他敏感配置
}

// Favicon 缓存条目
export interface FaviconCacheEntry {
  hostname: string;
  iconUrl: string;
  isCustom: boolean; // true = 用户手动设置, false = 自动获取
  updatedAt: number;
}

// 自定义 Favicon 缓存（用于同步）
export interface CustomFaviconCache {
  entries: FaviconCacheEntry[];
  updatedAt: number;
}

// 隐私分组配置（仅管理员模式同步）
export interface PrivacyConfig {
  groupEnabled?: boolean;
  passwordEnabled?: boolean;
  autoUnlockEnabled?: boolean;
  useSeparatePassword?: boolean;
}

// 同步元数据
export interface SyncMetadata {
  updatedAt: number; // 最后更新时间戳 (毫秒)
  deviceId: string; // 设备唯一标识
  version: number; // 数据版本号(递增,防止并发冲突)
  browser?: string; // 浏览器信息
  os?: string; // 操作系统信息
  syncKind?: 'auto' | 'manual'; // 同步来源（自动/手动）
}

// Main sync data structure
export interface NavHubSyncData {
  /**
   * 数据结构版本号（用于结构演进）。
   */
  schemaVersion?: number;
  links: LinkItem[];
  categories: Category[];
  countdowns?: CountdownItem[];
  searchConfig?: SearchConfig;
  aiConfig?: AIConfig;
  siteSettings?: SiteSettings;
  privateVault?: string;
  privacyConfig?: PrivacyConfig;
  meta: SyncMetadata;
  // 新增同步字段
  themeMode?: ThemeMode;
  encryptedSensitiveConfig?: string;
  customFaviconCache?: CustomFaviconCache;
}

// 同步冲突信息
export interface SyncConflict {
  localData: NavHubSyncData;
  remoteData: NavHubSyncData;
}

// 同步状态枚举
export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'pending' | 'error' | 'conflict';

// 同步错误分类（用于更明确的用户提示）
export type SyncErrorKind = 'storage' | 'network' | 'server' | 'unknown';

// 同步 API 响应
export type SyncApiSuccess<T extends object = {}> = {
  success: true;
} & Omit<T, 'success' | 'error'>;

export type SyncApiFailure<T extends object = {}> = {
  success: false;
  error: string;
} & Omit<T, 'success' | 'error'>;

export type SyncApiResponse<TSuccess extends object = {}, TFailure extends object = {}> =
  | SyncApiSuccess<TSuccess>
  | SyncApiFailure<TFailure>;

// 云端空数据原因
// - "virgin": 首次使用，从未同步过
// - "lost": 数据丢失，曾经同步过但主数据和历史记录都不可用
export type SyncEmptyReason = 'virgin' | 'lost';

export type SyncGetResponse = SyncApiResponse<{
  role?: SyncRole;
  data: NavHubSyncData | null;
  message?: string;
  emptyReason?: SyncEmptyReason;
  fallback?: boolean;
}>;

export type SyncAuthResponse = SyncApiResponse<SyncAuthState>;

export type SyncLoginResponse = SyncApiResponse<
  SyncAuthState,
  {
    lockedUntil?: number;
    retryAfterSeconds?: number;
    remainingAttempts?: number;
    maxAttempts?: number;
  }
>;

export type SyncPostResponse = SyncApiResponse<
  {
    data: NavHubSyncData;
    historyKey: string | null;
    message?: string;
  },
  {
    conflict?: boolean;
    data?: NavHubSyncData;
  }
>;

export type SyncCreateBackupResponse = SyncApiResponse<{
  backupKey: string;
  message?: string;
}>;

export type SyncRestoreBackupResponse = SyncApiResponse<{
  data: NavHubSyncData;
  rollbackKey?: string | null;
}>;

export interface SyncBackupItem {
  key: string;
  timestamp: string;
  kind: 'auto' | 'manual';
  deviceId?: string;
  updatedAt?: number;
  version?: number;
  browser?: string;
  os?: string;
  isCurrent?: boolean;
}

export type SyncListBackupsResponse = SyncApiResponse<{
  backups: SyncBackupItem[];
}>;

export type SyncGetBackupResponse = SyncApiResponse<{
  data: NavHubSyncData;
}>;

export type SyncDeleteBackupResponse = SyncApiResponse<{
  message?: string;
}>;
