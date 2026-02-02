/**
 * Application Entry Point
 */

import { registerSW } from 'virtual:pwa-register';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { DialogProvider } from './components/ui/DialogProvider';
import { initI18n } from './config/i18n';
import './index.css';
import { hideAppLoader } from './utils/appLoader';

/**
 * Hide the initial loading animation
 */
const hideLoader = () => {
  hideAppLoader();
};

// Get root element
const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Could not find root element to mount to');
}

/**
 * Register PWA service worker
 */
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    updateSW(true);
  },
});

// Initialize i18n synchronously (no async loading needed)
initI18n();

/**
 * Render the React application
 */
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
