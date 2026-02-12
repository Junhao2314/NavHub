import {
  closestCorners,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import {
  Archive,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock,
  Edit3,
  ExternalLink,
  Eye,
  EyeOff,
  LayoutGrid,
  List,
  Plus,
  RotateCcw,
  Square,
  Timer,
  Trash2,
  X,
} from 'lucide-react';
import type React from 'react';
import { Fragment, memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useI18n } from '../../hooks/useI18n';
import type { ReminderExpiredEffect, ReminderTimerMode } from '../../hooks/useReminderBoardPrefs';
import { useReminderBoardPrefs } from '../../hooks/useReminderBoardPrefs';
import { useAppStore } from '../../stores/useAppStore';
import type {
  ChecklistItem,
  CountdownItem,
  CountdownLabelColor,
  CountdownPrecision,
  CountdownTagsBatchOp,
  SiteSettings,
} from '../../types';
import {
  type CountdownProgress,
  type CountdownRemaining,
  type CountdownUrgency,
  computeSummaryStats,
  getCountdownProgress,
  getCountdownRemaining,
  getNextOccurrence,
} from '../../utils/countdown';
import {
  safeLocalStorageGetItem,
  safeLocalStorageRemoveItem,
  safeLocalStorageSetItem,
} from '../../utils/storage';
import { normalizeHttpUrl } from '../../utils/url';
import { useDialog } from '../ui/DialogProvider';
import DropdownPanel from '../ui/DropdownPanel';
import SortableReminderCard from '../ui/SortableReminderCard';

interface ReminderBoardSectionProps {
  items: CountdownItem[];
  isAdmin: boolean;
  isPrivateUnlocked?: boolean;
  onAdd: () => void;
  onAddHolidays?: () => void;
  onEdit: (item: CountdownItem) => void;
  onDelete: (id: string) => void;
  onToggleHidden: (id: string) => void;
  onArchive?: (id: string) => void;
  onRestore?: (id: string) => void;
  onReorder?: (activeId: string, overId: string) => void;
  onBatchDelete?: (ids: string[]) => void;
  onBatchArchive?: (ids: string[]) => void;
  onBatchUpdateTags?: (ids: string[], op: CountdownTagsBatchOp) => void;
  onUpdate?: (data: Partial<CountdownItem> & { id: string }) => void;
  siteSettings?: SiteSettings;
}

type ReminderVisualState = CountdownUrgency | 'expired';
type ReminderTagFilterMode = 'any' | 'all';
type ReminderStatusFilter = 'all' | 'active' | 'expired' | 'archived';
type ReminderLabelColorFilter = CountdownLabelColor | '__none__';

const REMINDER_SELECTED_TAGS_KEY = 'navhub_reminder_board_selected_tags_v1';
const REMINDER_TAG_FILTER_MODE_KEY = 'navhub_reminder_board_tag_filter_mode_v1';
const REMINDER_SELECTED_GROUP_KEY = 'navhub_reminder_board_selected_group_v1'; // legacy (read-only)
const REMINDER_STATUS_FILTER_KEY = 'navhub_reminder_board_status_filter_v1';
const REMINDER_SELECTED_LABEL_COLORS_KEY = 'navhub_reminder_board_selected_label_colors_v1';
const REMINDER_DATE_FROM_KEY = 'navhub_reminder_board_date_from_v1';
const REMINDER_DATE_TO_KEY = 'navhub_reminder_board_date_to_v1';
const BATCH_TAG_PLACEHOLDER = '__navhub_reminder_board_batch_tag_placeholder__';
const BATCH_REMOVE_TAG_PLACEHOLDER = '__navhub_reminder_board_batch_remove_tag_placeholder__';
const LABEL_COLOR_NONE_FILTER: ReminderLabelColorFilter = '__none__';

const isReminderTagFilterMode = (value: string | null): value is ReminderTagFilterMode =>
  value === 'any' || value === 'all';

const isReminderStatusFilter = (value: string | null): value is ReminderStatusFilter =>
  value === 'all' || value === 'active' || value === 'expired' || value === 'archived';

const isValidDateInputValue = (value: string | null): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

const labelDotClasses: Record<CountdownLabelColor, string> = {
  red: 'bg-red-500',
  orange: 'bg-orange-500',
  amber: 'bg-amber-500',
  yellow: 'bg-yellow-500',
  green: 'bg-green-500',
  emerald: 'bg-emerald-500',
  blue: 'bg-blue-500',
  indigo: 'bg-indigo-500',
  violet: 'bg-violet-500',
  pink: 'bg-pink-500',
  slate: 'bg-slate-500',
};

const LABEL_COLOR_ORDER: CountdownLabelColor[] = [
  'red',
  'orange',
  'amber',
  'yellow',
  'green',
  'emerald',
  'blue',
  'indigo',
  'violet',
  'pink',
  'slate',
];

const labelColorNameKeys: Record<CountdownLabelColor, string> = {
  red: 'modals.countdown.labelColorRed',
  orange: 'modals.countdown.labelColorOrange',
  amber: 'modals.countdown.labelColorAmber',
  yellow: 'modals.countdown.labelColorYellow',
  green: 'modals.countdown.labelColorGreen',
  emerald: 'modals.countdown.labelColorEmerald',
  blue: 'modals.countdown.labelColorBlue',
  indigo: 'modals.countdown.labelColorIndigo',
  violet: 'modals.countdown.labelColorViolet',
  pink: 'modals.countdown.labelColorPink',
  slate: 'modals.countdown.labelColorSlate',
};

const stateTextClasses: Record<ReminderVisualState, string> = {
  critical: 'text-red-600 dark:text-red-400',
  warning: 'text-amber-600 dark:text-amber-400',
  normal: 'text-emerald-600 dark:text-emerald-400',
  expired: 'text-slate-500 dark:text-slate-400',
};

const stateCardClasses: Record<ReminderVisualState, string> = {
  critical: 'border-red-200 dark:border-red-800/50 bg-red-50/50 dark:bg-red-900/10',
  warning: 'border-amber-200 dark:border-amber-800/50 bg-amber-50/50 dark:bg-amber-900/10',
  normal:
    'border-emerald-200/60 dark:border-emerald-800/40 bg-emerald-50/40 dark:bg-emerald-900/10',
  expired: 'border-slate-200/70 dark:border-white/8 bg-slate-50/60 dark:bg-slate-800/30',
};

const stateBarClasses: Record<ReminderVisualState, string> = {
  critical: 'bg-red-500',
  warning: 'bg-amber-500',
  normal: 'bg-emerald-500',
  expired: 'bg-slate-400 dark:bg-slate-600',
};

const getReminderAttentionClass = (args: {
  expiredEffect: ReminderExpiredEffect;
  isExpiredOnce: boolean;
  state: ReminderVisualState;
}): string => {
  if (args.expiredEffect === 'blink') {
    return args.isExpiredOnce || args.state === 'critical' ? 'motion-safe:animate-pulse' : '';
  }
  return args.isExpiredOnce ? 'opacity-60' : '';
};

const isCountdownLabelColor = (value: unknown): value is CountdownLabelColor =>
  typeof value === 'string' && Object.hasOwn(labelDotClasses, value);

const parseDateInputValue = (
  value: string,
): { year: number; monthIndex: number; day: number } | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [yearRaw, monthRaw, dayRaw] = value.split('-');
  const year = Number.parseInt(yearRaw ?? '', 10);
  const monthIndex = Number.parseInt(monthRaw ?? '', 10) - 1;
  const day = Number.parseInt(dayRaw ?? '', 10);
  if (!Number.isFinite(year) || year < 0) return null;
  if (!Number.isFinite(monthIndex) || monthIndex < 0 || monthIndex > 11) return null;
  if (!Number.isFinite(day) || day < 1 || day > 31) return null;
  return { year, monthIndex, day };
};

const parseDateRangeMs = (args: {
  dateFrom: string;
  dateTo: string;
}): { fromMs?: number; toMs?: number } => {
  const fromParts = args.dateFrom ? parseDateInputValue(args.dateFrom) : null;
  const toParts = args.dateTo ? parseDateInputValue(args.dateTo) : null;

  const fromMs = fromParts
    ? new Date(fromParts.year, fromParts.monthIndex, fromParts.day, 0, 0, 0, 0).getTime()
    : undefined;
  const toMs = toParts
    ? new Date(toParts.year, toParts.monthIndex, toParts.day, 23, 59, 59, 999).getTime()
    : undefined;

  const safeFromMs = typeof fromMs === 'number' && Number.isFinite(fromMs) ? fromMs : undefined;
  const safeToMs = typeof toMs === 'number' && Number.isFinite(toMs) ? toMs : undefined;

  if (safeFromMs !== undefined && safeToMs !== undefined && safeFromMs > safeToMs) {
    return { fromMs: safeToMs, toMs: safeFromMs };
  }

  return { fromMs: safeFromMs, toMs: safeToMs };
};

const formatDurationByPrecision = (
  remaining: CountdownRemaining,
  precision: CountdownPrecision,
  t: (key: string, options?: Record<string, unknown>) => string,
): string => {
  const parts = [t('modals.countdown.daysLeft', { count: remaining.days })];
  if (precision === 'day') return parts.join(' ');
  parts.push(t('modals.countdown.hoursLeft', { count: remaining.hours }));
  if (precision === 'hour') return parts.join(' ');
  parts.push(t('modals.countdown.minutesLeft', { count: remaining.minutes }));
  if (precision === 'minute') return parts.join(' ');
  parts.push(t('modals.countdown.secondsLeft', { count: remaining.seconds }));
  return parts.join(' ');
};

