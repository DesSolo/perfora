// Хранилище проектов в IndexedDB. Три хранилища:
//   projects  — id → Project (сырой JSON, при чтении проходит parseProject);
//   summaries — краткие сведения для списка недавних, чтобы не читать проекты целиком;
//   assets    — `${projectId}/${assetId}` → Blob.

import type { Project } from '../core/model';

const DB_NAME = 'ring-insert-studio';
const DB_VERSION = 1;

export interface ProjectSummary {
  id: string;
  name: string;
  /** Время последнего сохранения, мс. */
  updatedAt: number;
  pageCount: number;
  width: number;
  height: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB is unavailable'));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects');
      if (!db.objectStoreNames.contains('summaries')) db.createObjectStore('summaries', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('assets')) db.createObjectStore('assets');
    };
    req.onsuccess = () => {
      const db = req.result;
      // Другая вкладка с новой версией приложения просит обновить схему — уступаем.
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
    req.onblocked = () => reject(new Error('IndexedDB open blocked'));
  }).catch((e: unknown) => {
    dbPromise = null;
    throw e;
  });
  return dbPromise;
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}

function result<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

const assetKey = (projectId: string, assetId: string) => `${projectId}/${assetId}`;
const projectAssets = (projectId: string) => IDBKeyRange.bound(`${projectId}/`, `${projectId}/￿`);

export function summarize(id: string, p: Project, updatedAt: number): ProjectSummary {
  return { id, name: p.name, updatedAt, pageCount: p.pages.length, width: p.page.width, height: p.page.height };
}

/**
 * Записать проект одной транзакцией: JSON, сводку, новые картинки (`put`)
 * и удаление ненужных (`remove`).
 */
export async function saveProject(
  id: string,
  project: Project,
  put: { assetId: string; blob: Blob }[],
  remove: string[],
): Promise<ProjectSummary> {
  const db = await openDb();
  const tx = db.transaction(['projects', 'summaries', 'assets'], 'readwrite');
  const summary = summarize(id, project, Date.now());
  tx.objectStore('projects').put(project, id);
  tx.objectStore('summaries').put(summary);
  const assets = tx.objectStore('assets');
  for (const { assetId, blob } of put) assets.put(blob, assetKey(id, assetId));
  for (const assetId of remove) assets.delete(assetKey(id, assetId));
  await done(tx);
  return summary;
}

export async function loadProject(id: string): Promise<{ raw: unknown; blobs: Map<string, Blob> } | null> {
  const db = await openDb();
  const tx = db.transaction(['projects', 'assets'], 'readonly');
  const raw = result(tx.objectStore('projects').get(id));
  const store = tx.objectStore('assets');
  const keys = result(store.getAllKeys(projectAssets(id)));
  const values = result(store.getAll(projectAssets(id)));
  const [r, k, v] = await Promise.all([raw, keys, values]);
  if (r === undefined) return null;
  const blobs = new Map<string, Blob>();
  k.forEach((key, i) => blobs.set(String(key).slice(id.length + 1), v[i] as Blob));
  return { raw: r, blobs };
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const db = await openDb();
  const all = await result(db.transaction('summaries', 'readonly').objectStore('summaries').getAll());
  return (all as ProjectSummary[]).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteProject(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(['projects', 'summaries', 'assets'], 'readwrite');
  tx.objectStore('projects').delete(id);
  tx.objectStore('summaries').delete(id);
  tx.objectStore('assets').delete(projectAssets(id));
  await done(tx);
}

/** Попросить браузер не вытеснять данные при нехватке места. Отказ не критичен. */
export function requestPersistence(): void {
  void navigator.storage?.persist?.().catch(() => undefined);
}
