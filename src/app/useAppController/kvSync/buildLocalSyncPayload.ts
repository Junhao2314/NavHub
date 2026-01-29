import { buildSyncData } from '../../../hooks';
import type {
  AIConfig,
  Category,
  ExternalSearchSource,
  LinkItem,
  SearchMode,
  SiteSettings,
  ThemeMode,
} from '../../../types';
import { buildSyncCache } from '../../../utils/faviconCache';
import type { SyncPayload } from '../syncSignatures';

export type SyncPrivacyConfig = {
  groupEnabled: boolean;
  passwordEnabled: boolean;
  autoUnlockEnabled: boolean;
  useSeparatePassword: boolean;
};

export const buildLocalSyncPayload = (args: {
  links: LinkItem[];
  categories: Category[];
  searchMode: SearchMode;
  externalSearchSources: ExternalSearchSource[];
  aiConfig: AIConfig;
  siteSettings: SiteSettings;
  privateVaultCipher: string | null;
  isAdmin: boolean;
  privacyConfig: SyncPrivacyConfig;
  themeMode: ThemeMode;
  encryptedSensitiveConfig?: string;
}): SyncPayload => {
  return buildSyncData(
    args.links,
    args.categories,
    { mode: args.searchMode, externalSources: args.externalSearchSources },
    args.aiConfig,
    args.siteSettings,
    args.privateVaultCipher || undefined,
    args.isAdmin ? args.privacyConfig : undefined,
    args.themeMode,
    args.encryptedSensitiveConfig,
    buildSyncCache(),
  );
};
