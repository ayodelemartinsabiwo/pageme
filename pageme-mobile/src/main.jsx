// main.jsx — Vite entry point: mounts React app into #root

import React from 'react';
import ReactDOM from 'react-dom/client';
import { App, ErrorBoundary } from './app.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
