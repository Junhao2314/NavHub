# NavHub 同步策略

本文档详细说明 NavHub 的云端同步机制，包括前端同步引擎、后端 API、冲突检测与解决、以及多设备数据一致性保障。

---

## 目录

1. [架构概览](#架构概览)
2. [前端同步引擎](#前端同步引擎)
3. [后端同步 API](#后端同步-api)
4. [初始化与首次加载](#初始化与首次加载)
5. [冲突检测与解决](#冲突检测与解决)
6. [自动同步策略](#自动同步策略)
7. [权限模型](#权限模型)
8. [数据安全](#数据安全)

---

## 架构概览

```
┌─────────────────────────────────────────────────────────┐
│                    前端 (React)                          │
├─────────────────────────────────────────────────────────┤
│  useSyncEngine        - 同步引擎核心                     │
│  useKvSyncStrategy    - 自动同步策略                     │
│  applyCloudData       - 云端数据应用                     │
│  SyncStatusIndicator  - 同步状态 UI                     │
│  SyncConflictModal    - 冲突解决对话框                   │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│              后端 (Cloudflare Workers)                   │
├─────────────────────────────────────────────────────────┤
│  /api/sync            - 同步 API 入口                   │
│  R2 (主存储)          - 支持原子写入，无大小限制         │
│  KV (备用存储)        - 最终一致性，25MB 限制            │
└─────────────────────────────────────────────────────────┘
```

### 核心特性

| 特性 | 说明 |
|------|------|
| **乐观锁** | 客户端携带 `expectedVersion`，服务端版本不匹配时返回 409 冲突 |
| **串行推送** | 多次 push 请求通过 Promise 队列串行化，避免并发冲突 |
| **防抖同步** | 业务数据变更 10 秒防抖，统计数据 10 分钟批量上报 |
| **双层存储** | R2 优先（原子写入），KV 备用（向后兼容） |
| **数据回退** | 主数据丢失时自动从同步历史恢复 |

---

## 前端同步引擎

### useSyncEngine Hook

**位置**: `src/hooks/useSyncEngine.ts`

核心同步引擎，提供以下方法：

| 方法 | 用途 | 行为 |
|------|------|------|
| `pullFromCloud()` | 拉取云端数据 | 从服务端获取最新数据，更新本地 sync meta |
| `pushToCloud()` | 推送本地数据 | 携带 expectedVersion 进行乐观锁检查 |
| `schedulePush()` | 调度自动同步 | 10 秒防抖，批量处理频繁变更 |
| `resolveConflict()` | 解决冲突 | 用户选择保留本地或云端版本 |
| `checkAuth()` | 验证权限 | 查询当前角色（admin/user） |
| `createBackup()` | 创建备份 | 生成带时间戳的快照 |
| `restoreBackup()` | 恢复备份 | 恢复历史版本，自动创建回滚点 |

### 同步状态

```typescript
type SyncStatus = 'idle' | 'pending' | 'syncing' | 'synced' | 'conflict' | 'error';
```

- `idle`: 空闲，无待同步数据
- `pending`: 有待同步数据，等待防抖
- `syncing`: 正在同步中
- `synced`: 同步成功
- `conflict`: 检测到版本冲突
- `error`: 同步失败

### 请求体结构

```typescript
// POST /api/sync
{
  data: NavHubSyncData,           // 完整同步数据
  expectedVersion?: number,        // 乐观锁版本号
  syncKind?: 'auto' | 'manual',    // 同步类型
  skipHistory?: boolean            // 是否跳过历史记录
}
```

### NavHubSyncData 结构

```typescript
interface NavHubSyncData {
  schemaVersion?: number;           // 数据结构版本号
  links: LinkItem[];
  categories: Category[];
  searchConfig?: SearchConfig;
  aiConfig?: AIConfig;
  siteSettings?: SiteSettings;
  privateVault?: string;            // 加密的隐私分组数据
  privacyConfig?: PrivacyConfig;
  meta: SyncMetadata;
  themeMode?: 'light' | 'dark' | 'system';
  encryptedSensitiveConfig?: string; // 加密的敏感配置
  customFaviconCache?: CustomFaviconCache; // 自定义图标缓存
}
```

---

## 后端同步 API

### 路由

| 方法 | 路径 | 用途 |
|------|------|------|
| GET | `/api/sync` | 读取云端数据 |
| GET | `/api/sync?action=auth` | 查询权限状态 |
| GET | `/api/sync?action=backup` | 列出备份 |
| POST | `/api/sync` | 写入云端数据 |
| POST | `/api/sync?action=login` | 管理员登录 |
| POST | `/api/sync?action=backup` | 创建备份 |
| POST | `/api/sync?action=restore` | 恢复备份 |
| DELETE | `/api/sync?action=backup` | 删除备份 |

### 存储策略

**双后端设计**：

- **R2 (推荐)**：支持 ETag 原子写入，无大小限制，强一致性
- **KV (备用)**：最终一致性，单值 25MB 限制

**存储键**：

- `navhub:data` (KV) / `navhub/data.json` (R2) - 主同步数据
- `navhub:backup:history-*` - 同步历史快照（最多 20 条）
- `navhub:sync_history_index` - 历史记录索引

### 数据回退机制

当主数据缺失时，服务端会自动从同步历史中恢复：

```typescript
if (!data) {
  const index = await ensureSyncHistoryIndexForListing(env);
  for (const item of index?.items ?? []) {
    const backupData = await env.NAVHUB_KV.get(item.key, 'json');
    if (backupData) {
      return { success: true, data: backupData, fallback: true };
    }
  }
}
```

---

## 初始化与首次加载

### 加载流程

```
1. main.tsx
   ├─ initI18n()          - 初始化国际化
   └─ 渲染 App

2. AppContainer
   ├─ useDataStore()      - 从 localStorage 加载本地数据
   ├─ useConfig()         - 加载配置
   └─ useKvSync()
      ├─ checkAuth()      - 验证角色
      └─ performPull()    - 拉取云端数据

3. 根据角色和版本决定行为：
   ├─ 用户模式           → 直接应用云端数据
   ├─ 管理员 + 新设备    → 直接应用云端数据
   └─ 管理员 + 版本冲突  → 显示冲突对话框
```

### 新设备首次同步

```typescript
// useKvSyncStrategy.ts
if (localVersion === 0) {
  // 新设备：本地版本为 0，直接应用云端数据
  applyCloudData(cloudData, auth.role);
  return;
}
```

### 用户模式（只读）

```typescript
if (auth.role !== 'admin') {
  // 用户模式：不参与冲突解决，直接应用云端公开数据
  applyCloudData(cloudData, auth.role);
  return;
}
```

---

## 冲突检测与解决

### 触发条件

1. 手动拉取时 `localVersion !== cloudVersion`（仅管理员）
2. 自动推送返回 409 状态码
3. 新设备首次同步发现云端已有数据

### 冲突对话框

显示本地与云端数据的对比：

- **本地版本**：当前设备数据，显示更新时间和设备 ID
- **云端版本**：服务器最新数据，显示更新时间和设备 ID
- 较新的版本会标记"更新"徽章

### 解决方式

```typescript
if (choice === 'local') {
  // 保留本地：强制推送覆盖云端
  pushToCloud(localData, force=true, 'manual');
} else {
  // 保留云端：应用云端数据到本地
  applyCloudData(remoteData, role);
}
```

---

## 自动同步策略

### 双层同步机制

**位置**: `src/app/useAppController/kvSync/useKvSyncStrategy.ts`

| 层级 | 触发条件 | 防抖时间 | 写入历史 |
|------|----------|----------|----------|
| 业务数据 | 链接、分类、设置变更 | 10 秒 | 是 |
| 统计数据 | 点击次数、图标缓存 | 10 分钟 | 否 |

### 签名比较

使用签名机制避免不必要的同步：

```typescript
const businessSignature = buildSyncBusinessSignature(data);
const fullSignature = buildSyncFullSignature(data);

if (businessSignature === prevBusinessSignature) {
  // 业务数据未变，检查是否只有统计变更
  if (fullSignature !== prevFullSignature) {
    // 仅统计变更：使用更长的延迟
    scheduleStatsSync();
  }
} else {
  // 业务数据变更：立即调度同步
  schedulePush(data);
}
```

### 跳过条件

以下情况不触发自动同步：

- `!isLoaded` - 本地数据尚未加载
- `!hasInitialSyncRun` - 尚未完成首次拉取
- `currentConflict` - 正在处理冲突
- `!isAdmin` - 用户模式（只读）
- `isSyncPasswordRefreshing` - 正在刷新认证

---

## 权限模型

### 三级权限

| 角色 | 权限 | 云端访问 | 冲突处理 |
|------|------|----------|----------|
| **用户** | 只读 | 仅公开数据 | 无 |
| **管理员** | 读写 | 完整数据 | 显示对话框 |
| **超级管理员** | 后端控制 | 全部操作 | N/A |

### 数据隔离

**公开数据** (`sanitizePublicData`)：
- 公开链接和分类
- 搜索配置
- 站点设置
- 主题模式

**敏感数据** (`sanitizeSensitiveData`)：
- 私密分组链接
- 加密的 AI API Key
- 隐私设置
- 完整私密保险库

---

## 数据安全

### 敏感配置加密

AI API Key 等敏感配置使用同步密码加密后存储：

```typescript
// 加密
const encryptedConfig = await encryptApiKeyForSync(syncPassword, apiKey);

// 解密（多密码尝试）
const candidates = [syncPassword, privateVaultPassword, privacyPassword];
const payload = await decryptSensitiveConfigWithFallback(candidates, encryptedConfig);
```

### 暴力破解防护

- 三级限流策略：
  - CF-Connecting-IP（可信 IP）：最多 5 次失败尝试
  - X-Forwarded-For + 请求指纹：最多 3 次失败尝试
  - 完全无指纹请求：最多 2 次失败尝试
- 超限后锁定 1 小时
- 使用 SHA256 哈希存储客户端标识
- 请求指纹收集：User-Agent、Accept-Language、Accept-Encoding、Sec-Ch-Ua、Sec-Ch-Ua-Platform

### 数据验证

- 所有接收数据通过 `normalizeNavHubSyncData()` 标准化
- 无效 URL 自动过滤
- 无效图标标记移除

### 备份与回滚

- 每次恢复自动创建回滚点
- 最多保留 20 条同步历史
- 主数据丢失时自动回退到历史记录

---

## localStorage 键

| 键 | 用途 |
|----|------|
| `navhub_data_cache_v2` | 链接和分类数据缓存 |
| `navhub_sync_meta` | 同步元数据（版本、时间、设备 ID） |
| `navhub_sync_password` | 同步密码 |
| `navhub_sync_admin_session` | 管理员会话标记 |
| `navhub_sync_password_lock_until` | 密码锁定截止时间 |
| `navhub_last_sync` | 最后同步时间 |
| `navhub_device_id` | 设备唯一标识 |
| `navhub_device_info` | 设备信息（浏览器/OS） |
| `navhub_ai_config` | AI 配置 |
| `navhub_ai_api_key_session` | AI API Key 会话缓存 |
| `navhub_search_config` | 搜索配置 |
| `navhub_site_settings` | 站点设置 |
| `navhub_favicon_cache` | Favicon 缓存 |
| `navhub_favicon_custom` | 用户自定义图标的主机名列表 |
| `navhub_favicon_custom_meta` | 自定义图标元数据（hostname → updatedAt） |
| `navhub_private_vault_v1` | 加密的隐私分组数据 |
| `navhub_privacy_password` | 隐私分组密码 |
| `navhub_privacy_use_separate_password` | 是否使用独立密码 |
| `navhub_privacy_group_enabled` | 隐私分组启用状态 |
| `navhub_privacy_password_enabled` | 隐私密码启用状态 |
| `navhub_privacy_auto_unlock` | 会话内自动解锁 |
| `navhub_privacy_session_unlocked` | 当前会话解锁状态 |
| `theme` | 主题模式（light/dark/system） |

---

## 流程图

```
┌─────────────────────────────────────────────────────────┐
│ 应用初始化                                               │
├─────────────────────────────────────────────────────────┤
│ 1. 加载 localStorage                                    │
│ 2. checkAuth() - 确定角色                               │
│ 3. pullFromCloud()                                      │
│    ├─ 主数据存在 → 检查版本                             │
│    │  ├─ 版本一致 → 应用数据                            │
│    │  ├─ 版本不一致 + 管理员 → 冲突对话框               │
│    │  └─ 版本不一致 + 用户 → 直接应用                   │
│    └─ 主数据缺失 → 回退到历史记录                       │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ 持续同步（仅管理员）                                     │
├─────────────────────────────────────────────────────────┤
│ 自动同步:                                               │
│ • 监听: 链接、分类、设置、主题                          │
│ • 业务变更 → 10秒防抖后推送                             │
│ • 统计变更 → 10分钟批量推送                             │
│                                                          │
│ 推送冲突:                                               │
│ • 服务端返回 409 + 云端数据                             │
│ • 显示冲突对话框                                         │
│ • 用户选择: 保留本地(强制推送) / 保留云端(应用)         │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ 用户模式（只读）                                         │
├─────────────────────────────────────────────────────────┤
│ • 首次加载: 拉取并应用公开数据                          │
│ • 无自动同步队列                                         │
│ • 无法编辑数据                                           │
│ • 所有写入操作显示警告提示                              │
└─────────────────────────────────────────────────────────┘
```
