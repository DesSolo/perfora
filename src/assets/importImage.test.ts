import { describe, expect, it } from 'vitest';
import { downscaleFactor } from './importImage';

describe('downscaleFactor', () => {
  // A5 без полей ~ 148x210 мм; при 300 dpi на ширину нужно ceil(148/25.4*300) = 1749 px.
  it('уменьшает большое фото до 300 dpi от размера вписывания', () => {
    const k = downscaleFactor({ w: 6000, h: 4000 }, { w: 148, h: 210 }, 300);
    expect(Math.round(6000 * k)).toBe(1749);
  });

  it('учитывает выбранный dpi', () => {
    const k = downscaleFactor({ w: 6000, h: 4000 }, { w: 148, h: 210 }, 150);
    expect(Math.round(6000 * k)).toBe(875);
  });

  it('высокое изображение вписывается по высоте', () => {
    const k = downscaleFactor({ w: 1000, h: 8000 }, { w: 148, h: 210 }, 300);
    // По высоте нужно 2481 px; округление вверх по ширине может добавить пару процентов.
    expect(Math.round(8000 * k)).toBeGreaterThanOrEqual(2481);
    expect(Math.round(8000 * k)).toBeLessThan(2481 * 1.01);
  });

  it('не увеличивает маленькие картинки', () => {
    expect(downscaleFactor({ w: 300, h: 200 }, { w: 148, h: 210 }, 300)).toBe(1);
  });
});
