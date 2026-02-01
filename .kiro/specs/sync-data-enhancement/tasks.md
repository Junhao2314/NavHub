# Implementation Plan: Sync Data Enhancement

## Overview

本实现计划将同步系统增强功能分解为可执行的编码任务。实现顺序遵循依赖关系：先扩展类型定义，再实现工具模块，最后集成到同步引擎。

项目使用 TypeScript + React，测试框架使用 Vitest + fast-check。

## Tasks

- [x] 1. 扩展类型定义和数据结构
  - [x] 1.1 在 `src/types.ts` 中扩展 `YNavSyncData` 接口
    - 添加 `themeMode?: ThemeMode` 字段
    - 添加 `encryptedSensitiveConfig?: string` 字段
    - 添加 `customFaviconCache?: CustomFaviconCache` 字段
    - _Requirements: 4.1_
  - [x] 1.2 在 `src/types.ts` 中添加新类型定义
    - 添加 `SensitiveConfigPayload` 接口
    - 添加 `CustomFaviconCache` 接口
    - 添加 `FaviconCacheEntry` 接口
    - _Requirements: 4.1_

- [ ] 2. 实现敏感配置加密模块
  - [x] 2.1 创建 `src/utils/sensitiveConfig.ts`
    - 实现 `encryptSensitiveConfig(password, payload)` 函数
    - 实现 `decryptSensitiveConfig(password, cipherText)` 函数
    - 复用 `privateVault.ts` 中的加密逻辑（PBKDF2 + AES-GCM）
    - _Requirements: 2.1, 2.2, 5.1_
  - [ ]* 2.2 编写敏感配置加密的属性测试
    - **Property 4: Sensitive Config Encryption Round-Trip**
    - **Validates: Requirements 2.1, 2.2, 2.3, 5.1**
  - [ ]* 2.3 编写密码错误处理的属性测试
    - **Property 5: Wrong Password Returns Empty ApiKey**
    - **Validates: Requirements 2.4**

- [ ] 3. 实现 Favicon 缓存管理模块
  - [x] 3.1 创建 `src/utils/faviconCache.ts`
    - 实现 `getLocalCache()` 函数
    - 实现 `getCustomIcons()` 函数
    - 实现 `setIcon(hostname, iconUrl, isCustom)` 函数
    - 实现 `mergeFromCloud(cloudCache)` 函数
    - 实现 `buildSyncCache()` 函数
    - 添加 `FAVICON_CUSTOM_KEY` 常量到 `constants.ts`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_
  - [ ]* 3.2 编写 Favicon 缓存的属性测试
    - **Property 7: Only Custom Favicons Are Synced**
    - **Property 8: Custom Icon Marking**
    - **Property 9: Favicon Cache Merge Prefers Custom**
    - **Property 10: Favicon Merge Preserves Local Auto-Fetched**
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**

- [x] 4. Checkpoint - 确保工具模块测试通过
  - 运行 `npm test` 确保所有测试通过
  - 如有问题请询问用户

- [ ] 5. 扩展主题 Hook 支持同步
  - [x] 5.1 修改 `src/hooks/useTheme.ts`
    - 添加 `applyFromSync(syncedThemeMode)` 函数
    - 确保 `themeMode` 可被外部设置
    - _Requirements: 1.2_
  - [ ]* 5.2 编写主题同步的属性测试
    - **Property 2: Theme Mode Application from Sync**
    - **Property 3: System Theme Mode Respects Device Preference**
    - **Validates: Requirements 1.2, 1.3**

- [ ] 6. 扩展同步引擎
  - [x] 6.1 修改 `src/hooks/useSyncEngine.ts` 中的 `buildSyncData` 函数
    - 添加 `themeMode` 参数
    - 添加 `encryptedSensitiveConfig` 参数
    - 添加 `customFaviconCache` 参数
    - _Requirements: 1.1, 1.4, 2.6, 3.1_
  - [ ]* 6.2 编写同步数据构建的属性测试
    - **Property 1: Theme Mode Sync Data Inclusion**
    - **Validates: Requirements 1.1, 1.4**
  - [ ]* 6.3 编写同步数据解析的属性测试
    - **Property 11: Sync Data Parsing Robustness**
    - **Validates: Requirements 4.2, 4.3, 4.4**

- [ ] 7. 修改 Worker API 响应处理
  - [x] 7.1 修改 `worker/index.ts` 中的 `sanitizePublicData` 函数
    - 确保 `aiConfig.apiKey` 始终为空
    - 保留 `encryptedSensitiveConfig` 字段（已加密，安全）
    - _Requirements: 2.5_
  - [ ]* 7.2 编写 API 响应脱敏的属性测试
    - **Property 6: Non-Admin Response Sanitization**
    - **Validates: Requirements 2.5**

- [x] 8. Checkpoint - 确保扩展模块测试通过
  - 运行 `npm test` 确保所有测试通过
  - 如有问题请询问用户

- [ ] 9. 集成到主应用
  - [x] 9.1 修改 `src/App.tsx` 中的 `applyCloudData` 函数
    - 处理 `themeMode` 字段，调用 `applyFromSync`
    - 处理 `encryptedSensitiveConfig` 字段，解密并应用 apiKey
    - 处理 `customFaviconCache` 字段，调用 `mergeFromCloud`
    - _Requirements: 1.2, 2.3, 3.3_
  - [x] 9.2 修改 `src/App.tsx` 中的同步数据构建逻辑
    - 在调用 `buildSyncData` 时传入 `themeMode`
    - 在调用 `buildSyncData` 时传入加密后的 `encryptedSensitiveConfig`
    - 在调用 `buildSyncData` 时传入 `customFaviconCache`
    - _Requirements: 1.1, 1.4, 2.1, 2.6, 3.1_

- [ ] 10. 修改 LinkModal 组件标记自定义图标
  - [x] 10.1 修改 `src/components/modals/LinkModal.tsx`
    - 使用 `faviconCache.setIcon()` 替代直接操作 localStorage
    - 用户手动设置图标时标记 `isCustom: true`
    - 自动获取图标时标记 `isCustom: false`
    - _Requirements: 3.2_

- [ ] 11. 实现密码变更时的重新加密
  - [x] 11.1 修改隐私设置相关组件
    - 当用户更改隐私密码时，重新加密 `privateVault` 和 `sensitiveConfig`
    - 确保两者使用相同密码（或支持独立密码）
    - _Requirements: 5.2, 5.3, 5.4_
  - [ ]* 11.2 编写密码变更的属性测试
    - **Property 12: Password Change Re-encrypts Both Vaults**
    - **Property 13: Unified Unlock Decrypts Both**
    - **Property 14: Separate Passwords Work Independently**
    - **Validates: Requirements 5.2, 5.3, 5.4**

- [x] 12. Final Checkpoint - 完整功能测试
  - 运行 `npm test` 确保所有测试通过
  - 如有问题请询问用户

## Notes

- 标记 `*` 的任务为可选测试任务，可跳过以加快 MVP 开发
- 每个任务都引用了具体的需求条款以确保可追溯性
- 属性测试验证通用正确性属性，单元测试验证具体边界情况
- Checkpoint 任务确保增量验证，及早发现问题