const formatRemaining = (
  remaining: CountdownRemaining,
  precision: CountdownPrecision,
  t: (key: string, options?: Record<string, unknown>) => string,
): string => {
  if (remaining.isPast) return t('modals.countdown.expired');
  return formatDurationByPrecision(remaining, precision, t);
};

const formatPassed = (
  remaining: CountdownRemaining,
  precision: CountdownPrecision,
  t: (key: string, options?: Record<string, unknown>) => string,
): string => {
  if (!remaining.isPast) return formatRemaining(remaining, precision, t);
  const duration = formatDurationByPrecision(remaining, precision, t);
  return t('modals.countdown.passed', { duration });
};

const formatDurationShort = (
  ms: number,
  t: (key: string, options?: Record<string, unknown>) => string,
): string => {
  const absSeconds = Math.max(0, Math.floor(Math.abs(ms) / 1000));
  const days = Math.floor(absSeconds / (60 * 60 * 24));
  const hours = Math.floor((absSeconds % (60 * 60 * 24)) / (60 * 60));
  const minutes = Math.floor((absSeconds % (60 * 60)) / 60);
  const seconds = absSeconds % 60;

  if (days > 0) {
    return hours > 0
      ? `${t('modals.countdown.daysLeft', { count: days })} ${t('modals.countdown.hoursLeft', { count: hours })}`
      : t('modals.countdown.daysLeft', { count: days });
  }
  if (hours > 0) {
    return minutes > 0
      ? `${t('modals.countdown.hoursLeft', { count: hours })} ${t('modals.countdown.minutesLeft', { count: minutes })}`
      : t('modals.countdown.hoursLeft', { count: hours });
  }
  if (minutes > 0) {
    return seconds > 0
      ? `${t('modals.countdown.minutesLeft', { count: minutes })} ${t('modals.countdown.secondsLeft', { count: seconds })}`
      : t('modals.countdown.minutesLeft', { count: minutes });
  }
  return t('modals.countdown.secondsLeft', { count: seconds });
};

const formatElapsedOfTotal = (
  progress: CountdownProgress,
  t: (key: string, options?: Record<string, unknown>) => string,
): string => {
  const elapsed = formatDurationShort(progress.elapsedMs, t);
  const total = formatDurationShort(progress.totalMs, t);
  return t('modals.countdown.elapsedOfTotal', { elapsed, total });
};

const LabelDot: React.FC<{ color?: CountdownLabelColor }> = ({ color }) => {
  if (!color) return null;
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${labelDotClasses[color]} ring-2 ring-white/60 dark:ring-slate-900/60`}
    />
  );
};

const TagBadges: React.FC<{ tags?: string[]; maxVisible?: number }> = ({
  tags,
  maxVisible = 2,
}) => {
  const normalized = (tags ?? []).map((t) => t.trim()).filter(Boolean);
  if (normalized.length === 0) return null;

  const visible = normalized.slice(0, maxVisible);
  const extra = normalized.length - visible.length;
  const badgeClass =
    'text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500';

  return (
    <span className="inline-flex items-center gap-1 min-w-0">
      {visible.map((tag) => (
        <span key={tag} className={`${badgeClass} max-w-[140px] truncate`} title={tag}>
          {tag}
        </span>
      ))}
      {extra > 0 && (
        <span className={badgeClass} title={`+${extra}`}>
          +{extra}
        </span>
      )}
    </span>
  );
};

const ChecklistProgress: React.FC<{
  checklist?: ChecklistItem[];
  t: (key: string, options?: Record<string, unknown>) => string;
}> = ({ checklist, t }) => {
  if (!checklist || checklist.length === 0) return null;
  const done = checklist.filter((c) => c.done).length;
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-slate-400 dark:text-slate-500">
      <CheckSquare size={10} />
      {t('modals.countdown.checklistProgress', { done, total: checklist.length })}
    </span>
  );
};

const ProgressBar: React.FC<{ ratio: number; state: ReminderVisualState }> = ({ ratio, state }) => {
  const percent = Math.min(100, Math.max(0, Math.round(ratio * 100)));
  return (
    <div className="h-1.5 rounded-full bg-slate-200/70 dark:bg-slate-700/60 overflow-hidden">
      <div className={`h-full ${stateBarClasses[state]}`} style={{ width: `${percent}%` }} />
    </div>
  );
};

const RingProgress: React.FC<{
  ratio: number;
  state: ReminderVisualState;
  children?: React.ReactNode;
}> = ({ ratio, state, children }) => {
  const r = 22;
  const c = 2 * Math.PI * r;
  const stroke = 4;
  const dashoffset = c * (1 - Math.min(1, Math.max(0, ratio)));

  const strokeClass =
    state === 'critical'
      ? 'stroke-red-500'
      : state === 'warning'
        ? 'stroke-amber-500'
        : state === 'normal'
          ? 'stroke-emerald-500'
          : 'stroke-slate-400 dark:stroke-slate-600';

  return (
    <div className="relative w-14 h-14">
      <svg viewBox="0 0 56 56" className="w-14 h-14 -rotate-90">
        <circle
          cx="28"
          cy="28"
          r={r}
          strokeWidth={stroke}
          className="stroke-slate-200/70 dark:stroke-slate-700/60"
          fill="transparent"
        />
        <circle
          cx="28"
          cy="28"
          r={r}
          strokeWidth={stroke}
          className={`${strokeClass} transition-[stroke-dashoffset] duration-300 ease-out`}
          fill="transparent"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={dashoffset}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-center px-1">
        {children}
      </div>
    </div>
  );
};

const FlipDigit: React.FC<{ digit: string }> = ({ digit }) => {
  return (
    <div className="relative w-7 h-10 sm:w-8 sm:h-12 rounded-lg border border-slate-200/60 dark:border-slate-700/60 bg-white/70 dark:bg-slate-900/50 overflow-hidden shadow-sm [perspective:800px]">
      <div
        key={digit}
        className="w-full h-full flex items-center justify-center font-mono font-black text-lg sm:text-xl text-slate-800 dark:text-slate-100 motion-safe:animate-[flip_520ms_ease-in-out]"
      >
        {digit}
      </div>
      <div className="absolute inset-x-1 top-1/2 h-px bg-slate-200/60 dark:bg-white/8" />
    </div>
  );
};

const FlipSeparator: React.FC = () => (
  <div className="flex flex-col items-center justify-center gap-1 px-0.5 select-none">
    <span className="w-1 h-1 rounded-full bg-slate-400/70 dark:bg-slate-500/70" />
    <span className="w-1 h-1 rounded-full bg-slate-400/70 dark:bg-slate-500/70" />
  </div>
);

const FlipClockDisplay: React.FC<{
  remaining: CountdownRemaining;
  precision: CountdownPrecision;
}> = ({ remaining, precision }) => {
  const h = String(Math.min(99, remaining.hours)).padStart(2, '0');
  const m = String(Math.min(59, remaining.minutes)).padStart(2, '0');
  const s = String(Math.min(59, remaining.seconds)).padStart(2, '0');

  if (precision === 'hour') {
    return (
      <div className="flex items-center justify-center gap-1.5">
        <FlipDigit digit={h[0]} />
        <FlipDigit digit={h[1]} />
      </div>
    );
  }

  if (precision === 'minute') {
    return (
      <div className="flex items-center justify-center gap-1.5">
        <FlipDigit digit={h[0]} />
        <FlipDigit digit={h[1]} />
        <FlipSeparator />
        <FlipDigit digit={m[0]} />
        <FlipDigit digit={m[1]} />
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center gap-1.5">
      <FlipDigit digit={h[0]} />
      <FlipDigit digit={h[1]} />
      <FlipSeparator />
      <FlipDigit digit={m[0]} />
      <FlipDigit digit={m[1]} />
      <FlipSeparator />
      <FlipDigit digit={s[0]} />
      <FlipDigit digit={s[1]} />
    </div>
  );
};

const ReminderCardActions: React.FC<{
  item: CountdownItem;
  isAdmin: boolean;
  isBatchMode: boolean;
  onEdit: (item: CountdownItem) => void;
  onDelete: (id: string) => void;
  onToggleHidden: (id: string) => void;
}> = ({ item, isAdmin, isBatchMode, onEdit, onDelete, onToggleHidden }) => {
  const { t } = useI18n();
  const { confirm, notify } = useDialog();
  const linkedUrl = typeof item.linkedUrl === 'string' ? item.linkedUrl.trim() : '';

  const handleDelete = useCallback(async () => {
    const confirmed = await confirm({
      title: t('modals.countdown.deleteConfirmTitle'),
      message: t('modals.countdown.deleteConfirmMessage', { title: item.title }),
      variant: 'danger',
    });
    if (confirmed) {
      onDelete(item.id);
    }
  }, [confirm, item.id, item.title, onDelete, t]);

  const handleOpenLinkedUrl = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const safeUrl = normalizeHttpUrl(linkedUrl);
      if (!safeUrl) {
        notify(t('modals.countdown.invalidLinkedUrl'), 'error');
        return;
      }
      window.open(safeUrl, '_blank', 'noopener,noreferrer');
    },
    [linkedUrl, notify, t],
  );

  if (isBatchMode) return null;
  if (!isAdmin && !linkedUrl) return null;

  return (
    <div className="flex items-center gap-1 shrink-0">
      {linkedUrl && (
        <button
          type="button"
          onClick={handleOpenLinkedUrl}
          className="p-1.5 text-slate-400 hover:text-accent rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          title={t('modals.countdown.openLinkedUrl')}
          aria-label={t('modals.countdown.openLinkedUrl')}
        >
          <ExternalLink size={14} />
        </button>
      )}

      {isAdmin && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleHidden(item.id);
            }}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title={t('modals.countdown.toggleVisibility')}
          >
            {item.hidden ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onEdit(item);
            }}
            className="p-1.5 text-slate-400 hover:text-accent rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title={t('common.edit')}
          >
            <Edit3 size={14} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              void handleDelete();
            }}
            className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            title={t('common.delete')}
          >
            <Trash2 size={14} />
          </button>
        </>
      )}
    </div>
  );
};

const ReminderCardCompact: React.FC<{
  item: CountdownItem;
  progress: CountdownProgress;
  expiredEffect: ReminderExpiredEffect;
  isExpiredOnce: boolean;
  state: ReminderVisualState;
  primaryText: string;
  elapsedOfTotalText: string;
  isAdmin: boolean;
  isBatchMode: boolean;
  onEdit: (item: CountdownItem) => void;
  onDelete: (id: string) => void;
  onToggleHidden: (id: string) => void;
}> = ({
  item,
  progress,
  expiredEffect,
  isExpiredOnce,
  state,
  primaryText,
  elapsedOfTotalText,
  isAdmin,
  isBatchMode,
  onEdit,
  onDelete,
  onToggleHidden,
}) => {
  const { t } = useI18n();

  const attentionClass = getReminderAttentionClass({ expiredEffect, isExpiredOnce, state });

  return (
    <div
      className={`relative rounded-xl border backdrop-blur-sm p-3 transition-all duration-300 ${stateCardClasses[state]} ${attentionClass}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <LabelDot color={item.labelColor} />
            <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
              {item.title}
            </h4>
            {item.hidden && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500">
                {t('modals.countdown.hidden')}
              </span>
            )}
            {item.isPrivate && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-100 dark:bg-violet-900/30 text-violet-500 dark:text-violet-400">
                {t('modals.countdown.privateBadge')}
              </span>
            )}
            <TagBadges tags={item.tags} />
          </div>
          {item.note && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
              {item.note}
            </p>
          )}
          <ChecklistProgress checklist={item.checklist} t={t} />
        </div>

        <div className="flex items-start gap-2 shrink-0">
          <div
            className={`text-sm sm:text-base font-bold leading-tight text-right whitespace-nowrap ${stateTextClasses[state]}`}
          >
            {primaryText}
          </div>
          <ReminderCardActions
            item={item}
            isAdmin={isAdmin}
            isBatchMode={isBatchMode}
            onEdit={onEdit}
            onDelete={onDelete}
            onToggleHidden={onToggleHidden}
          />
        </div>
      </div>

      <div className="mt-2">
        <div className="flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500 mb-1">
          <span className="truncate">{elapsedOfTotalText}</span>
          <span className="font-mono tabular-nums">{Math.round(progress.ratio * 100)}%</span>
        </div>
        <ProgressBar ratio={progress.ratio} state={state} />
      </div>
    </div>
  );
};

