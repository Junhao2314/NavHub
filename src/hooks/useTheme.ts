/**
 * useTheme - Theme Mode Management Hook
 * useTheme - 主题模式管理 Hook
 *
 * Features / 功能:
 *   - Support three theme modes: light, dark, system (follow system preference)
 *     支持三种主题模式：light（浅色）、dark（深色）、system（跟随系统）
 *   - Auto-update DOM class and localStorage on theme change
 *     主题切换时自动更新 DOM class 和 localStorage
 *   - Listen to system theme changes (only in system mode)
 *     监听系统主题变化（仅在 system 模式下生效）
 *   - Support restoring theme settings from cloud sync
 *     支持从云端同步恢复主题设置
 *
 * Implementation details / 实现细节:
 *   - Control Tailwind dark mode via document.documentElement.classList
 *     通过 document.documentElement.classList 控制 Tailwind 的 dark mode
 *   - Use matchMedia API to detect system preference
 *     使用 matchMedia API 检测系统偏好
 */

import { useCallback, useEffect } from 'react';
import { useAppStore } from '../stores/useAppStore';
import type { ThemeMode } from '../types';
import { THEME_KEY } from '../utils/constants';
import { safeLocalStorageGetItem, safeLocalStorageSetItem } from '../utils/storage';

export type { ThemeMode };

export function useTheme() {
  const themeMode = useAppStore((s) => s.themeMode);
  const setThemeMode = useAppStore((s) => s.setThemeMode);
  const hydrated = useAppStore((s) => s.__hydratedTheme);
  const setHydrated = useAppStore((s) => s.__setHydratedTheme);
  const darkMode = useAppStore((s) => s.isDarkMode);
  const setIsDarkMode = useAppStore((s) => s.__setIsDarkMode);

  /**
   * Apply theme mode
   * 应用主题模式
   *
   * Determine whether to enable dark mode based on current mode and system preference,
   * and update the DOM's dark class.
   * 根据当前模式和系统偏好，决定是否启用深色模式，并更新 DOM 的 dark class。
   */
  const applyThemeMode = useCallback(
    (mode: ThemeMode) => {
      if (typeof window === 'undefined') return;
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const shouldUseDark = mode === 'dark' || (mode === 'system' && prefersDark);
      setIsDarkMode(shouldUseDark);
      if (shouldUseDark) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    },
    [setIsDarkMode],
  );

  /**
   * Set theme and persist to localStorage
   * 设置主题并持久化到 localStorage
   */
  const setThemeAndApply = useCallback(
    (mode: ThemeMode) => {
      setThemeMode(mode);
      safeLocalStorageSetItem(THEME_KEY, mode);
      applyThemeMode(mode);
    },
    [applyThemeMode, setThemeMode],
  );

  /**
   * Cycle through themes: light → dark → system → light
   * 循环切换主题：light → dark → system → light
   */
  const toggleTheme = useCallback(() => {
    const nextMode: ThemeMode =
      themeMode === 'light' ? 'dark' : themeMode === 'dark' ? 'system' : 'light';
    setThemeAndApply(nextMode);
  }, [themeMode, setThemeAndApply]);

  /**
   * Restore theme settings from cloud sync
   * 从云端同步恢复主题设置
   *
   * Validate synced data to prevent invalid values causing errors.
   * 校验同步数据的合法性，防止无效值导致异常。
   */
  const applyFromSync = useCallback(
    (syncedThemeMode: ThemeMode) => {
      // Validate the synced theme mode / 验证同步的主题模式
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
    [applyThemeMode, setThemeMode],
  );

  /**
   * Initialize: Load theme settings from localStorage
   * 初始化：从 localStorage 加载主题设置
   */
  useEffect(() => {
    if (hydrated) return;
    const storedTheme = safeLocalStorageGetItem(THEME_KEY);
    const initialMode: ThemeMode =
      storedTheme === 'dark' || storedTheme === 'light' || storedTheme === 'system'
        ? storedTheme
        : 'system';
    setThemeMode(initialMode);
    applyThemeMode(initialMode);
    setHydrated(true);
  }, [applyThemeMode, hydrated, setHydrated, setThemeMode]);

  /**
   * Support updating themeMode outside React: ensure DOM class stays in sync
   * 支持在 React 外更新 themeMode：确保 DOM class 同步
   */
  useEffect(() => {
    if (!hydrated) return;
    applyThemeMode(themeMode);
  }, [applyThemeMode, hydrated, themeMode]);

  /**
   * Listen to system theme changes
   * 监听系统主题变化
   *
   * Only respond to system preference changes in system mode.
   * 仅在 system 模式下响应系统偏好变化。
   */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      if (themeMode === 'system') {
        applyThemeMode('system');
      }
    };

    mediaQuery.addEventListener('change', handleChange);

    return () => {
      mediaQuery.removeEventListener('change', handleChange);
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
