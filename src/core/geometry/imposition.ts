// Раскладка страниц на печатные листы: импозиция, порядок сторон при дуплексе,
// метки реза и смещения калибровки. Без импозиции каждая страница — свой лист.
//
// Лист ориентируется сам: книжно, если сетка влезает, иначе альбомно.
// Сетка всегда по центру листа, поэтому при перевороте ячейки переходят друг в друга.

import type { ImpositionSheet, Mm, Project } from '../model';
import { isBackPage, pageRotationForPrint, requiredFlip, type Box, type DuplexFlip } from './binding';

export interface Size {
  width: Mm;
  height: Mm;
}

export const SHEET_SIZES: Record<'A4' | 'Letter', Size> = {
  A4: { width: 210, height: 297 },
  Letter: { width: 215.9, height: 279.4 },
};

const EPS = 0.01;

/** Размер листа в книжной ориентации. */
export function sheetSize(sheet: ImpositionSheet): Size {
  if (typeof sheet === 'string') return SHEET_SIZES[sheet];
  return { width: Math.min(sheet.w, sheet.h), height: Math.max(sheet.w, sheet.h) };
}

const gridSize = (page: Size, cols: number, rows: number, gap: Mm): Size => ({
  width: cols * page.width + (cols - 1) * gap,
  height: rows * page.height + (rows - 1) * gap,
});

const fitsIn = (inner: Size, outer: Size) => inner.width <= outer.width + EPS && inner.height <= outer.height + EPS;

const landscapeOf = (s: Size): Size => ({ width: s.height, height: s.width });

export interface SheetLayout {
  sheet: Size;
  landscape: boolean;
  cols: number;
  rows: number;
  /** Ячейки по строкам, слева направо и сверху вниз. */
  cells: Box[];
  /** Сетка помещается на лист. Если нет, она всё равно центрируется и обрезается краями. */
  fits: boolean;
}

/** Сетка страниц на листе. */
export function sheetLayout(p: Pick<Project, 'page' | 'print'>): SheetLayout | null {
  const im = p.print.imposition;
  if (!im) return null;
  const portrait = sheetSize(im.sheet);
  const grid = gridSize(p.page, im.cols, im.rows, im.gap);
  const landscape = !fitsIn(grid, portrait) && fitsIn(grid, landscapeOf(portrait));
  const sheet = landscape ? landscapeOf(portrait) : portrait;
  const x0 = (sheet.width - grid.width) / 2;
  const y0 = (sheet.height - grid.height) / 2;
  const cells: Box[] = [];
  for (let r = 0; r < im.rows; r++) {
    for (let c = 0; c < im.cols; c++) {
      cells.push({ x: x0 + c * (p.page.width + im.gap), y: y0 + r * (p.page.height + im.gap), w: p.page.width, h: p.page.height });
    }
  }
  return { sheet, landscape, cols: im.cols, rows: im.rows, cells, fits: fitsIn(grid, sheet) };
}

/** Наибольшая сетка, которая помещается на лист в любой ориентации, или null, если не влезает ни одна страница. */
export function maxGrid(sheet: ImpositionSheet, page: Size, gap: Mm): { cols: number; rows: number } | null {
  const fit = (s: Size) => ({
    cols: Math.floor((s.width + gap + EPS) / (page.width + gap)),
    rows: Math.floor((s.height + gap + EPS) / (page.height + gap)),
  });
  const portrait = sheetSize(sheet);
  const a = fit(portrait);
  const b = fit(landscapeOf(portrait));
  const best = b.cols * b.rows > a.cols * a.rows ? b : a;
  return best.cols * best.rows > 0 ? best : null;
}

/**
 * Какая координата отражается на обороте листа: 'x' — переворот вокруг вертикальной
 * кромки (как страница книги), 'y' — вокруг горизонтальной.
 */
export function flipAxis(sheet: Size, flip: DuplexFlip): 'x' | 'y' {
  const portrait = sheet.width <= sheet.height;
  return portrait === (flip === 'long-edge') ? 'x' : 'y';
}

