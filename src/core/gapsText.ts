// Промежутки между отверстиями в виде текста: «19-19-70-19-19».

import type { Mm } from './model';

const fmt = (v: number) => String(Number(v.toFixed(2)));

export function formatGaps(gaps: Mm[]): string {
  return gaps.map(fmt).join('-');
}

/**
 * Разбор ввода. Разделители: дефис, тире, пробел, точка с запятой. Если других
 * разделителей нет, разделитель — запятая, иначе запятая считается десятичной.
 * null, если хоть одно значение не положительное число.
 */
export function parseGaps(text: string): Mm[] | null {
  let parts = text.split(/[\s;–—-]+/).filter(Boolean);
  if (parts.length === 1) parts = parts[0].split(',').filter(Boolean);
  if (!parts.length) return null;
  const gaps = parts.map((p) => Number(p.replace(',', '.')));
  return gaps.every((g) => Number.isFinite(g) && g > 0) ? gaps : null;
}
