import { describe, expect, it } from 'vitest';
import { createImageBlock, createProject, createTextBlock } from './defaults';
import {
  addBlock,
  addPage,
  deletePage,
  duplicateBlock,
  duplicatePage,
  movePage,
  removeBlock,
  reorderBlock,
  setBinding,
  updateBlock,
  usedAssetIds,
} from './ops';

function withBlocks(n: number) {
  let p = createProject();
  const pageId = p.pages[0].id;
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const b = createTextBlock({ html: `#${i}` });
    ids.push(b.id);
    p = addBlock(p, pageId, b);
  }
  return { p, pageId, ids };
}

const order = (p: ReturnType<typeof createProject>) => p.pages[0].blocks.map((b) => (b.type === 'text' ? b.html : ''));

describe('страницы', () => {
  it('добавление вставляет после указанной', () => {
    const p0 = createProject();
    const { project: p1 } = addPage(p0);
    const { project: p2, pageId } = addPage(p1, 0);
    expect(p2.pages.map((p) => p.id)).toEqual([p0.pages[0].id, pageId, p1.pages[1].id]);
    expect(p0.pages.length).toBe(1);
  });

  it('дублирование копирует блоки с новыми id', () => {
    const { p, pageId } = withBlocks(2);
    const { project, pageId: copyId } = duplicatePage(p, pageId);
    expect(project.pages[1].id).toBe(copyId);
    const [a, b] = [project.pages[0].blocks, project.pages[1].blocks];
    expect(b.map((x) => x.id)).not.toEqual(a.map((x) => x.id));
    expect(b.map((x) => (x.type === 'text' ? x.html : ''))).toEqual(['#0', '#1']);
  });

  it('не удаляет последнюю страницу', () => {
    const p = createProject();
    expect(deletePage(p, p.pages[0].id)).toBe(p);
  });

  it('перемещение страниц', () => {
    let p = createProject();
    p = addPage(p).project;
    p = addPage(p).project;
    const ids = p.pages.map((x) => x.id);
    expect(movePage(p, 0, 2).pages.map((x) => x.id)).toEqual([ids[1], ids[2], ids[0]]);
    expect(movePage(p, 2, 0).pages.map((x) => x.id)).toEqual([ids[2], ids[0], ids[1]]);
    expect(movePage(p, 1, 1)).toBe(p);
  });
});

describe('блоки', () => {
  it('новые блоки ложатся сверху', () => {
    const { p } = withBlocks(3);
    expect(p.pages[0].blocks.map((b) => b.z)).toEqual([0, 1, 2]);
  });

  it('обновление и удаление с перенумерацией z', () => {
    const { p, pageId, ids } = withBlocks(3);
    const p2 = updateBlock(p, pageId, ids[1], { x: 99 });
    expect(p2.pages[0].blocks[1].x).toBe(99);
    expect(p.pages[0].blocks[1].x).toBe(20);
    const p3 = removeBlock(p2, pageId, ids[0]);
    expect(p3.pages[0].blocks.map((b) => b.z)).toEqual([0, 1]);
  });

  it('дублирование сдвигает копию и снимает блокировку', () => {
    const { p, pageId, ids } = withBlocks(1);
    const locked = updateBlock(p, pageId, ids[0], { locked: true });
    const { project, blockId } = duplicateBlock(locked, pageId, ids[0]);
    const copy = project.pages[0].blocks.find((b) => b.id === blockId)!;
    expect(copy.x).toBe(25);
    expect(copy.locked).toBe(false);
    expect(copy.z).toBe(1);
  });

  it.each([
    ['front', 0, ['#1', '#2', '#3', '#0']],
    ['back', 3, ['#3', '#0', '#1', '#2']],
    ['forward', 1, ['#0', '#2', '#1', '#3']],
    ['backward', 2, ['#0', '#2', '#1', '#3']],
    ['forward', 3, ['#0', '#1', '#2', '#3']],
    ['backward', 0, ['#0', '#1', '#2', '#3']],
  ] as const)('порядок слоёв: %s для #%i', (op, idx, expected) => {
    const { p, pageId, ids } = withBlocks(4);
    const r = reorderBlock(p, pageId, ids[idx], op);
    expect(order(r)).toEqual(expected);
    expect(r.pages[0].blocks.map((b) => b.z)).toEqual([0, 1, 2, 3]);
  });

  it('собирает используемые картинки', () => {
    let p = createProject();
    p = addBlock(p, p.pages[0].id, createImageBlock('a1'));
    p = addBlock(p, p.pages[0].id, createTextBlock());
    expect([...usedAssetIds(p)]).toEqual(['a1']);
  });
});

describe('промежутки отверстий', () => {
  const uniform = () => setBinding(createProject(), { holes: { count: 4, pitch: 45, gaps: undefined } });

  it('без промежутков поле gaps отсутствует', () => {
    expect(uniform().binding.holes).not.toHaveProperty('gaps');
  });

  it('промежутки задают число отверстий', () => {
    const p = setBinding(uniform(), { holes: { gaps: [19, 19, 70, 19, 19] } });
    expect(p.binding.holes.count).toBe(6);
  });

  it('смена числа отверстий дополняет последним промежутком или обрезает', () => {
    const p = setBinding(uniform(), { holes: { gaps: [45, 65, 45] } });
    expect(setBinding(p, { holes: { count: 6 } }).binding.holes.gaps).toEqual([45, 65, 45, 45, 45]);
    expect(setBinding(p, { holes: { count: 2 } }).binding.holes.gaps).toEqual([45]);
    expect(setBinding(p, { holes: { count: 1 } }).binding.holes).not.toHaveProperty('gaps');
  });
});
