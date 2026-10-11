// Связка стора с хранилищем: автосохранение, восстановление при запуске,
// открытие, создание, импорт и экспорт проектов.

import { assetBlob } from '../assets/registry';
import { createProject } from '../core/defaults';
import { hasIssues, parseProject, ProjectFormatError, type LoadIssues } from '../core/migrate';
import type { Project } from '../core/model';
import { newId } from '../core/ids';
import { translate } from '../i18n';
import { useEditor } from '../store/editor';
import * as db from './db';
import { exportZip, importZip, nameFromFile, pruneAssets, zipFileName } from './zip';

const SAVE_DELAY_MS = 500;
const LAST_KEY = 'ris.lastProject';

/** Что уже лежит в базе для текущего проекта. `project: null` — ещё ни разу не сохранён. */
let persisted: { projectId: string; project: Project | null; assets: Set<string> } = {
  projectId: '',
  project: null,
  assets: new Set(),
};
let timer: ReturnType<typeof setTimeout> | undefined;
let queue: Promise<void> = Promise.resolve();
let persistenceRequested = false;

const t = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) =>
  translate(useEditor.getState().lang, key, params);

function rememberLast(id: string): void {
  try {
    localStorage.setItem(LAST_KEY, id);
  } catch {
    // без localStorage при запуске откроется последний изменённый проект
  }
}

function isDirty(): boolean {
  const s = useEditor.getState();
  return persisted.projectId !== s.projectId || persisted.project !== s.history.present;
}

async function saveNow(): Promise<void> {
  const s = useEditor.getState();
  if (!isDirty()) return;
  const { projectId } = s;
  const present = s.history.present;
  const project = pruneAssets(present);
  const had = persisted.projectId === projectId ? persisted.assets : new Set<string>();
  const put: { assetId: string; blob: Blob }[] = [];
  const kept = new Set<string>();
  for (const id of Object.keys(project.assets)) {
    if (had.has(id)) {
      kept.add(id);
      continue;
    }
    const blob = assetBlob(id);
    if (blob) {
      put.push({ assetId: id, blob });
      kept.add(id);
    }
  }
  const remove = [...had].filter((id) => !project.assets[id]);

  s.setSaveStatus('saving');
  try {
    await db.saveProject(projectId, project, put, remove);
    persisted = { projectId, project: present, assets: kept };
    if (useEditor.getState().projectId === projectId) {
      useEditor.getState().setSaveStatus(isDirty() ? 'idle' : 'saved');
    }
    if (!persistenceRequested) {
      persistenceRequested = true;
      db.requestPersistence();
    }
  } catch (e) {
    console.error('autosave failed', e);
    const st = useEditor.getState();
    if (st.saveStatus !== 'error') st.setNotice(t('save.failed'));
    st.setSaveStatus('error');
  }
}

/** Сохранить немедленно (с ожиданием уже идущего сохранения). */
export function flushSave(): Promise<void> {
  clearTimeout(timer);
  timer = undefined;
  queue = queue.then(saveNow, saveNow);
  return queue;
}

function schedule(): void {
  clearTimeout(timer);
  timer = setTimeout(() => {
    // Посреди перетаскивания не пишем: кадры жеста в историю не попадают.
    if (useEditor.getState().gestureBase) schedule();
    else void flushSave();
  }, SAVE_DELAY_MS);
}

/** Подписаться на изменения проекта. Возвращает отписку. */
export function startAutosave(): () => void {
  const unsub = useEditor.subscribe((s, prev) => {
    if (s.history.present !== prev.history.present || s.projectId !== prev.projectId) {
      if (isDirty()) schedule();
    }
  });
  const onHide = () => {
    if (document.visibilityState === 'hidden' && isDirty()) void flushSave();
  };
  const onPageHide = () => {
    if (isDirty()) void flushSave();
  };
  // Предупредить о закрытии, только если изменения не успели записаться.
  const onBeforeUnload = (e: BeforeUnloadEvent) => {
    if (isDirty() || useEditor.getState().saveStatus === 'error') {
      void flushSave();
      e.preventDefault();
    }
  };
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('beforeunload', onBeforeUnload);
  return () => {
    unsub();
    clearTimeout(timer);
    document.removeEventListener('visibilitychange', onHide);
    window.removeEventListener('pagehide', onPageHide);
    window.removeEventListener('beforeunload', onBeforeUnload);
  };
}

function issuesNotice(issues: LoadIssues): string | null {
  if (!hasIssues(issues)) return null;
  const parts: string[] = [];
  if (issues.missingAssets) parts.push(t('load.missingAssets', { n: issues.missingAssets }));
  if (issues.droppedBlocks) parts.push(t('load.droppedBlocks', { n: issues.droppedBlocks }));
  if (issues.duplicateIds) parts.push(t('load.duplicateIds', { n: issues.duplicateIds }));
  return parts.join('; ');
}

