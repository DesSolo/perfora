import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './fonts';
import './styles.css';
import { App } from './ui/App';
import { useEditor } from './store/editor';
import { preparePrint } from './ui/Print';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Доступ к стору и печати из e2e-тестов и консоли разработчика.
if (import.meta.env.DEV) Object.assign(window, { editor: useEditor, preparePrint });
