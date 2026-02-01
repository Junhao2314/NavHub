import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  FolderOpen,
  Trash2,
} from 'lucide-react';
import React, { useCallback, useMemo, useState } from 'react';
import { useI18n } from '../../../hooks/useI18n';
import { Category, LinkItem } from '../../../types';

interface DuplicateGroup {
  key: string;
  type: 'exact-url' | 'similar-url' | 'similar-title';
  links: LinkItem[];
}

interface DuplicateCheckerProps {
  links: LinkItem[];
  categories: Category[];
  onDeleteLink: (id: string) => void;
  onNavigateToCategory?: (categoryId: string) => void;
}

// 标准化 URL 用于比较
const normalizeUrl = (url: string): string => {
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
    // 移除 www. 前缀、尾部斜杠、常见追踪参数
    let host = u.hostname.replace(/^www\./, '');
    let path = u.pathname.replace(/\/+$/, '') || '/';
    return `${host}${path}`.toLowerCase();
  } catch {
    return url
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/+$/, '');
  }
};

// 获取 URL 的域名
const getDomain = (url: string): string => {
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return url.toLowerCase();
  }
};

// 计算字符串相似度 (Levenshtein distance based)
const similarity = (s1: string, s2: string): number => {
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  if (longer.length === 0) return 1.0;

  const costs: number[] = [];
  for (let i = 0; i <= shorter.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= longer.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];
        if (shorter.charAt(i - 1) !== longer.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) costs[longer.length] = lastValue;
  }
  return (longer.length - costs[longer.length]) / longer.length;
};

