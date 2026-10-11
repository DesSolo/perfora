import { expect, test, type Page } from '@playwright/test';
import type { Project } from '../src/core/model';
import { project } from './helpers';

type Win = {
  editor: {
    getState(): {
      apply(fn: (p: Project) => Project): void;
      setView(v: Record<string, boolean>): void;
      addPage(): void;
      addText(): void;
      setEditing(id: string | null): void;
    };
  };
  preparePrint(): Promise<void>;
};

/** Проект A5 с 6 отверстиями, зеркалированием и n страницами с текстом. */
async function setup(page: Page, pages = 3) {
  await page.addInitScript(() => {
    localStorage.setItem('perfora.lang', 'ru');
    localStorage.removeItem('perfora.view');
  });
  await page.goto('/');
  await page.evaluate((n) => {
    const s = (window as unknown as Win).editor.getState();
    for (let i = 1; i < n; i++) s.addPage();
    s.apply((p) => ({
      ...p,
      page: { width: 148, height: 210 },
      margins: { inner: 15, outer: 8, top: 8, bottom: 8 },
      binding: {
        enabled: true,
        side: 'left',
        mirror: 'duplex',
        holes: { count: 6, diameter: 5, pitch: 19, offsetFromEdge: 7, centered: true },
        keepOutPadding: 2,
      },
    }));
  }, pages);
}

test('отверстия на чётной странице зеркальны нечётной', async ({ page }) => {
  await setup(page);
  await page.getByRole('button', { name: 'Разворот' }).click();
  await page.getByRole('button', { name: 'Страница 2' }).click();
  const cx = (i: number) =>
    page.locator(`[data-page-index="${i}"] .editor-overlay circle.hole`).evaluateAll((els) => els.map((e) => Number(e.getAttribute('cx'))));
  const cy = (i: number) =>
    page.locator(`[data-page-index="${i}"] .editor-overlay circle.hole`).evaluateAll((els) => els.map((e) => Number(e.getAttribute('cy'))));
  expect(await cx(1)).toEqual(Array(6).fill(141));
  expect(await cx(2)).toEqual(Array(6).fill(7));
  expect(await cy(1)).toEqual(await cy(2));
  // В развороте чётная слева, нечётная справа.
  const left = (await page.locator('[data-page-index="1"]').boundingBox())!;
  const right = (await page.locator('[data-page-index="2"]').boundingBox())!;
  expect(left.x).toBeLessThan(right.x);
});

test('блок в зоне отверстий помечается предупреждением', async ({ page }) => {
  await setup(page, 1);
  await page.getByRole('button', { name: 'Текст' }).click();
  await page.keyboard.press('Escape');
  const shell = page.locator('.block-shell');
  await expect(shell).not.toHaveClass(/keepout-warn/);
  await page.getByLabel('X', { exact: true }).fill('3');
  await page.getByLabel('Y', { exact: true }).fill('50');
  await expect(shell).toHaveClass(/keepout-warn/);
  await expect(page.getByText('Блок заходит в зону отверстий')).toBeVisible();
  await expect(page.locator('.thumb-warn')).toHaveText('!');
});

test('привязка к полю при перетаскивании, Alt отключает', async ({ page }) => {
  await setup(page, 1);
  await page.getByRole('button', { name: 'Текст' }).click();
  await page.keyboard.press('Escape');
  await page.evaluate(() =>
    (window as unknown as Win).editor.getState().apply((p) => {
      const b = p.pages[0].blocks[0];
      return { ...p, pages: [{ ...p.pages[0], blocks: [{ ...b, x: 30, y: 60, w: 40, h: 20 }] }] };
    }),
  );
  const box = (await page.locator('.block-shell').boundingBox())!;
  const pxPerMm = box.width / 40;
  // Сдвигаем на 14 мм влево: край блока окажется у 16 мм, привязка дотянет до поля 15 мм.
  const drag = async (dxMm: number, alt: boolean) => {
    const b = (await page.locator('.block-shell').boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    if (alt) await page.keyboard.down('Alt');
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2 + dxMm * pxPerMm, b.y + b.height / 2, { steps: 5 });
    await expect(page.locator('.snap-guide')).toHaveCount(alt ? 0 : 1);
    await page.mouse.up();
    if (alt) await page.keyboard.up('Alt');
  };
  await drag(-14, false);
  expect((await project(page)).pages[0].blocks[0].x).toBe(15);
  await expect(page.locator('.snap-guide')).toHaveCount(0);
  await drag(1.2, true);
  expect((await project(page)).pages[0].blocks[0].x).toBeCloseTo(16.2, 1);
});

