import { describe, expect, it } from 'vitest';
import { commitFrom, initHistory, push, redo, replace, undo } from './history';

describe('history', () => {
  it('undo/redo проходят по шагам', () => {
    let h = initHistory(0);
    h = push(h, 1);
    h = push(h, 2);
    h = undo(h);
    expect(h.present).toBe(1);
    h = undo(h);
    expect(h.present).toBe(0);
    expect(undo(h)).toBe(h);
    h = redo(redo(h));
    expect(h.present).toBe(2);
    expect(redo(h)).toBe(h);
  });

  it('новое действие сбрасывает redo', () => {
    let h = push(push(initHistory(0), 1), 2);
    h = push(undo(h), 5);
    expect(h.future).toEqual([]);
    expect(h.past).toEqual([0, 1]);
  });

  it('ограничивает глубину и хранит не менее 50 шагов', () => {
    let h = initHistory(0);
    for (let i = 1; i <= 200; i++) h = push(h, i, 60);
    expect(h.past.length).toBe(60);
    for (let i = 0; i < 50; i++) h = undo(h);
    expect(h.present).toBe(150);
  });

  it('жест из многих кадров даёт один шаг истории', () => {
    let h = push(initHistory(0), 1);
    const base = h.present;
    for (let i = 2; i < 10; i++) h = replace(h, i);
    h = commitFrom(h, base);
    expect(h.past).toEqual([0, 1]);
    expect(h.present).toBe(9);
    expect(undo(h).present).toBe(1);
  });

  it('пустой жест ничего не пишет', () => {
    const h = push(initHistory(0), 1);
    expect(commitFrom(h, h.present)).toBe(h);
  });
});
