# NavHub API 文档

本文档描述 NavHub 在 **Cloudflare Workers / Cloudflare Pages Functions** 部署后暴露的 HTTP API。

- 同步 API：`/api/sync`
- AI 代理：`/api/ai`
- KV 指标与降本建议：`docs/kv-cost-optimization.md`

实现与类型（可作为"权威来源"）：

- `/api/sync`：`shared/syncApi.ts`、`shared/syncApi/handlers.ts`，数据结构见 `src/types.ts`（`NavHubSyncData`、`Sync*Response` 等）
- `/api/ai`：`shared/aiProxy.ts`

## 通用约定

- 数据格式：JSON（请求与响应通常为 `application/json`）
- 失败响应：一般为 `{ "success": false, "error": "..." }`（`/api/ai` 在"代理成功"时会直透上游响应，见下文）
- 时间戳：毫秒（例如 `meta.updatedAt`）

---

## `/api/sync`（云端同步）

### 权限与鉴权（管理员/用户）

服务端通过环境变量 `SYNC_PASSWORD` 控制同步接口是否需要管理员密码：

- **未配置 `SYNC_PASSWORD`**：所有请求视为管理员（`role=admin`，可写）。
- **配置了 `SYNC_PASSWORD`**：通过请求头 `X-Sync-Password: <SYNC_PASSWORD>` 进入管理员模式。
  - 不带 `X-Sync-Password`：用户模式（只读；读取时会脱敏）。
  - 带了 `X-Sync-Password` 但密码错误：接口会返回 `401/429`（不会降级成 user）。

### 防爆破（错误次数限制）

当配置了 `SYNC_PASSWORD` 且密码错误时，会按 **客户端 IP** 记录失败次数并锁定：

- 连续失败 **5 次**：锁定 **1 小时**
- `401`：返回剩余次数
- `429`：返回锁定截止时间，并带 `Retry-After` 响应头

响应示例（字段可能因接口不同略有差异）：

```json
{ "success": false, "error": "密码错误", "remainingAttempts": 4, "maxAttempts": 5 }
```

```json
{
  "success": false,
  "error": "登录失败：连续输入错误次数过多，请稍后重试",
  "lockedUntil": 1730000000000,
  "retryAfterSeconds": 3600,
  "maxAttempts": 5
}
```

> IP 获取优先级：`CF-Connecting-IP` → `X-Forwarded-For` → `unknown`。本地/非 Cloudflare 环境建议补齐 `X-Forwarded-For`，避免出现"多个请求共享同一把锁"的现象。

### 脱敏规则（非常重要）

- 服务端不会保存/返回明文 `aiConfig.apiKey`：无论管理员或用户读取，都会被清空为 `""`。
- 用户模式读取会额外移除可能泄露隐私的字段（例如 `privateVault`、`encryptedSensitiveConfig`、`privacyConfig` 等）。

### 端点一览（通过 query 参数 `action` 路由）

| 方法 | 路径 | action | 说明 |
| --- | --- | --- | --- |
| GET | `/api/sync` |  | 读取云端数据（用户/管理员） |
| GET | `/api/sync` | `auth` | 查询当前请求权限状态 |
| POST | `/api/sync` | `login` | 管理员登录（触发失败次数限制） |
| POST | `/api/sync` |  | 写入云端数据（带版本校验） |
| POST | `/api/sync` | `backup` | 创建快照备份 |
| GET | `/api/sync` | `backup` | 获取备份数据（用于导出） |
| GET | `/api/sync` | `backups` | 获取同步历史列表（不含手动备份） |
| POST | `/api/sync` | `restore` | 从备份恢复（并创建回滚点） |
| DELETE | `/api/sync` | `backup` | 删除指定备份 |

---

### `GET /api/sync` 读取云端数据

请求头（可选）：

- `X-Sync-Password`: 管理员密码（仅当服务端配置了 `SYNC_PASSWORD` 时有效）

响应（200）：

- `success: true`
- `role: "admin" | "user"`
- `data: NavHubSyncData | null`
- `message?: string`（例如云端无数据时会返回提示）

示例：

```bash
curl -s https://<your-domain>/api/sync
curl -s -H "X-Sync-Password: <password>" https://<your-domain>/api/sync
```

