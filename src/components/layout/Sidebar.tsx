import { ChevronLeft, Settings } from 'lucide-react';
import React from 'react';
import { SIDEBAR_SHOW_DATE_PROBABILITY, SIDEBAR_TYPEWRITER_MS } from '../../config/ui';
import { useI18n } from '../../hooks/useI18n';
import { useAppStore } from '../../stores/useAppStore';
import { Category } from '../../types';
import { cn } from '../../utils/cn';
import { PRIVATE_CATEGORY_ID } from '../../utils/constants';
import Icon from '../ui/Icon';

interface SidebarProps {
  categories: Category[];
  linkCounts: Record<string, number>;
  privacyGroupEnabled: boolean;
  isPrivateUnlocked: boolean;
  privateCount: number;
  repoUrl: string;
  isAdmin: boolean;
  onOpenCategoryManager: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  categories,
  linkCounts,
  privacyGroupEnabled,
  isPrivateUnlocked,
  privateCount,
  repoUrl,
  isAdmin,
  onOpenCategoryManager,
}) => {
  const { t } = useI18n();
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const isSidebarCollapsed = useAppStore((s) => s.isSidebarCollapsed);
  const selectedCategory = useAppStore((s) => s.selectedCategory);
  const sidebarWidthClass = isSidebarCollapsed ? 'w-64 lg:w-20' : 'w-64 lg:w-56';
  const navTitle = useAppStore((s) => s.siteSettings.navTitle);
  const navTitleText = navTitle || 'NavHub';

  const onSelectAll = useAppStore((s) => s.selectAll);
  const onSelectCategory = useAppStore((s) => s.handleCategoryClick);
  const selectCategory = useAppStore((s) => s.selectCategory);
  const onSelectPrivate = React.useCallback(
    () => selectCategory(PRIVATE_CATEGORY_ID),
    [selectCategory],
  );
  const onToggleCollapsed = useAppStore((s) => s.toggleSidebarCollapsed);

  // 状态机：'typing' | 'pausing' | 'deleting'
  const [phase, setPhase] = React.useState<'typing' | 'pausing' | 'deleting'>('typing');
  const [targetText, setTargetText] = React.useState('NavHub'); // 当前要显示的目标文本
  const [displayText, setDisplayText] = React.useState(''); // 实际显示的文本

  // 核心打字机逻辑
  React.useEffect(() => {
    let timeout: NodeJS.Timeout;

    const { typeSpeed, deleteSpeed, navPause, timePauseMin, timePauseMax } = SIDEBAR_TYPEWRITER_MS;

    const getCurrentTime = () => {
      const now = new Date();
      return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    };

    const getCurrentDate = () => {
      const now = new Date();
      return `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    };

    if (phase === 'typing') {
      if (displayText !== targetText) {
        // 继续打字
        timeout = setTimeout(() => {
          setDisplayText(targetText.slice(0, displayText.length + 1));
        }, typeSpeed);
      } else {
        // 打字完成，进入停留
        setPhase('pausing');
      }
    } else if (phase === 'pausing') {
      // 决定停留多久
      let delay = navPause;
      if (targetText !== 'NavHub') {
        // 如果是时间，停留 3-6 秒
        delay = Math.floor(Math.random() * (timePauseMax - timePauseMin + 1)) + timePauseMin;
      }

      timeout = setTimeout(() => {
        setPhase('deleting');
      }, delay);
    } else if (phase === 'deleting') {
      if (displayText.length > 0) {
        // 继续删除
        timeout = setTimeout(() => {
          setDisplayText((prev) => prev.slice(0, -1));
        }, deleteSpeed);
      } else {
        // 删除完毕，决定下一个文本
        let nextText = 'NavHub';

        if (targetText === 'NavHub') {
          // 当前是品牌名，准备切换到其他信息
          // 20% 概率显示日期，80% 显示时间
          const showDate = Math.random() < SIDEBAR_SHOW_DATE_PROBABILITY;
          nextText = showDate ? getCurrentDate() : getCurrentTime();
        } else {
          // 当前是时间或日期，切回品牌名
          nextText = 'NavHub';
        }

        setTargetText(nextText);
        setPhase('typing');
      }
    }

    return () => clearTimeout(timeout);
  }, [displayText, phase, targetText]);

  return (
    <aside
      className={cn(
        'fixed lg:static inset-y-0 left-0 z-30 transform transition-all duration-300 ease-in-out',
        sidebarWidthClass,
        'bg-white/40 dark:bg-slate-950/40 border-r border-slate-200/30 dark:border-white/5 backdrop-blur-2xl flex flex-col',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
      )}
    >
      {/* Header */}
      <div
        className={cn(
          'h-14 flex items-center justify-center border-b border-slate-100/60 dark:border-white/5 shrink-0 relative',
          isSidebarCollapsed ? 'px-2' : 'px-4',
        )}
      >
        <div
          className={`flex items-center ${isSidebarCollapsed ? 'w-full justify-center' : 'gap-2'}`}
        >
          {isSidebarCollapsed ? (
            <button
              onClick={onToggleCollapsed}
              className="h-9 w-9 rounded-xl bg-white/50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-white/10 flex items-center justify-center transition-all cursor-pointer shadow-sm hover:shadow-lg hover:shadow-accent/20 hover:border-accent/30 hover:bg-white dark:hover:bg-slate-800 hover:scale-105 active:scale-95 group"
              title={t('sidebar.expandSidebar')}
            >
              <span className="font-mono font-black text-xl text-slate-700 dark:text-slate-200 group-hover:text-accent transition-colors duration-300">
                N
              </span>
            </button>
          ) : (
            <div
              className="relative flex items-center justify-center font-mono font-bold text-lg cursor-pointer select-none group"
              title={navTitleText}
            >
              {/* Ghost element for layout sizing (holds the widest possible width) */}
              <div className="flex items-center opacity-0 pointer-events-none" aria-hidden="true">
                <span className="mr-1.5">~/</span>
                <span className="tracking-tight">NavHub</span>
                <span className="w-2.5 ml-1"></span>
              </div>

              {/* Visible animated content */}
              <div className="absolute left-0 top-1/2 -translate-y-1/2 flex items-center">
                <span className="text-accent mr-1.5">~/</span>
                <span className="text-slate-700 dark:text-slate-200 tracking-tight">
                  {displayText}
                </span>
                <span className="w-2.5 h-5 bg-accent ml-1 animate-pulse rounded-[2px] opacity-80 shadow-[0_0_8px_rgb(var(--accent-color)/0.6)]"></span>
              </div>
            </div>
          )}
        </div>

        {!isSidebarCollapsed && (
          <button
            onClick={onToggleCollapsed}
            className="hidden lg:inline-flex absolute right-2 p-1.5 text-slate-400 hover:text-accent hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/50 transition-colors"
            title={t('sidebar.collapseSidebar')}
            aria-label={t('sidebar.collapseSidebar')}
          >
            <ChevronLeft size={16} />
          </button>
        )}
      </div>

      {/* Categories - 减少顶部间距 */}
      <div
        className={cn(
          'flex-1 overflow-y-auto scrollbar-hide pt-2 pb-4',
          isSidebarCollapsed ? 'px-2' : 'px-3',
        )}
      >
        {/* All / Pinned */}
        <button
          onClick={onSelectAll}
          title={t('sidebar.pinnedSites')}
          className={`relative w-full rounded-xl transition-all duration-200 mb-1 group ${isSidebarCollapsed ? 'flex items-center justify-center p-2.5' : 'flex items-center gap-3 px-3 py-2.5'} ${
            selectedCategory === 'all'
              ? 'bg-gradient-to-r from-accent/20 via-accent/5 to-transparent text-accent shadow-sm border border-accent/10'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-slate-200 border border-transparent'
          }`}
        >
          {!isSidebarCollapsed && selectedCategory === 'all' && (
            <span className="absolute left-0.5 top-1/2 -translate-y-1/2 h-6 w-1 rounded-full bg-accent shadow-[0_0_8px_rgb(var(--accent-color)/0.4)]"></span>
          )}
          <div
            className={`flex items-center justify-center transition-colors ${isSidebarCollapsed ? 'p-2 rounded-lg' : 'p-1'} ${selectedCategory === 'all' ? 'text-accent' : 'text-slate-500 dark:text-slate-400'}`}
          >
            <Icon name="Pin" size={18} />
          </div>
          {!isSidebarCollapsed && (
            <>
              <span className="font-medium flex-1 text-left">{t('sidebar.pinnedSites')}</span>
              {linkCounts['pinned'] > 0 && (
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${selectedCategory === 'all' ? 'bg-accent/20 text-accent' : 'bg-slate-50 dark:bg-slate-800/50 text-slate-400 border border-slate-200/50 dark:border-slate-700/50'}`}
                >
                  {linkCounts['pinned']}
                </span>
              )}
            </>
          )}
        </button>

        {/* Category Header */}
        <div
          className={`flex items-center mt-4 mb-2 ${isSidebarCollapsed ? 'justify-center px-2' : 'justify-between px-3'}`}
        >
          {!isSidebarCollapsed && (
            <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              {t('sidebar.categoryDirectory')}
            </span>
          )}
          <button
            onClick={onOpenCategoryManager}
            className="p-1 text-slate-400 hover:text-accent hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md focus:outline-none focus:ring-2 focus:ring-accent/50 transition-colors"
            title={t('sidebar.manageCategories')}
          >
            <Settings size={13} />
          </button>
        </div>

        {/* Category List */}
        <div className="space-y-0.5">
          {categories
            .filter((cat) => isAdmin || !cat.hidden)
            .map((cat) => {
              const isSelected = selectedCategory === cat.id;
              const count = linkCounts[cat.id] || 0;
              return (
                <button
                  key={cat.id}
                  onClick={() => onSelectCategory(cat)}
                  title={isSidebarCollapsed ? cat.name : undefined}
                  className={`relative w-full rounded-xl transition-all duration-200 group ${
                    isSidebarCollapsed
                      ? 'flex items-center justify-center p-2.5'
                      : 'flex items-center gap-3 px-3 py-2'
                  } ${
                    isSelected
                      ? 'bg-gradient-to-r from-accent/20 via-accent/5 to-transparent text-accent shadow-sm border border-accent/10'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-slate-200 border border-transparent'
                  }`}
                >
                  {!isSidebarCollapsed && isSelected && (
                    <span className="absolute left-0.5 top-1/2 -translate-y-1/2 h-6 w-1 rounded-full bg-accent shadow-[0_0_8px_rgb(var(--accent-color)/0.4)]"></span>
                  )}
                  <div
                    className={`flex items-center justify-center transition-colors ${
                      isSidebarCollapsed ? 'p-2 rounded-lg' : 'p-1.5 rounded-md'
                    } ${isSelected ? 'text-accent' : 'text-slate-500 dark:text-slate-500'}`}
                  >
                    <Icon name={cat.icon} size={16} />
                  </div>
                  {!isSidebarCollapsed && (
                    <>
                      <span
                        className={`truncate flex-1 text-left text-sm ${isSelected ? 'font-medium' : ''}`}
                      >
                        {cat.name}
                        {isAdmin && cat.hidden && (
                          <span className="ml-1.5 text-[10px] text-amber-500">
                            ({t('sidebar.hidden')})
                          </span>
                        )}
                      </span>
                      {count > 0 && (
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold transition-all ${isSelected ? 'bg-accent/20 text-accent' : 'bg-slate-50 dark:bg-slate-800/50 text-slate-400 border border-slate-200/50 dark:border-slate-700/50 group-hover:bg-slate-100 dark:group-hover:bg-slate-700 group-hover:border-transparent'}`}
                        >
                          {count}
                        </span>
                      )}
                    </>
                  )}
                </button>
              );
            })}
        </div>
      </div>

      <div className="mt-auto">
        {isAdmin && privacyGroupEnabled && (
          <div className={`${isSidebarCollapsed ? 'px-2' : 'px-3'} pb-3`}>
            <button
              onClick={onSelectPrivate}
              title={t('sidebar.privacyGroup')}
              className={`relative w-full rounded-xl transition-all duration-200 group ${isSidebarCollapsed ? 'flex items-center justify-center p-2.5' : 'flex items-center gap-3 px-3 py-2.5'} ${
                selectedCategory === PRIVATE_CATEGORY_ID
                  ? 'bg-gradient-to-r from-accent/20 via-accent/5 to-transparent text-accent shadow-sm border border-accent/10'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-slate-200 border border-transparent'
              }`}
            >
              {!isSidebarCollapsed && selectedCategory === PRIVATE_CATEGORY_ID && (
                <span className="absolute left-0.5 top-1/2 -translate-y-1/2 h-6 w-1 rounded-full bg-accent shadow-[0_0_8px_rgb(var(--accent-color)/0.4)]"></span>
              )}
              <div
                className={`flex items-center justify-center transition-colors ${isSidebarCollapsed ? 'p-2 rounded-lg' : 'p-1'} ${selectedCategory === PRIVATE_CATEGORY_ID ? 'text-accent' : 'text-slate-500 dark:text-slate-400'}`}
              >
                <Icon name="Lock" size={18} />
              </div>
              {!isSidebarCollapsed && (
                <>
                  <span className="font-medium flex-1 text-left">{t('sidebar.privacyGroup')}</span>
                  {isPrivateUnlocked && privateCount > 0 && (
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${selectedCategory === PRIVATE_CATEGORY_ID ? 'bg-accent/20 text-accent' : 'bg-slate-50 dark:bg-slate-800/50 text-slate-400 border border-slate-200/50 dark:border-slate-700/50'}`}
                    >
                      {privateCount}
                    </span>
                  )}
                </>
              )}
            </button>
          </div>
        )}

        {!isSidebarCollapsed && (
          <div className="px-3 pb-4">
            <div className="flex w-full items-center justify-center">
              <a
                href={repoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
              >
                <Icon name="Github" size={14} />
                <span>{t('sidebar.viewOnGitHub')}</span>
              </a>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};

export default React.memo(Sidebar);
