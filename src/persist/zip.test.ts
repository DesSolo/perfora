import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { createImageBlock, createProject } from '../core/defaults';
import { addAsset, addBlock } from '../core/ops';
import { exportZip, importZip, nameFromFile, pruneAssets, zipFileName } from './zip';

function sample() {
  let p = createProject('Рецепты');
  const pageId = p.pages[0].id;
  p = addAsset(p, { id: 'a1', name: 'cat.png', mime: 'image/png', width: 4, height: 2 });
  p = addAsset(p, { id: 'a2', name: 'dog.jpg', mime: 'image/jpeg', width: 4, height: 2 });
  p = addAsset(p, { id: 'unused', name: 'old.png', mime: 'image/png', width: 1, height: 1 });
  p = addBlock(p, pageId, createImageBlock('a1', { x: 10, y: 10, w: 40, h: 20 }));
  p = addBlock(p, pageId, createImageBlock('a2', { x: 10, y: 40, w: 40, h: 20 }));
  return p;
}

const blobs = new Map([
  ['a1', new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' })],
  ['a2', new Blob([new Uint8Array([4, 5])], { type: 'image/jpeg' })],
]);

describe('zip', () => {
  it('экспорт → импорт возвращает тот же проект и те же файлы', async () => {
    const p = sample();
    const { blob, missing } = await exportZip(p, (id) => blobs.get(id));
    expect(missing).toBe(0);
    const back = await importZip(blob);
    expect(back.project).toEqual(JSON.parse(JSON.stringify(pruneAssets(p))));
    expect(Object.keys(back.project.assets).sort()).toEqual(['a1', 'a2']);
    expect([...new Uint8Array(await back.blobs.get('a1')!.arrayBuffer())]).toEqual([1, 2, 3]);
    expect(back.blobs.get('a2')!.type).toBe('image/jpeg');
    expect(back.issues.missingAssets).toBe(0);
  });

  it('недостающий Blob при экспорте считается, импорт отмечает потерю', async () => {
    const { blob, missing } = await exportZip(sample(), (id) => (id === 'a1' ? blobs.get(id) : undefined));
    expect(missing).toBe(1);
    const back = await importZip(blob);
    expect(back.issues.missingAssets).toBe(1);
    expect(back.blobs.has('a2')).toBe(false);
  });

  it('проект внутри папки (архив пересобран вручную) тоже читается', async () => {
    const json = JSON.stringify(pruneAssets(sample()));
    const zip = zipSync({
      'Рецепты/project.json': strToU8(json),
      'Рецепты/assets/a1.png': new Uint8Array([9]),
      'Рецепты/assets/a2.jpeg': new Uint8Array([8]),
    });
    const back = await importZip(new Blob([zip]));
    expect(back.project.name).toBe('Рецепты');
    expect(back.blobs.size).toBe(2);
  });

  it('не zip — ошибка invalid', async () => {
    await expect(importZip(new Blob(['hello']))).rejects.toMatchObject({ code: 'invalid' });
  });

  it('zip без project.json — ошибка invalid', async () => {
    const zip = zipSync({ 'readme.txt': strToU8('hi') });
    await expect(importZip(new Blob([zip]))).rejects.toMatchObject({ code: 'invalid' });
  });

  it('битый JSON — ошибка invalid', async () => {
    const zip = zipSync({ 'project.json': strToU8('{oops') });
    await expect(importZip(new Blob([zip]))).rejects.toMatchObject({ code: 'invalid' });
  });

  it('проект из будущей версии — ошибка newer', async () => {
    const zip = zipSync({ 'project.json': strToU8(JSON.stringify({ schemaVersion: 999, pages: [] })) });
    await expect(importZip(new Blob([zip]))).rejects.toMatchObject({ code: 'newer' });
  });

  it('имя файла очищается от запрещённых символов', () => {
    expect(zipFileName('Рецепты: 2026/осень', 'project')).toBe('Рецепты 2026 осень.zip');
    expect(zipFileName('  ', 'project')).toBe('project.zip');
    expect(nameFromFile('Блокнот.ZIP')).toBe('Блокнот');
  });
});
