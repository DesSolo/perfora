import { memo, useEffect, useRef } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { holeCenters } from '../core/geometry/binding';
import {
  CALIBRATION_LINE,
  hasBackSides,
  printSheetSize,
  printSides,
  sheetLayout,
  type SheetSide,
  type Size,
  type Slot,
} from '../core/geometry/imposition';
import type { Project } from '../core/model';
import { PX_PER_MM } from '../core/units';
import { useEditor, useProject, useT, type EditorState } from '../store/editor';
import { PrintHoleMarks } from './PageOverlay';
import { PageSurface } from './PageSurface';
import { useSeenOnce } from './useInView';

const PrintSlot = memo(function PrintSlot({ slot, project }: { slot: Slot; project: Project }) {
  const page = project.pages[slot.pageIndex];
  const size = project.page;
  const holes = project.print.holeMarks === 'print' ? holeCenters(slot.pageIndex, project) : [];
  return (
    <div
      className="print-slot"
      data-page-index={slot.pageIndex}
      style={{
        left: `${slot.x}mm`,
        top: `${slot.y}mm`,
        width: `${size.width}mm`,
        height: `${size.height}mm`,
        transform: slot.rotation ? 'rotate(180deg)' : undefined,
      }}
    >
      <PageSurface page={page} size={size} />
      <PrintHoleMarks holes={holes} size={size} />
    </div>
  );
});

/** Сторона листа в том виде, в каком уходит на принтер. Тот же компонент в предпросмотре. */
export function PrintSheet({ side, project }: { side: SheetSide; project: Project }) {
  const { x, y } = side.offset;
  return (
    <div className="print-page" data-back={side.back || undefined} style={{ width: `${side.width}mm`, height: `${side.height}mm` }}>
      <div className="print-page-inner" style={{ transform: x || y ? `translate(${x}mm, ${y}mm)` : undefined }}>
        {side.slots.map((s) => (
          <PrintSlot key={s.pageIndex} slot={s} project={project} />
        ))}
        {side.cropMarks.length > 0 && (
          <svg
            className="page-overlay crop-marks"
            width={`${side.width}mm`}
            height={`${side.height}mm`}
            viewBox={`0 0 ${side.width} ${side.height}`}
            aria-hidden="true"
          >
            <g stroke="#000" strokeWidth={0.15}>
              {side.cropMarks.map((m, i) => (
                <line key={i} x1={m.x1} y1={m.y1} x2={m.x2} y2={m.y2} />
              ))}
            </g>
          </svg>
        )}
      </div>
    </div>
  );
}

/**
 * Тестовый лист калибровки: линии в 10 мм от левого и верхнего края, перекрестие
 * в центре (на просвет совпадает с оборотом) и контрольный отрезок для проверки масштаба.
 * Печатается без смещений, чтобы мерить исходную погрешность принтера.
 */
export function CalibrationSheet({ size, back }: { size: Size; back: boolean }) {
  const t = useT();
  const { width: w, height: h } = size;
  const L = CALIBRATION_LINE;
  const cx = w / 2;
  const cy = h / 2;
  const scale = w - 2 * L - 10 >= 100 ? 100 : 50;
  const sy = cy + 25;
  const text = { fontFamily: "'PT Sans', sans-serif", fill: '#000', stroke: 'none' } as const;
  return (
    <div className="print-page" data-back={back || undefined} style={{ width: `${w}mm`, height: `${h}mm` }}>
      <svg className="page-overlay" width={`${w}mm`} height={`${h}mm`} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
        <g stroke="#000" strokeWidth={0.2} fill="none">
          <line x1={L} y1={0} x2={L} y2={h} />
          <line x1={0} y1={L} x2={w} y2={L} />
          <circle cx={cx} cy={cy} r={5} />
          <path d={`M${cx - 10} ${cy}h20M${cx} ${cy - 10}v20`} />
          <path d={`M${cx - scale / 2} ${sy}h${scale}`} />
          {Array.from({ length: scale / 10 + 1 }, (_, i) => (
            <path key={i} d={`M${cx - scale / 2 + i * 10} ${sy - (i % 5 === 0 ? 3 : 1.5)}v${i % 5 === 0 ? 3 : 1.5}`} />
          ))}
        </g>
        <text x={L + 2} y={L + 7} fontSize={5} fontWeight={700} {...text}>
          {t(back ? 'calib.back' : 'calib.front')}
        </text>
        <text x={L + 2} y={L + 13} fontSize={3.2} {...text}>
          {t('calib.sheetLines', { mm: L })}
        </text>
        <text x={L + 2} y={L + 18} fontSize={3.2} {...text}>
          {t('calib.sheetCross')}
        </text>
        <text x={cx} y={sy + 6} fontSize={3.2} textAnchor="middle" {...text}>
          {t('calib.sheetScale', { mm: scale })}
        </text>
      </svg>
    </div>
  );
}

