import type { SiteSettings, ThemeMode } from '../../types';

export const computeDarkMode = (mode: ThemeMode): boolean => {
  try {
    if (!('matchMedia' in globalThis)) return false;
    const prefersDark = globalThis.matchMedia('(prefers-color-scheme: dark)').matches;
    return mode === 'dark' || (mode === 'system' && prefersDark);
  } catch {
    return false;
  }
};

export const applyDarkClass = (darkMode: boolean): void => {
  try {
    const root = globalThis.document?.documentElement;
    if (!root?.classList) return;
    if (darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  } catch {
    // ignore
  }
};

export const applySiteMeta = (siteSettings: SiteSettings): void => {
  try {
    if (siteSettings.title) {
      globalThis.document.title = siteSettings.title;
    }

    if (siteSettings.favicon) {
      const existingFavicons = globalThis.document.querySelectorAll('link[rel="icon"]');
      existingFavicons.forEach((favicon) => favicon.remove());

      const favicon = globalThis.document.createElement('link');
      favicon.rel = 'icon';
      favicon.href = siteSettings.favicon;
      globalThis.document.head.appendChild(favicon);
    }
  } catch {
    // ignore
  }
};
