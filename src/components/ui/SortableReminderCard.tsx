import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import React from 'react';

interface SortableReminderCardProps {
  id: string;
  children: React.ReactNode;
  isSortingMode?: boolean;
}

const SortableReminderCard: React.FC<SortableReminderCardProps> = React.memo(
  ({ id, children, isSortingMode }) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
      id,
    });

    const style: React.CSSProperties = {
      transform: CSS.Transform.toString(transform),
      transition: isDragging ? 'none' : transition,
      opacity: isDragging ? 0.5 : 1,
      zIndex: isDragging ? 1000 : 'auto',
    };

    return (
      <div
        ref={setNodeRef}
        style={style}
        className={`group relative rounded-xl cursor-grab active:cursor-grabbing transition-all duration-300 ${
          isSortingMode ? 'ring-2 ring-emerald-500/15 hover:ring-emerald-500/25' : ''
        } ${isDragging ? 'shadow-2xl scale-105 z-50 ring-2 ring-accent' : 'hover:shadow-xl'}`}
        {...attributes}
        {...listeners}
      >
        {children}
      </div>
    );
  },
);

SortableReminderCard.displayName = 'SortableReminderCard';

export default SortableReminderCard;
