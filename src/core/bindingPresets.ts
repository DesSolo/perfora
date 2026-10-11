// Пресеты привязки — данные (src/data/presets.json и пользовательские), а не код.

import presetsJson from '../data/presets.json';
import type { Binding, Mm, Project } from './model';
import { produce } from 'immer';
import { holeGaps } from './geometry/binding';

export interface BindingPreset {
  id: string;
  name: { ru: string; en: string } | string;
  /** Размеры не сверены с реальным блокнотом. */
  verify?: boolean;
  page?: { width: Mm; height: Mm };
  binding: Pick<Binding, 'side' | 'holes' | 'keepOutPadding'>;
  user?: boolean;
}

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Проверка формы пресета: битые записи из файла или localStorage просто пропускаем. */
export function isValidPreset(v: unknown): v is BindingPreset {
  const p = v as BindingPreset;
  const h = p?.binding?.holes;
  return (
    typeof p?.id === 'string' &&
    (typeof p.name === 'string' || (typeof p.name?.ru === 'string' && typeof p.name?.en === 'string')) &&
    ['left', 'right', 'top'].includes(p.binding?.side) &&
    isNum(p.binding.keepOutPadding) &&
    !!h &&
    isNum(h.count) &&
    isNum(h.diameter) &&
    isNum(h.pitch) &&
    isNum(h.offsetFromEdge) &&
    typeof h.centered === 'boolean' &&
    (h.gaps === undefined || (Array.isArray(h.gaps) && h.gaps.length === h.count - 1 && h.gaps.every((g) => isNum(g) && g > 0))) &&
    (p.page === undefined || (isNum(p.page.width) && isNum(p.page.height)))
  );
}

export const BUILTIN_PRESETS: BindingPreset[] = (presetsJson.binding as unknown[]).filter(isValidPreset);

export function presetName(p: BindingPreset, lang: 'ru' | 'en'): string {
  return typeof p.name === 'string' ? p.name : p.name[lang];
}

export function applyPreset(project: Project, preset: BindingPreset): Project {
  return produce(project, (d) => {
    d.binding.enabled = true;
    d.binding.side = preset.binding.side;
    d.binding.holes = structuredClone(preset.binding.holes);
    d.binding.keepOutPadding = preset.binding.keepOutPadding;
    if (preset.page) {
      // Сохраняем текущую ориентацию страницы.
      const landscape = d.page.width > d.page.height;
      const { width, height } = preset.page;
      const [a, b] = width <= height ? [width, height] : [height, width];
      d.page = landscape ? { width: b, height: a } : { width: a, height: b };
    }
  });
}

/** Пресет, совпадающий с текущими настройками переплёта, или null («Произвольный»). */
export function matchPreset(binding: Binding, presets: BindingPreset[]): BindingPreset | null {
  const key = (b: Pick<Binding, 'side' | 'holes' | 'keepOutPadding'>) =>
    JSON.stringify([b.side, b.keepOutPadding, b.holes.count, b.holes.diameter, holeGaps(b.holes), b.holes.offsetFromEdge, b.holes.centered, b.holes.centered ? null : (b.holes.firstHoleOffset ?? 0)]);
  const k = key(binding);
  return presets.find((p) => key(p.binding) === k) ?? null;
}

export function presetFromBinding(id: string, name: string, binding: Binding): BindingPreset {
  return {
    id,
    name,
    user: true,
    binding: { side: binding.side, holes: structuredClone(binding.holes), keepOutPadding: binding.keepOutPadding },
  };
}
