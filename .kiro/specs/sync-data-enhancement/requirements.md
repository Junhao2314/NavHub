# Requirements Document

## Introduction

本文档定义了 NavHub 同步系统增强功能的需求。当前同步系统存在三个主要问题：

1. **主题偏好未同步** - `darkMode` 存在于 `AppState` 但未包含在 `YNavSyncData` 中，导致用户换设备后主题偏好丢失
2. **API Key 处理逻辑矛盾** - `privateVault` 可以同步加密数据，但 `aiConfig.apiKey` 却被脱敏返回，逻辑不一致
3. **Favicon 缓存未同步** - `FAVICON_CACHE_KEY` 仅存本地，换设备后图标需要重新加载

本增强功能旨在解决这些问题，提供更完整的跨设备数据同步体验。

## Glossary

- **Sync_Engine**: NavHub 的 KV 同步引擎，负责本地与云端数据的同步
- **YNavSyncData**: 同步数据的主结构体，包含 links、categories、searchConfig、aiConfig、siteSettings、privateVault 和 meta
- **ThemeMode**: 主题模式类型，可选值为 'light' | 'dark' | 'system'
- **Private_Vault**: 私密保险库，使用 AES-GCM 加密存储敏感链接数据
- **Sensitive_Config**: 敏感配置数据，包括 API Key 等需要加密保护的配置项
- **Favicon_Cache**: 网站图标缓存，存储 hostname 到 icon URL 的映射关系
- **PBKDF2**: 基于密码的密钥派生函数，用于从用户密码生成加密密钥

## Requirements

### Requirement 1: 主题偏好同步

**User Story:** As a user, I want my theme preference to sync across devices, so that I can maintain a consistent visual experience without reconfiguring on each device.

#### Acceptance Criteria

1. WHEN the Sync_Engine pushes data to cloud, THE YNavSyncData SHALL include a themeMode field containing the current ThemeMode value ('light' | 'dark' | 'system')
2. WHEN the Sync_Engine pulls data from cloud, THE System SHALL apply the synced themeMode to the local theme settings
3. WHEN themeMode is set to 'system', THE System SHALL respect each device's local system preference for determining actual dark/light mode
4. WHEN a user changes theme preference on any device, THE Sync_Engine SHALL include the updated themeMode in the next sync operation
5. WHEN synced themeMode is 'system' and local system preference changes, THE System SHALL update the display theme without requiring a new sync

### Requirement 2: 敏感配置加密同步

**User Story:** As a user, I want my API keys to be securely synced across devices, so that I don't need to re-enter them on each device while keeping them protected.

#### Acceptance Criteria

1. WHEN the Sync_Engine prepares data for sync, THE System SHALL encrypt aiConfig.apiKey using the same encryption mechanism as Private_Vault
2. WHEN a user has set a privacy password, THE System SHALL use that password to encrypt Sensitive_Config data
3. WHEN the Sync_Engine pulls data from cloud, THE System SHALL decrypt the apiKey only after successful password verification
4. IF the privacy password is not set or incorrect, THEN THE System SHALL leave the apiKey field empty locally and prompt for password
5. WHEN displaying synced aiConfig to non-admin users, THE System SHALL continue to return sanitized data with empty apiKey
6. WHEN the user updates apiKey locally, THE System SHALL re-encrypt and include it in the next sync operation

### Requirement 3: Favicon 缓存同步

**User Story:** As a user, I want my favicon cache to sync across devices, so that website icons load instantly without re-fetching on new devices.

#### Acceptance Criteria

1. WHEN the Sync_Engine pushes data to cloud, THE YNavSyncData SHALL include a faviconCache field containing user-customized icon mappings
2. WHEN a user manually sets a custom icon for a link, THE System SHALL mark that icon mapping as user-customized
3. WHEN the Sync_Engine pulls data from cloud, THE System SHALL merge the synced faviconCache with local cache, preferring user-customized entries
4. THE System SHALL NOT sync automatically-fetched favicon URLs to avoid excessive sync payload size
5. WHEN merging favicon caches, THE System SHALL preserve local auto-fetched icons that are not present in the synced data
6. WHEN a synced custom icon URL becomes invalid, THE System SHALL fall back to auto-fetching the favicon

### Requirement 4: 同步数据结构扩展

**User Story:** As a developer, I want the sync data structure to be extensible, so that future sync features can be added without breaking existing functionality.

#### Acceptance Criteria

1. THE YNavSyncData interface SHALL include optional fields for themeMode, encryptedSensitiveConfig, and faviconCache
2. WHEN parsing synced data, THE System SHALL handle missing optional fields gracefully with appropriate defaults
3. WHEN older clients receive data with new fields, THE System SHALL ignore unknown fields without errors
4. THE System SHALL maintain backward compatibility with existing sync data that lacks new fields

### Requirement 5: 加密一致性

**User Story:** As a user, I want a unified encryption approach for all sensitive data, so that I only need to remember one password for privacy protection.

#### Acceptance Criteria

1. THE System SHALL use the same PBKDF2 key derivation and AES-GCM encryption for both Private_Vault and Sensitive_Config
2. WHEN a user sets or changes the privacy password, THE System SHALL re-encrypt both Private_Vault and Sensitive_Config with the new password
3. WHEN a user unlocks Private_Vault with correct password, THE System SHALL also decrypt Sensitive_Config automatically
4. IF a user chooses to use separate passwords, THEN THE System SHALL support independent encryption for Private_Vault and Sensitive_Config
