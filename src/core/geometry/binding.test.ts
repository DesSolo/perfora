import { describe, expect, it } from 'vitest';
import { createProject } from '../defaults';
import type { Binding, Project } from '../model';
import {
  backPageRotation,
  bindingEdge,
  circleHitsRect,
  contentBox,
  hitsKeepOut,
  holeCenters,
  holeGaps,
  pageMargins,
  requiredFlip,
} from './binding';

function project(binding: Partial<Binding> = {}, holes: Partial<Binding['holes']> = {}): Project {
  const p = createProject();
  return {
    ...p,
    page: { width: 148, height: 210 },
    margins: { inner: 15, outer: 8, top: 10, bottom: 12 },
    binding: { ...p.binding, enabled: true, ...binding, holes: { ...p.binding.holes, gaps: undefined, ...holes } },
  };
}

describe('сторона переплёта и поля', () => {
  it('без зеркалирования все страницы одинаковые', () => {
    const p = project({ side: 'left', mirror: 'none' });
    expect([0, 1, 2].map((i) => bindingEdge(i, p.binding))).toEqual(['left', 'left', 'left']);
  });

  it('duplex зеркалит чётные страницы', () => {
    expect([0, 1, 2, 3].map((i) => bindingEdge(i, { side: 'left', mirror: 'duplex' }))).toEqual(['left', 'right', 'left', 'right']);
    expect(bindingEdge(1, { side: 'right', mirror: 'duplex' })).toBe('left');
    expect(bindingEdge(1, { side: 'top', mirror: 'duplex' })).toBe('bottom');
  });

  it('внутреннее поле всегда со стороны переплёта', () => {
    const p = project({ side: 'left', mirror: 'duplex' });
    expect(pageMargins(0, p)).toEqual({ left: 15, right: 8, top: 10, bottom: 12 });
    expect(pageMargins(1, p)).toEqual({ left: 8, right: 15, top: 10, bottom: 12 });
  });

  it('верхний переплёт: inner у кромки переплёта, bottom у противоположной, outer по бокам', () => {
    const p = project({ side: 'top', mirror: 'duplex' });
    expect(pageMargins(0, p)).toEqual({ left: 8, right: 8, top: 15, bottom: 12 });
    expect(pageMargins(1, p)).toEqual({ left: 8, right: 8, top: 12, bottom: 15 });
  });

  it('область содержимого', () => {
    expect(contentBox(1, project({ side: 'left', mirror: 'duplex' }))).toEqual({ x: 8, y: 10, w: 125, h: 188 });
  });
});

