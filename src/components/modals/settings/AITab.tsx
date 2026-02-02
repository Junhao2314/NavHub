import {
  AlertCircle,
  CheckCircle,
  Key,
  Layers,
  List,
  Loader2,
  PauseCircle,
  Sparkles,
  Zap,
} from 'lucide-react';
import React, { useRef, useState } from 'react';
import { AI_CONNECTION_STATUS_RESET_MS } from '../../../config/ui';
import { useI18n } from '../../../hooks/useI18n';
import {
  AIServiceError,
  fetchAvailableModels,
  generateLinkDescription,
  testAIConnection,
} from '../../../services/geminiService';
import { AIConfig, LinkItem } from '../../../types';
import { useDialog } from '../../ui/DialogProvider';

interface AITabProps {
  config: AIConfig;
  onChange: (key: keyof AIConfig, value: string) => void;
  links: LinkItem[];
  onUpdateLinks: (links: LinkItem[]) => void;
}

const AITab: React.FC<AITabProps> = ({ config, onChange, links, onUpdateLinks }) => {
  const { t } = useI18n();
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [fetchingModels, setFetchingModels] = useState(false);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [showModelList, setShowModelList] = useState(false);
  const { notify, confirm } = useDialog();

  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const shouldStopRef = useRef(false);

  const handleTestConnection = async () => {
    if (!config.apiKey.trim()) {
      notify(t('settings.ai.configureApiKeyFirst'), 'warning');
      setConnectionStatus('error');
      return;
    }

    setTestingConnection(true);
    setConnectionStatus('idle');
    try {
      await testAIConnection(config);
      setConnectionStatus('success');
      setTimeout(() => setConnectionStatus('idle'), AI_CONNECTION_STATUS_RESET_MS);
    } catch (e) {
      setConnectionStatus('error');
      if (e instanceof AIServiceError) {
        notify(e.getUserMessage(), 'error');
      } else if (config.provider === 'openai') {
        notify(t('settings.ai.connectionFailedOpenAI'), 'error');
      } else {
        notify(t('settings.ai.connectionFailedGemini'), 'error');
      }
    } finally {
      setTestingConnection(false);
    }
  };

  const handleFetchModels = async () => {
    if (!config.apiKey.trim()) {
      notify(t('settings.ai.configureApiKeyFirst'), 'warning');
      return;
    }

    setFetchingModels(true);
    setShowModelList(false);
    try {
      const models = await fetchAvailableModels(config);
      if (models.length > 0) {
        setAvailableModels(models);
        setShowModelList(true);
      } else {
        if (config.provider === 'openai') {
          notify(t('settings.ai.noModelsFoundOpenAI'), 'warning');
        } else {
          notify(t('settings.ai.noModelsFound'), 'warning');
        }
      }
    } catch (e) {
      if (e instanceof AIServiceError) {
        notify(e.getUserMessage(), 'error');
      } else {
        notify(t('common.failed'), 'error');
      }
    } finally {
      setFetchingModels(false);
    }
  };

  const handleBulkGenerate = async () => {
    if (!config.apiKey.trim()) {
      notify(t('settings.ai.configureApiKeyFirst'), 'warning');
      return;
    }

    const missingLinks = links.filter((l) => !l.description);
    if (missingLinks.length === 0) {
      notify(t('settings.ai.allLinksHaveDesc'), 'info');
      return;
    }

    const shouldGenerate = await confirm({
      title: t('settings.ai.bulkGenerateConfirmTitle'),
      message: t('settings.ai.bulkGenerateConfirmMessage', { count: missingLinks.length }),
      confirmText: t('settings.ai.startGenerate'),
      cancelText: t('common.cancel'),
    });

    if (!shouldGenerate) return;

    setIsProcessing(true);
    shouldStopRef.current = false;
    setProgress({ current: 0, total: missingLinks.length });

    let currentLinks = [...links];

    for (let i = 0; i < missingLinks.length; i++) {
      if (shouldStopRef.current) break;

      const link = missingLinks[i];
      try {
        const desc = await generateLinkDescription(link.title, link.url, config);
        currentLinks = currentLinks.map((l) =>
          l.id === link.id ? { ...l, description: desc } : l,
        );
        onUpdateLinks(currentLinks);
        setProgress({ current: i + 1, total: missingLinks.length });
      } catch (e) {
        console.error(`Failed to generate for ${link.title}`, e);
        const errorMsg = e instanceof AIServiceError ? e.getUserMessage() : t('common.failed');
        notify(`"${link.title}"：${errorMsg}`, 'warning');
      }
    }

    setIsProcessing(false);
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="bg-blue-50 dark:bg-blue-900/10 p-4 rounded-xl border border-blue-100 dark:border-blue-800/20 flex flex-col gap-3">
        <div className="flex gap-3">
          <div className="shrink-0 text-blue-600 dark:text-blue-400 mt-0.5">
            <Sparkles size={18} />
          </div>
          <div className="text-sm text-blue-800 dark:text-blue-200 leading-relaxed">
            <p>{t('settings.ai.description')}</p>
          </div>
        </div>
        <div className="flex justify-end mt-1">
          <button
            onClick={handleTestConnection}
            className={`text-xs flex items-center gap-1.5 px-2 py-1.5 rounded-md transition-colors ${
              connectionStatus === 'success'
                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                : connectionStatus === 'error'
                  ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'
            }`}
            title={t('settings.ai.testConnection')}
          >
            {testingConnection ? (
              <Loader2 size={12} className="animate-spin" />
            ) : connectionStatus === 'success' ? (
              <CheckCircle size={12} />
            ) : connectionStatus === 'error' ? (
              <AlertCircle size={12} />
            ) : (
              <Zap size={12} />
            )}
            {testingConnection
              ? t('settings.ai.testing')
              : connectionStatus === 'success'
                ? t('settings.ai.connectionSuccess')
                : connectionStatus === 'error'
                  ? t('settings.ai.connectionFailed')
                  : t('settings.ai.testConnection')}
          </button>
        </div>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              {t('settings.ai.provider')}
            </label>
            <div className="relative">
              <select
                value={config.provider}
                onChange={(e) => onChange('provider', e.target.value)}
                className="w-full appearance-none px-4 py-2.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
              >
                <option value="gemini">Google Gemini</option>
                <option value="openai">OpenAI Compatible</option>
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                <Layers size={14} />
              </div>
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              {t('settings.ai.modelName')}
            </label>
            <div className="relative">
              <input
                type="text"
                value={config.model}
                onChange={(e) => onChange('model', e.target.value)}
                placeholder={config.provider === 'gemini' ? 'gemini-2.5-flash' : 'gpt-3.5-turbo'}
                className="w-full pl-4 pr-10 py-2.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
              />
              <button
                onClick={handleFetchModels}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md transition-colors"
                title={t('settings.ai.fetchModels')}
              >
                {fetchingModels ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <List size={14} />
                )}
              </button>

              {showModelList && availableModels.length > 0 && (
                <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl max-h-48 overflow-y-auto">
                  {availableModels.map((model) => (
                    <button
                      key={model}
                      onClick={() => {
                        onChange('model', model);
                        setShowModelList(false);
                      }}
                      className="w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                    >
                      {model}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
            {t('settings.ai.apiKey')}
          </label>
          <div className="relative">
            <Key size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="password"
              value={config.apiKey}
              onChange={(e) => onChange('apiKey', e.target.value)}
              placeholder="sk-..."
              className="w-full pl-9 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-mono text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
            />
          </div>
        </div>

        {config.provider === 'openai' && (
          <div className="animate-in fade-in slide-in-from-top-1 duration-200">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              {t('settings.ai.baseUrl')}
            </label>
            <input
              type="text"
              value={config.baseUrl}
              onChange={(e) => onChange('baseUrl', e.target.value)}
              placeholder={t('settings.ai.baseUrlPlaceholder')}
              className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-mono text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
            />
          </div>
        )}
      </div>

      <div className="pt-6 border-t border-slate-100 dark:border-slate-700/50">
        <h4 className="text-sm font-bold text-slate-800 dark:text-white mb-3">
          {t('settings.ai.bulkOperations')}
        </h4>
        {isProcessing ? (
          <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                {t('settings.ai.generating')} {progress.current}/{progress.total}
              </span>
              <button
                onClick={() => {
                  shouldStopRef.current = true;
                  setIsProcessing(false);
                }}
                className="text-red-500 hover:text-red-600 flex items-center gap-1 text-xs font-medium px-2 py-1 hover:bg-red-50 rounded transition-colors"
              >
                <PauseCircle size={12} /> {t('settings.ai.stop')}
              </button>
            </div>
            <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all duration-300 ease-out"
                style={{ width: `${(progress.current / progress.total) * 100}%` }}
              />
            </div>
          </div>
        ) : (
          <button
            onClick={handleBulkGenerate}
            className="w-full group flex items-center justify-center gap-2 p-3 rounded-xl border border-dashed border-slate-300 dark:border-slate-600 hover:border-purple-400 dark:hover:border-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/10 transition-all text-slate-600 dark:text-slate-400 hover:text-purple-600 dark:hover:text-purple-400"
          >
            <Sparkles size={16} className="group-hover:scale-110 transition-transform" />
            <span className="text-sm font-medium">{t('settings.ai.bulkGenerateDesc')}</span>
          </button>
        )}
      </div>
    </div>
  );
};

export default AITab;
