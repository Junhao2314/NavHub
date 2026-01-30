/**
 * useModals - Modal State Management Hook
 * useModals - 弹窗状态管理 Hook
 *
 * Features / 功能:
 *   - Unified management of all modal open/close states
 *     统一管理所有弹窗的开关状态
 *   - Manage data passing for link edit/add operations
 *     管理链接编辑/新增时的数据传递
 *
 * Managed modals / 包含的弹窗:
 *   - Link edit modal (add/edit) / 链接编辑弹窗（新增/编辑）
 *   - Category manager modal / 分类管理弹窗
 *   - Import modal / 导入弹窗
 *   - Settings modal / 设置弹窗
 *   - Search config modal / 搜索配置弹窗
 */

import { useAppStore } from '../stores/useAppStore';

export function useModals() {
  // ========== Modal Open/Close States / 弹窗开关状态 ==========
  const isModalOpen = useAppStore((s) => s.isModalOpen);
  const setIsModalOpen = useAppStore((s) => s.setIsModalOpen);

  const isCatManagerOpen = useAppStore((s) => s.isCatManagerOpen);
  const setIsCatManagerOpen = useAppStore((s) => s.setIsCatManagerOpen);

  const isImportModalOpen = useAppStore((s) => s.isImportModalOpen);
  const setIsImportModalOpen = useAppStore((s) => s.setIsImportModalOpen);

  const isSettingsModalOpen = useAppStore((s) => s.isSettingsModalOpen);
  const setIsSettingsModalOpen = useAppStore((s) => s.setIsSettingsModalOpen);

  const isSearchConfigModalOpen = useAppStore((s) => s.isSearchConfigModalOpen);
  const setIsSearchConfigModalOpen = useAppStore((s) => s.setIsSearchConfigModalOpen);

  // ========== Link Edit States / 链接编辑状态 ==========
  /**
   * Link being edited (edit mode)
   * 正在编辑的链接（编辑模式）
   */
  const editingLink = useAppStore((s) => s.editingLink);
  const setEditingLink = useAppStore((s) => s.setEditingLink);
  /**
   * Prefill data (add mode, e.g., from bookmark import)
   * 预填充数据（新增模式，如从书签导入）
   */
  const prefillLink = useAppStore((s) => s.prefillLink);
  const setPrefillLink = useAppStore((s) => s.setPrefillLink);

  const openAddLinkModal = useAppStore((s) => s.openAddLinkModal);
  const openEditLinkModal = useAppStore((s) => s.openEditLinkModal);
  const closeLinkModal = useAppStore((s) => s.closeLinkModal);

  return {
    // Link Modal / 链接弹窗
    isModalOpen,
    setIsModalOpen,
    editingLink,
    setEditingLink,
    prefillLink,
    setPrefillLink,
    openAddLinkModal,
    openEditLinkModal,
    closeLinkModal,

    // Category Manager Modal / 分类管理弹窗
    isCatManagerOpen,
    setIsCatManagerOpen,
    openCatManager: () => setIsCatManagerOpen(true),
    closeCatManager: () => setIsCatManagerOpen(false),

    // Import Modal / 导入弹窗
    isImportModalOpen,
    setIsImportModalOpen,
    openImportModal: () => setIsImportModalOpen(true),
    closeImportModal: () => setIsImportModalOpen(false),

    // Settings Modal / 设置弹窗
    isSettingsModalOpen,
    setIsSettingsModalOpen,
    openSettingsModal: () => setIsSettingsModalOpen(true),
    closeSettingsModal: () => setIsSettingsModalOpen(false),

    // Search Config Modal / 搜索配置弹窗
    isSearchConfigModalOpen,
    setIsSearchConfigModalOpen,
    openSearchConfigModal: () => setIsSearchConfigModalOpen(true),
    closeSearchConfigModal: () => setIsSearchConfigModalOpen(false),
  };
}
