import {
  closestCenter,
  DndContext,
  DragEndEvent,
  type DraggableAttributes,
  type DraggableSyntheticListeners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ArrowDown,
  ArrowUp,
  Check,
  CheckSquare,
  Edit2,
  Eye,
  EyeOff,
  GripVertical,
  Palette,
  Plus,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import React, { useState } from 'react';
import { useI18n } from '../../hooks/useI18n';
import { Category } from '../../types';
import { useDialog } from '../ui/DialogProvider';
import Icon from '../ui/Icon';
import IconSelector from '../ui/IconSelector';

interface CategoryManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: Category[];
  onUpdateCategories: (newCategories: Category[]) => void;
  onDeleteCategory: (id: string) => void;
  closeOnBackdrop?: boolean;
  isAdmin?: boolean;
}

type SortableItemRenderProps = {
  setNodeRef: (node: HTMLElement | null) => void;
  setActivatorNodeRef: (node: HTMLElement | null) => void;
  attributes: DraggableAttributes;
  listeners: DraggableSyntheticListeners;
  style: React.CSSProperties;
  isDragging: boolean;
};

const SortableItem: React.FC<{
  id: string;
  disabled?: boolean;
  children: (props: SortableItemRenderProps) => React.ReactNode;
}> = ({ id, disabled = false, children }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: isDragging ? 'none' : transition,
    opacity: isDragging ? 0.65 : 1,
    zIndex: isDragging ? 1000 : 'auto',
  };

  return children({ setNodeRef, setActivatorNodeRef, attributes, listeners, style, isDragging });
};

