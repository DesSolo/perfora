// Геометрия трансформаций блока. Блок — прямоугольник (x, y, w, h) в системе страницы,
// повёрнутый на rotation градусов по часовой стрелке вокруг своего центра.

export interface Vec {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
}

/** Направление ручки: -1/0/1 по каждой оси (0 — середина стороны). */
export interface Handle {
  hx: -1 | 0 | 1;
  hy: -1 | 0 | 1;
}

export const MIN_SIZE = 1;

const rad = (deg: number) => (deg * Math.PI) / 180;

export function rotate(v: Vec, deg: number): Vec {
  const a = rad(deg);
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
}

export function center(r: Rect): Vec {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

/** Нормализовать угол в диапазон [0, 360). */
export function normalizeAngle(deg: number): number {
  const a = deg % 360;
  return a < 0 ? a + 360 : a === 0 ? 0 : a;
}

/**
 * Изменение размера за ручку. `delta` — смещение указателя в системе страницы.
 * Противоположная ручке точка остаётся на месте с учётом поворота.
 * `keepAspect`: для угловой ручки масштаб берётся средним по осям,
 * для боковой вторая сторона масштабируется пропорционально вокруг оси.
 */
export function resizeRect(r: Rect, handle: Handle, delta: Vec, keepAspect: boolean): Rect {
  const { hx, hy } = handle;
  const local = rotate(delta, -r.rotation);
  let w = r.w + hx * local.x;
  let h = r.h + hy * local.y;

  if (keepAspect && r.w > 0 && r.h > 0) {
    let s: number;
    if (hx !== 0 && hy !== 0) s = (w / r.w + h / r.h) / 2;
    else if (hx !== 0) s = w / r.w;
    else s = h / r.h;
    s = Math.max(s, MIN_SIZE / Math.min(r.w, r.h));
    w = r.w * s;
    h = r.h * s;
  } else {
    w = Math.max(MIN_SIZE, w);
    h = Math.max(MIN_SIZE, h);
  }

  // Якорь — точка напротив ручки, в локальных координатах относительно центра.
  const anchorOld = { x: (-hx * r.w) / 2, y: (-hy * r.h) / 2 };
  const anchorNew = { x: (-hx * w) / 2, y: (-hy * h) / 2 };
  const shift = rotate({ x: anchorOld.x - anchorNew.x, y: anchorOld.y - anchorNew.y }, r.rotation);
  const c = center(r);
  const nc = { x: c.x + shift.x, y: c.y + shift.y };
  return { x: nc.x - w / 2, y: nc.y - h / 2, w, h, rotation: r.rotation };
}

/** Угол (градусы, по часовой от направления «вверх») от центра к точке. */
export function angleTo(c: Vec, p: Vec): number {
  return (Math.atan2(p.y - c.y, p.x - c.x) * 180) / Math.PI + 90;
}

/**
 * Новый угол при повороте за ручку: start/current — положения указателя.
 * `snapStep` > 0 округляет итоговый угол до кратного шага.
 */
export function rotateRect(r: Rect, start: Vec, current: Vec, snapStep = 0): number {
  const c = center(r);
  let a = r.rotation + angleTo(c, current) - angleTo(c, start);
  if (snapStep > 0) a = Math.round(a / snapStep) * snapStep;
  return normalizeAngle(a);
}

/** Габаритный прямоугольник повёрнутого блока (для проверок пересечений). */
export function boundingBox(r: Rect): { x: number; y: number; w: number; h: number } {
  const c = center(r);
  const corners = [
    { x: -r.w / 2, y: -r.h / 2 },
    { x: r.w / 2, y: -r.h / 2 },
    { x: r.w / 2, y: r.h / 2 },
    { x: -r.w / 2, y: r.h / 2 },
  ].map((p) => rotate(p, r.rotation));
  const xs = corners.map((p) => p.x + c.x);
  const ys = corners.map((p) => p.y + c.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return { x: minX, y: minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY };
}

/** Вписать прямоугольник aspect (w/h) в область, по центру. */
export function fitInto(aspect: number, area: { x: number; y: number; w: number; h: number }) {
  let w = area.w;
  let h = w / aspect;
  if (h > area.h) {
    h = area.h;
    w = h * aspect;
  }
  return { x: area.x + (area.w - w) / 2, y: area.y + (area.h - h) / 2, w, h };
}
