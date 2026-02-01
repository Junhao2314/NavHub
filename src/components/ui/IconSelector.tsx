import { ExternalLink, Search } from 'lucide-react';
import React, { useState } from 'react';
import { useI18n } from '../../hooks/useI18n';
import Icon from './Icon';
import { isLucideIconName, type LucideIconName } from './lucideIconMap';

interface IconSelectorProps {
  onSelectIcon: (iconName: string) => void;
}

// 常用图标列表，可以根据需要扩展
const commonIcons = [
  'Star',
  'Heart',
  'Bookmark',
  'Flag',
  'Tag',
  'Hash',
  'Home',
  'User',
  'Users',
  'Settings',
  'Bell',
  'Mail',
  'Calendar',
  'Clock',
  'MapPin',
  'Phone',
  'Camera',
  'Image',
  'Folder',
  'File',
  'Archive',
  'Trash2',
  'Download',
  'Upload',
  'Search',
  'Filter',
  'Menu',
  'MoreVertical',
  'ChevronDown',
  'ChevronUp',
  'Plus',
  'Minus',
  'X',
  'Check',
  'AlertCircle',
  'Info',
  'Edit',
  'Copy',
  'Share',
  'Link',
  'ExternalLink',
  'Lock',
  'Code',
  'Terminal',
  'Database',
  'Server',
  'Cloud',
  'Wifi',
  'ShoppingCart',
  'CreditCard',
  'Package',
  'Truck',
  'Store',
  'Music',
  'Play',
  'Pause',
  'Volume2',
  'Headphones',
  'Mic',
  'Book',
  'BookOpen',
  'FileText',
  'PenTool',
  'Highlighter',
  'Type',
  'Layout',
  'Grid',
  'List',
  'Columns',
  'Sidebar',
  'Layers',
  'Circle',
  'Square',
  'Triangle',
  'Hexagon',
  'Zap',
  'Target',
  'Rocket',
  'Plane',
  'Car',
  'Bike',
  'Ship',
  'Train',
  'Moon',
  'Sun',
  'CloudRain',
  'CloudSnow',
  'Wind',
  'Thermometer',
  'Github',
  'Gitlab',
  'Chrome',
  'MessageSquare',
  'MessageCircle',
  'Send',
  'AtSign',
  'Percent',
  'Bot',
  'Pin',
  'Palette',
  'Gamepad2',
];

const isTextIcon = (rawName: string): boolean => {
  const trimmed = rawName.trim();
  if (!trimmed) return false;
  return !/^[a-z0-9-]+$/i.test(trimmed);
};

const hasLucideIcon = (name: string): name is LucideIconName => isLucideIconName(name);

const IconSelector: React.FC<IconSelectorProps> = ({ onSelectIcon }) => {
  const { t } = useI18n();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('Folder');
  const [customIconName, setCustomIconName] = useState('');
  const [isValidIcon, setIsValidIcon] = useState(true);

  // 过滤图标
  const filteredIcons = commonIcons.filter((icon) =>
    icon.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  // 将 kebab-case 转换为 PascalCase
  const kebabToPascal = (kebabName: string): string => {
    return kebabName
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join('');
  };

  // 验证图标名称是否有效
  const validateIconName = (iconName: string): boolean => {
    const trimmed = iconName.trim();
    if (!trimmed) return false;

    // Allow emoji/text icons (Category.icon supports emoji too).
    if (isTextIcon(trimmed)) return true;

    if (hasLucideIcon(trimmed)) return true;

    // If input is kebab-case, try converting to PascalCase (lucide-react export names).
    if (trimmed.includes('-')) {
      return hasLucideIcon(kebabToPascal(trimmed));
    }

    // Try capitalizing first letter (e.g. "star" -> "Star")
    const capitalizedName = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
    return hasLucideIcon(capitalizedName);
  };

  const handleSelect = (iconName: string) => {
    setSelectedIcon(iconName);
    setCustomIconName('');
    setIsValidIcon(true);
  };

  const handleCustomIconChange = (iconName: string) => {
    setCustomIconName(iconName);

    const trimmed = iconName.trim();
    if (trimmed) {
      const isValid = validateIconName(trimmed);
      setIsValidIcon(isValid);
      if (isValid) {
        // 转换为正确的图标名称格式
        let finalIconName = trimmed;
        if (!isTextIcon(trimmed)) {
          if (trimmed.includes('-')) {
            finalIconName = kebabToPascal(trimmed);
          } else if (!commonIcons.includes(trimmed)) {
            // 如果不是常用图标，尝试首字母大写
            finalIconName = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
          }
        }
        setSelectedIcon(finalIconName);
      }
    } else {
      setIsValidIcon(true);
    }
  };

  const handleConfirm = () => {
    onSelectIcon(selectedIcon.trim());
  };

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-700">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder={t('iconSelector.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
            autoFocus
          />
        </div>
      </div>

      {/* Custom Icon Input */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-700">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-600 dark:text-slate-400">
              {t('iconSelector.inputIconName')}
            </span>
            <a
              href="https://lucide.dev/icons/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
            >
              <ExternalLink size={12} />
              Lucide Icons
            </a>
          </div>
          <div className="relative">
            <input
              type="text"
              placeholder={t('iconSelector.inputExample')}
              value={customIconName}
              onChange={(e) => handleCustomIconChange(e.target.value)}
              className={`w-full px-3 py-2 rounded-lg border ${
                customIconName && !isValidIcon
                  ? 'border-red-300 dark:border-red-700'
                  : 'border-slate-300 dark:border-slate-600'
              } dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none`}
            />
            {customIconName && !isValidIcon && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <span className="text-xs text-red-500">{t('iconSelector.invalidIcon')}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Current Selection */}
      <div className="px-4 py-3 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-600 dark:text-slate-400">
            {t('iconSelector.currentSelection')}
          </span>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-600">
            <Icon name={selectedIcon} size={18} />
            <span className="text-sm font-medium dark:text-slate-200">{selectedIcon}</span>
          </div>
        </div>
      </div>

      {/* Confirm Selection */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
        <div className="flex items-center justify-between">
          <div className="text-xs text-slate-500 dark:text-slate-400">{t('iconSelector.hint')}</div>
          <button
            onClick={handleConfirm}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium"
          >
            {t('iconSelector.confirmSelection')}
          </button>
        </div>
      </div>

      {/* Icons Grid */}
      <div className="flex-1 overflow-y-auto p-4">
        {filteredIcons.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-slate-400">
            <Search size={40} className="mb-3 opacity-50" />
            <p>{t('iconSelector.noMatchingIcons')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 gap-2">
            {filteredIcons.map((iconName) => (
              <button
                key={iconName}
                onClick={() => handleSelect(iconName)}
                className={`p-3 rounded-lg flex flex-col items-center justify-center gap-1 transition-all ${
                  selectedIcon === iconName
                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 ring-2 ring-blue-500'
                    : 'hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400'
                }`}
                title={iconName}
              >
                <Icon name={iconName} size={20} />
                <span className="text-xs truncate w-full text-center">{iconName}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default IconSelector;