---

### `GET /api/sync?action=auth` 查询权限状态

响应（200）：

```json
{ "success": true, "protected": true, "role": "user", "canWrite": false }
```

示例：

```bash
curl -s "https://<your-domain>/api/sync?action=auth"
curl -s -H "X-Sync-Password: <password>" "https://<your-domain>/api/sync?action=auth"
```

---

### `POST /api/sync?action=login` 管理员登录（校验密码）

请求头：

- `X-Sync-Password: <password>`

响应：

- `200`：登录成功，返回 `role=admin`、`canWrite=true`
- `401/429`：密码错误/锁定（见"防爆破"）

示例：

```bash
curl -s -X POST "https://<your-domain>/api/sync?action=login" \
  -H "X-Sync-Password: <password>" \
  -H "Content-Type: application/json" \
  -d "{}"
```

---

### `POST /api/sync` 写入云端数据（带版本校验）

仅管理员可写（需 `X-Sync-Password`，除非服务端未设置 `SYNC_PASSWORD`）。

请求体：

- `data`：完整同步数据（`NavHubSyncData`）
- `expectedVersion?`：乐观锁校验（客户端期望的"当前云端 version"）
- `syncKind?`：`"auto" | "manual"`（服务端会归一化）
- `skipHistory?`：是否跳过写入同步历史记录
  - `auto` 同步：默认 `true`（不写入历史），除非显式设为 `false`
  - `manual` 同步：默认 `false`（写入历史），除非显式设为 `true`
  - 适用于高频"统计同步"等场景，避免刷屏

关键行为：

- 服务端会覆盖 `data.meta.updatedAt / data.meta.version / data.meta.syncKind`，以服务端时间与版本号为准。
- 当 `expectedVersion` 与云端不一致时返回 `409`，并附带最新云端数据供客户端处理冲突。

成功响应（200）：

```json
{ "success": true, "data": { "...": "..." }, "historyKey": "navhub:backup:history-...", "message": "同步成功" }
```

冲突响应（409）：

```json
{ "success": false, "conflict": true, "data": { "...latest remote..." }, "error": "版本冲突，云端数据已被其他设备更新" }
```

示例：

```bash
curl -s -X POST "https://<your-domain>/api/sync" \
  -H "X-Sync-Password: <password>" \
  -H "Content-Type: application/json" \
  -d "{\"data\": {\"links\": [], \"categories\": [], \"meta\": {\"updatedAt\": 0, \"deviceId\": \"dev-1\", \"version\": 0}}, \"expectedVersion\": 0}"
```

---

### `POST /api/sync?action=backup` 创建快照备份

请求体：

- `data: NavHubSyncData`

响应（200）：

- `backupKey`：形如 `navhub:backup:2025-01-01T00-00-00-000Z`

示例：

```bash
curl -s -X POST "https://<your-domain>/api/sync?action=backup" \
  -H "X-Sync-Password: <password>" \
  -H "Content-Type: application/json" \
  -d "{\"data\": {\"links\": [], \"categories\": [], \"meta\": {\"updatedAt\": 0, \"deviceId\": \"dev-1\", \"version\": 1}}}"
```

---

### `GET /api/sync?action=backup&backupKey=...` 获取备份数据

查询参数：

- `backupKey`：备份 key

示例：

```bash
curl -s "https://<your-domain>/api/sync?action=backup&backupKey=navhub%3Abackup%3A2025-01-01T00-00-00-000Z"
```

---

### `GET /api/sync?action=backups` 获取同步历史列表

> 注意：此接口仅返回**同步历史记录**（`navhub:backup:history-*`），不包含手动创建的快照备份（`navhub:backup:TIMESTAMP`）。

响应（200）：

- `backups: SyncBackupItem[]`
  - 包含 `key / timestamp / kind / deviceId / updatedAt / version / browser / os / isCurrent` 等字段

示例：

```bash
curl -s "https://<your-domain>/api/sync?action=backups"
```

---

### `POST /api/sync?action=restore` 从备份恢复（并创建回滚点）

请求体：

- `backupKey`：要恢复的备份 key
- `deviceId?`：用于写回 `meta.deviceId`（便于标记"由哪个设备触发恢复"）

