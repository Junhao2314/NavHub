/**
 * useTheme - 主题模式管理
 *
 * 功能:
 *   - 支持三种主题模式：light（浅色）、dark（深色）、system（跟随系统）
 *   - 主题切换时自动更新 DOM class 和 localStorage
 *   - 监听系统主题变化（仅在 system 模式下生效）
 *   - 支持从云端同步恢复主题设置
 *
 * 实现细节:
 *   - 通过 document.documentElement.classList 控制 Tailwind 的 dark mode
 *   - 使用 matchMedia API 检测系统偏好
 */

import { useCallback, useEffect, useState } from 'react';
import type { ThemeMode } from '../types';
import { THEME_KEY } from '../utils/constants';
import { safeLocalStorageGetItem, safeLocalStorageSetItem } from '../utils/storage';

export type { ThemeMode };

export function useTheme() {
  const [themeMode, setThemeMode] = useState<ThemeMode>('system');
  const [darkMode, setDarkMode] = useState(false);

  /**
   * 应用主题模式
   *
   * 根据当前模式和系统偏好，决定是否启用深色模式，
   * 并更新 DOM 的 dark class。
   */
  const applyThemeMode = useCallback((mode: ThemeMode) => {
    if (typeof window === 'undefined') return;
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const shouldUseDark = mode === 'dark' || (mode === 'system' && prefersDark);
    setDarkMode(shouldUseDark);
    if (shouldUseDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  /** 设置主题并持久化 */
  const setThemeAndApply = useCallback(
    (mode: ThemeMode) => {
      setThemeMode(mode);
      safeLocalStorageSetItem(THEME_KEY, mode);
      applyThemeMode(mode);
    },
    [applyThemeMode],
  );

  /** 循环切换主题：light → dark → system → light */
  const toggleTheme = useCallback(() => {
    const nextMode: ThemeMode =
      themeMode === 'light' ? 'dark' : themeMode === 'dark' ? 'system' : 'light';
    setThemeAndApply(nextMode);
  }, [themeMode, setThemeAndApply]);

  /**
   * 从云端同步恢复主题设置
   *
   * 校验同步数据的合法性，防止无效值导致异常。
   */
  const applyFromSync = useCallback(
    (syncedThemeMode: ThemeMode) => {
      // Validate the synced theme mode
      if (
        syncedThemeMode !== 'light' &&
        syncedThemeMode !== 'dark' &&
        syncedThemeMode !== 'system'
      ) {
        return;
      }
      setThemeMode(syncedThemeMode);
      safeLocalStorageSetItem(THEME_KEY, syncedThemeMode);
      applyThemeMode(syncedThemeMode);
    },
    [applyThemeMode],
  );

  /** 初始化：从 localStorage 加载主题设置 */
  useEffect(() => {
    const storedTheme = safeLocalStorageGetItem(THEME_KEY);
    const initialMode: ThemeMode =
      storedTheme === 'dark' || storedTheme === 'light' || storedTheme === 'system'
        ? storedTheme
        : 'system';
    setThemeMode(initialMode);
    applyThemeMode(initialMode);
  }, [applyThemeMode]);

  /**
   * 监听系统主题变化
   *
   * 仅在 system 模式下响应系统偏好变化。
   * 兼容旧版浏览器的 addListener/removeListener API。
   */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      if (themeMode === 'system') {
        applyThemeMode('system');
      }
    };

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleChange);
    } else {
      mediaQuery.addListener(handleChange);
    }

    return () => {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener('change', handleChange);
      } else {
        mediaQuery.removeListener(handleChange);
      }
    };
  }, [themeMode, applyThemeMode]);

  return {
    themeMode,
    darkMode,
    toggleTheme,
    setThemeAndApply,
    applyFromSync,
  };
}
