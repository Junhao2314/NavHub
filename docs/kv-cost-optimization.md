# Cloudflare KV 指标与优化说明（NavHub）

本文档聚焦 **Cloudflare Workers/Pages 部署时的 KV 指标**，并说明 NavHub 如何尽量减少：

- Read operations
- Write operations
- Delete operations
- List operations
- Storage (current)

> 代码实现与配置可参考：`shared/syncApi/*`、`worker/index.ts`、`wrangler.toml`。

---

## 1. KV 指标是什么

- **Read operations**：`KV.get(...)`
- **Write operations**：`KV.put(...)`
- **Delete operations**：`KV.delete(...)`
- **List operations**：`KV.list(...)`（通常按分页 cursor 多次调用）
- **Storage (current)**：KV 内当前存储的数据量（与 key 数量、value 大小、TTL 是否自动清理有关）

---

## 2. 本项目使用 KV 的位置（Key 约定）

### 2.1 主同步数据（可能在 KV 或 R2）

- KV key：`navhub:data`
- R2 object key：`navhub/data.json`（启用 R2 时）

> **建议启用 R2**：主数据会优先写入/读取 R2（避免 KV 25MB 限制 + 最终一致性带来的延迟问题）。

### 2.2 备份/同步历史（KV + TTL）

- 备份前缀：`navhub:backup:`
- 同步历史前缀：`navhub:backup:history-`
- 同步历史索引：`navhub:sync_history_index`

同步历史与快照会设置 TTL（默认 30 天）以便自动过期，降低 **Storage (current)**，也避免"删除失败导致残留"。

### 2.3 管理员密码防爆破（KV + TTL）

当配置了 `SYNC_PASSWORD` 且密码错误时，会按客户端 IP 写入失败次数/锁定信息：

- Key 前缀：`navhub:auth_attempt:sha256:<hash>`（IP 经 SHA256 哈希）
- TTL：默认 1 小时（锁定窗口）

---

## 3. 哪些请求会触发 KV 操作（按接口）

> 下表仅描述"典型情况"。如果你启用了 R2，则主数据读写基本不走 KV（大幅降低 Read/Write）。

| 接口 | 可能触发的 KV 操作 | 说明 |
| --- | --- | --- |
| `GET /api/sync` | `get` | 读取主同步数据；若 R2 未启用则走 KV。 |
| `GET /api/sync?action=auth` | `get/put/delete`（少量） | 当提供 `X-Sync-Password` 时会触发鉴权与失败次数逻辑；成功时会清理失败记录。 |
| `POST /api/sync?action=login` | `get/put/delete`（少量） | 同上；这是"强制清理失败记录"的入口之一。 |
| `POST /api/sync` | `get/put/delete` | 写入主数据；可选写入同步历史并维护索引；历史超过上限会裁剪删除旧 key。 |
| `POST /api/sync?action=backup` | `put` | 创建快照备份（带 TTL）。 |
| `GET /api/sync?action=backup&backupKey=...` | `get` | 导出指定备份内容。 |
| `GET /api/sync?action=backups` | `get`（常见）/ `list`（少见） | 优先读历史索引；仅当索引缺失/损坏/不完整时才会触发 `KV.list` 兜底重建。 |
| `POST /api/sync?action=restore` | `get/put` | 读取备份、写入回滚点（可选），再写入主数据，并写入一条同步历史（可选）。 |
| `DELETE /api/sync?action=backup` | `get/delete` | 删除指定备份；若是同步历史项，会同步更新索引。 |

---

## 4. 本仓库已做的"降 KV 指标"优化

### 4.1 Workers 静态资源不再占用 KV 指标（最重要）

历史上如果使用 **Workers Sites**，静态资源会进入 `__STATIC_CONTENT` KV：<br>
这会导致**每次加载 JS/CSS/图片都产生 KV Read**，而且部署时会有大量 KV Write/Storage。

当前配置改为 **Workers Assets**：

- 配置：`wrangler.toml` 使用 `[assets]`（绑定 `ASSETS`）
- 代码：`worker/index.ts` 通过 `env.ASSETS.fetch()` 托管静态资源，并支持 SPA 回退

这会显著降低 KV 的 Read/Write/Storage（因为静态资源不再走 KV）。

### 4.2 避免不必要的 `KV.list`

备份列表优先读 `navhub:sync_history_index`；当索引已经存在且完整时直接返回，不再因为"列表为空"而每次触发 `KV.list`。

### 4.3 同步历史默认带 TTL（降低 Storage）

同步历史（`navhub:backup:history-*`）写入时增加 TTL（默认 30 天），避免历史数据无限增长。

### 4.4 避免"每次成功鉴权都 KV.delete"

管理员密码正确时，不再对每个请求都执行 `KV.delete` 清理失败次数记录；只在：

- `POST /api/sync?action=login`（登录成功）
- `GET /api/sync?action=auth`（鉴权检查成功）

这两个入口 **强制清理**，其余接口只在检测到近期确实发生过失败记录时才清理，从而降低 Delete operations。

---

## 5. 进一步降低 KV 指标的推荐配置（强烈建议）

### 5.1 启用 R2 承载主同步数据（优先级最高）

启用后：

- 主数据读写走 R2（更强一致性 + 支持 ETag 条件写）
- KV 主要只承担"备份/历史/鉴权计数"等小对象

`wrangler.toml` 示例（Workers）：

```toml
[[r2_buckets]]
binding = "NAVHUB_WORKER_R2"
bucket_name = "navhub-sync"
```

### 5.2 高并发/高频场景：尽量少写同步历史

同步 API 支持 `skipHistory`：

- `auto` 同步**默认不写入**同步记录（除非显式 `skipHistory=false`）
- `manual` 同步**默认写入**同步记录（除非显式 `skipHistory=true`）
- 高并发/高频（例如"统计同步"）使用默认的 `auto` 即可自动跳过历史

### 5.3 理解"删除 vs 存储"的权衡

当前实现会把同步历史保持在最多 20 条（`MAX_SYNC_HISTORY=20`），并对超出的旧 key 做删除裁剪：

- 优点：更快降低 **Storage (current)**、避免历史堆积
- 代价：会产生一定 **Delete operations**

如果你更在意 Delete operations（而不是存储），可以考虑改成"只维护 index + 只依赖 TTL 自动过期"。目前仓库未提供开关，如需要可以加一个可配置选项。