export interface Slot {
  pageIndex: number;
  /** Левый верхний угол страницы на листе. */
  x: Mm;
  y: Mm;
  rotation: 0 | 180;
}

export interface Line {
  x1: Mm;
  y1: Mm;
  x2: Mm;
  y2: Mm;
}

export interface SheetSide {
  width: Mm;
  height: Mm;
  /** Номер физического листа с нуля. */
  sheet: number;
  back: boolean;
  slots: Slot[];
  cropMarks: Line[];
  /** Сдвиг всего содержимого стороны по калибровке принтера. */
  offset: { x: Mm; y: Mm };
}

/** Отступ метки реза от края сетки и её длина. */
export const CROP_MARK_GAP = 2;
export const CROP_MARK_LEN = 5;

/**
 * Метки реза снаружи сетки, на продолжениях линий реза. Внутрь сетки не заходят,
 * поэтому работают и при нулевом зазоре. Где до края листа меньше 1 мм, меток нет.
 */
export function cropMarks(layout: SheetLayout): Line[] {
  const { cells, sheet } = layout;
  if (!cells.length) return [];
  const xs = [...new Set(cells.flatMap((c) => [c.x, c.x + c.w]))];
  const ys = [...new Set(cells.flatMap((c) => [c.y, c.y + c.h]))];
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);
  const lines: Line[] = [];
  // Метка от края сетки наружу: from — начало (с отступом), to — конец, обрезанный краем листа.
  const span = (edge: Mm, dir: 1 | -1, limit: Mm): [Mm, Mm] | null => {
    const from = edge + dir * CROP_MARK_GAP;
    const to = dir > 0 ? Math.min(limit, from + CROP_MARK_LEN) : Math.max(limit, from - CROP_MARK_LEN);
    return Math.abs(to - from) >= 1 && (to - from) * dir > 0 ? [from, to] : null;
  };
  const above = span(top, -1, 0);
  const below = span(bottom, 1, sheet.height);
  const before = span(left, -1, 0);
  const after = span(right, 1, sheet.width);
  for (const x of xs) {
    if (above) lines.push({ x1: x, y1: above[0], x2: x, y2: above[1] });
    if (below) lines.push({ x1: x, y1: below[0], x2: x, y2: below[1] });
  }
  for (const y of ys) {
    if (before) lines.push({ x1: before[0], y1: y, x2: before[1], y2: y });
    if (after) lines.push({ x1: after[0], y1: y, x2: after[1], y2: y });
  }
  return lines;
}

export type SidesFilter = 'all' | 'front' | 'back';

export interface PrintJobOptions {
  sides: SidesFilter;
  /** Обратный порядок сторон: для ручного дуплекса, когда стопка ложится лицом вверх. */
  reverse: boolean;
}

export const DEFAULT_JOB: PrintJobOptions = { sides: 'all', reverse: false };

/** Печатает ли проект оборотные стороны (есть что выбирать в «только лицевые/оборотные»). */
export function hasBackSides(p: Pick<Project, 'binding' | 'print' | 'pages'>): boolean {
  return p.print.imposition ? p.binding.mirror === 'duplex' : p.pages.length > 1;
}

