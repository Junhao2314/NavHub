import React from 'react';
import { createPortal } from 'react-dom';
import { DndContext, DragEndEvent, closestCorners, SensorDescriptor } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable';
import { Pin, Trash2, CheckSquare, Upload, Search, X, RefreshCw } from 'lucide-react';
import { Category, LinkItem } from '../../types';
import { PRIVATE_CATEGORY_ID } from '../../utils/constants';
import Icon from '../ui/Icon';
import LinkCard from '../ui/LinkCard';
import SortableLinkCard from '../ui/SortableLinkCard';
import { useDialog } from '../ui/DialogProvider';

interface HitokotoPayload {
  hitokoto: string;
  from?: string;
  from_who?: string | null;
}

const HITOKOTO_CACHE_KEY = 'ynav_hitokoto_cache_v1';

const getTodayKey = () => {
  return new Date().toLocaleDateString('sv-SE');
};

interface LinkSectionsProps {
  linksCount: number;
  pinnedLinks: LinkItem[];
  displayedLinks: LinkItem[];
  selectedCategory: string;
  searchQuery: string;
  categories: Category[];
  siteTitle: string;
  siteCardStyle: 'detailed' | 'simple';
  isSortingPinned: boolean;
  isSortingMode: string | null;
  isBatchEditMode: boolean;
  selectedLinksCount: number;
  selectedLinks: Set<string>;
  sensors: SensorDescriptor<any>[];
  onPinnedDragEnd: (event: DragEndEvent) => void;
  onDragEnd: (event: DragEndEvent) => void;
  onToggleBatchEditMode: () => void;
  onBatchDelete: () => void;
  onBatchPin: () => void;
  onSelectAll: () => void;
  onBatchMove: (targetCategoryId: string) => void;
  onAddLink: () => void;
  onLinkOpen: (link: LinkItem) => void;
  onLinkSelect: (id: string) => void;
  onLinkContextMenu: (e: React.MouseEvent, link: LinkItem) => void;
  onLinkEdit: (link: LinkItem) => void;
  isPrivateUnlocked: boolean;
  onPrivateUnlock: (password?: string) => Promise<boolean>;
  privateUnlockHint: string;
  privateUnlockSubHint?: string;
}

const ClockWidget: React.FC = () => {
  const [time, setTime] = React.useState(new Date());

  React.useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' });
  };

  return (
    <div className="flex flex-col items-end pointer-events-none select-none">
      <div className="text-4xl font-mono font-bold text-slate-800 dark:text-slate-100 tracking-tight leading-none bg-clip-text text-transparent bg-gradient-to-br from-slate-700 to-slate-900 dark:from-white dark:to-slate-400">
        {formatTime(time)}
      </div>
      <div className="text-xs font-medium text-accent mt-1 opacity-80">
        {formatDate(time)}
      </div>
    </div>
  );
};

