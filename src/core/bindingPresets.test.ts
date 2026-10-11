import { describe, expect, it } from 'vitest';
import { applyPreset, BUILTIN_PRESETS, isValidPreset, matchPreset, presetFromBinding } from './bindingPresets';
import { createProject } from './defaults';

describe('пресеты привязки', () => {
  it('встроенный тестовый пресет загружается из presets.json и помечен «проверить»', () => {
    const p = BUILTIN_PRESETS.find((x) => x.id === 'test-a5-6');
    expect(p?.verify).toBe(true);
  });

  it('применение включает переплёт и сохраняет ориентацию страницы', () => {
    const preset = BUILTIN_PRESETS[0];
    const p0 = { ...createProject(), page: { width: 297, height: 210 } };
    const p = applyPreset(p0, preset);
    expect(p.binding.enabled).toBe(true);
    expect(p.binding.holes).toEqual(preset.binding.holes);
    expect(p.page).toEqual({ width: 210, height: 148 });
  });

  it('находит совпадающий пресет', () => {
    const p = applyPreset(createProject(), BUILTIN_PRESETS[0]);
    expect(matchPreset(p.binding, BUILTIN_PRESETS)?.id).toBe('test-a5-6');
    const changed = { ...p.binding, holes: { ...p.binding.holes, pitch: 20 } };
    expect(matchPreset(changed, BUILTIN_PRESETS)).toBeNull();
  });

  it('пользовательский пресет из текущих настроек валиден', () => {
    const u = presetFromBinding('u1', 'Мой', createProject().binding);
    expect(isValidPreset(u)).toBe(true);
    expect(isValidPreset({ ...u, binding: { ...u.binding, side: 'bottom' } })).toBe(false);
    expect(isValidPreset(null)).toBe(false);
  });
});
