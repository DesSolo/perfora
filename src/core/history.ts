// Undo/redo на неизменяемых снимках. Благодаря структурному разделению (immer)
// снимок стоит дёшево: копируются только изменённые ветки.

export const HISTORY_LIMIT = 100;

export interface History<T> {
  past: T[];
  present: T;
  future: T[];
}

export function initHistory<T>(present: T): History<T> {
  return { past: [], present, future: [] };
}

/** Новое состояние с записью предыдущего в историю. */
export function push<T>(h: History<T>, next: T, limit = HISTORY_LIMIT): History<T> {
  if (next === h.present) return h;
  const past = [...h.past, h.present];
  if (past.length > limit) past.splice(0, past.length - limit);
  return { past, present: next, future: [] };
}

/** Заменить текущее состояние без записи (промежуточные кадры перетаскивания). */
export function replace<T>(h: History<T>, next: T): History<T> {
  return next === h.present ? h : { ...h, present: next };
}

/**
 * Завершить жест: `base` — состояние до его начала. Если что-то изменилось,
 * в историю ложится один шаг base → present.
 */
export function commitFrom<T>(h: History<T>, base: T, limit = HISTORY_LIMIT): History<T> {
  if (base === h.present) return h;
  return push({ ...h, present: base }, h.present, limit);
}

export function undo<T>(h: History<T>): History<T> {
  if (h.past.length === 0) return h;
  const past = h.past.slice(0, -1);
  return { past, present: h.past[h.past.length - 1], future: [h.present, ...h.future] };
}

export function redo<T>(h: History<T>): History<T> {
  if (h.future.length === 0) return h;
  const [present, ...future] = h.future;
  return { past: [...h.past, h.present], present, future };
}
