import { useCallback } from 'react';
import { requireAdminAccess } from '../../utils/adminAccess';

type ToastVariant = 'info' | 'success' | 'warning' | 'error';

export const useAdminAccess = (args: {
  isAdmin: boolean;
  notify: (message: string, variant?: ToastVariant) => void;
}) => {
  const handleEditDisabled = useCallback(() => {
    requireAdminAccess(args.isAdmin, args.notify);
  }, [args.isAdmin, args.notify]);

  const requireAdmin = useCallback(
    (message?: string): boolean => requireAdminAccess(args.isAdmin, args.notify, message),
    [args.isAdmin, args.notify],
  );

  return { handleEditDisabled, requireAdmin };
};
