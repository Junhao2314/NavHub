import { useState, useEffect, useCallback } from 'react';
import { THEME_KEY } from '../utils/constants';
import type { ThemeMode } from '../types';

export type { ThemeMode };

export function useTheme() {
    const [themeMode, setThemeMode] = useState<ThemeMode>('system');
    const [darkMode, setDarkMode] = useState(false);

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

    const setThemeAndApply = useCallback((mode: ThemeMode) => {
        setThemeMode(mode);
        localStorage.setItem(THEME_KEY, mode);
        applyThemeMode(mode);
    }, [applyThemeMode]);

    const toggleTheme = useCallback(() => {
        const nextMode: ThemeMode = themeMode === 'light'
            ? 'dark'
            : themeMode === 'dark'
                ? 'system'
                : 'light';
        setThemeAndApply(nextMode);
    }, [themeMode, setThemeAndApply]);

    // Apply theme from sync data (Requirements 1.2)
    const applyFromSync = useCallback((syncedThemeMode: ThemeMode) => {
        // Validate the synced theme mode
        if (syncedThemeMode !== 'light' && syncedThemeMode !== 'dark' && syncedThemeMode !== 'system') {
            return;
        }
        setThemeMode(syncedThemeMode);
        localStorage.setItem(THEME_KEY, syncedThemeMode);
        applyThemeMode(syncedThemeMode);
    }, [applyThemeMode]);

    // Initialize theme on mount
    useEffect(() => {
        const storedTheme = localStorage.getItem(THEME_KEY);
        const initialMode: ThemeMode = storedTheme === 'dark' || storedTheme === 'light' || storedTheme === 'system'
            ? storedTheme
            : 'system';
        setThemeMode(initialMode);
        applyThemeMode(initialMode);
    }, [applyThemeMode]);

    // Listen for system theme changes
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
        applyFromSync
    };
}
