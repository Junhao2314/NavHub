import { Loader2, Pin, Plus, Sparkles, Star, Tag, Trash2, Upload, Wand2, X } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  LINK_MODAL_AUTO_FETCH_ICON_DELAY_MS,
  LINK_MODAL_SUCCESS_MESSAGE_HIDE_MS,
  LINK_MODAL_TAG_SUGGESTIONS_HIDE_DELAY_MS,
} from '../../config/ui';
import { useI18n } from '../../hooks/useI18n';
import {
  AIServiceError,
  generateLinkDescription,
  suggestCategory,
} from '../../services/geminiService';
import { AIConfig, Category, LinkItem } from '../../types';
import { getIcon as getFaviconIcon, setIcon as setFaviconIcon } from '../../utils/faviconCache';
import {
  buildFaviconExtractorUrlFromHostname,
  getHostnameFromUrlInput,
} from '../../utils/faviconExtractor';
import { getIconToneStyle, normalizeHexColor } from '../../utils/iconTone';
import { generateId } from '../../utils/id';
import { normalizeHttpUrl } from '../../utils/url';
import { useDialog } from '../ui/DialogProvider';

type AlternativeUrlRow = { id: string; url: string };

interface LinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (link: Omit<LinkItem, 'id' | 'createdAt'>) => void;
  onDelete?: (id: string) => void;
  categories: Category[];
  initialData?: Partial<LinkItem>;
  aiConfig: AIConfig;
  defaultCategoryId?: string;
  closeOnBackdrop?: boolean;
  existingTags?: string[];
}

