# NavHub 架构设计

本文档描述 NavHub 的整体架构设计、模块职责和数据流。

---

## 目录

1. [架构概览](#架构概览)
2. [前端架构](#前端架构)
3. [后端架构](#后端架构)
4. [数据流](#数据流)
5. [目录结构](#目录结构)
6. [部署架构](#部署架构)

---

## 架构概览

NavHub 采用 **Local-First** 架构，数据优先存储在本地 localStorage，通过 Cloudflare Workers/Pages 实现可选的云端同步。

```
┌─────────────────────────────────────────────────────────────────────┐
│                         用户浏览器                                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐          │
│   │   React UI   │◄──►│   Zustand    │◄──►│ localStorage │          │
│   │  Components  │    │    Store     │    │   (主存储)   │          │
│   └──────────────┘    └──────────────┘    └──────────────┘          │
│          │                   │                                       │
│          ▼                   ▼                                       │
│   ┌──────────────┐    ┌──────────────┐                              │
│   │ Custom Hooks │◄──►│ Sync Engine  │                              │
│   └──────────────┘    └──────────────┘                              │
│                              │                                       │
└──────────────────────────────┼───────────────────────────────────────┘
                               │ HTTPS
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Cloudflare Edge Network                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   ┌──────────────────────────────────────────────────────────────┐  │
│   │              Workers / Pages Functions                        │  │
│   │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │  │
│   │  │  /api/sync  │  │   /api/ai   │  │   Assets    │          │  │
│   │  │  同步 API   │  │  AI 代理    │  │  静态资源   │          │  │
│   │  └──────┬──────┘  └──────┬──────┘  └─────────────┘          │  │
│   └─────────┼────────────────┼───────────────────────────────────┘  │
│             │                │                                       │
│   ┌─────────▼────────┐  ┌────▼─────┐                                │
│   │  R2 (主存储)     │  │  上游 AI │                                │
│   │  KV (备份/历史)  │  │  API     │                                │
│   └──────────────────┘  └──────────┘                                │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 核心设计原则

| 原则 | 说明 |
|------|------|
| **Local-First** | 数据优先本地存储，离线可用，云端同步可选 |
| **乐观锁同步** | 使用版本号防止并发冲突 |
| **端到端加密** | 敏感数据（API Key、隐私链接）使用 AES-256-GCM 加密 |
| **边缘计算** | 使用 Cloudflare Workers 实现低延迟全球访问 |

---

## 前端架构

### 技术栈

| 层级 | 技术 | 版本 |
|------|------|------|
| UI 框架 | React | 19.2 |
| 类型系统 | TypeScript | 5.8 |
| 样式 | Tailwind CSS | 4.x |
| 状态管理 | Zustand | 5.x |
| 构建工具 | Vite | 6.x |
| 拖拽排序 | @dnd-kit | 6.x / 8.x |
| 国际化 | i18next | 25.x |
| 图标 | Lucide React | 0.554 |

### 模块职责

```
src/
├── app/                      # 应用核心逻辑
│   ├── AppContainer.tsx      # 主容器，组合所有功能
│   ├── AppBackground.tsx     # 背景渲染
│   └── useAppController/     # 应用控制器
│       ├── kvSync/           # KV 同步逻辑
│       │   ├── applyCloudData.ts      # 云端数据应用
│       │   ├── buildLocalSyncPayload.ts # 构建同步载荷
│       │   └── encryptedSensitiveConfig.ts # 敏感配置加密
│       ├── useAdminAccess.ts # 管理员权限
│       ├── useAppearance.ts  # 外观设置
│       ├── useLinkActions.ts # 链接操作
│       └── ...
│
├── components/               # UI 组件
│   ├── layout/               # 布局组件
│   │   ├── Sidebar.tsx       # 侧边栏（分类导航）
│   │   ├── LinkSections.tsx  # 链接区块
│   │   └── ContextMenu.tsx   # 右键菜单
│   ├── modals/               # 弹窗组件
│   │   ├── LinkModal.tsx     # 链接编辑
│   │   ├── SettingsModal.tsx # 设置面板
│   │   ├── ImportModal.tsx   # 导入对话框
│   │   └── settings/         # 设置子模块
│   │       ├── AITab.tsx     # AI 配置
│   │       ├── DataTab.tsx   # 数据管理
│   │       └── ...
│   └── ui/                   # 通用 UI
│       ├── Icon.tsx          # 图标组件
│       ├── IconSelector.tsx  # 图标选择器
│       └── DialogProvider.tsx # 对话框提供者
│
├── hooks/                    # 自定义 Hooks
│   ├── useDataStore.ts       # 数据存储（CRUD）
│   ├── useSyncEngine.ts      # 同步引擎
│   ├── useConfig.ts          # 配置管理
│   ├── useTheme.ts           # 主题切换
│   ├── useSearch.ts          # 搜索功能
│   └── ...
│
├── services/                 # 服务层
│   ├── bookmarkParser.ts     # 书签解析
│   ├── exportService.ts      # 导出服务
│   └── geminiService.ts      # AI 服务
│
├── stores/                   # Zustand 状态
│   └── useAppStore.ts        # 全局状态
│
├── utils/                    # 工具函数
│   ├── privateVault.ts       # 隐私分组加密
│   ├── sensitiveConfig.ts    # 敏感配置加密
│   ├── faviconCache.ts       # 图标缓存
│   ├── recommendation.ts     # 推荐算法
│   └── ...
│
├── locales/                  # 国际化
│   ├── en-US.json
│   └── zh-CN.json
│
└── types.ts                  # TypeScript 类型定义
```

### 状态管理

NavHub 采用 **分层状态管理** 策略：

| 层级 | 存储位置 | 说明 |
|------|----------|------|
| UI 状态 | React useState | 弹窗开关、选中状态等临时状态 |
| 应用状态 | Zustand Store | 当前语言、管理员状态等跨组件状态 |
| 持久数据 | localStorage | 链接、分类、配置等需要持久化的数据 |
| 云端数据 | Cloudflare KV/R2 | 多设备同步的共享数据 |

---

## 后端架构

### 部署模式

NavHub 支持两种部署模式：

| 模式 | 入口 | 特点 |
|------|------|------|
| **Workers** | `worker/index.ts` | 支持 CORS、自定义域名、优选 IP |
| **Pages Functions** | `functions/api/*.ts` | 一键部署、Git 集成 |

### 后端模块

```
shared/                       # 前后端共享代码
├── syncApi.ts                # 同步 API 入口
├── aiProxy.ts                # AI 代理
└── syncApi/                  # 同步 API 模块
    ├── handlers.ts           # 请求处理器
    ├── auth.ts               # 认证与防爆破
    ├── kv.ts                 # KV 存储操作
    ├── cors.ts               # CORS 处理
    ├── normalize.ts          # 数据标准化
    ├── sanitize.ts           # 数据清洗
    ├── types.ts              # 类型定义
    └── navHubSyncData.ts     # 数据结构

worker/                       # Workers 入口
└── index.ts                  # Workers 主入口

functions/                    # Pages Functions
└── api/
    ├── sync.ts               # /api/sync
    └── ai.ts                 # /api/ai
```

### 存储策略

```
┌──────────────────────────────────────────────────────────────┐
│                       存储层                                  │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│   ┌─────────────────────────────────────────────────────┐    │
│   │                 R2 (主存储，推荐)                    │    │
│   │                                                      │    │
│   │  • navhub/data.json (主同步数据)                     │    │
│   │  • 支持 ETag 原子写入                                │    │
│   │  • 无大小限制                                        │    │
│   │  • 强一致性                                          │    │
│   └─────────────────────────────────────────────────────┘    │
│                           │                                   │
│                           ▼ 未绑定 R2 时降级                   │
│   ┌─────────────────────────────────────────────────────┐    │
│   │                 KV (备份/历史/兜底)                  │    │
│   │                                                      │    │
│   │  • navhub:data (主数据，R2 未启用时)                 │    │
│   │  • navhub:backup:history-* (同步历史，最多 20 条)    │    │
│   │  • navhub:backup:* (手动快照备份)                    │    │
│   │  • navhub:sync_history_index (历史索引)              │    │
│   │  • navhub:auth_attempt:* (防爆破记录，TTL 1h)        │    │
│   │  • 单值 25MB 限制                                    │    │
│   │  • 最终一致性                                        │    │
│   └─────────────────────────────────────────────────────┘    │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

---

## 数据流

### 应用初始化流程

```
┌─────────────────────────────────────────────────────────────┐
│ 1. 应用启动                                                  │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   main.tsx                                                   │
│      │                                                       │
│      ├─→ initI18n()            初始化国际化                  │
│      │                                                       │
│      └─→ 渲染 <App />                                        │
│             │                                                │
│             ▼                                                │
│   AppContainer                                               │
│      │                                                       │
│      ├─→ useDataStore()        从 localStorage 加载数据      │
│      │      │                                                │
│      │      ├─→ 解析 JSON                                    │
│      │      ├─→ 校验分类图标                                 │
│      │      ├─→ 校验链接 URL                                 │
│      │      ├─→ 移动孤儿链接                                 │
│      │      └─→ 加载 favicon 缓存                            │
│      │                                                       │
│      ├─→ useConfig()           加载 AI/搜索/站点配置         │
│      │                                                       │
│      └─→ useKvSync()           云端同步                      │
│             │                                                │
│             ├─→ checkAuth()    验证角色 (admin/user)         │
│             │                                                │
│             └─→ pullFromCloud()                              │
│                    │                                         │
│                    ├─→ 主数据存在                            │
│                    │      ├─→ 版本一致 → 应用数据            │
│                    │      ├─→ 版本冲突 + 管理员 → 冲突对话框 │
│                    │      └─→ 版本冲突 + 用户 → 直接应用     │
│                    │                                         │
│                    └─→ 主数据缺失 → 回退到历史记录           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 数据同步流程

```
┌─────────────────────────────────────────────────────────────┐
│ 2. 数据变更与同步                                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   用户操作 (添加/编辑/删除链接)                              │
│      │                                                       │
│      ▼                                                       │
│   useDataStore                                               │
│      │                                                       │
│      ├─→ updateData()          更新状态 + 写入 localStorage  │
│      │                                                       │
│      └─→ 触发 useEffect                                      │
│             │                                                │
│             ▼                                                │
│   useKvSyncStrategy                                          │
│      │                                                       │
│      ├─→ 计算签名 (业务签名 + 完整签名)                      │
│      │                                                       │
│      ├─→ 业务数据变更?                                       │
│      │      └─→ schedulePush() → 10秒防抖 → pushToCloud()    │
│      │                                                       │
│      └─→ 仅统计变更?                                         │
│             └─→ scheduleStatsSync() → 10分钟批量上报         │
│                                                              │
│   pushToCloud()                                              │
│      │                                                       │
│      ├─→ 携带 expectedVersion (乐观锁)                       │
│      │                                                       │
│      ├─→ POST /api/sync                                      │
│      │      │                                                │
│      │      ├─→ 200: 成功                                    │
│      │      │      └─→ 更新本地 meta (version, updatedAt)    │
│      │      │                                                │
│      │      └─→ 409: 版本冲突                                │
│      │             └─→ 显示冲突对话框                        │
│      │                    │                                  │
│      │                    ├─→ 选择本地 → 强制推送            │
│      │                    └─→ 选择云端 → 应用云端数据        │
│      │                                                       │
│      └─→ Promise 队列串行化 (避免并发推送)                   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 目录结构

```
NavHub/
├── .github/                  # GitHub 配置
│   └── workflows/            # CI/CD 工作流
│       └── deploy-workers.yml
│
├── docs/                     # 文档
│   ├── API.md                # API 接口文档
│   ├── ARCHITECTURE.md       # 架构设计（本文档）
│   ├── DATA-MODELS.md        # 数据模型
│   ├── DEVELOPMENT.md        # 开发指南
│   ├── HOOKS.md              # Hooks API
│   ├── SECURITY.md           # 安全设计
│   ├── sync-strategy.md      # 同步策略
│   └── kv-cost-optimization.md # KV 成本优化
│
├── functions/                # Cloudflare Pages Functions
│   └── api/
│       ├── sync.ts           # 同步 API
│       └── ai.ts             # AI 代理
│
├── shared/                   # 前后端共享代码
│   ├── syncApi.ts            # 同步 API 入口
│   ├── aiProxy.ts            # AI 代理
│   ├── syncApi/              # 同步 API 模块
│   └── utils/                # 共享工具
│
├── src/                      # 前端源码
│   ├── app/                  # 应用核心
│   ├── components/           # UI 组件
│   ├── hooks/                # 自定义 Hooks
│   ├── services/             # 服务层
│   ├── stores/               # 状态管理
│   ├── utils/                # 工具函数
│   ├── locales/              # 国际化
│   ├── config/               # 配置
│   └── types.ts              # 类型定义
│
├── worker/                   # Cloudflare Workers
│   └── index.ts              # Workers 入口
│
├── public/                   # 静态资源
├── assets/                   # 资源文件
│
├── package.json              # 依赖配置
├── vite.config.ts            # Vite 配置
├── wrangler.toml             # Wrangler 配置
├── tsconfig.json             # TypeScript 配置
├── biome.json                # Biome 配置
└── README.md                 # 项目说明
```

---

## 部署架构

### Workers 部署

```
┌─────────────────────────────────────────────────────────────┐
│                   Cloudflare Workers                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   worker/index.ts                                            │
│      │                                                       │
│      ├─→ /api/sync      → shared/syncApi.ts                  │
│      │                      ├─→ NAVHUB_WORKER_KV (必须)      │
│      │                      └─→ NAVHUB_WORKER_R2 (推荐)      │
│      │                                                       │
│      ├─→ /api/ai        → shared/aiProxy.ts                  │
│      │                      └─→ 代理到上游 AI API            │
│      │                                                       │
│      └─→ /*             → env.ASSETS.fetch()                 │
│                             └─→ Workers Assets (静态资源)    │
│                                                              │
│   环境变量:                                                   │
│   • SYNC_PASSWORD (可选)                                     │
│   • SYNC_CORS_ALLOWED_ORIGINS (可选)                         │
│   • AI_PROXY_ALLOWED_HOSTS (可选)                            │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Pages 部署

```
┌─────────────────────────────────────────────────────────────┐
│                   Cloudflare Pages                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   dist/ (构建产物)                                           │
│      │                                                       │
│      └─→ Pages CDN 托管                                      │
│                                                              │
│   functions/api/*.ts                                         │
│      │                                                       │
│      ├─→ /api/sync      → functions/api/sync.ts              │
│      │                      ├─→ NAVHUB_KV (必须)             │
│      │                      └─→ NAVHUB_R2 (推荐)             │
│      │                                                       │
│      └─→ /api/ai        → functions/api/ai.ts                │
│                                                              │
│   绑定配置 (Dashboard):                                       │
│   • KV namespace bindings                                    │
│   • R2 bucket bindings                                       │
│   • Environment variables                                    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 相关文档

- [API 接口文档](./API.md)
- [数据模型](./DATA-MODELS.md)
- [开发指南](./DEVELOPMENT.md)
- [自定义 Hooks](./HOOKS.md)
- [安全设计](./SECURITY.md)
- [同步策略](./sync-strategy.md)
- [KV 成本优化](./kv-cost-optimization.md)
