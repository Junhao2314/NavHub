# NavHub API 文档

本文档描述 NavHub 在 **Cloudflare Workers / Cloudflare Pages Functions** 部署后暴露的 HTTP API。

- 同步 API：`/api/sync`
- AI 代理：`/api/ai`
- KV 指标与降本建议：`docs/kv-cost-optimization.md`

实现与类型（可作为"权威来源"）：

- `/api/sync`：`shared/syncApi.ts`、`shared/syncApi/handlers.ts`，数据结构见 `src/types.ts`（`NavHubSyncData`、`Sync*Response` 等）
- `/api/ai`：`shared/aiProxy.ts`

---

## 环境变量配置

### 必需绑定

| 变量名 | 类型 | 说明 |
| --- | --- | --- |
| `NAVHUB_KV` | KV Namespace | Cloudflare Pages Functions 的 KV 绑定名 |
| `NAVHUB_WORKER_KV` | KV Namespace | Cloudflare Workers (wrangler.toml) 的 KV 绑定名 |

> **注意**：`NAVHUB_KV` 和 `NAVHUB_WORKER_KV` 二选一即可，系统会自动检测。

### 可选绑定

| 变量名 | 类型 | 说明 |
| --- | --- | --- |
| `NAVHUB_R2` | R2 Bucket | Pages Functions 的 R2 绑定（推荐：避免 KV 25MB 限制 + 提供更强一致性） |
| `NAVHUB_WORKER_R2` | R2 Bucket | Workers 的 R2 绑定 |

### 同步 API 配置

| 变量名 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `SYNC_PASSWORD` | string | 无 | 管理员密码。未设置时所有请求均为管理员权限 |
| `SYNC_CORS_ALLOWED_ORIGINS` | string | 无 | 允许的 CORS 来源（逗号分隔）。可设为 `*` 允许任意来源（不推荐） |

### AI 代理配置

| 变量名 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `AI_PROXY_ALLOWED_HOSTS` | string | `api.openai.com` | 允许的上游主机名（逗号分隔）。支持通配符 `*.example.com` |
| `AI_PROXY_ALLOWED_ORIGINS` | string | 同源 | 允许的 CORS 来源（逗号分隔） |
| `AI_PROXY_ALLOW_INSECURE_HTTP` | string | `false` | 是否允许 `http:` 协议（不推荐） |

---

## 通用约定

### 数据格式

- 请求与响应均为 `application/json`
- 时间戳：毫秒级 Unix 时间戳（例如 `meta.updatedAt`）

### 通用响应头

所有 `/api/sync` 响应包含以下头：

```
Cache-Control: no-store
Vary: X-Sync-Password
Content-Type: application/json
```

### 通用响应格式

**成功响应**：

```json
{ "success": true, "data": {...}, "message": "..." }
```

**失败响应**：

```json
{ "success": false, "error": "错误描述" }
```

> **注意**：`/api/ai` 在"代理成功"时会直透上游响应，不会包一层 `{ success: true, ... }`。

---

## HTTP 状态码一览

### `/api/sync` 状态码

| 状态码 | 说明 | 触发场景 |
| --- | --- | --- |
| `200` | 成功 | 请求正常完成 |
| `400` | 请求错误 | 无效 JSON、无效 data 字段、无效备份 key、当前记录不允许删除 |
| `401` | 未授权 | 未提供密码、密码错误（返回剩余次数） |
| `403` | 禁止访问 | CORS 来源不允许 |
| `404` | 未找到 | 备份不存在或已过期 |
| `405` | 方法不允许 | 使用了不支持的 HTTP 方法 |
| `409` | 版本冲突 | `expectedVersion` 与云端版本不匹配 |
| `413` | 请求体过大 | 数据超过 KV 25MB 限制（R2 模式无此限制） |
| `429` | 请求过多 | 密码错误次数超限，已锁定 |
| `500` | 服务器错误 | KV 绑定缺失、读写失败、R2 etag 缺失 |

### `/api/ai` 状态码

| 状态码 | 说明 | 触发场景 |
| --- | --- | --- |
| `200` | 成功 | 代理请求成功（直透上游响应） |
| `400` | 请求错误 | 无效 JSON、缺少 `apiKey`、无效 `baseUrl`、缺少 `payload` |
| `403` | 禁止访问 | CORS 来源不允许、`baseUrl` 主机不在白名单、指向私有网络 |
| `405` | 方法不允许 | 非 POST 请求（OPTIONS 除外） |
| `502` | 网关错误 | 上游重定向次数过多、重定向目标无效/不允许 |