const ReminderCardCard: React.FC<{
  item: CountdownItem;
  progress: CountdownProgress;
  expiredEffect: ReminderExpiredEffect;
  isExpiredOnce: boolean;
  state: ReminderVisualState;
  primaryText: string;
  elapsedOfTotalText: string;
  isAdmin: boolean;
  isBatchMode: boolean;
  onEdit: (item: CountdownItem) => void;
  onDelete: (id: string) => void;
  onToggleHidden: (id: string) => void;
}> = ({
  item,
  progress,
  expiredEffect,
  isExpiredOnce,
  state,
  primaryText,
  elapsedOfTotalText,
  isAdmin,
  isBatchMode,
  onEdit,
  onDelete,
  onToggleHidden,
}) => {
  const { t } = useI18n();

  const attentionClass = getReminderAttentionClass({ expiredEffect, isExpiredOnce, state });

  return (
    <div
      className={`relative rounded-xl border backdrop-blur-sm p-4 transition-all duration-300 ${stateCardClasses[state]} ${attentionClass}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <LabelDot color={item.labelColor} />
            <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
              {item.title}
            </h4>
            {item.hidden && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500">
                {t('modals.countdown.hidden')}
              </span>
            )}
            {item.isPrivate && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-100 dark:bg-violet-900/30 text-violet-500 dark:text-violet-400">
                {t('modals.countdown.privateBadge')}
              </span>
            )}
            <TagBadges tags={item.tags} />
          </div>
          {item.note && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
              {item.note}
            </p>
          )}
          <ChecklistProgress checklist={item.checklist} t={t} />
        </div>

        <ReminderCardActions
          item={item}
          isAdmin={isAdmin}
          isBatchMode={isBatchMode}
          onEdit={onEdit}
          onDelete={onDelete}
          onToggleHidden={onToggleHidden}
        />
      </div>

      <div className={`text-lg font-bold mt-2 ${stateTextClasses[state]}`}>{primaryText}</div>

      <div className="mt-3">
        <div className="flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500 mb-1">
          <span className="truncate">{elapsedOfTotalText}</span>
          <span className="font-mono tabular-nums">{Math.round(progress.ratio * 100)}%</span>
        </div>
        <ProgressBar ratio={progress.ratio} state={state} />
      </div>
    </div>
  );
};

const ReminderCardRing: React.FC<{
  item: CountdownItem;
  progress: CountdownProgress;
  timerMode: ReminderTimerMode;
  expiredEffect: ReminderExpiredEffect;
  isExpiredOnce: boolean;
  state: ReminderVisualState;
  primaryText: string;
  elapsedOfTotalText: string;
  isAdmin: boolean;
  isBatchMode: boolean;
  onEdit: (item: CountdownItem) => void;
  onDelete: (id: string) => void;
  onToggleHidden: (id: string) => void;
}> = ({
  item,
  progress,
  timerMode,
  expiredEffect,
  isExpiredOnce,
  state,
  primaryText,
  elapsedOfTotalText,
  isAdmin,
  isBatchMode,
  onEdit,
  onDelete,
  onToggleHidden,
}) => {
  const { t } = useI18n();

  const attentionClass = getReminderAttentionClass({ expiredEffect, isExpiredOnce, state });

  return (
    <div
      className={`relative rounded-xl border backdrop-blur-sm p-4 transition-all duration-300 ${stateCardClasses[state]} ${attentionClass}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <LabelDot color={item.labelColor} />
            <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
              {item.title}
            </h4>
            {item.hidden && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500">
                {t('modals.countdown.hidden')}
              </span>
            )}
            {item.isPrivate && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-100 dark:bg-violet-900/30 text-violet-500 dark:text-violet-400">
                {t('modals.countdown.privateBadge')}
              </span>
            )}
            <TagBadges tags={item.tags} />
          </div>
          {item.note && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
              {item.note}
            </p>
          )}
          <ChecklistProgress checklist={item.checklist} t={t} />
        </div>

        <ReminderCardActions
          item={item}
          isAdmin={isAdmin}
          isBatchMode={isBatchMode}
          onEdit={onEdit}
          onDelete={onDelete}
          onToggleHidden={onToggleHidden}
        />
      </div>

      <div className="mt-3 flex items-center gap-3">
        <RingProgress ratio={progress.ratio} state={state}>
          <div
            className={`text-[11px] leading-tight font-bold ${stateTextClasses[state]} line-clamp-2`}
          >
            {isExpiredOnce && timerMode === 'cycle' ? t('modals.countdown.expired') : primaryText}
          </div>
        </RingProgress>

        <div className="min-w-0 flex-1">
          <div className="text-[10px] text-slate-400 dark:text-slate-500 truncate">
            {elapsedOfTotalText}
          </div>
          <div className="mt-1">
            <ProgressBar ratio={progress.ratio} state={state} />
          </div>
        </div>
      </div>
    </div>
  );
};

