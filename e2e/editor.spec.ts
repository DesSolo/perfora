import { expect, test } from '@playwright/test';
import { makePng, project, selectedId } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('perfora.lang', 'ru'));
  await page.goto('/');
});

test('текст: добавить, отредактировать, отменить', async ({ page }) => {
  await page.getByRole('button', { name: 'Текст' }).click();
  await page.keyboard.type('Мука 200 г');
  await page.getByTestId('editor-page').click({ position: { x: 5, y: 5 } });
  const p = await project(page);
  const block = p.pages[0].blocks[0];
  expect(block.type).toBe('text');
  expect(block.type === 'text' && block.html).toBe('<p>Мука 200 г</p>');
  await expect(page.getByTestId('editor-page')).toContainText('Мука 200 г');

  await page.keyboard.press('Control+z');
  expect((await project(page)).pages[0].blocks[0]).toMatchObject({ html: '<p>Текст</p>' });
  await page.keyboard.press('Control+z');
  expect((await project(page)).pages[0].blocks).toHaveLength(0);
  await page.keyboard.press('Control+Shift+z');
  expect((await project(page)).pages[0].blocks).toHaveLength(1);
});

test('картинка: загрузка, перемещение, ресайз с пропорциями, поворот, undo', async ({ page }) => {
  await page.getByTestId('image-input').setInputFiles({ name: 'a.png', mimeType: 'image/png', buffer: await makePng(page) });
  await expect.poll(async () => (await project(page)).pages[0].blocks.length).toBe(1);
  const b0 = (await project(page)).pages[0].blocks[0];
  expect(b0.w / b0.h).toBeCloseTo(2, 3);
  await expect(page.getByTestId('editor-page').locator('.image-content')).toBeVisible();

  const shell = page.locator(`[data-block-id="${b0.id}"]`);
  const box = (await shell.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 30, { steps: 8 });
  await page.mouse.up();
  const b1 = (await project(page)).pages[0].blocks[0];
  expect(b1.x).toBeGreaterThan(b0.x + 5);
  expect(b1.y).toBeGreaterThan(b0.y + 2);

  // Правая нижняя ручка: картинка тянется с сохранением пропорций.
  const handle = page.locator('[data-handle="1,1"]');
  const hb = (await handle.boundingBox())!;
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + 80, hb.y + 10, { steps: 6 });
  await page.mouse.up();
  const b2 = (await project(page)).pages[0].blocks[0];
  expect(b2.w).toBeGreaterThan(b1.w);
  expect(b2.w / b2.h).toBeCloseTo(2, 3);
  expect(b2.x).toBeCloseTo(b1.x, 5);

  const rot = page.locator('[data-handle="rotate"]');
  const rb = (await rot.boundingBox())!;
  const sb = (await shell.boundingBox())!;
  await page.mouse.move(rb.x + rb.width / 2, rb.y + rb.height / 2);
  await page.mouse.down();
  await page.keyboard.down('Shift');
  await page.mouse.move(sb.x + sb.width + 200, sb.y + sb.height / 2, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  const b3 = (await project(page)).pages[0].blocks[0];
  expect(b3.rotation % 15).toBe(0);
  expect(b3.rotation).toBeGreaterThan(45);

  // Каждый жест — один шаг истории.
  await page.keyboard.press('Control+z');
  expect((await project(page)).pages[0].blocks[0].rotation).toBe(0);
  await page.keyboard.press('Control+z');
  expect((await project(page)).pages[0].blocks[0].w).toBeCloseTo(b1.w, 5);
  await page.keyboard.press('Control+z');
  expect((await project(page)).pages[0].blocks[0].x).toBeCloseTo(b0.x, 5);
});

test('клавиши: стрелки, дублирование, удаление, блокировка', async ({ page }) => {
  await page.getByRole('button', { name: 'Текст' }).click();
  await page.keyboard.press('Escape'); // выйти из редактирования, блок остаётся выделенным
  const id = (await selectedId(page))!;
  const x0 = (await project(page)).pages[0].blocks[0].x;
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Shift+ArrowRight');
  expect((await project(page)).pages[0].blocks[0].x).toBeCloseTo(x0 + 11, 5);

  await page.keyboard.press('Control+d');
  const p = await project(page);
  expect(p.pages[0].blocks).toHaveLength(2);
  expect(await selectedId(page)).not.toBe(id);

  await page.keyboard.press('Delete');
  expect((await project(page)).pages[0].blocks).toHaveLength(1);

  await page.locator(`[data-block-id="${id}"]`).click();
  await page.getByRole('button', { name: 'Заблокировать' }).click();
  await page.keyboard.press('ArrowRight');
  expect((await project(page)).pages[0].blocks[0].x).toBeCloseTo(x0 + 11, 5);
});

test('страницы: добавить, дублировать, переставить, удалить', async ({ page }) => {
  await page.getByRole('button', { name: 'Текст' }).click();
  await page.keyboard.press('Escape');
  await page.getByTitle('Добавить страницу').click();
  await page.getByTitle('Дублировать страницу').click();
  await expect(page.locator('.thumb')).toHaveCount(3);
  let p = await project(page);
  const ids = p.pages.map((x) => x.id);

  await page.getByRole('button', { name: 'Страница 1' }).dragTo(page.getByRole('button', { name: 'Страница 3' }));
  p = await project(page);
  expect(p.pages.map((x) => x.id)).toEqual([ids[1], ids[2], ids[0]]);

  await page.getByRole('button', { name: 'Страница 3' }).click();
  await expect(page.locator('.thumb.current .thumb-number')).toHaveText('3');
  await page.getByTitle('Удалить страницу').click();
  await expect(page.locator('.thumb')).toHaveCount(2);
});

test('переключение языка', async ({ page }) => {
  await page.getByRole('button', { name: 'EN' }).click();
  await expect(page.getByRole('button', { name: 'Text' })).toBeVisible();
});