/** Печатный рендер, монтируется в body только на время печати. */
export function PrintRoot() {
  const printing = useEditor((s) => s.printing);
  const target = useEditor((s) => s.printTarget);
  const job = useEditor((s) => s.printJob);
  const project = useProject();
  if (!printing) return null;
  const { width, height } = printSheetSize(project);
  const sides = target === 'calibration' ? null : printSides(project, job);
  return createPortal(
    <div className="print-root" data-testid="print-root">
      <style>{`@page { size: ${width}mm ${height}mm; margin: 0; }`}</style>
      {sides
        ? sides.map((s, i) => <PrintSheet key={i} side={s} project={project} />)
        : [false, true].map((back) => <CalibrationSheet key={String(back)} size={{ width, height }} back={back} />)}
    </div>,
    document.body,
  );
}

/** Смонтировать печатный рендер и дождаться шрифтов и картинок. */
export async function preparePrint(target: EditorState['printTarget'] = 'project'): Promise<void> {
  flushSync(() => useEditor.getState().setPrinting(true, target));
  await document.fonts.ready;
  const images = [...document.querySelectorAll<HTMLImageElement>('.print-root img')];
  await Promise.all(images.map((img) => img.decode().catch(() => undefined)));
}

export async function printProject(target: EditorState['printTarget'] = 'project'): Promise<void> {
  await preparePrint(target);
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

const PREVIEW_PX = 260;

function PreviewItem({ side, project, caption }: { side: SheetSide; project: Project; caption: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useSeenOnce(ref, '400px');
  // Альбомные листы шире, но не выше книжных.
  const scale = PREVIEW_PX / (Math.max(side.width, side.height) * PX_PER_MM);
  return (
    <figure className="preview-item">
      <div ref={ref} className="preview-page" style={{ width: side.width * PX_PER_MM * scale, height: side.height * PX_PER_MM * scale }}>
        {seen && (
          <div style={{ transform: `scale(${scale})`, transformOrigin: '0 0' }}>
            <PrintSheet side={side} project={project} />
          </div>
        )}
      </div>
      <figcaption>{caption}</figcaption>
    </figure>
  );
}

/** Выбор сторон и порядка для ручного дуплекса. Общий для инспектора и предпросмотра. */
export function PrintJobControls() {
  const t = useT();
  const project = useProject();
  const job = useEditor((s) => s.printJob);
  const set = useEditor((s) => s.setPrintJob);
  return (
    <>
      {hasBackSides(project) && (
        <label className="field">
          <span>{t('job.sides')}</span>
          <select value={job.sides} onChange={(e) => set({ sides: e.target.value as typeof job.sides })}>
            {(['all', 'front', 'back'] as const).map((v) => (
              <option key={v} value={v}>
                {t(`job.${v}`)}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="check">
        <input type="checkbox" checked={job.reverse} onChange={(e) => set({ reverse: e.target.checked })} />
        <span>{t('job.reverse')}</span>
      </label>
    </>
  );
}

export function PrintPreview() {
  const t = useT();
  const open = useEditor((s) => s.previewOpen);
  const job = useEditor((s) => s.printJob);
  const project = useProject();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && useEditor.getState().setPreviewOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;
  const close = () => useEditor.getState().setPreviewOpen(false);
  const sides = printSides(project, job);
  const imposed = !!sheetLayout(project);
  const caption = (s: SheetSide) => {
    const pages = s.slots.map((x) => x.pageIndex + 1).sort((a, b) => a - b);
    if (!imposed) return pages.length ? String(pages[0]) : t('preview.blank');
    const face = t(s.back ? 'preview.back' : 'preview.front', { n: s.sheet + 1 });
    return `${face} · ${pages.length ? pages.join(', ') : t('preview.blank')}`;
  };

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
        <div className="preview-controls">
          <PrintJobControls />
          <span className="hint">{t('preview.count', { n: sides.length })}</span>
        </div>
        <p className="hint">{t('print.hint')}</p>
        <div className="preview-grid">
          {sides.map((s, i) => (
            <PreviewItem key={`${s.sheet}-${s.back}-${i}`} side={s} project={project} caption={caption(s)} />
          ))}
        </div>
      </div>
    </div>
  );
}
