# NavHub 自定义 Hooks API

本文档详细说明 NavHub 中所有自定义 React Hooks 的 API 和使用方法。

---

## 目录

1. [Hooks 概览](#hooks-概览)
2. [useDataStore](#usedatastore)
3. [useSyncEngine](#usesyncengine)
4. [useConfig](#useconfig)
5. [useTheme](#usetheme)
6. [useSearch](#usesearch)
7. [useBatchEdit](#usebatchedit)
8. [useModals](#usemodals)
9. [useSidebar](#usesidebar)
10. [useSorting](#usesorting)
11. [useContextMenu](#usecontextmenu)
12. [useI18n](#usei18n)

---

## Hooks 概览

所有 Hooks 从 `src/hooks/index.ts` 统一导出：

```typescript
import {
  useBatchEdit,
  useConfig,
  useContextMenu,
  useDataStore,
  useI18n,
  useModals,
  useSearch,
  useSidebar,
  useSorting,
  useSyncEngine,
  useTheme,
} from './hooks';
```

| Hook | 功能 | 持久化 |
|------|------|--------|
| `useDataStore` | 链接和分类 CRUD | localStorage |
| `useSyncEngine` | 云端同步 | KV/R2 |
| `useConfig` | AI/搜索/站点配置 | localStorage |
| `useTheme` | 主题切换 | localStorage |
| `useSearch` | 搜索功能 | - |
| `useBatchEdit` | 批量编辑 | - |
| `useModals` | 弹窗状态 | - |
| `useSidebar` | 侧边栏状态 | - |
| `useSorting` | 排序功能 | - |
| `useContextMenu` | 右键菜单 | - |
| `useI18n` | 国际化 | - |

---

## useDataStore

**位置**: `src/hooks/useDataStore.ts`

管理链接和分类数据的 CRUD 操作，自动持久化到 localStorage。

### 返回值

```typescript
interface UseDataStoreReturn {
  // 状态
  links: LinkItem[];
  categories: Category[];
  isLoaded: boolean;

  // 链接操作
  addLink: (data: Omit<LinkItem, 'id' | 'createdAt'>) => void;
  updateLink: (data: Omit<LinkItem, 'createdAt'>) => void;
  deleteLink: (id: string) => void;
  togglePin: (id: string) => void;
  recordAdminLinkClick: (id: string) => void;

  // 排序
  reorderLinks: (activeId: string, overId: string, category: string) => void;
  reorderPinnedLinks: (activeId: string, overId: string) => void;

  // 分类操作
  deleteCategory: (id: string) => void;

  // 数据管理
  setLinks: React.Dispatch<React.SetStateAction<LinkItem[]>>;
  setCategories: React.Dispatch<React.SetStateAction<Category[]>>;
  updateData: (links: LinkItem[], categories: Category[]) => void;
  importData: (links: LinkItem[], categories: Category[]) => void;
}
```

### 使用示例

```typescript
const {
  links,
  categories,
  isLoaded,
  addLink,
  updateLink,
  deleteLink,
} = useDataStore();

// 添加链接
addLink({
  title: 'GitHub',
  url: 'https://github.com',
  categoryId: 'dev',
  description: '代码托管平台',
});

// 更新链接
updateLink({
  id: 'link-1',
  title: '新标题',
  url: 'https://example.com',
  categoryId: 'dev',
});

// 删除链接
deleteLink('link-1');
```

### 数据校验

- **URL 验证**: 仅支持 `http://` 和 `https://` 协议
- **分类兜底**: 删除分类时，链接自动移动到"常用推荐"
- **图标缓存**: 自动加载已缓存的 favicon

---

## useSyncEngine

**位置**: `src/hooks/useSyncEngine.ts`

云端同步引擎，提供拉取、推送、冲突解决等功能。

### 参数

```typescript
interface UseSyncEngineOptions {
  onConflict?: (conflict: SyncConflict) => void;
  onSyncComplete?: (data: NavHubSyncData) => void;
  onError?: (error: string, kind: SyncErrorKind) => void;
}
```

### 返回值

```typescript
interface UseSyncEngineReturn {
  // 状态
  syncStatus: SyncStatus;  // 'idle' | 'pending' | 'syncing' | 'synced' | 'conflict' | 'error'
  lastSyncTime: number | null;
  lastError: string | null;
  lastErrorKind: SyncErrorKind | null;

  // 核心操作
  pullFromCloud: () => Promise<PullResult>;
  pushToCloud: (data, force?, syncKind?, options?) => Promise<boolean>;
  schedulePush: (data: Omit<NavHubSyncData, 'meta'>) => void;

  // 备份操作
  createBackup: (data) => Promise<boolean>;
  restoreBackup: (backupKey: string) => Promise<NavHubSyncData | null>;
  deleteBackup: (backupKey: string) => Promise<boolean>;

  // 冲突解决
  resolveConflict: (choice: 'local' | 'remote') => Promise<boolean>;
  currentConflict: SyncConflict | null;

  // 工具
  cancelPendingSync: () => void;
  flushPendingSync: (options?) => Promise<boolean>;
  checkAuth: () => Promise<SyncAuthState>;
}
```

### 使用示例

```typescript
const {
  syncStatus,
  pullFromCloud,
  pushToCloud,
  schedulePush,
  currentConflict,
  resolveConflict,
} = useSyncEngine({
  onConflict: (conflict) => {
    console.log('检测到冲突', conflict);
  },
  onSyncComplete: (data) => {
    console.log('同步完成', data);
  },
});

// 手动拉取
await pullFromCloud();

// 手动推送
await pushToCloud(syncData, false, 'manual');

// 调度自动同步（10秒防抖）
schedulePush(syncData);

// 解决冲突
if (currentConflict) {
  await resolveConflict('local');  // 保留本地
  // 或
  await resolveConflict('remote'); // 保留云端
}
```

### 辅助函数

```typescript
import { buildSyncData } from './hooks';

// 构建同步数据对象
const syncData = buildSyncData(
  links,
  categories,
  searchConfig,
  aiConfig,
  siteSettings,
  privateVault,
  privacyConfig,
  themeMode,
  encryptedSensitiveConfig,
  customFaviconCache,
);
```

---

## useConfig

**位置**: `src/hooks/useConfig.ts`

管理 AI 配置、搜索配置和站点设置。

### 返回值

```typescript
interface UseConfigReturn {
  // AI 配置
  aiConfig: AIConfig;
  updateAIConfig: (config: Partial<AIConfig>) => void;

  // 搜索配置
  searchConfig: SearchConfig;
  updateSearchConfig: (config: Partial<SearchConfig>) => void;

  // 站点设置
  siteSettings: SiteSettings;
  updateSiteSettings: <K extends keyof SiteSettings>(key: K, value: SiteSettings[K]) => void;
}
```

### 使用示例

```typescript
const {
  aiConfig,
  updateAIConfig,
  siteSettings,
  updateSiteSettings,
} = useConfig();

// 更新 AI 配置
updateAIConfig({
  provider: 'gemini',
  apiKey: 'your-api-key',
  model: 'gemini-pro',
});

// 更新站点设置
updateSiteSettings('title', '我的导航');
updateSiteSettings('cardStyle', 'detailed');
```

---

## useTheme

**位置**: `src/hooks/useTheme.ts`

主题切换，支持亮色/暗色/跟随系统。

### 返回值

```typescript
type ThemeMode = 'light' | 'dark' | 'system';

interface UseThemeReturn {
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  isDark: boolean;  // 当前实际是否为暗色
}
```

### 使用示例

```typescript
const { themeMode, setThemeMode, isDark } = useTheme();

// 切换主题
setThemeMode('dark');
setThemeMode('light');
setThemeMode('system');

// 根据实际主题渲染
<div className={isDark ? 'bg-gray-900' : 'bg-white'}>
```

---

## useSearch

**位置**: `src/hooks/useSearch.ts`

搜索功能，支持站内搜索和外部搜索引擎切换。

### 返回值

```typescript
interface UseSearchReturn {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  searchMode: SearchMode;  // 'internal' | 'external'
  setSearchMode: (mode: SearchMode) => void;
  filteredLinks: LinkItem[];
  handleSearch: (query: string) => void;
}
```

### 使用示例

```typescript
const {
  searchQuery,
  setSearchQuery,
  searchMode,
  filteredLinks,
} = useSearch(links, categories);

// 设置搜索词
setSearchQuery('github');

// 获取过滤后的链接
filteredLinks.map(link => (
  <LinkCard key={link.id} link={link} />
));
```

---

## useBatchEdit

**位置**: `src/hooks/useBatchEdit.ts`

批量编辑模式，支持多选和批量操作。

### 返回值

```typescript
interface UseBatchEditReturn {
  isBatchMode: boolean;
  selectedIds: Set<string>;
  toggleBatchMode: () => void;
  toggleSelection: (id: string) => void;
  selectAll: (ids: string[]) => void;
  clearSelection: () => void;
  deleteSelected: () => void;
  moveSelected: (categoryId: string) => void;
}
```

### 使用示例

```typescript
const {
  isBatchMode,
  selectedIds,
  toggleBatchMode,
  toggleSelection,
  deleteSelected,
} = useBatchEdit(links, deleteLink, updateLink);

// 进入批量编辑模式
toggleBatchMode();

// 选择链接
toggleSelection('link-1');
toggleSelection('link-2');

// 批量删除
deleteSelected();
```

---

## useModals

**位置**: `src/hooks/useModals.ts`

弹窗状态管理。

### 返回值

```typescript
interface UseModalsReturn {
  // 设置弹窗
  isSettingsOpen: boolean;
  openSettings: () => void;
  closeSettings: () => void;

  // 链接编辑弹窗
  isLinkModalOpen: boolean;
  editingLink: LinkItem | null;
  openLinkModal: (link?: LinkItem) => void;
  closeLinkModal: () => void;

  // 导入弹窗
  isImportOpen: boolean;
  openImport: () => void;
  closeImport: () => void;

  // 其他弹窗...
}
```

### 使用示例

```typescript
const {
  isSettingsOpen,
  openSettings,
  closeSettings,
  openLinkModal,
} = useModals();

// 打开设置
<button onClick={openSettings}>设置</button>

// 编辑链接
<button onClick={() => openLinkModal(link)}>编辑</button>

// 新建链接
<button onClick={() => openLinkModal()}>添加</button>
```

---

## useSidebar

**位置**: `src/hooks/useSidebar.ts`

侧边栏状态管理。

### 返回值

```typescript
interface UseSidebarReturn {
  isOpen: boolean;
  toggle: () => void;
  open: () => void;
  close: () => void;
  selectedCategory: string;
  setSelectedCategory: (id: string) => void;
}
```

### 使用示例

```typescript
const {
  isOpen,
  toggle,
  selectedCategory,
  setSelectedCategory,
} = useSidebar();

// 切换侧边栏
<button onClick={toggle}>菜单</button>

// 选择分类
<button onClick={() => setSelectedCategory('dev')}>
  开发工具
</button>
```

---

## useSorting

**位置**: `src/hooks/useSorting.ts`

排序功能，与 @dnd-kit 配合使用。

### 返回值

```typescript
interface UseSortingReturn {
  sensors: SensorDescriptor<SensorOptions>[];
  handleDragEnd: (event: DragEndEvent) => void;
}
```

### 使用示例

```typescript
const { sensors, handleDragEnd } = useSorting(
  reorderLinks,
  reorderPinnedLinks,
  selectedCategory,
);

<DndContext
  sensors={sensors}
  onDragEnd={handleDragEnd}
>
  <SortableContext items={links.map(l => l.id)}>
    {links.map(link => (
      <SortableItem key={link.id} id={link.id}>
        <LinkCard link={link} />
      </SortableItem>
    ))}
  </SortableContext>
</DndContext>
```

---

## useContextMenu

**位置**: `src/hooks/useContextMenu.ts`

右键菜单管理。

### 返回值

```typescript
interface UseContextMenuReturn {
  isOpen: boolean;
  position: { x: number; y: number };
  targetLink: LinkItem | null;
  open: (event: React.MouseEvent, link: LinkItem) => void;
  close: () => void;
}
```

### 使用示例

```typescript
const {
  isOpen,
  position,
  targetLink,
  open,
  close,
} = useContextMenu();

// 触发右键菜单
<div onContextMenu={(e) => open(e, link)}>
  <LinkCard link={link} />
</div>

// 渲染菜单
{isOpen && (
  <ContextMenu
    position={position}
    link={targetLink}
    onClose={close}
  />
)}
```

---

## useI18n

**位置**: `src/hooks/useI18n.ts`

国际化工具。

### 返回值

```typescript
interface UseI18nReturn {
  t: TFunction;
  language: string;
  changeLanguage: (lang: string) => Promise<void>;
}
```

### 使用示例

```typescript
const { t, language, changeLanguage } = useI18n();

// 翻译文本
<h1>{t('common.title')}</h1>

// 带参数
<p>{t('modals.import.filteredInvalidUrls', { count: 5 })}</p>

// 切换语言
<button onClick={() => changeLanguage('en-US')}>English</button>
```

---

## 相关文档

- [架构设计](./ARCHITECTURE.md)
- [数据模型](./DATA-MODELS.md)
- [开发指南](./DEVELOPMENT.md)