---

## 错误响应详细格式

### 401 未授权（密码错误，未锁定）

```json
{
  "success": false,
  "error": "密码错误",
  "remainingAttempts": 4,
  "maxAttempts": 5
}
```

### 401 未授权（未提供密码）

```json
{
  "success": false,
  "error": "Unauthorized: 管理员密码错误或未提供"
}
```

### 429 请求过多（已锁定）

```json
{
  "success": false,
  "error": "登录失败：连续输入错误次数过多，请稍后重试",
  "lockedUntil": 1730000000000,
  "retryAfterSeconds": 3600,
  "maxAttempts": 5
}
```

响应头包含：

```
Retry-After: 3600
```

### 409 版本冲突

```json
{
  "success": false,
  "conflict": true,
  "data": { "...最新云端数据..." },
  "error": "版本冲突，云端数据已被其他设备更新"
}
```

### 413 数据过大（KV 模式）

```json
{
  "success": false,
  "error": "数据过大，超过 Cloudflare KV 25MB 限制。建议绑定 R2（NAVHUB_R2 / NAVHUB_WORKER_R2）作为主同步存储。"
}
```

### 400 无效请求

```json
{ "success": false, "error": "无效的 JSON 请求体" }
{ "success": false, "error": "无效的 data 字段" }
{ "success": false, "error": "无效的备份 key" }
{ "success": false, "error": "当前记录不允许删除" }
```

### 404 未找到

```json
{ "success": false, "error": "备份不存在或已过期" }
```

### 500 服务器错误

```json
{ "success": false, "error": "KV binding missing" }
{ "success": false, "error": "R2 etag missing" }
{ "success": false, "error": "读取失败" }
{ "success": false, "error": "写入失败" }
```

---

## `/api/sync`（云端同步）

### 权限与鉴权（管理员/用户）

服务端通过环境变量 `SYNC_PASSWORD` 控制同步接口是否需要管理员密码：

- **未配置 `SYNC_PASSWORD`**：所有请求视为管理员（`role=admin`，可写）。
- **配置了 `SYNC_PASSWORD`**：通过请求头 `X-Sync-Password: <SYNC_PASSWORD>` 进入管理员模式。
  - 不带 `X-Sync-Password`：用户模式（只读；读取时会脱敏）。
  - 带了 `X-Sync-Password` 但密码错误：接口会返回 `401/429`（不会降级成 user）。

### 防爆破（错误次数限制）

当配置了 `SYNC_PASSWORD` 且密码错误时，会按 **客户端标识** 记录失败次数并锁定。

#### 三级限流策略

根据客户端标识的可信度，采用不同的限流阈值：

| IP 来源 | 最大失败次数 | 说明 |
| --- | --- | --- |
| `CF-Connecting-IP` | **5 次** | Cloudflare 提供的真实 IP，可信度最高 |
| `X-Forwarded-For` + 指纹 | **3 次** | 代理 IP（可被伪造），结合 User-Agent 等请求特征降低绕过风险 |
| 无 IP + 有指纹 | **3 次** | 无 IP 但有 User-Agent、Accept-Language 等请求特征 |
| 完全无指纹 | **2 次** | 无任何可识别特征的请求，采用最严格限流 |

- 超过限制后：锁定 **1 小时**
- `401`：返回剩余次数
- `429`：返回锁定截止时间，并带 `Retry-After` 响应头

#### 请求指纹收集

当无法获取 IP 时，服务端会收集以下请求头作为客户端指纹：

- `User-Agent`
- `Accept-Language`
- `Accept-Encoding`
- `Sec-Ch-Ua`（Chrome 系浏览器 Client Hints）
- `Sec-Ch-Ua-Platform`

#### 响应示例

密码错误（未锁定）：

```json
{ "success": false, "error": "密码错误", "remainingAttempts": 4, "maxAttempts": 5 }
```

已锁定：

```json
{
  "success": false,
  "error": "登录失败：连续输入错误次数过多，请稍后重试",
  "lockedUntil": 1730000000000,
  "retryAfterSeconds": 3600,
  "maxAttempts": 5
}
```

> **注意**：IP 获取优先级为 `CF-Connecting-IP` → `X-Forwarded-For` → 请求指纹 → `__no_fingerprint__`。本地/非 Cloudflare 环境建议补齐 `X-Forwarded-For`，避免触发更严格的限流策略。

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
- `emptyReason?: "virgin" | "lost"`（云端数据为空时的原因）
  - `"virgin"`: 首次使用，从未同步过
  - `"lost"`: 数据丢失，曾经同步过但主数据和历史记录都不可用
