import React from 'react';
import { SiteSettings } from '../../../types';

interface AppearanceTabProps {
    settings: SiteSettings;
    onChange: (key: keyof SiteSettings, value: any) => void;
}

const DEFAULT_ACCENT_COLOR = '99 102 241';

const parseRgbString = (value: string) => {
    const parts = value.trim().split(/\s+/).map(part => Number(part));
    if (parts.length < 3 || parts.some((part) => Number.isNaN(part))) {
        return null;
    }
    return parts.slice(0, 3).map((part) => Math.min(255, Math.max(0, Math.round(part))));
};

const rgbStringToHex = (value: string) => {
    const parts = parseRgbString(value) || parseRgbString(DEFAULT_ACCENT_COLOR) || [99, 102, 241];
    return `#${parts.map((part) => part.toString(16).padStart(2, '0')).join('')}`;
};

const hexToRgbString = (hex: string) => {
    const normalized = hex.replace('#', '').trim();
    const full = normalized.length === 3
        ? normalized.split('').map((ch) => `${ch}${ch}`).join('')
        : normalized;
    if (full.length !== 6) return null;
    const r = Number.parseInt(full.slice(0, 2), 16);
    const g = Number.parseInt(full.slice(2, 4), 16);
    const b = Number.parseInt(full.slice(4, 6), 16);
    if ([r, g, b].some((part) => Number.isNaN(part))) return null;
    return `${r} ${g} ${b}`;
};

