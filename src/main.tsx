/**
 * Application Entry Point
 * 应用程序入口
 *
 * Initializes the React application with:
 * 初始化 React 应用，包含：
 * - PWA service worker registration / PWA Service Worker 注册
 * - Error boundary for graceful error handling / 错误边界用于优雅的错误处理
 * - Dialog provider for global notifications / 对话框提供者用于全局通知
 */

import { registerSW } from 'virtual:pwa-register';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { DialogProvider } from './components/ui/DialogProvider';
import './index.css';

/**
 * Hide the initial loading animation
 * 隐藏初始加载动画
 *
 * Called when the app is ready or when an error occurs.
 * 在应用准备就绪或发生错误时调用。
 */
const hideLoader = () => {
  const loader = document.getElementById('app-loader');
  if (loader) {
    // Add fade-out animation / 添加淡出动画
    loader.classList.add('fade-out');
    // Remove element after animation completes / 动画完成后移除元素
    setTimeout(() => loader.remove(), 300);
  }
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

// Create React root and render application
// 创建 React 根节点并渲染应用
const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <DialogProvider>
      <ErrorBoundary onError={hideLoader}>
        <App onReady={hideLoader} />
      </ErrorBoundary>
    </DialogProvider>
  </React.StrictMode>,
);
