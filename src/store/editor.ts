import { create } from 'zustand';
import { createImageBlock, createProject, createTextBlock } from '../core/defaults';
import { fitInto } from '../core/geometry/transform';
import { contentBox } from '../core/geometry/binding';
import { commitFrom, initHistory, push, redo, replace, undo, type History } from '../core/history';
import type { Block, Project } from '../core/model';
import * as ops from '../core/ops';
import { importImage, isImageFile } from '../assets/importImage';
import { putAsset } from '../assets/registry';
import { detectLang, saveLang, translate, type Lang, type MessageKey } from '../i18n';
import { isValidPreset, presetFromBinding, type BindingPreset } from '../core/bindingPresets';
import { newId } from '../core/ids';
import type { Guides } from '../core/geometry/snap';

/** Подряд идущие однотипные правки (стрелки, ввод в поле) сливаются в один шаг истории. */
const COALESCE_MS = 800;

export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 8;

export interface ViewPrefs {
  margins: boolean;
  holes: boolean;
  keepOut: boolean;
  grid: boolean;
  snap: boolean;
  spread: boolean;
}

const DEFAULT_VIEW: ViewPrefs = { margins: true, holes: true, keepOut: true, grid: false, snap: true, spread: false };

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // localStorage недоступен — настройки просто не переживут перезагрузку.
  }
}

export interface EditorState {
  history: History<Project>;
  currentPageId: string;
  selectedBlockId: string | null;
  editingBlockId: string | null;
  zoom: number;
  lang: Lang;
  imageDpi: number;
  downscaleImages: boolean;
  /** Сообщение об ошибке для показа пользователю. */
  notice: string | null;
  view: ViewPrefs;
  /** Направляющие привязки на текущей странице во время жеста. */
  guides: Guides | null;
  /** Смонтирован печатный рендер (на время печати). */
  printing: boolean;
  previewOpen: boolean;
  userPresets: BindingPreset[];

  gestureBase: Project | null;
  lastCommit: { key: string; t: number } | null;

  apply(fn: (p: Project) => Project, coalesceKey?: string): void;
  beginGesture(): void;
  previewGesture(fn: (p: Project) => Project): void;
  endGesture(): void;
  undo(): void;
  redo(): void;

  selectPage(id: string): void;
  selectBlock(id: string | null): void;
  setEditing(id: string | null): void;
  setZoom(z: number): void;
  setLang(l: Lang): void;
  setImageImport(opts: { dpi?: number; downscale?: boolean }): void;
  setNotice(msg: string | null): void;
  setView(patch: Partial<ViewPrefs>): void;
  setGuides(g: Guides | null): void;
  setPrinting(v: boolean): void;
  setPreviewOpen(v: boolean): void;
  saveUserPreset(name: string): void;
  deleteUserPreset(id: string): void;

  addPage(): void;
  duplicatePage(id: string): void;
  deletePage(id: string): void;
  movePage(from: number, to: number): void;

  addText(): void;
  addImages(files: File[]): Promise<void>;
  updateBlock(id: string, patch: Partial<Block>, coalesceKey?: string): void;
  deleteSelected(): void;
  duplicateSelected(): void;
  nudgeSelected(dx: number, dy: number): void;
  reorderSelected(order: ops.ZOrder): void;
  toggleLockSelected(): void;
}

const initial = createProject();

