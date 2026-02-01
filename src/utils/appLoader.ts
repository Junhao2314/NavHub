type AppLoaderMode = 'light' | 'dark' | 'auto';

const getLoader = (): HTMLElement | null => {
  if (typeof document === 'undefined') return null;
  return document.getElementById('app-loader');
};

const getLoaderText = (): HTMLElement | null => {
  if (typeof document === 'undefined') return null;
  return document.querySelector('#app-loader .loader-text');
};

const resolveShouldDark = (): boolean => {
  try {
    return document.documentElement.classList.contains('dark');
  } catch {
    return false;
  }
};

const applyLoaderMode = (loader: HTMLElement, mode: AppLoaderMode): void => {
  const shouldDark = mode === 'auto' ? resolveShouldDark() : mode === 'dark';
  loader.classList.toggle('dark-mode', shouldDark);
  loader.classList.toggle('light-mode', !shouldDark);
};

export const showAppLoader = (options?: { text?: string; mode?: AppLoaderMode }): void => {
  const loader = getLoader();
  if (!loader) return;

  applyLoaderMode(loader, options?.mode ?? 'auto');
  loader.classList.remove('fade-out');

  if (typeof options?.text === 'string') {
    const textEl = getLoaderText();
    if (textEl) {
      textEl.textContent = options.text;
    }
  }
};

export const hideAppLoader = (): void => {
  const loader = getLoader();
  if (!loader) return;
  loader.classList.add('fade-out');
};
