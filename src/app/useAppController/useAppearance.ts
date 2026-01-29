import { useEffect, useMemo } from 'react';
import type { SiteSettings } from '../../types';

export const useAppearance = (siteSettings: SiteSettings) => {
  useEffect(() => {
    if (siteSettings.accentColor) {
      document.documentElement.style.setProperty('--accent-color', siteSettings.accentColor);
    }
  }, [siteSettings.accentColor]);

  const toneClasses = useMemo(() => {
    const tone = siteSettings.grayScale;
    if (tone === 'zinc')
      return { bg: 'bg-zinc-50 dark:bg-zinc-950', text: 'text-zinc-900 dark:text-zinc-50' };
    if (tone === 'neutral')
      return {
        bg: 'bg-neutral-50 dark:bg-neutral-950',
        text: 'text-neutral-900 dark:text-neutral-50',
      };
    return { bg: 'bg-slate-50 dark:bg-slate-950', text: 'text-slate-900 dark:text-slate-50' };
  }, [siteSettings.grayScale]);

  const closeOnBackdrop = siteSettings.closeOnBackdrop ?? false;
  const backgroundImage = siteSettings.backgroundImage?.trim();
  const useCustomBackground = !!siteSettings.backgroundImageEnabled && !!backgroundImage;
  const backgroundMotion = siteSettings.backgroundMotion ?? false;

  return {
    toneClasses,
    closeOnBackdrop,
    backgroundImage,
    useCustomBackground,
    backgroundMotion,
  };
};