export const useEditor = create<EditorState>()((set, get) => {
  const project = () => get().history.present;
  const t = (key: MessageKey, params?: Record<string, string | number>) => translate(get().lang, key, params);

  /** Привести выделение в соответствие с проектом (после undo, удаления страниц). */
  function reconcile(h: History<Project>) {
    const s = get();
    const page = h.present.pages.find((p) => p.id === s.currentPageId) ?? h.present.pages[0];
    const block = page.blocks.find((b) => b.id === s.selectedBlockId);
    set({
      history: h,
      currentPageId: page.id,
      selectedBlockId: block ? block.id : null,
      editingBlockId: block && s.editingBlockId === block.id ? s.editingBlockId : null,
    });
  }

  function selected(): Block | undefined {
    const s = get();
    return project()
      .pages.find((p) => p.id === s.currentPageId)
      ?.blocks.find((b) => b.id === s.selectedBlockId);
  }

  return {
    history: initHistory(initial),
    currentPageId: initial.pages[0].id,
    selectedBlockId: null,
    editingBlockId: null,
    zoom: 1,
    lang: detectLang(),
    imageDpi: 300,
    downscaleImages: true,
    notice: null,
    view: { ...DEFAULT_VIEW, ...loadJson<Partial<ViewPrefs>>('ris.view', {}) },
    guides: null,
    printing: false,
    previewOpen: false,
    userPresets: loadJson<unknown[]>('ris.presets', []).filter(isValidPreset),
    gestureBase: null,
    lastCommit: null,

    apply(fn, coalesceKey) {
      const s = get();
      const next = fn(s.history.present);
      if (next === s.history.present) return;
      const now = Date.now();
      const merge = coalesceKey && s.lastCommit?.key === coalesceKey && now - s.lastCommit.t < COALESCE_MS;
      set({
        history: merge ? replace(s.history, next) : push(s.history, next),
        lastCommit: coalesceKey ? { key: coalesceKey, t: now } : null,
      });
    },

    beginGesture() {
      set({ gestureBase: project(), lastCommit: null });
    },
    previewGesture(fn) {
      const s = get();
      set({ history: replace(s.history, fn(s.history.present)) });
    },
    endGesture() {
      const s = get();
      if (!s.gestureBase) return;
      set({ history: commitFrom(s.history, s.gestureBase), gestureBase: null, guides: null });
    },

    undo() {
      set({ lastCommit: null });
      reconcile(undo(get().history));
    },
    redo() {
      set({ lastCommit: null });
      reconcile(redo(get().history));
    },

    selectPage(id) {
      if (id !== get().currentPageId) set({ currentPageId: id, selectedBlockId: null, editingBlockId: null });
    },
    selectBlock(id) {
      const s = get();
      set({ selectedBlockId: id, editingBlockId: s.editingBlockId === id ? id : null });
    },
    setEditing(id) {
      set(id ? { editingBlockId: id, selectedBlockId: id } : { editingBlockId: null });
    },
    setZoom(z) {
      set({ zoom: Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z)) });
    },
    setLang(lang) {
      saveLang(lang);
      set({ lang });
    },
    setImageImport({ dpi, downscale }) {
      set((s) => ({ imageDpi: dpi ?? s.imageDpi, downscaleImages: downscale ?? s.downscaleImages }));
    },
    setNotice(notice) {
      set({ notice });
    },
    setView(patch) {
      const view = { ...get().view, ...patch };
      saveJson('ris.view', view);
      set({ view });
    },
    setGuides(guides) {
      set({ guides });
    },
    setPrinting(printing) {
      set({ printing });
    },
    setPreviewOpen(previewOpen) {
      set({ previewOpen });
    },
    saveUserPreset(name) {
      const preset = presetFromBinding(newId('u'), name, project().binding);
      const userPresets = [...get().userPresets, preset];
      saveJson('ris.presets', userPresets);
      set({ userPresets });
    },
    deleteUserPreset(id) {
      const userPresets = get().userPresets.filter((p) => p.id !== id);
      saveJson('ris.presets', userPresets);
      set({ userPresets });
    },

    addPage() {
      const s = get();
      const index = project().pages.findIndex((p) => p.id === s.currentPageId);
      const { project: next, pageId } = ops.addPage(project(), index);
      s.apply(() => next);
      s.selectPage(pageId);
    },
    duplicatePage(id) {
      const { project: next, pageId } = ops.duplicatePage(project(), id);
      get().apply(() => next);
      get().selectPage(pageId);
    },
    deletePage(id) {
      const pages = project().pages;
      const index = pages.findIndex((p) => p.id === id);
      get().apply((p) => ops.deletePage(p, id));
      const rest = project().pages;
      if (rest.length !== pages.length) get().selectPage(rest[Math.min(index, rest.length - 1)].id);
    },
    movePage(from, to) {
      get().apply((p) => ops.movePage(p, from, to));
    },

    addText() {
      const s = get();
      const p = project();
      const area = contentBox(p.pages.findIndex((pg) => pg.id === s.currentPageId), p);
      const w = Math.min(80, area.w);
      const block = createTextBlock({
        x: area.x + (area.w - w) / 2,
        y: area.y + 10,
        w,
        h: 25,
        html: `<p>${t('text.placeholder')}</p>`,
      });
      s.apply((pr) => ops.addBlock(pr, s.currentPageId, block));
      set({ selectedBlockId: block.id, editingBlockId: block.id });
    },

    async addImages(files) {
      const images = files.filter(isImageFile);
      if (images.length === 0) return;
      const s = get();
      const pageId = s.currentPageId;
      const p = project();
      const area = contentBox(p.pages.findIndex((pg) => pg.id === pageId), p);
      const added: { meta: Project['assets'][string]; block: Block }[] = [];
      for (const [i, file] of images.entries()) {
        try {
          const img = await importImage(file, {
            dpi: get().imageDpi,
            downscale: get().downscaleImages,
            maxPlacement: area,
          });
          putAsset(img.meta.id, img.blob);
          // Каждая следующая картинка чуть смещена, чтобы не лечь ровно поверх предыдущей.
          const box = fitInto(img.meta.width / img.meta.height, {
            ...area,
            w: area.w * 0.6,
            h: area.h * 0.6,
          });
          const shift = (i % 8) * 5;
          const block = createImageBlock(img.meta.id, { ...box, x: box.x + shift, y: box.y + shift });
          added.push({ meta: img.meta, block });
        } catch {
          set({ notice: t('error.image', { name: file.name }) });
        }
      }
      if (added.length === 0) return;
      // Применяем к проекту на момент окончания импорта: пока шло декодирование, его могли изменить.
      get().apply((pr) => {
        if (!pr.pages.some((pg) => pg.id === pageId)) return pr;
        for (const { meta, block } of added) pr = ops.addBlock(ops.addAsset(pr, meta), pageId, block);
        return pr;
      });
      if (get().currentPageId === pageId) {
        set({ selectedBlockId: added[added.length - 1].block.id, editingBlockId: null });
      }
    },

    updateBlock(id, patch, coalesceKey) {
      const s = get();
      s.apply((p) => ops.updateBlock(p, s.currentPageId, id, patch), coalesceKey && `${coalesceKey}:${id}`);
    },
    deleteSelected() {
      const s = get();
      const b = selected();
      if (!b) return;
      s.apply((p) => ops.removeBlock(p, s.currentPageId, b.id));
      set({ selectedBlockId: null, editingBlockId: null });
    },
    duplicateSelected() {
      const s = get();
      const b = selected();
      if (!b) return;
      const { project: next, blockId } = ops.duplicateBlock(project(), s.currentPageId, b.id);
      s.apply(() => next);
      set({ selectedBlockId: blockId, editingBlockId: null });
    },
    nudgeSelected(dx, dy) {
      const b = selected();
      if (!b || b.locked) return;
      get().updateBlock(b.id, { x: b.x + dx, y: b.y + dy }, 'nudge');
    },
    reorderSelected(order) {
      const s = get();
      const b = selected();
      if (b) s.apply((p) => ops.reorderBlock(p, s.currentPageId, b.id, order));
    },
    toggleLockSelected() {
      const b = selected();
      if (b) get().updateBlock(b.id, { locked: !b.locked });
    },
  };
});

export const useProject = () => useEditor((s) => s.history.present);
export const useT = () => {
  const lang = useEditor((s) => s.lang);
  return (key: MessageKey, params?: Record<string, string | number>) => translate(lang, key, params);
};
