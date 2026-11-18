import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { initInitialThemeClass } from './batcaveTheme';
import { App } from './App';
import './style.css';

// Apply stored or system theme synchronously before React mounts cleanly under script-src 'self'.
initInitialThemeClass();

const root = document.getElementById('root');
if (!root) throw new Error('Missing application root');
createRoot(root).render(<StrictMode><App /></StrictMode>);