- `fallback?: boolean`（是否从同步历史回退恢复）

#### 数据回退机制

当主数据缺失时，服务端会自动尝试从同步历史记录恢复：

```json
{
  "success": true,
  "role": "admin",
  "data": { "...": "..." },
  "message": "主数据缺失，已回退到最近同步记录",
  "fallback": true
}
```

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

数据过大响应（413，仅 KV 模式）：

```json
{ "success": false, "error": "数据过大，超过 Cloudflare KV 25MB 限制。建议绑定 R2（NAVHUB_R2 / NAVHUB_WORKER_R2）作为主同步存储。" }
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

仅管理员可操作。

请求体：

- `data: NavHubSyncData`

响应（200）：

```json
{ "success": true, "backupKey": "navhub:backup:2025-01-01T00-00-00-000Z", "message": "备份成功: navhub:backup:2025-01-01T00-00-00-000Z" }
```

错误响应：

- `400`：无效 JSON / 无效 data 字段
- `401/429`：未授权 / 已锁定
- `413`：数据超过 KV 25MB 限制（备份目前仅存 KV，即使启用 R2 也受此限制）

> **注意**：备份保留期为 **30 天**（KV TTL），过期自动删除。

示例：

```bash
curl -s -X POST "https://<your-domain>/api/sync?action=backup" \
  -H "X-Sync-Password: <password>" \
  -H "Content-Type: application/json" \
  -d "{\"data\": {\"links\": [], \"categories\": [], \"meta\": {\"updatedAt\": 0, \"deviceId\": \"dev-1\", \"version\": 1}}}"
```

---

### `GET /api/sync?action=backup&backupKey=...` 获取备份数据

仅管理员可操作。

查询参数：

- `backupKey`：备份 key（需 URL 编码）

响应（200）：

```json
{ "success": true, "data": { "...NavHubSyncData..." } }
```

错误响应：

- `400`：无效备份 key
- `401/429`：未授权 / 已锁定
- `404`：备份不存在或已过期

示例：

```bash
curl -s -H "X-Sync-Password: <password>" \
  "https://<your-domain>/api/sync?action=backup&backupKey=navhub%3Abackup%3A2025-01-01T00-00-00-000Z"
```

---

### `GET /api/sync?action=backups` 获取同步历史列表

仅管理员可操作。

> 注意：此接口仅返回**同步历史记录**（`navhub:backup:history-*`），不包含手动创建的快照备份（`navhub:backup:TIMESTAMP`）。

响应（200）：

```json
{
  "success": true,
  "backups": [
    {
      "key": "navhub:backup:history-1704067200000",
      "timestamp": "2025-01-01 00:00:00",
      "kind": "manual",
      "deviceId": "dev-1",
      "updatedAt": 1704067200000,
      "version": 5,
      "browser": "Chrome",
      "os": "Windows",
      "isCurrent": true
    }
  ]
}
```

字段说明：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `key` | string | 备份 key |
| `timestamp` | string | 格式化的时间戳显示值 |
| `kind` | `"auto"` \| `"manual"` | 同步类型 |
| `deviceId` | string? | 设备 ID |
| `updatedAt` | number? | 更新时间戳（毫秒） |
| `version` | number? | 数据版本号 |
| `browser` | string? | 浏览器信息 |
| `os` | string? | 操作系统信息 |
| `isCurrent` | boolean | 是否为当前版本 |

> 列表按 `updatedAt` 降序排列（最新在前）。

示例：

```bash
curl -s -H "X-Sync-Password: <password>" \
  "https://<your-domain>/api/sync?action=backups"
```

---

### `POST /api/sync?action=restore` 从备份恢复（并创建回滚点）

仅管理员可操作。

请求体：

- `backupKey`：要恢复的备份 key
- `deviceId?`：用于写回 `meta.deviceId`（便于标记"由哪个设备触发恢复"）

关键行为：

- 版本号会在"当前主数据版本"基础上 +1
- 恢复前会自动创建回滚点（key 格式：`navhub:backup:rollback-TIMESTAMP`）
- 恢复操作会写入同步历史记录（`syncKind: 'manual'`）

响应（200）：

```json
{
  "success": true,
  "data": { "...恢复后的 NavHubSyncData..." },
  "rollbackKey": "navhub:backup:rollback-2025-01-01T00-00-00-000Z"
}
```

> `rollbackKey` 在回滚点创建失败（如数据过大）时可能为 `null`。

错误响应：

- `400`：无效 JSON / 无效备份 key
- `401/429`：未授权 / 已锁定
- `404`：备份不存在或已过期
- `413`：恢复后数据超过 KV 25MB 限制

示例：

```bash
curl -s -X POST "https://<your-domain>/api/sync?action=restore" \
  -H "X-Sync-Password: <password>" \
  -H "Content-Type: application/json" \
  -d "{\"backupKey\": \"navhub:backup:2025-01-01T00-00-00-000Z\", \"deviceId\": \"dev-restore\"}"
