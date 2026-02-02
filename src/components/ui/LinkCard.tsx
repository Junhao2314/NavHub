import { Settings } from 'lucide-react';
import React from 'react';
import { useI18n } from '../../hooks/useI18n';
import { LinkItem } from '../../types';
import { cn } from '../../utils/cn';
import {
  analyzeIconColor,
  getCardBgStyle,
  getIconToneClass,
  getIconToneStyle,
} from '../../utils/iconTone';
import { getTagColorStyle } from '../../utils/tagColors';
import { normalizeHttpUrl } from '../../utils/url';
import { useDialog } from './DialogProvider';

interface LinkCardProps {
  link: LinkItem;
  siteCardStyle: 'detailed' | 'simple';
  isDarkMode: boolean;
  isBatchEditMode: boolean;
  isSelected: boolean;
  categoryName?: string; // 搜索结果中显示的分类名称
  onSelect: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, link: LinkItem) => void;
  onEdit: (link: LinkItem) => void;
  onOpenLink?: (link: LinkItem) => void;
}

const LinkCard: React.FC<LinkCardProps> = React.memo(
  ({
    link,
    siteCardStyle,
    isDarkMode,
    isBatchEditMode,
    isSelected,
    categoryName,
    onSelect,
    onContextMenu,
    onEdit,
    onOpenLink,
  }) => {
    const { t } = useI18n();
    const isDetailedView = siteCardStyle === 'detailed';
    const safeTags = Array.isArray(link.tags) ? link.tags.filter(Boolean) : [];
    const visibleTags = isDetailedView ? safeTags.slice(0, 5) : [];
    const remainingTagsCount = isDetailedView
      ? Math.max(0, safeTags.length - visibleTags.length)
      : 0;

    const { notify } = useDialog();
    const [descExpanded, setDescExpanded] = React.useState(false);
    const [analyzedBg, setAnalyzedBg] = React.useState<{ bg: string; text: string } | null>(null);

    // 判断是否有标签，用于调整描述扩展窗口的高度
    const hasTags = visibleTags.length > 0;

    const isDark = isDarkMode;

    // 深色模式下分析图标颜色
    React.useEffect(() => {
      let cancelled = false;
      if (isDark && link.icon && !link.iconTone) {
        analyzeIconColor(link.icon).then((result) => {
          if (!cancelled) setAnalyzedBg(result);
        });
      } else {
        setAnalyzedBg(null);
      }
      return () => {
        cancelled = true;
      };
    }, [isDark, link.icon, link.iconTone]);

    const handleDescMouseLeave = () => {
      // 如果有文字被选中，保持展开状态
      const selection = window.getSelection();
      if (selection && selection.toString().length > 0) {
        return;
      }
      setDescExpanded(false);
    };

    const cardClasses = cn(
      'group relative transition-all duration-300 border backdrop-blur-sm',
      isBatchEditMode
        ? 'cursor-pointer border-slate-200 dark:border-white/10'
        : 'hover:-translate-y-1 hover:shadow-xl hover:shadow-accent/10 shadow-sm shadow-slate-200/50 dark:shadow-none',
      isSelected
        ? 'border-rose-500 ring-2 ring-rose-500/20 !bg-rose-50 dark:!bg-rose-900/10'
        : 'border-slate-200/60 dark:border-white/8 hover:border-accent/40 dark:hover:border-accent/40',
      isDetailedView ? 'p-4 rounded-2xl' : 'px-3 py-1.5 rounded-xl',
    );

    const customToneStyle = getIconToneStyle(
      link.iconTone,
      isDark,
      link.icon,
      link.url,
      link.title,
    );

    // 获取卡片差异化背景色
    const cardBgStyle = getCardBgStyle(link.icon, link.url, link.title, isDark);

    // 深色模式下优先使用分析出的对比色背景
    const iconStyle =
      isDark && analyzedBg
        ? { backgroundColor: analyzedBg.bg, color: analyzedBg.text }
        : customToneStyle;

    const colorClass = iconStyle ? '' : getIconToneClass(link.icon, link.url, link.title);

    const iconContainerClasses = cn(
      'flex items-center justify-center shrink-0 overflow-hidden transition-transform duration-300 group-hover:scale-105',
      colorClass,
      isDetailedView
        ? 'w-14 h-14 rounded-xl shadow-sm border border-black/5 dark:border-white/5'
        : 'w-7 h-7 rounded-lg',
    );

    const handleCardClick = () => {
      if (isBatchEditMode) {
        onSelect(link.id);
      } else {
        const safeUrl = normalizeHttpUrl(link.url);
        if (!safeUrl) {
          notify(t('linkCard.invalidUrl'), 'error');
          return;
        }
        onOpenLink?.(link);
        window.open(safeUrl, '_blank', 'noopener,noreferrer');
      }
    };

    return (
      <div
        className={cardClasses}
        style={cardBgStyle}
        onClick={handleCardClick}
        onContextMenu={(e) => onContextMenu(e, link)}
      >
        <div className="flex flex-col gap-2">
          {/* Clickable area: Icon + Title */}
          <div
            className={cn(
              'flex min-w-0 cursor-pointer',
              isDetailedView ? 'items-start gap-3.5' : 'items-center gap-2.5',
            )}
          >
            {/* Icon */}
            <div className={iconContainerClasses} style={iconStyle}>
              {link.icon ? (
                <img src={link.icon} alt="" className={isDetailedView ? 'w-8 h-8' : 'w-4 h-4'} />
              ) : (
                <span className={`font-bold uppercase ${isDetailedView ? 'text-xl' : 'text-xs'}`}>
                  {link.title.charAt(0)}
                </span>
              )}
            </div>
            {/* Title + Description */}
            <div className="flex-1 min-w-0">
              <h3
                className={cn(
                  'font-medium truncate transition-colors',
                  isDetailedView
                    ? 'text-base text-slate-800 dark:text-slate-100 group-hover:text-accent'
                    : 'text-sm text-slate-700 dark:text-slate-200 group-hover:text-accent',
                )}
                title={link.title}
              >
                {link.title}
              </h3>
              {/* Description - fixed 2 lines height, not clickable */}
              {isDetailedView && (
                <div
                  className="h-[2.5rem] mt-0.5 relative"
                  onClick={(e) => e.stopPropagation()}
                  onMouseEnter={() => setDescExpanded(true)}
                  onMouseLeave={handleDescMouseLeave}
                >
                  {link.description && (
                    <p
                      className={`text-sm text-slate-500 dark:text-slate-400 leading-snug select-text cursor-text ${
                        descExpanded
                          ? `absolute z-10 left-0 right-0 bg-white dark:bg-slate-800 p-2 -mx-2 -my-2 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 overflow-y-auto break-words ${hasTags ? 'max-h-[5.5rem]' : 'max-h-[3.5rem]'}`
                          : 'line-clamp-2'
                      }`}
                      title={!descExpanded ? link.description : undefined}
                    >
                      {link.description}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
          {/* Tags row - only show if has tags or categoryName */}
          {isDetailedView && (visibleTags.length > 0 || categoryName) && (
            <div className="flex flex-wrap gap-1.5">
              {categoryName && (
                <span
                  className="px-2 py-0.5 rounded-md text-[11px] font-semibold border bg-accent/10 text-accent border-accent/20"
                  title={t('linkCard.category', { category: categoryName })}
                >
                  {categoryName}
                </span>
              )}
              {visibleTags.map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 rounded-md text-[11px] font-semibold border"
                  style={getTagColorStyle(tag, isDark)}
                  title={tag}
                >
                  {tag}
                </span>
              ))}
              {remainingTagsCount > 0 && (
                <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-[11px] font-medium border border-slate-200 dark:border-slate-700/50">
                  +{remainingTagsCount}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Simple view tooltip */}
        {!isDetailedView && link.description && !isBatchEditMode && (
          <div className="absolute left-1/2 -translate-x-1/2 -top-10 w-max max-w-[200px] bg-slate-900 text-white text-xs px-3 py-1.5 rounded-lg opacity-0 invisible group-hover:visible group-hover:opacity-100 transition-all z-20 pointer-events-none shadow-lg">
            {link.description}
            <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-slate-900"></div>
          </div>
        )}

        {/* Hover Actions */}
        {!isBatchEditMode && (
          <div
            className={cn(
              'absolute opacity-0 group-hover:opacity-100 transition-all duration-200',
              isDetailedView ? 'top-3 right-3' : 'top-1/2 -translate-y-1/2 right-2',
            )}
          >
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onEdit(link);
              }}
              className="p-1.5 text-slate-400 hover:text-accent bg-white/90 dark:bg-slate-800/90 backdrop-blur rounded-lg shadow-sm border border-slate-200/50 dark:border-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-accent/50"
              title={t('linkCard.edit')}
            >
              <Settings size={14} />
            </button>
          </div>
        )}

        {/* Selection indicator for batch mode */}
        {isBatchEditMode && (
          <div
            className={cn(
              'absolute top-2 right-2 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all',
              isSelected
                ? 'bg-rose-500 border-rose-500 text-white'
                : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800',
            )}
          >
            {isSelected && (
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={3}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            )}
          </div>
        )}
      </div>
    );
  },
);

LinkCard.displayName = 'LinkCard';

export default LinkCard;
