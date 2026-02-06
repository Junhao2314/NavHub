# NavHub 数据模型

本文档详细说明 NavHub 中所有核心数据类型的定义和用途。

---

## 目录

1. [核心数据类型](#核心数据类型)
2. [同步系统类型](#同步系统类型)
3. [配置类型](#配置类型)
4. [API 响应类型](#api-响应类型)
5. [常量与默认值](#常量与默认值)

---

## 核心数据类型

### LinkItem

链接条目，NavHub 的核心数据单元。

```typescript
interface LinkItem {
  // 基础字段
  id: string;                    // 唯一标识
  title: string;                 // 链接标题
  url: string;                   // 链接地址 (http/https)
  categoryId: string;            // 所属分类 ID
  createdAt: number;             // 创建时间戳 (毫秒)

  // 展示字段
  icon?: string;                 // Favicon URL
  iconTone?: string;             // 图标色调 ('light' | 'dark')
  description?: string;          // 链接描述
  tags?: string[];               // 标签列表

  // 排序字段
  order?: number;                // 分类内排序
  pinned?: boolean;              // 是否置顶
  pinnedOrder?: number;          // 置顶排序

  // 推荐字段
  recommended?: boolean;         // 手动推荐到「常用推荐」
  recommendedOrder?: number;     // 推荐排序

  // 统计字段 (管理员模式)
  adminClicks?: number;          // 管理员点击次数
  adminLastClickedAt?: number;   // 最近点击时间戳

  // 翻译元数据
  translationMeta?: TranslationMeta;
}
```

**字段说明**:

| 字段 | 必填 | 说明 |
|------|------|------|
| `id` | 是 | 使用 `generateId()` 生成 |
| `title` | 是 | 显示名称 |
| `url` | 是 | 仅支持 http/https 协议 |
| `categoryId` | 是 | 关联分类，删除分类时自动迁移 |
| `icon` | 否 | 自动从 faviconextractor.com 获取 |
| `iconTone` | 否 | 用于暗色模式优化显示 |
| `pinned` | 否 | 置顶链接显示在分类上方 |
| `recommended` | 否 | 手动推荐到首页"常用推荐" |
| `adminClicks` | 否 | 用于智能推荐排序 |

---

### Category

分类，用于组织链接。

```typescript
interface Category {
  id: string;                    // 唯一标识
  name: string;                  // 分类名称
  icon: string;                  // Lucide 图标名或 Emoji
  hidden?: boolean;              // 是否隐藏 (仅管理员可见)
  translationMeta?: TranslationMeta;
}
```

**图标格式**:

```typescript
// Lucide 图标名
{ icon: 'Code' }      // 使用 lucide-react 的 Code 图标
{ icon: 'BookOpen' }  // 使用 lucide-react 的 BookOpen 图标

// Emoji
{ icon: '🚀' }        // 直接使用 Emoji
{ icon: '📚' }
```

---

### TranslationMeta

翻译元数据，记录内容的语言和更新时间。

```typescript
type TranslationLanguage = 'zh-CHS' | 'en';

interface TranslationMeta {
  lang?: TranslationLanguage;    // 内容语言
  updatedAt?: number;            // 翻译更新时间
}
```

---

## 同步系统类型

### NavHubSyncData

主同步数据结构，包含所有需要云端同步的数据。

```typescript
interface NavHubSyncData {
  // 版本控制
  schemaVersion?: number;        // 数据结构版本号

  // 核心数据
  links: LinkItem[];             // 链接列表
  categories: Category[];        // 分类列表

  // 配置数据
  searchConfig?: SearchConfig;   // 搜索配置
  aiConfig?: AIConfig;           // AI 配置 (apiKey 会被脱敏)
  siteSettings?: SiteSettings;   // 站点设置
  themeMode?: ThemeMode;         // 主题模式

  // 隐私数据 (仅管理员模式同步)
  privateVault?: string;         // 加密的隐私分组数据
  privacyConfig?: PrivacyConfig; // 隐私设置
  encryptedSensitiveConfig?: string; // 加密的敏感配置

  // 缓存数据
  customFaviconCache?: CustomFaviconCache; // 自定义图标缓存

  // 元数据
  meta: SyncMetadata;            // 同步元数据
}
```

---

### SyncMetadata

同步元数据，用于版本控制和冲突检测。

```typescript
interface SyncMetadata {
  updatedAt: number;             // 最后更新时间戳 (毫秒)
  deviceId: string;              // 设备唯一标识
  version: number;               // 数据版本号 (递增)
  browser?: string;              // 浏览器信息
  os?: string;                   // 操作系统信息
  syncKind?: 'auto' | 'manual';  // 同步来源
}
```

**版本号机制**:

- 每次成功写入云端，`version` 递增
- 客户端推送时携带 `expectedVersion`
- 服务端检测版本不一致则返回 409 冲突

---

### SyncConflict

同步冲突信息，当本地和云端版本不一致时产生。

```typescript
interface SyncConflict {
  localData: NavHubSyncData;     // 本地数据
  remoteData: NavHubSyncData;    // 云端数据
}
```

---

### SyncStatus

同步状态枚举。

```typescript
type SyncStatus =
  | 'idle'      // 空闲，无待同步数据
  | 'pending'   // 有待同步数据，等待防抖
  | 'syncing'   // 正在同步中
  | 'synced'    // 同步成功
  | 'conflict'  // 检测到版本冲突
  | 'error';    // 同步失败
```

---

### SyncAuthState

同步认证状态。

```typescript
interface SyncAuthState {
  protected: boolean;            // 是否启用密码保护
  role: SyncRole;                // 当前角色 ('admin' | 'user')
  canWrite: boolean;             // 是否可写
}

type SyncRole = 'admin' | 'user';
```

---

### SyncBackupItem

备份列表项。

```typescript
interface SyncBackupItem {
  key: string;                   // 备份 key
  timestamp: string;             // 时间戳显示值
  kind: 'auto' | 'manual';       // 同步类型
  deviceId?: string;             // 设备 ID
  updatedAt?: number;            // 更新时间
  version?: number;              // 版本号
  browser?: string;              // 浏览器信息
  os?: string;                   // 操作系统信息
  isCurrent?: boolean;           // 是否为当前版本
}
```

---

## 配置类型

### SiteSettings

站点设置。

```typescript
interface SiteSettings {
  // 基础设置
  title: string;                 // 页面标题 (浏览器标签)
  navTitle: string;              // 导航标题 (页面内显示)
  favicon: string;               // 站点图标 URL

  // 外观设置
  cardStyle: 'detailed' | 'simple';  // 卡片样式
  accentColor?: string;          // 主题色 (RGB 值，如 "99 102 241")
  grayScale?: 'slate' | 'zinc' | 'neutral';  // 背景色调

  // 背景设置
  backgroundImage?: string;      // 背景图 URL 或 data URL
  backgroundImageEnabled?: boolean;  // 启用背景图
  backgroundMotion?: boolean;    // 背景动效

  // 交互设置
  closeOnBackdrop?: boolean;     // 点击背景关闭弹窗

  translationMeta?: TranslationMeta;
}
```

**卡片样式对比**:

| 样式 | 说明 |
|------|------|
| `detailed` | 显示图标、标题、描述、标签 |
| `simple` | 仅显示图标和标题 |

---

### AIConfig

AI 配置。

```typescript
type AIProvider = 'gemini' | 'openai';

interface AIConfig {
  provider: AIProvider;          // AI 服务商
  apiKey: string;                // API Key (同步时会被脱敏)
  baseUrl: string;               // API Base URL
  model: string;                 // 模型名称

  // AI 生成的站点信息
  websiteTitle?: string;         // 网站标题
  faviconUrl?: string;           // 网站图标 URL
  navigationName?: string;       // 导航名称
}
```

**默认配置**:

```typescript
// Gemini
{
  provider: 'gemini',
  baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
  model: 'gemini-pro',
}

// OpenAI Compatible
{
  provider: 'openai',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-3.5-turbo',
}
```

---

### SearchConfig

搜索配置。

```typescript
type SearchMode = 'internal' | 'external';

interface SearchConfig {
  mode: SearchMode;              // 搜索模式
  externalSources: ExternalSearchSource[];  // 外部搜索源列表
  selectedSource?: ExternalSearchSource;    // 选中的搜索源
  selectedSourceId?: string;     // 选中的搜索源 ID
}

interface ExternalSearchSource {
  id: string;                    // 唯一标识
  name: string;                  // 搜索源名称
  url: string;                   // 搜索 URL 模板 (包含 %s 占位符)
  icon?: string;                 // 图标 URL
  enabled: boolean;              // 是否启用
  createdAt: number;             // 创建时间
  translationMeta?: TranslationMeta;
}
```

**搜索 URL 模板示例**:

```typescript
{
  name: 'Google',
  url: 'https://www.google.com/search?q=%s',
}

{
  name: 'GitHub',
  url: 'https://github.com/search?q=%s',
}
```

---

### PrivacyConfig

隐私分组配置。

```typescript
interface PrivacyConfig {
  groupEnabled?: boolean;        // 隐私分组启用状态
  passwordEnabled?: boolean;     // 隐私密码启用状态
  autoUnlockEnabled?: boolean;   // 会话内自动解锁
  useSeparatePassword?: boolean; // 使用独立密码
}
```

---

### ThemeMode

主题模式。

```typescript
type ThemeMode = 'light' | 'dark' | 'system';
```

---

## API 响应类型

### 通用响应格式

```typescript
// 成功响应
type SyncApiSuccess<T> = { success: true } & T;

// 失败响应
type SyncApiFailure<T = {}> = {
  success: false;
  error: string;
} & T;

// 组合类型
type SyncApiResponse<TSuccess, TFailure = {}> =
  | SyncApiSuccess<TSuccess>
  | SyncApiFailure<TFailure>;
```

### 具体响应类型

```typescript
// GET /api/sync
type SyncGetResponse = SyncApiResponse<{
  role?: SyncRole;
  data: NavHubSyncData | null;
  message?: string;
  emptyReason?: 'virgin' | 'lost';  // 数据为空的原因
  fallback?: boolean;               // 是否从历史回退
}>;

// GET /api/sync?action=auth
type SyncAuthResponse = SyncApiResponse<SyncAuthState>;

// POST /api/sync?action=login
type SyncLoginResponse = SyncApiResponse<SyncAuthState, {
  lockedUntil?: number;
  retryAfterSeconds?: number;
  remainingAttempts?: number;
  maxAttempts?: number;
}>;

// POST /api/sync
type SyncPostResponse = SyncApiResponse<{
  data: NavHubSyncData;
  historyKey: string | null;
  message?: string;
}, {
  conflict?: boolean;
  data?: NavHubSyncData;  // 冲突时返回云端数据
}>;

// POST /api/sync?action=backup
type SyncCreateBackupResponse = SyncApiResponse<{
  backupKey: string;
  message?: string;
}>;

// POST /api/sync?action=restore
type SyncRestoreBackupResponse = SyncApiResponse<{
  data: NavHubSyncData;
  rollbackKey?: string | null;
}>;

// GET /api/sync?action=backups
type SyncListBackupsResponse = SyncApiResponse<{
  backups: SyncBackupItem[];
}>;
```

---

## 常量与默认值

### localStorage 键

```typescript
const LOCAL_STORAGE_KEY = 'navhub_data_cache_v2';
const SYNC_META_KEY = 'navhub_sync_meta';
const SYNC_PASSWORD_KEY = 'navhub_sync_password';
const FAVICON_CACHE_KEY = 'navhub_favicon_cache';
const AI_CONFIG_KEY = 'navhub_ai_config';
const SEARCH_CONFIG_KEY = 'navhub_search_config';
const SITE_SETTINGS_KEY = 'navhub_site_settings';
const PRIVATE_VAULT_KEY = 'navhub_private_vault_v1';
const THEME_KEY = 'theme';
```

### 默认分类

```typescript
const DEFAULT_CATEGORIES: Category[] = [
  { id: 'common', name: '常用推荐', icon: 'Star' },
  { id: 'dev', name: '开发工具', icon: 'Code' },
  { id: 'design', name: '设计资源', icon: 'Palette' },
  { id: 'read', name: '阅读资讯', icon: 'BookOpen' },
  { id: 'ent', name: '休闲娱乐', icon: 'Gamepad2' },
  { id: 'ai', name: '人工智能', icon: 'Bot' },
];
```

### 特殊分类 ID

```typescript
const COMMON_CATEGORY_ID = 'common';  // 常用推荐
const ALL_CATEGORY_ID = 'all';        // 全部链接 (虚拟分类)
```

### 同步历史限制

```typescript
const MAX_SYNC_HISTORY = 20;          // 最多保留 20 条同步历史
const SYNC_HISTORY_TTL = 30 * 24 * 60 * 60;  // 30 天 TTL
```

---

## 相关文档

- [API 接口文档](./API.md)
- [自定义 Hooks](./HOOKS.md)
- [同步策略](./sync-strategy.md)
- [安全设计](./SECURITY.md)
