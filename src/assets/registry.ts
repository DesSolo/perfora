// Хранилище бинарных данных картинок на время сессии. В проекте лежат только метаданные.
// Записи не удаляются при удалении блока: иначе undo вернул бы блок без картинки.

interface Entry {
  blob: Blob;
  url: string;
}

const entries = new Map<string, Entry>();

export function putAsset(id: string, blob: Blob): void {
  const prev = entries.get(id);
  if (prev) URL.revokeObjectURL(prev.url);
  entries.set(id, { blob, url: URL.createObjectURL(blob) });
}

export function assetUrl(id: string): string | undefined {
  return entries.get(id)?.url;
}

export function assetBlob(id: string): Blob | undefined {
  return entries.get(id)?.blob;
}

/** Забыть все картинки (при переходе к другому проекту: его история с текущей не связана). */
export function clearAssets(): void {
  for (const e of entries.values()) URL.revokeObjectURL(e.url);
  entries.clear();
}
