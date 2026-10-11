import { memo, useDeferredValue, useMemo, useRef, useState } from 'react';
import { hitsKeepOut, holeCenters } from '../core/geometry/binding';
import type { Page, Project } from '../core/model';
import { PrintHoleMarks } from './PageOverlay';
import { PX_PER_MM } from '../core/units';
import { useEditor, useProject, useT } from '../store/editor';
import { Icon } from './icons';
import { PageSurface, type PageSize } from './PageSurface';
import { useSeenOnce } from './useInView';

const THUMB_W = 112;

const Thumb = memo(function Thumb({
  page,
  index,
  size,
  binding,
  showHoles,
  current,
  onDropAt,
}: {
  page: Page;
  index: number;
  size: PageSize;
  binding: Project['binding'];
  showHoles: boolean;
  current: boolean;
  onDropAt: (from: number, to: number) => void;
}) {
  const t = useT();
  const ref = useRef<HTMLButtonElement>(null);
  const seen = useSeenOnce(ref);
  const [over, setOver] = useState(false);
  const scale = THUMB_W / (size.width * PX_PER_MM);
  const holes = useMemo(() => holeCenters(index, { page: size, binding }), [index, size, binding]);
  const warnings = useMemo(
    () => page.blocks.filter((b) => hitsKeepOut(b, holes, binding.keepOutPadding)).length,
    [page.blocks, holes, binding.keepOutPadding],
  );
  const h = size.height * PX_PER_MM * scale;

  return (
    <li className={`thumb${current ? ' current' : ''}${over ? ' drop-target' : ''}`}>
      <button
        ref={ref}
        className="thumb-button"
        draggable
        aria-current={current}
        aria-label={t('pages.page', { n: index + 1 })}
        onClick={() => useEditor.getState().selectPage(page.id)}
        onDragStart={(e) => {
          e.dataTransfer.setData('application/x-page-index', String(index));
          e.dataTransfer.effectAllowed = 'move';
        }}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes('application/x-page-index')) return;
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          setOver(false);
          const from = Number(e.dataTransfer.getData('application/x-page-index'));
          if (Number.isFinite(from)) onDropAt(from, index);
        }}
      >
        <div className="thumb-page" style={{ width: THUMB_W, height: h }}>
          {seen && (
            <div style={{ transform: `scale(${scale})`, transformOrigin: '0 0' }}>
              <PageSurface page={page} size={size} />
              {showHoles && <PrintHoleMarks holes={holes} size={size} />}
            </div>
          )}
        </div>
      </button>
      <span className="thumb-number">
        {index + 1}
        {warnings > 0 && (
          <span className="thumb-warn" title={t('warn.keepOutPage', { n: warnings })}>
            !
          </span>
        )}
      </span>
    </li>
  );
});

export function PagesPanel() {
  const t = useT();
  const project = useProject();
  // Миниатюры отстают от холста на кадр-другой: перетаскивание блока не ждёт их перерисовки.
  const pages = useDeferredValue(project.pages);
  const currentPageId = useEditor((s) => s.currentPageId);
  const showHoles = useEditor((s) => s.view.holes) && project.print.holeMarks !== 'off';
  const s = useEditor.getState();
  const index = project.pages.findIndex((p) => p.id === currentPageId);

  return (
    <aside className="pages-panel" aria-label={t('pages.title')}>
      <div className="panel-header">
        <h2>{t('pages.title')}</h2>
        <div className="icon-row">
          <button className="icon-btn" title={t('pages.add')} onClick={() => s.addPage()}>
            <Icon name="plus" />
          </button>
          <button className="icon-btn" title={t('pages.duplicate')} onClick={() => s.duplicatePage(currentPageId)}>
            <Icon name="copy" />
          </button>
          <button className="icon-btn" title={t('pages.moveUp')} disabled={index <= 0} onClick={() => s.movePage(index, index - 1)}>
            <Icon name="up" />
          </button>
          <button
            className="icon-btn"
            title={t('pages.moveDown')}
            disabled={index >= project.pages.length - 1}
            onClick={() => s.movePage(index, index + 1)}
          >
            <Icon name="down" />
          </button>
          <button
            className="icon-btn danger"
            title={t('pages.delete')}
            disabled={project.pages.length <= 1}
            onClick={() => s.deletePage(currentPageId)}
          >
            <Icon name="trash" />
          </button>
        </div>
      </div>
      <ol className="thumbs">
        {pages.map((p, i) => (
          <Thumb
            key={p.id}
            page={p}
            index={i}
            size={project.page}
            binding={project.binding}
            showHoles={showHoles}
            current={p.id === currentPageId}
            onDropAt={s.movePage}
          />
        ))}
      </ol>
    </aside>
  );
}
