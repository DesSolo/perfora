import { describe, expect, it } from 'vitest';
import { createPage, createProject } from '../defaults';
import type { Binding, PrintSettings, Project } from '../model';
import {
  cropMarks,
  flipAxis,
  hasBackSides,
  maxGrid,
  offsetFromMeasured,
  printSheetSize,
  printSides,
  sheetLayout,
  type SheetSide,
} from './imposition';

function project(pages: number, print: Partial<PrintSettings> = {}, binding: Partial<Binding> = {}): Project {
  const p = createProject();
  return {
    ...p,
    page: { width: 148, height: 210 },
    binding: { ...p.binding, side: 'left', mirror: 'duplex', ...binding },
    print: { ...p.print, ...print },
    pages: Array.from({ length: pages }, createPage),
  };
}

const A4x2 = { imposition: { sheet: 'A4' as const, cols: 2, rows: 1, gap: 0 } };

/** Номера страниц (с 1) по ячейкам стороны слева направо. */
const numbers = (s: SheetSide) => [...s.slots].sort((a, b) => a.y - b.y || a.x - b.x).map((x) => x.pageIndex + 1);

describe('сетка на листе', () => {
  it('A5 2×1 на A4 ложится альбомно, вплотную по центру', () => {
    const l = sheetLayout(project(1, A4x2))!;
    expect(l.landscape).toBe(true);
    expect(l.sheet).toEqual({ width: 297, height: 210 });
    expect(l.fits).toBe(true);
    expect(l.cells.map((c) => [c.x, c.y])).toEqual([
      [0.5, 0],
      [148.5, 0],
    ]);
  });

  it('если не влезает ни в одной ориентации, остаётся книжным и помечается', () => {
    const l = sheetLayout(project(1, { imposition: { sheet: 'A4', cols: 2, rows: 2, gap: 0 } }))!;
    expect(l.landscape).toBe(false);
    expect(l.fits).toBe(false);
  });

  it('произвольный лист нормализуется к книжному', () => {
    const l = sheetLayout({ page: { width: 100, height: 100 }, print: { ...createProject().print, imposition: { sheet: { w: 300, h: 200 }, cols: 1, rows: 1, gap: 0 } } })!;
    expect(l.sheet).toEqual({ width: 200, height: 300 });
  });

  it('без импозиции лист равен странице', () => {
    expect(sheetLayout(project(1))).toBeNull();
    expect(printSheetSize(project(1))).toEqual({ width: 148, height: 210 });
  });

  it('наибольшая сетка учитывает зазор и обе ориентации', () => {
    expect(maxGrid('A4', { width: 148, height: 210 }, 0)).toEqual({ cols: 2, rows: 1 });
    expect(maxGrid('A4', { width: 148, height: 210 }, 2)).toEqual({ cols: 1, rows: 1 });
    expect(maxGrid('A4', { width: 105, height: 148 }, 0)).toEqual({ cols: 2, rows: 2 });
    expect(maxGrid('A4', { width: 300, height: 400 }, 0)).toBeNull();
  });
});

describe('ось переворота листа', () => {
  it('книжный лист по длинной кромке отражает x, по короткой — y; альбомный наоборот', () => {
    const portrait = { width: 210, height: 297 };
    const landscape = { width: 297, height: 210 };
    expect(flipAxis(portrait, 'long-edge')).toBe('x');
    expect(flipAxis(portrait, 'short-edge')).toBe('y');
    expect(flipAxis(landscape, 'long-edge')).toBe('y');
    expect(flipAxis(landscape, 'short-edge')).toBe('x');
  });
});