function errorNotice(e: unknown): string {
  if (e instanceof ProjectFormatError && e.code === 'newer') return t('load.newer');
  if (e instanceof ProjectFormatError) return t('load.invalid');
  return t('load.failed');
}

interface Loaded {
  id: string;
  project: Project;
  blobs: Map<string, Blob>;
  issues: LoadIssues;
}

async function readSaved(id: string): Promise<Loaded | null> {
  const stored = await db.loadProject(id);
  if (!stored) return null;
  const { project, issues } = parseProject(stored.raw, { hasBlob: (a) => stored.blobs.has(a) });
  return { id, project, blobs: stored.blobs, issues };
}

function applySaved({ id, project, blobs, issues }: Loaded): void {
  useEditor.getState().openProject(id, project, blobs);
  // Если при разборе что-то исправили, пусть исправленная версия запишется.
  persisted = { projectId: id, project: hasIssues(issues) ? null : project, assets: new Set(blobs.keys()) };
  rememberLast(id);
  const notice = issuesNotice(issues);
  if (notice) useEditor.getState().setNotice(notice);
}

/** Открыть проект из базы. false — его там нет или он не читается. */
export async function openSaved(id: string): Promise<boolean> {
  await flushSave();
  try {
    const loaded = await readSaved(id);
    if (loaded) applySaved(loaded);
    return loaded !== null;
  } catch (e) {
    console.error('open failed', e);
    useEditor.getState().setNotice(errorNotice(e));
    return false;
  }
}

/**
 * При запуске: открыть последний проект, иначе последний изменённый, иначе оставить новый.
 * IndexedDB может зависнуть (заблокирована другой вкладкой): ждём не дольше `timeoutMs`,
 * опоздавший результат отбрасываем, чтобы не подменить проект, в котором уже работают.
 */
export async function restoreLast(timeoutMs = 3000): Promise<void> {
  const s = useEditor.getState();
  persisted = { projectId: s.projectId, project: s.history.present, assets: new Set() };
  const find = async (): Promise<Loaded | null> => {
    let id: string | null = null;
    try {
      id = localStorage.getItem(LAST_KEY);
    } catch {
      // нет localStorage
    }
    const last = id ? await readSaved(id).catch(() => null) : null;
    if (last) return last;
    const [latest] = await db.listProjects();
    return latest ? readSaved(latest.id) : null;
  };
  try {
    const loaded = await Promise.race([find(), new Promise<null>((r) => setTimeout(() => r(null), timeoutMs))]);
    if (loaded) applySaved(loaded);
  } catch (e) {
    console.error('restore failed', e);
    useEditor.getState().setNotice(errorNotice(e));
  }
}

export async function createNew(): Promise<void> {
  await flushSave();
  const id = newId('j');
  const project = createProject();
  useEditor.getState().openProject(id, project);
  // Пустой новый проект не записываем, пока в нём ничего не изменили.
  persisted = { projectId: id, project, assets: new Set() };
  rememberLast(id);
}

export async function importProjectFile(file: File): Promise<boolean> {
  try {
    const { project, blobs, issues } = await importZip(file);
    await flushSave();
    const id = newId('j');
    const named = project.name ? project : { ...project, name: nameFromFile(file.name) };
    useEditor.getState().openProject(id, named, blobs);
    persisted = { projectId: id, project: null, assets: new Set() };
    rememberLast(id);
    void flushSave();
    useEditor.getState().setNotice(issuesNotice(issues) ?? t('load.imported', { name: named.name || file.name }));
    return true;
  } catch (e) {
    if (!(e instanceof ProjectFormatError)) console.error('import failed', e);
    useEditor.getState().setNotice(errorNotice(e));
    return false;
  }
}

export async function exportCurrent(): Promise<void> {
  const project = useEditor.getState().history.present;
  const { blob, missing } = await exportZip(project, assetBlob);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = zipFileName(project.name, t('project.untitled'));
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  if (missing) useEditor.getState().setNotice(t('load.missingAssets', { n: missing }));
}

/** Удалить проект из базы. Текущий проект удалить нельзя (кнопка скрыта). */
export async function removeSaved(id: string): Promise<void> {
  if (id === useEditor.getState().projectId) return;
  await db.deleteProject(id);
}

export const listSaved = db.listProjects;

export function isZipFile(f: File): boolean {
  return /zip/.test(f.type) || /\.zip$/i.test(f.name);
}
