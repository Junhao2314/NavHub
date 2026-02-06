# NavHub 安全设计

本文档详细说明 NavHub 的安全机制，包括加密方案、认证授权、防爆破保护等。

---

## 目录

1. [安全架构概览](#安全架构概览)
2. [数据加密](#数据加密)
3. [认证与授权](#认证与授权)
4. [防爆破保护](#防爆破保护)
5. [数据脱敏](#数据脱敏)
6. [API 安全](#api-安全)
7. [最佳实践](#最佳实践)

---

## 安全架构概览

```
┌─────────────────────────────────────────────────────────────────────┐
│                        安全层级架构                                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   ┌──────────────────────────────────────────────────────────────┐  │
│   │                    传输层安全 (TLS)                           │  │
│   │  • Cloudflare 自动 HTTPS                                     │  │
│   │  • HTTP 自动升级到 HTTPS                                     │  │
│   └──────────────────────────────────────────────────────────────┘  │
│                               │                                      │
│   ┌──────────────────────────────────────────────────────────────┐  │
│   │                    认证层                                     │  │
│   │  • 同步密码 (X-Sync-Password)                                │  │
│   │  • 管理员/用户角色分离                                       │  │
│   │  • 防爆破保护 (三级限流)                                     │  │
│   └──────────────────────────────────────────────────────────────┘  │
│                               │                                      │
│   ┌──────────────────────────────────────────────────────────────┐  │
│   │                    数据层安全                                 │  │
│   │  • 敏感配置加密 (AES-256-GCM)                                │  │
│   │  • 隐私分组加密 (AES-256-GCM)                                │  │
│   │  • 数据脱敏 (API Key 等)                                     │  │
│   └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 数据加密

### 加密算法

NavHub 使用 **Web Crypto API** 实现端到端加密：

| 组件 | 算法 | 参数 |
|------|------|------|
| 密钥派生 | PBKDF2 | 100,000 次迭代, SHA-256 |
| 对称加密 | AES-GCM | 256 位密钥 |
| 盐值 (Salt) | 随机生成 | 16 字节 |
| 初始向量 (IV) | 随机生成 | 12 字节 |

### 加密数据格式

```
v1.<salt_base64>.<iv_base64>.<encrypted_data_base64>
```

- `v1`: 版本标识（用于未来升级）
- `salt_base64`: Base64 编码的盐值
- `iv_base64`: Base64 编码的初始向量
- `encrypted_data_base64`: Base64 编码的加密数据

### 隐私分组加密

**位置**: `src/utils/privateVault.ts`

隐私分组用于存储敏感链接，支持独立密码保护：

```typescript
// 加密
const encryptedVault = await encryptPrivateVault(password, { links: [...] });

// 解密
const payload = await decryptPrivateVault(password, encryptedVault);
```

**加密流程**:

```
用户密码
    │
    ▼
┌─────────────────┐
│ PBKDF2 密钥派生 │ ← 随机盐值 (16 bytes)
│ 100,000 次迭代  │
└────────┬────────┘
         │
         ▼
    AES-256 密钥
         │
         ▼
┌─────────────────┐
│ AES-GCM 加密    │ ← 随机 IV (12 bytes)
└────────┬────────┘
         │
         ▼
   加密数据 (Base64)
```

### 敏感配置加密

**位置**: `src/utils/sensitiveConfig.ts`

用于加密 AI API Key 等敏感配置，与隐私分组使用相同的加密机制：

```typescript
// 加密 API Key
const encryptedConfig = await encryptSensitiveConfig(password, { apiKey: 'sk-...' });

// 解密（支持多密码候选）
const payload = await decryptSensitiveConfigWithFallback(
  [syncPassword, privateVaultPassword, privacyPassword],
  encryptedConfig
);
```

### 密码候选机制

解密敏感配置时支持多密码尝试：

1. 同步密码
2. 隐私分组密码
3. 隐私保护密码

系统会按顺序尝试每个密码，直到解密成功。

---

## 认证与授权

### 角色模型

| 角色 | 权限 | 数据访问 |
|------|------|----------|
| **管理员** | 完整读写 | 所有数据 |
| **用户** | 只读 | 公开数据（脱敏后） |

### 认证方式

**服务端密码认证**:

```
请求头: X-Sync-Password: <password>
```

**认证状态判断**:

| 条件 | 角色 |
|------|------|
| 未配置 `SYNC_PASSWORD` | 所有请求视为管理员 |
| 配置了 `SYNC_PASSWORD` + 密码正确 | 管理员 |
| 配置了 `SYNC_PASSWORD` + 密码错误/未提供 | 用户 |

### 认证接口

```bash
# 查询当前认证状态
GET /api/sync?action=auth

# 响应示例
{
  "success": true,
  "protected": true,
  "role": "user",
  "canWrite": false
}
```

```bash
# 管理员登录
POST /api/sync?action=login
Header: X-Sync-Password: <password>

# 成功响应
{
  "success": true,
  "protected": true,
  "role": "admin",
  "canWrite": true
}
```

---

## 防爆破保护

### 三级限流策略

**位置**: `shared/syncApi/auth.ts`

根据客户端标识的可信度，采用不同的限流阈值：

| IP 来源 | 最大失败次数 | 说明 |
|---------|--------------|------|
| `CF-Connecting-IP` | **5 次** | Cloudflare 提供的真实 IP，可信度最高 |
| `X-Forwarded-For` + 指纹 | **3 次** | 代理 IP（可被伪造），结合请求特征 |
| 无 IP + 有指纹 | **3 次** | 无 IP 但有请求特征 |
| 完全无指纹 | **2 次** | 无任何可识别特征，最严格 |

### 锁定机制

- **锁定时长**: 1 小时
- **存储**: Cloudflare KV (带 TTL 自动过期)
- **客户端标识**: SHA-256 哈希存储

### 请求指纹收集

当无法获取 IP 时，收集以下请求头作为指纹：

- `User-Agent`
- `Accept-Language`
- `Accept-Encoding`
- `Sec-Ch-Ua` (Chrome Client Hints)
- `Sec-Ch-Ua-Platform`

### 响应格式

**密码错误（未锁定）**:

```json
{
  "success": false,
  "error": "密码错误",
  "remainingAttempts": 4,
  "maxAttempts": 5
}
```

**已锁定**:

```json
{
  "success": false,
  "error": "登录失败：连续输入错误次数过多，请稍后重试",
  "lockedUntil": 1730000000000,
  "retryAfterSeconds": 3600,
  "maxAttempts": 5
}
```

### 内存缓存优化

为避免每次成功请求都执行 `KV.delete`：

- 维护内存缓存记录最近的失败尝试
- 仅在登录/认证检查接口强制清理
- 其他接口仅在检测到近期失败记录时清理

---

## 数据脱敏

### 脱敏规则

| 数据类型 | 管理员 | 用户 |
|----------|--------|------|
| 链接/分类 | 完整 | 仅公开分类 |
| AI API Key | **清空** | **清空** |
| 隐私分组 | 完整（加密） | **移除** |
| 加密敏感配置 | 完整 | **移除** |
| 隐私设置 | 完整 | **移除** |
| 站点设置 | 完整 | 完整 |
| 主题模式 | 完整 | 完整 |

### 脱敏实现

**位置**: `shared/syncApi/sanitize.ts`

```typescript
// 公开数据清洗（用户模式）
function sanitizePublicData(data: NavHubSyncData): NavHubSyncData {
  return {
    ...data,
    // 移除敏感字段
    privateVault: undefined,
    encryptedSensitiveConfig: undefined,
    privacyConfig: undefined,
    // 过滤隐藏分类
    categories: data.categories.filter(c => !c.hidden),
    // 过滤隐私链接
    links: data.links.filter(l => !isPrivateLink(l)),
    // API Key 始终清空
    aiConfig: data.aiConfig ? { ...data.aiConfig, apiKey: '' } : undefined,
  };
}
```

---

## API 安全

### CORS 配置

**Workers 部署**:

```toml
# wrangler.toml
[vars]
SYNC_CORS_ALLOWED_ORIGINS = "https://your-domain.com"
```

- 默认仅允许同源请求
- 可配置允许的 Origin 列表
- 设为 `*` 允许任意 Origin（不推荐）

### AI 代理安全

**位置**: `shared/aiProxy.ts`

为防止 SSRF / Open Proxy 攻击：

| 安全措施 | 说明 |
|----------|------|
| 上游白名单 | `AI_PROXY_ALLOWED_HOSTS`（逗号分隔） |
| 默认仅允许 | `api.openai.com` |
| 支持通配符 | `*.example.com`（仅子域名） |
| 仅 HTTPS | 默认禁止 HTTP 上游 |
| 禁止私网 | 禁止 localhost、127.0.0.1、10.x.x.x 等 |
| 重定向限制 | 最多跟随 3 次，目标仍需满足白名单 |

### 数据验证

所有接收的数据都经过验证：

```typescript
// 数据标准化
const normalized = normalizeNavHubSyncData(rawData);

// URL 验证
const validUrl = normalizeHttpUrl(url); // 仅 http/https

// 无效数据过滤
const { links, dropped } = sanitizeLinks(rawLinks);
```

---

## 最佳实践

### 密码安全

1. **使用强密码**: 至少 12 位，包含大小写字母、数字、特殊字符
2. **定期更换**: 建议每 90 天更换一次同步密码
3. **避免复用**: 不要在多个服务使用相同密码

### 部署安全

1. **启用 R2**: 主数据存储在 R2，避免 KV 一致性问题
2. **配置 CORS**: 限制允许的跨域来源
3. **限制 AI 代理**: 仅允许必要的上游主机
4. **使用 Secrets**: 敏感变量通过 Dashboard 设置，避免写入代码

### 客户端安全

1. **HTTPS**: 始终使用 HTTPS 访问
2. **隐私分组**: 敏感链接放入隐私分组
3. **独立密码**: 为隐私分组设置独立密码
4. **会话管理**: 公共设备使用后清除登录状态

### 监控与审计

1. **查看同步历史**: 设置 → 数据 → 同步历史
2. **检查设备信息**: 每条同步记录包含设备和浏览器信息
3. **异常检测**: 注意陌生设备的同步记录

---

## 安全事件响应

### 密码泄露

1. 立即在服务端更改 `SYNC_PASSWORD`
2. 在客户端更新同步密码
3. 检查同步历史，确认是否有异常操作
4. 如有必要，从备份恢复数据

### 数据异常

1. 停止自动同步（断开网络或退出管理员模式）
2. 查看同步历史，定位异常时间点
3. 使用"恢复备份"功能回滚到正常版本
4. 调查异常原因

---

## 相关文档

- [API 接口文档](./API.md) - 接口认证细节
- [同步策略](./sync-strategy.md) - 同步机制详解
- [架构设计](./ARCHITECTURE.md) - 整体架构
