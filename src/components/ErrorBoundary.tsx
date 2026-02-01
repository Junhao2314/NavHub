import React from 'react';
import i18n from '../config/i18n';
import { getErrorMessage } from '../utils/error';

export type ErrorBoundaryFallbackProps = {
  error: unknown;
  reset: () => void;
};

export interface ErrorBoundaryProps {
  children: React.ReactNode;
  onError?: (error: unknown, info: React.ErrorInfo) => void;
  fallback?: React.ReactNode | ((props: ErrorBoundaryFallbackProps) => React.ReactNode);
}

type ErrorBoundaryState = {
  error: unknown | null;
};

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo): void {
    console.error('[ErrorBoundary]', error, info);
    this.props.onError?.(error, info);
  }

  private reset = (): void => {
    this.setState({ error: null });
  };

  render(): React.ReactNode {
    const { error } = this.state;
    if (error != null) {
      const { fallback } = this.props;
      if (typeof fallback === 'function') {
        return fallback({ error, reset: this.reset });
      }
      if (fallback) return fallback;

      const message = getErrorMessage(error, i18n.t('errors.pageError'));

      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/50 backdrop-blur p-6 shadow-sm">
            <h1 className="text-lg font-semibold">{i18n.t('errors.somethingWentWrong')}</h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 break-words">{message}</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                className="px-3 py-2 rounded-lg bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 text-sm font-medium"
                onClick={() => window.location.reload()}
              >
                {i18n.t('errors.refreshPage')}
              </button>
              <button
                type="button"
                className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm"
                onClick={this.reset}
              >
                {i18n.t('errors.tryAgain')}
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
