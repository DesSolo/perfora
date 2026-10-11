import { describe, expect, it } from 'vitest';
import { snapMove, snapResize, snapTargets } from './snap';

const page = { width: 148, height: 210 };
const content = { x: 15, y: 8, w: 125, h: 194 };

describe('snapTargets', () => {
  it('края страницы, центр, поля и другие блоки', () => {
    const t = snapTargets(page, content, [{ x: 50, y: 60, w: 20, h: 10 }]);
    expect(t.x).toEqual([0, 74, 148, 15, 140, 50, 60, 70]);
    expect(t.y).toEqual([0, 105, 210, 8, 202, 60, 65, 70]);
  });
});

describe('snapMove', () => {
  const t = snapTargets(page, content, []);

  it('притягивает ближайшую точку в пределах порога', () => {
    const r = snapMove({ x: 16.5, y: 100, w: 30, h: 10 }, t, 2);
    expect(r.dx).toBeCloseTo(-1.5);
    expect(r.dy).toBe(0);
    expect(r.guides.x).toEqual([15]);
  });

  it('центр блока к центру страницы', () => {
    const r = snapMove({ x: 60, y: 50, w: 30, h: 10 }, t, 2);
    expect(r.dx).toBeCloseTo(-1);
    expect(r.guides.x).toEqual([74]);
  });

  it('вне порога ничего не делает', () => {
    const r = snapMove({ x: 30, y: 30, w: 10, h: 10 }, t, 2);
    expect(r).toEqual({ dx: 0, dy: 0, guides: { x: [], y: [] } });
  });
});

describe('snapResize', () => {
  const t = snapTargets(page, content, []);

  it('двигает только край под ручкой', () => {
    const r = snapResize({ x: 20, y: 20, w: 118.8, h: 30 }, { hx: 1, hy: 0 }, t, 2, null);
    expect(r.box.w).toBeCloseTo(120);
    expect({ ...r.box, w: 0 }).toEqual({ x: 20, y: 20, w: 0, h: 30 });
    expect(r.guides.x).toEqual([140]);
  });

  it('левая ручка сдвигает начало', () => {
    const r = snapResize({ x: 16, y: 20, w: 50, h: 30 }, { hx: -1, hy: 0 }, t, 2, null);
    expect(r.box).toEqual({ x: 15, y: 20, w: 51, h: 30 });
  });

  it('с пропорциями привязывает одну ось и пересчитывает вторую', () => {
    const r = snapResize({ x: 20, y: 20, w: 119, h: 59.5 }, { hx: 1, hy: 1 }, t, 2, 2);
    expect(r.box.w).toBeCloseTo(120);
    expect(r.box.h).toBeCloseTo(60);
    expect(r.box.x).toBe(20);
    expect(r.box.y).toBe(20);
  });
});
