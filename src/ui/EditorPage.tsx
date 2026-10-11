import { memo, useLayoutEffect, useMemo, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { contentBox, hitsKeepOut, holeCenters } from '../core/geometry/binding';
import { snapMove, snapResize, snapTargets, type SnapTargets } from '../core/geometry/snap';
import { boundingBox, resizeRect, rotateRect, type Handle, type Rect, type Vec } from '../core/geometry/transform';
import type { Block, Page, Project, TextBlock } from '../core/model';
import * as ops from '../core/ops';
import { PX_PER_MM } from '../core/units';
import { sanitizeHtml } from '../text/sanitize';
import { useEditor, useT } from '../store/editor';
import { PageOverlay } from './PageOverlay';
import { BlockContent, blockStyle, textCss, type PageSize } from './PageSurface';

const ROTATE_SNAP = 15;
/** Порог привязки в экранных пикселях. */
const SNAP_PX = 6;

type GestureKind = { kind: 'move' } | { kind: 'resize'; handle: Handle } | { kind: 'rotate' };

const HANDLES: Handle[] = [
  { hx: -1, hy: -1 },
  { hx: 0, hy: -1 },
  { hx: 1, hy: -1 },
  { hx: 1, hy: 0 },
  { hx: 1, hy: 1 },
  { hx: 0, hy: 1 },
  { hx: -1, hy: 1 },
  { hx: -1, hy: 0 },
];

interface PageCtx {
  pageId: string;
  index: number;
  pageRef: React.RefObject<HTMLDivElement | null>;
}

function targetsFor(project: Project, index: number, exceptId: string): SnapTargets {
  const page = project.pages[index];
  const others = page.blocks.filter((b) => b.id !== exceptId).map(boundingBox);
  return snapTargets(project.page, contentBox(index, project), others);
}

/**
 * Перетаскивание, изменение размера и поворот блока. Промежуточные кадры идут
 * в превью без записи в историю, по отпусканию весь жест становится одним шагом undo.
 * Привязка работает при перемещении и при ресайзе неповёрнутого блока; Alt её отключает.
 */
function startGesture(e: ReactPointerEvent, block: Block, g: GestureKind, ctx: PageCtx) {
  e.preventDefault();
  e.stopPropagation();
  const s = useEditor.getState();
  const { pageId } = ctx;
  const scale = PX_PER_MM * s.zoom;
  const threshold = SNAP_PX / scale;
  const targets = targetsFor(s.history.present, ctx.index, block.id);
  const start = { x: e.clientX, y: e.clientY };
  const rect: Rect = { x: block.x, y: block.y, w: block.w, h: block.h, rotation: block.rotation };
  const pageRect = ctx.pageRef.current!.getBoundingClientRect();
  const toPageMm = (cx: number, cy: number): Vec => ({ x: (cx - pageRect.left) / scale, y: (cy - pageRect.top) / scale });
  const startMm = toPageMm(start.x, start.y);
  const pointerId = e.pointerId;
  (e.currentTarget as Element).setPointerCapture?.(pointerId);
  s.beginGesture();

  const onMove = (ev: PointerEvent) => {
    if (ev.pointerId !== pointerId) return;
    const st = useEditor.getState();
    const snap = st.view.snap && !ev.altKey;
    const d = { x: (ev.clientX - start.x) / scale, y: (ev.clientY - start.y) / scale };
    let patch: Partial<Block>;
    let guides = null;
    if (g.kind === 'move') {
      let next = { ...rect, x: rect.x + d.x, y: rect.y + d.y };
      if (snap) {
        const r = snapMove(boundingBox(next), targets, threshold);
        next = { ...next, x: next.x + r.dx, y: next.y + r.dy };
        guides = r.guides;
      }
      patch = { x: next.x, y: next.y };
    } else if (g.kind === 'resize') {
      // Картинки по умолчанию сохраняют пропорции, Shift инвертирует поведение.
      const keepAspect = (block.type === 'image') !== ev.shiftKey;
      let box = resizeRect(rect, g.handle, d, keepAspect);
      if (snap && rect.rotation % 360 === 0) {
        const r = snapResize(box, g.handle, targets, threshold, keepAspect ? rect.w / rect.h : null);
        box = { ...box, ...r.box };
        guides = r.guides;
      }
      patch = { x: box.x, y: box.y, w: box.w, h: box.h };
    } else {
      patch = { rotation: rotateRect(rect, startMm, toPageMm(ev.clientX, ev.clientY), ev.shiftKey ? ROTATE_SNAP : 0) };
    }
    st.previewGesture((p) => ops.updateBlock(p, pageId, block.id, patch));
    st.setGuides(guides && (guides.x.length || guides.y.length) ? guides : null);
  };
  const onUp = (ev: PointerEvent) => {
    if (ev.pointerId !== pointerId) return;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    useEditor.getState().endGesture();
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
}

/** Записать содержимое редактора в блок. Страница фиксирована: к моменту вызова текущая могла смениться. */
function saveText(pageId: string, blockId: string, el: HTMLElement) {
  const html = sanitizeHtml(el.innerHTML);
  const s = useEditor.getState();
  const current = s.history.present.pages.find((p) => p.id === pageId)?.blocks.find((b) => b.id === blockId);
  if (current?.type === 'text' && current.html !== html) s.apply((p) => ops.updateBlock(p, pageId, blockId, { html }));
}

function TextEditor({ block, pageId }: { block: TextBlock; pageId: string }) {
  const ref = useRef<HTMLDivElement>(null);

  // Содержимое задаём один раз: дальше DOM принадлежит contentEditable, React его не трогает.
  // Сохраняем и по blur, и при размонтировании: клик мимо блока снимает режим редактирования
  // раньше, чем браузер присылает blur.
  useLayoutEffect(() => {
    const el = ref.current!;
    el.innerHTML = sanitizeHtml(block.html);
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    return () => saveText(pageId, block.id, el);
  }, []);

  const commit = () => {
    saveText(pageId, block.id, ref.current!);
    const s = useEditor.getState();
    if (s.editingBlockId === block.id) s.setEditing(null);
  };

  return (
    <div
      ref={ref}
      className="text-content editing"
      contentEditable
      suppressContentEditableWarning
      style={textCss(block.style)}
      onBlur={commit}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          ref.current?.blur();
        }
      }}
      onPaste={(e) => {
        // Вставляем только текст: чужая разметка не проходит в блок.
        e.preventDefault();
        document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
      }}
    />
  );
}

