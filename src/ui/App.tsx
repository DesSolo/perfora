import { useEffect } from 'react';
import { useEditor } from '../store/editor';
import { CalibrationDialog } from './Calibration';
import { Canvas } from './Canvas';
import { Inspector } from './Inspector';
import { PagesPanel } from './PagesPanel';
import { ProjectsDialog } from './Projects';
import { PrintPreview, PrintRoot, usePrintEvents } from './Print';
import { Topbar } from './Topbar';
import { useShortcuts } from './useShortcuts';

function Notice() {
  const notice = useEditor((s) => s.notice);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => useEditor.getState().setNotice(null), 4000);
    return () => clearTimeout(id);
  }, [notice]);
  return notice ? (
    <div className="notice" role="status">
      {notice}
    </div>
  ) : null;
}

export function App() {
  useShortcuts();
  usePrintEvents();
  const lang = useEditor((s) => s.lang);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  return (
    <div className="app">
      <Topbar />
      <div className="workspace">
        <PagesPanel />
        <Canvas />
        <Inspector />
      </div>
      <Notice />
      <PrintPreview />
      <ProjectsDialog />
      <CalibrationDialog />
      <PrintRoot />
    </div>
  );
}