const LinkSections: React.FC<LinkSectionsProps> = ({
  linksCount,
  pinnedLinks,
  displayedLinks,
  selectedCategory,
  searchQuery,
  categories,
  siteTitle,
  siteCardStyle,
  isSortingPinned,
  isSortingMode,
  isBatchEditMode,
  selectedLinksCount,
  selectedLinks,
  sensors,
  onPinnedDragEnd,
  onDragEnd,
  onToggleBatchEditMode,
  onBatchDelete,
  onBatchPin,
  onSelectAll,
  onBatchMove,
  onAddLink,
  onLinkOpen,
  onLinkSelect,
  onLinkContextMenu,
  onLinkEdit,
  isPrivateUnlocked,
  onPrivateUnlock,
  privateUnlockHint,
  privateUnlockSubHint
}) => {
  const isPrivateCategory = selectedCategory === PRIVATE_CATEGORY_ID;
  const showPinnedSection = pinnedLinks.length > 0 && !searchQuery && (selectedCategory === 'all');
  const showMainSection = (selectedCategory !== 'all' || searchQuery);
  const isSimpleView = siteCardStyle === 'simple';
  const gridClassName = isSimpleView
    ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6'
    : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';
  const gridGap = isSimpleView ? 'gap-2.5' : 'gap-4';
  const { notify } = useDialog();
  const [hitokoto, setHitokoto] = React.useState<HitokotoPayload | null>(null);
  const [isHitokotoLoading, setIsHitokotoLoading] = React.useState(false);
  const hitokotoFetchingRef = React.useRef(false);
  const moveMenuButtonRef = React.useRef<HTMLButtonElement | null>(null);
  const moveMenuCloseTimeoutRef = React.useRef<number | null>(null);
  const [moveMenuOpen, setMoveMenuOpen] = React.useState(false);
  const [moveMenuPosition, setMoveMenuPosition] = React.useState({ top: 0, left: 0 });
  const [privatePassword, setPrivatePassword] = React.useState('');
  const [privateUnlockError, setPrivateUnlockError] = React.useState<string | null>(null);
  const [isPrivateUnlocking, setIsPrivateUnlocking] = React.useState(false);

  React.useEffect(() => {
    if (!isPrivateCategory) {
      setPrivatePassword('');
      setPrivateUnlockError(null);
      setIsPrivateUnlocking(false);
    }
  }, [isPrivateCategory]);

  const handlePrivateUnlock = React.useCallback(async () => {
    setIsPrivateUnlocking(true);
    setPrivateUnlockError(null);
    try {
      const success = await onPrivateUnlock(privatePassword);
      if (!success) {
        setPrivateUnlockError('瑙ｉ攣澶辫触锛岃妫€鏌ュ瘑鐮?);
      } else {
        setPrivatePassword('');
      }
    } finally {
      setIsPrivateUnlocking(false);
    }
  }, [onPrivateUnlock, privatePassword]);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 6) return '鍑屾櫒濂?;
    if (hour < 11) return '涓婂崍濂?;
    if (hour < 14) return '涓崍濂?;
    if (hour < 19) return '涓嬪崍濂?;
    return '鏅氫笂濂?;
  };

  const readHitokotoCache = () => {
    if (typeof window === 'undefined') return null;
    try {
      const raw = window.localStorage.getItem(HITOKOTO_CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { date?: string; data?: HitokotoPayload };
      if (!parsed?.date || !parsed?.data?.hitokoto) return null;
      return parsed;
    } catch {
      return null;
    }
  };

  const writeHitokotoCache = (payload: HitokotoPayload) => {
    if (typeof window === 'undefined') return;
    const cache = { date: getTodayKey(), data: payload };
    window.localStorage.setItem(HITOKOTO_CACHE_KEY, JSON.stringify(cache));
  };

  const fetchHitokoto = React.useCallback(async (notifyOnError = false) => {
    if (hitokotoFetchingRef.current) return;
    hitokotoFetchingRef.current = true;
    setIsHitokotoLoading(true);
    try {
      const response = await fetch('https://v1.hitokoto.cn');
      if (!response.ok) {
        throw new Error(`Hitokoto request failed: ${response.status}`);
      }
      const payload = (await response.json()) as HitokotoPayload;
      if (!payload?.hitokoto) {
        throw new Error('Hitokoto payload missing text');
      }
      const normalized = {
        hitokoto: payload.hitokoto,
        from: payload.from,
        from_who: payload.from_who ?? null
      };
      setHitokoto(normalized);
      writeHitokotoCache(normalized);
    } catch (error) {
      if (notifyOnError) {
        notify('鑾峰彇涓€瑷€澶辫触锛岃绋嶅悗鍐嶈瘯銆?, 'warning');
      }
    } finally {
      hitokotoFetchingRef.current = false;
      setIsHitokotoLoading(false);
    }
  }, [notify]);

  React.useEffect(() => {
    const cache = readHitokotoCache();
    const todayKey = getTodayKey();
    if (cache?.data) {
      setHitokoto(cache.data);
    }
    if (!cache || cache.date !== todayKey) {
      fetchHitokoto(false);
    }
  }, [fetchHitokoto]);

  const hitokotoAuthor = React.useMemo(() => {
    if (!hitokoto) return '';
    const from = hitokoto.from?.trim();
    const fromWho = hitokoto.from_who?.trim();
    if (from && fromWho) return `${from} 路 ${fromWho}`;
    if (from) return from;
    if (fromWho) return fromWho;
    return '浣氬悕';
  }, [hitokoto]);

  const hitokotoText = hitokoto?.hitokoto?.trim() || '';
  const activeCategory = React.useMemo(() => {
    if (isPrivateCategory) {
      return { name: '闅愮鍒嗙粍', icon: 'Lock' };
    }
    return categories.find((c) => c.id === selectedCategory) || null;
  }, [categories, isPrivateCategory, selectedCategory]);

  const handleCopyHitokoto = async () => {
    if (!hitokotoText) return;
    const textToCopy = hitokotoAuthor ? `${hitokotoText} 鈥?${hitokotoAuthor}` : hitokotoText;
    try {
      await navigator.clipboard.writeText(textToCopy);
      notify('宸插鍒跺埌鍓创鏉?, 'success');
    } catch (error) {
      notify('澶嶅埗澶辫触锛岃鎵嬪姩澶嶅埗銆?, 'warning');
    }
  };

  const updateMoveMenuPosition = React.useCallback(() => {
    if (typeof window === 'undefined') return;
    const trigger = moveMenuButtonRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const menuWidth = 176;
    const padding = 8;
    const left = Math.max(
      padding,
      Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - padding)
    );
    const top = rect.bottom + 8;
    setMoveMenuPosition({ top, left });
  }, []);

  const openMoveMenu = React.useCallback(() => {
    if (moveMenuCloseTimeoutRef.current) {
      window.clearTimeout(moveMenuCloseTimeoutRef.current);
      moveMenuCloseTimeoutRef.current = null;
    }
    updateMoveMenuPosition();
    setMoveMenuOpen(true);
  }, [updateMoveMenuPosition]);

  const scheduleCloseMoveMenu = React.useCallback(() => {
    if (moveMenuCloseTimeoutRef.current) {
      window.clearTimeout(moveMenuCloseTimeoutRef.current);
    }
    moveMenuCloseTimeoutRef.current = window.setTimeout(() => {
      setMoveMenuOpen(false);
    }, 120);
  }, []);

  const cancelCloseMoveMenu = React.useCallback(() => {
    if (moveMenuCloseTimeoutRef.current) {
      window.clearTimeout(moveMenuCloseTimeoutRef.current);
      moveMenuCloseTimeoutRef.current = null;
    }
  }, []);

  const handleBatchMoveSelect = React.useCallback((targetCategoryId: string) => {
    onBatchMove(targetCategoryId);
    setMoveMenuOpen(false);
  }, [onBatchMove]);

  React.useEffect(() => {
    if (!moveMenuOpen) return;
    const handleReposition = () => updateMoveMenuPosition();
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);
    return () => {
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [moveMenuOpen, updateMoveMenuPosition]);

  React.useEffect(() => {
    if (!isBatchEditMode) {
      setMoveMenuOpen(false);
    }
  }, [isBatchEditMode]);

  return (
    <div className="flex-1 overflow-y-auto px-4 lg:px-8 pb-0 scrollbar-hide">
      {/* Content wrapper with max-width - Added min-h and flex to push footer to bottom */}
      <div className="max-w-[1600px] mx-auto min-h-full flex flex-col">


        {/* Dashboard Header / Greeting */}
        {!searchQuery && selectedCategory === 'all' && (
          <div className="pt-8 pb-4 flex items-end justify-between">
            <div>
              <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100 mb-1">
                {getGreeting()}锛?span className="text-accent">{siteTitle}</span>
              </h1>
              <p className="text-slate-500 dark:text-slate-400 text-sm">
                鍑嗗寮€濮嬮珮鏁堢殑涓€澶╀簡鍚楋紵
              </p>
            </div>
            {/* Clock Widget */}
            <div className="hidden sm:block text-right">
              <ClockWidget />
            </div>
          </div>
        )}

        {/* Pinned Section */}
        {showPinnedSection && (
          <section className="pt-6">
            {/* Section Header with Stats Badge */}
            <div className="relative z-30 flex items-center justify-between mb-6 pb-4 border-b border-slate-200/50 dark:border-white/5">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-accent/10">
                  <Pin size={16} className="text-accent" />
                </div>
                <h2 className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-700 to-slate-900 dark:from-slate-100 dark:to-slate-400">
                  缃《 / 甯哥敤
                </h2>
              </div>
              {/* Stats as badge */}
              <div className="flex items-center gap-3 text-xs text-slate-400 dark:text-slate-500">
                <span className="px-2 py-1 rounded-full bg-slate-100 dark:bg-slate-800">{linksCount} 绔欑偣</span>
                <span className="px-2 py-1 rounded-full bg-slate-100 dark:bg-slate-800">{categories.length} 鍒嗙被</span>
                <span className="px-2 py-1 rounded-full bg-accent/10 dark:bg-accent/20 text-accent">{pinnedLinks.length} 缃《</span>
              </div>
            </div>

            {isSortingPinned ? (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCorners}
                onDragEnd={onPinnedDragEnd}
              >
                <SortableContext
                  items={pinnedLinks.map((link) => link.id)}
                  strategy={rectSortingStrategy}
                >
                  <div className={`grid ${gridGap} ${gridClassName}`}>
                    {pinnedLinks.map((link) => (
                      <SortableLinkCard
                        key={link.id}
                        link={link}
                        siteCardStyle={siteCardStyle}
                        isSortingMode={false}
                        isSortingPinned={isSortingPinned}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            ) : (
              <div className={`grid ${gridGap} ${gridClassName}`}>
                {pinnedLinks.map((link) => (
                  <LinkCard
                    key={link.id}
                    link={link}
                    siteCardStyle={siteCardStyle}
                    isBatchEditMode={isBatchEditMode}
                    isSelected={selectedLinks.has(link.id)}
                    onSelect={onLinkSelect}
                    onContextMenu={onLinkContextMenu}
                    onEdit={onLinkEdit}
                    onOpenLink={onLinkOpen}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {/* Main Section */}
        {showMainSection && (
          <section className="pt-6">
            {/* Section Header */}
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-200/50 dark:border-white/5">
              <div className="flex items-center gap-3">
                {selectedCategory !== 'all' && (
                  <div className="p-2 rounded-lg bg-accent/10">
                    <Icon name={activeCategory?.icon || 'Folder'} size={16} className="text-accent" />
                  </div>
                )}
                <h2 className="text-base font-semibold text-slate-700 dark:text-slate-200">
                  {selectedCategory === 'all'
                    ? (searchQuery ? '鎼滅储缁撴灉' : '鎵€鏈夐摼鎺?)
                    : (activeCategory?.name || '鏈懡鍚嶅垎绫?)
                  }
                </h2>
                {displayedLinks.length > 0 && (
                  <span className="px-2 py-0.5 text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-full">
                    {displayedLinks.length}
                  </span>
                )}
              </div>

              {/* Batch Edit Controls */}
              {selectedCategory !== 'all' && !isSortingMode && !isPrivateCategory && (
                <div className="flex items-center gap-2">
                  {!isBatchEditMode ? (
                    <button
                      onClick={onToggleBatchEditMode}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full transition-all focus:outline-none focus:ring-2 focus:ring-offset-1 border border-slate-200/60 dark:border-slate-700/60 text-slate-600 dark:text-slate-400 hover:text-accent hover:border-accent/50 focus:ring-accent/50 bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm"
                      title="鎵归噺缂栬緫"
                    >
                      鎵归噺缂栬緫
                    </button>
                  ) : (
                    <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-full bg-white/70 dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-700/60 shadow-sm backdrop-blur-sm">
                      <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        鎵归噺缂栬緫
                      </span>
                      <span className="text-xs text-slate-400 dark:text-slate-500 whitespace-nowrap">
                        宸查€?{selectedLinksCount}
                      </span>
                      <div className="w-px h-3 bg-slate-200 dark:bg-slate-700 mx-1"></div>
                      <button
                        onClick={onBatchPin}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-accent hover:bg-accent/10 transition-colors"
                        title="鎵归噺缃《"
                      >
                        <Pin size={13} />
                        <span>缃《</span>
                      </button>
                      <button
                        onClick={onBatchDelete}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                        title="鎵归噺鍒犻櫎"
                      >
                        <Trash2 size={13} />
                        <span>鍒犻櫎</span>
                      </button>
                      <button
                        onClick={onSelectAll}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100/70 dark:hover:bg-slate-700/60 transition-colors"
                        title="鍏ㄩ€?鍙栨秷鍏ㄩ€?
                      >
                        <CheckSquare size={13} />
                        <span>{selectedLinksCount === displayedLinks.length ? '鍙栨秷鍏ㄩ€? : '鍏ㄩ€?}</span>
                      </button>
                      <div
                        className="relative"
                        onMouseEnter={openMoveMenu}
                        onMouseLeave={scheduleCloseMoveMenu}
                      >
                        <button
                          ref={moveMenuButtonRef}
                          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100/70 dark:hover:bg-slate-700/60 transition-colors"
                          title="鎵归噺绉诲姩"
                        >
                          <Upload size={13} />
                          <span>绉诲姩</span>
                        </button>
                      </div>
                      <button
                        onClick={onToggleBatchEditMode}
                        className="p-1.5 rounded-full text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                        title="閫€鍑烘壒閲忕紪杈?
                      >
                        <X size={14} />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {isPrivateCategory && !isPrivateUnlocked ? (
              <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                <div className="p-4 rounded-full bg-slate-100 dark:bg-slate-800 mb-4">
                  <Icon name="Lock" size={28} className="text-slate-400" />
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-300">{privateUnlockHint}</p>
                {privateUnlockSubHint && (
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">{privateUnlockSubHint}</p>
                )}
                <div className="mt-4 w-full max-w-xs">
                  <input
                    type="password"
                    value={privatePassword}
                    onChange={(e) => setPrivatePassword(e.target.value)}
                    placeholder="璇疯緭鍏ュ瘑鐮?
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handlePrivateUnlock();
                      }
                    }}
                  />
                  {privateUnlockError && (
                    <div className="mt-2 text-xs text-red-600 dark:text-red-400">{privateUnlockError}</div>
                  )}
                  <button
                    type="button"
                    onClick={handlePrivateUnlock}
                    disabled={isPrivateUnlocking}
                    className="mt-3 w-full px-3 py-2 rounded-lg text-sm font-semibold bg-accent text-white hover:bg-accent/90 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {isPrivateUnlocking ? '瑙ｉ攣涓?..' : '瑙ｉ攣'}
                  </button>
                </div>
              </div>
            ) : (
              displayedLinks.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                  <div className="p-4 rounded-full bg-slate-100 dark:bg-slate-800 mb-4">
                    <Search size={32} className="opacity-40" />
                  </div>
                  <p className="text-sm">娌℃湁鎵惧埌鐩稿叧鍐呭</p>
                  {selectedCategory !== 'all' && (
                    <button onClick={onAddLink} className="mt-4 text-sm text-accent hover:underline focus:outline-none focus:ring-2 focus:ring-accent/50 rounded">娣诲姞涓€涓?</button>
                  )}
                </div>
              ) : (
                isSortingMode === selectedCategory ? (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCorners}
                    onDragEnd={onDragEnd}
                  >
                    <SortableContext
                      items={displayedLinks.map((link) => link.id)}
                      strategy={rectSortingStrategy}
                    >
                      <div className={`grid ${gridGap} ${gridClassName}`}>
                        {displayedLinks.map((link) => (
                          <SortableLinkCard
                            key={link.id}
                            link={link}
                            siteCardStyle={siteCardStyle}
                            isSortingMode={true}
                            isSortingPinned={false}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                ) : (
                  <div className={`grid ${gridGap} ${gridClassName}`}>
                    {displayedLinks.map((link) => (
                      <LinkCard
                        key={link.id}
                        link={link}
                        siteCardStyle={siteCardStyle}
                        isBatchEditMode={isBatchEditMode}
                        isSelected={selectedLinks.has(link.id)}
                        onSelect={onLinkSelect}
                        onContextMenu={onLinkContextMenu}
                        onEdit={onLinkEdit}
                        onOpenLink={onLinkOpen}
                      />
                    ))}
                  </div>
                )
              )
            )}
          </section>
        )}

        {/* Footer - Pushed to bottom */}
        <footer className="mt-auto pt-6 pb-3 flex justify-center animate-in fade-in duration-700 delay-300">
          <div className="flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
            <button
              type="button"
              onClick={handleCopyHitokoto}
              className="flex min-w-0 max-w-[70vw] items-center gap-1.5 text-left hover:text-slate-500 dark:hover:text-slate-300 transition-colors"
              title={hitokotoText || '涓€瑷€鑾峰彇涓?}
              aria-label="鐐瑰嚮澶嶅埗涓€瑷€"
            >
              <span className="truncate">
                {hitokotoText || (isHitokotoLoading ? '涓€瑷€鑾峰彇涓€? : '鐐瑰嚮鍒锋柊鑾峰彇涓€瑷€')}
              </span>
              {hitokotoText && (
                <span className="shrink-0 text-slate-400/80 dark:text-slate-500">
                  鈥?{hitokotoAuthor}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => fetchHitokoto(true)}
              className="h-6 w-6 inline-flex items-center justify-center rounded-full text-slate-400 hover:text-slate-500 transition-colors disabled:opacity-60"
              title="鍒锋柊涓€瑷€"
              aria-label="鍒锋柊涓€瑷€"
              disabled={isHitokotoLoading}
            >
              <RefreshCw size={13} className={isHitokotoLoading ? 'animate-spin' : ''} />
            </button>
          </div>
        </footer>
      </div>
      {moveMenuOpen && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed z-[70] w-44 bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200/60 dark:border-slate-700/60 overflow-hidden"
          style={{ top: moveMenuPosition.top, left: moveMenuPosition.left }}
          onMouseEnter={cancelCloseMoveMenu}
          onMouseLeave={scheduleCloseMoveMenu}
        >
          {categories.filter((cat) => cat.id !== selectedCategory).map((cat) => (
            <button
              key={cat.id}
              onClick={() => handleBatchMoveSelect(cat.id)}
              className="w-full text-left px-4 py-2.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              {cat.name}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
};

export default LinkSections;
