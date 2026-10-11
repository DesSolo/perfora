import { describe, expect, it } from 'vitest';
import { boundingBox, center, fitInto, normalizeAngle, resizeRect, rotate, rotateRect, type Rect } from './transform';

const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);

function corner(r: Rect, lx: number, ly: number) {
  const c = center(r);
  const p = rotate({ x: (lx * r.w) / 2, y: (ly * r.h) / 2 }, r.rotation);
  return { x: c.x + p.x, y: c.y + p.y };
}

describe('resizeRect', () => {
  const r: Rect = { x: 10, y: 20, w: 40, h: 20, rotation: 0 };

  it('правая нижняя ручка растягивает без сдвига левого верхнего угла', () => {
    const n = resizeRect(r, { hx: 1, hy: 1 }, { x: 10, y: 5 }, false);
    expect(n).toEqual({ x: 10, y: 20, w: 50, h: 25, rotation: 0 });
  });

  it('левая верхняя ручка двигает начало', () => {
    const n = resizeRect(r, { hx: -1, hy: -1 }, { x: 10, y: 5 }, false);
    expect(n).toEqual({ x: 20, y: 25, w: 30, h: 15, rotation: 0 });
  });

  it('боковая ручка меняет только одну сторону', () => {
    const n = resizeRect(r, { hx: 0, hy: 1 }, { x: 99, y: 10 }, false);
    expect(n).toEqual({ x: 10, y: 20, w: 40, h: 30, rotation: 0 });
  });

  it('не даёт сделать размер меньше минимума', () => {
    const n = resizeRect(r, { hx: 1, hy: 1 }, { x: -100, y: -100 }, false);
    expect(n.w).toBe(1);
    expect(n.h).toBe(1);
  });

  it('сохраняет пропорции на угловой ручке', () => {
    const n = resizeRect(r, { hx: 1, hy: 1 }, { x: 40, y: 0 }, true);
    close(n.w / n.h, 2);
    close(n.x, 10);
    close(n.y, 20);
  });

  it('сохраняет пропорции на боковой ручке, центрируя вторую ось', () => {
    const n = resizeRect(r, { hx: 1, hy: 0 }, { x: 40, y: 0 }, true);
    close(n.w, 80);
    close(n.h, 40);
    close(center(n).y, center(r).y);
  });

  it.each([30, 90, 137, 270])('у повёрнутого на %i° блока противоположный угол неподвижен', (deg) => {
    const rr = { ...r, rotation: deg };
    const before = corner(rr, -1, -1);
    const n = resizeRect(rr, { hx: 1, hy: 1 }, { x: 7, y: -3 }, false);
    const after = corner(n, -1, -1);
    close(after.x, before.x);
    close(after.y, before.y);
    expect(n.rotation).toBe(deg);
  });

  it('смещение вдоль локальной оси повёрнутого блока растягивает его', () => {
    const rr = { ...r, rotation: 90 };
    // При 90° локальная ось X смотрит вниз.
    const n = resizeRect(rr, { hx: 1, hy: 0 }, { x: 0, y: 10 }, false);
    close(n.w, 50);
    close(n.h, 20);
  });
});

describe('rotateRect', () => {
  const r: Rect = { x: 0, y: 0, w: 20, h: 20, rotation: 0 };

  it('поворот указателя на четверть круга даёт 90°', () => {
    close(rotateRect(r, { x: 10, y: -10 }, { x: 30, y: 10 }), 90);
  });

  it('округляет до шага', () => {
    expect(rotateRect(r, { x: 10, y: -10 }, { x: 30, y: 8 }, 15)).toBe(90);
  });

  it('нормализует угол', () => {
    expect(normalizeAngle(-90)).toBe(270);
    expect(normalizeAngle(720)).toBe(0);
    expect(Object.is(normalizeAngle(-360), 0)).toBe(true);
  });
});

describe('boundingBox / fitInto', () => {
  it('габарит блока, повёрнутого на 90°, меняет стороны местами', () => {
    const b = boundingBox({ x: 0, y: 0, w: 40, h: 20, rotation: 90 });
    close(b.w, 20);
    close(b.h, 40);
    close(b.x, 10);
    close(b.y, -10);
  });

  it('вписывает широкое изображение по ширине', () => {
    expect(fitInto(2, { x: 0, y: 0, w: 100, h: 100 })).toEqual({ x: 0, y: 25, w: 100, h: 50 });
  });

  it('вписывает высокое изображение по высоте', () => {
    expect(fitInto(0.5, { x: 0, y: 0, w: 100, h: 100 })).toEqual({ x: 25, y: 0, w: 50, h: 100 });
  });
});
