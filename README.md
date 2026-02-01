# Y-Nav (元启) - 你的 AI 智能导航仪表盘

<div align="center">

![React](https://img.shields.io/badge/React-19-blue?style=flat-square&logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=flat-square&logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-v4-38bdf8?style=flat-square&logo=tailwindcss)
![Cloudflare](https://img.shields.io/badge/Cloudflare-Workers%20%7C%20Pages-orange?style=flat-square&logo=cloudflare)

**极简、隐私、智能。**
**基于 Local-First 架构，配合 Cloudflare KV 实现无感多端同步。**

</div>

---

## ⚡ 一键部署

> 选择适合你的部署方式，Fork 后可以随时同步上游更新。

### 方式一：Cloudflare Workers (推荐国内用户)

**优势**：支持自定义域名 + 优选 IP，国内访问更快更稳定。

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/yml2213/Y-Nav)

<details>
<summary>📖 手动部署步骤</summary>

1. **Fork 本仓库**到你的 GitHub 账号

2. **创建 KV 命名空间** (Workers 专用，与 Pages 区分)
   ```bash
   # 登录 Cloudflare
   npx wrangler login
   
   # 创建 Workers 专用 KV
   npm run kv:create
   ```
   记下返回的 `id`，填入 `wrangler.toml` 的 `kv_namespaces.id` 字段。

3. **配置 GitHub Secrets**（用于 CI/CD 自动部署）
   - `CLOUDFLARE_API_TOKEN`：[创建 API Token](https://dash.cloudflare.com/profile/api-tokens)，需要 `Workers` 编辑权限
   - `CLOUDFLARE_ACCOUNT_ID`：在 Cloudflare Dashboard 右侧可找到
   - `SYNC_PASSWORD`：(可选) 同步密码

4. **推送代码触发部署**，或手动运行：
   ```bash
   npm install
   npm run deploy:workers
   ```

5. **绑定自定义域名** (实现优选 IP)
   - 进入 Cloudflare Dashboard -> Workers & Pages -> 你的 Worker -> Settings -> Triggers
   - 添加 Custom Domain，例如 `nav.yourdomain.com`
   - 在域名 DNS 处将该域名 CNAME 到 Cloudflare 优选 IP

</details>

---

### 方式二：Cloudflare Pages (简单快速)

**优势**：配置最简单，适合海外用户或快速体验。

<details>
<summary>📖 部署步骤</summary>

1. **Fork 本仓库**到你的 GitHub 账号

2. **创建 Pages 项目**
   - 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
   - 进入 **Workers & Pages** -> **Create Application** -> **Pages** -> **Connect to Git**
   - 选择刚才 Fork 的仓库 `Y-Nav`

3. **配置构建**
   - **Framework preset**: None
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`

4. **绑定 KV 数据库** (开启同步功能)
   - **Workers & Pages** -> **KV** -> **Create a Namespace** (命名为 `YNAV_DB`)
   - 回到 Pages 项目 -> **Settings** -> **Functions** -> **KV Namespace Bindings**
   - 添加绑定：`YNAV_KV` -> `YNAV_DB`

5. **设置同步密码** (可选但推荐)
   - Pages 项目 -> **Settings** -> **Environment variables**
   - 添加：`SYNC_PASSWORD` = 你的密码
   - 重新部署后生效

</details>

---

## ✨ 核心特性

- **🚀 极简设计**: 基于 React 19 + Tailwind CSS v4 构建，极速启动，丝滑交互。
- **☁️ 云端同步**: 利用 **Cloudflare KV** 实现多设备（公司、家庭、移动端）实时数据同步。
- **🧠 AI 整理**: 内置 Google Gemini / OpenAI 接口支持，一键生成网站简介，智能推荐分类。
- **🔒 安全隐私**: 
  - **Local-First**: 数据优先存储在本地，不依赖服务器也能使用。
  - **API 鉴权**: 支持设置同步密码，防止未授权访问。
- **🎨 个性化**: 支持深色模式、自定义主题色、背景风格、背景图与动态高光、卡片布局切换。
- **📱 响应式**: 完美适配桌面端和移动端浏览器。

## 🛠️ 技术栈

| 层级 | 技术 |
|------|------|
| **Frontend** | React 19, TypeScript, Vite |
| **Styling** | Tailwind CSS v4, Lucide React Icons |
| **State/Sync** | LocalStorage + Custom Sync Engine (Optimistic UI) |
| **Backend** | Cloudflare Workers / Pages Functions + KV |
| **AI** | Google Generative AI SDK |

## 📦 项目结构

```
Y-Nav/
├── src/                    # React 前端源码
├── functions/              # Cloudflare Pages Functions (API)
│   └── api/sync.ts
├── worker/                 # Cloudflare Workers 入口
│   └── index.ts
├── .github/workflows/      # CI/CD 自动部署
│   └── deploy-workers.yml  # Workers 自动部署 (push main 触发)
├── wrangler.toml           # Workers 部署配置
└── package.json
```

## ✅ 本地开发

```bash
# 安装依赖
npm install

# 启动开发服务器 (仅前端)
npm run dev

# 启动 Workers 模拟环境 (含 API)
npm run dev:workers
```

本地服务默认运行在 `http://localhost:3000`。

## 🔄 同步上游更新

Fork 后，当上游有新版本时，可以通过以下方式同步：

```bash
# 添加上游仓库
git remote add upstream https://github.com/yml2213/Y-Nav.git

# 拉取并合并更新
git fetch upstream
git merge upstream/main

# 推送到你的仓库 (触发自动部署)
git push
```

或直接在 GitHub 仓库页面点击 **Sync fork** 按钮。

## 🙏 鸣谢 (Credits)

本项目基于以下优秀的开源项目进行深度重构与二改：

- **原项目**: [CloudNav-abcd](https://github.com/aabacada/CloudNav-abcd) by aabacada
- **原原项目**: [CloudNav](https://github.com/sese972010/CloudNav-) by sese972010

感谢原作者们的开源贡献！

---

<div align="center">
Made with ❤️ by Y-Nav Team
</div>
