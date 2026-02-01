# 实现计划: 国际化 (Internationalization)

## 概述

本计划将 NavHub 项目从硬编码中文重构为支持多语言的国际化架构。采用 react-i18next 库，结合 Zustand 状态管理，实现中文和英文的双语支持。

## 任务

- [x] 1. 安装依赖和基础配置
  - [x] 1.1 安装 i18next 相关依赖
    - 安装 i18next、react-i18next、i18next-browser-languagedetector
    - _Requirements: 2.1_
  - [x] 1.2 创建 i18n 配置文件
    - 创建 `src/config/i18n.ts`，配置 i18next 实例
    - 配置语言检测、回退语言、插值设置
    - _Requirements: 2.2, 3.4_
  - [x] 1.3 在应用入口初始化 i18n
    - 在 `src/main.tsx` 中导入并初始化 i18n
    - _Requirements: 2.2_

- [x] 2. 创建翻译资源文件
  - [x] 2.1 创建中文翻译文件
    - 创建 `src/locales/zh-CN.json`
    - 按命名空间组织：common、header、sidebar、settings、modals、errors
    - _Requirements: 1.1, 1.2, 1.3, 6.1, 6.2_
  - [x] 2.2 创建英文翻译文件
    - 创建 `src/locales/en-US.json`
    - 确保与中文文件键结构一致
    - _Requirements: 1.1, 1.2, 6.5_
  - [x] 2.3 编写翻译文件键一致性属性测试
    - **Property 7: 翻译文件键一致性**
    - **Validates: Requirements 6.5**

- [x] 3. 状态管理集成
  - [x] 3.1 扩展 Zustand store 添加语言状态
    - 在 `src/stores/useAppStore.ts` 中添加 currentLanguage 状态
    - 添加 setLanguage action
    - 添加 initLanguage 初始化函数
    - _Requirements: 5.1, 5.2_
  - [x] 3.2 实现语言持久化逻辑
    - 实现 localStorage 读写
    - 实现与 i18next 的同步
    - _Requirements: 3.3, 5.3, 5.4_
  - [x] 3.3 编写语言设置持久化往返属性测试
    - **Property 5: 语言设置持久化往返**
    - **Validates: Requirements 3.3, 5.3**

- [x] 4. 创建 i18n Hook 和组件
  - [x] 4.1 创建 useI18n 自定义 Hook
    - 创建 `src/hooks/useI18n.ts`
    - 封装 useTranslation 和语言切换逻辑
    - 提供支持的语言列表
    - _Requirements: 2.3, 5.5_
  - [x] 4.2 创建语言切换器组件
    - 创建 `src/components/ui/LanguageSwitcher.tsx`
    - 实现下拉选择器样式
    - 显示语言名称和国旗
    - _Requirements: 3.1, 3.5_
  - [x] 4.3 编写语言切换同步属性测试
    - **Property 4: 语言切换同步**
    - **Validates: Requirements 3.2, 5.4**

- [x] 5. Checkpoint - 确保基础设施测试通过
  - 确保所有测试通过，如有问题请询问用户。

- [x] 6. 国际化设置面板组件
  - [x] 6.1 国际化 SettingsModal 组件
    - 替换 `src/components/modals/SettingsModal.tsx` 中的硬编码文本
    - 添加语言切换器到设置面板
    - _Requirements: 3.1, 4.3_
  - [x] 6.2 国际化 SiteTab 组件
    - 替换 `src/components/modals/settings/SiteTab.tsx` 中的硬编码文本
    - _Requirements: 4.3_
  - [x] 6.3 国际化 AppearanceTab 组件
    - 替换 `src/components/modals/settings/AppearanceTab.tsx` 中的硬编码文本
    - _Requirements: 4.3_
  - [x] 6.4 国际化 DataTab 组件
    - 替换 `src/components/modals/settings/DataTab.tsx` 中的硬编码文本
    - _Requirements: 4.3_
  - [x] 6.5 国际化 AITab 组件
    - 替换 AI 设置相关的硬编码文本
    - _Requirements: 4.3_

