/**
 * Application Entry Point
 * 应用程序入口
 *
 * Initializes the React application with:
 * 初始化 React 应用，包含：
 * - PWA service worker registration / PWA Service Worker 注册
 * - Error boundary for graceful error handling / 错误边界用于优雅的错误处理
 * - Dialog provider for global notifications / 对话框提供者用于全局通知
 * - i18n initialization with lazy-loaded resources / 带懒加载资源的 i18n 初始化
 */

import { registerSW } from 'virtual:pwa-register';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { DialogProvider } from './components/ui/DialogProvider';
import { initI18nAsync } from './config/i18n';
import './index.css';
import { hideAppLoader } from './utils/appLoader';

/**
 * Hide the initial loading animation
 * 隐藏初始加载动画
 *
 * Called when the app is ready or when an error occurs.
 * 在应用准备就绪或发生错误时调用。
 */
const hideLoader = () => {
  hideAppLoader();
};

// Get root element / 获取根元素
const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Could not find root element to mount to');
}

/**
 * Register PWA service worker
 * 注册 PWA Service Worker
 *
 * - immediate: Register immediately on page load / 页面加载时立即注册
 * - onNeedRefresh: Auto-update when new version available / 有新版本时自动更新
 */
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    updateSW(true);
  },
});

/**
 * Render the React application
 * 渲染 React 应用
 */
const renderApp = () => {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <ErrorBoundary onError={hideLoader}>
        <DialogProvider>
          <App onReady={hideLoader} />
        </DialogProvider>
      </ErrorBoundary>
    </React.StrictMode>,
  );
};

/**
 * Initialize i18n with lazy-loaded resources before rendering the app
 * 在渲染应用之前使用懒加载资源初始化 i18n
 *
 * This ensures translations are available when components mount.
 * 这确保组件挂载时翻译已可用。
 * Requirements: 2.2, 8.1, 8.2, 8.5
 */
initI18nAsync()
  .then(renderApp)
  .catch((error) => {
    console.error('Failed to initialize i18n:', error);
    // Still render the app even if i18n fails, using fallback keys
    // 即使 i18n 失败也渲染应用，使用回退键
    renderApp();
  });
