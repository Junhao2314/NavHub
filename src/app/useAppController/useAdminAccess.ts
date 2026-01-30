import { useCallback } from 'react';
import type { NotifyFn } from '../../types/ui';
import { requireAdminAccess } from '../../utils/adminAccess';

export const useAdminAccess = (args: { isAdmin: boolean; notify: NotifyFn }) => {
  const handleEditDisabled = useCallback(() => {
    requireAdminAccess(args.isAdmin, args.notify);
  }, [args.isAdmin, args.notify]);

  const requireAdmin = useCallback(
    (message?: string): boolean => requireAdminAccess(args.isAdmin, args.notify, message),
    [args.isAdmin, args.notify],
  );

  return { handleEditDisabled, requireAdmin };
};