describe('отверстия', () => {
  it('центрирование по высоте, отступ от кромки', () => {
    const holes = holeCenters(0, project({ side: 'left' }, { count: 3, pitch: 50, diameter: 6, offsetFromEdge: 7, centered: true }));
    expect(holes).toEqual([
      { x: 7, y: 55, r: 3 },
      { x: 7, y: 105, r: 3 },
      { x: 7, y: 155, r: 3 },
    ]);
  });

  it('отсчёт от первого отверстия', () => {
    const holes = holeCenters(0, project({}, { count: 2, pitch: 19, offsetFromEdge: 7, centered: false, firstHoleOffset: 30 }));
    expect(holes.map((h) => h.y)).toEqual([30, 49]);
  });

  it('на обороте отверстия зеркальны и совпадают на просвет', () => {
    const p = project({ side: 'left', mirror: 'duplex' }, { count: 6, pitch: 19, offsetFromEdge: 7, centered: false, firstHoleOffset: 40 });
    const front = holeCenters(0, p);
    const back = holeCenters(1, p);
    // Переворот вокруг вертикальной кромки: x -> W - x, y сохраняется.
    expect(back).toEqual(front.map((h) => ({ ...h, x: p.page.width - h.x })));
    expect(back[0].x).toBe(141);
  });

  it('верхний переплёт: отверстия вдоль ширины, на обороте у нижней кромки', () => {
    const p = project({ side: 'top', mirror: 'duplex' }, { count: 2, pitch: 80, offsetFromEdge: 6, centered: true });
    expect(holeCenters(0, p).map(({ x, y }) => [x, y])).toEqual([[34, 6], [114, 6]]);
    expect(holeCenters(1, p).map(({ x, y }) => [x, y])).toEqual([[34, 204], [114, 204]]);
  });

  it('неравные промежутки: 19-19-70-19-19 по центру A5', () => {
    const p = project({ side: 'left' }, { count: 6, gaps: [19, 19, 70, 19, 19], offsetFromEdge: 7, centered: true });
    // Размах 146 мм, начало (210 − 146) / 2 = 32.
    expect(holeCenters(0, p).map((h) => h.y)).toEqual([32, 51, 70, 140, 159, 178]);
  });

  it('неравные промежутки на обороте совпадают на просвет', () => {
    const p = project({ side: 'left', mirror: 'duplex' }, { count: 4, gaps: [45, 65, 45], centered: false, firstHoleOffset: 20 });
    const front = holeCenters(0, p);
    expect(holeCenters(1, p)).toEqual(front.map((h) => ({ ...h, x: p.page.width - h.x })));
    expect(front.map((h) => h.y)).toEqual([20, 65, 130, 175]);
  });

  it('промежутки не по числу отверстий — равный шаг', () => {
    expect(holeGaps({ count: 3, pitch: 10, gaps: [1, 2, 3], diameter: 5, offsetFromEdge: 7, centered: true })).toEqual([10, 10]);
    expect(holeGaps({ count: 0, pitch: 10, diameter: 5, offsetFromEdge: 7, centered: true })).toEqual([]);
  });

  it('выключенный переплёт — без отверстий', () => {
    expect(holeCenters(0, project({ enabled: false }))).toEqual([]);
  });
});

describe('двусторонняя печать', () => {
  const portrait = { width: 148, height: 210 };
  const landscape = { width: 210, height: 148 };

  it('нужный переворот зависит от стороны переплёта и ориентации', () => {
    expect(requiredFlip('left', portrait)).toBe('long-edge');
    expect(requiredFlip('right', landscape)).toBe('short-edge');
    expect(requiredFlip('top', portrait)).toBe('short-edge');
    expect(requiredFlip('top', landscape)).toBe('long-edge');
  });

  it('оборот поворачивается на 180°, если принтер переворачивает не по той кромке', () => {
    const p = project({ side: 'left', mirror: 'duplex' });
    expect(backPageRotation({ ...p, print: { ...p.print, duplexFlip: 'long-edge' } })).toBe(0);
    expect(backPageRotation({ ...p, print: { ...p.print, duplexFlip: 'short-edge' } })).toBe(180);
    expect(backPageRotation({ ...project({ mirror: 'none' }), print: { ...p.print, duplexFlip: 'short-edge' } })).toBe(0);
  });
});

describe('зона запрета', () => {
  const rect = { x: 10, y: 10, w: 20, h: 10, rotation: 0 };

  it('круг рядом с прямоугольником', () => {
    expect(circleHitsRect(8, 15, 2.5, rect)).toBe(true);
    expect(circleHitsRect(7, 15, 2.5, rect)).toBe(false);
    expect(circleHitsRect(20, 15, 1, rect)).toBe(true); // внутри
  });

  it('учитывает поворот блока', () => {
    // Центр (20, 15). После поворота на 90° блок занимает x 15..25, y 5..25.
    const r90 = { ...rect, rotation: 90 };
    expect(circleHitsRect(20, 4, 1.5, r90)).toBe(true);
    expect(circleHitsRect(20, 4, 1.5, rect)).toBe(false);
    expect(circleHitsRect(12, 15, 1.5, r90)).toBe(false);
  });

  it('отступ расширяет зону', () => {
    const holes = [{ x: 5, y: 15, r: 2.5 }];
    expect(hitsKeepOut(rect, holes, 0)).toBe(false);
    expect(hitsKeepOut(rect, holes, 3)).toBe(true);
  });
});
