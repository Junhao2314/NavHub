import {
  CheckCircle,
  GripVertical,
  LayoutGrid,
  List,
  Menu,
  Monitor,
  Moon,
  Search,
  Settings,
  Sun,
  X,
} from 'lucide-react';
import React, { useState } from 'react';
import { useI18n } from '../../hooks/useI18n';
import { useAppStore } from '../../stores/useAppStore';
import type { ExternalSearchSource, SearchMode } from '../../types';
import { buildFaviconExtractorUrlFromUrlInput } from '../../utils/faviconExtractor';

interface MainHeaderProps {
  canEdit: boolean;
  canSortPinned: boolean;
  canSortCategory: boolean;
  isSortingPinned: boolean;
  isSortingCategory: boolean;
  onSetTheme: (mode: 'light' | 'dark' | 'system') => void;
  onViewModeChange: (mode: 'simple' | 'detailed') => void;
  onSearchModeChange: (mode: SearchMode) => void;
  onOpenSearchConfig: () => void;
  onExternalSearch: () => void;
  onSearchSourceSelect: (source: ExternalSearchSource) => void;
  onToggleMobileSearch: () => void;
  onStartPinnedSorting: () => void;
  onStartCategorySorting: () => void;
  onSavePinnedSorting: () => void;
  onCancelPinnedSorting: () => void;
  onSaveCategorySorting: () => void;
  onCancelCategorySorting: () => void;
  onAddLink: () => void;
  onOpenSettings: () => void;
  onEditDisabled: () => void;
}

const FALLBACK_SEARCH_ICON_DATA_URI =
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNiIgaGVpZ2h0PSIxNiIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIGNsYXNzPSJsdWNpZGUgbHVjaWRlLXNlYXJjaCI+PHBhdGggZD0ibTIxIDIxLTQuMzQtNC4zNCI+PC9wYXRoPjxjaXJjbGUgY3g9IjExIiBjeT0iMTEiIHI9IjgiPjwvY2lyY2xlPjwvc3ZnPg==';

