import { memo, useEffect, useRef } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { holeCenters, pageRotationForPrint } from '../core/geometry/binding';
import type { Page, Project } from '../core/model';
import { PX_PER_MM } from '../core/units';
import { useEditor, useProject, useT } from '../store/editor';
import { PrintHoleMarks } from './PageOverlay';
import { PageSurface } from './PageSurface';
import { useSeenOnce } from './useInView';

/** Страница в том виде, в каком уходит на принтер. Тот же компонент в предпросмотре. */
export const PrintPage = memo(function PrintPage({ page, index, project }: { page: Page; index: number; project: Project }) {
  const size = project.page;
  const rotation = pageRotationForPrint(index, project);
  const holes = project.print.holeMarks === 'print' ? holeCenters(index, project) : [];
  return (
    <div className="print-page" data-page-index={index} style={{ width: `${size.width}mm`, height: `${size.height}mm` }}>
      <div className="print-page-inner" style={{ transform: rotation ? 'rotate(180deg)' : undefined }}>
        <PageSurface page={page} size={size} />
        <PrintHoleMarks holes={holes} size={size} />
      </div>
    </div>
  );
});

/** Печатный рендер, монтируется в body только на время печати. */
export function PrintRoot() {
  const printing = useEditor((s) => s.printing);
  const project = useProject();
  if (!printing) return null;
  const { width, height } = project.page;
  return createPortal(
    <div className="print-root" data-testid="print-root">
      <style>{`@page { size: ${width}mm ${height}mm; margin: 0; }`}</style>
      {project.pages.map((p, i) => (
        <PrintPage key={p.id} page={p} index={i} project={project} />
      ))}
    </div>,
    document.body,
  );
}

/** Смонтировать печатный рендер и дождаться шрифтов и картинок. */
export async function preparePrint(): Promise<void> {
  flushSync(() => useEditor.getState().setPrinting(true));
  await document.fonts.ready;
  const images = [...document.querySelectorAll<HTMLImageElement>('.print-root img')];
  await Promise.all(images.map((img) => img.decode().catch(() => undefined)));
}

export async function printProject(): Promise<void> {
  await preparePrint();
  window.print();
}

/** Печать из меню браузера (без нашей кнопки): монтируем рендер синхронно, картинки уже в кэше. */
export function usePrintEvents() {
  useEffect(() => {
    const before = () => {
      if (!useEditor.getState().printing) flushSync(() => useEditor.getState().setPrinting(true));
    };
    const after = () => useEditor.getState().setPrinting(false);
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => {
      window.removeEventListener('beforeprint', before);
      window.removeEventListener('afterprint', after);
    };
  }, []);
}

const PREVIEW_W_PX = 260;

function PreviewItem({ page, index, project }: { page: Page; index: number; project: Project }) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useSeenOnce(ref, '400px');
  const { width, height } = project.page;
  const scale = PREVIEW_W_PX / (width * PX_PER_MM);
  return (
    <figure className="preview-item">
      <div ref={ref} className="preview-page" style={{ width: PREVIEW_W_PX, height: height * PX_PER_MM * scale }}>
        {seen && (
          <div style={{ transform: `scale(${scale})`, transformOrigin: '0 0' }}>
            <PrintPage page={page} index={index} project={project} />
          </div>
        )}
      </div>
      <figcaption>{index + 1}</figcaption>
    </figure>
  );
}

export function PrintPreview() {
  const t = useT();
  const open = useEditor((s) => s.previewOpen);
  const project = useProject();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && useEditor.getState().setPreviewOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;
  const close = () => useEditor.getState().setPreviewOpen(false);

  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="modal preview" role="dialog" aria-modal="true" aria-label={t('print.previewTitle')}>
        <header className="modal-header">
          <h2>{t('print.previewTitle')}</h2>
          <div className="spacer" />
          <button
            className="btn primary"
            onClick={() => {
              close();
              void printProject();
            }}
          >
            {t('print.print')}
          </button>
          <button className="btn" onClick={close}>
            {t('print.close')}
          </button>
        </header>
        <p className="hint">{t('print.hint')}</p>
        <div className="preview-grid">
          {project.pages.map((p, i) => (
            <PreviewItem key={p.id} page={p} index={i} project={project} />
          ))}
        </div>
      </div>
    </div>
  );
}
