import { Bot, Database, Globe, Palette, Save, X } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { buildDefaultSiteSettings } from '../../config/defaults';
import { useI18n } from '../../hooks/useI18n';
import {
  AIConfig,
  Category,
  CountdownItem,
  LinkItem,
  SiteSettings,
  SiteSettingsChangeHandler,
  SyncRole,
  VerifySyncPasswordResult,
} from '../../types';
import AITab from './settings/AITab';
import AppearanceTab from './settings/AppearanceTab';
import DataTab from './settings/DataTab';
import SiteTab from './settings/SiteTab';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: AIConfig;
  siteSettings: SiteSettings;
  onSave: (config: AIConfig, siteSettings: SiteSettings) => void;
  links: LinkItem[];
  categories: Category[];
  countdownItems?: CountdownItem[];
  onUpdateLinks: (links: LinkItem[]) => void;
  onDeleteLink: (id: string) => void;
  onNavigateToCategory?: (categoryId: string) => void;
  onOpenImport: () => void;
  onRestoreBackup: (backupKey: string) => Promise<boolean>;
  onDeleteBackup: (backupKey: string) => Promise<boolean>;
  onSyncPasswordChange: (password: string) => void;
  onVerifySyncPassword: () => Promise<VerifySyncPasswordResult>;
  syncRole: SyncRole;
  isSyncProtected: boolean;
  useSeparatePrivacyPassword: boolean;
  onSwitchPrivacyMode: (payload: {
    useSeparatePassword: boolean;
    oldPassword: string;
    newPassword: string;
  }) => Promise<boolean>;
  privacyGroupEnabled: boolean;
  onTogglePrivacyGroup: (enabled: boolean) => void;
  privacyPasswordEnabled: boolean;
  isTogglingPrivacyPassword: boolean;
  onTogglePrivacyPassword: (enabled: boolean) => void;
  privacyAutoUnlockEnabled: boolean;
  onTogglePrivacyAutoUnlock: (enabled: boolean) => void;
  isPrivateUnlocked: boolean;
  closeOnBackdrop?: boolean;
}

