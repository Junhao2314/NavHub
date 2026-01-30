export type ToastVariant = 'info' | 'success' | 'warning' | 'error';

export type NotifyFn = (message: string, variant?: ToastVariant) => void;

export type ConfirmVariant = 'default' | 'danger';

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: ConfirmVariant;
}

export type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;
