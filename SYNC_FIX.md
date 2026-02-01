# 同步问题修复指南

## 问题说明

新设备访问时显示原项目数据（种子数据），而不是云端同步的数据。

## 根本原因

代码逻辑是正确的，问题可能是：
1. 浏览器缓存了旧版本的 JS 文件
2. Service Worker 缓存
3. 本地 localStorage 有旧数据干扰

## 解决方案

### 方案 1：使用诊断工具（最简单）

1. 访问 `https://你的域名/debug-sync.html`
2. 查看"检查云端数据"部分，确认 KV 中有数据
3. 如果有数据但新设备看不到，点击"清除本地数据"
4. 刷新主页面

### 方案 2：手动清除缓存

在新设备的浏览器中：

1. 打开开发者工具（F12）
2. 进入 Console 标签
3. 运行以下代码：

```javascript
// 清除所有本地数据
localStorage.clear();
// 刷新页面
location.reload();
```

### 方案 3：强制刷新

在新设备上：
- Windows/Linux: `Ctrl + Shift + R`
- Mac: `Cmd + Shift + R`

### 方案 4：修改代码让冲突时默认使用云端（推荐）

已创建配置文件 `src/config/sync.ts`，将 `SYNC_CONFLICT_STRATEGY` 设置为 `'use-cloud'`。

然后在 `src/app/useAppController/kvSync/useKvSyncStrategy.ts` 文件中，找到这段代码（约第 225 行）：

```typescript
// 版本不一致时提示用户选择（仅当本地已有同步记录时）
if (cloudData.meta.version !== localVersion) {
```

在这个 `if` 块的开头添加以下代码：

```typescript
// 版本不一致时的处理策略
if (cloudData.meta.version !== localVersion) {
  // 根据配置决定冲突处理策略
  if (SYNC_CONFLICT_STRATEGY === 'use-cloud') {
    // 自动使用云端数据
    applyCloudData(cloudData, auth.role);
    const { meta: _meta, ...cloudPayload } = cloudData;
    prevBusinessSignatureRef.current = buildSyncBusinessSignature(cloudPayload);
    prevFullSignatureRef.current = buildSyncFullSignature(cloudPayload);
    return;
  }

  // 默认策略：弹出冲突对话框让用户选择
  // ... 原有的冲突处理代码 ...
```

记得在文件顶部导入配置：

```typescript
import { SYNC_CONFLICT_STRATEGY } from '../../../config/sync';
```

## 验证修复

1. 部署更新后的代码
2. 在新设备上访问网站
3. 打开开发者工具 Console
4. 应该看到自动从云端加载数据的日志
5. 检查页面是否显示云端的链接和分类

## 常见问题

### Q: Git push 会清除 KV 数据吗？
A: **不会！** KV 是独立的存储服务，与代码部署完全分离。

### Q: 为什么有同步密码？
A: 同步密码用于区分管理员和用户：
- 无密码：所有人都是管理员（可读写）
- 有密码：
  - 用户模式（无密码/错误密码）：可以读取公开数据
  - 管理员模式（正确密码）：可以读写所有数据，包括隐私数据

### Q: 用户模式能看到哪些数据？
A: 用户模式可以看到：
- links（链接）
- categories（分类）
- siteSettings（站点设置）
- searchConfig（搜索配置）
- themeMode（主题模式）

用户模式看不到：
- privateVault（隐私分组）
- encryptedSensitiveConfig（加密的敏感配置）
- privacyConfig（隐私配置）
- aiConfig.apiKey（AI API 密钥）

### Q: 新设备会自动同步吗？
A: **会！** 代码已经实现了自动同步：
- 新设备（localVersion === 0）会自动拉取并应用云端数据
- 用户模式下，直接应用云端数据（不弹冲突）
- 管理员模式下，如果版本不一致，会弹出冲突对话框（或根据配置自动使用云端）

## 调试命令

在浏览器 Console 中运行以下命令进行调试：

```javascript
// 查看本地数据
console.log('本地链接:', JSON.parse(localStorage.getItem('ynav_links') || '[]'));
console.log('本地分类:', JSON.parse(localStorage.getItem('ynav_categories') || '[]'));
console.log('同步元数据:', JSON.parse(localStorage.getItem('ynav_sync_meta') || 'null'));

// 手动拉取云端数据
fetch('/api/sync?t=' + Date.now())
  .then(r => r.json())
  .then(data => {
    console.log('云端数据:', data);
    if (data.success && data.data) {
      console.log('云端链接数:', data.data.links?.length || 0);
      console.log('云端分类数:', data.data.categories?.length || 0);
      console.log('云端版本:', data.data.meta?.version || 0);
    }
  });

// 检查权限
fetch('/api/sync?action=auth&t=' + Date.now())
  .then(r => r.json())
  .then(data => console.log('权限状态:', data));
```

## 联系支持

如果以上方法都无法解决问题，请提供以下信息：
1. 诊断工具的截图（`debug-sync.html`）
2. 浏览器 Console 的错误信息
3. Network 标签中 `/api/sync` 请求的响应内容
