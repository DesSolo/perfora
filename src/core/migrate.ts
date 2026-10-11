// Загрузка проекта из недоверенного JSON (zip, IndexedDB): миграции схемы и нормализация.
// Чистые функции без DOM.

import { createPage, createProject, DEFAULT_TEXT_STYLE } from './defaults';
import { newId } from './ids';
import {
  SCHEMA_VERSION,
  type AssetMeta,
  type Block,
  type Binding,
  type ImageFit,
  type Page,
  type PrintSettings,
  type Project,
  type TextAlign,
  type TextStyle,
} from './model';

type Raw = Record<string, unknown>;

/** Переводит сырой объект схемы n в схему n + 1. */
export type Migration = (raw: Raw) => Raw;

/** MIGRATIONS[n] — шаг n → n + 1. */
export const MIGRATIONS: Record<number, Migration> = {
  // 2: появились неравные промежутки `binding.holes.gaps`. Проекты схемы 1 с равным шагом
  // остаются как есть; версия поднята, чтобы старое приложение не открыло новый файл и
  // не потеряло промежутки молча.
  1: (r) => r,
};

export type ProjectErrorCode = 'invalid' | 'newer' | 'noMigration';

export class ProjectFormatError extends Error {
  constructor(
    readonly code: ProjectErrorCode,
    message: string,
  ) {
    super(message);
  }
}

/** Что пришлось исправить при загрузке. Проект при этом всё равно открывается. */
export interface LoadIssues {
  /** Блоки с неизвестным типом или битой геометрией, выброшены. */
  droppedBlocks: number;
  /** Картинки, для которых нет метаданных или файла. */
  missingAssets: number;
  /** Повторяющиеся id страниц и блоков, заменены новыми. */
  duplicateIds: number;
}

export function emptyIssues(): LoadIssues {
  return { droppedBlocks: 0, missingAssets: 0, duplicateIds: 0 };
}

export function hasIssues(i: LoadIssues): boolean {
  return i.droppedBlocks + i.missingAssets + i.duplicateIds > 0;
}

const isObj = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const num = (v: unknown, fallback: number) => (isNum(v) ? v : fallback);
const pos = (v: unknown, fallback: number) => (isNum(v) && v > 0 ? v : fallback);
const nonNeg = (v: unknown, fallback: number) => (isNum(v) && v >= 0 ? v : fallback);
const str = (v: unknown, fallback: string) => (typeof v === 'string' ? v : fallback);
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);
const oneOf = <T extends string>(v: unknown, values: readonly T[], fallback: T): T =>
  values.includes(v as T) ? (v as T) : fallback;
const obj = (v: unknown): Raw => (isObj(v) ? v : {});

/** Довести сырой объект до текущей схемы. */
export function migrate(raw: unknown, migrations = MIGRATIONS, target = SCHEMA_VERSION): Raw {
  if (!isObj(raw)) throw new ProjectFormatError('invalid', 'project is not an object');
  const from = raw.schemaVersion;
  if (!isNum(from) || !Number.isInteger(from) || from < 1) {
    throw new ProjectFormatError('invalid', `bad schemaVersion: ${String(from)}`);
  }
  if (from > target) throw new ProjectFormatError('newer', `schema ${from} is newer than ${target}`);
  let cur = raw;
  for (let v = from; v < target; v++) {
    const step = migrations[v];
    if (!step) throw new ProjectFormatError('noMigration', `no migration from ${v}`);
    cur = { ...step(cur), schemaVersion: v + 1 };
  }
  return cur;
}

/**
 * Разобрать проект: миграции, затем сборка заново из известных полей с подстановкой
 * значений по умолчанию. Неизвестные поля отбрасываются.
 * `hasBlob` — есть ли файл картинки (для подсчёта потерянных).
 */
export function parseProject(
  raw: unknown,
  opts: { hasBlob?: (assetId: string) => boolean; migrations?: Record<number, Migration> } = {},
): { project: Project; issues: LoadIssues } {
  const r = migrate(raw, opts.migrations);
  if (!Array.isArray(r.pages)) throw new ProjectFormatError('invalid', 'pages is not an array');
  const def = createProject();
  const issues = emptyIssues();

  const page = obj(r.page);
  const margins = obj(r.margins);

  const assets: Record<string, AssetMeta> = {};
  for (const [key, v] of Object.entries(obj(r.assets))) {
    const a = obj(v);
    const id = str(a.id, key);
    if (id !== key || !isObj(v)) continue;
    assets[id] = {
      id,
      name: str(a.name, 'image'),
      mime: str(a.mime, 'image/png'),
      width: pos(a.width, 1),
      height: pos(a.height, 1),
    };
  }

  const seen = new Set<string>();
  const uniqueId = (v: unknown, prefix: string) => {
    let id = typeof v === 'string' && v ? v : '';
    if (!id || seen.has(id)) {
      if (id) issues.duplicateIds++;
      id = newId(prefix);
    }
    seen.add(id);
    return id;
  };

  const missing = new Set<string>();
  const pages: Page[] = r.pages.filter(isObj).map((pg) => {
    const id = uniqueId(pg.id, 'p');
    const blocks: Block[] = [];
    for (const b of Array.isArray(pg.blocks) ? pg.blocks : []) {
      const block = parseBlock(b, (v) => uniqueId(v, 'b'));
      if (!block) {
        issues.droppedBlocks++;
        continue;
      }
      if (block.type === 'image' && (!assets[block.assetId] || opts.hasBlob?.(block.assetId) === false)) {
        missing.add(block.assetId);
      }
      blocks.push(block);
    }
    blocks.sort((a, b) => a.z - b.z).forEach((b, i) => (b.z = i));
    return { id, blocks };
  });
  issues.missingAssets = missing.size;

  return {
    project: {
      schemaVersion: SCHEMA_VERSION,
      name: str(r.name, ''),
      page: { width: pos(page.width, def.page.width), height: pos(page.height, def.page.height) },
      margins: {
        inner: nonNeg(margins.inner, def.margins.inner),
        outer: nonNeg(margins.outer, def.margins.outer),
        top: nonNeg(margins.top, def.margins.top),
        bottom: nonNeg(margins.bottom, def.margins.bottom),
      },
      binding: parseBinding(r.binding, def.binding),
      print: parsePrint(r.print, def.print),
      pages: pages.length ? pages : [createPage()],
      assets,
    },
    issues,
  };
}

