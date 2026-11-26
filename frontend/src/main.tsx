import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { initInitialThemeClass } from './theme/batcaveTheme.ts';
import './styles/login.css';
import './styles/batcave.css';
import './styles/stage1.css';
import App from './App.tsx';

initInitialThemeClass();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
