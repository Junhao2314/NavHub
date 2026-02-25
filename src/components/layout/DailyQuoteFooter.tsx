import { RefreshCw } from 'lucide-react';
import React from 'react';

interface DailyQuoteFooterProps {
  text: string;
  author: string;
  loading: boolean;
  onCopy: () => void;
  onRefresh: () => void;
  copyLabel: string;
  refreshLabel: string;
  loadingLabel: string;
  emptyLabel: string;
}

const DailyQuoteFooter: React.FC<DailyQuoteFooterProps> = ({
  text,
  author,
  loading,
  onCopy,
  onRefresh,
  copyLabel,
  refreshLabel,
  loadingLabel,
  emptyLabel,
}) => {
  return (
    <footer className="w-full flex justify-center animate-in fade-in duration-700 delay-300">
      <div className="flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
        <button
          type="button"
          onClick={onCopy}
          className="flex min-w-0 max-w-[70vw] items-center gap-1.5 text-left hover:text-slate-500 dark:hover:text-slate-300 transition-colors"
          title={text || loadingLabel}
          aria-label={copyLabel}
        >
          <span className="truncate">{text || (loading ? loadingLabel : emptyLabel)}</span>
          {text && (
            <span className="shrink-0 text-slate-400/80 dark:text-slate-500">— {author}</span>
          )}
        </button>
        <button
          type="button"
          onClick={onRefresh}
          className="h-6 w-6 inline-flex items-center justify-center rounded-full text-slate-400 hover:text-slate-500 transition-colors disabled:opacity-60"
          title={refreshLabel}
          aria-label={refreshLabel}
          disabled={loading}
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>
    </footer>
  );
};

export default React.memo(DailyQuoteFooter);
