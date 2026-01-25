# NavHub - AI 智能导航仪

<div align="center">

![React](https://img.shields.io/badge/React-19-blue?style=flat-square&logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue?style=flat-square&logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-v4-38bdf8?style=flat-square&logo=tailwindcss)
![Cloudflare](https://img.shields.io/badge/Cloudflare-Workers%20%7C%20Pages-orange?style=flat-square&logo=cloudflare)

**极简、隐私、智能。**  
**基于 Local-First 架构，配合 Cloudflare KV 实现无感多端同步。**

[在线演示](https://nav.yml.qzz.io) · [快速部署](#-快速部署)

</div>

---

## ✨ 核心特性

| 特性                | 说明                                                       |
| ------------------- | ---------------------------------------------------------- |
| 🚀 **极简设计**     | React 19 + Tailwind CSS v4，极速启动，丝滑交互             |
| ☁️ **云端同步**     | Cloudflare KV 实现多设备实时同步，支持冲突检测与解决       |
| 🧠 **AI 整理**      | Google Gemini 一键生成网站简介，智能推荐分类               |
| 🔒 **安全隐私**     | Local-First 架构，数据优先本地存储，支持同步密码与隐私分组 |
| 🎨 **个性化**       | 深色/浅色/跟随系统主题、自定义主题色、背景风格、卡片布局   |
| 📱 **响应式**       | 完美适配桌面端和移动端，响应式网格布局                     |
| 🔐 **权限管理**     | 管理员/用户双角色，管理员可编辑，用户只读                  |
| 🔍 **多源搜索**     | 内置 10+ 搜索引擎，支持站内搜索、全站搜索与外部搜索切换    |
| ⭐ **常用推荐**     | 手动推荐 + 基于点击次数的智能推荐                          |
| 📦 **导入导出**     | 支持浏览器书签 HTML 导入，JSON/HTML 格式导出               |
| 🏷️ **标签系统**    | 链接支持多标签，动态标签颜色，标签自动补全建议             |
| 📌 **置顶功能**     | 重要链接可置顶显示，支持拖拽排序                           |
| 🔄 **备份恢复**     | 云端备份管理，支持一键恢复历史版本                         |
| 🔗 **重复检测**     | 内置重复链接检测工具，快速发现并管理重复项                 |
| 🎯 **智能图标**     | 动态图标背景分析，暗色模式自动优化显示效果                 |

---

## 🚀 快速部署

> **提供两种部署方式**，推荐国内用户选择 Workers 方式以获得更好的访问速度。

### 部署方式对比

| 对比项       | Cloudflare Workers | Cloudflare Pages         |
| ------------ | ------------------ | ------------------------ |
| **国内访问** | ⭐⭐⭐ 支持优选 IP | ⭐⭐ 一般                |
| **配置难度** | 中等               | 简单                     |
| **自动部署** | GitHub Actions     | Cloudflare 原生 Git 集成 |
| **适合人群** | 追求速度的国内用户 | 快速体验 / 海外用户      |

---

<details>
<summary>方式一：Cloudflare Pages（小白推荐）</summary>

### 1. 一键部署到 Cloudflare Pages

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/yml2213/NavHub)

- 点击按钮后按提示授权 GitHub 与 Cloudflare
- 选择你的 GitHub 账号，Cloudflare 会自动创建 Pages 项目
- 如果构建参数没自动填，使用：
  - Build command: `npm run build`
  - Build output directory: `dist`

### 2. 绑定 KV（必须）

1. Cloudflare Dashboard → **Workers & Pages** → **KV** → **Create a namespace**
2. 命名：`YNAV_DB`（任意名称均可）
3. 打开 Pages 项目 → **Settings** → **Functions** → **KV namespace bindings**
4. 新增绑定：
   - Variable name: `YNAV_KV`（必须一致）
   - KV namespace: 选择刚创建的 KV
5. 保存后 **重新部署**

### 3. 设置同步密码（可选）

Pages 项目 → **Settings** → **Environment variables** 添加：

- `SYNC_PASSWORD`: 你的同步密码

### 4. 自动更新说明

- Pages 会在你的仓库 **有新提交时自动构建并更新**（无需手动操作）
- 如果你是 Fork 用户，想自动跟随本仓库更新，可添加一个定时同步 Action：

```yaml
# .github/workflows/sync-upstream.yml
name: Sync Upstream

on:
  schedule:
    - cron: "0 3 * * *" # 每天 03:00 UTC
  workflow_dispatch:

permissions:
  contents: write

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - name: Sync from upstream
        run: |
          git remote add upstream https://github.com/yml2213/NavHub.git
          git fetch upstream
          git checkout main
          git merge upstream/main --no-edit
          git push origin main
```

> 如果出现冲突，需要手动处理后再推送。

</details>

---

<details>
<summary>方式二：Cloudflare Workers</summary>

> 支持自定义域名 + 优选 IP，国内访问更快更稳定。

### 前置要求

- GitHub 账号
- Cloudflare 账号（免费）
- 一个托管在 Cloudflare 的域名（可选，用于优选 IP）

### 步骤 1：Fork 仓库

点击本仓库右上角的 **Fork** 按钮，将项目复制到你的 GitHub 账号。

### 步骤 2：创建 Cloudflare API Token

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 进入 **My Profile** → **API Tokens** → **Create Token**
3. 选择模板：**Edit Cloudflare Workers**
4. 确认权限后点击 **Create Token**
5. **复制并保存** 生成的 Token（只显示一次）

### 步骤 3：获取 Account ID

在 Cloudflare Dashboard 任意页面的右侧栏，找到 **Account ID** 并复制。

### 步骤 4：配置 GitHub Secrets

进入你 Fork 的仓库 → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

添加以下 Secrets：

| Secret 名称             | 值                             |
| ----------------------- | ------------------------------ |
| `CLOUDFLARE_API_TOKEN`  | 步骤 2 创建的 Token            |
| `CLOUDFLARE_ACCOUNT_ID` | 步骤 3 获取的 Account ID       |
| `SYNC_PASSWORD`         | （可选）同步密码，用于保护数据 |

### 步骤 5：创建 KV 命名空间

1. 在 Cloudflare Dashboard 进入 **Workers & Pages** → **KV**
2. 点击 **Create a namespace**
3. 名称填入：`YNAV_WORKER_KV`
4. 创建后，**复制 Namespace ID**

### 步骤 6：更新配置文件

编辑你仓库中的 `wrangler.toml` 文件，将 KV ID 填入：

```toml
[[kv_namespaces]]
binding = "YNAV_WORKER_KV"
id = "你的 Namespace ID"  # ← 替换这里
```

### 步骤 7：触发部署

提交 `wrangler.toml` 的修改并推送到 `main` 分支，GitHub Actions 会自动构建并部署。

部署成功后，访问：`https://navhub.<你的账号>.workers.dev`

### 步骤 8：绑定自定义域名（可选，实现优选 IP）

1. 进入 **Workers & Pages** → 你的 Worker → **Settings** → **Triggers**
2. 在 **Custom Domains** 中添加你的域名，如 `nav.example.com`
3. 在你的域名 DNS 设置中，将该子域名 CNAME 到优选 IP

</details>

---

## 🔐 同步与权限

### 同步密码设置

同步密码用于保护你的导航数据，防止他人通过 API 修改。

| 部署方式 | 设置位置                                                         |
| -------- | ---------------------------------------------------------------- |
| Workers  | GitHub Secrets 的 `SYNC_PASSWORD` 或 Worker Settings → Variables |
| Pages    | Pages Settings → Environment variables                           |

设置后，在网站的 **设置** → **数据** 中输入相同密码即可开启同步。

> 说明：管理员密码接口带有按 IP 的错误次数限制（防爆破）。在本地/非 Cloudflare 环境若无法获取客户端 IP（缺少 `CF-Connecting-IP` / `X-Forwarded-For`），会回退为 `unknown`，导致多个请求共享同一限速键（看起来像“全局锁”）。建议在反代/本地调试时补齐 `X-Forwarded-For`。

### 管理员与用户模式

| 模式   | 权限                                       |
| ------ | ------------------------------------------ |
| 管理员 | 完整读写权限，可编辑链接、分类、设置等     |
| 用户   | 只读权限，仅可浏览和搜索，数据自动同步更新 |

- 设置同步密码后，输入正确密码进入管理员模式
- 未设置密码或密码错误时为用户模式

---

## 🔒 隐私分组

隐私分组用于存储敏感链接，支持独立密码保护。

### 功能特性

- 独立的链接存储空间，与普通链接分离
- 支持两种密码模式：
  - **同步密码模式**：使用同步密码解锁
  - **独立密码模式**：使用单独设置的密码
- 会话内自动解锁（可选）
- 管理员可禁用密码保护（方便个人使用）

### 数据安全

- 隐私链接使用 AES-256-GCM 加密存储
- 密码通过 PBKDF2 派生密钥（100,000 次迭代）
- 加密数据可同步到云端，但只有知道密码才能解密

---

## � 同步上游更新

当原仓库有新版本时：

**方法一：GitHub 网页操作**

在你的 Fork 仓库页面，点击 **Sync fork** → **Update branch**

**方法二：命令行**

```bash
git remote add upstream https://github.com/yml2213/NavHub.git
git fetch upstream
git merge upstream/main
git push
```

推送后会自动触发重新部署。

---

## 💻 本地开发

```bash
# 克隆仓库
git clone https://github.com/你的用户名/NavHub.git
cd NavHub

# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 运行测试
npm run test

# 启动 Workers 模拟环境（需要先 wrangler login）
npm run dev:workers
```

本地服务运行在 `http://localhost:5173`

---

## 📦 项目结构

```
NavHub/
├── src/                    # React 前端源码
│   ├── components/         # UI 组件
│   │   ├── layout/         # 布局组件
│   │   │   ├── ContextMenu.tsx    # 右键菜单
│   │   │   ├── LinkSections.tsx   # 链接区块
│   │   │   ├── MainHeader.tsx     # 主头部
│   │   │   └── Sidebar.tsx        # 侧边栏
│   │   ├── modals/         # 弹窗组件
│   │   │   ├── settings/          # 设置子模块
│   │   │   │   ├── AITab.tsx          # AI 设置
│   │   │   │   ├── AppearanceTab.tsx  # 外观设置
│   │   │   │   ├── DataTab.tsx        # 数据设置
│   │   │   │   ├── DuplicateChecker.tsx # 重复检测
│   │   │   │   └── SiteTab.tsx        # 站点设置
│   │   │   ├── LinkModal.tsx      # 链接编辑
│   │   │   ├── SettingsModal.tsx  # 设置弹窗
│   │   │   └── ...
│   │   └── ui/             # 通用 UI 组件
│   │       ├── LinkCard.tsx       # 链接卡片
│   │       ├── Icon.tsx           # 图标组件
│   │       ├── IconSelector.tsx   # 图标选择器
│   │       └── ...
│   ├── hooks/              # 自定义 Hooks
│   │   ├── useDataStore.ts    # 数据存储
│   │   ├── useSyncEngine.ts   # 同步引擎
│   │   ├── useTheme.ts        # 主题管理
│   │   ├── useSearch.ts       # 搜索功能
│   │   ├── useBatchEdit.ts    # 批量编辑
│   │   ├── useConfig.ts       # 配置管理
│   │   ├── useContextMenu.ts  # 右键菜单
│   │   ├── useSidebar.ts      # 侧边栏状态
│   │   ├── useSorting.ts      # 排序功能
│   │   └── useModals.ts       # 弹窗管理
│   ├── services/           # 服务层
│   │   ├── bookmarkParser.ts  # 书签解析
│   │   ├── exportService.ts   # 导出服务
│   │   └── geminiService.ts   # AI 服务
│   ├── utils/              # 工具函数
│   │   ├── privateVault.ts    # 隐私分组加密
│   │   ├── sensitiveConfig.ts # 敏感配置加密
│   │   ├── faviconCache.ts    # 图标缓存
│   │   ├── recommendation.ts  # 推荐算法
│   │   ├── iconTone.ts        # 图标色调分析
│   │   ├── tagColors.ts       # 动态标签颜色
│   │   └── constants.ts       # 常量定义
│   └── types.ts            # TypeScript 类型定义
├── functions/              # Cloudflare Pages Functions (API)
│   └── api/
│       ├── sync.ts         # 同步 API
│       └── ai.ts           # AI API
├── worker/                 # Cloudflare Workers 入口
│   └── index.ts
├── .github/workflows/      # CI/CD 自动部署
│   └── deploy-workers.yml
├── wrangler.toml           # Workers 部署配置
└── package.json
```

---

## 🛠️ 技术栈

| 层级      | 技术                                                |
| --------- | --------------------------------------------------- |
| 前端      | React 19.2, TypeScript 5.8, Vite 6.2                |
| 样式      | Tailwind CSS v4, Lucide Icons                       |
| 拖拽排序  | @dnd-kit/core, @dnd-kit/sortable                    |
| 状态/同步 | LocalStorage + 自定义同步引擎 + Cloudflare KV       |
| 后端      | Cloudflare Workers / Pages Functions + KV           |
| AI        | Google Generative AI SDK (@google/genai)            |
| 加密      | Web Crypto API (AES-GCM, PBKDF2)                    |
| 测试      | Vitest 4, fast-check (属性测试)                     |

---

## 📋 数据类型

### LinkItem（链接）

```typescript
interface LinkItem {
  id: string;
  title: string;
  url: string;
  icon?: string;           // Favicon URL
  iconTone?: string;       // 图标色调
  description?: string;    // 描述
  tags?: string[];         // 标签
  categoryId: string;      // 分类 ID
  createdAt: number;       // 创建时间
  pinned?: boolean;        // 是否置顶
  pinnedOrder?: number;    // 置顶排序
  order?: number;          // 分类内排序
  recommended?: boolean;   // 手动推荐
  recommendedOrder?: number;  // 推荐排序
  adminClicks?: number;    // 管理员点击次数
  adminLastClickedAt?: number; // 最近点击时间
}
```

### Category（分类）

```typescript
interface Category {
  id: string;
  name: string;
  icon: string;  // Lucide 图标名或 Emoji
}
```

### SiteSettings（站点设置）

```typescript
interface SiteSettings {
  title: string;           // 页面标题
  navTitle: string;        // 导航标题
  favicon: string;         // 站点图标
  cardStyle: 'detailed' | 'simple';  // 卡片样式
  accentColor?: string;    // 主题色（RGB 值）
  grayScale?: 'slate' | 'zinc' | 'neutral';  // 背景色调
  closeOnBackdrop?: boolean;  // 点击背景关闭弹窗
  backgroundImage?: string;   // 自定义背景图
  backgroundImageEnabled?: boolean;  // 启用背景图
  backgroundMotion?: boolean;  // 背景动效
}
```

---

## 🙏 鸣谢

本项目基于以下开源项目重构：

- [CloudNav-abcd](https://github.com/aabacada/CloudNav-abcd) by aabacada
- [CloudNav](https://github.com/sese972010/CloudNav-) by sese972010

感谢原作者们的开源贡献！

---

<div align="center">

Made with ❤️ by NavHub Team

</div>
