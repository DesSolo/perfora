// Экспорт и импорт проекта в .zip: project.json + assets/<id>.<ext>.

import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import { parseProject, ProjectFormatError, type LoadIssues } from '../core/migrate';
import type { Project } from '../core/model';
import { usedAssetIds } from '../core/ops';

const PROJECT_FILE = 'project.json';

const EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/avif': 'avif',
};

/** Оставить в проекте метаданные только тех картинок, что стоят на страницах. */
export function pruneAssets(p: Project): Project {
  const used = usedAssetIds(p);
  if (Object.keys(p.assets).every((id) => used.has(id))) return p;
  return { ...p, assets: Object.fromEntries(Object.entries(p.assets).filter(([id]) => used.has(id))) };
}

export async function exportZip(
  project: Project,
  blobOf: (assetId: string) => Blob | undefined,
): Promise<{ blob: Blob; missing: number }> {
  const p = pruneAssets(project);
  const files: Zippable = {};
  let missing = 0;
  for (const meta of Object.values(p.assets)) {
    const blob = blobOf(meta.id);
    if (!blob) {
      missing++;
      continue;
    }
    // Картинки уже сжаты, повторное сжатие только тратит время.
    files[`assets/${meta.id}.${EXT[meta.mime] ?? 'bin'}`] = [new Uint8Array(await blob.arrayBuffer()), { level: 0 }];
  }
  files[PROJECT_FILE] = [strToU8(JSON.stringify(p, null, 2)), { level: 6 }];
  return { blob: new Blob([zipSync(files)], { type: 'application/zip' }), missing };
}

export interface ImportedProject {
  project: Project;
  blobs: Map<string, Blob>;
  issues: LoadIssues;
}

export async function importZip(file: Blob): Promise<ImportedProject> {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
  } catch {
    throw new ProjectFormatError('invalid', 'not a zip archive');
  }
  // Архив могли пересобрать из распакованной папки: тогда всё лежит внутри одного каталога.
  const jsonPath = Object.keys(entries)
    .filter((k) => k === PROJECT_FILE || k.endsWith(`/${PROJECT_FILE}`))
    .sort((a, b) => a.length - b.length)[0];
  if (!jsonPath) throw new ProjectFormatError('invalid', `${PROJECT_FILE} not found`);
  const root = jsonPath.slice(0, -PROJECT_FILE.length);

  let raw: unknown;
  try {
    raw = JSON.parse(strFromU8(entries[jsonPath]));
  } catch {
    throw new ProjectFormatError('invalid', `${PROJECT_FILE} is not valid JSON`);
  }

  const files = new Map<string, Uint8Array>();
  for (const [path, data] of Object.entries(entries)) {
    const m = path.startsWith(`${root}assets/`) && /^([^/]+?)(\.[^./]*)?$/.exec(path.slice(root.length + 7));
    if (m) files.set(m[1], data);
  }

  const { project, issues } = parseProject(raw, { hasBlob: (id) => files.has(id) });
  const blobs = new Map<string, Blob>();
  for (const meta of Object.values(project.assets)) {
    const data = files.get(meta.id);
    if (data) blobs.set(meta.id, new Blob([data as Uint8Array<ArrayBuffer>], { type: meta.mime }));
  }
  return { project, blobs, issues };
}

/** Имя файла для скачивания: название проекта без запрещённых в ФС символов. */
export function zipFileName(name: string, fallback: string): string {
  const base = name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);
  return `${base || fallback}.zip`;
}

/** Название проекта по имени файла: без расширения .zip. */
export function nameFromFile(fileName: string): string {
  return fileName.replace(/\.zip$/i, '').trim();
}