const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  config,
  siteSettings,
  onSave,
  links,
  categories,
  countdownItems,
  onUpdateLinks,
  onDeleteLink,
  onNavigateToCategory,
  onOpenImport,
  onRestoreBackup,
  onDeleteBackup,
  onSyncPasswordChange,
  onVerifySyncPassword,
  syncRole,
  isSyncProtected,
  useSeparatePrivacyPassword,
  onSwitchPrivacyMode,
  privacyGroupEnabled,
  onTogglePrivacyGroup,
  privacyPasswordEnabled,
  isTogglingPrivacyPassword,
  onTogglePrivacyPassword,
  privacyAutoUnlockEnabled,
  onTogglePrivacyAutoUnlock,
  isPrivateUnlocked,
  closeOnBackdrop = true,
}) => {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<'site' | 'ai' | 'appearance' | 'data'>('site');
  const [localConfig, setLocalConfig] = useState<AIConfig>(config);
  const [localSiteSettings, setLocalSiteSettings] = useState<SiteSettings>(() => ({
    ...buildDefaultSiteSettings(),
    ...siteSettings,
  }));

  useEffect(() => {
    if (isOpen) {
      setLocalConfig(config);
      setLocalSiteSettings({ ...buildDefaultSiteSettings(), ...siteSettings });
    }
  }, [isOpen, config, siteSettings]);

  useEffect(() => {
    if (isOpen) {
      setActiveTab('site');
    }
  }, [isOpen]);

  const canAccessAISettings = syncRole === 'admin';

  useEffect(() => {
    if (!isOpen) return;
    if (!canAccessAISettings && activeTab === 'ai') {
      setActiveTab('site');
    }
  }, [isOpen, canAccessAISettings, activeTab]);

  const handleChange = (key: keyof AIConfig, value: string) => {
    setLocalConfig((prev) => ({ ...prev, [key]: value }));
  };

  const handleSiteChange: SiteSettingsChangeHandler = (key, value) => {
    setLocalSiteSettings((prev) => ({ ...prev, [key]: value }) as SiteSettings);
  };

  const handleSave = () => {
    onSave(localConfig, localSiteSettings);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm transition-opacity duration-300"
      onClick={closeOnBackdrop ? onClose : undefined}
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-100 dark:border-slate-800 transition-transform duration-300 flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center px-6 py-5 border-b border-slate-100 dark:border-slate-800/50 shrink-0">
          <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">
            {t('settings.title')}
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
            aria-label={t('settings.closeSettings')}
          >
            <X size={20} strokeWidth={2} />
          </button>
        </div>

        {/* Tabs - Centered Segmented Control */}
        <div className="px-6 pt-6 shrink-0">
          <div className="flex p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
            <button
              onClick={() => setActiveTab('site')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                activeTab === 'site'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              <Globe size={16} />
              <span>{t('settings.tabs.site')}</span>
            </button>
            {canAccessAISettings && (
              <button
                onClick={() => setActiveTab('ai')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                  activeTab === 'ai'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                <Bot size={16} />
                <span>{t('settings.tabs.ai')}</span>
              </button>
            )}
            <button
              onClick={() => setActiveTab('appearance')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                activeTab === 'appearance'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              <Palette size={16} />
              <span>{t('settings.tabs.appearance')}</span>
            </button>
            <button
              onClick={() => setActiveTab('data')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                activeTab === 'data'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              <Database size={16} />
              <span>{t('settings.tabs.data')}</span>
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
          {activeTab === 'site' && (
            <SiteTab settings={localSiteSettings} onChange={handleSiteChange} />
          )}

          {canAccessAISettings && activeTab === 'ai' && (
            <AITab
              config={localConfig}
              onChange={handleChange}
              links={links}
              onUpdateLinks={onUpdateLinks}
            />
          )}

          {activeTab === 'appearance' && (
            <AppearanceTab settings={localSiteSettings} onChange={handleSiteChange} />
          )}

          {activeTab === 'data' && (
            <DataTab
              onOpenImport={onOpenImport}
              onClose={onClose}
              onRestoreBackup={onRestoreBackup}
              onDeleteBackup={onDeleteBackup}
              onSyncPasswordChange={onSyncPasswordChange}
              onVerifySyncPassword={onVerifySyncPassword}
              syncRole={syncRole}
              isSyncProtected={isSyncProtected}
              useSeparatePrivacyPassword={useSeparatePrivacyPassword}
              onSwitchPrivacyMode={onSwitchPrivacyMode}
              privacyGroupEnabled={privacyGroupEnabled}
              onTogglePrivacyGroup={onTogglePrivacyGroup}
              privacyPasswordEnabled={privacyPasswordEnabled}
              isTogglingPrivacyPassword={isTogglingPrivacyPassword}
              onTogglePrivacyPassword={onTogglePrivacyPassword}
              privacyAutoUnlockEnabled={privacyAutoUnlockEnabled}
              onTogglePrivacyAutoUnlock={onTogglePrivacyAutoUnlock}
              isPrivateUnlocked={isPrivateUnlocked}
              links={links}
              categories={categories}
              countdownItems={countdownItems}
              onDeleteLink={onDeleteLink}
              onNavigateToCategory={onNavigateToCategory}
            />
          )}
        </div>

        {/* Footer */}
        <div className="p-6 pt-2 border-t border-transparent shrink-0">
          <button
            onClick={handleSave}
            disabled={syncRole !== 'admin'}
            className={`w-full text-white font-bold py-3.5 px-4 rounded-xl transition-all shadow-lg shadow-slate-200 dark:shadow-none text-sm flex items-center justify-center gap-2 ${
              syncRole === 'admin'
                ? 'bg-slate-900 dark:bg-accent hover:bg-slate-800 dark:hover:bg-accent/90 active:scale-[0.99]'
                : 'bg-slate-400 dark:bg-slate-700 cursor-not-allowed opacity-70'
            }`}
          >
            <Save size={16} />
            <span>
              {syncRole === 'admin' ? t('settings.saveSettings') : t('settings.userModeHint')}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
