import { expect, test, type Page } from '@playwright/test';
import type { Project } from '../src/core/model';
import { project } from './helpers';

type Win = {
  editor: {
    getState(): {
      apply(fn: (p: Project) => Project): void;
      addPage(): void;
      setPrintJob(patch: { sides?: 'all' | 'front' | 'back'; reverse?: boolean }): void;
    };
  };
  preparePrint(target?: 'project' | 'calibration'): Promise<void>;
};

const MM = 96 / 25.4;

/** Проект A5 с зеркалированием и n страницами. */
async function setup(page: Page, pages: number) {
  await page.addInitScript(() => {
    localStorage.setItem('ris.lang', 'ru');
    localStorage.removeItem('ris.view');
  });
  await page.goto('/');
  await page.evaluate((n) => {
    const s = (window as unknown as Win).editor.getState();
    for (let i = 1; i < n; i++) s.addPage();
    s.apply((p) => ({ ...p, page: { width: 148, height: 210 }, binding: { ...p.binding, side: 'left', mirror: 'duplex' } }));
  }, pages);
}

function mediaBoxes(pdf: Buffer): number[][] {
  return [...pdf.toString('latin1').matchAll(/\/MediaBox\s*\[\s*0 0 ([\d.]+) ([\d.]+)\s*\]/g)].map((m) => [Number(m[1]), Number(m[2])]);
}

const PT = 72 / 25.4;

test('раскладка A5 2×1 на A4: альбомный лист, обороты в зеркальных ячейках', async ({ page }) => {
  await setup(page, 4);
  await page.getByLabel('Несколько страниц на лист').check();
  await expect(page.getByTestId('imposition-status')).toHaveText('Лист 297×210 мм, альбомная, страниц на сторону: 2');
  // Альбомный лист по длинной кромке переворачивается не как листок: нужен короткий край.
  await page.getByLabel('Принтер переворачивает лист').selectOption('short-edge');

  await page.evaluate(() => (window as unknown as Win).preparePrint());
  await page.emulateMedia({ media: 'print' });
  const sheets = page.getByTestId('print-root').locator('.print-page');
  await expect(sheets).toHaveCount(2);
  const bb = (await sheets.first().boundingBox())!;
  expect(bb.width).toBeCloseTo(297 * MM, 1);
  expect(bb.height).toBeCloseTo(210 * MM, 1);

  const order = (i: number) =>
    sheets
      .nth(i)
      .locator('.print-slot')
      .evaluateAll((els) =>
        els
          .map((e) => ({ x: e.getBoundingClientRect().x, n: Number((e as HTMLElement).dataset.pageIndex) + 1 }))
          .sort((a, b) => a.x - b.x)
          .map((e) => e.n),
      );
  expect(await order(0)).toEqual([1, 3]);
  expect(await order(1)).toEqual([4, 2]);

  const boxes = mediaBoxes(await page.pdf({ preferCSSPageSize: true, printBackground: true }));
  expect(boxes).toHaveLength(2);
  for (const [w, h] of boxes) {
    expect(Math.abs(w - 297 * PT)).toBeLessThan(0.85);
    expect(Math.abs(h - 210 * PT)).toBeLessThan(0.85);
  }
});

test('метки реза вокруг сетки и только на лицевой стороне', async ({ page }) => {
  await setup(page, 2);
  await expect(page.getByLabel('Метки реза')).toBeDisabled();
  await page.evaluate(() =>
    (window as unknown as Win).editor
      .getState()
      .apply((p) => ({ ...p, print: { ...p.print, cropMarks: true, imposition: { sheet: 'A4', cols: 1, rows: 1, gap: 0 } } })),
  );
  await page.evaluate(() => (window as unknown as Win).preparePrint());
  const sheets = page.getByTestId('print-root').locator('.print-page');
  await expect(sheets).toHaveCount(2);
  await expect(sheets.nth(0).locator('.crop-marks line')).toHaveCount(8);
  await expect(sheets.nth(1).locator('.crop-marks line')).toHaveCount(0);
});

test('ручной дуплекс: только оборотные в обратном порядке, с пустым оборотом', async ({ page }) => {
  await setup(page, 3);
  await page.getByLabel('Стороны').selectOption('back');
  await page.getByLabel('Обратный порядок').check();
  await page.evaluate(() => (window as unknown as Win).preparePrint());
  const sheets = page.getByTestId('print-root').locator('.print-page');
  await expect(sheets).toHaveCount(2);
  await expect(sheets.nth(0).locator('.print-slot')).toHaveCount(0);
  await expect(sheets.nth(1).locator('.print-slot')).toHaveAttribute('data-page-index', '1');
});

test('калибровка: тестовый лист, расчёт и применение сдвигов', async ({ page }) => {
  await setup(page, 2);
  await page.getByRole('button', { name: 'Калибровка…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Калибровка принтера' });
  await expect(dialog).toBeVisible();

  await page.evaluate(() => (window as unknown as Win).preparePrint('calibration'));
  const sheets = page.getByTestId('print-root').locator('.print-page');
  await expect(sheets).toHaveCount(2);
  await expect(sheets.nth(1)).toContainText('Оборотная сторона');

  const front = dialog.locator('fieldset', { hasText: 'Лицевая сторона' });
  await front.getByLabel('До линии слева, мм').fill('11.5');
  await front.getByLabel('До линии сверху, мм').fill('9');
  await expect(front.getByTestId('calib-offset')).toHaveText('Сдвиг: X -1.5, Y +1 мм');
  await dialog.getByRole('button', { name: 'Применить сдвиги' }).click();
  await expect(dialog).toBeHidden();

  const p = await project(page);
  expect(p.print.offsetFront).toEqual({ x: -1.5, y: 1 });
  expect(p.print.offsetBack).toEqual({ x: 0, y: 0 });

  await page.evaluate(() => (window as unknown as Win).preparePrint());
  const inner = page.getByTestId('print-root').locator('.print-page-inner');
  await expect(inner.nth(0)).toHaveAttribute('style', /translate\(-1\.5mm, 1mm\)/);
  expect(await inner.nth(1).getAttribute('style')).toBeFalsy();
});
