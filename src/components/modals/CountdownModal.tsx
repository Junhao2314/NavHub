import { X } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { useI18n } from '../../hooks/useI18n';
import type { CountdownItem, CountdownRecurrence } from '../../types';

const DEFAULT_REMINDER_MINUTES = [60, 10, 0] as const;
const MAX_REMINDERS_PER_ITEM = 10;

const normalizeReminderMinutes = (value: unknown): number[] => {
  if (!Array.isArray(value)) return [...DEFAULT_REMINDER_MINUTES];

  const minutes: number[] = [];
  const seen = new Set<number>();

  for (const raw of value) {
    if (minutes.length >= MAX_REMINDERS_PER_ITEM) break;
    if (typeof raw !== 'number' || !Number.isFinite(raw)) continue;
    const next = Math.floor(raw);
    if (next < 0) continue;
    if (seen.has(next)) continue;
    seen.add(next);
    minutes.push(next);
  }

  minutes.sort((a, b) => b - a);
  return minutes;
};

interface CountdownModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Omit<CountdownItem, 'id' | 'createdAt'>) => void;
  initialData?: Partial<CountdownItem>;
  closeOnBackdrop?: boolean;
}

const CountdownModal: React.FC<CountdownModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialData,
  closeOnBackdrop = true,
}) => {
  const { t } = useI18n();
  const isEditMode = Boolean(initialData?.id);

  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [recurrence, setRecurrence] = useState<CountdownRecurrence>('once');
  const [reminderMinutes, setReminderMinutes] = useState<number[]>([...DEFAULT_REMINDER_MINUTES]);
  const [reminderInput, setReminderInput] = useState('');

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setTitle(initialData.title || '');
        setNote(initialData.note || '');
        setTargetDate(
          initialData.targetDate
            ? initialData.targetDate.slice(0, 16) // datetime-local format
            : '',
        );
        setRecurrence(initialData.recurrence || 'once');
        setReminderMinutes(normalizeReminderMinutes(initialData.reminderMinutes));
        setReminderInput('');
      } else {
        setTitle('');
        setNote('');
        setTargetDate('');
        setRecurrence('once');
        setReminderMinutes([...DEFAULT_REMINDER_MINUTES]);
        setReminderInput('');
      }
    }
  }, [isOpen, initialData]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !targetDate) return;

    onSave({
      title,
      note: note || undefined,
      targetDate: new Date(targetDate).toISOString(),
      recurrence,
      reminderMinutes,
      hidden: initialData?.hidden,
      order: initialData?.order,
    });
    onClose();
  };

  if (!isOpen) return null;

  const recurrenceOptions: { value: CountdownRecurrence; label: string }[] = [
    { value: 'once', label: t('modals.countdown.once') },
    { value: 'daily', label: t('modals.countdown.daily') },
    { value: 'weekly', label: t('modals.countdown.weekly') },
    { value: 'monthly', label: t('modals.countdown.monthly') },
    { value: 'yearly', label: t('modals.countdown.yearly') },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm transition-opacity duration-300"
      onClick={closeOnBackdrop ? onClose : undefined}
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-100 dark:border-slate-800 transition-transform duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center px-6 py-5 border-b border-slate-100 dark:border-slate-800/50">
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 tracking-tight">
            {isEditMode ? t('modals.countdown.editCountdown') : t('modals.countdown.addCountdown')}
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
          >
            <X size={20} strokeWidth={2} />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
              {t('modals.countdown.title')}
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm font-medium"
              placeholder={t('modals.countdown.title')}
            />
          </div>

          {/* Note */}
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
              {t('modals.countdown.note')}
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-sm min-h-[60px] resize-none"
              placeholder={t('modals.countdown.notePlaceholder')}
            />
          </div>

          {/* Target Date */}
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
              {t('modals.countdown.targetDate')}
            </label>
            <input
              type="datetime-local"
              required
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm"
            />
          </div>

          {/* Recurrence */}
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
              {t('modals.countdown.recurrence')}
            </label>
            <select
              value={recurrence}
              onChange={(e) => setRecurrence(e.target.value as CountdownRecurrence)}
              className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm appearance-none cursor-pointer"
            >
              {recurrenceOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Reminders */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                {t('modals.countdown.reminders')}
              </label>
              <span className="text-[10px] text-slate-400 dark:text-slate-500">
                {t('modals.countdown.remindersHint')}
              </span>
            </div>

            <div className="flex flex-wrap gap-2 mb-3">
              {reminderMinutes.map((minutes) => (
                <span
                  key={minutes}
                  className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs border border-slate-200/60 dark:border-slate-700/60"
                >
                  <span className="font-mono">
                    {minutes === 0
                      ? t('modals.countdown.atTime')
                      : t('modals.countdown.reminderChip', { minutes })}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setReminderMinutes((prev) => prev.filter((value) => value !== minutes));
                    }}
                    className="text-slate-400 hover:text-red-500 transition-colors"
                    aria-label={t('common.delete')}
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>

            <div className="flex gap-2">
              <input
                type="number"
                min={0}
                value={reminderInput}
                onChange={(e) => setReminderInput(e.target.value)}
                className="flex-1 px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm font-mono"
                placeholder={t('modals.countdown.reminderPlaceholder')}
              />
              <button
                type="button"
                onClick={() => {
                  const next = Number.parseInt(reminderInput, 10);
                  if (!Number.isFinite(next) || Number.isNaN(next) || next < 0) return;
                  setReminderMinutes((prev) => {
                    if (prev.includes(next)) return prev;
                    if (prev.length >= MAX_REMINDERS_PER_ITEM) return prev;
                    const updated = [...prev, next].sort((a, b) => b - a);
                    return updated;
                  });
                  setReminderInput('');
                }}
                className="px-4 py-3 rounded-xl text-sm font-semibold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-accent hover:border-accent/50 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
              >
                {t('modals.countdown.addReminder')}
              </button>
            </div>
          </div>

          {/* Submit */}
          <div className="pt-2">
            <button
              type="submit"
              className="w-full bg-slate-900 dark:bg-accent text-white font-bold py-3.5 px-4 rounded-xl hover:bg-slate-800 dark:hover:bg-accent/90 transition-all shadow-lg shadow-slate-200 dark:shadow-none active:scale-[0.99] text-sm"
            >
              {t('modals.countdown.saveCountdown')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CountdownModal;
