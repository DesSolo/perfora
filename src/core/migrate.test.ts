import { describe, expect, it } from 'vitest';
import { createImageBlock, createProject, createTextBlock } from './defaults';
import { hasIssues, migrate, parseProject, ProjectFormatError, type Migration } from './migrate';
import { addAsset, addBlock } from './ops';
import { SCHEMA_VERSION } from './model';

function sample() {
  let p = createProject('Рецепты');
  const pageId = p.pages[0].id;
  p = addAsset(p, { id: 'a1', name: 'cat.png', mime: 'image/png', width: 400, height: 200 });
  p = addBlock(p, pageId, createImageBlock('a1', { x: 10, y: 10, w: 40, h: 20 }));
  p = addBlock(p, pageId, createTextBlock({ html: '<p>Мука</p>' }));
  return p;
}

const roundTrip = <T>(v: T): T => JSON.parse(JSON.stringify(v));

describe('миграции', () => {
  it('текущая схема проходит без изменений', () => {
    const p = sample();
    expect(migrate(roundTrip(p))).toEqual(roundTrip(p));
  });

  it('цепочка шагов применяется по порядку и ставит версию', () => {
    const steps: Record<number, Migration> = {
      1: (r) => ({ ...r, title: r.name }),
      2: (r) => ({ ...r, title: `${String(r.title)}!` }),
    };
    const out = migrate({ schemaVersion: 1, name: 'x' }, steps, 3);
    expect(out).toEqual({ schemaVersion: 3, name: 'x', title: 'x!' });
  });

  it('схема новее приложения — ошибка newer', () => {
    expect(() => migrate({ schemaVersion: SCHEMA_VERSION + 1 })).toThrow(
      expect.objectContaining({ code: 'newer' }) as ProjectFormatError,
    );
  });

  it('нет шага миграции — ошибка noMigration', () => {
    expect(() => migrate({ schemaVersion: 1 }, {}, 2)).toThrow(expect.objectContaining({ code: 'noMigration' }) as Error);
  });

  it.each([null, 42, [], {}, { schemaVersion: '1' }, { schemaVersion: 0 }, { schemaVersion: 1.5 }])(
    'мусор вместо проекта — ошибка invalid: %j',
    (raw) => {
      expect(() => migrate(raw)).toThrow(expect.objectContaining({ code: 'invalid' }) as Error);
    },
  );
});

describe('parseProject', () => {
  it('корректный проект восстанавливается без потерь и замечаний', () => {
    const p = sample();
    const { project, issues } = parseProject(roundTrip(p));
    expect(project).toEqual(roundTrip(p));
    expect(hasIssues(issues)).toBe(false);
  });

  it('без pages — invalid', () => {
    expect(() => parseProject({ schemaVersion: 1 })).toThrow(expect.objectContaining({ code: 'invalid' }) as Error);
  });

  it('недостающие разделы заполняются значениями по умолчанию', () => {
    const { project } = parseProject({ schemaVersion: 1, pages: [] });
    const def = createProject();
    expect(project.margins).toEqual(def.margins);
    expect(project.binding).toEqual(def.binding);
    expect(project.print).toEqual(def.print);
    expect(project.pages).toHaveLength(1);
    expect(project.assets).toEqual({});
  });

  it('битые значения заменяются, лишние поля отбрасываются', () => {
    const { project } = parseProject({
      schemaVersion: 1,
      extra: 1,
      page: { width: -5, height: 'x' },
      binding: { side: 'diagonal', holes: { count: 4.6, pitch: 0 } },
      print: { holeMarks: 'print', imposition: { sheet: { w: 210, h: -1 } } },
      pages: [{ id: 'p1', blocks: [] }],
    });
    expect(project).not.toHaveProperty('extra');
    expect(project.page).toEqual({ width: 148, height: 210 });
    expect(project.binding.side).toBe('left');
    expect(project.binding.holes.count).toBe(5);
    expect(project.binding.holes.pitch).toBe(19);
    expect(project.print.holeMarks).toBe('print');
    expect(project.print.imposition).toBeNull();
  });

  it('битые блоки выбрасываются и считаются', () => {
    const { project, issues } = parseProject({
      schemaVersion: 1,
      pages: [
        {
          id: 'p1',
          blocks: [
            { id: 'b1', type: 'text', x: 0, y: 0, w: 10, h: 10, html: '<p>ok</p>' },
            { id: 'b2', type: 'video', x: 0, y: 0, w: 10, h: 10 },
            { id: 'b3', type: 'text', x: 0, y: 0, w: 0, h: 10 },
            { id: 'b4', type: 'image', x: 0, y: 0, w: 10, h: 10 },
            'мусор',
          ],
        },
      ],
    });
    expect(project.pages[0].blocks.map((b) => b.id)).toEqual(['b1']);
    expect(issues.droppedBlocks).toBe(4);
    const b = project.pages[0].blocks[0];
    expect(b.type === 'text' && b.style.font).toBe('PT Sans');
  });

  it('картинка без метаданных или без файла считается потерянной, блок остаётся', () => {
    const p = roundTrip(sample());
    const pageId = p.pages[0].id;
    const extra = createImageBlock('ghost', { x: 0, y: 0, w: 10, h: 10 });
    const raw = { ...p, pages: [{ id: pageId, blocks: [...p.pages[0].blocks, extra] }] };

    const meta = parseProject(raw);
    expect(meta.issues.missingAssets).toBe(1);
    expect(meta.project.pages[0].blocks).toHaveLength(3);

    const files = parseProject(raw, { hasBlob: () => false });
    expect(files.issues.missingAssets).toBe(2);
  });

  it('повторяющиеся id заменяются новыми', () => {
    const block = { id: 'b1', type: 'text', x: 0, y: 0, w: 10, h: 10, html: '' };
    const { project, issues } = parseProject({
      schemaVersion: 1,
      pages: [
        { id: 'p1', blocks: [block, block] },
        { id: 'p1', blocks: [] },
      ],
    });
    const ids = [...project.pages.map((p) => p.id), ...project.pages[0].blocks.map((b) => b.id)];
    expect(new Set(ids).size).toBe(4);
    expect(issues.duplicateIds).toBe(2);
  });

  it('z перенумеровывается по порядку слоёв', () => {
    const t = (id: string, z: number) => ({ id, type: 'text', x: 0, y: 0, w: 1, h: 1, z, html: '' });
    const { project } = parseProject({ schemaVersion: 1, pages: [{ id: 'p', blocks: [t('a', 7), t('b', -2)] }] });
    expect(project.pages[0].blocks.map((b) => [b.id, b.z])).toEqual([
      ['b', 0],
      ['a', 1],
    ]);
  });
});
