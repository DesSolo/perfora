// Геометрия переплёта: сторона отверстий с учётом чётности, поля, центры отверстий,
// зона запрета и поворот оборота при двусторонней печати.
//
// Координаты страницы — «как читатель видит страницу». Для чётной страницы при
// mirror: 'duplex' это оборот листа после переворота вокруг кромки переплёта.

import type { Binding, Mm, Project } from '../model';
import { center, rotate, type Rect } from './transform';

export type Edge = 'left' | 'right' | 'top' | 'bottom';
export type DuplexFlip = 'long-edge' | 'short-edge';

export interface Sides {
  left: Mm;
  right: Mm;
  top: Mm;
  bottom: Mm;
}

export interface Hole {
  x: Mm;
  y: Mm;
  r: Mm;
}

export interface Box {
  x: Mm;
  y: Mm;
  w: Mm;
  h: Mm;
}

type PageSize = Project['page'];

/** Индекс 0 — страница 1 (лицевая). Чётные номера страниц — оборотные. */
export const isBackPage = (index: number): boolean => index % 2 === 1;

const OPPOSITE: Record<Edge, Edge> = { left: 'right', right: 'left', top: 'bottom', bottom: 'top' };

/** Кромка переплёта на странице. Оборот при duplex переворачивается вокруг этой же кромки. */
export function bindingEdge(index: number, binding: Pick<Binding, 'side' | 'mirror'>): Edge {
  return binding.mirror === 'duplex' && isBackPage(index) ? OPPOSITE[binding.side] : binding.side;
}

/**
 * Поля в физических сторонах страницы. Внутреннее поле всегда у переплёта.
 * Боковой переплёт: inner/outer — левое и правое, top/bottom — как есть.
 * Верхний переплёт: inner у переплёта, bottom у противоположной кромки, outer слева и справа;
 * поле top не используется.
 */
export function pageMargins(index: number, p: Pick<Project, 'margins' | 'binding'>): Sides {
  const { inner, outer, top, bottom } = p.margins;
  const edge = bindingEdge(index, p.binding);
  switch (edge) {
    case 'left':
      return { left: inner, right: outer, top, bottom };
    case 'right':
      return { left: outer, right: inner, top, bottom };
    case 'top':
      return { left: outer, right: outer, top: inner, bottom };
    case 'bottom':
      return { left: outer, right: outer, top: bottom, bottom: inner };
  }
}

/** Область внутри полей. */
export function contentBox(index: number, p: Pick<Project, 'page' | 'margins' | 'binding'>): Box {
  const m = pageMargins(index, p);
  return {
    x: m.left,
    y: m.top,
    w: Math.max(0, p.page.width - m.left - m.right),
    h: Math.max(0, p.page.height - m.top - m.bottom),
  };
}

/**
 * Центры отверстий. Вдоль кромки: по центру или от начала кромки (верх для бокового
 * переплёта, левый край для верхнего). Переворот вокруг кромки переплёта этот отсчёт сохраняет.
 */
export function holeCenters(index: number, p: Pick<Project, 'page' | 'binding'>): Hole[] {
  const { binding, page } = p;
  const { count, pitch, diameter, offsetFromEdge, centered, firstHoleOffset } = binding.holes;
  if (!binding.enabled || count <= 0) return [];
  const edge = bindingEdge(index, binding);
  const vertical = edge === 'left' || edge === 'right';
  const length = vertical ? page.height : page.width;
  const start = centered ? (length - (count - 1) * pitch) / 2 : (firstHoleOffset ?? 0);
  const across =
    edge === 'left' || edge === 'top'
      ? offsetFromEdge
      : (vertical ? page.width : page.height) - offsetFromEdge;
  const r = diameter / 2;
  return Array.from({ length: count }, (_, i) => {
    const along = start + i * pitch;
    return vertical ? { x: across, y: along, r } : { x: along, y: across, r };
  });
}

/** Переворот листа, при котором оборот читается правильно для данного переплёта. */
export function requiredFlip(side: Binding['side'], page: PageSize): DuplexFlip {
  const portrait = page.width <= page.height;
  const sideBinding = side === 'left' || side === 'right';
  // Боковой переплёт листают вокруг вертикальной кромки: у книжной страницы она длинная.
  return sideBinding === portrait ? 'long-edge' : 'short-edge';
}

/**
 * Поворот оборотных страниц при печати. Если принтер переворачивает лист не по той
 * кромке, по которой листают блокнот, оборот окажется вверх ногами, и его надо
 * повернуть на 180°.
 */
export function backPageRotation(p: Pick<Project, 'page' | 'binding' | 'print'>): 0 | 180 {
  if (p.binding.mirror !== 'duplex') return 0;
  return p.print.duplexFlip === requiredFlip(p.binding.side, p.page) ? 0 : 180;
}

export function pageRotationForPrint(index: number, p: Pick<Project, 'page' | 'binding' | 'print'>): 0 | 180 {
  return isBackPage(index) ? backPageRotation(p) : 0;
}

/** Пересекает ли круг повёрнутый прямоугольник блока. */
export function circleHitsRect(cx: Mm, cy: Mm, r: Mm, rect: Rect): boolean {
  const c = center(rect);
  const local = rotate({ x: cx - c.x, y: cy - c.y }, -rect.rotation);
  const nx = Math.max(-rect.w / 2, Math.min(rect.w / 2, local.x));
  const ny = Math.max(-rect.h / 2, Math.min(rect.h / 2, local.y));
  const dx = local.x - nx;
  const dy = local.y - ny;
  return dx * dx + dy * dy < r * r;
}

/** Заходит ли блок в зону запрета вокруг отверстий (радиус отверстия + отступ). */
export function hitsKeepOut(rect: Rect, holes: Hole[], padding: Mm): boolean {
  return holes.some((h) => circleHitsRect(h.x, h.y, h.r + padding, rect));
}
