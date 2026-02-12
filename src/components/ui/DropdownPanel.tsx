import { Check, ChevronDown } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';

export interface DropdownOption<T extends string = string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
}

interface DropdownPanelProps<T extends string = string> {
  value: T;
  options: DropdownOption<T>[];
  onChange: (value: T) => void;
  ariaLabel?: string;
  title?: string;
  className?: string;
}

function DropdownPanel<T extends string = string>({
  value,
  options,
  onChange,
  ariaLabel,
  title,
  className,
}: DropdownPanelProps<T>) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);

  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
      setOpen(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [open, handleClickOutside]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const currentIndex = options.findIndex((o) => o.value === value);
        const delta = e.key === 'ArrowDown' ? 1 : -1;
        const nextIndex = (currentIndex + delta + options.length) % options.length;
        onChange(options[nextIndex].value);
      }
    },
    [options, value, onChange],
  );

  return (
    <div className={`relative ${className ?? ''}`} ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={handleKeyDown}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full border transition-all ${
          open
            ? 'border-accent bg-accent/10 text-accent'
            : 'border-slate-200/60 dark:border-slate-700/60 text-slate-600 dark:text-slate-300 bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm hover:border-accent/50'
        }`}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        title={title}
      >
        {selected?.icon}
        <span>{selected?.label ?? ''}</span>
        <ChevronDown
          size={12}
          className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          className="absolute left-0 top-full mt-1.5 z-[60] min-w-[140px] py-1 rounded-xl border border-slate-200/60 dark:border-slate-700/60 bg-white/95 dark:bg-slate-800/95 backdrop-blur-xl shadow-xl animate-in fade-in slide-in-from-top-1 duration-150"
          role="listbox"
          aria-activedescendant={value}
        >
          {options.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                id={opt.value}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={`flex items-center gap-2 w-full px-3 py-2 text-xs transition-colors ${
                  isSelected
                    ? 'text-accent bg-accent/5'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50'
                }`}
              >
                {opt.icon && <span className="shrink-0">{opt.icon}</span>}
                <span className="flex-1 text-left font-medium">{opt.label}</span>
                {isSelected && <Check size={14} className="shrink-0 text-accent" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default DropdownPanel;