const DuplicateChecker: React.FC<DuplicateCheckerProps> = ({
  links,
  categories,
  onDeleteLink,
  onNavigateToCategory,
}) => {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showSimilar, setShowSimilar] = useState(true);

  // 创建分类 ID 到名称的映射
  const categoryMap = useMemo(() => {
    const map = new Map<string, string>();
    categories.forEach((cat) => {
      map.set(cat.id, cat.name);
    });
    return map;
  }, [categories]);

  const getCategoryName = useCallback(
    (categoryId: string) => {
      return categoryMap.get(categoryId) || t('duplicateChecker.unknownCategory');
    },
    [categoryMap, t],
  );

  const handleNavigate = useCallback(
    (categoryId: string) => {
      if (onNavigateToCategory) {
        onNavigateToCategory(categoryId);
      }
    },
    [onNavigateToCategory],
  );

  // 检测重复和相似的链接
  const duplicateGroups = useMemo<DuplicateGroup[]>(() => {
    const groups: DuplicateGroup[] = [];
    const processed = new Set<string>();

    // 1. 完全相同的 URL
    const urlMap = new Map<string, LinkItem[]>();
    links.forEach((link) => {
      const normalized = normalizeUrl(link.url);
      const existing = urlMap.get(normalized) || [];
      existing.push(link);
      urlMap.set(normalized, existing);
    });

    urlMap.forEach((items, key) => {
      if (items.length > 1) {
        groups.push({ key: `exact-${key}`, type: 'exact-url', links: items });
        items.forEach((item) => {
          processed.add(item.id);
        });
      }
    });

    if (!showSimilar) return groups;

    // 2. 相似的 URL（同域名不同路径）
    const domainMap = new Map<string, LinkItem[]>();
    links.forEach((link) => {
      if (processed.has(link.id)) return;
      const domain = getDomain(link.url);
      const existing = domainMap.get(domain) || [];
      existing.push(link);
      domainMap.set(domain, existing);
    });

    domainMap.forEach((items) => {
      if (items.length > 1) {
        // 检查路径相似度
        for (let i = 0; i < items.length; i++) {
          for (let j = i + 1; j < items.length; j++) {
            const url1 = normalizeUrl(items[i].url);
            const url2 = normalizeUrl(items[j].url);
            if (similarity(url1, url2) > 0.7 && url1 !== url2) {
              const key = `similar-url-${items[i].id}-${items[j].id}`;
              if (
                !groups.some(
                  (g) =>
                    g.links.some((l) => l.id === items[i].id) &&
                    g.links.some((l) => l.id === items[j].id),
                )
              ) {
                groups.push({ key, type: 'similar-url', links: [items[i], items[j]] });
              }
            }
          }
        }
      }
    });

    // 3. 相似的标题
    const titleChecked = new Set<string>();
    links.forEach((link1) => {
      if (processed.has(link1.id) || titleChecked.has(link1.id)) return;
      links.forEach((link2) => {
        if (link1.id === link2.id || processed.has(link2.id) || titleChecked.has(link2.id)) return;
        const t1 = link1.title.toLowerCase().trim();
        const t2 = link2.title.toLowerCase().trim();
        if (t1 === t2 || similarity(t1, t2) > 0.8) {
          const key = `similar-title-${link1.id}-${link2.id}`;
          if (
            !groups.some(
              (g) =>
                g.type === 'similar-title' &&
                g.links.some((l) => l.id === link1.id) &&
                g.links.some((l) => l.id === link2.id),
            )
          ) {
            groups.push({ key, type: 'similar-title', links: [link1, link2] });
            titleChecked.add(link1.id);
            titleChecked.add(link2.id);
          }
        }
      });
    });

    return groups;
  }, [links, showSimilar]);

  const handleDelete = useCallback(
    async (id: string) => {
      setDeletingId(id);
      try {
        onDeleteLink(id);
      } finally {
        setDeletingId(null);
      }
    },
    [onDeleteLink],
  );

  const exactCount = duplicateGroups.filter((g) => g.type === 'exact-url').length;
  const similarCount = duplicateGroups.filter((g) => g.type !== 'exact-url').length;
  const totalCount = exactCount + similarCount;

  const getTypeLabel = (type: DuplicateGroup['type']) => {
    switch (type) {
      case 'exact-url':
        return t('duplicateChecker.exactDuplicate');
      case 'similar-url':
        return t('duplicateChecker.similarUrl');
      case 'similar-title':
        return t('duplicateChecker.similarTitle');
    }
  };

  const getTypeColor = (type: DuplicateGroup['type']) => {
    switch (type) {
      case 'exact-url':
        return 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200';
      case 'similar-url':
        return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200';
      case 'similar-title':
        return 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200';
    }
  };

  return (
    <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/40">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between"
      >
        <div className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200">
          <Copy size={14} className="text-slate-500" />
          {t('duplicateChecker.title')}
          {totalCount > 0 && (
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200">
              {totalCount}
            </span>
          )}
        </div>
        {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {expanded && (
        <div className="mt-4 space-y-4">
          {/* 控制选项 */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-600 dark:text-slate-300">
              {t('duplicateChecker.showSimilar')}
            </span>
            <button
              type="button"
              onClick={() => setShowSimilar(!showSimilar)}
              className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors ${showSimilar ? 'bg-accent' : 'bg-slate-200 dark:bg-slate-700'}`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${showSimilar ? 'translate-x-5' : 'translate-x-1'}`}
              />
            </button>
          </div>

          {/* 统计信息 */}
          <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
            <span>{t('duplicateChecker.exactCount', { count: exactCount })}</span>
            {showSimilar && (
              <span>{t('duplicateChecker.similarCount', { count: similarCount })}</span>
            )}
          </div>

          {/* 结果列表 */}
          {totalCount === 0 ? (
            <div className="text-center py-6 text-sm text-slate-500 dark:text-slate-400">
              <Copy size={24} className="mx-auto mb-2 opacity-50" />
              {t('duplicateChecker.noDuplicates')}
            </div>
          ) : (
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {duplicateGroups.map((group) => (
                <div
                  key={group.key}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/40 p-3"
                >
                  <div className="flex items-center gap-2 mb-2">
                    {group.type === 'exact-url' && (
                      <AlertTriangle size={12} className="text-red-500" />
                    )}
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${getTypeColor(group.type)}`}
                    >
                      {getTypeLabel(group.type)}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {group.links.map((link) => (
                      <div
                        key={link.id}
                        className="flex items-center justify-between gap-2 p-2 rounded bg-white dark:bg-slate-900/60"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            {link.icon && (
                              <img src={link.icon} alt="" className="w-4 h-4 rounded" />
                            )}
                            <span className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate">
                              {link.title}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <a
                              href={link.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400 hover:text-accent truncate"
                            >
                              <ExternalLink size={10} />
                              <span className="truncate max-w-[150px]">{link.url}</span>
                            </a>
                            <button
                              type="button"
                              onClick={() => handleNavigate(link.categoryId)}
                              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-accent/10 hover:text-accent transition-colors shrink-0"
                              title={t('duplicateChecker.goToCategory', {
                                category: getCategoryName(link.categoryId),
                              })}
                            >
                              <FolderOpen size={10} />
                              <span className="truncate max-w-[60px]">
                                {getCategoryName(link.categoryId)}
                              </span>
                            </button>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDelete(link.id)}
                          disabled={deletingId === link.id}
                          className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 shrink-0"
                          title={t('duplicateChecker.deleteCard')}
                        >
                          <Trash2
                            size={14}
                            className={deletingId === link.id ? 'animate-spin' : ''}
                          />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DuplicateChecker;