function parseBinding(v: unknown, def: Binding): Binding {
  const b = obj(v);
  const h = obj(b.holes);
  const holes: Binding['holes'] = {
    count: Math.max(0, Math.round(num(h.count, def.holes.count))),
    diameter: pos(h.diameter, def.holes.diameter),
    pitch: pos(h.pitch, def.holes.pitch),
    offsetFromEdge: nonNeg(h.offsetFromEdge, def.holes.offsetFromEdge),
    centered: bool(h.centered, def.holes.centered),
  };
  if (isNum(h.firstHoleOffset)) holes.firstHoleOffset = h.firstHoleOffset;
  // Промежутки берём, только если они согласованы с числом отверстий. Без числа
  // отверстий в файле подставляются и промежутки по умолчанию.
  const gaps: unknown = h.gaps ?? (h.count === undefined ? def.holes.gaps : undefined);
  if (Array.isArray(gaps) && gaps.length > 0 && gaps.length === holes.count - 1 && gaps.every((g) => isNum(g) && g > 0)) {
    holes.gaps = [...(gaps as number[])];
  }
  return {
    enabled: bool(b.enabled, def.enabled),
    side: oneOf(b.side, ['left', 'right', 'top'] as const, def.side),
    mirror: oneOf(b.mirror, ['none', 'duplex'] as const, def.mirror),
    holes,
    keepOutPadding: nonNeg(b.keepOutPadding, def.keepOutPadding),
  };
}

function parseOffset(v: unknown): { x: number; y: number } {
  const o = obj(v);
  return { x: num(o.x, 0), y: num(o.y, 0) };
}

function parsePrint(v: unknown, def: PrintSettings): PrintSettings {
  const p = obj(v);
  let imposition: PrintSettings['imposition'] = null;
  if (isObj(p.imposition)) {
    const im = p.imposition;
    const sheet = im.sheet === 'A4' || im.sheet === 'Letter' ? im.sheet : isObj(im.sheet) ? im.sheet : null;
    const custom = isObj(sheet) && isNum(sheet.w) && isNum(sheet.h) && sheet.w > 0 && sheet.h > 0;
    if (sheet && (typeof sheet === 'string' || custom)) {
      imposition = {
        sheet: typeof sheet === 'string' ? sheet : { w: sheet.w as number, h: sheet.h as number },
        cols: Math.max(1, Math.round(num(im.cols, 1))),
        rows: Math.max(1, Math.round(num(im.rows, 1))),
        gap: nonNeg(im.gap, 0),
      };
    }
  }
  return {
    holeMarks: oneOf(p.holeMarks, ['off', 'screen-only', 'print'] as const, def.holeMarks),
    cropMarks: bool(p.cropMarks, def.cropMarks),
    duplexFlip: oneOf(p.duplexFlip, ['long-edge', 'short-edge'] as const, def.duplexFlip),
    offsetFront: parseOffset(p.offsetFront),
    offsetBack: parseOffset(p.offsetBack),
    imposition,
  };
}

const FITS: readonly ImageFit[] = ['contain', 'cover', 'stretch'];
const ALIGNS: readonly TextAlign[] = ['left', 'center', 'right', 'justify'];

function parseBlock(v: unknown, id: (v: unknown) => string): Block | null {
  if (!isObj(v)) return null;
  const { x, y, w, h } = v;
  if (!isNum(x) || !isNum(y) || !isNum(w) || !isNum(h) || w <= 0 || h <= 0) return null;
  if (v.type !== 'image' && v.type !== 'text') return null;
  if (v.type === 'image' && (typeof v.assetId !== 'string' || !v.assetId)) return null;
  const base = { id: id(v.id), x, y, w, h, rotation: num(v.rotation, 0), z: num(v.z, 0) };
  const locked = v.locked === true ? { locked: true } : {};

  if (v.type === 'image') {
    return { ...base, ...locked, type: 'image', assetId: v.assetId as string, fit: oneOf(v.fit, FITS, 'contain') };
  }
  const s = obj(v.style);
  const d = DEFAULT_TEXT_STYLE;
  const style: TextStyle = {
    font: str(s.font, d.font),
    size: pos(s.size, d.size),
    weight: pos(s.weight, d.weight),
    italic: bool(s.italic, d.italic),
    align: oneOf(s.align, ALIGNS, d.align),
    lineHeight: pos(s.lineHeight, d.lineHeight),
    color: str(s.color, d.color),
  };
  // HTML санитизируется при отрисовке, здесь только проверка типа.
  return { ...base, ...locked, type: 'text', html: str(v.html, ''), style };
}
