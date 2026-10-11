import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './fonts';
import './styles.css';
import { App } from './ui/App';
import { useEditor } from './store/editor';
import { preparePrint } from './ui/Print';
import { restoreLast, startAutosave } from './persist/session';

// Доступ к стору и печати из e2e-тестов и консоли разработчика.
if (import.meta.env.DEV) Object.assign(window, { editor: useEditor, preparePrint });

// Восстанавливаем последний проект до первой отрисовки, чтобы не мигал пустой.
await restoreLast();
startAutosave();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
