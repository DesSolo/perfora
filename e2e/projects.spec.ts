import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { makePng, project } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ris.lang', 'ru'));
  await page.goto('/');
});

async function waitSaved(page: Page) {
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved');
}

async function setName(page: Page, name: string) {
  await page.getByLabel('Название проекта').fill(name);
}

async function addTextAndImage(page: Page, text: string) {
  await page.getByRole('button', { name: 'Текст', exact: true }).click();
  await page.keyboard.type(text);
  await page.getByTestId('editor-page').click({ position: { x: 5, y: 5 } });
  await page.getByTestId('image-input').setInputFiles({ name: 'a.png', mimeType: 'image/png', buffer: await makePng(page) });
  await expect.poll(async () => (await project(page)).pages[0].blocks.length).toBe(2);
}

async function openProjects(page: Page) {
  await page.getByRole('button', { name: 'Проекты' }).click();
  return page.getByRole('dialog', { name: 'Проекты' });
}

test('автосохранение: после перезагрузки проект и картинка на месте', async ({ page }) => {
  await expect(page.getByTestId('save-status')).toHaveCount(0); // пустой новый проект не пишется
  await setName(page, 'Рецепты');
  await addTextAndImage(page, 'Мука 200 г');
  await waitSaved(page);
  const before = await project(page);

  await page.reload();
  // Поле названия появляется только после восстановления проекта.
  await expect(page.getByLabel('Название проекта')).toHaveValue('Рецепты');
  expect(await project(page)).toEqual(before);
  await expect(page.getByTestId('editor-page')).toContainText('Мука 200 г');
  const img = page.getByTestId('editor-page').locator('.image-content');
  await expect(img).toBeVisible();
  expect(await img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
});

test('экспорт и импорт .zip', async ({ page }) => {
  await setName(page, 'Блокнот: осень');
  await addTextAndImage(page, 'Импорт');
  const original = await project(page);

  const dialog = await openProjects(page);
  const downloading = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Экспорт .zip' }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe('Блокнот осень.zip');
  const zip = await readFile((await download.path())!);

  await dialog.getByRole('button', { name: 'Новый проект' }).click();
  await expect(dialog).toBeHidden();
  expect((await project(page)).pages[0].blocks).toHaveLength(0);

  await openProjects(page);
  await page.getByTestId('project-input').setInputFiles({ name: 'x.zip', mimeType: 'application/zip', buffer: zip });
  await expect(page.getByRole('dialog')).toBeHidden();
  const imported = await project(page);
  expect(imported).toEqual(original);
  await expect(page.getByTestId('editor-page').locator('.image-content')).toBeVisible();
  await waitSaved(page);
});

test('недавние проекты: переключение и удаление', async ({ page }) => {
  await setName(page, 'Первый');
  await waitSaved(page);

  let dialog = await openProjects(page);
  await dialog.getByRole('button', { name: 'Новый проект' }).click();
  await setName(page, 'Второй');
  await waitSaved(page);

  dialog = await openProjects(page);
  const items = dialog.getByTestId('project-item');
  await expect(items).toHaveCount(2);
  await expect(items.nth(0)).toContainText('Второй');
  await expect(items.nth(0)).toContainText('открыт');
  await items.filter({ hasText: 'Первый' }).locator('.project-open').click();
  await expect(dialog).toBeHidden();
  await expect(page.getByLabel('Название проекта')).toHaveValue('Первый');

  // После перезагрузки открывается последний открытый, а не последний изменённый.
  await page.reload();
  await expect(page.getByLabel('Название проекта')).toHaveValue('Первый');

  dialog = await openProjects(page);
  page.once('dialog', (d) => void d.accept());
  await items.filter({ hasText: 'Второй' }).getByRole('button', { name: 'Удалить из браузера' }).click();
  await expect(items).toHaveCount(1);
  await expect(items.first().getByRole('button', { name: 'Удалить из браузера' })).toHaveCount(0);
});

test('не проект — понятная ошибка, текущий проект не тронут', async ({ page }) => {
  await setName(page, 'Целый');
  await openProjects(page);
  await page.getByTestId('project-input').setInputFiles({ name: 'bad.zip', mimeType: 'application/zip', buffer: Buffer.from('nope') });
  await expect(page.getByRole('status').filter({ hasText: 'не похож на проект' })).toBeVisible();
  expect((await project(page)).name).toBe('Целый');
});