/** Все стороны всех листов по порядку. У дуплекса за каждой лицевой стороной идёт оборот, возможно пустой. */
function allSides(p: Project): SheetSide[] {
  const { offsetFront, offsetBack } = p.print;
  const offset = (back: boolean) => ({ ...(back ? offsetBack : offsetFront) });
  const layout = sheetLayout(p);

  if (!layout) {
    const sides = p.pages.map((_, i): SheetSide => {
      const back = isBackPage(i);
      return {
        width: p.page.width,
        height: p.page.height,
        sheet: Math.floor(i / 2),
        back,
        slots: [{ pageIndex: i, x: 0, y: 0, rotation: pageRotationForPrint(i, p) }],
        cropMarks: [],
        offset: offset(back),
      };
    });
    if (!isBackPage(sides.length - 1)) {
      sides.push({ ...sides[0], sheet: Math.floor(sides.length / 2), back: true, slots: [], offset: offset(true) });
    }
    return sides;
  }

  const { sheet, cells, cols, rows } = layout;
  const marks = p.print.cropMarks ? cropMarks(layout) : [];
  const perSide = cells.length;
  const side = (n: number, back: boolean, slots: Slot[]): SheetSide => ({
    width: sheet.width,
    height: sheet.height,
    sheet: n,
    back,
    slots,
    // Метки только на лицевой: на обороте они разошлись бы с лицевыми при неточной приводке.
    cropMarks: back ? [] : marks,
    offset: offset(back),
  });

  if (p.binding.mirror !== 'duplex') {
    const count = Math.ceil(p.pages.length / perSide);
    return Array.from({ length: count }, (_, n) =>
      side(
        n,
        false,
        cells.flatMap((c, j) => {
          const pageIndex = n * perSide + j;
          return pageIndex < p.pages.length ? [{ pageIndex, x: c.x, y: c.y, rotation: 0 as const }] : [];
        }),
      ),
    );
  }

  // Дуплекс: в ячейке лицевой стороны — лицо листка (нечётная страница), на обороте
  // в зеркальной ячейке — его оборот. Если принтер переворачивает лист не по той
  // кромке, по которой листают листок, оборот повёрнут на 180°.
  const axis = flipAxis(sheet, p.print.duplexFlip);
  const rotation: 0 | 180 = p.print.duplexFlip === requiredFlip(p.binding.side, sheet) ? 0 : 180;
  const leaves = Math.ceil(p.pages.length / 2);
  const count = Math.ceil(leaves / perSide);
  const sides: SheetSide[] = [];
  for (let n = 0; n < count; n++) {
    const front: Slot[] = [];
    const back: Slot[] = [];
    cells.forEach((c, j) => {
      const leaf = n * perSide + j;
      if (leaf >= leaves) return;
      front.push({ pageIndex: leaf * 2, x: c.x, y: c.y, rotation: 0 });
      if (leaf * 2 + 1 >= p.pages.length) return;
      const col = j % cols;
      const row = Math.floor(j / cols);
      const mirrored = axis === 'x' ? cells[row * cols + (cols - 1 - col)] : cells[(rows - 1 - row) * cols + col];
      back.push({ pageIndex: leaf * 2 + 1, x: mirrored.x, y: mirrored.y, rotation });
    });
    sides.push(side(n, false, front), side(n, true, back));
  }
  return sides;
}

/**
 * Стороны листов для печати с учётом выбора сторон и порядка.
 * «Только оборотные» сохраняет пустые обороты, чтобы при ручном дуплексе не сбиться
 * со стопкой; при печати всех сторон пустой оборот в конце отбрасывается.
 */
export function printSides(p: Project, job: PrintJobOptions = DEFAULT_JOB): SheetSide[] {
  let sides = allSides(p);
  // Выбор сторон мог остаться от проекта с оборотами: без них печатаем всё.
  const filter = hasBackSides(p) ? job.sides : 'all';
  if (filter === 'front') sides = sides.filter((s) => !s.back);
  else if (filter === 'back') sides = sides.filter((s) => s.back);
  else if (sides.length && sides[sides.length - 1].back && !sides[sides.length - 1].slots.length) sides = sides.slice(0, -1);
  return job.reverse ? sides.reverse() : sides;
}

/** Положение линии калибровки от левого и верхнего края листа. */
export const CALIBRATION_LINE: Mm = 10;

/** Смещение из измеренного расстояния от края листа до линии калибровки. */
export function offsetFromMeasured(measured: { x: Mm; y: Mm }): { x: Mm; y: Mm } {
  const round = (v: number) => Math.round(v * 10) / 10;
  return { x: round(CALIBRATION_LINE - measured.x), y: round(CALIBRATION_LINE - measured.y) };
}

/** Размер печатного листа: лист импозиции или сама страница. */
export function printSheetSize(p: Pick<Project, 'page' | 'print'>): Size {
  return sheetLayout(p)?.sheet ?? p.page;
}
