# NavHub 开发指南

本文档为开发者提供本地开发、测试、代码规范等指导。

---

## 目录

1. [环境要求](#环境要求)
2. [快速开始](#快速开始)
3. [开发命令](#开发命令)
4. [项目配置](#项目配置)
5. [代码规范](#代码规范)
6. [测试](#测试)
7. [调试技巧](#调试技巧)
8. [常见问题](#常见问题)

---

## 环境要求

| 工具 | 版本要求 | 说明 |
|------|----------|------|
| Node.js | >= 18.x | 推荐 LTS 版本 |
| npm | >= 9.x | 随 Node.js 安装 |
| Git | >= 2.x | 版本控制 |
| Wrangler | >= 4.x | Cloudflare CLI（可选） |

### 推荐开发工具

- **VS Code** + 以下扩展：
  - Biome (代码格式化/检查)
  - Tailwind CSS IntelliSense
  - TypeScript Vue Plugin (Volar)

---

## 快速开始

### 1. 克隆仓库

```bash
git clone https://github.com/Junhao2314/NavHub.git
cd NavHub
```

### 2. 安装依赖

```bash
npm install
```

### 3. 启动开发服务器

```bash
npm run dev
```

访问 `http://localhost:3000`

> **注意**: Vite dev server 不包含 `/api/*` 路由。如需联调同步/AI 接口，参见 [联调后端 API](#联调后端-api)。

---

## 开发命令

### 常用命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动 Vite 开发服务器 |
| `npm run build` | 构建生产版本 |
| `npm run preview` | 预览构建产物 |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm run lint` | 代码检查 (Biome) |
| `npm run format` | 代码格式化 (Biome) |
| `npm run check` | 完整代码检查 |
| `npm run check:fix` | 检查并自动修复 |

### Workers/Pages 开发

| 命令 | 说明 |
|------|------|
| `npm run dev:workers` | 启动 Workers 本地模拟 |
| `npm run dev:pages` | 启动 Pages 本地模拟 |
| `npm run deploy:workers` | 部署到 Workers |
| `npm run deploy:pages` | 部署到 Pages |
| `npm run kv:create` | 创建 KV 命名空间 |

### 辅助命令

| 命令 | 说明 |
|------|------|
| `npm run doctor` | 运行环境自检 |
| `npm run eol:check` | 检查行尾格式 |
| `npm run eol:fix` | 修复行尾格式 |

---

## 项目配置

### 环境变量

创建 `.dev.vars` 文件用于本地开发（已在 `.gitignore` 中忽略）：

```bash
# 同步密码
SYNC_PASSWORD=your-password

# CORS 配置
SYNC_CORS_ALLOWED_ORIGINS=http://localhost:3000

# AI 代理配置
AI_PROXY_ALLOWED_HOSTS=api.openai.com
```

### 联调后端 API

Vite 开发服务器不运行 Workers/Pages Functions。要联调 `/api/*` 接口：

**方法一：代理到本地 Worker**

```bash
# 终端 1: 启动 Worker
npm run dev:workers

# 终端 2: 启动 Vite（设置代理）
# Bash:
VITE_API_PROXY_TARGET=http://127.0.0.1:8787 npm run dev

# PowerShell:
$env:VITE_API_PROXY_TARGET='http://127.0.0.1:8787'; npm run dev
```

**方法二：代理到远端 Worker**

```bash
VITE_API_PROXY_TARGET=https://your-worker.workers.dev npm run dev
```

### Wrangler 配置

`wrangler.toml` 关键配置：

```toml
name = "navhub"
main = "worker/index.ts"
compatibility_date = "2024-01-01"

# 静态资源
[assets]
directory = "./dist"
binding = "ASSETS"

# KV 绑定（必须）
[[kv_namespaces]]
binding = "NAVHUB_WORKER_KV"
id = "你的 KV ID"

# R2 绑定（推荐）
[[r2_buckets]]
binding = "NAVHUB_WORKER_R2"
bucket_name = "navhub-sync"

# 环境变量（可选）
[vars]
# SYNC_PASSWORD = "..." # 建议通过 Dashboard 设置
```

---

## 代码规范

### 格式化与检查

NavHub 使用 [Biome](https://biomejs.dev/) 进行代码格式化和检查。

```bash
# 检查代码
npm run lint

# 格式化代码
npm run format

# 完整检查并修复
npm run check:fix
```

### TypeScript 规范

```bash
# 类型检查
npm run typecheck
```

**类型检查范围**：
- `src/` - 前端代码 (`tsconfig.json`)
- `worker/` - Workers 代码 (`worker/tsconfig.json`)

### 命名约定

| 类型 | 规范 | 示例 |
|------|------|------|
| 组件 | PascalCase | `LinkCard.tsx` |
| Hook | camelCase + use 前缀 | `useDataStore.ts` |
| 工具函数 | camelCase | `normalizeUrl.ts` |
| 类型 | PascalCase | `interface LinkItem` |
| 常量 | UPPER_SNAKE_CASE | `LOCAL_STORAGE_KEY` |
| CSS 类 | kebab-case / Tailwind | `bg-primary-500` |

### 目录规范

- `components/` - 仅放 React 组件
- `hooks/` - 自定义 React Hooks
- `utils/` - 纯函数工具
- `services/` - 业务服务（API 调用等）
- `types.ts` - 全局类型定义

### 导入顺序

```typescript
// 1. React 核心
import { useCallback, useState } from 'react';

// 2. 第三方库
import { arrayMove } from '@dnd-kit/sortable';

// 3. 内部模块 - 绝对路径
import { LinkItem } from '../types';

// 4. 相对路径
import { useDialog } from './DialogProvider';
```

---

## 测试

### 测试框架

NavHub 使用 [Vitest](https://vitest.dev/) 作为测试框架。

```bash
# 运行测试
npx vitest

# 运行测试（监听模式）
npx vitest --watch

# 生成覆盖率报告
npx vitest --coverage
```

### 测试文件位置

测试文件与源文件同目录，命名规范：

```
src/
├── hooks/
│   ├── useDataStore.ts
│   └── useDataStore.test.tsx    # 测试文件
├── utils/
│   ├── url.ts
│   └── url.test.ts              # 测试文件
```

### 测试示例

```typescript
// src/utils/url.test.ts
import { describe, expect, it } from 'vitest';
import { normalizeHttpUrl } from './url';

describe('normalizeHttpUrl', () => {
  it('should add https:// to URLs without protocol', () => {
    expect(normalizeHttpUrl('example.com')).toBe('https://example.com');
  });

  it('should return null for invalid URLs', () => {
    expect(normalizeHttpUrl('not a url')).toBeNull();
  });
});
```

### 组件测试

```typescript
// src/hooks/useDataStore.test.tsx
import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useDataStore } from './useDataStore';

describe('useDataStore', () => {
  it('should add a new link', () => {
    const { result } = renderHook(() => useDataStore());

    act(() => {
      result.current.addLink({
        title: 'Test',
        url: 'https://example.com',
        categoryId: 'dev',
      });
    });

    expect(result.current.links).toHaveLength(1);
  });
});
```

---

## 调试技巧

### 前端调试

1. **React DevTools**: 检查组件状态和 props
2. **localStorage 查看**: DevTools → Application → Local Storage
3. **网络请求**: DevTools → Network → 筛选 `/api/`

### Workers 调试

```bash
# 启动 Workers 开发服务器
npm run dev:workers

# 查看日志
wrangler tail
```

### 常用调试点

| 位置 | 说明 |
|------|------|
| `useDataStore.ts` | 数据 CRUD 操作 |
| `useSyncEngine.ts` | 同步逻辑 |
| `shared/syncApi/handlers.ts` | 后端 API 处理 |
| `shared/syncApi/auth.ts` | 认证与防爆破 |

### 模拟不同角色

```javascript
// 浏览器控制台

// 模拟用户模式（清除同步密码）
localStorage.removeItem('navhub_sync_password');
location.reload();

// 模拟管理员模式
localStorage.setItem('navhub_sync_password', 'your-password');
location.reload();
```

---

## 常见问题

### Windows 构建失败 (spawn EPERM)

部分 Windows 环境可能阻止 esbuild 执行：

```bash
# 1. 运行自检
npm run doctor

# 2. 如果失败，尝试：
# - 移动项目到非同步目录（避免 OneDrive/百度网盘）
# - 添加杀软排除
# - 使用 WSL2 环境
```

详见 README.md 的 [Windows 构建失败排障](../README.md#-windows-构建失败spawn-eperm排障) 章节。

### Vite 开发服务器无 API

Vite 不运行 Workers/Pages Functions，`/api/*` 返回 404。

**解决方案**：配置 API 代理，参见 [联调后端 API](#联调后端-api)。

### TypeScript 类型错误

```bash
# 完整类型检查
npm run typecheck

# 常见问题：
# 1. 缺少类型定义 → 检查 @types/* 依赖
# 2. 路径别名问题 → 检查 tsconfig.json paths
# 3. Workers 类型 → 检查 @cloudflare/workers-types
```

### 同步冲突处理

开发时频繁修改数据可能触发版本冲突：

```javascript
// 清除本地同步状态
localStorage.removeItem('navhub_sync_meta');
location.reload();
```

### 清理开发数据

```javascript
// 完全清除所有 NavHub 数据
Object.keys(localStorage)
  .filter(k => k.startsWith('navhub'))
  .forEach(k => localStorage.removeItem(k));
location.reload();
```

---

## 相关文档

- [架构设计](./ARCHITECTURE.md)
- [API 接口文档](./API.md)
- [自定义 Hooks](./HOOKS.md)
- [数据模型](./DATA-MODELS.md)
- [安全设计](./SECURITY.md)
