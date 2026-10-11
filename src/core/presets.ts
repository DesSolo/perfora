import type { Mm } from './model';

export interface PageSizePreset {
  id: string;
  width: Mm;
  height: Mm;
}

/** Стандартные размеры в портретной ориентации. */
export const PAGE_SIZES: PageSizePreset[] = [
  { id: 'A4', width: 210, height: 297 },
  { id: 'A5', width: 148, height: 210 },
  { id: 'A6', width: 105, height: 148 },
  { id: 'B5', width: 176, height: 250 },
  { id: 'Letter', width: 215.9, height: 279.4 },
  { id: 'HalfLetter', width: 139.7, height: 215.9 },
];

const EPS = 0.05;

/** Пресет, совпадающий с размером в любой ориентации, или null для произвольного. */
export function matchPageSize(width: Mm, height: Mm): PageSizePreset | null {
  const [a, b] = width <= height ? [width, height] : [height, width];
  return PAGE_SIZES.find((p) => Math.abs(p.width - a) < EPS && Math.abs(p.height - b) < EPS) ?? null;
}
