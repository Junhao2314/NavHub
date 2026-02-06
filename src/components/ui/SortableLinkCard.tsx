import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import React from 'react';
import { LinkItem } from '../../types';
import {
  analyzeIconColor,
  getCardBgStyle,
  getIconToneClass,
  getIconToneStyle,
} from '../../utils/iconTone';

interface SortableLinkCardProps {
  link: LinkItem;
  siteCardStyle: 'detailed' | 'simple';
  isDarkMode: boolean;
  isSortingMode: boolean;
  isSortingPinned: boolean;
}

const SortableLinkCard: React.FC<SortableLinkCardProps> = React.memo(
  ({ link, siteCardStyle, isDarkMode, isSortingMode, isSortingPinned }) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
      id: link.id,
    });

    const isDetailedView = siteCardStyle === 'detailed';
    const isDark = isDarkMode;
    const [analyzedBg, setAnalyzedBg] = React.useState<{ bg: string; text: string } | null>(null);

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

    const customToneStyle = getIconToneStyle(
      link.iconTone,
      isDark,
      link.icon,
      link.url,
      link.title,
    );
    const cardBgStyle =
      isSortingMode || isSortingPinned
        ? undefined
        : getCardBgStyle(link.icon, link.url, link.title, isDark);

    // 深色模式下优先使用分析出的对比色背景
    const iconStyle =
      isDark && analyzedBg
        ? { backgroundColor: analyzedBg.bg, color: analyzedBg.text }
        : customToneStyle;

    const iconToneClass = iconStyle ? '' : getIconToneClass(link.icon, link.url, link.title);
    const safeTags = Array.isArray(link.tags) ? link.tags.filter(Boolean) : [];
    const visibleTags = isDetailedView ? safeTags.slice(0, 3) : [];
    const remainingTagsCount = isDetailedView
      ? Math.max(0, safeTags.length - visibleTags.length)
      : 0;

    const style = {
      transform: CSS.Transform.toString(transform),
      transition: isDragging ? 'none' : transition,
      opacity: isDragging ? 0.5 : 1,
      zIndex: isDragging ? 1000 : 'auto',
      ...(cardBgStyle || {}),
    };

    return (
      <div
        ref={setNodeRef}
        style={style}
        className={`group relative transition-all duration-300 cursor-grab active:cursor-grabbing min-w-0 max-w-full overflow-hidden backdrop-blur-md rounded-2xl
                ${
                  isSortingMode || isSortingPinned
                    ? 'bg-emerald-500/10 border-emerald-400/50 ring-2 ring-emerald-500/20'
                    : 'border border-slate-200/60 dark:border-white/5'
                }
                ${isDragging ? 'shadow-2xl scale-105 z-50 ring-2 ring-accent' : 'hover:-translate-y-1 hover:shadow-xl hover:shadow-accent/10'}
                ${isDetailedView ? 'flex flex-col p-5 min-h-[120px]' : 'flex items-center p-3.5'}
            `}
        {...attributes}
        {...listeners}
      >
        {/* 链接内容 - 移除a标签，改为div防止点击跳转 */}
        <div
          className={`flex flex-1 min-w-0 overflow-hidden ${
            isDetailedView ? 'flex-col' : 'items-center gap-3'
          }`}
        >
          {/* 第一行：图标和标题水平排列 */}
          <div className={`flex items-center gap-3 mb-2 ${isDetailedView ? '' : 'w-full'}`}>
            {/* Icon */}
            <div
              className={`flex items-center justify-center text-sm font-bold uppercase shrink-0 border border-black/5 dark:border-white/5 ${iconToneClass} ${
                isDetailedView ? 'w-8 h-8 rounded-xl' : 'w-8 h-8 rounded-lg'
              }`}
              style={iconStyle}
            >
              {link.icon ? (
                <img src={link.icon} alt="" loading="lazy" decoding="async" className="w-5 h-5" />
              ) : (
                link.title.charAt(0)
              )}
            </div>

            {/* 标题 */}
            <h3
              className={`text-slate-900 dark:text-slate-100 truncate overflow-hidden text-ellipsis ${
                isDetailedView
                  ? 'text-base'
                  : 'text-sm font-medium text-slate-800 dark:text-slate-200'
              }`}
              title={link.title}
            >
              {link.title}
            </h3>
          </div>

          {/* 第二行：描述文字 */}
          {isDetailedView && link.description && (
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed line-clamp-2">
              {link.description}
            </p>
          )}

          {/* 标签 */}
          {visibleTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {visibleTags.map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[11px] font-medium"
                  title={tag}
                >
                  {tag}
                </span>
              ))}
              {remainingTagsCount > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-[11px] font-medium">
                  +{remainingTagsCount}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    );
  },
);

SortableLinkCard.displayName = 'SortableLinkCard';

export default SortableLinkCard;
