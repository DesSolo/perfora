import { describe, expect, it } from 'vitest';
import { spreadOf } from './spread';

describe('spreadOf', () => {
  it('первая страница одна справа', () => {
    expect(spreadOf(0, 5)).toEqual({ left: null, right: 0 });
  });
  it('пары 2-3, 4-5', () => {
    expect(spreadOf(1, 5)).toEqual({ left: 1, right: 2 });
    expect(spreadOf(2, 5)).toEqual({ left: 1, right: 2 });
    expect(spreadOf(4, 5)).toEqual({ left: 3, right: 4 });
  });
  it('последняя чётная страница без пары', () => {
    expect(spreadOf(3, 4)).toEqual({ left: 3, right: null });
  });
});
