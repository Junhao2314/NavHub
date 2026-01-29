import { useCallback, useMemo } from 'react';

export const computeBatchEditGuards = (args: {
  isBlocked: boolean;
  isBatchEditMode: boolean;
  selectedLinks: Set<string>;
}) => {
  return {
    effectiveIsBatchEditMode: args.isBlocked ? false : args.isBatchEditMode,
    effectiveSelectedLinksCount: args.isBlocked ? 0 : args.selectedLinks.size,
  };
};

export const useBatchEditGuards = (args: {
  isAdmin: boolean;
  isPrivateView: boolean;
  requireAdmin: (message?: string) => boolean;
  isBatchEditMode: boolean;
  selectedLinks: Set<string>;
  toggleBatchEditMode: () => void;
  handleSelectAll: () => void;
  handleBatchDelete: () => void;
  handleBatchPin: () => void;
  handleBatchMove: (targetCategoryId: string) => void;
  toggleLinkSelection: (linkId: string) => void;
}) => {
  const {
    isAdmin,
    isPrivateView,
    requireAdmin,
    isBatchEditMode,
    selectedLinks,
    toggleBatchEditMode,
    handleSelectAll,
    handleBatchDelete,
    handleBatchPin,
    handleBatchMove,
    toggleLinkSelection,
  } = args;

  const emptySelection = useMemo(() => new Set<string>(), []);

  const isBlocked = isPrivateView || !isAdmin;

  const { effectiveIsBatchEditMode, effectiveSelectedLinksCount } = useMemo(
    () =>
      computeBatchEditGuards({
        isBlocked,
        isBatchEditMode,
        selectedLinks,
      }),
    [isBlocked, isBatchEditMode, selectedLinks],
  );

  const effectiveSelectedLinks = isBlocked ? emptySelection : selectedLinks;

  const effectiveToggleBatchEditMode = useCallback(() => {
    if (isBlocked) {
      requireAdmin();
      return;
    }
    toggleBatchEditMode();
  }, [isBlocked, requireAdmin, toggleBatchEditMode]);

  const effectiveSelectAll = useCallback(() => {
    if (isBlocked) return;
    handleSelectAll();
  }, [isBlocked, handleSelectAll]);

  const effectiveBatchDelete = useCallback(() => {
    if (isBlocked) return;
    handleBatchDelete();
  }, [isBlocked, handleBatchDelete]);

  const effectiveBatchPin = useCallback(() => {
    if (isBlocked) return;
    handleBatchPin();
  }, [isBlocked, handleBatchPin]);

  const effectiveBatchMove = useCallback(
    (targetCategoryId: string) => {
      if (isBlocked) return;
      handleBatchMove(targetCategoryId);
    },
    [isBlocked, handleBatchMove],
  );

  const handleLinkSelect = useCallback(
    (linkId: string) => {
      if (isBlocked) return;
      toggleLinkSelection(linkId);
    },
    [isBlocked, toggleLinkSelection],
  );

  return {
    effectiveIsBatchEditMode,
    effectiveSelectedLinksCount,
    effectiveSelectedLinks,
    effectiveToggleBatchEditMode,
    effectiveSelectAll,
    effectiveBatchDelete,
    effectiveBatchPin,
    effectiveBatchMove,
    handleLinkSelect,
  };
};
