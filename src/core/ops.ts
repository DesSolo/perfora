// Чистые операции над проектом: на входе и выходе неизменяемый Project.

import { produce, type Draft } from 'immer';
import { createPage } from './defaults';
import { newId } from './ids';
import type { AssetMeta, Block, Page, Project } from './model';

export type ZOrder = 'front' | 'back' | 'forward' | 'backward';

const DUPLICATE_SHIFT = 5;

function findPage(p: Draft<Project>, pageId: string): Draft<Page> {
  const page = p.pages.find((pg) => pg.id === pageId);
  if (!page) throw new Error(`page not found: ${pageId}`);
  return page;
}

/** Упорядочить блоки по z и перенумеровать z = 0..n-1. Порядок массива совпадает с порядком слоёв. */
function normalizeZ(blocks: Draft<Block>[]): void {
  blocks.sort((a, b) => a.z - b.z);
  blocks.forEach((b, i) => (b.z = i));
}

export function addPage(p: Project, afterIndex = p.pages.length - 1): { project: Project; pageId: string } {
  const page = createPage();
  const project = produce(p, (d) => {
    d.pages.splice(afterIndex + 1, 0, page);
  });
  return { project, pageId: page.id };
}

export function duplicatePage(p: Project, pageId: string): { project: Project; pageId: string } {
  const index = p.pages.findIndex((pg) => pg.id === pageId);
  if (index < 0) throw new Error(`page not found: ${pageId}`);
  const src = p.pages[index];
  const copy: Page = {
    id: newId('p'),
    blocks: src.blocks.map((b) => ({ ...structuredClone(b), id: newId('b') })),
  };
  const project = produce(p, (d) => {
    d.pages.splice(index + 1, 0, copy);
  });
  return { project, pageId: copy.id };
}

/** Удалить страницу. Последнюю страницу не удаляем: в проекте всегда есть хотя бы одна. */
export function deletePage(p: Project, pageId: string): Project {
  if (p.pages.length <= 1) return p;
  return produce(p, (d) => {
    d.pages = d.pages.filter((pg) => pg.id !== pageId);
  });
}

export function movePage(p: Project, from: number, to: number): Project {
  if (from === to || from < 0 || from >= p.pages.length) return p;
  const target = Math.max(0, Math.min(p.pages.length - 1, to));
  return produce(p, (d) => {
    const [page] = d.pages.splice(from, 1);
    d.pages.splice(target, 0, page);
  });
}

export function addBlock(p: Project, pageId: string, block: Block): Project {
  return produce(p, (d) => {
    const page = findPage(d, pageId);
    block = { ...block, z: page.blocks.length };
    page.blocks.push(block);
  });
}

export function updateBlock(p: Project, pageId: string, blockId: string, patch: Partial<Block>): Project {
  return produce(p, (d) => {
    const block = findPage(d, pageId).blocks.find((b) => b.id === blockId);
    if (!block) return;
    Object.assign(block, patch);
  });
}

export function removeBlock(p: Project, pageId: string, blockId: string): Project {
  return produce(p, (d) => {
    const page = findPage(d, pageId);
    page.blocks = page.blocks.filter((b) => b.id !== blockId);
    normalizeZ(page.blocks);
  });
}

export function duplicateBlock(p: Project, pageId: string, blockId: string): { project: Project; blockId: string | null } {
  const src = p.pages.find((pg) => pg.id === pageId)?.blocks.find((b) => b.id === blockId);
  if (!src) return { project: p, blockId: null };
  const copy: Block = {
    ...structuredClone(src),
    id: newId('b'),
    x: src.x + DUPLICATE_SHIFT,
    y: src.y + DUPLICATE_SHIFT,
    locked: false,
  };
  return { project: addBlock(p, pageId, copy), blockId: copy.id };
}

export function reorderBlock(p: Project, pageId: string, blockId: string, order: ZOrder): Project {
  return produce(p, (d) => {
    const blocks = findPage(d, pageId).blocks;
    normalizeZ(blocks);
    const z = blocks.findIndex((b) => b.id === blockId);
    if (z < 0) return;
    const last = blocks.length - 1;
    const target =
      order === 'front' ? last : order === 'back' ? 0 : order === 'forward' ? Math.min(last, z + 1) : Math.max(0, z - 1);
    if (target === z) return;
    const [block] = blocks.splice(z, 1);
    blocks.splice(target, 0, block);
    blocks.forEach((b, i) => (b.z = i));
  });
}

export function setPageSize(p: Project, width: number, height: number): Project {
  return produce(p, (d) => {
    d.page = { width, height };
  });
}

export function addAsset(p: Project, meta: AssetMeta): Project {
  return produce(p, (d) => {
    d.assets[meta.id] = meta;
  });
}

/** id картинок, на которые ссылается хотя бы один блок. */
export function usedAssetIds(p: Project): Set<string> {
  const ids = new Set<string>();
  for (const page of p.pages) for (const b of page.blocks) if (b.type === 'image') ids.add(b.assetId);
  return ids;
}

export function setMargins(p: Project, patch: Partial<Project['margins']>): Project {
  return produce(p, (d) => {
    Object.assign(d.margins, patch);
  });
}

export type BindingPatch = Partial<Omit<Project['binding'], 'holes'>> & { holes?: Partial<Project['binding']['holes']> };

export function setBinding(p: Project, patch: BindingPatch): Project {
  return produce(p, (d) => {
    const { holes, ...rest } = patch;
    Object.assign(d.binding, rest);
    if (holes) Object.assign(d.binding.holes, holes);
  });
}

export function setPrint(p: Project, patch: Partial<Project['print']>): Project {
  return produce(p, (d) => {
    Object.assign(d.print, patch);
  });
}
