
import '@fontsource/public-sans/latin-400.css';
import '@fontsource/public-sans/latin-500.css';
import '@fontsource/public-sans/latin-600.css';
import '@fontsource/public-sans/latin-700.css';
import '@fontsource/public-sans/latin-ext-400.css';
import '@fontsource/public-sans/latin-ext-500.css';
import '@fontsource/public-sans/latin-ext-600.css';
import '@fontsource/public-sans/latin-ext-700.css';
import './index.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { initializeTheme } from './hooks/useTheme';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

initializeTheme();

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
