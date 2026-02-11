import { Clock, Edit3, Eye, EyeOff, Plus, Trash2 } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { useI18n } from '../../hooks/useI18n';
import type { CountdownItem } from '../../types';
import {
  type CountdownRemaining,
  type CountdownUrgency,
  getCountdownRemaining,
} from '../../utils/countdown';
import { useDialog } from '../ui/DialogProvider';

interface CountdownSectionProps {
  countdowns: CountdownItem[];
  isAdmin: boolean;
  onAdd: () => void;
  onEdit: (item: CountdownItem) => void;
  onDelete: (id: string) => void;
  onToggleHidden: (id: string) => void;
}

const urgencyColors: Record<CountdownUrgency, string> = {
  critical: 'text-red-500 dark:text-red-400',
  warning: 'text-amber-500 dark:text-amber-400',
  normal: 'text-accent',
};

const urgencyBgColors: Record<CountdownUrgency, string> = {
  critical: 'border-red-200 dark:border-red-800/50 bg-red-50/50 dark:bg-red-900/10',
  warning: 'border-amber-200 dark:border-amber-800/50 bg-amber-50/50 dark:bg-amber-900/10',
  normal: 'border-slate-200/60 dark:border-white/8 bg-white/60 dark:bg-slate-800/40',
};

const formatRemaining = (
  remaining: CountdownRemaining,
  t: (key: string, options?: Record<string, unknown>) => string,
): string => {
  if (remaining.isPast) return t('modals.countdown.expired');
  if (remaining.days === 0 && remaining.hours === 0 && remaining.minutes === 0) {
    return t('modals.countdown.secondsLeft', { count: remaining.seconds });
  }
  if (remaining.days === 0 && remaining.hours === 0) {
    return t('modals.countdown.minutesLeft', { count: remaining.minutes });
  }
  if (remaining.days === 0) {
    return `${t('modals.countdown.hoursLeft', { count: remaining.hours })} ${t('modals.countdown.minutesLeft', { count: remaining.minutes })}`;
  }
  return `${t('modals.countdown.daysLeft', { count: remaining.days })} ${t('modals.countdown.hoursLeft', { count: remaining.hours })}`;
};

const CountdownCard: React.FC<{
  item: CountdownItem;
  remaining: CountdownRemaining;
  isAdmin: boolean;
  onEdit: (item: CountdownItem) => void;
  onDelete: (id: string) => void;
  onToggleHidden: (id: string) => void;
}> = ({ item, remaining, isAdmin, onEdit, onDelete, onToggleHidden }) => {
  const { t } = useI18n();
  const { confirm } = useDialog();

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

  const urgency = remaining.isPast ? 'critical' : remaining.urgency;

  return (
    <div
      className={`relative rounded-xl border backdrop-blur-sm p-4 transition-all duration-300 ${urgencyBgColors[urgency]}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
              {item.title}
            </h4>
            {item.hidden && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500">
                {t('modals.countdown.hidden')}
              </span>
            )}
          </div>
          {item.note && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
              {item.note}
            </p>
          )}
          <div className={`text-lg font-bold mt-1 ${urgencyColors[urgency]}`}>
            {formatRemaining(remaining, t)}
          </div>
        </div>

        {isAdmin && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => onToggleHidden(item.id)}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title={t('modals.countdown.toggleVisibility')}
            >
              {item.hidden ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
            <button
              type="button"
              onClick={() => onEdit(item)}
              className="p-1.5 text-slate-400 hover:text-accent rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title={t('common.edit')}
            >
              <Edit3 size={14} />
            </button>
            <button
              type="button"
              onClick={handleDelete}
              className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              title={t('common.delete')}
            >
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

const CountdownSection: React.FC<CountdownSectionProps> = ({
  countdowns,
  isAdmin,
  onAdd,
  onEdit,
  onDelete,
  onToggleHidden,
}) => {
  const { t } = useI18n();
  const [, setTick] = useState(0);

  // Update every second
  useEffect(() => {
    const timer = setInterval(() => setTick((prev) => prev + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  // Filter visible countdowns for non-admin
  const visibleCountdowns = isAdmin ? countdowns : countdowns.filter((item) => !item.hidden);
  const sortedCountdowns = visibleCountdowns
    .map((item) => ({
      item,
      remaining: getCountdownRemaining(item.targetDate, item.recurrence),
    }))
    .sort((a, b) => {
      if (a.remaining.isPast !== b.remaining.isPast) return a.remaining.isPast ? 1 : -1;
      if (a.remaining.isPast && b.remaining.isPast)
        return b.remaining.totalMs - a.remaining.totalMs;
      return a.remaining.totalMs - b.remaining.totalMs;
    });

  if (visibleCountdowns.length === 0 && !isAdmin) return null;

  return (
    <section className="pt-6">
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-200/50 dark:border-white/5">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-accent/10">
            <Clock size={16} className="text-accent" />
          </div>
          <h2 className="text-base font-semibold text-slate-700 dark:text-slate-200">
            {t('modals.countdown.sectionTitle')}
          </h2>
        </div>
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

      {sortedCountdowns.length === 0 ? (
        <div className="text-center py-8 text-sm text-slate-400 dark:text-slate-500">
          {t('modals.countdown.noCountdowns')}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {sortedCountdowns.map(({ item, remaining }) => (
            <CountdownCard
              key={item.id}
              item={item}
              remaining={remaining}
              isAdmin={isAdmin}
              onEdit={onEdit}
              onDelete={onDelete}
              onToggleHidden={onToggleHidden}
            />
          ))}
        </div>
      )}
    </section>
  );
};

export default React.memo(CountdownSection);
