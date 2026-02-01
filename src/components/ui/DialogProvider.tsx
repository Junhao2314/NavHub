import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

type ToastVariant = 'info' | 'success' | 'warning' | 'error';
type ConfirmVariant = 'default' | 'danger';

interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
}

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: ConfirmVariant;
}

interface ConfirmState {
  options: ConfirmOptions;
  resolve: (value: boolean) => void;
}

interface DialogContextValue {
  notify: (message: string, variant?: ToastVariant) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const DialogContext = createContext<DialogContextValue | null>(null);

const getToastIcon = (variant: ToastVariant) => {
  if (variant === 'success') return CheckCircle2;
  if (variant === 'warning') return AlertTriangle;
  if (variant === 'error') return AlertCircle;
  return Info;
};

const toastToneClass = (variant: ToastVariant) => {
  if (variant === 'success') return 'text-emerald-600 dark:text-emerald-400';
  if (variant === 'warning') return 'text-amber-600 dark:text-amber-400';
  if (variant === 'error') return 'text-red-600 dark:text-red-400';
  return 'text-slate-600 dark:text-slate-300';
};

export const DialogProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(item => item.id !== id));
  }, []);

  const notify = useCallback((message: string, variant: ToastVariant = 'info') => {
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    setToasts(prev => [...prev, { id, message, variant }]);
    setTimeout(() => removeToast(id), 2600);
  }, [removeToast]);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setConfirmState({ options, resolve });
    });
  }, []);

  const handleResolve = useCallback((value: boolean) => {
    if (!confirmState) return;
    confirmState.resolve(value);
    setConfirmState(null);
  }, [confirmState]);

  const contextValue = useMemo(() => ({ notify, confirm }), [notify, confirm]);

  return (
    <DialogContext.Provider value={contextValue}>
      {children}

      {/* Toasts */}
      <div className="fixed top-5 right-5 z-[120] space-y-2">
        {toasts.map(toast => {
          const Icon = getToastIcon(toast.variant);
          return (
            <div
              key={toast.id}
              className="flex items-start gap-3 px-4 py-3 rounded-2xl bg-white/95 dark:bg-slate-900/95 border border-slate-200/70 dark:border-slate-700/60 shadow-lg backdrop-blur-sm animate-in fade-in slide-in-from-top-2"
            >
              <div className={`mt-0.5 ${toastToneClass(toast.variant)}`}>
                <Icon size={16} />
              </div>
              <div className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-line">
                {toast.message}
              </div>
              <button
                onClick={() => removeToast(toast.id)}
                className="ml-2 p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                aria-label="关闭提示"
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>

      {/* Confirm Dialog */}
      {confirmState && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800/50">
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center ${confirmState.options.variant === 'danger'
                  ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                  : 'bg-accent/10 text-accent'
                  }`}
                >
                  {confirmState.options.variant === 'danger' ? <AlertTriangle size={18} /> : <Info size={18} />}
                </div>
                <div className="flex-1">
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    {confirmState.options.title || '请确认操作'}
                  </h3>
                </div>
              </div>
            </div>

            <div className="px-6 py-5 text-sm text-slate-600 dark:text-slate-300 whitespace-pre-line">
              {confirmState.options.message}
            </div>

            <div className="px-6 pb-6 flex items-center justify-end gap-2">
              <button
                onClick={() => handleResolve(false)}
                className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                {confirmState.options.cancelText || '取消'}
              </button>
              <button
                onClick={() => handleResolve(true)}
                className={`px-4 py-2 rounded-xl text-sm font-semibold text-white transition-colors shadow-sm ${confirmState.options.variant === 'danger'
                  ? 'bg-red-500 hover:bg-red-600'
                  : 'bg-accent hover:bg-accent/90'
                  }`}
              >
                {confirmState.options.confirmText || '确定'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
};

export const useDialog = () => {
  const context = useContext(DialogContext);
  if (!context) {
    throw new Error('useDialog must be used within DialogProvider');
  }
  return context;
};