test('печать: страница 1:1 в мм, PDF нужного размера, метки отверстий', async ({ page }) => {
  await setup(page, 3);
  await page.evaluate(() =>
    (window as unknown as Win).editor.getState().apply((p) => ({ ...p, print: { ...p.print, holeMarks: 'print' } })),
  );
  await page.evaluate(() => (window as unknown as Win).preparePrint());
  await page.emulateMedia({ media: 'print' });
  const pages = page.getByTestId('print-root').locator('.print-page');
  await expect(pages).toHaveCount(3);
  const bb = (await pages.first().boundingBox())!;
  const MM = 96 / 25.4;
  expect(bb.width).toBeCloseTo(148 * MM, 1);
  expect(bb.height).toBeCloseTo(210 * MM, 1);
  await expect(pages.nth(0).locator('circle')).toHaveCount(6);
  await expect(page.locator('#root')).toBeHidden();

  const pdf = (await page.pdf({ preferCSSPageSize: true, printBackground: true })).toString('latin1');
  const boxes = [...pdf.matchAll(/\/MediaBox\s*\[\s*0 0 ([\d.]+) ([\d.]+)\s*\]/g)].map((m) => [Number(m[1]), Number(m[2])]);
  expect(boxes).toHaveLength(3);
  for (const [w, h] of boxes) {
    // 148×210 мм в pt; допуск 0,3 мм ≈ 0,85 pt.
    expect(Math.abs(w - (148 * 72) / 25.4)).toBeLessThan(0.85);
    expect(Math.abs(h - (210 * 72) / 25.4)).toBeLessThan(0.85);
  }
});

test('оборот поворачивается на 180°, если принтер переворачивает по другой кромке', async ({ page }) => {
  await setup(page, 2);
  const rotations = async () => {
    await page.evaluate(() => (window as unknown as Win).preparePrint());
    return page
      .getByTestId('print-root')
      .locator('.print-slot')
      .evaluateAll((els) => els.map((e) => (e as HTMLElement).style.transform));
  };
  expect(await rotations()).toEqual(['', '']);
  await page.evaluate(() =>
    (window as unknown as Win).editor.getState().apply((p) => ({ ...p, print: { ...p.print, duplexFlip: 'short-edge' } })),
  );
  expect(await rotations()).toEqual(['', 'rotate(180deg)']);
});

test('пресет с неравными промежутками и правка промежутков', async ({ page }) => {
  await setup(page, 1);
  const cy = () =>
    page.locator('[data-page-index="0"] .editor-overlay circle.hole').evaluateAll((els) => els.map((e) => Number(e.getAttribute('cy'))));
  await page.getByLabel('Пресет').selectOption('a5-4-45-65');
  await expect(page.getByText('Размеры из справочника')).toBeVisible();
  await expect(page.getByLabel('Неравные промежутки')).toBeChecked();
  const gaps = page.getByLabel('Промежутки между центрами, мм');
  await expect(gaps).toHaveValue('45-65-45');
  // Размах 155 мм по центру высоты 210.
  expect(await cy()).toEqual([27.5, 72.5, 137.5, 182.5]);

  await gaps.fill('19-19-70-19-19');
  await gaps.press('Enter');
  expect((await project(page)).binding.holes).toMatchObject({ count: 6, gaps: [19, 19, 70, 19, 19] });
  // Те же диаметр и отступ — это пресет Filofax A5.
  await expect(page.getByLabel('Пресет')).toHaveValue('a5-6-70');

  await page.getByLabel('Неравные промежутки').uncheck();
  expect((await project(page)).binding.holes).not.toHaveProperty('gaps');
  await expect(page.getByLabel('Шаг, мм')).toBeVisible();
});