```

---

### `DELETE /api/sync?action=backup` 删除备份

仅管理员可操作。

请求体：

```json
{ "backupKey": "navhub:backup:..." }
```

限制：

- 不允许删除"当前版本对应的同步历史记录"（返回 `400`）
- 非同步历史记录（手动备份）可以幂等删除

响应（200）：

```json
{ "success": true, "message": "备份已删除" }
```

错误响应：

- `400`：无效备份 key / 当前记录不允许删除
- `401/429`：未授权 / 已锁定

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
- 预检缓存：`Access-Control-Max-Age: 86400`（24 小时）

CORS 响应头示例：

```
Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, X-Sync-Password
Access-Control-Max-Age: 86400
Access-Control-Allow-Origin: https://your-domain.com
Vary: Origin
```

> **注意**：当 `Access-Control-Allow-Origin` 为具体域名时，会附加 `Vary: Origin`；当为 `*` 时不附加。CORS 来源不允许时返回 `403`。

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

### AI 代理错误响应详情

**400 请求错误**：

```json
{ "success": false, "error": "Invalid JSON body" }
{ "success": false, "error": "Missing apiKey" }
{ "success": false, "error": "Invalid baseUrl" }
{ "success": false, "error": "Invalid baseUrl protocol" }
{ "success": false, "error": "Missing payload" }
```

**403 禁止访问**：

```json
{ "success": false, "error": "CORS origin not allowed" }
{ "success": false, "error": "baseUrl host not allowed" }
```

**405 方法不允许**：

```json
{ "success": false, "error": "Method not allowed" }
```

**502 网关错误**：

```json
{ "success": false, "error": "Upstream redirected too many times" }
{ "success": false, "error": "Upstream redirect is invalid" }
{ "success": false, "error": "Upstream redirect not allowed" }
{ "success": false, "error": "Upstream request failed" }
```

### AI 代理 CORS 响应头

```
Access-Control-Allow-Methods: POST, OPTIONS
Access-Control-Allow-Headers: Content-Type
Access-Control-Max-Age: 86400
Access-Control-Allow-Origin: <origin> | *
Vary: Origin
```

---

## 附录：数据结构参考

### `NavHubSyncData`（主同步数据）

```typescript
interface NavHubSyncData {
  schemaVersion?: number;           // 数据结构版本号（用于结构演进）
  links: LinkItem[];                // 链接列表
  categories: Category[];           // 分类列表
  searchConfig?: SearchConfig;      // 搜索配置
  aiConfig?: AIConfig;              // AI 配置（apiKey 会被脱敏）
  siteSettings?: SiteSettings;      // 站点设置
  privateVault?: string;            // 加密的隐私分组数据
  privacyConfig?: PrivacyConfig;    // 隐私设置
  meta: SyncMetadata;               // 同步元数据
  themeMode?: 'light' | 'dark' | 'system';  // 主题模式
  encryptedSensitiveConfig?: string; // 加密的敏感配置
  customFaviconCache?: CustomFaviconCache; // 自定义图标缓存
}
```

### `SyncMetadata`（同步元数据）

```typescript
interface SyncMetadata {
  updatedAt: number;                // 最后更新时间戳（毫秒）
  deviceId: string;                 // 设备唯一标识
  version: number;                  // 数据版本号（递增，防止并发冲突）
  browser?: string;                 // 浏览器信息
  os?: string;                      // 操作系统信息
  syncKind?: 'auto' | 'manual';     // 同步来源（自动/手动）
}
```

### `SyncAuthState`（认证状态）

```typescript
interface SyncAuthState {
  protected: boolean;               // 是否启用密码保护
  role: 'admin' | 'user';           // 当前角色
  canWrite: boolean;                // 是否可写
}
```

### `SyncBackupItem`（备份列表项）

```typescript
interface SyncBackupItem {
  key: string;                      // 备份 key
  timestamp: string;                // 时间戳显示值
  kind: 'auto' | 'manual';          // 同步类型
  deviceId?: string;                // 设备 ID
  updatedAt?: number;               // 更新时间
  version?: number;                 // 版本号
  browser?: string;                 // 浏览器信息
  os?: string;                      // 操作系统信息
  isCurrent: boolean;               // 是否为当前版本
}
```

> 完整类型定义请参考 `src/types.ts`。

---

## 附录：JSON Schema 接口契约

### `/api/sync` POST 写入请求

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["data"],
  "properties": {
    "data": {
      "type": "object",
      "description": "完整的 NavHubSyncData 对象",
      "required": ["links", "categories", "meta"],
      "properties": {
        "schemaVersion": { "type": "number" },
        "links": { "type": "array" },
        "categories": { "type": "array" },
        "searchConfig": { "type": "object" },
        "aiConfig": { "type": "object" },
        "siteSettings": { "type": "object" },
        "privateVault": { "type": "string" },
        "privacyConfig": { "type": "object" },
        "meta": {
          "type": "object",
          "required": ["updatedAt", "deviceId", "version"],
          "properties": {
            "updatedAt": { "type": "number" },
            "deviceId": { "type": "string" },
            "version": { "type": "number" },
            "browser": { "type": "string" },
            "os": { "type": "string" },
            "syncKind": { "enum": ["auto", "manual"] }
          }
        },
        "themeMode": { "enum": ["light", "dark", "system"] },
        "encryptedSensitiveConfig": { "type": "string" },
        "customFaviconCache": { "type": "object" }
      }
    },
    "expectedVersion": {
      "type": "number",
      "description": "乐观锁版本号（客户端期望的当前云端 version）"
    },
    "syncKind": {
      "enum": ["auto", "manual"],
      "description": "同步类型"
    },
    "skipHistory": {
      "type": "boolean",
      "description": "是否跳过写入同步历史记录"
    }
  }
}
```

