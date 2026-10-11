let counter = 0;

/** Короткий уникальный id. crypto.randomUUID есть не везде (нет в не-secure контексте). */
export function newId(prefix = ''): string {
  const rnd =
    typeof crypto !== 'undefined' && 'getRandomValues' in crypto
      ? Array.from(crypto.getRandomValues(new Uint32Array(2)), (n) => n.toString(36)).join('')
      : Math.random().toString(36).slice(2);
  counter = (counter + 1) % 1296;
  return prefix + rnd + counter.toString(36);
}
