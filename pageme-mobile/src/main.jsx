// main.jsx — Vite entry point: mounts React app into #root

import React from 'react';
import ReactDOM from 'react-dom/client';
import { App, ErrorBoundary } from './app.jsx';
import { loadSessionToken } from './identity.js';

async function startPageMe() {
  await loadSessionToken();
  ReactDOM.createRoot(document.getElementById('root')).render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}

startPageMe();