const LinkModal: React.FC<LinkModalProps> = ({
  isOpen,
  onClose,
  onSave,
  onDelete,
  categories,
  initialData,
  aiConfig,
  defaultCategoryId,
  closeOnBackdrop = true,
  existingTags = [],
}) => {
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [categoryId, setCategoryId] = useState(categories[0]?.id || 'common');
  const [pinned, setPinned] = useState(false);
  const [recommended, setRecommended] = useState(false);
  const [icon, setIcon] = useState('');
  const [iconTone, setIconTone] = useState('');
  const [iconToneInput, setIconToneInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isFetchingIcon, setIsFetchingIcon] = useState(false);
  const [autoFetchIcon, setAutoFetchIcon] = useState(true);
  const [batchMode, setBatchMode] = useState(false);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const [showTagSuggestions, setShowTagSuggestions] = useState(false);
  const [alternativeUrls, setAlternativeUrls] = useState<AlternativeUrlRow[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const tagInputRef = useRef<HTMLInputElement>(null);
  const { notify } = useDialog();
  const { t } = useI18n();
  const isEditMode = Boolean(onDelete);

  // 过滤出未使用且匹配输入的标签建议
  const filteredTagSuggestions = useMemo(() => {
    if (!existingTags || existingTags.length === 0) return [];
    const input = tagInput.toLowerCase().trim();
    return existingTags
      .filter((tag) => !tags.some((t) => t.toLowerCase() === tag.toLowerCase()))
      .filter((tag) => !input || tag.toLowerCase().includes(input))
      .slice(0, 8);
  }, [existingTags, tags, tagInput]);

  // 当模态框关闭时，重置批量模式为默认关闭状态
  useEffect(() => {
    if (!isOpen) {
      setBatchMode(false);
      setShowSuccessMessage(false);
    }
  }, [isOpen]);

  // 成功提示1秒后自动消失
  useEffect(() => {
    if (showSuccessMessage) {
      const timer = setTimeout(() => {
        setShowSuccessMessage(false);
      }, LINK_MODAL_SUCCESS_MESSAGE_HIDE_MS);
      return () => clearTimeout(timer);
    }
  }, [showSuccessMessage]);

  useEffect(() => {
    if (isOpen) {
      const defaultCategory =
        defaultCategoryId && categories.find((cat) => cat.id === defaultCategoryId);
      const fallbackCategory = categories.find((cat) => cat.id !== 'common') || categories[0];
      const resolvedFallbackCategoryId = (defaultCategory || fallbackCategory)?.id || 'common';

      if (initialData) {
        setTitle(typeof initialData.title === 'string' ? initialData.title : '');
        setUrl(typeof initialData.url === 'string' ? initialData.url : '');
        setDescription(typeof initialData.description === 'string' ? initialData.description : '');
        setTags(
          Array.isArray(initialData.tags)
            ? initialData.tags.filter((tag): tag is string => typeof tag === 'string')
            : [],
        );
        setTagInput('');
        const nextCategoryId =
          typeof initialData.categoryId === 'string' &&
          categories.some((cat) => cat.id === initialData.categoryId)
            ? initialData.categoryId
            : resolvedFallbackCategoryId;
        setCategoryId(nextCategoryId);
        setPinned(Boolean(initialData.pinned));
        setRecommended(Boolean(initialData.recommended));
        setIcon(typeof initialData.icon === 'string' ? initialData.icon : '');
        const nextIconTone = typeof initialData.iconTone === 'string' ? initialData.iconTone : '';
        setIconTone(nextIconTone);
        setIconToneInput(nextIconTone);
        setAlternativeUrls(
          Array.isArray(initialData.alternativeUrls)
            ? initialData.alternativeUrls
                .filter((u): u is string => typeof u === 'string' && u.trim() !== '')
                .slice(0, 5)
                .map((url) => ({ id: generateId(), url }))
            : [],
        );
      } else {
        setTitle('');
        setUrl('');
        setDescription('');
        setTags([]);
        setTagInput('');
        setCategoryId(resolvedFallbackCategoryId);
        setPinned(false);
        setRecommended(false);
        setIcon('');
        setIconTone('');
        setIconToneInput('');
        setAlternativeUrls([]);
      }
    }
  }, [isOpen, initialData, categories, defaultCategoryId]);

  const parseTags = (value: string) => {
    return value
      .split(/[,\n，；;]+/g)
      .map((tag) => tag.trim())
      .filter(Boolean);
  };

  const normalizeTags = (value: string[]) => {
    const seen = new Set<string>();
    const result: string[] = [];
    value.forEach((tag) => {
      const trimmed = tag.trim();
      if (!trimmed) return;
      const key = trimmed.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      result.push(trimmed);
    });
    return result;
  };

  const commitTagInput = () => {
    const incoming = parseTags(tagInput);
    if (incoming.length === 0) return;
    setTags((prev) => normalizeTags([...prev, ...incoming]));
    setTagInput('');
  };

  const removeTag = (tagToRemove: string) => {
    setTags((prev) => prev.filter((tag) => tag !== tagToRemove));
  };

  const selectTagSuggestion = (tag: string) => {
    setTags((prev) => normalizeTags([...prev, tag]));
    setTagInput('');
    setShowTagSuggestions(false);
    tagInputRef.current?.focus();
  };

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',' || e.key === '，') {
      e.preventDefault();
      commitTagInput();
      return;
    }

    if (e.key === 'Backspace' && tagInput.trim() === '') {
      setTags((prev) => prev.slice(0, -1));
    }

    if (e.key === 'Escape') {
      setShowTagSuggestions(false);
    }
  };

  const handleFetchIcon = useCallback(async () => {
    if (!url) return;

    setIsFetchingIcon(true);
    try {
      const hostname = getHostnameFromUrlInput(url);
      if (!hostname) {
        notify(t('modals.link.invalidUrl'), 'warning');
        return;
      }

      // 先尝试从本地缓存获取图标
      // Use faviconCache module to check cache
      const cachedIcon = getFaviconIcon(hostname);
      if (cachedIcon) {
        setIcon(cachedIcon);
        return;
      }

      // 如果缓存中没有，则生成新图标
      const iconUrl = buildFaviconExtractorUrlFromHostname(hostname);
      setIcon(iconUrl);
      // 将图标保存到本地缓存
      // Use faviconCache module with isCustom: false for auto-fetched icons
      // Requirements: 3.2 - Auto-fetched icons are NOT marked as custom
      setFaviconIcon(hostname, iconUrl, false);
    } catch (e) {
      console.error('Failed to fetch icon', e);
      notify(t('modals.link.fetchIconFailed'), 'error');
    } finally {
      setIsFetchingIcon(false);
    }
  }, [notify, t, url]);

  // 当URL变化且启用自动获取图标时，自动获取图标
  useEffect(() => {
    if (!url || !autoFetchIcon || isEditMode) return;

    const timer = setTimeout(() => {
      handleFetchIcon();
    }, LINK_MODAL_AUTO_FETCH_ICON_DELAY_MS); // 延迟执行，避免频繁请求

    return () => clearTimeout(timer);
  }, [url, autoFetchIcon, isEditMode, handleFetchIcon]);

  const handleDelete = () => {
    if (!onDelete) return;
    const id = initialData?.id;
    if (typeof id !== 'string' || !id) return;
    onDelete(id);
    onClose();
  };

  const cacheCustomIcon = (url: string, iconUrl: string) => {
    const hostname = getHostnameFromUrlInput(url);
    if (!hostname) return;
    // Use faviconCache module with isCustom: true for user-set icons
    // Requirements: 3.2 - Mark icon as user-customized
    setFaviconIcon(hostname, iconUrl, true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();

    if (!title || !url) return;

    const finalUrl = normalizeHttpUrl(url);
    if (!finalUrl) {
      notify(t('modals.link.invalidUrl'), 'warning');
      return;
    }

    const nextTags = normalizeTags([...tags, ...parseTags(tagInput)]);

    // Filter and validate alternative URLs
    const validAlternativeUrls = alternativeUrls
      .map((row) => normalizeHttpUrl(row.url.trim()))
      .filter((u): u is string => u !== null);
    const uniqueAlternativeUrls = Array.from(new Set(validAlternativeUrls));

    // 保存链接数据
    onSave({
      title,
      url: finalUrl,
      icon,
      iconTone: iconTone || undefined,
      description,
      tags: nextTags.length > 0 ? nextTags : undefined,
      categoryId,
      pinned,
      recommended,
      alternativeUrls: uniqueAlternativeUrls.length > 0 ? uniqueAlternativeUrls : undefined,
    });

    // 如果有自定义图标URL，缓存到本地
    if (icon && !icon.includes('faviconextractor.com')) {
      cacheCustomIcon(finalUrl, icon);
    }

    // 批量模式下不关闭窗口，只显示成功提示
    if (batchMode) {
      setShowSuccessMessage(true);
      // 重置表单，但保留分类和批量模式设置
      setTitle('');
      setUrl('');
      setIcon('');
      setDescription('');
      setTags([]);
      setTagInput('');
      setPinned(false);
      setIconTone('');
      setIconToneInput('');
      setAlternativeUrls([]);
      // 如果开启自动获取图标，尝试获取新图标
      if (autoFetchIcon && finalUrl) {
        handleFetchIcon();
      }
    } else {
      onClose();
    }
  };

  const handleAIAssist = async () => {
    if (!url || !title) return;
    if (!aiConfig.apiKey) {
      notify(t('modals.link.configureAiFirst'), 'warning');
      return;
    }

    setIsGenerating(true);

    // Parallel execution for speed
    try {
      const descPromise = generateLinkDescription(title, url, aiConfig);
      const catPromise = suggestCategory(title, url, categories, aiConfig);

      const [desc, cat] = await Promise.all([descPromise, catPromise]);

      if (desc) setDescription(desc);
      if (cat && cat !== categoryId) {
        const name = categories.find((c) => c.id === cat)?.name;
        notify(t('modals.link.aiRecommendCategory', { category: name || cat }), 'info');
      }
    } catch (e) {
      console.error('AI Assist failed', e);
      if (e instanceof AIServiceError) {
        notify(e.getUserMessage(), 'error');
      } else {
        notify(t('modals.link.aiFillFailed'), 'error');
      }
    } finally {
      setIsGenerating(false);
    }
  };

  // 处理本地图标上传
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 验证文件类型
    const validTypes = [
      'image/png',
      'image/jpeg',
      'image/jpg',
      'image/svg+xml',
      'image/x-icon',
      'image/vnd.microsoft.icon',
    ];
    if (!validTypes.includes(file.type)) {
      notify(t('modals.link.iconFormatError'), 'warning');
      return;
    }

    // 验证文件大小 (限制为 2MB)
    if (file.size > 2 * 1024 * 1024) {
      notify(t('modals.link.iconSizeError'), 'warning');
      return;
    }

    setIsFetchingIcon(true);

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64String = event.target?.result as string;
      setIcon(base64String);
      setIsFetchingIcon(false);

      // 如果有URL，缓存到本地
      // Use faviconCache module with isCustom: true for uploaded icons
      // Requirements: 3.2 - Uploaded icons are marked as user-customized
      if (url) {
        let domain = url;
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          domain = 'https://' + url;
        }
        try {
          const urlObj = new URL(domain);
          domain = urlObj.hostname;
          setFaviconIcon(domain, base64String, true);
        } catch (_error) {
          // Failed to parse URL for caching - silently ignore
        }
      }
    };

    reader.onerror = () => {
      notify(t('modals.link.readIconFailed'), 'error');
      setIsFetchingIcon(false);
    };

    reader.readAsDataURL(file);
  };

  // 触发文件选择
  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleToneInputChange = (value: string) => {
    setIconToneInput(value);
    const normalized = normalizeHexColor(value);
    if (normalized) {
      setIconTone(normalized);
    } else if (!value.trim()) {
      setIconTone('');
    }
  };

  const handleTonePickerChange = (value: string) => {
    const normalized = normalizeHexColor(value);
    const finalValue = normalized || value;
    setIconTone(finalValue);
    setIconToneInput(finalValue);
  };

  const handleToneAuto = () => {
    setIconTone('');
    setIconToneInput('');
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm transition-opacity duration-300"
      onClick={closeOnBackdrop ? onClose : undefined}
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-100 dark:border-slate-800 transition-transform duration-300 flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center px-6 py-5 border-b border-slate-100 dark:border-slate-800/50 shrink-0">
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 tracking-tight">
            {isEditMode ? t('modals.link.editTitle') : t('modals.link.addTitle')}
          </h3>
          <div className="flex items-center gap-2">
            {!isEditMode && (
              <div
                className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                onClick={() => setBatchMode(!batchMode)}
              >
                <div
                  className={`w-2 h-2 rounded-full ${batchMode ? 'bg-green-500' : 'bg-slate-300 dark:bg-slate-600'}`}
                />
                <span className="text-xs font-medium text-slate-600 dark:text-slate-400 select-none">
                  {batchMode ? t('modals.link.batchModeOn') : t('modals.link.batchMode')}
                </span>
              </div>
            )}

            <button
              onClick={onClose}
              className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
              aria-label={t('modals.link.closeModal')}
            >
              <X size={20} strokeWidth={2} />
            </button>
          </div>
        </div>

        <form onSubmit={handleSave} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6 space-y-5 scrollbar-hide">
            {/* Top Actions Row: Pin & Delete */}
            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPinned(!pinned)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 border ${
                    pinned
                      ? 'bg-amber-50 border-amber-200 text-amber-600 dark:bg-amber-900/20 dark:border-amber-700/50 dark:text-amber-400'
                      : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-750'
                  }`}
                >
                  <Pin size={13} className={pinned ? 'fill-current' : ''} />
                  {pinned ? t('modals.link.isPinned') : t('modals.link.pinned')}
                </button>

                <button
                  type="button"
                  onClick={() => categoryId !== 'common' && setRecommended(!recommended)}
                  disabled={categoryId === 'common'}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 border ${
                    categoryId === 'common'
                      ? 'bg-accent/5 border-accent/10 text-accent/50 dark:bg-accent/10 dark:border-accent/15 dark:text-accent/40 cursor-not-allowed'
                      : recommended
                        ? 'bg-accent/10 border-accent/20 text-accent dark:bg-accent/15 dark:border-accent/20'
                        : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-750'
                  }`}
                  title={
                    categoryId === 'common'
                      ? t('modals.link.alreadyRecommendedHint')
                      : t('modals.link.recommendHint')
                  }
                >
                  <Star
                    size={13}
                    className={recommended || categoryId === 'common' ? 'fill-current' : ''}
                  />
                  {categoryId === 'common'
                    ? t('modals.link.alreadyInCategory')
                    : recommended
                      ? t('modals.link.isRecommended')
                      : t('modals.link.recommend')}
                </button>

                {isEditMode && typeof initialData?.id === 'string' && (
                  <button
                    type="button"
                    onClick={handleDelete}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 border bg-slate-50 border-slate-200 text-slate-500 hover:bg-red-50 hover:border-red-200 hover:text-red-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-red-900/20 dark:hover:border-red-800/30 dark:hover:text-red-400"
                  >
                    <Trash2 size={13} />
                    {t('common.delete')}
                  </button>
                )}
              </div>

              {/* Category Select - Compact */}
              <div className="relative min-w-[120px]">
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full appearance-none pl-3 pr-8 py-1.5 text-xs font-medium bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-slate-300 dark:focus:ring-slate-600 cursor-pointer"
                  aria-label={t('modals.category.selectCategory')}
                >
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
                <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                  <svg
                    width="10"
                    height="6"
                    viewBox="0 0 10 6"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M1 1L5 5L9 1"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {/* Title Input */}
              <div>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm font-medium"
                  placeholder={t('modals.link.websiteTitle')}
                  aria-label={t('modals.link.titleInput')}
                />
              </div>

              {/* URL Input */}
              <div>
                <input
                  type="text"
                  required
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm font-medium font-mono"
                  placeholder="https://example.com"
                  aria-label={t('modals.link.urlInput')}
                />
              </div>

              {/* Icon Section */}
              <div className="flex gap-3 items-start">
                <div
                  className="w-12 h-12 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center overflow-hidden shrink-0 shadow-sm p-2"
                  style={getIconToneStyle(iconTone)}
                >
                  {icon ? (
                    <img
                      src={icon}
                      alt="Icon"
                      className="w-full h-full object-contain"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="text-slate-300 dark:text-slate-600">
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                        <circle cx="8.5" cy="8.5" r="1.5"></circle>
                        <polyline points="21 15 16 10 5 21"></polyline>
                      </svg>
                    </div>
                  )}
                </div>

                <div className="flex-1 space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={icon}
                      onChange={(e) => setIcon(e.target.value)}
                      className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-600 dark:text-slate-300 placeholder:text-slate-400 focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all font-mono"
                      placeholder={t('modals.link.iconUrl')}
                      aria-label={t('modals.link.iconUrlInput')}
                      aria-describedby="link-modal-supported-formats"
                    />
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={handleFetchIcon}
                        disabled={!url || isFetchingIcon}
                        className="p-2 bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title={t('modals.link.autoFetchIcon')}
                        aria-label={t('modals.link.autoFetchIcon')}
                      >
                        {isFetchingIcon ? (
                          <Loader2 size={16} className="animate-spin" />
                        ) : (
                          <Wand2 size={16} />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={handleUploadClick}
                        className="p-2 bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                        title={t('common.upload')}
                        aria-label={t('modals.link.uploadIcon')}
                      >
                        <Upload size={16} />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        id="autoFetchIcon"
                        checked={autoFetchIcon}
                        onChange={(e) => setAutoFetchIcon(e.target.checked)}
                        className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-700"
                      />
                      <label
                        htmlFor="autoFetchIcon"
                        className="text-[10px] text-slate-500 dark:text-slate-400 select-none cursor-pointer"
                      >
                        {t('modals.link.autoFetchOnInput')}
                      </label>
                    </div>
                    <span
                      id="link-modal-supported-formats"
                      className="text-[10px] text-slate-400 dark:text-slate-500"
                    >
                      {t('modals.link.supportedFormats')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-500 dark:text-slate-400">
                      {t('modals.link.iconColor')}
                    </span>
                    <input
                      type="color"
                      value={normalizeHexColor(iconToneInput) || '#64748b'}
                      onChange={(e) => handleTonePickerChange(e.target.value)}
                      className="h-8 w-8 rounded-md border border-slate-200 dark:border-slate-700 bg-transparent cursor-pointer"
                      aria-label={t('modals.link.selectIconColor')}
                    />
                    <input
                      type="text"
                      value={iconToneInput}
                      onChange={(e) => handleToneInputChange(e.target.value)}
                      placeholder="#RRGGBB"
                      className="w-24 px-2 py-1.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-md text-[10px] text-slate-600 dark:text-slate-300 placeholder:text-slate-400 focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all font-mono"
                      aria-label={t('modals.link.enterIconColorHex')}
                    />
                    <button
                      type="button"
                      onClick={handleToneAuto}
                      className="px-2 py-1.5 rounded-md text-[10px] font-semibold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                      aria-label={t('modals.link.autoIconColor')}
                    >
                      {t('common.auto')}
                    </button>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".png,.jpg,.jpeg,.svg,.ico,image/png,image/jpeg,image/svg+xml,image/x-icon,image/vnd.microsoft.icon"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </div>
              </div>

              {/* Description */}
              <div className="relative">
                <div className="absolute right-3 top-3">
                  {title && url && (
                    <button
                      type="button"
                      onClick={handleAIAssist}
                      disabled={isGenerating}
                      className="flex items-center gap-1 text-[10px] font-medium text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 transition-colors bg-purple-50 dark:bg-purple-900/20 px-2 py-1 rounded-md"
                    >
                      {isGenerating ? (
                        <Loader2 size={10} className="animate-spin" />
                      ) : (
                        <Sparkles size={10} />
                      )}
                      {isGenerating ? t('modals.link.aiGenerating') : t('modals.link.aiFill')}
                    </button>
                  )}
                </div>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-sm min-h-[80px] resize-none"
                  placeholder={t('modals.link.addDescription')}
                  aria-label={t('modals.link.descriptionInput')}
                />
              </div>

              {/* Tags */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                    {t('modals.link.tags')}
                  </span>
                  {tags.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setTags([]);
                        setTagInput('');
                      }}
                      className="text-[10px] font-medium text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 transition-colors"
                    >
                      {t('common.clear')}
                    </button>
                  )}
                </div>
                <div className="relative">
                  <input
                    ref={tagInputRef}
                    type="text"
                    value={tagInput}
                    onChange={(e) => {
                      setTagInput(e.target.value);
                      setShowTagSuggestions(true);
                    }}
                    onKeyDown={handleTagKeyDown}
                    onFocus={() => setShowTagSuggestions(true)}
                    onBlur={() => {
                      setTimeout(
                        () => setShowTagSuggestions(false),
                        LINK_MODAL_TAG_SUGGESTIONS_HIDE_DELAY_MS,
                      );
                      commitTagInput();
                    }}
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-sm"
                    placeholder={t('modals.link.tagInputPlaceholder')}
                    aria-label={t('modals.link.tagInput')}
                    aria-describedby="link-modal-tag-hint"
                  />
                  {/* 标签建议下拉列表 */}
                  {showTagSuggestions && filteredTagSuggestions.length > 0 && (
                    <div className="absolute z-20 w-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                      <div className="px-3 py-1.5 text-[10px] font-medium text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-700 flex items-center gap-1">
                        <Tag size={10} />
                        {t('modals.link.existingTags')}
                      </div>
                      {filteredTagSuggestions.map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => selectTagSuggestion(tag)}
                          className="w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors flex items-center gap-2"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-600" />
                          {tag}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[11px] font-medium"
                      >
                        <span className="max-w-[180px] truncate">{tag}</span>
                        <button
                          type="button"
                          onClick={() => removeTag(tag)}
                          className="h-4 w-4 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-200 dark:text-slate-500 dark:hover:text-slate-200 dark:hover:bg-slate-700 transition-colors"
                          aria-label={t('modals.link.removeTag', { tag })}
                        >
                          <X size={11} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <p
                  id="link-modal-tag-hint"
                  className="mt-1 text-[10px] text-slate-400 dark:text-slate-500"
                >
                  {t('modals.link.tagHint')}
                </p>
              </div>

              {/* Alternative URLs */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                    {t('modals.link.alternativeUrls')}
                  </span>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500">
                    {t('modals.link.alternativeUrlsHint')}
                  </span>
                </div>
                {alternativeUrls.map((altUrl) => (
                  <div key={altUrl.id} className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={altUrl.url}
                      onChange={(e) => {
                        setAlternativeUrls((prev) =>
                          prev.map((row) =>
                            row.id === altUrl.id ? { ...row, url: e.target.value } : row,
                          ),
                        );
                      }}
                      className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all font-mono"
                      placeholder={t('modals.link.alternativeUrlPlaceholder')}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setAlternativeUrls((prev) => prev.filter((row) => row.id !== altUrl.id));
                      }}
                      className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
                {alternativeUrls.length < 5 && (
                  <button
                    type="button"
                    onClick={() =>
                      setAlternativeUrls((prev) => [...prev, { id: generateId(), url: '' }])
                    }
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-accent hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors border border-dashed border-slate-200 dark:border-slate-700"
                  >
                    <Plus size={12} />
                    {t('modals.link.addAlternativeUrl')}
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="shrink-0 p-6 pt-2 relative">
            {showSuccessMessage && (
              <div className="absolute -top-12 left-0 right-0 mx-auto w-fit z-10 px-4 py-2 bg-emerald-500 text-white text-xs font-bold rounded-full shadow-lg flex items-center gap-1.5 animate-in fade-in slide-in-from-bottom-2">
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                {t('modals.link.saveSuccess')}
              </div>
            )}

            <button
              type="submit"
              className="w-full bg-slate-900 dark:bg-accent text-white font-bold py-3.5 px-4 rounded-xl hover:bg-slate-800 dark:hover:bg-accent/90 transition-all shadow-lg shadow-slate-200 dark:shadow-none active:scale-[0.99] text-sm flex items-center justify-center gap-2"
            >
              <span>{t('modals.link.saveLink')}</span>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 12h14"></path>
                <path d="M12 5l7 7-7 7"></path>
              </svg>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default LinkModal;