const BlockShell = memo(function BlockShell({
  block,
  editing,
  warn,
  ctx,
}: {
  block: Block;
  editing: boolean;
  warn: boolean;
  ctx: PageCtx;
}) {
  return (
    <div
      className={`block-shell${block.locked ? ' locked' : ''}${warn ? ' keepout-warn' : ''}`}
      data-block-id={block.id}
      style={blockStyle(block)}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        const s = useEditor.getState();
        s.selectPage(ctx.pageId);
        s.selectBlock(block.id);
        if (block.locked || editing) {
          e.stopPropagation();
          return;
        }
        startGesture(e, block, { kind: 'move' }, ctx);
      }}
      onDoubleClick={() => {
        if (block.type === 'text' && !block.locked) useEditor.getState().setEditing(block.id);
      }}
    >
      {editing && block.type === 'text' ? <TextEditor block={block} pageId={ctx.pageId} /> : <BlockContent block={block} />}
    </div>
  );
});

function SelectionFrame({ block, ctx }: { block: Block; ctx: PageCtx }) {
  const t = useT();
  const style = { ...blockStyle(block), zIndex: 10000 };
  if (block.locked) {
    return (
      <div className="selection-frame locked" style={style}>
        <span className="lock-badge" title={t('block.unlock')}>🔒</span>
      </div>
    );
  }
  return (
    <div className="selection-frame" style={style}>
      {HANDLES.map((h) => (
        <div
          key={`${h.hx}${h.hy}`}
          className="handle"
          data-handle={`${h.hx},${h.hy}`}
          style={{ left: `${((h.hx + 1) / 2) * 100}%`, top: `${((h.hy + 1) / 2) * 100}%` }}
          onPointerDown={(e) => startGesture(e, block, { kind: 'resize', handle: h }, ctx)}
        />
      ))}
      <div className="rotate-handle" data-handle="rotate" onPointerDown={(e) => startGesture(e, block, { kind: 'rotate' }, ctx)} />
    </div>
  );
}

export function EditorPage({ page, index, project }: { page: Page; index: number; project: Project }) {
  const pageRef = useRef<HTMLDivElement>(null);
  const active = useEditor((s) => s.currentPageId === page.id);
  const selectedId = useEditor((s) => (active ? s.selectedBlockId : null));
  const editingId = useEditor((s) => (active ? s.editingBlockId : null));
  const view = useEditor((s) => s.view);
  const guides = useEditor((s) => (active ? s.guides : null));
  const zoom = useEditor((s) => s.zoom);
  const selected = page.blocks.find((b) => b.id === selectedId);
  const size: PageSize = project.page;
  const { binding, margins, print } = project;

  const ctx = useMemo<PageCtx>(() => ({ pageId: page.id, index, pageRef }), [page.id, index]);
  const holes = useMemo(() => holeCenters(index, { page: size, binding }), [index, size, binding]);
  const content = useMemo(() => contentBox(index, { page: size, margins, binding }), [index, size, margins, binding]);
  const showHoles = view.holes && print.holeMarks !== 'off';

  return (
    <div
      ref={pageRef}
      className={`page-surface editor${active ? ' active' : ''}`}
      data-testid="editor-page"
      data-page-index={index}
      style={{ width: `${size.width}mm`, height: `${size.height}mm` }}
      onPointerDown={(e) => {
        if (e.target !== e.currentTarget) return;
        const s = useEditor.getState();
        s.selectPage(page.id);
        s.selectBlock(null);
      }}
    >
      {page.blocks.map((b) => (
        <BlockShell
          key={b.id}
          block={b}
          editing={b.id === editingId}
          warn={holes.length > 0 && hitsKeepOut(b, holes, binding.keepOutPadding)}
          ctx={ctx}
        />
      ))}
      <PageOverlay
        size={size}
        hairline={1 / (PX_PER_MM * zoom)}
        content={view.margins ? content : null}
        holes={holes}
        showHoles={showHoles}
        keepOutPadding={view.keepOut && holes.length ? binding.keepOutPadding : null}
        grid={view.grid}
        guides={guides}
      />
      {selected && selected.id !== editingId && <SelectionFrame block={selected} ctx={ctx} />}
    </div>
  );
}
