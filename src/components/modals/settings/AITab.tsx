import React, { useState, useRef } from 'react';
import { Sparkles, Loader2, CheckCircle, AlertCircle, Zap, Layers, List, Key, PauseCircle } from 'lucide-react';
import { AIConfig, LinkItem } from '../../../types';
import { generateLinkDescription, testAIConnection, fetchAvailableModels } from '../../../services/geminiService';
import { useDialog } from '../../ui/DialogProvider';

interface AITabProps {
    config: AIConfig;
    onChange: (key: keyof AIConfig, value: string) => void;
    links: LinkItem[];
    onUpdateLinks: (links: LinkItem[]) => void;
}

const AITab: React.FC<AITabProps> = ({ config, onChange, links, onUpdateLinks }) => {
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
        setTestingConnection(true);
        setConnectionStatus('idle');
        try {
            const result = await testAIConnection(config);
            setConnectionStatus(result ? 'success' : 'error');
            if (result) {
                setTimeout(() => setConnectionStatus('idle'), 3000);
            }
        } catch (e) {
            setConnectionStatus('error');
        } finally {
            setTestingConnection(false);
        }
    };

    const handleFetchModels = async () => {
        setFetchingModels(true);
        setShowModelList(false);
        try {
            const models = await fetchAvailableModels(config);
            if (models.length > 0) {
                setAvailableModels(models);
                setShowModelList(true);
            } else {
                notify("未找到可用模型，请检查配置或手动输入。", 'warning');
            }
        } catch (e) {
            notify("获取模型列表失败", 'error');
        } finally {
            setFetchingModels(false);
        }
    };

    const handleBulkGenerate = async () => {
        if (!config.apiKey) {
            notify("请先配置并保存 API Key", 'warning');
            return;
        }

        const missingLinks = links.filter(l => !l.description);
        if (missingLinks.length === 0) {
            notify("所有链接都已有描述！", 'info');
            return;
        }

        const shouldGenerate = await confirm({
            title: '批量生成描述',
            message: `发现 ${missingLinks.length} 个链接缺少描述，确定要使用 AI 自动生成吗？这可能需要一些时间。`,
            confirmText: '开始生成',
            cancelText: '取消'
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
                currentLinks = currentLinks.map(l => l.id === link.id ? { ...l, description: desc } : l);
                onUpdateLinks(currentLinks);
                setProgress({ current: i + 1, total: missingLinks.length });
            } catch (e) {
                console.error(`Failed to generate for ${link.title}`, e);
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
                        <p>配置 AI 助手后，可以自动为您的链接生成智能描述和分类建议。Key 仅存储在本地浏览器缓存中，不会发送到我们的服务器。</p>
                    </div>
                </div>
                <div className="flex justify-end mt-1">
                    <button
                        onClick={handleTestConnection}
                        className={`text-xs flex items-center gap-1.5 px-2 py-1.5 rounded-md transition-colors ${connectionStatus === 'success' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                            connectionStatus === 'error' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                                'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'
                            }`}
                        title="测试连接"
                    >
                        {testingConnection ? <Loader2 size={12} className="animate-spin" /> :
                            connectionStatus === 'success' ? <CheckCircle size={12} /> :
                                connectionStatus === 'error' ? <AlertCircle size={12} /> :
                                    <Zap size={12} />}
                        {testingConnection ? '测试中...' :
                            connectionStatus === 'success' ? '连接成功' :
                                connectionStatus === 'error' ? '连接失败' :
                                    '测试连接'}
                    </button>
                </div>
            </div>

            <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">AI 提供商</label>
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
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">模型名称</label>
                        <div className="relative">
                            <input
                                type="text"
                                value={config.model}
                                onChange={(e) => onChange('model', e.target.value)}
                                placeholder={config.provider === 'gemini' ? "gemini-2.5-flash" : "gpt-3.5-turbo"}
                                className="w-full pl-4 pr-10 py-2.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                            />
                            <button
                                onClick={handleFetchModels}
                                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md transition-colors"
                                title="自动获取模型列表"
                            >
                                {fetchingModels ? <Loader2 size={14} className="animate-spin" /> : <List size={14} />}
                            </button>

                            {showModelList && availableModels.length > 0 && (
                                <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl max-h-48 overflow-y-auto">
                                    {availableModels.map(model => (
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
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">API Key</label>
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
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Base URL (可选)</label>
                        <input
                            type="text"
                            value={config.baseUrl}
                            onChange={(e) => onChange('baseUrl', e.target.value)}
                            placeholder="https://api.openai.com/v1"
                            className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-mono text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                        />
                    </div>
                )}
            </div>

            <div className="pt-6 border-t border-slate-100 dark:border-slate-700/50">
                <h4 className="text-sm font-bold text-slate-800 dark:text-white mb-3">批量操作</h4>
                {isProcessing ? (
                    <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">正在生成描述... {progress.current}/{progress.total}</span>
                            <button
                                onClick={() => {
                                    shouldStopRef.current = true;
                                    setIsProcessing(false);
                                }}
                                className="text-red-500 hover:text-red-600 flex items-center gap-1 text-xs font-medium px-2 py-1 hover:bg-red-50 rounded transition-colors"
                            >
                                <PauseCircle size={12} /> 停止
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
                        <span className="text-sm font-medium">自动补全所有缺失的链接描述</span>
                    </button>
                )}
            </div>
        </div>
    );
};

export default AITab;
