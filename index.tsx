import React from 'react';
import ReactDOM from 'react-dom/client';
import './src/index.css';
import App from './App';
import { I18nProvider } from './src/i18n';
import { initCsrfToken } from './services/apiService';

const flowsyncExport = (format?: 'csv' | 'json' | 'markdown') => {
  window.dispatchEvent(new CustomEvent('flowsync:export', { detail: { format } }));
};

window.flowsyncExport = flowsyncExport;

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

// Initialize CSRF token on app startup
// This ensures the CSRF cookie is set before any state-changing operations
void initCsrfToken();

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </React.StrictMode>
);
