/**
 * LanguageSwitcher Component
 * 语言切换器组件
 *
 * A dropdown selector for switching between supported languages.
 * 用于在支持的语言之间切换的下拉选择器。
 *
 * Requirements: 3.1, 3.5
 */

import { ChevronDown, Globe } from 'lucide-react';
import React, { useCallback, useRef, useState } from 'react';
import { useI18n } from '../../hooks/useI18n';

/**
 * Props for the LanguageSwitcher component.
 * LanguageSwitcher 组件的属性。
 */
export interface LanguageSwitcherProps {
  /** Display variant: 'dropdown' for select menu, 'buttons' for inline buttons */
  variant?: 'dropdown' | 'buttons';
  /** Whether to show flag emoji */
  showFlag?: boolean;
  /** Whether to show native language name */
  showNativeName?: boolean;
  /** Additional CSS classes */
  className?: string;
}

/**
 * LanguageSwitcher - A component for switching between supported languages.
 * 语言切换器 - 用于在支持的语言之间切换的组件。
 *
 * @param props - Component props
 * @returns React component
 *
 * @example
 * ```tsx
 * // Dropdown variant (default)
 * <LanguageSwitcher />
 *
 * // Buttons variant
 * <LanguageSwitcher variant="buttons" />
 *
 * // Without flags
 * <LanguageSwitcher showFlag={false} />
 *
 * // Show English names instead of native names
 * <LanguageSwitcher showNativeName={false} />
 * ```
 */
const LanguageSwitcher: React.FC<LanguageSwitcherProps> = ({
  variant = 'dropdown',
  showFlag = true,
  showNativeName = true,
  className = '',
}) => {
  const { currentLanguage, changeLanguage, supportedLanguages } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Get the current language option
  const currentLangOption = supportedLanguages.find((lang) => lang.code === currentLanguage);

  /**
   * Handles language selection.
   * 处理语言选择。
   */
  const handleLanguageChange = useCallback(
    async (langCode: string) => {
      setIsOpen(false);
      await changeLanguage(langCode);
    },
    [changeLanguage],
  );

  /**
   * Toggles the dropdown menu.
   * 切换下拉菜单。
   */
  const toggleDropdown = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  /**
   * Closes the dropdown when clicking outside.
   * 点击外部时关闭下拉菜单。
   */
  const handleBlur = useCallback((e: React.FocusEvent) => {
    // Check if the new focus target is within the dropdown
    if (!dropdownRef.current?.contains(e.relatedTarget as Node)) {
      setIsOpen(false);
    }
  }, []);

  /**
   * Handles keyboard navigation.
   * 处理键盘导航。
   */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleDropdown();
      }
    },
    [toggleDropdown],
  );

  /**
   * Formats the display text for a language option.
   * 格式化语言选项的显示文本。
   */
  const formatLanguageDisplay = useCallback(
    (lang: { flag: string; nativeName: string; name: string }) => {
      const parts: string[] = [];
      if (showFlag) {
        parts.push(lang.flag);
      }
      parts.push(showNativeName ? lang.nativeName : lang.name);
      return parts.join(' ');
    },
    [showFlag, showNativeName],
  );

  // Render buttons variant
  if (variant === 'buttons') {
    return (
      <div
        className={`flex items-center gap-2 ${className}`}
        role="group"
        aria-label="Language selection"
      >
        {supportedLanguages.map((lang) => (
          <button
            key={lang.code}
            onClick={() => handleLanguageChange(lang.code)}
            className={`
              px-3 py-2 rounded-lg text-sm font-medium transition-all
              ${
                currentLanguage === lang.code
                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 ring-2 ring-blue-500'
                  : 'bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
              }
            `}
            aria-pressed={currentLanguage === lang.code}
            aria-label={`Switch to ${lang.name}`}
          >
            {formatLanguageDisplay(lang)}
          </button>
        ))}
      </div>
    );
  }

  // Render dropdown variant (default)
  return (
    <div ref={dropdownRef} className={`relative ${className}`} onBlur={handleBlur}>
      {/* Dropdown trigger button */}
      <button
        type="button"
        onClick={toggleDropdown}
        onKeyDown={handleKeyDown}
        className="
          w-full flex items-center justify-between gap-2
          px-4 py-2.5 
          bg-slate-50 dark:bg-slate-800/50 
          border border-slate-200 dark:border-slate-700 
          rounded-xl 
          text-sm font-medium text-slate-900 dark:text-white 
          hover:bg-slate-100 dark:hover:bg-slate-700
          focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 
          outline-none
          transition-colors
        "
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label="Select language"
      >
        <span className="flex items-center gap-2">
          <Globe size={16} className="text-slate-400" />
          <span>
            {currentLangOption ? formatLanguageDisplay(currentLangOption) : currentLanguage}
          </span>
        </span>
        <ChevronDown
          size={16}
          className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div
          className="
            absolute z-50 top-full left-0 right-0 mt-1
            bg-white dark:bg-slate-800 
            border border-slate-200 dark:border-slate-700 
            rounded-xl 
            shadow-xl
            overflow-hidden
          "
          role="listbox"
          aria-label="Available languages"
        >
          {supportedLanguages.map((lang) => (
            <button
              key={lang.code}
              onClick={() => handleLanguageChange(lang.code)}
              className={`
                w-full flex items-center gap-3 px-4 py-3
                text-sm font-medium text-left
                transition-colors
                ${
                  currentLanguage === lang.code
                    ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                }
              `}
              role="option"
              aria-selected={currentLanguage === lang.code}
            >
              {showFlag && <span className="text-lg">{lang.flag}</span>}
              <span className="flex flex-col">
                <span>{showNativeName ? lang.nativeName : lang.name}</span>
                {showNativeName && (
                  <span className="text-xs text-slate-500 dark:text-slate-400">{lang.name}</span>
                )}
              </span>
              {currentLanguage === lang.code && <span className="ml-auto text-blue-500">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default React.memo(LanguageSwitcher);
