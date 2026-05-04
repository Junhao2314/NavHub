(function () {
  function resolveShouldDark() {
    var stored = '';
    var mode = 'system';
    var prefersDark = false;

    try {
      stored = localStorage.getItem('theme') || '';
      mode = stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
      prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch {
      return false;
    }

    return mode === 'dark' || (mode === 'system' && prefersDark);
  }

  function applyTheme(shouldDark) {
    var root = document.documentElement;
    root.classList.toggle('dark', shouldDark);
    root.style.backgroundColor = shouldDark ? '#05070f' : '#f8fafc';

    var statusBarMeta = document.getElementById('apple-status-bar-style');
    if (statusBarMeta) {
      statusBarMeta.setAttribute('content', shouldDark ? 'black-translucent' : 'default');
    }
  }

  function applyLoaderText() {
    var textNode = document.querySelector('#app-loader .loader-text');
    if (!textNode) return;

    var lang = '';
    try {
      lang = localStorage.getItem('navhub-language') || '';
    } catch {
      lang = '';
    }

    if (!lang && typeof navigator !== 'undefined') {
      lang = navigator.language || '';
    }

    textNode.textContent = String(lang).toLowerCase().startsWith('zh') ? '加载中...' : 'Loading...';
  }

  applyTheme(resolveShouldDark());

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyLoaderText, { once: true });
  } else {
    applyLoaderText();
  }
})();
