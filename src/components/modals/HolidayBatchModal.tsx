import { X } from 'lucide-react';
import { DateTime } from 'luxon';
import React, { useMemo, useState } from 'react';
import type { HolidayEntry } from '../../data/holidays';
import { computeHolidayTargetDate, HOLIDAYS } from '../../data/holidays';
import { useI18n } from '../../hooks/useI18n';
import type { CountdownItem } from '../../types';
import { normalizeTimeZone } from '../../utils/timezone';

interface HolidayBatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBatchAdd: (items: Omit<CountdownItem, 'id' | 'createdAt'>[]) => void;
  existingTitles: string[];
  closeOnBackdrop?: boolean;
  timeZone?: string;
}

const HolidayBatchModal: React.FC<HolidayBatchModalProps> = ({
  isOpen,
  onClose,
  onBatchAdd,
  existingTitles,
  closeOnBackdrop = true,
  timeZone,
}) => {
  const { t, i18n } = useI18n();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const zone = normalizeTimeZone(timeZone ?? 'Asia/Shanghai');
  const lang = i18n.language;

  const existingSet = useMemo(
    () => new Set(existingTitles.map((t) => t.toLowerCase())),
    [existingTitles],
  );

  const isAlreadyAdded = (entry: HolidayEntry) => {
    const name = lang === 'zh-CN' ? entry.nameZh : entry.nameEn;
    return (
      existingSet.has(name.toLowerCase()) ||
      existingSet.has(entry.nameZh.toLowerCase()) ||
      existingSet.has(entry.nameEn.toLowerCase())
    );
  };

  const chineseHolidays = HOLIDAYS.filter((h) => h.category === 'chinese_legal');
  const internationalHolidays = HOLIDAYS.filter((h) => h.category === 'international');

  const toggleItem = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleCategory = (entries: HolidayEntry[], selectAll: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const entry of entries) {
        if (isAlreadyAdded(entry)) continue;
        if (selectAll) next.add(entry.id);
        else next.delete(entry.id);
      }
      return next;
    });
  };

  const handleAdd = () => {
    const items: Omit<CountdownItem, 'id' | 'createdAt'>[] = [];
    for (const entry of HOLIDAYS) {
      if (!selected.has(entry.id)) continue;
      const { targetLocal, targetDate } = computeHolidayTargetDate(entry, zone);
      items.push({
        title: lang === 'zh-CN' ? entry.nameZh : entry.nameEn,
        targetDate,
        targetLocal,
        timeZone: zone,
        precision: entry.precision,
        rule: entry.rule,
        reminderMinutes: [0],
        labelColor: entry.labelColor,
      });
    }
    if (items.length > 0) {
      onBatchAdd(items);
    }
    setSelected(new Set());
    onClose();
  };

  const formatNextDate = (entry: HolidayEntry) => {
    const { targetLocal } = computeHolidayTargetDate(entry, zone);
    const dt = DateTime.fromISO(targetLocal, { zone });
    if (!dt.isValid) return '';
    return dt.toFormat('yyyy-MM-dd');
  };

  const renderCategory = (title: string, entries: HolidayEntry[]) => {
    const selectableEntries = entries.filter((e) => !isAlreadyAdded(e));
    const allSelected =
      selectableEntries.length > 0 && selectableEntries.every((e) => selected.has(e.id));

    return (
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            {title}
          </h4>
          {selectableEntries.length > 0 && (
            <button
              type="button"
              onClick={() => toggleCategory(entries, !allSelected)}
              className="text-[10px] font-medium text-accent hover:text-accent/80 transition-colors"
            >
              {allSelected
                ? t('modals.countdown.holidaysDeselectAll')
                : t('modals.countdown.holidaysSelectAll')}
            </button>
          )}
        </div>
        <div className="space-y-1">
          {entries.map((entry) => {
            const exists = isAlreadyAdded(entry);
            const checked = selected.has(entry.id);
            const name = lang === 'zh-CN' ? entry.nameZh : entry.nameEn;
            const nextDate = formatNextDate(entry);

            return (
              <label
                key={entry.id}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors cursor-pointer ${
                  exists
                    ? 'opacity-50 cursor-not-allowed'
                    : checked
                      ? 'bg-accent/5 border border-accent/20'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 border border-transparent'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={exists}
                  onChange={() => toggleItem(entry.id)}
                  className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-accent focus:ring-accent/20"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">
                      {name}
                    </span>
                    {exists && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 shrink-0">
                        {t('modals.countdown.holidaysAlreadyExists')}
                      </span>
                    )}
                  </div>
                  {nextDate && (
                    <span className="text-[11px] text-slate-400 dark:text-slate-500">
                      {t('modals.countdown.holidaysNextDate', { date: nextDate })}
                    </span>
                  )}
                </div>
              </label>
            );
          })}
        </div>
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm transition-opacity duration-300"
      onClick={closeOnBackdrop ? onClose : undefined}
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-100 dark:border-slate-800 transition-transform duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center px-6 py-5 border-b border-slate-100 dark:border-slate-800/50">
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 tracking-tight">
            {t('modals.countdown.holidaysBatchTitle')}
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
          >
            <X size={20} strokeWidth={2} />
          </button>
        </div>

        <div className="p-6 max-h-[60vh] overflow-y-auto">
          {renderCategory(t('modals.countdown.templateChinese'), chineseHolidays)}
          {renderCategory(t('modals.countdown.templateInternational'), internationalHolidays)}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800/50 flex items-center justify-between">
          <span className="text-xs text-slate-400 dark:text-slate-500">
            {t('modals.countdown.holidaysSelectedCount', { count: selected.size })}
          </span>
          <button
            type="button"
            onClick={handleAdd}
            disabled={selected.size === 0}
            className="px-4 py-2 bg-slate-900 dark:bg-accent text-white font-bold rounded-xl hover:bg-slate-800 dark:hover:bg-accent/90 transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t('modals.countdown.holidaysAddSelected')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default HolidayBatchModal;
