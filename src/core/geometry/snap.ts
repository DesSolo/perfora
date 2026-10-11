// Привязка к направляющим: края и центр страницы, поля, края и центры других блоков.

import type { Box } from './binding';
import type { Handle } from './transform';

export interface SnapTargets {
  x: number[];
  y: number[];
}

export interface Guides {
  x: number[];
  y: number[];
}

export interface SnapResult {
  dx: number;
  dy: number;
  guides: Guides;
}

const uniq = (a: number[]) => [...new Set(a.map((v) => Math.round(v * 1000) / 1000))];

export function snapTargets(page: { width: number; height: number }, content: Box, others: Box[]): SnapTargets {
  const x = [0, page.width / 2, page.width, content.x, content.x + content.w];
  const y = [0, page.height / 2, page.height, content.y, content.y + content.h];
  for (const b of others) {
    x.push(b.x, b.x + b.w / 2, b.x + b.w);
    y.push(b.y, b.y + b.h / 2, b.y + b.h);
  }
  return { x: uniq(x), y: uniq(y) };
}

/** Ближайшее смещение, совмещающее одну из точек с целью, в пределах порога. */
function bestShift(points: number[], targets: number[], threshold: number): number | null {
  let best: number | null = null;
  for (const p of points) {
    for (const t of targets) {
      const d = t - p;
      if (Math.abs(d) <= threshold && (best === null || Math.abs(d) < Math.abs(best))) best = d;
    }
  }
  return best;
}

/** Все цели, совпавшие с точками после сдвига: их показываем как направляющие. */
function hits(points: number[], targets: number[]): number[] {
  return targets.filter((t) => points.some((p) => Math.abs(p - t) < 1e-6));
}

const xs = (b: Box) => [b.x, b.x + b.w / 2, b.x + b.w];
const ys = (b: Box) => [b.y, b.y + b.h / 2, b.y + b.h];

/** Привязка при перемещении: двигаем габарит блока целиком. */
export function snapMove(box: Box, targets: SnapTargets, threshold: number): SnapResult {
  const dx = bestShift(xs(box), targets.x, threshold) ?? 0;
  const dy = bestShift(ys(box), targets.y, threshold) ?? 0;
  const moved = { ...box, x: box.x + dx, y: box.y + dy };
  return {
    dx,
    dy,
    guides: { x: hits(xs(moved), targets.x), y: hits(ys(moved), targets.y) },
  };
}

/**
 * Привязка при изменении размера неповёрнутого блока: двигаются только края под ручкой,
 * противоположные остаются на месте. `aspect` (w/h) — сохранять пропорции: тогда
 * привязывается одна ось (ближайшая), вторая сторона пересчитывается.
 */
export function snapResize(
  box: Box,
  handle: Handle,
  targets: SnapTargets,
  threshold: number,
  aspect: number | null,
): { box: Box; guides: Guides } {
  const edgeX = handle.hx === 1 ? box.x + box.w : handle.hx === -1 ? box.x : null;
  const edgeY = handle.hy === 1 ? box.y + box.h : handle.hy === -1 ? box.y : null;
  let sx = edgeX === null ? null : bestShift([edgeX], targets.x, threshold);
  let sy = edgeY === null ? null : bestShift([edgeY], targets.y, threshold);

  if (aspect !== null && sx !== null && sy !== null) {
    if (Math.abs(sx) <= Math.abs(sy)) sy = null;
    else sx = null;
  }

  let { x, y, w, h } = box;
  if (sx !== null) {
    const dw = handle.hx * sx;
    w += dw;
    if (handle.hx === -1) x -= dw;
    if (aspect !== null) {
      const dh = w / aspect - h;
      h += dh;
      if (handle.hy === -1) y -= dh;
      else if (handle.hy === 0) y -= dh / 2;
    }
  } else if (sy !== null) {
    const dh = handle.hy * sy;
    h += dh;
    if (handle.hy === -1) y -= dh;
    if (aspect !== null) {
      const dw = h * aspect - w;
      w += dw;
      if (handle.hx === -1) x -= dw;
      else if (handle.hx === 0) x -= dw / 2;
    }
  }
  const out = { x, y, w, h };
  return {
    box: out,
    guides: {
      x: sx !== null ? hits([handle.hx === 1 ? x + w : x], targets.x) : [],
      y: sy !== null ? hits([handle.hy === 1 ? y + h : y], targets.y) : [],
    },
  };
}
