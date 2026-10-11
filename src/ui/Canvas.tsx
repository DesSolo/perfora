import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { spreadOf } from '../core/geometry/spread';
import { PX_PER_MM } from '../core/units';
import { useEditor, useProject, useT } from '../store/editor';
import { EditorPage } from './EditorPage';

const PADDING_PX = 48;
/** Зазор между страницами разворота: место под кольца. */
export const SPREAD_GAP_PX = 16;

export function fitZoom(container: HTMLElement, w: number, h: number, extraPx = { x: 0, y: 0 }): number {
  const availW = container.clientWidth - PADDING_PX * 2 - extraPx.x;
  const availH = container.clientHeight - PADDING_PX * 2 - extraPx.y;
  return Math.max(0.1, Math.min(availW / (w * PX_PER_MM), availH / (h * PX_PER_MM)));
}

/** Масштаб «по размеру окна» с учётом режима разворота. */
export function fitCurrent(container: HTMLElement): number {
  const s = useEditor.getState();
  const { page, binding } = s.history.present;
  if (!s.view.spread) return fitZoom(container, page.width, page.height);
  return binding.side === 'top'
    ? fitZoom(container, page.width, page.height * 2, { x: 0, y: SPREAD_GAP_PX })
    : fitZoom(container, page.width * 2, page.height, { x: SPREAD_GAP_PX, y: 0 });
}

export function Canvas() {
  const t = useT();
  const project = useProject();
  const zoom = useEditor((s) => s.zoom);
  const spread = useEditor((s) => s.view.spread);
  const currentPageId = useEditor((s) => s.currentPageId);
  const ref = useRef<HTMLDivElement>(null);
  const [dropping, setDropping] = useState(false);
  const { width, height } = project.page;
  const vertical = project.binding.side === 'top';
  const index = Math.max(0, project.pages.findIndex((p) => p.id === currentPageId));

  // Вписать страницу при старте, смене размера и режима просмотра.
  useLayoutEffect(() => {
    if (ref.current) useEditor.getState().setZoom(fitCurrent(ref.current));
  }, [width, height, spread, vertical]);

  // Ctrl/Cmd + колесо — масштаб; React вешает wheel как passive, поэтому слушатель нативный.
  useEffect(() => {
    const el = ref.current!;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const s = useEditor.getState();
      s.setZoom(s.zoom * Math.exp(-e.deltaY * 0.002));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const hasFiles = (e: React.DragEvent) => e.dataTransfer.types.includes('Files');

  const frame = (i: number | null, key: string) => (
    <div
      key={key}
      className={`page-frame${i === null ? ' empty' : ''}`}
      style={{ width: `calc(${width}mm * ${zoom})`, height: `calc(${height}mm * ${zoom})`, ['--z' as string]: zoom }}
    >
      {i !== null && (
        <div className="page-scale" style={{ transform: `scale(${zoom})` }}>
          <EditorPage page={project.pages[i]} index={i} project={project} />
        </div>
      )}
    </div>
  );

  // В развороте сверху (или слева) оборот предыдущего листа, снизу (справа) — лицевая.
  const pair = spreadOf(index, project.pages.length);

  return (
    <main
      ref={ref}
      className="canvas"
      onPointerDown={(e) => {
        const el = e.target as HTMLElement;
        if (el === e.currentTarget || el.classList.contains('canvas-inner') || el.classList.contains('spread')) {
          useEditor.getState().selectBlock(null);
        }
      }}
      onDragOver={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        setDropping(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDropping(false);
      }}
      onDrop={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        setDropping(false);
        void useEditor.getState().addImages([...e.dataTransfer.files]);
      }}
    >
      <div className="canvas-inner" style={{ padding: PADDING_PX }}>
        {spread ? (
          <div className={`spread${vertical ? ' vertical' : ''}`} style={{ gap: SPREAD_GAP_PX }}>
            {frame(pair.left, 'l')}
            {frame(pair.right, 'r')}
          </div>
        ) : (
          frame(index, 'single')
        )}
      </div>
      {dropping && <div className="drop-hint">{t('drop.hint')}</div>}
    </main>
  );
}
