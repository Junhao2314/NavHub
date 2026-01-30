/**
 * useModals - 弹窗状态管理
 *
 * 功能:
 *   - 统一管理所有弹窗的开关状态
 *   - 管理链接编辑/新增时的数据传递
 *
 * 包含的弹窗:
 *   - 链接编辑弹窗（新增/编辑）
 *   - 分类管理弹窗
 *   - 导入弹窗
 *   - 设置弹窗
 *   - 搜索配置弹窗
 */

import { useCallback, useState } from 'react';
import { LinkItem } from '../types';

export function useModals() {
  // ========== 弹窗开关状态 ==========
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCatManagerOpen, setIsCatManagerOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isSearchConfigModalOpen, setIsSearchConfigModalOpen] = useState(false);

  // ========== 链接编辑状态 ==========
  /** 正在编辑的链接（编辑模式） */
  const [editingLink, setEditingLink] = useState<LinkItem | undefined>(undefined);
  /** 预填充数据（新增模式，如从书签导入） */
  const [prefillLink, setPrefillLink] = useState<Partial<LinkItem> | undefined>(undefined);

  /** 打开新增链接弹窗 */
  const openAddLinkModal = useCallback(() => {
    setEditingLink(undefined);
    setPrefillLink(undefined);
    setIsModalOpen(true);
  }, []);

  /** 打开编辑链接弹窗 */
  const openEditLinkModal = useCallback((link: LinkItem) => {
    setEditingLink(link);
    setIsModalOpen(true);
  }, []);

  /** 关闭链接弹窗并清理状态 */
  const closeLinkModal = useCallback(() => {
    setIsModalOpen(false);
    setEditingLink(undefined);
    setPrefillLink(undefined);
  }, []);

  return {
    // Link Modal
    isModalOpen,
    setIsModalOpen,
    editingLink,
    setEditingLink,
    prefillLink,
    setPrefillLink,
    openAddLinkModal,
    openEditLinkModal,
    closeLinkModal,

    // Category Manager Modal
    isCatManagerOpen,
    setIsCatManagerOpen,
    openCatManager: () => setIsCatManagerOpen(true),
    closeCatManager: () => setIsCatManagerOpen(false),

    // Import Modal
    isImportModalOpen,
    setIsImportModalOpen,
    openImportModal: () => setIsImportModalOpen(true),
    closeImportModal: () => setIsImportModalOpen(false),

    // Settings Modal
    isSettingsModalOpen,
    setIsSettingsModalOpen,
    openSettingsModal: () => setIsSettingsModalOpen(true),
    closeSettingsModal: () => setIsSettingsModalOpen(false),

    // Search Config Modal
    isSearchConfigModalOpen,
    setIsSearchConfigModalOpen,
    openSearchConfigModal: () => setIsSearchConfigModalOpen(true),
    closeSearchConfigModal: () => setIsSearchConfigModalOpen(false),
  };
}
