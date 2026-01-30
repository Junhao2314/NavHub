import type { StateCreator } from 'zustand';
import type { LinkItem } from '../../types';
import type { AppStore } from '../useAppStore';

export interface ModalSlice {
  isModalOpen: boolean;
  setIsModalOpen: (open: boolean) => void;
  isCatManagerOpen: boolean;
  setIsCatManagerOpen: (open: boolean) => void;
  isImportModalOpen: boolean;
  setIsImportModalOpen: (open: boolean) => void;
  isSettingsModalOpen: boolean;
  setIsSettingsModalOpen: (open: boolean) => void;
  isSearchConfigModalOpen: boolean;
  setIsSearchConfigModalOpen: (open: boolean) => void;
  editingLink: LinkItem | undefined;
  setEditingLink: (link: LinkItem | undefined) => void;
  prefillLink: Partial<LinkItem> | undefined;
  setPrefillLink: (link: Partial<LinkItem> | undefined) => void;
  openAddLinkModal: () => void;
  openEditLinkModal: (link: LinkItem) => void;
  closeLinkModal: () => void;
}

export const createModalSlice: StateCreator<AppStore, [], [], ModalSlice> = (set) => ({
  isModalOpen: false,
  setIsModalOpen: (open) => set({ isModalOpen: open }),
  isCatManagerOpen: false,
  setIsCatManagerOpen: (open) => set({ isCatManagerOpen: open }),
  isImportModalOpen: false,
  setIsImportModalOpen: (open) => set({ isImportModalOpen: open }),
  isSettingsModalOpen: false,
  setIsSettingsModalOpen: (open) => set({ isSettingsModalOpen: open }),
  isSearchConfigModalOpen: false,
  setIsSearchConfigModalOpen: (open) => set({ isSearchConfigModalOpen: open }),
  editingLink: undefined,
  setEditingLink: (link) => set({ editingLink: link }),
  prefillLink: undefined,
  setPrefillLink: (link) => set({ prefillLink: link }),
  openAddLinkModal: () => set({ editingLink: undefined, prefillLink: undefined, isModalOpen: true }),
  openEditLinkModal: (link) => set({ editingLink: link, isModalOpen: true }),
  closeLinkModal: () => set({ isModalOpen: false, editingLink: undefined, prefillLink: undefined }),
});