### `/api/ai` POST 请求

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["apiKey"],
  "properties": {
    "baseUrl": {
      "type": "string",
      "description": "上游 API 基础 URL（默认 https://api.openai.com/v1）"
    },
    "apiKey": {
      "type": "string",
      "description": "API 密钥（必填）"
    },
    "payload": {
      "type": "object",
      "description": "仅 action=chat 时需要，透传给上游的请求体"
    }
  }
}
```

### 通用错误响应

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["success", "error"],
  "properties": {
    "success": { "const": false },
    "error": { "type": "string" },
    "conflict": { "type": "boolean" },
    "data": { "type": ["object", "null"] },
    "remainingAttempts": { "type": "number" },
    "maxAttempts": { "type": "number" },
    "lockedUntil": { "type": "number" },
    "retryAfterSeconds": { "type": "number" }
  }
}
```

---

## 附录：KV Key 命名规范

| Key 格式 | 说明 | TTL |
| --- | --- | --- |
| `navhub:data` | 主同步数据 | 无 |
| `navhub:backup:TIMESTAMP` | 手动快照备份 | 30 天 |
| `navhub:backup:history-TIMESTAMP` | 同步历史记录 | 30 天 |
| `navhub:backup:rollback-TIMESTAMP` | 恢复回滚点 | 30 天 |
| `navhub:sync_history_index` | 同步历史索引 | 无 |
| `navhub:auth_attempt:sha256:HASH` | 认证失败计数 | 1 小时 |

---

## 附录：私有网络阻止列表

`/api/ai` 代理会阻止以下私有网络地址作为上游：

**IPv4**：
- `0.0.0.0/8` - 本地网络
- `10.0.0.0/8` - 私有网络
- `127.0.0.0/8` - 回环地址
- `169.254.0.0/16` - 链路本地
- `172.16.0.0/12` - 私有网络
- `192.168.0.0/16` - 私有网络
- `100.64.0.0/10` - CGNAT
- `198.18.0.0/15` - 基准测试
- `224.0.0.0/4` - 组播
- `240.0.0.0/4` - 保留

**IPv6**：
- `::` - 未指定地址
- `::1` - 回环地址
- `fc00::/7` - 唯一本地地址
- `fe80::/10` - 链路本地
- `fec0::/10` - 站点本地（已弃用）
- `ff00::/8` - 组播
- IPv4 映射/兼容地址（如 `::ffff:192.168.0.1`）

**特殊主机名**：
- `localhost`
- `*.localhost`