const AppearanceTab: React.FC<AppearanceTabProps> = ({ settings, onChange }) => {
    const isBackgroundEnabled = !!settings.backgroundImageEnabled;
    const isBackgroundMotionEnabled = !!settings.backgroundMotion;
    const accentHex = rgbStringToHex(settings.accentColor || DEFAULT_ACCENT_COLOR);

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {/* Theme Color */}
            <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-200 mb-3">主题色调 (Theme Color)</label>
                <div className="grid grid-cols-6 gap-3">
                    {[
                        { name: 'Indigo', value: '99 102 241', class: 'bg-indigo-500' },
                        { name: 'Blue', value: '59 130 246', class: 'bg-blue-500' },
                        { name: 'Purple', value: '168 85 247', class: 'bg-purple-500' },
                        { name: 'Rose', value: '244 63 94', class: 'bg-rose-500' },
                        { name: 'Orange', value: '249 115 22', class: 'bg-orange-500' },
                        { name: 'Emerald', value: '16 185 129', class: 'bg-emerald-500' },
                        { name: 'Gray', value: '100 116 139', class: 'bg-slate-500' },
                    ].map((color) => (
                        <button
                            key={color.value}
                            onClick={() => onChange('accentColor', color.value)}
                            className={`h-10 rounded-full ${color.class} transition-all duration-300 relative group border border-slate-100 dark:border-slate-700`}
                            title={color.name}
                        >
                            {settings.accentColor === color.value && (
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <div className="w-2.5 h-2.5 rounded-full shadow-sm bg-white" />
                                </div>
                            )}
                        </button>
                    ))}
                </div>
                <div className="mt-4 flex items-center gap-3">
                    <input
                        type="color"
                        value={accentHex}
                        onChange={(e) => {
                            const rgb = hexToRgbString(e.target.value);
                            if (rgb) {
                                onChange('accentColor', rgb);
                            }
                        }}
                        className="h-9 w-12 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-800 cursor-pointer"
                        title="自定义颜色"
                        aria-label="自定义颜色"
                    />
                    <span className="text-xs text-slate-500 dark:text-slate-400">自定义颜色</span>
                </div>
            </div>

            <div className="h-px bg-slate-100 dark:bg-slate-800" />

            {/* Background Tone */}
            <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-200 mb-3">背景风格 (Background)</label>
                <div className="grid grid-cols-3 gap-3">
                    <button
                        onClick={() => onChange('grayScale', 'zinc')}
                        className={`p-3 rounded-xl border transition-all ${settings.grayScale === 'zinc'
                            ? 'bg-zinc-100 dark:bg-zinc-800 border-zinc-400 dark:border-zinc-500 ring-2 ring-zinc-500/20'
                            : 'bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
                    >
                        <div className="w-full h-12 rounded-lg bg-zinc-500 mb-2 shadow-sm"></div>
                        <div className="text-xs font-bold text-zinc-700 dark:text-zinc-300">高级灰 (Zinc)</div>
                        <div className="text-[10px] text-zinc-500 dark:text-zinc-500 mt-0.5">纯净无色偏</div>
                    </button>

                    <button
                        onClick={() => onChange('grayScale', 'slate')}
                        className={`p-3 rounded-xl border transition-all ${settings.grayScale === 'slate'
                            ? 'bg-slate-100 dark:bg-slate-800 border-slate-400 dark:border-slate-500 ring-2 ring-slate-500/20'
                            : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                    >
                        <div className="w-full h-12 rounded-lg bg-slate-500 mb-2 shadow-sm"></div>
                        <div className="text-xs font-bold text-slate-700 dark:text-slate-300">青灰 (Slate)</div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-500 mt-0.5">经典冷色调</div>
                    </button>

                    <button
                        onClick={() => onChange('grayScale', 'neutral')}
                        className={`p-3 rounded-xl border transition-all ${settings.grayScale === 'neutral'
                            ? 'bg-neutral-100 dark:bg-neutral-800 border-neutral-400 dark:border-neutral-500 ring-2 ring-neutral-500/20'
                            : 'bg-neutral-50 dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-800'}`}
                    >
                        <div className="w-full h-12 rounded-lg bg-neutral-500 mb-2 shadow-sm"></div>
                        <div className="text-xs font-bold text-neutral-700 dark:text-neutral-300">暖灰 (Neutral)</div>
                        <div className="text-[10px] text-neutral-500 dark:text-neutral-500 mt-0.5">柔和舒适</div>
                    </button>
                </div>
            </div>

            <div className="h-px bg-slate-100 dark:bg-slate-800" />

            {/* Custom Background */}
            <div className="space-y-3">
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-200">自定义背景</label>
                <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                    <div>
                        <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">启用背景图</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">支持 URL 或 data URL</div>
                    </div>
                    <button
                        type="button"
                        onClick={() => onChange('backgroundImageEnabled', !isBackgroundEnabled)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isBackgroundEnabled
                            ? 'bg-accent'
                            : 'bg-slate-300 dark:bg-slate-600'
                            }`}
                        aria-pressed={isBackgroundEnabled}
                        aria-label="启用背景图"
                    >
                        <span
                            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${isBackgroundEnabled
                                ? 'translate-x-5'
                                : 'translate-x-1'
                                }`}
                        />
                    </button>
                </div>

                <div className="flex items-center gap-2">
                    <input
                        type="text"
                        value={settings.backgroundImage || ''}
                        onChange={(e) => onChange('backgroundImage', e.target.value)}
                        placeholder="https://example.com/background.jpg"
                        disabled={!isBackgroundEnabled}
                        className={`flex-1 px-4 py-2.5 rounded-xl text-sm border transition-all ${isBackgroundEnabled
                            ? 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none'
                            : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400 cursor-not-allowed'
                            }`}
                    />
                    <button
                        type="button"
                        onClick={() => onChange('backgroundImage', '')}
                        disabled={!isBackgroundEnabled || !settings.backgroundImage}
                        className={`px-3 py-2 rounded-xl text-xs font-semibold transition-colors border ${!isBackgroundEnabled || !settings.backgroundImage
                            ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 border-slate-200 dark:border-slate-700 cursor-not-allowed'
                            : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                            }`}
                    >
                        清空
                    </button>
                </div>
            </div>

            <div className="h-px bg-slate-100 dark:bg-slate-800" />

            {/* Background Motion */}
            <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                <div>
                    <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">高光动态</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">轻微流动，提升层次感</div>
                </div>
                <button
                    type="button"
                    onClick={() => onChange('backgroundMotion', !isBackgroundMotionEnabled)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isBackgroundMotionEnabled
                        ? 'bg-accent'
                        : 'bg-slate-300 dark:bg-slate-600'
                        }`}
                    aria-pressed={isBackgroundMotionEnabled}
                    aria-label="高光动态"
                >
                    <span
                        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${isBackgroundMotionEnabled
                            ? 'translate-x-5'
                            : 'translate-x-1'
                            }`}
                    />
                </button>
            </div>
        </div>
    );
};

export default AppearanceTab;