- [x] 7. 国际化布局组件
  - [x] 7.1 国际化 MainHeader 组件
    - 替换 `src/components/layout/MainHeader.tsx` 中的硬编码文本
    - 包括搜索框占位符、按钮文本、主题菜单等
    - _Requirements: 4.3_
  - [x] 7.2 国际化 Sidebar 组件
    - 替换 `src/components/layout/Sidebar.tsx` 中的硬编码文本
    - 包括分类名称、按钮文本等
    - _Requirements: 4.3_
  - [x] 7.3 国际化 ContextMenu 组件
    - 替换右键菜单中的硬编码文本
    - _Requirements: 4.3_

- [x] 8. 国际化弹窗组件
  - [x] 8.1 国际化 LinkModal 组件
    - 替换 `src/components/modals/LinkModal.tsx` 中的硬编码文本
    - 包括表单标签、按钮、提示信息等
    - _Requirements: 4.3_
  - [x] 8.2 国际化 CategoryManagerModal 组件
    - 替换 `src/components/modals/CategoryManagerModal.tsx` 中的硬编码文本
    - _Requirements: 4.3_
  - [x] 8.3 国际化 ImportModal 组件
    - 替换导入弹窗中的硬编码文本
    - _Requirements: 4.3_
  - [x] 8.4 国际化 SearchConfigModal 组件
    - 替换搜索配置弹窗中的硬编码文本
    - _Requirements: 4.3_
  - [x] 8.5 国际化 SyncConflictModal 组件
    - 替换同步冲突弹窗中的硬编码文本
    - _Requirements: 4.3_

- [x] 9. 国际化错误消息和通知
  - [x] 9.1 国际化 useSyncEngine 中的错误消息
    - 替换 `src/hooks/useSyncEngine.ts` 中的硬编码错误消息
    - _Requirements: 4.3_
  - [x] 9.2 国际化 DialogProvider 中的通知消息
    - 替换通知组件中的硬编码文本
    - _Requirements: 4.3_
  - [x] 9.3 编写翻译键回退属性测试
    - **Property 1: 翻译键回退**
    - **Validates: Requirements 1.5, 7.5**

- [x] 10. Checkpoint - 确保组件国际化测试通过
  - 确保所有测试通过，如有问题请询问用户。

- [x] 11. 高级功能实现
  - [x] 11.1 实现插值变量支持
    - 更新翻译文件支持动态变量
    - 在组件中使用插值变量
    - _Requirements: 2.4_
  - [x] 11.2 编写插值变量替换属性测试
    - **Property 2: 插值变量替换**
    - **Validates: Requirements 2.4**
  - [x] 11.3 实现复数形式支持
    - 配置 i18next 复数规则
    - 更新需要复数形式的翻译
    - _Requirements: 2.5_
  - [x] 11.4 编写复数形式处理属性测试
    - **Property 3: 复数形式处理**
    - **Validates: Requirements 2.5**

- [x] 12. TypeScript 类型支持
  - [x] 12.1 创建翻译键类型定义
    - 创建 `src/types/i18n.d.ts`
    - 定义翻译资源类型
    - 配置 react-i18next 类型扩展
    - _Requirements: 7.1_
  - [x] 12.2 编写翻译键嵌套深度属性测试
    - **Property 8: 翻译键嵌套深度**
    - **Validates: Requirements 6.3**

- [x] 13. 性能优化
  - [x] 13.1 实现翻译资源懒加载
    - 配置按需加载命名空间
    - 实现资源缓存
    - _Requirements: 8.1, 8.2, 8.5_
  - [x] 13.2 编写翻译资源缓存属性测试
    - **Property 9: 翻译资源缓存**
    - **Validates: Requirements 8.2**
  - [x] 13.3 编写语言切换性能属性测试
    - **Property 10: 语言切换性能**
    - **Validates: Requirements 8.3**

- [x] 14. 最终检查点 - 确保所有测试通过
  - 确保所有测试通过，如有问题请询问用户。

## 备注

- 所有任务均为必需任务，确保完整的测试覆盖
- 每个任务都引用了具体的需求以确保可追溯性
- 检查点任务用于确保增量验证
- 属性测试验证通用正确性属性
- 单元测试验证具体示例和边界情况
