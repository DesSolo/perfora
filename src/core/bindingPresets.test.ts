import { describe, expect, it } from 'vitest';
import { applyPreset, BUILTIN_PRESETS, isValidPreset, matchPreset, presetFromBinding } from './bindingPresets';
import { createProject } from './defaults';
import presetsJson from '../data/presets.json';
import { holeCenters } from './geometry/binding';

describe('пресеты привязки', () => {
  it('все пресеты из presets.json проходят проверку, id уникальны', () => {
    expect(BUILTIN_PRESETS).toHaveLength(presetsJson.binding.length);
    expect(new Set(BUILTIN_PRESETS.map((p) => p.id)).size).toBe(BUILTIN_PRESETS.length);
  });

  it.each(BUILTIN_PRESETS.filter((p) => p.page).map((p) => [p.id, p] as const))('%s: отверстия помещаются на страницу', (_, preset) => {
    const p = applyPreset(createProject(), preset);
    const holes = holeCenters(0, p);
    expect(holes).toHaveLength(preset.binding.holes.count);
    for (const h of holes) {
      expect(h.y - h.r).toBeGreaterThan(0);
      expect(h.y + h.r).toBeLessThan(p.page.height);
      expect(h.x - h.r).toBeGreaterThan(0);
    }
  });

  it('проект по умолчанию совпадает с пресетом Filofax A5', () => {
    expect(matchPreset(createProject().binding, BUILTIN_PRESETS)?.id).toBe('a5-6-70');
  });

  it('применение включает переплёт и сохраняет ориентацию страницы', () => {
    const preset = BUILTIN_PRESETS.find((x) => x.id === 'a5-4-45-65')!;
    expect(preset.verify).toBe(true);
    const p0 = { ...createProject(), page: { width: 297, height: 210 } };
    const p = applyPreset(p0, preset);
    expect(p.binding.enabled).toBe(true);
    expect(p.binding.holes).toEqual(preset.binding.holes);
    expect(p.page).toEqual({ width: 210, height: 148 });
  });

  it('пресет без страницы не меняет её размер, равный шаг убирает промежутки', () => {
    const p = applyPreset(createProject(), BUILTIN_PRESETS.find((x) => x.id === 'iso-838-2')!);
    expect(p.page).toEqual({ width: 148, height: 210 });
    expect(p.binding.holes).not.toHaveProperty('gaps');
  });

  it('находит совпадающий пресет, в том числе по промежуткам', () => {
    const preset = BUILTIN_PRESETS.find((x) => x.id === 'a5-6-51')!;
    const p = applyPreset(createProject(), preset);
    expect(matchPreset(p.binding, BUILTIN_PRESETS)?.id).toBe('a5-6-51');
    const changed = { ...p.binding, holes: { ...p.binding.holes, gaps: [19, 19, 52, 19, 19] } };
    expect(matchPreset(changed, BUILTIN_PRESETS)).toBeNull();
  });

  it('пользовательский пресет из текущих настроек валиден', () => {
    const u = presetFromBinding('u1', 'Мой', createProject().binding);
    expect(isValidPreset(u)).toBe(true);
    expect(isValidPreset({ ...u, binding: { ...u.binding, side: 'bottom' } })).toBe(false);
    expect(isValidPreset(null)).toBe(false);
  });
});