describe('стороны листов', () => {
  it('без импозиции страница = сторона, оборот по чётности, последний пустой оборот отброшен', () => {
    const sides = printSides(project(3));
    expect(sides.map((s) => [s.sheet, s.back, numbers(s)])).toEqual([
      [0, false, [1]],
      [0, true, [2]],
      [1, false, [3]],
    ]);
  });

  it('«только оборотные» добавляет пустой оборот, чтобы не сбиться со стопкой', () => {
    const sides = printSides(project(3), { sides: 'back', reverse: true });
    expect(sides.map((s) => numbers(s))).toEqual([[], [2]]);
  });

  it('«только лицевые» в обратном порядке', () => {
    expect(printSides(project(5), { sides: 'front', reverse: true }).map(numbers)).toEqual([[5], [3], [1]]);
  });

  it('смещения калибровки по сторонам', () => {
    const sides = printSides(project(2, { offsetFront: { x: 1, y: -1 }, offsetBack: { x: -0.5, y: 2 } }));
    expect(sides.map((s) => s.offset)).toEqual([
      { x: 1, y: -1 },
      { x: -0.5, y: 2 },
    ]);
  });

  it('без зеркалирования импозиция идёт подряд, только лицевые стороны', () => {
    const sides = printSides(project(5, A4x2, { mirror: 'none' }));
    expect(sides.map((s) => [s.back, numbers(s)])).toEqual([
      [false, [1, 2]],
      [false, [3, 4]],
      [false, [5]],
    ]);
    expect(hasBackSides(project(5, A4x2, { mirror: 'none' }))).toBe(false);
    // Оставшийся выбор «только оборотные» не даёт пустую печать.
    expect(printSides(project(5, A4x2, { mirror: 'none' }), { sides: 'back', reverse: false })).toHaveLength(3);
  });

  it('дуплекс 2×1, левый переплёт, A4 альбомный по короткой кромке: оборот в зеркальной ячейке', () => {
    // Альбомный лист по короткой кромке переворачивается вокруг вертикали — как листок.
    const sides = printSides(project(6, { ...A4x2, duplexFlip: 'short-edge' }));
    expect(sides.map((s) => [s.sheet, s.back, numbers(s)])).toEqual([
      [0, false, [1, 3]],
      [0, true, [4, 2]],
      [1, false, [5]],
      [1, true, [6]],
    ]);
    expect(sides[1].slots.every((s) => s.rotation === 0)).toBe(true);
    // Оборот страницы 6 — за страницей 5, то есть в правой ячейке.
    expect(sides[3].slots[0].x).toBeCloseTo(148.5);
  });

  it('дуплекс по длинной кромке альбомного листа: ряды не меняются местами, обороты повёрнуты', () => {
    const sides = printSides(project(4, { ...A4x2, duplexFlip: 'long-edge' }));
    expect(numbers(sides[1])).toEqual([2, 4]);
    expect(sides[1].slots.every((s) => s.rotation === 180)).toBe(true);
  });

  it('дуплекс 1×2 по короткой кромке книжного листа отражает ряды', () => {
    const p = project(4, { imposition: { sheet: { w: 148, h: 420 }, cols: 1, rows: 2, gap: 0 }, duplexFlip: 'short-edge' }, { side: 'top' });
    const sides = printSides(p);
    expect(numbers(sides[0])).toEqual([1, 3]);
    expect(numbers(sides[1])).toEqual([4, 2]);
    expect(sides[1].slots.every((s) => s.rotation === 0)).toBe(true);
  });
});

describe('метки реза', () => {
  it('на продолжениях линий реза снаружи сетки, только на лицевой', () => {
    const p = project(2, { imposition: { sheet: 'A4', cols: 1, rows: 1, gap: 0 }, cropMarks: true });
    const marks = cropMarks(sheetLayout(p)!);
    // 2 вертикальные линии × (сверху, снизу) + 2 горизонтальные × (слева, справа).
    expect(marks).toHaveLength(8);
    const top = marks.find((m) => m.x1 === 31 && m.y1 < 43.5)!;
    expect(top).toEqual({ x1: 31, y1: 41.5, x2: 31, y2: 36.5 });
    const sides = printSides(p);
    expect(sides[0].cropMarks).toHaveLength(8);
    expect(sides[1].cropMarks).toHaveLength(0);
  });

  it('у края листа без места меток нет, длинные обрезаются краем', () => {
    // A5 2×1 на A4: по вертикали места нет, по горизонтали 0,5 мм — тоже нет.
    expect(cropMarks(sheetLayout(project(1, A4x2))!)).toEqual([]);
    const l = sheetLayout({ page: { width: 100, height: 100 }, print: { ...createProject().print, imposition: { sheet: { w: 100, h: 106 }, cols: 1, rows: 1, gap: 0 } } })!;
    // Сверху 3 мм: метка от 1 до 0.
    const marks = cropMarks(l);
    expect(marks.filter((m) => m.x1 === m.x2 && m.y1 < 3)).toEqual([
      { x1: 0, y1: 1, x2: 0, y2: 0 },
      { x1: 100, y1: 1, x2: 100, y2: 0 },
    ]);
  });
});

describe('калибровка', () => {
  it('смещение = номинал минус измеренное', () => {
    expect(offsetFromMeasured({ x: 11.5, y: 9 })).toEqual({ x: -1.5, y: 1 });
  });
});
