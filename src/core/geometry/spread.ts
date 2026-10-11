// Развороты: страница 1 одна справа, дальше пары (2, 3), (4, 5)...
// Слева в развороте оборот предыдущего листа, справа лицевая следующего.

export interface Spread {
  /** Индексы страниц (с нуля), null — пустое место. */
  left: number | null;
  right: number | null;
}

export function spreadOf(index: number, count: number): Spread {
  if (index <= 0) return { left: null, right: count > 0 ? 0 : null };
  const left = index % 2 === 1 ? index : index - 1;
  const right = left + 1 < count ? left + 1 : null;
  return { left, right };
}