const CategoryManagerModal: React.FC<CategoryManagerModalProps> = ({
  isOpen,
  onClose,
  categories,
  onUpdateCategories,
  onDeleteCategory,
  closeOnBackdrop = true,
  isAdmin = false,
}) => {
  const { t } = useI18n();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editIcon, setEditIcon] = useState('');

  const [newCatName, setNewCatName] = useState('');
  const [newCatIcon, setNewCatIcon] = useState('Folder');

  const [isIconSelectorOpen, setIsIconSelectorOpen] = useState(false);
  const [iconSelectorTarget, setIconSelectorTarget] = useState<'edit' | 'new' | null>(null);

  // 多选模式状态
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const { notify, confirm } = useDialog();

  // DnD-kit sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Prevent accidental drags
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  if (!isOpen) return null;

  // 切换多选模式
  const toggleBatchMode = () => {
    setIsBatchMode(!isBatchMode);
    setSelectedCategories(new Set()); // 清空选中
  };

  // 切换分类选中状态
  const toggleCategorySelection = (categoryId: string) => {
    const newSelected = new Set(selectedCategories);
    if (newSelected.has(categoryId)) {
      newSelected.delete(categoryId);
    } else {
      newSelected.add(categoryId);
    }
    setSelectedCategories(newSelected);
  };

  // 全选/取消全选
  const toggleSelectAll = () => {
    if (selectedCategories.size === categories.length) {
      // 已全选,取消全选
      setSelectedCategories(new Set());
    } else {
      // 全选所有分类
      const allIds = new Set(categories.map((c) => c.id));
      setSelectedCategories(allIds);
    }
  };

  const getFallbackCategory = (excludeIds: Set<string>) => {
    const remaining = categories.filter((c) => !excludeIds.has(c.id));
    if (remaining.length === 0) return null;
    const common = remaining.find((c) => c.id === 'common');
    return common || remaining[0];
  };

  // 批量删除
  const handleBatchDelete = async () => {
    if (selectedCategories.size === 0) {
      notify(t('modals.category.selectCategoryFirst'), 'warning');
      return;
    }

    const fallbackCategory = getFallbackCategory(selectedCategories);
    if (!fallbackCategory) {
      notify(t('modals.category.keepAtLeastOne'), 'warning');
      return;
    }

    const shouldDelete = await confirm({
      title: t('modals.category.deleteConfirmTitle'),
      message: t('modals.category.batchDeleteConfirmMessage', {
        count: selectedCategories.size,
        fallback: fallbackCategory.name,
      }),
      confirmText: t('common.delete'),
      cancelText: t('common.cancel'),
      variant: 'danger',
    });

    if (!shouldDelete) return;

    selectedCategories.forEach((id) => {
      onDeleteCategory(id);
    });
    setSelectedCategories(new Set());
    setIsBatchMode(false);
  };

  const handleMove = (index: number, direction: 'up' | 'down') => {
    const newCats = [...categories];
    if (direction === 'up' && index > 0) {
      [newCats[index], newCats[index - 1]] = [newCats[index - 1], newCats[index]];
    } else if (direction === 'down' && index < newCats.length - 1) {
      [newCats[index], newCats[index + 1]] = [newCats[index + 1], newCats[index]];
    }
    onUpdateCategories(newCats);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    if (isBatchMode) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = categories.findIndex((c) => c.id === active.id);
    const newIndex = categories.findIndex((c) => c.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    onUpdateCategories(arrayMove(categories, oldIndex, newIndex) as Category[]);
  };

  const handleStartEdit = (cat: Category) => {
    startEdit(cat);
  };

  const handleDeleteClick = async (cat: Category) => {
    const fallbackCategory = getFallbackCategory(new Set([cat.id]));
    if (!fallbackCategory) {
      notify(t('modals.category.keepAtLeastOne'), 'warning');
      return;
    }

    const prompt =
      cat.id === 'common'
        ? t('modals.category.deleteDefaultConfirmMessage', {
            name: cat.name,
            fallback: fallbackCategory.name,
          })
        : t('modals.category.deleteConfirmMessage', {
            name: cat.name,
            fallback: fallbackCategory.name,
          });

    const shouldDelete = await confirm({
      title: t('modals.category.deleteConfirmTitle'),
      message: prompt,
      confirmText: t('common.delete'),
      cancelText: t('common.cancel'),
      variant: 'danger',
    });

    if (shouldDelete) {
      onDeleteCategory(cat.id);
    }
  };

  const startEdit = (cat: Category) => {
    setEditingId(cat.id);
    setEditName(cat.name);
    setEditIcon(cat.icon);
  };

  const saveEdit = () => {
    if (!editingId || !editName.trim()) return;
    const newCats = categories.map((c) =>
      c.id === editingId
        ? {
            ...c,
            name: editName.trim(),
            icon: editIcon,
          }
        : c,
    );
    onUpdateCategories(newCats);
    setEditingId(null);
  };

  const handleAdd = () => {
    if (!newCatName.trim()) return;
    const newCat: Category = {
      id: Date.now().toString(),
      name: newCatName.trim(),
      icon: newCatIcon,
    };
    onUpdateCategories([...categories, newCat]);
    setNewCatName('');
    setNewCatIcon('Folder');
  };

  const toggleCategoryHidden = (catId: string) => {
    const newCats = categories.map((c) => (c.id === catId ? { ...c, hidden: !c.hidden } : c));
    onUpdateCategories(newCats);
  };

  const openIconSelector = (target: 'edit' | 'new') => {
    setIconSelectorTarget(target);
    setIsIconSelectorOpen(true);
  };

  const handleIconSelect = (iconName: string) => {
    if (iconSelectorTarget === 'edit') {
      setEditIcon(iconName);
    } else if (iconSelectorTarget === 'new') {
      setNewCatIcon(iconName);
    }
  };

  const cancelIconSelector = () => {
    setIsIconSelectorOpen(false);
    setIconSelectorTarget(null);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={closeOnBackdrop ? onClose : undefined}
    >
      <div
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden border border-slate-200 dark:border-slate-700 flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center p-4 border-b border-slate-200 dark:border-slate-700">
          <h3 className="text-lg font-semibold dark:text-white">{t('modals.category.title')}</h3>
          <div className="flex items-center gap-2">
            {/* 多选模式切换按钮 */}
            <button
              onClick={toggleBatchMode}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                isBatchMode
                  ? 'bg-accent text-white'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
              }`}
            >
              {isBatchMode
                ? t('modals.category.cancelMultiSelect')
                : t('modals.category.multiSelect')}
            </button>
            <button
              onClick={onClose}
              className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors"
              aria-label={t('common.close')}
            >
              <X className="w-5 h-5 dark:text-slate-400" />
            </button>
          </div>
        </div>

        {/* 多选模式工具栏 */}
        {isBatchMode && (
          <div className="px-4 py-2 bg-accent/10 dark:bg-accent/20 border-b border-accent/20 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={toggleSelectAll}
                className="flex items-center gap-2 text-sm text-accent dark:text-accent hover:opacity-80"
              >
                {selectedCategories.size === categories.length ? (
                  <CheckSquare size={16} />
                ) : (
                  <Square size={16} />
                )}
                <span>{t('common.selectAll')}</span>
              </button>
              <span className="text-sm text-slate-600 dark:text-slate-400">
                {t('modals.category.selectedCount', { count: selectedCategories.size })}
              </span>
            </div>
            <button
              onClick={handleBatchDelete}
              disabled={selectedCategories.size === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors"
            >
              <Trash2 size={14} />
              <span>{t('modals.category.deleteSelected')}</span>
            </button>
          </div>
        )}

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext
            items={categories.map((c) => c.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {categories.map((cat, index) => (
                <SortableItem key={cat.id} id={cat.id} disabled={isBatchMode}>
                  {({
                    setNodeRef,
                    setActivatorNodeRef,
                    attributes,
                    listeners,
                    style,
                    isDragging,
                  }) => (
                    <div
                      ref={setNodeRef}
                      style={style}
                      className={`flex flex-col p-3 rounded-lg group gap-2 ${
                        isBatchMode && selectedCategories.has(cat.id)
                          ? 'bg-accent/10 dark:bg-accent/20 border-2 border-accent'
                          : 'bg-slate-50 dark:bg-slate-700/50'
                      } ${isDragging ? 'shadow-lg shadow-slate-200/60 dark:shadow-black/30 ring-2 ring-accent/30' : ''}`}
                    >
                      <div className="flex items-center gap-2">
                        {/* 多选模式复选框 */}
                        {isBatchMode && (
                          <button
                            type="button"
                            onClick={() => toggleCategorySelection(cat.id)}
                            className="flex-shrink-0 p-1"
                            aria-label={`${t('modals.category.selectCategory')}: ${cat.name}`}
                            aria-pressed={selectedCategories.has(cat.id)}
                          >
                            {selectedCategories.has(cat.id) ? (
                              <CheckSquare size={18} className="text-accent" />
                            ) : (
                              <Square size={18} className="text-slate-400 hover:text-accent" />
                            )}
                          </button>
                        )}

                        {/* Drag Handle + Fallback Order Controls (非多选模式显示) */}
                        {!isBatchMode && (
                          <div className="flex items-center gap-1 mr-2">
                            <button
                              ref={setActivatorNodeRef}
                              type="button"
                              {...attributes}
                              {...listeners}
                              className="p-0.5 text-slate-400 hover:text-blue-500 cursor-grab active:cursor-grabbing"
                              title={t('modals.category.dragToSort')}
                              aria-label={t('modals.category.dragToSort')}
                            >
                              <GripVertical size={14} />
                            </button>
                            <div className="flex flex-col gap-1">
                              <button
                                onClick={() => handleMove(index, 'up')}
                                disabled={index === 0}
                                className="p-0.5 text-slate-400 hover:text-blue-500 disabled:opacity-30"
                                title={t('modals.category.moveUp')}
                                aria-label={t('modals.category.moveUp')}
                              >
                                <ArrowUp size={14} />
                              </button>
                              <button
                                onClick={() => handleMove(index, 'down')}
                                disabled={index === categories.length - 1}
                                className="p-0.5 text-slate-400 hover:text-blue-500 disabled:opacity-30"
                                title={t('modals.category.moveDown')}
                                aria-label={t('modals.category.moveDown')}
                              >
                                <ArrowDown size={14} />
                              </button>
                            </div>
                          </div>
                        )}

                        <div className="flex items-center gap-2">
                          {editingId === cat.id ? (
                            <div className="flex flex-col gap-2">
                              <div className="flex items-center gap-2">
                                <Icon name={editIcon} size={16} />
                                <input
                                  type="text"
                                  value={editName}
                                  onChange={(e) => setEditName(e.target.value)}
                                  className="flex-1 p-1.5 px-2 text-sm rounded border border-accent dark:bg-slate-800 dark:text-white outline-none"
                                  placeholder={t('modals.category.categoryName')}
                                  aria-label={t('modals.category.categoryName')}
                                  autoFocus
                                />
                                <button
                                  type="button"
                                  className="p-1 text-slate-400 hover:text-blue-600 transition-colors"
                                  onClick={() => openIconSelector('edit')}
                                  title={t('modals.category.selectIcon')}
                                  aria-label={t('modals.category.selectIcon')}
                                >
                                  <Palette size={16} />
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <Icon name={cat.icon} size={16} />
                              <span className="font-medium dark:text-slate-200 truncate">
                                {cat.name}
                                {cat.id === 'common' && (
                                  <span className="ml-2 text-xs text-slate-400">
                                    {t('modals.category.defaultCategoryLabel')}
                                  </span>
                                )}
                                {cat.hidden && (
                                  <span className="ml-2 text-xs text-amber-500">
                                    {t('modals.category.hiddenLabel')}
                                  </span>
                                )}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Actions */}
                        {!isBatchMode && (
                          <div className="flex items-center gap-1 self-start mt-1">
                            {editingId === cat.id ? (
                              <button
                                type="button"
                                onClick={saveEdit}
                                className="text-green-500 hover:bg-green-50 dark:hover:bg-slate-600 p-1.5 rounded bg-white dark:bg-slate-800 shadow-sm border border-slate-200 dark:border-slate-600"
                                aria-label={t('common.save')}
                              >
                                <Check size={16} />
                              </button>
                            ) : (
                              <>
                                {isAdmin && (
                                  <button
                                    type="button"
                                    onClick={() => toggleCategoryHidden(cat.id)}
                                    className={`p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-600 ${
                                      cat.hidden
                                        ? 'text-amber-500 hover:text-amber-600'
                                        : 'text-slate-400 hover:text-slate-500'
                                    }`}
                                    title={
                                      cat.hidden
                                        ? t('modals.category.unhideCategory')
                                        : t('modals.category.hideCategory')
                                    }
                                    aria-label={
                                      cat.hidden
                                        ? t('modals.category.unhideCategory')
                                        : t('modals.category.hideCategory')
                                    }
                                  >
                                    {cat.hidden ? <EyeOff size={14} /> : <Eye size={14} />}
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleStartEdit(cat)}
                                  className="p-1.5 text-slate-400 hover:text-blue-500 hover:bg-slate-200 dark:hover:bg-slate-600 rounded"
                                  aria-label={t('common.edit')}
                                  title={t('common.edit')}
                                >
                                  <Edit2 size={14} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteClick(cat)}
                                  className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-slate-200 dark:hover:bg-slate-600 rounded"
                                  aria-label={t('common.delete')}
                                  title={t('common.delete')}
                                >
                                  <Trash2 size={14} />
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </SortableItem>
              ))}
            </div>
          </SortableContext>
        </DndContext>

        <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
          <label className="text-xs font-semibold text-slate-500 uppercase mb-2 block">
            {t('modals.category.addNewCategory')}
          </label>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Icon name={newCatIcon} size={16} />
              <input
                type="text"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                placeholder={t('modals.category.categoryName')}
                aria-label={t('modals.category.categoryName')}
                className="flex-1 p-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <button
                type="button"
                className="p-1 text-gray-500 hover:text-blue-600 transition-colors"
                onClick={() => openIconSelector('new')}
                title={t('modals.category.selectIcon')}
                aria-label={t('modals.category.selectIcon')}
              >
                <Palette size={16} />
              </button>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleAdd}
                disabled={!newCatName.trim()}
                className="bg-accent text-white hover:opacity-90 disabled:opacity-50 px-4 py-2 rounded-lg transition-colors flex items-center"
                aria-label={t('modals.category.addNewCategory')}
              >
                <Plus size={18} />
              </button>
            </div>
          </div>

          {/* 图标选择器弹窗 */}
          {isIconSelectorOpen && (
            <div
              className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
              onClick={closeOnBackdrop ? cancelIconSelector : undefined}
            >
              <div
                className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
                  <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">
                    {t('modals.category.selectIcon')}
                  </h3>
                  <button
                    type="button"
                    onClick={cancelIconSelector}
                    className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                    aria-label={t('common.close')}
                  >
                    <X size={20} />
                  </button>
                </div>
                <div className="flex-1 overflow-auto p-4">
                  <IconSelector
                    onSelectIcon={(iconName) => {
                      handleIconSelect(iconName);
                      setIsIconSelectorOpen(false);
                      setIconSelectorTarget(null);
                    }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CategoryManagerModal;
