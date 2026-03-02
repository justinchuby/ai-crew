import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import './index.css';
import { getAuthToken } from './hooks/useApi';
import { useSettingsStore } from './stores/settingsStore';
import { migrateLocalStorage } from './utils/migrateLocalStorage';

// Migrate localStorage keys from ai-crew → flightdeck before anything reads them
migrateLocalStorage();

// Apply theme before render to avoid flash
useSettingsStore.getState().initThemeListener();

// Auto-inject auth headers for all /api requests
const _origFetch = window.fetch;
window.fetch = function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  if (url.startsWith('/api')) {
    const token = getAuthToken();
    if (token) {
      const headers = new Headers(init?.headers);
      if (!headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${token}`);
      }
      init = { ...init, headers };
    }
  }
  return _origFetch.call(window, input, init);
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