响应（200）：

- `data`：恢复后的主数据（版本号会在"当前主数据版本"基础上 +1）
- `rollbackKey?`：回滚点 key（如果创建失败则可能为 `null/undefined`）

示例：

```bash
curl -s -X POST "https://<your-domain>/api/sync?action=restore" \
  -H "X-Sync-Password: <password>" \
  -H "Content-Type: application/json" \
  -d "{\"backupKey\": \"navhub:backup:2025-01-01T00-00-00-000Z\", \"deviceId\": \"dev-restore\"}"
```

---

### `DELETE /api/sync?action=backup` 删除备份

请求体：

- `backupKey`

注意：

- 不允许删除"当前版本对应的同步历史记录"（会返回 400）。

示例：

```bash
curl -s -X DELETE "https://<your-domain>/api/sync?action=backup" \
  -H "X-Sync-Password: <password>" \
  -H "Content-Type: application/json" \
  -d "{\"backupKey\": \"navhub:backup:2025-01-01T00-00-00-000Z\"}"
```

---

### CORS（仅 Workers 入口提供）

Cloudflare Workers 入口（`worker/index.ts`）对 `/api/sync` 额外提供了 CORS 与 `OPTIONS` 预检支持：

- 环境变量：`SYNC_CORS_ALLOWED_ORIGINS`（逗号分隔；默认仅同源；可设为 `*` 允许任意 Origin，不推荐）
- 允许方法：`GET, POST, DELETE, OPTIONS`
- 允许请求头：`Content-Type, X-Sync-Password`

---

## `/api/ai`（OpenAI Compatible 代理）

`/api/ai` 是一个 **OpenAI Compatible** 的轻量代理，用于在浏览器直连受 CORS 限制时，通过同源代理转发请求。

### 端点一览

| 方法 | 路径 | action | 说明 |
| --- | --- | --- | --- |
| OPTIONS | `/api/ai` |  | CORS 预检（由 `shared/aiProxy.ts` 处理） |
| POST | `/api/ai` | `chat`（默认） | 代理到上游 `.../chat/completions` |
| POST | `/api/ai` | `models` | 代理到上游 `.../models` |

### 请求体

`action=chat`：

```json
{ "baseUrl": "https://api.openai.com/v1", "apiKey": "sk-...", "payload": { "model": "...", "messages": [] } }
```

`action=models`：

```json
{ "baseUrl": "https://api.openai.com/v1", "apiKey": "sk-..." }
```

说明：

- `baseUrl` 可省略，默认 `https://api.openai.com/v1`
- `baseUrl` 若不带 scheme，会自动补全为 `https://...`

### 响应行为（直透上游）

当代理成功转发到上游后，响应体会 **原样返回上游内容**（包含流式 `text/event-stream`），不会包一层 `{ success: true, ... }`。

仅当代理自身拦截（例如入参错误、CORS 不允许、host 不在白名单、重定向被拦截）时，才会返回类似：

```json
{ "success": false, "error": "..." }
```

### CORS 与安全限制

为避免 SSRF / open-proxy，`/api/ai` 对上游与跨域做了限制：

- 上游 host 白名单：`AI_PROXY_ALLOWED_HOSTS`（逗号分隔）
  - 默认仅允许 `api.openai.com`
  - 支持 `*.example.com`（仅子域名，不匹配根域名）
  - 支持端口：`example.com:443`
  - 不支持 `*` 全放开
- 允许跨域来源：`AI_PROXY_ALLOWED_ORIGINS`（逗号分隔；默认仅同源）
- 仅允许 `https:` 上游；可通过 `AI_PROXY_ALLOW_INSECURE_HTTP=true` 放开 `http:`（不推荐）
- 禁止私网/本机 host（例如 `localhost`、`127.0.0.1`、`10.0.0.0/8`、`192.168.0.0/16`、`fe80::/10` 等）
- 上游重定向最多跟随 3 次，且重定向目标仍需满足白名单与安全校验

示例：

```bash
curl -s -X POST "https://<your-domain>/api/ai?action=models" \
  -H "Content-Type: application/json" \
  -d "{\"apiKey\":\"sk-...\",\"baseUrl\":\"https://api.openai.com/v1\"}"
```