const MainHeader: React.FC<MainHeaderProps> = ({
  canEdit,
  canSortPinned,
  canSortCategory,
  isSortingPinned,
  isSortingCategory,
  onSetTheme,
  onViewModeChange,
  onSearchModeChange,
  onOpenSearchConfig,
  onExternalSearch,
  onSearchSourceSelect,
  onToggleMobileSearch,
  onStartPinnedSorting,
  onStartCategorySorting,
  onSavePinnedSorting,
  onCancelPinnedSorting,
  onSaveCategorySorting,
  onCancelCategorySorting,
  onAddLink,
  onOpenSettings,
  onEditDisabled,
}) => {
  const { t } = useI18n();
  const themeMode = useAppStore((s) => s.themeMode);
  const siteCardStyle = useAppStore((s) => s.siteSettings.cardStyle);
  const openSidebar = useAppStore((s) => s.openSidebar);

  const isMobileSearchOpen = useAppStore((s) => s.isMobileSearchOpen);
  const searchMode = useAppStore((s) => s.searchMode);
  const searchQuery = useAppStore((s) => s.searchQuery);
  const externalSearchSources = useAppStore((s) => s.externalSearchSources);
  const hoveredSearchSource = useAppStore((s) => s.hoveredSearchSource);
  const selectedSearchSource = useAppStore((s) => s.selectedSearchSource);
  const showSearchSourcePopup = useAppStore((s) => s.showSearchSourcePopup);

  const setShowSearchSourcePopup = useAppStore((s) => s.setShowSearchSourcePopup);
  const setSearchQuery = useAppStore((s) => s.setSearchQuery);
  const setHoveredSearchSource = useAppStore((s) => s.setHoveredSearchSource);
  const setIsIconHovered = useAppStore((s) => s.setIsIconHovered);
  const setIsPopupHovered = useAppStore((s) => s.setIsPopupHovered);

  const editDisabledHint = t('admin.editDisabledHint');
  const showSortControls = canSortPinned || canSortCategory || isSortingPinned || isSortingCategory;
  const sortLabel = canSortPinned ? t('header.sortPinned') : t('header.sortCategory');
  const isSorting = isSortingPinned || isSortingCategory;
  const activeSearchSource = hoveredSearchSource ?? selectedSearchSource;

  const [showThemeMenu, setShowThemeMenu] = useState(false);
  const searchInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // ESC 键关闭主题菜单
  React.useEffect(() => {
    if (!showThemeMenu) return;

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowThemeMenu(false);
      }
    };

    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [showThemeMenu]);

  const searchBar = (
    <div className="relative w-full group">
      {searchMode === 'external' && showSearchSourcePopup && (
        <div
          className="absolute left-0 top-full mt-2 w-full bg-white/95 dark:bg-slate-900/95 rounded-xl shadow-xl border border-slate-200/50 dark:border-white/10 p-3 z-50 backdrop-blur-xl"
          onMouseEnter={() => setIsPopupHovered(true)}
          onMouseLeave={() => setIsPopupHovered(false)}
        >
          <div className="grid grid-cols-5 sm:grid-cols-5 gap-1.5">
            {externalSearchSources
              .filter((source) => source.enabled)
              .map((source) => (
                <button
                  key={source.id}
                  onClick={() => onSearchSourceSelect(source)}
                  onMouseEnter={() => setHoveredSearchSource(source)}
                  onMouseLeave={() => setHoveredSearchSource(null)}
                  className={`px-2 py-2.5 text-sm rounded-lg transition-all flex flex-col items-center gap-1.5 ${
                    selectedSearchSource?.id === source.id
                      ? 'bg-accent/15 text-accent'
                      : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                    <img
                      src={
                        buildFaviconExtractorUrlFromUrlInput(source.url) ||
                        FALLBACK_SEARCH_ICON_DATA_URI
                      }
                      alt={source.name}
                      className="w-4 h-4"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.src = FALLBACK_SEARCH_ICON_DATA_URI;
                      }}
                    />
                  </div>
                  <span className="truncate text-xs hidden sm:block">{source.name}</span>
                </button>
              ))}
          </div>
        </div>
      )}

      <div className="flex items-center h-11 rounded-2xl border border-slate-200/80 dark:border-slate-700/50 bg-white/80 dark:bg-slate-900/50 shadow-sm hover:shadow-md transition-all duration-300 backdrop-blur-md group-focus-within:ring-2 group-focus-within:ring-accent/20 group-focus-within:border-accent/50 group-focus-within:bg-white dark:group-focus-within:bg-slate-900 group-focus-within:shadow-xl group-focus-within:-translate-y-0.5">
        <div className="flex items-center gap-1 pl-1.5 py-1">
          <button
            onClick={() => onSearchModeChange('internal')}
            className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
              searchMode === 'internal'
                ? 'bg-white dark:bg-slate-800 text-accent shadow-sm ring-1 ring-slate-200 dark:ring-slate-700'
                : 'text-slate-500 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-800/50'
            }`}
            title={t('header.internalSearchTitle')}
          >
            {t('header.internalSearch')}
          </button>
          <button
            onClick={() => onSearchModeChange('external')}
            className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
              searchMode === 'external'
                ? 'bg-white dark:bg-slate-800 text-accent shadow-sm ring-1 ring-slate-200 dark:ring-slate-700'
                : 'text-slate-500 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-800/50'
            }`}
            title={t('header.externalSearchTitle')}
          >
            {t('header.externalSearch')}
          </button>
        </div>

        {/* Vertical Separator */}
        <div className="h-5 w-px bg-slate-200 dark:bg-slate-700 mx-2"></div>

        <div className="relative flex-1">
          <button
            type="button"
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 hover:text-accent transition-colors"
            onMouseEnter={() => searchMode === 'external' && setIsIconHovered(true)}
            onMouseLeave={() => setIsIconHovered(false)}
            onClick={() => {
              if (searchMode === 'external') {
                setShowSearchSourcePopup((prev) => !prev);
              }
            }}
            title={
              searchMode === 'external'
                ? t('header.selectSearchSource')
                : t('header.internalSearchTitle')
            }
          >
            {searchMode === 'internal' ? (
              <Search size={15} />
            ) : activeSearchSource ? (
              <img
                src={
                  buildFaviconExtractorUrlFromUrlInput(activeSearchSource.url) ||
                  FALLBACK_SEARCH_ICON_DATA_URI
                }
                alt={activeSearchSource.name}
                className="w-4 h-4"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.src = FALLBACK_SEARCH_ICON_DATA_URI;
                }}
              />
            ) : (
              <Search size={15} />
            )}
          </button>

          <input
            ref={searchInputRef}
            type="text"
            placeholder={
              searchMode === 'internal'
                ? t('header.searchPlaceholder')
                : selectedSearchSource
                  ? t('header.searchInSource', { source: selectedSearchSource.name })
                  : t('header.searchExternalPlaceholder')
            }
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && searchMode === 'external') {
                onExternalSearch();
              }
            }}
            className="w-full h-full pl-10 pr-20 bg-transparent text-sm text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 outline-none focus:ring-0"
            style={{ fontSize: '14px' }}
            inputMode="search"
            enterKeyHint="search"
            aria-label={
              searchMode === 'internal'
                ? t('header.internalSearchTitle')
                : t('header.externalSearchTitle')
            }
          />

          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2 pointer-events-none select-none">
            <kbd className="hidden md:inline-flex h-5 items-center gap-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-1.5 font-mono text-[10px] font-medium text-slate-500 dark:text-slate-400 border-b-2">
              <span className="text-xs">⌘</span>K
            </kbd>
          </div>
        </div>

        {searchMode === 'external' && (
          <button
            onClick={canEdit ? onOpenSearchConfig : onEditDisabled}
            className={`px-3 transition-colors ${
              canEdit
                ? 'text-slate-400 hover:text-accent'
                : 'text-slate-400 opacity-60 cursor-not-allowed'
            }`}
            title={canEdit ? t('header.manageSearchSources') : editDisabledHint}
            aria-label={t('header.manageSearchSources')}
            aria-disabled={!canEdit}
          >
            <Settings size={14} />
          </button>
        )}
      </div>
    </div>
  );

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/30 dark:border-white/5 bg-white/40 dark:bg-slate-950/40 backdrop-blur-2xl">
      <div className="h-14 px-4 lg:px-8 flex items-center gap-4">
        <div className="flex items-center gap-2">
          <button
            onClick={openSidebar}
            className="lg:hidden p-2 -ml-2 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            aria-label={t('header.openMenu')}
          >
            <Menu size={20} />
          </button>
        </div>

        <div className="flex-1 hidden md:flex justify-center">
          <div className="w-full max-w-xl transition-all duration-300 ease-out focus-within:max-w-2xl">
            {searchBar}
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* Mobile Search Toggle */}
          <button
            onClick={onToggleMobileSearch}
            className="md:hidden p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-accent/50"
            title={t('common.search')}
            aria-label={t('header.toggleSearch')}
          >
            <Search size={18} />
          </button>

          {/* View Mode Toggles (Desktop) */}
          <div className="hidden md:flex items-center p-1 rounded-xl bg-white/50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/50 mr-2 backdrop-blur-sm">
            <button
              onClick={() => onViewModeChange('simple')}
              className={`p-1.5 rounded-lg transition-all ${
                siteCardStyle === 'simple'
                  ? 'bg-white dark:bg-slate-700 text-accent shadow-sm ring-1 ring-black/5 dark:ring-white/10'
                  : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100/50 dark:hover:bg-slate-700/50'
              }`}
              title={t('header.simpleView')}
              aria-label={t('header.simpleView')}
              aria-pressed={siteCardStyle === 'simple'}
            >
              <List size={16} />
            </button>
            <button
              onClick={() => onViewModeChange('detailed')}
              className={`p-1.5 rounded-lg transition-all ${
                siteCardStyle === 'detailed'
                  ? 'bg-white dark:bg-slate-700 text-accent shadow-sm ring-1 ring-black/5 dark:ring-white/10'
                  : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100/50 dark:hover:bg-slate-700/50'
              }`}
              title={t('header.detailedView')}
              aria-label={t('header.detailedView')}
              aria-pressed={siteCardStyle === 'detailed'}
            >
              <LayoutGrid size={16} />
            </button>
          </div>

          {/* Sort Controls */}
          {showSortControls &&
            (isSorting ? (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm animate-in fade-in zoom-in-95 duration-200">
                <span className="text-xs font-bold text-slate-600 dark:text-slate-300 whitespace-nowrap">
                  {t('header.sorting')}
                </span>
                <div className="w-px h-3 bg-slate-200 dark:bg-slate-700 mx-1"></div>
                <button
                  onClick={
                    canEdit
                      ? isSortingPinned
                        ? onSavePinnedSorting
                        : onSaveCategorySorting
                      : onEditDisabled
                  }
                  className={`p-1 rounded-full transition-all ${
                    canEdit
                      ? 'text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 hover:scale-105'
                      : 'text-green-600 opacity-60 cursor-not-allowed'
                  }`}
                  title={canEdit ? t('header.saveSorting') : editDisabledHint}
                  aria-label={t('header.saveSorting')}
                  aria-disabled={!canEdit}
                >
                  <CheckCircle size={16} />
                </button>
                <button
                  onClick={
                    canEdit
                      ? isSortingPinned
                        ? onCancelPinnedSorting
                        : onCancelCategorySorting
                      : onEditDisabled
                  }
                  className={`p-1 rounded-full transition-all ${
                    canEdit
                      ? 'text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 hover:scale-105'
                      : 'text-slate-400 opacity-60 cursor-not-allowed'
                  }`}
                  title={canEdit ? t('header.cancelSorting') : editDisabledHint}
                  aria-label={t('header.cancelSorting')}
                  aria-disabled={!canEdit}
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <button
                onClick={
                  canEdit
                    ? canSortPinned
                      ? onStartPinnedSorting
                      : onStartCategorySorting
                    : onEditDisabled
                }
                className={`p-2 rounded-xl transition-all border border-transparent ${
                  canEdit
                    ? 'text-slate-500 hover:text-accent hover:bg-slate-100 dark:hover:bg-slate-800 hover:border-slate-200/50 dark:hover:border-white/5'
                    : 'text-slate-500 opacity-60 cursor-not-allowed'
                }`}
                title={canEdit ? sortLabel : editDisabledHint}
                aria-label={t('header.startSorting')}
                aria-disabled={!canEdit}
              >
                <GripVertical size={18} />
              </button>
            ))}

          {/* Theme Toggle */}
          {/* Settings Group */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-white/50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/50 mr-2 backdrop-blur-sm">
            {/* Theme Dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowThemeMenu(!showThemeMenu)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-accent hover:bg-slate-100 dark:hover:bg-slate-700 transition-all"
                title={t('header.switchTheme')}
                aria-label={t('header.switchTheme')}
                aria-expanded={showThemeMenu}
                aria-haspopup="menu"
              >
                {themeMode === 'system' ? (
                  <Monitor size={16} />
                ) : themeMode === 'dark' ? (
                  <Moon size={16} />
                ) : (
                  <Sun size={16} />
                )}
              </button>

              {showThemeMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowThemeMenu(false)} />
                  <div
                    className="absolute right-0 top-full mt-2 w-36 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200"
                    role="menu"
                    aria-label={t('header.switchTheme')}
                  >
                    <button
                      onClick={() => {
                        onSetTheme('light');
                        setShowThemeMenu(false);
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm transition-colors ${
                        themeMode === 'light'
                          ? 'bg-accent/10 text-accent font-medium'
                          : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                      }`}
                      role="menuitem"
                      aria-current={themeMode === 'light' ? 'true' : undefined}
                    >
                      <Sun size={16} />
                      <span>{t('header.lightMode')}</span>
                    </button>
                    <button
                      onClick={() => {
                        onSetTheme('dark');
                        setShowThemeMenu(false);
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm transition-colors ${
                        themeMode === 'dark'
                          ? 'bg-accent/10 text-accent font-medium'
                          : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                      }`}
                      role="menuitem"
                      aria-current={themeMode === 'dark' ? 'true' : undefined}
                    >
                      <Moon size={16} />
                      <span>{t('header.darkMode')}</span>
                    </button>
                    <button
                      onClick={() => {
                        onSetTheme('system');
                        setShowThemeMenu(false);
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm transition-colors ${
                        themeMode === 'system'
                          ? 'bg-accent/10 text-accent font-medium'
                          : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                      }`}
                      role="menuitem"
                      aria-current={themeMode === 'system' ? 'true' : undefined}
                    >
                      <Monitor size={16} />
                      <span>{t('header.systemMode')}</span>
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Settings Toggle */}
            <button
              onClick={onOpenSettings}
              className="p-1.5 rounded-lg text-slate-400 hover:text-accent hover:bg-slate-100 dark:hover:bg-slate-700 transition-all"
              title={t('header.systemSettings')}
              aria-label={t('header.systemSettings')}
            >
              <Settings size={16} />
            </button>
          </div>

          {/* Add Link - Primary Action */}
          <button
            onClick={canEdit ? onAddLink : onEditDisabled}
            className={`relative overflow-hidden group flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl transition-all duration-200 ${
              canEdit
                ? 'bg-gradient-to-r from-accent to-accent/80 hover:from-accent hover:to-accent/90 text-white shadow-lg shadow-accent/20 hover:shadow-accent/30 active:scale-95'
                : 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed opacity-70'
            }`}
            title={canEdit ? t('header.addLink') : editDisabledHint}
            aria-disabled={!canEdit}
          >
            {canEdit && (
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent w-full h-full animate-shimmer-slow pointer-events-none" />
            )}
            <span className="relative z-10 flex items-center gap-0.5">
              <span className="text-lg leading-none">+</span>{' '}
              <span className="hidden sm:inline">{t('common.add')}</span>
            </span>
          </button>
        </div>
      </div>

      {isMobileSearchOpen && <div className="md:hidden px-4 pb-3">{searchBar}</div>}
    </header>
  );
};

export default React.memo(MainHeader);