const ReminderCardFlip: React.FC<{
  item: CountdownItem;
  remaining: CountdownRemaining;
  progress: CountdownProgress;
  timerMode: ReminderTimerMode;
  expiredEffect: ReminderExpiredEffect;
  isExpiredOnce: boolean;
  state: ReminderVisualState;
  elapsedOfTotalText: string;
  isAdmin: boolean;
  isBatchMode: boolean;
  onEdit: (item: CountdownItem) => void;
  onDelete: (id: string) => void;
  onToggleHidden: (id: string) => void;
}> = ({
  item,
  remaining,
  progress,
  timerMode,
  expiredEffect,
  isExpiredOnce,
  state,
  elapsedOfTotalText,
  isAdmin,
  isBatchMode,
  onEdit,
  onDelete,
  onToggleHidden,
}) => {
  const { t } = useI18n();

  const attentionClass = getReminderAttentionClass({ expiredEffect, isExpiredOnce, state });

  const passedText = formatPassed(remaining, item.precision, t);
  const captionText =
    item.precision === 'day'
      ? ''
      : timerMode === 'forward'
        ? passedText
        : formatRemaining(remaining, item.precision, t);
  const badgeText =
    remaining.days > 0 || item.precision === 'day'
      ? remaining.isPast && timerMode === 'forward'
        ? t('modals.countdown.passedDays', { count: remaining.days })
        : t('modals.countdown.daysLeft', { count: remaining.days })
      : '';

  return (
    <div
      className={`relative rounded-xl border backdrop-blur-sm p-4 transition-all duration-300 ${stateCardClasses[state]} ${attentionClass}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <LabelDot color={item.labelColor} />
            <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
              {item.title}
            </h4>
            {item.hidden && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500">
                {t('modals.countdown.hidden')}
              </span>
            )}
            {item.isPrivate && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-100 dark:bg-violet-900/30 text-violet-500 dark:text-violet-400">
                {t('modals.countdown.privateBadge')}
              </span>
            )}
            <TagBadges tags={item.tags} />
          </div>
          {item.note && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
              {item.note}
            </p>
          )}
          <ChecklistProgress checklist={item.checklist} t={t} />
        </div>

        <ReminderCardActions
          item={item}
          isAdmin={isAdmin}
          isBatchMode={isBatchMode}
          onEdit={onEdit}
          onDelete={onDelete}
          onToggleHidden={onToggleHidden}
        />
      </div>

      <div className="mt-3">
        {isExpiredOnce && timerMode === 'cycle' ? (
          <div className="text-center py-4">
            <div className={`text-lg font-black ${stateTextClasses[state]}`}>
              {t('modals.countdown.expired')}
            </div>
            <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">{passedText}</div>
          </div>
        ) : (
          <>
            {badgeText && (
              <div className="flex justify-center mb-2">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-900/5 dark:bg-white/8 text-slate-600 dark:text-slate-300">
                  {badgeText}
                </span>
              </div>
            )}
            {item.precision === 'day' ? (
              <div className={`text-center py-4 text-2xl font-black ${stateTextClasses[state]}`}>
                {badgeText}
              </div>
            ) : (
              <>
                <FlipClockDisplay remaining={remaining} precision={item.precision} />
                {captionText && (
                  <div className="mt-2 text-center text-[10px] text-slate-400 dark:text-slate-500">
                    {captionText}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500 mb-1">
          <span className="truncate">{elapsedOfTotalText}</span>
          <span className="font-mono tabular-nums">{Math.round(progress.ratio * 100)}%</span>
        </div>
        <ProgressBar ratio={progress.ratio} state={state} />
      </div>
    </div>
  );
};

const ReminderBoardSection: React.FC<ReminderBoardSectionProps> = ({
  items,
  isAdmin,
  isPrivateUnlocked,
  onAdd,
  onAddHolidays,
  onEdit,
  onDelete,
  onToggleHidden,
  onArchive,
  onRestore,
  onReorder,
  onBatchDelete,
  onBatchArchive,
  onBatchUpdateTags,
  onUpdate,
  siteSettings: siteSettingsProp,
}) => {
  const { t } = useI18n();
  const [tick, setTick] = useState(0);

  const siteSettings = useAppStore((s) => s.siteSettings);

  const effectiveSettings = siteSettingsProp ?? siteSettings;
  void onUpdate;
  void onAddHolidays;

  const { viewStyle, setViewStyle, timerMode, expiredEffect, sortMode, setSortMode } =
    useReminderBoardPrefs();
  const [statusFilter, setStatusFilter] = useState<ReminderStatusFilter>('all');
  const [selectedLabelColors, setSelectedLabelColors] = useState<ReminderLabelColorFilter[]>([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagFilterMode, setTagFilterMode] = useState<ReminderTagFilterMode>('any');
  const [archivedExpanded, setArchivedExpanded] = useState(false);
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchAddTagSelection, setBatchAddTagSelection] = useState(BATCH_TAG_PLACEHOLDER);
  const [batchRemoveTagSelection, setBatchRemoveTagSelection] = useState(
    BATCH_REMOVE_TAG_PLACEHOLDER,
  );
  const [isCreatingBatchTag, setIsCreatingBatchTag] = useState(false);
  const [newBatchTagName, setNewBatchTagName] = useState('');

  const now = useMemo(() => {
    void tick;
    return new Date();
  }, [tick]);

  const showOverdueForUsers = effectiveSettings.reminderBoardShowOverdueForUsers ?? false;
  const archiveMode = effectiveSettings.reminderBoardArchiveMode;
  const archiveDelayMinutes = effectiveSettings.reminderBoardArchiveDelayMinutes ?? 60;
  const configuredTagOptions = effectiveSettings.reminderBoardGroups ?? [];

  const { confirm, notify } = useDialog();

  // DnD sensors for custom sort mode
  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Load persisted local preferences
  useEffect(() => {
    const storedStatusFilter = safeLocalStorageGetItem(REMINDER_STATUS_FILTER_KEY);
    const storedSelectedLabelColors = safeLocalStorageGetItem(REMINDER_SELECTED_LABEL_COLORS_KEY);
    const storedDateFrom = safeLocalStorageGetItem(REMINDER_DATE_FROM_KEY);
    const storedDateTo = safeLocalStorageGetItem(REMINDER_DATE_TO_KEY);
    const storedSelectedTags = safeLocalStorageGetItem(REMINDER_SELECTED_TAGS_KEY);
    const storedTagFilterMode = safeLocalStorageGetItem(REMINDER_TAG_FILTER_MODE_KEY);
    const legacyStoredGroup = safeLocalStorageGetItem(REMINDER_SELECTED_GROUP_KEY);

    if (isReminderTagFilterMode(storedTagFilterMode)) setTagFilterMode(storedTagFilterMode);
    if (isReminderStatusFilter(storedStatusFilter)) setStatusFilter(storedStatusFilter);
    if (isValidDateInputValue(storedDateFrom)) setDateFrom(storedDateFrom);
    if (isValidDateInputValue(storedDateTo)) setDateTo(storedDateTo);

    let initialLabelColors: ReminderLabelColorFilter[] = [];
    if (storedSelectedLabelColors) {
      try {
        const parsed = JSON.parse(storedSelectedLabelColors) as unknown;
        if (Array.isArray(parsed)) {
          const seen = new Set<ReminderLabelColorFilter>();
          for (const raw of parsed) {
            if (raw === LABEL_COLOR_NONE_FILTER) {
              if (seen.has(LABEL_COLOR_NONE_FILTER)) continue;
              seen.add(LABEL_COLOR_NONE_FILTER);
              initialLabelColors.push(LABEL_COLOR_NONE_FILTER);
              continue;
            }
            if (!isCountdownLabelColor(raw)) continue;
            const next = raw;
            if (seen.has(next)) continue;
            seen.add(next);
            initialLabelColors.push(next);
          }
        }
      } catch {
        // ignore parse errors
      }
    }
    setSelectedLabelColors(initialLabelColors);

    let initialSelectedTags: string[] = [];
    if (storedSelectedTags) {
      try {
        const parsed = JSON.parse(storedSelectedTags) as unknown;
        if (Array.isArray(parsed)) {
          const seen = new Set<string>();
          for (const raw of parsed) {
            if (typeof raw !== 'string') continue;
            const next = raw.trim();
            if (!next) continue;
            if (seen.has(next)) continue;
            seen.add(next);
            initialSelectedTags.push(next);
          }
        }
      } catch {
        // ignore parse errors
      }
    }

    // Migrate legacy single-group selection to tags, then cleanup legacy key.
    if (legacyStoredGroup) {
      safeLocalStorageRemoveItem(REMINDER_SELECTED_GROUP_KEY);
      const next = legacyStoredGroup.trim();
      if (next && initialSelectedTags.length === 0) {
        initialSelectedTags = [next];
      }
    }

    setSelectedTags(initialSelectedTags);
  }, []);

  // Persist local preferences
  useEffect(() => {
    safeLocalStorageSetItem(REMINDER_STATUS_FILTER_KEY, statusFilter);
  }, [statusFilter]);
  useEffect(() => {
    safeLocalStorageSetItem(
      REMINDER_SELECTED_LABEL_COLORS_KEY,
      JSON.stringify(selectedLabelColors),
    );
  }, [selectedLabelColors]);
  useEffect(() => {
    safeLocalStorageSetItem(REMINDER_DATE_FROM_KEY, dateFrom);
  }, [dateFrom]);
  useEffect(() => {
    safeLocalStorageSetItem(REMINDER_DATE_TO_KEY, dateTo);
  }, [dateTo]);
  useEffect(() => {
    safeLocalStorageSetItem(REMINDER_SELECTED_TAGS_KEY, JSON.stringify(selectedTags));
  }, [selectedTags]);
  useEffect(() => {
    safeLocalStorageSetItem(REMINDER_TAG_FILTER_MODE_KEY, tagFilterMode);
  }, [tagFilterMode]);

  // Tick every second
  useEffect(() => {
    const timer = setInterval(() => setTick((prev) => prev + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  // Split items into active / archived
  const activeItems = useMemo(() => items.filter((item) => !item.archivedAt), [items]);
  const archivedItems = useMemo(() => items.filter((item) => item.archivedAt), [items]);

  // Extract unique tags from settings + item tags
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();

    for (const raw of configuredTagOptions) {
      const next = raw.trim();
      if (!next) continue;
      tagSet.add(next);
    }

    for (const item of items) {
      for (const raw of item.tags ?? []) {
        const next = raw.trim();
        if (!next) continue;
        tagSet.add(next);
      }
    }

    return Array.from(tagSet);
  }, [configuredTagOptions, items]);

  const selectedLabelColorSet = useMemo(
    () => new Set<ReminderLabelColorFilter>(selectedLabelColors),
    [selectedLabelColors],
  );

  const dateRangeMs = useMemo(() => parseDateRangeMs({ dateFrom, dateTo }), [dateFrom, dateTo]);
  const shouldApplyDateRange = dateRangeMs.fromMs !== undefined || dateRangeMs.toMs !== undefined;

  const baseVisibleActiveItems = useMemo(() => {
    if (isAdmin) return activeItems;
    return activeItems.filter((item) => !item.hidden && !(item.isPrivate && !isPrivateUnlocked));
  }, [activeItems, isAdmin, isPrivateUnlocked]);

  const baseVisibleArchivedItems = useMemo(() => {
    if (isAdmin) return archivedItems;
    return archivedItems.filter((item) => !item.hidden && !(item.isPrivate && !isPrivateUnlocked));
  }, [archivedItems, isAdmin, isPrivateUnlocked]);

  const staticFilteredActiveItems = useMemo(() => {
    return baseVisibleActiveItems.filter((item) => {
      if (selectedTags.length > 0) {
        const itemTags = item.tags ?? [];
        if (tagFilterMode === 'all') {
          if (!selectedTags.every((tag) => itemTags.includes(tag))) return false;
        } else if (!selectedTags.some((tag) => itemTags.includes(tag))) {
          return false;
        }
      }

      if (selectedLabelColorSet.size > 0) {
        const token: ReminderLabelColorFilter = item.labelColor ?? LABEL_COLOR_NONE_FILTER;
        if (!selectedLabelColorSet.has(token)) return false;
      }

      return true;
    });
  }, [baseVisibleActiveItems, selectedTags, tagFilterMode, selectedLabelColorSet]);

  const staticFilteredArchivedItems = useMemo(() => {
    return baseVisibleArchivedItems.filter((item) => {
      if (selectedTags.length > 0) {
        const itemTags = item.tags ?? [];
        if (tagFilterMode === 'all') {
          if (!selectedTags.every((tag) => itemTags.includes(tag))) return false;
        } else if (!selectedTags.some((tag) => itemTags.includes(tag))) {
          return false;
        }
      }

      if (selectedLabelColorSet.size > 0) {
        const token: ReminderLabelColorFilter = item.labelColor ?? LABEL_COLOR_NONE_FILTER;
        if (!selectedLabelColorSet.has(token)) return false;
      }

      return true;
    });
  }, [baseVisibleArchivedItems, selectedTags, tagFilterMode, selectedLabelColorSet]);

  const timeFilteredActiveItems = useMemo(() => {
    if (!shouldApplyDateRange) return staticFilteredActiveItems;
    return staticFilteredActiveItems.filter((item) => {
      const occurrenceMs = getNextOccurrence(item, now).getTime();
      if (dateRangeMs.fromMs !== undefined && occurrenceMs < dateRangeMs.fromMs) return false;
      if (dateRangeMs.toMs !== undefined && occurrenceMs > dateRangeMs.toMs) return false;
      return true;
    });
  }, [staticFilteredActiveItems, shouldApplyDateRange, dateRangeMs.fromMs, dateRangeMs.toMs, now]);

  const filteredArchivedItems = useMemo(() => {
    if (!shouldApplyDateRange) return staticFilteredArchivedItems;
    return staticFilteredArchivedItems.filter((item) => {
      const occurrenceMs = getNextOccurrence(item, now).getTime();
      if (dateRangeMs.fromMs !== undefined && occurrenceMs < dateRangeMs.fromMs) return false;
      if (dateRangeMs.toMs !== undefined && occurrenceMs > dateRangeMs.toMs) return false;
      return true;
    });
  }, [
    staticFilteredArchivedItems,
    shouldApplyDateRange,
    dateRangeMs.fromMs,
    dateRangeMs.toMs,
    now,
  ]);

  const viewModels = useMemo(() => {
    if (statusFilter === 'archived') return [];
    return timeFilteredActiveItems.map((item) => {
      const isOnce = item.rule.kind === 'once';
      const remaining = getCountdownRemaining(item, now);
      const progress = getCountdownProgress({
        item,
        createdAt: item.createdAt,
        now,
      });

      const isExpiredOnce = isOnce && remaining.isPast;
      const state: ReminderVisualState = isExpiredOnce ? 'expired' : remaining.urgency;
      const primaryText =
        isExpiredOnce && timerMode === 'forward'
          ? formatPassed(remaining, item.precision, t)
          : isExpiredOnce && timerMode === 'cycle'
            ? t('modals.countdown.expired')
            : formatRemaining(remaining, item.precision, t);

      return {
        item,
        remaining,
        progress,
        isExpiredOnce,
        state,
        primaryText,
        elapsedOfTotalText: formatElapsedOfTotal(progress, t),
      };
    });
  }, [statusFilter, timeFilteredActiveItems, now, timerMode, t]);

  const visibleModels = useMemo(() => {
    if (!isAdmin && timerMode === 'forward' && !showOverdueForUsers) {
      return viewModels.filter((vm) => !vm.isExpiredOnce);
    }
    return viewModels;
  }, [isAdmin, timerMode, showOverdueForUsers, viewModels]);

  const statusFilteredModels = useMemo(() => {
    if (statusFilter === 'active') return visibleModels.filter((vm) => !vm.isExpiredOnce);
    if (statusFilter === 'expired') return visibleModels.filter((vm) => vm.isExpiredOnce);
    if (statusFilter === 'all') return visibleModels;
    return [];
  }, [statusFilter, visibleModels]);

  const sortedItems = useMemo(() => {
    const next = [...statusFilteredModels];
    next.sort((a, b) => {
      if (sortMode === 'created') {
        return b.item.createdAt - a.item.createdAt;
      }
      if (sortMode === 'custom') {
        const aOrder = a.item.order ?? a.item.createdAt;
        const bOrder = b.item.order ?? b.item.createdAt;
        return aOrder - bOrder;
      }
      // 'remaining' - default: urgent first, expired last
      if (a.remaining.isPast !== b.remaining.isPast) return a.remaining.isPast ? 1 : -1;
      if (a.remaining.isPast && b.remaining.isPast)
        return b.remaining.totalMs - a.remaining.totalMs;
      return a.remaining.totalMs - b.remaining.totalMs;
    });
    return next;
  }, [sortMode, statusFilteredModels]);

  const summaryStats = useMemo(() => {
    if (statusFilter === 'archived' || statusFilter === 'expired') return null;
    return computeSummaryStats(
      sortedItems.map((vm) => vm.item),
      now,
    );
  }, [statusFilter, sortedItems, now]);

  // Auto-archive effect
  useEffect(() => {
    if (!archiveMode || !onArchive) return;
    // Rerun periodically based on the UI tick.
    void tick;
    const delayMs = archiveMode === 'delay' ? archiveDelayMinutes * 60000 : 0;
    const currentNow = new Date();
    for (const item of activeItems) {
      if (item.archivedAt || item.rule.kind !== 'once') continue;
      const remaining = getCountdownRemaining(item, currentNow);
      if (remaining.isPast && Math.abs(remaining.totalMs) >= delayMs) {
        onArchive(item.id);
      }
    }
  }, [tick, archiveMode, archiveDelayMinutes, onArchive, activeItems]);

  // DnD handler
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id || !onReorder) return;
      onReorder(String(active.id), String(over.id));
    },
    [onReorder],
  );

  // Permanent delete handler
  const handlePermanentDelete = useCallback(
    async (item: CountdownItem) => {
      const confirmed = await confirm({
        title: t('modals.countdown.permanentDeleteConfirmTitle'),
        message: t('modals.countdown.permanentDeleteConfirmMessage', { title: item.title }),
        variant: 'danger',
      });
      if (confirmed) {
        onDelete(item.id);
      }
    },
    [confirm, onDelete, t],
  );

  // Batch mode: reset selection on major filter changes
  useEffect(() => {
    void selectedTags;
    void tagFilterMode;
    void sortMode;
    void viewStyle;
    void statusFilter;
    void selectedLabelColors;
    void dateFrom;
    void dateTo;
    if (!isBatchMode) return;
    setSelectedIds(new Set());
    setIsCreatingBatchTag(false);
    setNewBatchTagName('');
    setBatchAddTagSelection(BATCH_TAG_PLACEHOLDER);
    setBatchRemoveTagSelection(BATCH_REMOVE_TAG_PLACEHOLDER);
  }, [
    isBatchMode,
    selectedTags,
    tagFilterMode,
    sortMode,
    viewStyle,
    statusFilter,
    selectedLabelColors,
    dateFrom,
    dateTo,
  ]);

  // Batch mode: force-exit in archived view
  useEffect(() => {
    if (statusFilter !== 'archived') return;
    if (!isBatchMode) return;
    setIsBatchMode(false);
    setSelectedIds(new Set());
    setIsCreatingBatchTag(false);
    setNewBatchTagName('');
    setBatchAddTagSelection(BATCH_TAG_PLACEHOLDER);
    setBatchRemoveTagSelection(BATCH_REMOVE_TAG_PLACEHOLDER);
  }, [statusFilter, isBatchMode]);

  // Batch mode: ensure selection only contains active items
  useEffect(() => {
    if (!isBatchMode) return;
    const activeIdSet = new Set(activeItems.map((item) => item.id));
    setSelectedIds((prev) => {
      const next = new Set([...prev].filter((id) => activeIdSet.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [isBatchMode, activeItems]);

  // Batch mode: force-exit when not admin
  useEffect(() => {
    if (isAdmin || !isBatchMode) return;
    setIsBatchMode(false);
    setSelectedIds(new Set());
    setIsCreatingBatchTag(false);
    setNewBatchTagName('');
    setBatchAddTagSelection(BATCH_TAG_PLACEHOLDER);
    setBatchRemoveTagSelection(BATCH_REMOVE_TAG_PLACEHOLDER);
  }, [isAdmin, isBatchMode]);

  const hasVisibleActive = sortedItems.length > 0;
  const hasVisibleArchived = filteredArchivedItems.length > 0;
  const hasVisibleContent =
    statusFilter === 'archived'
      ? hasVisibleArchived
      : hasVisibleActive || (statusFilter === 'all' && hasVisibleArchived);

  if (!hasVisibleContent && !isAdmin) return null;

  const containerClassName =
    viewStyle === 'compact'
      ? 'flex flex-col gap-2'
      : 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3';

  const selectableIds = sortedItems.map((vm) => vm.item.id);
  const selectedCount = selectedIds.size;
  const hasSelection = selectedCount > 0;
  const isAllSelected =
    selectableIds.length > 0 && selectableIds.every((id) => selectedIds.has(id));

  const resetBatchSelection = () => {
    setSelectedIds(new Set());
    setIsCreatingBatchTag(false);
    setNewBatchTagName('');
    setBatchAddTagSelection(BATCH_TAG_PLACEHOLDER);
    setBatchRemoveTagSelection(BATCH_REMOVE_TAG_PLACEHOLDER);
  };

  const handleEnterBatchMode = () => {
    setIsBatchMode(true);
    resetBatchSelection();
  };

  const handleExitBatchMode = () => {
    setIsBatchMode(false);
    resetBatchSelection();
  };

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(selectableIds));
  };

  const handleBatchArchive = () => {
    if (!hasSelection) return;
    const ids = Array.from(selectedIds);
    if (onBatchArchive) {
      onBatchArchive(ids);
    } else if (onArchive) {
      for (const id of ids) onArchive(id);
    } else {
      return;
    }
    resetBatchSelection();
    notify(t('modals.countdown.batchArchiveSuccess', { count: ids.length }), 'success');
  };

  const handleBatchDelete = async () => {
    if (!hasSelection) return;
    const ids = Array.from(selectedIds);
    const confirmed = await confirm({
      title: t('modals.countdown.batchDeleteConfirmTitle'),
      message: t('modals.countdown.batchDeleteConfirmMessage', { count: ids.length }),
      variant: 'danger',
    });
    if (!confirmed) return;

    if (onBatchDelete) {
      onBatchDelete(ids);
    } else {
      for (const id of ids) onDelete(id);
    }
    resetBatchSelection();
    notify(t('modals.countdown.batchDeleteSuccess', { count: ids.length }), 'success');
  };

  const applyBatchTags = (op: CountdownTagsBatchOp) => {
    if (!hasSelection || !onBatchUpdateTags) return;
    const ids = Array.from(selectedIds);
    onBatchUpdateTags(ids, op);
    resetBatchSelection();
    notify(t('modals.countdown.batchUpdateTagsSuccess', { count: ids.length }), 'success');
  };

  const handleBatchAddTagChange = (value: string) => {
    setBatchAddTagSelection(value);
    if (!hasSelection) return;
    if (value === '__new__') {
      setIsCreatingBatchTag(true);
      setNewBatchTagName('');
      setBatchAddTagSelection(BATCH_TAG_PLACEHOLDER);
      return;
    }

    if (value === BATCH_TAG_PLACEHOLDER) return;
    const tag = value.trim();
    if (!tag) return;
    applyBatchTags({ kind: 'add', tag });
  };

  const handleBatchRemoveTagChange = (value: string) => {
    setBatchRemoveTagSelection(value);
    if (!hasSelection) return;
    if (value === BATCH_REMOVE_TAG_PLACEHOLDER) return;
    const tag = value.trim();
    if (!tag) return;
    applyBatchTags({ kind: 'remove', tag });
  };

  const handleBatchClearTags = async () => {
    if (!hasSelection || !onBatchUpdateTags) return;
    const ids = Array.from(selectedIds);
    const confirmed = await confirm({
      title: t('modals.countdown.batchClearTagsConfirmTitle'),
      message: t('modals.countdown.batchClearTagsConfirmMessage', { count: ids.length }),
      variant: 'danger',
    });
    if (!confirmed) return;

    applyBatchTags({ kind: 'clear' });
  };

  const isDndEnabled = sortMode === 'custom' && isAdmin && onReorder && !isBatchMode;

  const renderCard = ({
    item,
    remaining,
    progress,
    isExpiredOnce,
    state,
    primaryText,
    elapsedOfTotalText,
  }: (typeof sortedItems)[number]) => {
    const cardElement = (() => {
      if (viewStyle === 'compact') {
        return (
          <ReminderCardCompact
            item={item}
            progress={progress}
            expiredEffect={expiredEffect}
            isExpiredOnce={isExpiredOnce}
            state={state}
            primaryText={primaryText}
            elapsedOfTotalText={elapsedOfTotalText}
            isAdmin={isAdmin}
            isBatchMode={isBatchMode}
            onEdit={onEdit}
            onDelete={onDelete}
            onToggleHidden={onToggleHidden}
          />
        );
      }

      if (viewStyle === 'ring') {
        return (
          <ReminderCardRing
            item={item}
            progress={progress}
            timerMode={timerMode}
            expiredEffect={expiredEffect}
            isExpiredOnce={isExpiredOnce}
            state={state}
            primaryText={primaryText}
            elapsedOfTotalText={elapsedOfTotalText}
            isAdmin={isAdmin}
            isBatchMode={isBatchMode}
            onEdit={onEdit}
            onDelete={onDelete}
            onToggleHidden={onToggleHidden}
          />
        );
      }

      if (viewStyle === 'flip') {
        return (
          <ReminderCardFlip
            item={item}
            remaining={remaining}
            progress={progress}
            timerMode={timerMode}
            expiredEffect={expiredEffect}
            isExpiredOnce={isExpiredOnce}
            state={state}
            elapsedOfTotalText={elapsedOfTotalText}
            isAdmin={isAdmin}
            isBatchMode={isBatchMode}
            onEdit={onEdit}
            onDelete={onDelete}
            onToggleHidden={onToggleHidden}
          />
        );
      }

      return (
        <ReminderCardCard
          item={item}
          progress={progress}
          expiredEffect={expiredEffect}
          isExpiredOnce={isExpiredOnce}
          state={state}
          primaryText={primaryText}
          elapsedOfTotalText={elapsedOfTotalText}
          isAdmin={isAdmin}
          isBatchMode={isBatchMode}
          onEdit={onEdit}
          onDelete={onDelete}
          onToggleHidden={onToggleHidden}
        />
      );
    })();

    if (!isBatchMode) {
      return <Fragment key={item.id}>{cardElement}</Fragment>;
    }

    const isSelected = selectedIds.has(item.id);
    const toggleLabel = isSelected
      ? t('modals.countdown.deselectItem', { title: item.title })
      : t('modals.countdown.selectItem', { title: item.title });

    return (
      <div
        key={item.id}
        role="button"
        tabIndex={0}
        aria-pressed={isSelected}
        onClick={() => toggleSelection(item.id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleSelection(item.id);
          }
        }}
        className={`relative rounded-xl cursor-pointer outline-none focus:ring-2 focus:ring-accent/30 ${
          isSelected
            ? 'ring-2 ring-rose-500/30'
            : 'ring-1 ring-transparent hover:ring-slate-300/40 dark:hover:ring-white/10'
        }`}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toggleSelection(item.id);
          }}
          className={`absolute top-2 right-2 z-10 inline-flex items-center justify-center h-7 w-7 rounded-full border backdrop-blur-sm transition-colors ${
            isSelected
              ? 'bg-rose-500 text-white border-rose-500'
              : 'bg-white/80 dark:bg-slate-900/60 text-slate-500 dark:text-slate-300 border-slate-200/60 dark:border-white/10 hover:text-accent hover:border-accent/50'
          }`}
          aria-label={toggleLabel}
          title={toggleLabel}
        >
          {isSelected ? <CheckSquare size={16} /> : <Square size={16} />}
        </button>
        {cardElement}
      </div>
    );
  };

  const cardList = (
    <>
      {sortedItems.length === 0 ? (
        <div className="text-center py-8 text-sm text-slate-400 dark:text-slate-500">
          {t('modals.countdown.noCountdowns')}
        </div>
      ) : isDndEnabled ? (
        <DndContext
          sensors={dndSensors}
          collisionDetection={closestCorners}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={sortedItems.map((vm) => vm.item.id)}
            strategy={rectSortingStrategy}
          >
            <div className={containerClassName}>
              {sortedItems.map((vm) => (
                <SortableReminderCard key={vm.item.id} id={vm.item.id} isSortingMode>
                  {renderCard(vm)}
                </SortableReminderCard>
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <div className={containerClassName}>{sortedItems.map((vm) => renderCard(vm))}</div>
      )}
    </>
  );

  return (
    <section className="pt-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 pb-3 border-b border-slate-200/50 dark:border-white/5">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-accent/10">
            <Clock size={16} className="text-accent" />
          </div>
          <h2 className="text-base font-semibold text-slate-700 dark:text-slate-200">
            {t('modals.countdown.sectionTitle')}
          </h2>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {/* View Style Icon Toggle Group */}
          <div className="hidden md:flex items-center p-1 rounded-xl bg-white/50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/50 backdrop-blur-sm">
            {[
              { value: 'compact' as const, icon: <List size={14} /> },
              { value: 'card' as const, icon: <LayoutGrid size={14} /> },
              { value: 'ring' as const, icon: <Circle size={14} /> },
              { value: 'flip' as const, icon: <Timer size={14} /> },
            ].map((vs) => (
              <button
                key={vs.value}
                type="button"
                onClick={() => setViewStyle(vs.value)}
                className={`p-1.5 rounded-lg transition-all ${
                  viewStyle === vs.value
                    ? 'bg-white dark:bg-slate-700 text-accent shadow-sm ring-1 ring-black/5 dark:ring-white/10'
                    : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100/50 dark:hover:bg-slate-700/50'
                }`}
                title={t(
                  `modals.countdown.style${vs.value.charAt(0).toUpperCase() + vs.value.slice(1)}` as 'modals.countdown.styleCompact',
                )}
                aria-label={t(
                  `modals.countdown.style${vs.value.charAt(0).toUpperCase() + vs.value.slice(1)}` as 'modals.countdown.styleCompact',
                )}
                aria-pressed={viewStyle === vs.value}
              >
                {vs.icon}
              </button>
            ))}
          </div>

          {/* Sort Mode Dropdown */}
          <DropdownPanel
            value={sortMode}
            options={[
              { value: 'remaining', label: t('modals.countdown.sortByRemaining') },
              { value: 'created', label: t('modals.countdown.sortByCreated') },
              { value: 'custom', label: t('modals.countdown.sortByCustom') },
            ]}
            onChange={setSortMode}
            ariaLabel={t('modals.countdown.sortMode')}
            title={t('modals.countdown.sortMode')}
          />

          {statusFilter !== 'archived' && isAdmin && !isBatchMode && (
            <button
              type="button"
              onClick={handleEnterBatchMode}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full border border-slate-200/60 dark:border-slate-700/60 text-slate-600 dark:text-slate-400 hover:text-accent hover:border-accent/50 bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm transition-all"
              title={t('modals.countdown.batchEdit')}
              aria-label={t('modals.countdown.batchEdit')}
            >
              <CheckSquare size={12} />
              {t('modals.countdown.batchEdit')}
            </button>
          )}

          {isAdmin && (
            <button
              type="button"
              onClick={onAdd}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full border border-slate-200/60 dark:border-slate-700/60 text-slate-600 dark:text-slate-400 hover:text-accent hover:border-accent/50 bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm transition-all"
            >
              <Plus size={12} />
              {t('modals.countdown.addCountdown')}
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <DropdownPanel
            value={statusFilter}
            options={[
              { value: 'all', label: t('modals.countdown.statusAll') },
              { value: 'active', label: t('modals.countdown.statusActive') },
              { value: 'expired', label: t('modals.countdown.statusExpired') },
              { value: 'archived', label: t('modals.countdown.statusArchived') },
            ]}
            onChange={(v) => setStatusFilter(v as ReminderStatusFilter)}
            ariaLabel={t('modals.countdown.status')}
            title={t('modals.countdown.status')}
          />

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              aria-label={t('modals.countdown.dateFrom')}
              title={t('modals.countdown.timeRangeHint')}
              className="px-3 py-1.5 text-xs font-medium rounded-full border border-slate-200/60 dark:border-slate-700/60 text-slate-600 dark:text-slate-300 bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm hover:border-accent/50 transition-all"
            />
            <span className="text-xs text-slate-400 dark:text-slate-500">-</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              aria-label={t('modals.countdown.dateTo')}
              title={t('modals.countdown.timeRangeHint')}
              className="px-3 py-1.5 text-xs font-medium rounded-full border border-slate-200/60 dark:border-slate-700/60 text-slate-600 dark:text-slate-300 bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm hover:border-accent/50 transition-all"
            />
            {(dateFrom || dateTo) && (
              <button
                type="button"
                onClick={() => {
                  setDateFrom('');
                  setDateTo('');
                }}
                className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/40 transition-colors"
                aria-label={t('common.clear')}
                title={t('common.clear')}
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {t('modals.countdown.labelColor')}:
          </span>

          <button
            type="button"
            onClick={() => setSelectedLabelColors([])}
            aria-pressed={selectedLabelColors.length === 0}
            className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-all ${
              selectedLabelColors.length === 0
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-slate-200/60 dark:border-slate-700/60 text-slate-500 dark:text-slate-400 hover:border-accent/50 hover:text-accent bg-white/60 dark:bg-slate-800/60'
            }`}
          >
            {t('modals.countdown.statusAll')}
          </button>

          <button
            type="button"
            onClick={() =>
              setSelectedLabelColors((prev) => {
                if (prev.includes(LABEL_COLOR_NONE_FILTER)) {
                  return prev.filter((c) => c !== LABEL_COLOR_NONE_FILTER);
                }
                return [...prev, LABEL_COLOR_NONE_FILTER];
              })
            }
            aria-pressed={selectedLabelColors.includes(LABEL_COLOR_NONE_FILTER)}
            className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-all ${
              selectedLabelColors.includes(LABEL_COLOR_NONE_FILTER)
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-slate-200/60 dark:border-slate-700/60 text-slate-500 dark:text-slate-400 hover:border-accent/50 hover:text-accent bg-white/60 dark:bg-slate-800/60'
            }`}
            title={t('modals.countdown.labelColorNone')}
          >
            {t('modals.countdown.labelColorNone')}
          </button>

          {LABEL_COLOR_ORDER.map((color) => {
            const isSelected = selectedLabelColors.includes(color);
            const label = t(labelColorNameKeys[color]);
            return (
              <button
                key={color}
                type="button"
                onClick={() =>
                  setSelectedLabelColors((prev) => {
                    if (prev.includes(color)) return prev.filter((c) => c !== color);
                    return [...prev, color];
                  })
                }
                aria-pressed={isSelected}
                aria-label={label}
                title={label}
                className={`inline-flex items-center justify-center h-8 w-8 rounded-full border backdrop-blur-sm transition-all ${
                  isSelected
                    ? 'border-accent bg-accent/10'
                    : 'border-slate-200/60 dark:border-slate-700/60 bg-white/60 dark:bg-slate-800/60 hover:border-accent/50'
                }`}
              >
                <span
                  className={`inline-block w-3 h-3 rounded-full ${labelDotClasses[color]} ring-2 ring-white/60 dark:ring-slate-900/60`}
                />
              </button>
            );
          })}
        </div>
      </div>

      {/* Tag Filter Pills */}
      {(allTags.length > 0 || selectedTags.length > 0) && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <button
            type="button"
            onClick={() => setSelectedTags([])}
            className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-all ${
              selectedTags.length === 0
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-slate-200/60 dark:border-slate-700/60 text-slate-500 dark:text-slate-400 hover:border-accent/50 hover:text-accent bg-white/60 dark:bg-slate-800/60'
            }`}
          >
            {t('modals.countdown.groupAll')}
          </button>

          <div className="inline-flex items-center rounded-full border border-slate-200/60 dark:border-slate-700/60 bg-white/60 dark:bg-slate-800/60 overflow-hidden">
            <button
              type="button"
              onClick={() => setTagFilterMode('any')}
              className={`px-3 py-1.5 text-xs font-medium transition-all ${
                tagFilterMode === 'any'
                  ? 'bg-accent/10 text-accent'
                  : 'text-slate-500 dark:text-slate-400 hover:text-accent'
              }`}
              aria-pressed={tagFilterMode === 'any'}
              title={t('modals.countdown.tagFilterAny')}
            >
              {t('modals.countdown.tagFilterAny')}
            </button>
            <button
              type="button"
              onClick={() => setTagFilterMode('all')}
              className={`px-3 py-1.5 text-xs font-medium transition-all ${
                tagFilterMode === 'all'
                  ? 'bg-accent/10 text-accent'
                  : 'text-slate-500 dark:text-slate-400 hover:text-accent'
              }`}
              aria-pressed={tagFilterMode === 'all'}
              title={t('modals.countdown.tagFilterAll')}
            >
              {t('modals.countdown.tagFilterAll')}
            </button>
          </div>

          {allTags.map((tag) => {
            const isSelected = selectedTags.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() =>
                  setSelectedTags((prev) => {
                    const normalized = tag.trim();
                    if (!normalized) return prev;
                    if (prev.includes(normalized)) return prev.filter((t) => t !== normalized);
                    return [...prev, normalized];
                  })
                }
                className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-all ${
                  isSelected
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-slate-200/60 dark:border-slate-700/60 text-slate-500 dark:text-slate-400 hover:border-accent/50 hover:text-accent bg-white/60 dark:bg-slate-800/60'
                }`}
              >
                {tag}
              </button>
            );
          })}
        </div>
      )}

      {/* Summary Stats Bar */}
      {statusFilter !== 'archived' && sortedItems.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {statusFilter === 'expired' ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400">
              {t('modals.countdown.statsOverdue')} {sortedItems.length}
            </span>
          ) : (
            summaryStats && (
              <>
                <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                  {t('modals.countdown.statsTotalActive')} {summaryStats.totalActive}
                </span>
                {summaryStats.expiringSoon > 0 && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400">
                    {t('modals.countdown.statsExpiringSoon')} {summaryStats.expiringSoon}
                  </span>
                )}
                {summaryStats.expiringThisMonth > 0 && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                    {t('modals.countdown.statsExpiringThisMonth')} {summaryStats.expiringThisMonth}
                  </span>
                )}
                {summaryStats.overdueCount > 0 && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400">
                    {t('modals.countdown.statsOverdue')} {summaryStats.overdueCount}
                  </span>
                )}
              </>
            )
          )}
        </div>
      )}

      {/* Batch Edit Toolbar (Active Items only) */}
      {statusFilter !== 'archived' && isAdmin && isBatchMode && (
        <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 rounded-2xl bg-white/60 dark:bg-slate-800/50 border border-slate-200/60 dark:border-white/8 backdrop-blur-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">
              {t('linkSections.selectedCount', { count: selectedCount })}
            </span>

            <button
              type="button"
              onClick={handleToggleSelectAll}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full border border-slate-200/60 dark:border-slate-700/60 text-slate-600 dark:text-slate-300 hover:text-accent hover:border-accent/50 bg-white/60 dark:bg-slate-900/40 transition-all"
              title={isAllSelected ? t('common.deselectAll') : t('common.selectAll')}
              aria-label={isAllSelected ? t('common.deselectAll') : t('common.selectAll')}
            >
              <CheckSquare size={14} />
              {isAllSelected ? t('common.deselectAll') : t('common.selectAll')}
            </button>

            <button
              type="button"
              onClick={handleBatchArchive}
              disabled={!hasSelection || (!onBatchArchive && !onArchive)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full border border-slate-200/60 dark:border-slate-700/60 text-slate-600 dark:text-slate-300 hover:text-emerald-600 hover:border-emerald-500/40 bg-white/60 dark:bg-slate-900/40 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              title={t('modals.countdown.batchArchive')}
              aria-label={t('modals.countdown.batchArchive')}
            >
              <Archive size={14} />
              {t('modals.countdown.batchArchive')}
            </button>

            <button
              type="button"
              onClick={handleBatchDelete}
              disabled={!hasSelection}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full border border-slate-200/60 dark:border-slate-700/60 text-slate-600 dark:text-slate-300 hover:text-red-600 hover:border-red-500/40 bg-white/60 dark:bg-slate-900/40 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              title={t('modals.countdown.batchDelete')}
              aria-label={t('modals.countdown.batchDelete')}
            >
              <Trash2 size={14} />
              {t('modals.countdown.batchDelete')}
            </button>

            {!isCreatingBatchTag ? (
              <>
                <select
                  value={batchAddTagSelection}
                  onChange={(e) => handleBatchAddTagChange(e.target.value)}
                  disabled={!hasSelection || !onBatchUpdateTags}
                  className="px-3 py-1.5 text-xs font-medium rounded-full border border-slate-200/60 dark:border-slate-700/60 text-slate-600 dark:text-slate-300 bg-white/60 dark:bg-slate-900/40 hover:border-accent/50 transition-all appearance-none cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                  aria-label={t('modals.countdown.batchAddTag')}
                  title={t('modals.countdown.batchAddTag')}
                >
                  <option value={BATCH_TAG_PLACEHOLDER} disabled>
                    {t('modals.countdown.batchAddTag')}
                  </option>
                  {allTags.map((tag) => (
                    <option key={tag} value={tag}>
                      {tag}
                    </option>
                  ))}
                  <option value="__new__">{t('modals.countdown.groupNew')}</option>
                </select>

                <select
                  value={batchRemoveTagSelection}
                  onChange={(e) => handleBatchRemoveTagChange(e.target.value)}
                  disabled={!hasSelection || !onBatchUpdateTags || allTags.length === 0}
                  className="px-3 py-1.5 text-xs font-medium rounded-full border border-slate-200/60 dark:border-slate-700/60 text-slate-600 dark:text-slate-300 bg-white/60 dark:bg-slate-900/40 hover:border-accent/50 transition-all appearance-none cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                  aria-label={t('modals.countdown.batchRemoveTag')}
                  title={t('modals.countdown.batchRemoveTag')}
                >
                  <option value={BATCH_REMOVE_TAG_PLACEHOLDER} disabled>
                    {t('modals.countdown.batchRemoveTag')}
                  </option>
                  {allTags.map((tag) => (
                    <option key={tag} value={tag}>
                      {tag}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={handleBatchClearTags}
                  disabled={!hasSelection || !onBatchUpdateTags}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full border border-slate-200/60 dark:border-slate-700/60 text-slate-600 dark:text-slate-300 hover:text-amber-600 hover:border-amber-500/40 bg-white/60 dark:bg-slate-900/40 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                  title={t('modals.countdown.batchClearTags')}
                  aria-label={t('modals.countdown.batchClearTags')}
                >
                  <X size={14} />
                  {t('modals.countdown.batchClearTags')}
                </button>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newBatchTagName}
                  onChange={(e) => setNewBatchTagName(e.target.value)}
                  placeholder={t('modals.countdown.groupNewPlaceholder')}
                  className="w-44 px-3 py-1.5 text-xs rounded-full border border-slate-200/60 dark:border-slate-700/60 bg-white/70 dark:bg-slate-900/50 text-slate-700 dark:text-slate-200"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const name = newBatchTagName.trim();
                      if (name) {
                        applyBatchTags({ kind: 'add', tag: name });
                      }
                    } else if (e.key === 'Escape') {
                      setIsCreatingBatchTag(false);
                      setNewBatchTagName('');
                      setBatchAddTagSelection(BATCH_TAG_PLACEHOLDER);
                      setBatchRemoveTagSelection(BATCH_REMOVE_TAG_PLACEHOLDER);
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    const name = newBatchTagName.trim();
                    if (name) applyBatchTags({ kind: 'add', tag: name });
                  }}
                  className="px-3 py-1.5 text-xs font-semibold rounded-full border border-slate-200/60 dark:border-slate-700/60 text-slate-700 dark:text-slate-200 hover:border-accent/50 hover:text-accent transition-all"
                >
                  {t('common.confirm')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsCreatingBatchTag(false);
                    setNewBatchTagName('');
                    setBatchAddTagSelection(BATCH_TAG_PLACEHOLDER);
                    setBatchRemoveTagSelection(BATCH_REMOVE_TAG_PLACEHOLDER);
                  }}
                  className="px-3 py-1.5 text-xs font-semibold rounded-full border border-slate-200/60 dark:border-slate-700/60 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-all"
                >
                  {t('common.cancel')}
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleExitBatchMode}
            className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full border border-slate-200/60 dark:border-slate-700/60 text-slate-500 dark:text-slate-300 hover:text-slate-700 dark:hover:text-slate-200 bg-white/60 dark:bg-slate-900/40 transition-all"
            title={t('modals.countdown.exitBatchEdit')}
            aria-label={t('modals.countdown.exitBatchEdit')}
          >
            <X size={14} />
            {t('modals.countdown.exitBatchEdit')}
          </button>
        </div>
      )}

      {statusFilter !== 'archived' && (
        <>
          {/* Active Items */}
          {cardList}
        </>
      )}

      {/* Archived Section */}
      {statusFilter === 'archived' ? (
        <div className="mt-6 border-t border-slate-200/50 dark:border-white/5 pt-4">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-500 dark:text-slate-400">
            <Archive size={14} />
            {t('modals.countdown.statusArchived')}{' '}
            <span className="text-[11px] text-slate-400 dark:text-slate-500">
              ({filteredArchivedItems.length})
            </span>
          </div>

          {filteredArchivedItems.length === 0 ? (
            <div className="text-center py-8 text-sm text-slate-400 dark:text-slate-500">
              {t('modals.countdown.archivedEmpty')}
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              {filteredArchivedItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-slate-50/60 dark:bg-slate-800/30 border border-slate-200/40 dark:border-white/5"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <LabelDot color={item.labelColor} />
                    <span className="text-sm text-slate-600 dark:text-slate-300 truncate">
                      {item.title}
                    </span>
                    <TagBadges tags={item.tags} />
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 whitespace-nowrap">
                      {item.archivedAt ? new Date(item.archivedAt).toLocaleDateString() : ''}
                    </span>
                  </div>

                  {isAdmin && (
                    <div className="flex items-center gap-1 shrink-0">
                      {onRestore && (
                        <button
                          type="button"
                          onClick={() => onRestore(item.id)}
                          className="p-1.5 text-slate-400 hover:text-emerald-600 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors"
                          title={t('modals.countdown.restoreItem')}
                        >
                          <RotateCcw size={14} />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handlePermanentDelete(item)}
                        className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                        title={t('modals.countdown.permanentDelete')}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : statusFilter === 'all' && filteredArchivedItems.length > 0 ? (
        <div className="mt-6 border-t border-slate-200/50 dark:border-white/5 pt-4">
          <button
            type="button"
            onClick={() => setArchivedExpanded(!archivedExpanded)}
            className="flex items-center gap-2 text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
          >
            {archivedExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            {t('modals.countdown.archivedSection', { count: filteredArchivedItems.length })}
          </button>

          {archivedExpanded && (
            <div className="mt-3 space-y-2">
              {filteredArchivedItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-slate-50/60 dark:bg-slate-800/30 border border-slate-200/40 dark:border-white/5"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <LabelDot color={item.labelColor} />
                    <span className="text-sm text-slate-600 dark:text-slate-300 truncate">
                      {item.title}
                    </span>
                    <TagBadges tags={item.tags} />
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 whitespace-nowrap">
                      {item.archivedAt ? new Date(item.archivedAt).toLocaleDateString() : ''}
                    </span>
                  </div>

                  {isAdmin && (
                    <div className="flex items-center gap-1 shrink-0">
                      {onRestore && (
                        <button
                          type="button"
                          onClick={() => onRestore(item.id)}
                          className="p-1.5 text-slate-400 hover:text-emerald-600 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors"
                          title={t('modals.countdown.restoreItem')}
                        >
                          <RotateCcw size={14} />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handlePermanentDelete(item)}
                        className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                        title={t('modals.countdown.permanentDelete')}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
};

export default memo(ReminderBoardSection);
