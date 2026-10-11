import { describe, expect, it } from 'vitest';
import { formatGaps, parseGaps } from './gapsText';

describe('промежутки текстом', () => {
  it.each([
    ['19-19-70-19-19', [19, 19, 70, 19, 19]],
    ['45 65 45', [45, 65, 45]],
    ['45; 65; 45', [45, 65, 45]],
    ['45,65,45', [45, 65, 45]],
    ['19,5 – 70', [19.5, 70]],
    ['19-19-', [19, 19]],
  ])('«%s»', (text, gaps) => {
    expect(parseGaps(text)).toEqual(gaps);
  });

  it.each(['', '19-x', '19-0', '  '])('ошибка: «%s»', (text) => {
    expect(parseGaps(text)).toBeNull();
  });

  it('формат обратим', () => {
    expect(parseGaps(formatGaps([19, 19.5, 70]))).toEqual([19, 19.5, 70]);
  });
});
