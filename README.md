# Y-Nav (元启) - 你的 AI 智能导航仪表盘

<div align="center">

![React](https://img.shields.io/badge/React-19-blue?style=flat-square&logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=flat-square&logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-v4-38bdf8?style=flat-square&logo=tailwindcss)
![Cloudflare Pages](https://img.shields.io/badge/Cloudflare-Pages-orange?style=flat-square&logo=cloudflare)

**极简、隐私、智能。**
**基于 Local-First 架构，配合 Cloudflare KV 实现无感多端同步。**

</div>

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

- **Frontend**: React 19, TypeScript, Vite
- **Styling**: Tailwind CSS v4, Lucide React Icons
- **State/Sync**: LocalStorage + Custom Sync Engine (Optimistic UI)
- **Backend**: Cloudflare Pages Functions + Workers KV
- **AI**: Google Generative AI SDK

## 🚀 部署指南 (Cloudflare Pages)

本项目专为 Cloudflare Pages 设计，**零成本**部署。

### 1. 准备工作
Fork 本仓库到你的 GitHub 账号。

### 2. 创建项目
1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)。
2. 进入 **Workers & Pages** -> **Create Application** -> **Pages** -> **Connect to Git**。
3. 选择刚才 Fork 的仓库 `Y-Nav`。

### 3. 配置构建
- **Framework Intent**: None (或手动设置)
- **Build command**: `npm run build`
- **Output directory**: `dist`

### 4. 绑定 KV 数据库 (关键步骤)
为了启用同步功能，你需要创建一个 KV 命名空间：
1. 在 Cloudflare 后台 **Workers & Pages** -> **KV** -> **Create a Namespace** (例如命名为 `YNAV_DB`)。
2. 回到你的 Pages 项目页面 -> **Settings** -> **Functions** -> **KV Namespace Bindings**。
3. 添加绑定：
   - **Variable name**: `YNAV_KV` (必须完全一致)
   - **KV Namespace**: 选择刚才创建的 `YNAV_DB`

### 5. 增强安全性 (可选但推荐)
为了防止他人通过 API 修改你的数据，建议设置访问密码：
1. Pages 项目页面 -> **Settings** -> **Environment variables**。
2. 添加变量：
   - **Variable name**: `SYNC_PASSWORD`
   - **Value**: (设置你的强密码)
3. **重新部署 (Redeploy)** 项目以生效。
4. 部署完成后，进入网站 **设置** -> **数据**，输入相同的密码即可解锁同步功能。

## ✅ 快速开始

```bash
# 安装依赖
npm install

# 启动本地开发服务器
npm run dev
```

本地服务默认运行在 `http://localhost:3000`。

## 🧪 本地开发 (Cloudflare 模拟)

```bash
# 启动带有 Cloudflare 模拟环境的开发服务器 (需安装 Wrangler)
# 注意：你需要先登录 wrangler login
npm run build
npx wrangler pages dev dist --kv YNAV_KV
```

## 🙏 鸣谢 (Credits)

本项目基于以下优秀的开源项目进行深度重构与二改：

- **原项目**: [CloudNav-abcd](https://github.com/aabacada/CloudNav-abcd) by aabacada
- **原原项目**: [CloudNav](https://github.com/sese972010/CloudNav-) by sese972010

感谢原作者们的开源贡献！

---

<div align="center">
Made with ❤️ by Y-Nav Team
</div>
